import {authorizePermission,database,jsonError,sameOrigin,userHasPermission} from "@/lib/auth";
import {isUuid} from "@/lib/api-validation.mjs";
export const runtime="nodejs";

export async function GET(request:Request){
 const access=await authorizePermission("suppliers.view");if(access.response)return access.response;
 const db=database(),businessId=access.membership!.business_id;
 const jobId=new URL(request.url).searchParams.get("jobId");
 if(jobId){
  if(!(await userHasPermission(access.user!.id,"jobs.view")))return jsonError("Workcard access required.",403);
  if(!isUuid(jobId))return jsonError("Select a valid Workcard.");
  const {data:job,error:jobError}=await db.from("jobs").select("id,status,worker_signed_off_at").eq("id",jobId).eq("business_id",businessId).maybeSingle();
  if(jobError||!job)return jsonError("Workcard not found.",404);
  if(job.worker_signed_off_at||["completed","cancelled"].includes(job.status))return jsonError("This Workcard is closed and cannot receive new supplier orders.",409);
  const {data,error}=await db.from("job_work_entries").select("id,description,part_number,quantity_required,quantity_ordered,quantity_received,part_order_status").eq("business_id",businessId).eq("job_id",jobId).eq("entry_type","parts").order("created_at");
  if(error)return jsonError("Could not load Workcard parts.",500);
  return Response.json({workEntries:(data??[]).map(entry=>({...entry,outstanding_quantity:Math.max(0,Number(entry.quantity_required)-Number(entry.quantity_ordered))})).filter(entry=>entry.outstanding_quantity>0)});
 }
 const [ordersResult,suppliersResult,jobsResult,canViewJobs]=await Promise.all([
  db.from("supplier_orders").select("id,order_number,status,ordered_at,expected_at,received_at,subtotal,tax_amount,total,notes,created_at,supplier:suppliers!supplier_orders_supplier_id_fkey(id,name),job:jobs!supplier_orders_job_id_fkey(id,job_number,title),items:supplier_order_items(id,work_entry_id,description,sku,quantity,quantity_received,unit_cost,tax_rate,line_total)").eq("business_id",businessId).order("created_at",{ascending:false}).limit(100),
  db.from("suppliers").select("id,name").eq("business_id",businessId).eq("is_active",true).order("name"),
  db.from("jobs").select("id,job_number,title,status,worker_signed_off_at").eq("business_id",businessId).order("created_at",{ascending:false}).limit(100),
  userHasPermission(access.user!.id,"jobs.view")
 ]);
 if(ordersResult.error||suppliersResult.error)return jsonError("Could not load supplier purchasing records.",500);
 return Response.json({orders:ordersResult.data??[],suppliers:suppliersResult.data??[],jobs:canViewJobs?(jobsResult.data??[]).filter(job=>!job.worker_signed_off_at&&!["completed","cancelled"].includes(job.status)):[]});
}

export async function POST(request:Request){
 if(!sameOrigin(request))return jsonError("Invalid request origin.",403);
 const access=await authorizePermission("suppliers.manage");if(access.response)return access.response;
 if(!(await userHasPermission(access.user!.id,"jobs.view")))return jsonError("Workcard access required.",403);
 try{
  const body=await request.json(),supplierId=String(body.supplierId??""),jobId=String(body.jobId??"");
  if(!isUuid(supplierId)||!isUuid(jobId))return jsonError("Choose a supplier and Workcard.");
  if(!Array.isArray(body.items)||body.items.length<1||body.items.length>100)return jsonError("Select at least one Workcard parts line.");
  const expectedAt=body.expectedAt?String(body.expectedAt):null;
  if(expectedAt&&!/^\d{4}-\d{2}-\d{2}$/.test(expectedAt))return jsonError("Enter a valid expected delivery date.");
  const items=body.items.map((item:any)=>({
   work_entry_id:String(item.workEntryId??""),
   quantity:Number(item.quantity),
   unit_cost:Number(item.unitCost),
   tax_rate:Number(item.taxRate??0)
  }));
  if(items.some((item:any)=>!isUuid(item.work_entry_id)||![item.quantity,item.unit_cost,item.tax_rate].every(Number.isFinite)))return jsonError("Check the selected parts quantities, costs and tax.");
  const {data,error}=await database().rpc("create_supplier_order",{
   p_business_id:access.membership!.business_id,p_actor_user_id:access.user!.id,p_supplier_id:supplierId,
   p_job_id:jobId,p_expected_at:expectedAt,p_notes:String(body.notes??"").trim().slice(0,3000)||null,p_items:items
  });
  if(error){if(error.code==="P0001"||error.code==="22023")return jsonError(error.message??"Supplier order details are no longer valid.",409);return jsonError("Could not create supplier order. No changes were made.",500);}
  return Response.json(data,{status:201});
 }catch(error){console.error("Supplier order creation failed.",error);return jsonError("Could not create supplier order.",500);}
}
