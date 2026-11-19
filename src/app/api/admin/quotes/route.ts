import {authorizePermission,database,jsonError,sameOrigin} from "@/lib/auth";
import {prepareQuoteLines,validateQuoteTaxPolicy,nextQuoteRevision,defaultQuoteExpiryDate} from "@/lib/quote-engine.mjs";
import {isServiceAvailableForQuoting} from "@/lib/service-availability.mjs";
export const runtime="nodejs";
export async function GET(){
 const access=await authorizePermission("quotes.manage");if(access.response)return access.response;
 const db=database(),businessId=access.membership!.business_id;
 const [{data:enquiries,error:enquiryError},{data:quotes,error:quoteError},{data:businessSettings},{data:services,error:serviceError}]=await Promise.all([
  db.from("enquiries").select("id,request_number,request_type,contact_name,email,requested_service,user_id,customer_id").eq("business_id",businessId).eq("request_type","quote_request").is("archived_at",null).in("status",["new","reviewing","quoted"]) .order("created_at",{ascending:false}).limit(200),
  db.from("quotes").select("id,quote_number,enquiry_id,customer_id,revision_number,status,senior_approval_status,quote_kind,job_id,total,created_at") .eq("business_id",businessId).order("created_at",{ascending:false}).limit(200),
  db.from("business_settings").select("settings").eq("business_id",businessId).maybeSingle(),
  db.from("services").select("id,name,category,description,price_from,approval_status").eq("business_id",businessId).eq("is_active",true).eq("approval_status","approved_for_launch").order("sort_order").order("name"),
 ]);
 if(enquiryError||quoteError||serviceError)return jsonError("Could not load quote records or service presets.",500);
 const settings=businessSettings?.settings&&typeof businessSettings.settings==="object"?businessSettings.settings as Record<string,any>:{};
 const pricing=settings.pricing&&typeof settings.pricing==="object"?settings.pricing:{};
 const payment=settings.payment&&typeof settings.payment==="object"?settings.payment:{};
 return Response.json({enquiries:enquiries??[],quotes:quotes??[],pricing:{gst_status:pricing.gst_status??"not_configured",gst_rate:Number(pricing.gst_rate??10),labour_rate:pricing.labour_rate??null,parts_markup_percent:pricing.parts_markup_percent??null},payment:{quote_validity_days:payment.quote_validity_days??null},services:services??[]});
}
export async function POST(request:Request){
 if(!sameOrigin(request))return jsonError("Invalid request origin.",403);
 const access=await authorizePermission("quotes.manage");if(access.response)return access.response;
 try{
  const body=await request.json();
  const enquiryId=String(body.enquiryId??"").trim();
  const rawItems=Array.isArray(body.items)?body.items:[];
  const items:{description:string;quantity:number;unitPrice:number;serviceId:string|null;itemType:string}[]=rawItems.map((item:any)=>({description:String(item.description??"").trim(),quantity:Number(item.quantity??1),unitPrice:Number(item.unitPrice??0),serviceId:item.serviceId?String(item.serviceId):null,itemType:String(item.itemType??"labour")}));
  const taxRate=Number(body.taxRate??0);
  const notes=String(body.notes??"").trim().slice(0,3000);
  const terms=String(body.terms??"").trim().slice(0,3000);
  const expiryDate=body.expiryDate?String(body.expiryDate):null;
  const supersedesQuoteId=body.supersedesQuoteId?String(body.supersedesQuoteId):null;
  if(!/^[0-9a-f-]{36}$/i.test(enquiryId)||items.length<1||items.length>30)return jsonError("Select an active Quote Request Jobcard and add between 1 and 30 quote lines.");

  if(!Number.isFinite(taxRate)||taxRate<0||taxRate>100)return jsonError("Enter a valid tax rate.");
  if(expiryDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)||expiryDate<=new Date().toISOString().slice(0,10)))return jsonError("Quote expiry must be a valid future date.");
  let quotePricing;
  try{quotePricing=prepareQuoteLines(items,taxRate);}catch(error){return jsonError(error instanceof Error?error.message:"Check the quote line items.");}
  const db=database(),businessId=access.membership!.business_id;
  const {data:businessSettings}=await db.from("business_settings").select("settings").eq("business_id",businessId).maybeSingle();
  const configured=businessSettings?.settings&&typeof businessSettings.settings==="object"?businessSettings.settings as Record<string,any>:{};
  const pricing=configured.pricing&&typeof configured.pricing==="object"?configured.pricing:{};
  try{validateQuoteTaxPolicy([taxRate],pricing);}catch(error){return jsonError(error instanceof Error?error.message:"Invalid GST configuration.");}
  const {data:enquiry,error:enquiryLookupError}=await db.from("enquiries").select("id,request_number,request_type,user_id,customer_id,contact_name,email,phone,status,stage,archived_at").eq("id",enquiryId).eq("business_id",businessId).eq("request_type","quote_request").is("archived_at",null).maybeSingle();
  if(enquiryLookupError)return jsonError("Could not load the linked Quote Request.",500);
  if(!enquiry)return jsonError("Quote Request Jobcard not found.",404);
  if(enquiry&&!["new","reviewing","quoted"].includes(String(enquiry.status)))return jsonError("This Jobcard is no longer open for quoting.",409);
  let customerId:string|null=enquiry?.customer_id??null;
  let quoteUserId:string|null=enquiry?.user_id??null;
  if(enquiry){
   // Resolve a guest Quote Request to an existing customer or create its customer record.
   if(!customerId&&enquiry.user_id){
    const {data:linkedCustomer,error:linkedCustomerError}=await db.from("customers").select("id,user_id").eq("business_id",businessId).eq("user_id",enquiry.user_id).maybeSingle();
    if(linkedCustomerError){console.error("Quote customer lookup by user failed",linkedCustomerError);return jsonError("Could not prepare the customer record for this quote.",500);}
    customerId=linkedCustomer?.id??null;
   }
   if(!customerId&&enquiry.email){
    const {data:emailCustomer,error:emailCustomerError}=await db.from("customers").select("id,user_id").eq("business_id",businessId).ilike("email",enquiry.email).limit(1).maybeSingle();
    if(emailCustomerError){console.error("Quote customer lookup by email failed",emailCustomerError);return jsonError("Could not prepare the customer record for this quote.",500);}
    customerId=emailCustomer?.id??null;
    quoteUserId=emailCustomer?.user_id??quoteUserId;
   }
   if(!customerId){
    const fullName=String(enquiry.contact_name??"").trim();
    if(fullName.length<2)return jsonError("Add the customer's name to the Quote Request before creating a quote.",409);
    const {data:newCustomer,error:newCustomerError}=await db.from("customers").insert({business_id:businessId,user_id:enquiry.user_id??null,full_name:fullName,email:enquiry.email??null,phone:enquiry.phone??null,status:"active"}).select("id").single();
    if(newCustomerError||!newCustomer){console.error("Quote customer creation failed",newCustomerError);return jsonError("Could not create the customer record required for this quote.",500);}
    customerId=newCustomer.id;
   }
   if(!enquiry.customer_id){
    const {error:linkCustomerError}=await db.from("enquiries").update({customer_id:customerId,updated_at:new Date().toISOString()}).eq("id",enquiry.id).eq("business_id",businessId);
    if(linkCustomerError){console.error("Quote customer link failed",linkCustomerError);return jsonError("Could not link the customer record to this Quote Request.",500);}
   }
  }
  const {data:latestQuote,error:latestQuoteError}=await db.from("quotes").select("id,revision_number,status,senior_approval_status").eq("business_id",businessId).eq("enquiry_id",enquiry.id).eq("quote_kind","standard").order("revision_number",{ascending:false}).limit(1).maybeSingle();
  if(latestQuoteError)return jsonError("Could not load the current quote revision.",500);
  if(latestQuote&&latestQuote.id!==supersedesQuoteId)return jsonError("Create a revision from the latest quote for this Jobcard.",409);
  if(!latestQuote&&supersedesQuoteId)return jsonError("The selected previous quote is not available for this Jobcard.",409);
  let revisionNumber=1;
  if(supersedesQuoteId){
   const {data:prior}=await db.from("quotes").select("id,enquiry_id,customer_id,revision_number,status,senior_approval_status").eq("id",supersedesQuoteId).eq("business_id",businessId).maybeSingle();
   try{revisionNumber=nextQuoteRevision(prior,{enquiryId:enquiry?.id??null,customerId});}catch(error){return jsonError(error instanceof Error?error.message:"This quote cannot be revised.",409);}
  }
  const serviceIds=quotePricing.lines.map(x=>x.service_id).filter(Boolean) as string[];
  if(serviceIds.length){const {data:linkedServices,error:serviceLookupError}=await db.from("services").select("id,approval_status,is_active").eq("business_id",businessId).in("id",serviceIds);if(serviceLookupError||new Set((linkedServices??[]).map(x=>x.id)).size!==new Set(serviceIds).size||(linkedServices??[]).some(x=>!isServiceAvailableForQuoting(x)))return jsonError("One or more selected service presets are not approved for launch or are inactive.");}
  const lines=quotePricing.lines;
  const {subtotal,taxAmount,total}=quotePricing;
  let effectiveExpiryDate: string | null = expiryDate;
  try{effectiveExpiryDate=defaultQuoteExpiryDate(configured.payment&&typeof configured.payment==="object"?configured.payment.quote_validity_days:null,new Date().toISOString().slice(0,10),expiryDate);}catch(error){return jsonError(error instanceof Error?error.message:"Invalid quote validity setting.");}
  const quoteNumber="BRV-Q-"+Date.now().toString(36).toUpperCase()+"-"+crypto.randomUUID().slice(0,4).toUpperCase();
  const {data:quote,error}=await db.from("quotes").insert({business_id:businessId,customer_id:customerId,user_id:quoteUserId,enquiry_id:enquiry.id,quote_number:quoteNumber,revision_number:revisionNumber,supersedes_quote_id:supersedesQuoteId,prepared_by:access.user!.id,senior_approval_status:"pending",status:"draft",expiry_date:effectiveExpiryDate,subtotal,tax_amount:taxAmount,total,notes:notes||null,terms:terms||null}).select("id,quote_number,total,revision_number,enquiry_id,customer_id").single();
  if(error?.code==="23505")return jsonError("A quote revision was created at the same time. Reload the Jobcard and try again.",409);
  if(error||!quote){console.error("Quote insert failed",{error,enquiryId,customerId});return jsonError("Could not create quote.",500);}
  const {error:itemError}=await db.from("quote_items").insert(lines.map(item=>({...item,quote_id:quote.id})));
  if(itemError){console.error("Quote line insert failed",itemError);await db.from("quotes").delete().eq("id",quote.id).eq("business_id",businessId);return jsonError("Could not save quote lines. The draft was rolled back.",500);}
  const now=new Date().toISOString();
  if(enquiry){
   await db.from("enquiries").update({status:"reviewing",stage:"quote_in_progress",updated_at:now}).eq("id",enquiry.id).eq("business_id",businessId);
   if(enquiry.stage!=="quote_in_progress")await db.from("enquiry_stage_history").insert({business_id:businessId,enquiry_id:enquiry.id,from_stage:enquiry.stage,to_stage:"quote_in_progress",changed_by:access.user!.id,note:"Draft quote "+quote.quote_number+" prepared for senior review."});
  }
  await db.from("audit_events").insert({business_id:businessId,actor_user_id:access.user!.id,action:supersedesQuoteId?"quote.revised":"quote.created",entity_type:"quote",entity_id:quote.id,details:{quote_number:quoteNumber,customer_id:customerId,enquiry_id:enquiry?.id??null,revision_number:revisionNumber,line_count:lines.length,subtotal,tax_amount:taxAmount,total}});
  return Response.json({quote},{status:201});
 }catch(error){console.error("Quote creation failed",error);return jsonError("Could not create quote.",500);}
}
