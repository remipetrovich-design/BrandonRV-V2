import {authorizePermission,database,jsonError,sameOrigin} from "@/lib/auth";
import {isUuid} from "@/lib/api-validation.mjs";
import {prepareQuoteLines,validateQuoteTaxPolicy} from "@/lib/quote-engine.mjs";
import {emitIntegrationEvent} from "@/lib/emit-integration-event";
export const runtime="nodejs";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const access=await authorizePermission("quotes.manage");if(access.response)return access.response;
 const {id}=await params;if(!isUuid(id))return jsonError("Invalid quote ID.");
 const db=database(),businessId=access.membership!.business_id;
 const {data:quote,error}=await db.from("quotes").select("id,quote_number,revision_number,status,expiry_date,notes,terms,enquiry_id,customer_id,subtotal,tax_amount,total,quote_items(description,quantity,unit_price,tax_rate,line_total,sort_order,item_type,service_id)").eq("id",id).eq("business_id",businessId).maybeSingle();
 if(error||!quote)return jsonError("Quote not found.",404);
 const items=(quote.quote_items??[]) as any[];
 const taxRate=items.length?Number(items[0].tax_rate??0):0;
 return Response.json({quote:{...quote,tax_rate:taxRate,quote_items:items}});
}
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
 if(!sameOrigin(request))return jsonError("Invalid request origin.",403);
 const primary=await authorizePermission("quotes.manage");let access=primary,workcardOnly=false;if(primary.response){const alternate=await authorizePermission("jobs.manage");if(alternate.response)return primary.response;access=alternate;workcardOnly=true;}
 const {id}=await params;if(!isUuid(id))return jsonError("Invalid quote ID.");
 try{
  const body=await request.json(),db=database(),businessId=access.membership!.business_id;
  const {data:quote,error:loadError}=await db.from("quotes").select("id,status,quote_kind,subtotal,tax_amount,total,quote_items(description,quantity,unit_price,tax_rate,line_total,sort_order)").eq("id",id).eq("business_id",businessId).maybeSingle();
  if(loadError||!quote)return jsonError("Quote not found.",404);
  if(workcardOnly&&quote.quote_kind!=="variation")return jsonError("Quote management permission is required for standard quotes.",403);
  if(body.status==="sent"){
   const issueRpc=quote.quote_kind==="variation"?"issue_job_variation_quote":"issue_quote_for_jobcard";
   const {data:issued,error:issueError}=await db.rpc(issueRpc,{p_quote_id:id,p_business_id:businessId,p_actor_user_id:access.user!.id});
   if(issueError){if(issueError.code==="P0001")return jsonError("This quote or Jobcard is no longer available for issue.",409);return jsonError("Could not issue quote. No changes were made.",500);}
   if(!issued?.success)return jsonError("Could not confirm quote issue. No changes were made.",500);

   const {data:notificationQuote}=await db.from("quotes").select("id,quote_number,total,expiry_date,revision_number,quote_kind,customer_id,enquiry_id").eq("id",id).eq("business_id",businessId).maybeSingle();
   let recipientEmail:string|null=null,recipientName:string|null=null;
   if(notificationQuote?.customer_id){
    const {data:customer}=await db.from("customers").select("full_name,email").eq("id",notificationQuote.customer_id).eq("business_id",businessId).maybeSingle();
    recipientEmail=customer?.email??null;recipientName=customer?.full_name??null;
   }
   if(!recipientEmail&&notificationQuote?.enquiry_id){
    const {data:enquiry}=await db.from("enquiries").select("contact_name,email").eq("id",notificationQuote.enquiry_id).eq("business_id",businessId).maybeSingle();
    recipientEmail=enquiry?.email??null;recipientName=enquiry?.contact_name??null;
   }
   if(recipientEmail&&notificationQuote){
    const origin=(process.env.NEXT_PUBLIC_APP_URL?.trim()||new URL(request.url).origin).replace(/\/+$/g,"");
    await emitIntegrationEvent("quote.issued",{
     recipient:{email:recipientEmail,firstName:recipientName},
     customer:{name:recipientName,email:recipientEmail},
     quote:{id:notificationQuote.id,number:notificationQuote.quote_number,total:notificationQuote.total,expiryDate:notificationQuote.expiry_date,revisionNumber:notificationQuote.revision_number,kind:notificationQuote.quote_kind},
     business:{name:"Brandon RV"},portalUrl:origin+"/portal/quotes",issuedAt:new Date().toISOString()
    });
   }
   return Response.json({success:true,emailSent:!!recipientEmail});
  }
  if(quote.status!=="draft")return jsonError("Only draft quotes can be edited. Create a revision to change an issued or accepted quote.",409);
  const oldItems=(quote.quote_items??[]) as any[];
  const raw=Array.isArray(body.items)?body.items:oldItems;
  if(raw.length<1||raw.length>30)return jsonError("A quote must contain between 1 and 30 lines.");
  const items:{description:string;quantity:number;unit_price:number;tax_rate:number;sort_order:number;item_type:string;service_id:string|null}[]=raw.map((x:any,i:number)=>({description:String(x.description??"").trim(),quantity:Number(x.quantity),unit_price:Number(x.unit_price??x.unitPrice),tax_rate:Number(x.tax_rate??oldItems[i]?.tax_rate??oldItems[0]?.tax_rate??0),sort_order:i,item_type:String(x.item_type??oldItems[i]?.item_type??"labour"),service_id:x.service_id??oldItems[i]?.service_id??null}));

  const serviceIds=items.map(x=>x.service_id).filter(Boolean) as string[];
  if(serviceIds.length){const {data:linkedServices,error:serviceError}=await db.from("services").select("id").eq("business_id",businessId).eq("is_active",true).in("id",serviceIds);if(serviceError||new Set((linkedServices??[]).map(x=>x.id)).size!==new Set(serviceIds).size)return jsonError("One or more selected service presets are unavailable for this business.");}

  const {data:settings}=await db.from("business_settings").select("settings").eq("business_id",businessId).maybeSingle();
  const pricing=(settings?.settings as any)?.pricing??{};
  let priced;
  try{
   priced=prepareQuoteLines(items);
   validateQuoteTaxPolicy(priced.lines.map(x=>x.tax_rate),pricing);
  }catch(error){return jsonError(error instanceof Error?error.message:"Check quote pricing and GST settings.");}
  const {subtotal,taxAmount,total}=priced;
  const expiry=body.expiryDate===undefined?undefined:(body.expiryDate?String(body.expiryDate):null);
  if(expiry&&(!/^\d{4}-\d{2}-\d{2}$/.test(expiry)||expiry<=new Date().toISOString().slice(0,10)))return jsonError("Quote expiry must be a future date.");
  const patch:any={subtotal,tax_amount:taxAmount,total,notes:String(body.notes??"").trim().slice(0,3000)||null,terms:String(body.terms??"").trim().slice(0,3000)||null,updated_at:new Date().toISOString()};
  if(expiry!==undefined)patch.expiry_date=expiry;
  const {error:updateError}=await db.from("quotes").update(patch).eq("id",id).eq("business_id",businessId);
  if(updateError)return jsonError("Could not update quote.",500);
  const {error:deleteError}=await db.from("quote_items").delete().eq("quote_id",id);
  if(deleteError){await db.from("quotes").update({subtotal:quote.subtotal,tax_amount:quote.tax_amount,total:quote.total}).eq("id",id).eq("business_id",businessId);return jsonError("Could not replace quote lines. Previous totals were restored.",500);}
  const rows=priced.lines.map(x=>({...x,quote_id:id}));
  const {error:insertError}=await db.from("quote_items").insert(rows);
  if(insertError){
   await db.from("quote_items").insert(oldItems.map((x:any)=>({description:x.description,quantity:x.quantity,unit_price:x.unit_price,tax_rate:x.tax_rate,line_total:x.line_total,sort_order:x.sort_order,item_type:x.item_type??"parts",service_id:x.service_id??null,quote_id:id})));
   await db.from("quotes").update({subtotal:quote.subtotal,tax_amount:quote.tax_amount,total:quote.total}).eq("id",id).eq("business_id",businessId);
   return jsonError("Could not save quote lines. Previous lines and totals were restored.",500);
  }
  await db.from("audit_events").insert({business_id:businessId,actor_user_id:access.user!.id,action:"quote.updated",entity_type:"quote",entity_id:id,details:{line_count:items.length,subtotal,tax_amount:taxAmount,total}});
  return Response.json({success:true,quote:{id,total,subtotal,tax_amount:taxAmount}});
 }catch{return jsonError("Could not update quote.",500);}
}
export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){
 if(!sameOrigin(request))return jsonError("Invalid request origin.",403);
 const access=await authorizePermission("quotes.manage");if(access.response)return access.response;
 const {id}=await params,db=database(),businessId=access.membership!.business_id;
 const {data:quote}=await db.from("quotes").select("id,status,quote_number").eq("id",id).eq("business_id",businessId).maybeSingle();
 if(!quote)return jsonError("Quote not found.",404);
 if(quote.status!=="draft")return jsonError("Only draft quotes can be deleted. Issued and accepted quote history is retained.",409);
 const {count,error:jobError}=await db.from("jobs").select("id",{count:"exact",head:true}).eq("business_id",businessId).eq("quote_id",id);
 if(jobError)return jsonError("Could not verify linked Workcards.",500);
 if((count??0)>0)return jsonError("This quote is linked to a Workcard and cannot be deleted.",409);
 const {error:itemError}=await db.from("quote_items").delete().eq("quote_id",id);if(itemError)return jsonError("Could not delete quote lines.",500);
 const {error}=await db.from("quotes").delete().eq("id",id).eq("business_id",businessId);
 if(error)return jsonError("Could not delete draft quote.",500);
 await db.from("audit_events").insert({business_id:businessId,actor_user_id:access.user!.id,action:"quote.deleted",entity_type:"quote",entity_id:id,details:{quote_number:quote.quote_number}});
 return Response.json({success:true});
}
