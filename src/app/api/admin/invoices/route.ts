import {authorizePermission,database,jsonError,sameOrigin} from "@/lib/auth";
import {priceDocumentLines} from "@/lib/commercial-money.mjs";
export const runtime="nodejs";
export async function GET(){
 const access=await authorizePermission("invoices.manage");if(access.response)return access.response;const db=database(),businessId=access.membership!.business_id;
 const {data:jobs,error}=await db.from("jobs").select("id,job_number,title,customer_id,quote_id,customers(full_name)").eq("business_id",businessId).eq("status","completed").order("completed_at",{ascending:false});
 if(error)return jsonError("Could not load completed jobs.",500);
 const ids=(jobs??[]).map(x=>x.id);
 const {data:existing,error:existingError}=ids.length?await db.from("invoices").select("job_id").eq("business_id",businessId).in("job_id",ids):{data:[],error:null};
 if(existingError)return jsonError("Could not check existing invoices.",500);
 const invoiced=new Set((existing??[]).map(x=>x.job_id));
 return Response.json({jobs:(jobs??[]).filter(x=>!invoiced.has(x.id))});
}
export async function POST(request:Request){
 if(!sameOrigin(request))return jsonError("Invalid request origin.",403);
 const access=await authorizePermission("invoices.manage");if(access.response)return access.response;
 try{
  const body=await request.json(),jobId=String(body.jobId??""),dueDate=body.dueDate?String(body.dueDate):null,notes=String(body.notes??"").trim().slice(0,3000);
  if(!/^[0-9a-f-]{36}$/i.test(jobId))return jsonError("Select a completed Workcard.");
  if(dueDate&&!/^\d{4}-\d{2}-\d{2}$/.test(dueDate))return jsonError("Enter a valid due date.");
  const db=database(),businessId=access.membership!.business_id;
  const {data:job,error:jobError}=await db.from("jobs").select("id,job_number,title,customer_id,user_id,quote_id,status,senior_approval_status,customer_approval_status").eq("id",jobId).eq("business_id",businessId).eq("status","completed").maybeSingle();
  if(jobError||!job)return jsonError("Only a completed Workcard can be invoiced.",409);
  if(job.senior_approval_status!=="approved"&&job.senior_approval_status!=="legacy_approved")return jsonError("Senior approval is required before invoicing.",409);
  if(job.customer_approval_status!=="pending")return jsonError("The completed Workcard must be awaiting customer approval before its draft invoice can be created.",409);
  const {data:existing,error:existingError}=await db.from("invoices").select("id").eq("business_id",businessId).eq("job_id",job.id).limit(1).maybeSingle();
  if(existingError)return jsonError("Could not check for an existing invoice.",500);
  if(existing)return jsonError("This Workcard already has an invoice. Use the existing invoice to manage its balance.",409);
  const {data:entries,error:entryError}=await db.from("job_work_entries").select("id,entry_type,description,quantity_used,unit_price,tax_rate,line_total,invoiceable").eq("business_id",businessId).eq("job_id",job.id).eq("invoiceable",true).in("entry_type",["labour","parts"]).gt("quantity_used",0).order("created_at");
  if(entryError)return jsonError("Could not load actual Workcard labour and parts.",500);
  if(!entries?.length)return jsonError("No actual labour or parts are marked ready for invoicing. Record the completed work on the Workcard first.",409);
  const {data:businessSettings}=await db.from("business_settings").select("settings").eq("business_id",businessId).maybeSingle();
  const settings=businessSettings?.settings&&typeof businessSettings.settings==="object"?businessSettings.settings as Record<string,any>:{};
  const pricing=settings.pricing&&typeof settings.pricing==="object"?settings.pricing:{};
  const gstStatus=String(pricing.gst_status??"not_configured"),gstRate=Number(pricing.gst_rate??10);
  if(gstStatus!=="registered"&&entries.some(x=>Number(x.tax_rate)>0))return jsonError("Invoice GST must be zero until the business is confirmed as GST registered.");
  if(gstStatus==="registered"&&entries.some(x=>Math.abs(Number(x.tax_rate)-gstRate)>0.001))return jsonError("Update Workcard entry tax rates to the configured GST rate before invoicing.");
  const priced=priceDocumentLines(entries.map((x,i)=>({description:x.description,quantity:Number(x.quantity_used),unit_price:Number(x.unit_price),tax_rate:Number(x.tax_rate),sort_order:i})));
  const items=priced.lines;
  const {subtotal,taxAmount,total}=priced;
  if(total<=0)return jsonError("The actual Workcard charges must be greater than zero before invoicing.",409);
  const invoiceNumber="BRV-I-"+Date.now().toString(36).toUpperCase()+"-"+crypto.randomUUID().slice(0,4).toUpperCase();
  const {data:result,error}=await db.rpc("create_invoice_from_approved_workcard",{
   p_business_id:businessId,
   p_job_id:job.id,
   p_actor_user_id:access.user!.id,
   p_invoice:{invoice_number:invoiceNumber,due_date:dueDate,subtotal,tax_amount:taxAmount,total,notes:notes||("Final invoice for Workcard "+job.job_number+" · calculated from actual completed work.")},
   p_items:items.map((item,index)=>({...item,source_entry_id:entries[index].id}))
  });
  if(error||!result?.invoice){
   console.error("Transactional final invoice creation failed",error);
   const status=error?.code==="P0001"||error?.code==="23505"?409:error?.code==="22023"?400:500;
   return jsonError(status===409?error?.message||"This Workcard is not ready for invoicing.":status===400?error?.message||"Invoice values are invalid.":"Could not create final invoice.",status);
  }
  return Response.json({invoice:result.invoice},{status:201});
 }catch(error){console.error("Final invoice creation failed",error);return jsonError("Could not create final invoice.",500);}
}
