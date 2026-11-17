import {currentUser,currentMembership,database,jsonError,sameOrigin,userHasPermission} from "@/lib/auth";
import {isUuid} from "@/lib/api-validation.mjs";
export const runtime="nodejs";
const types=["note","checklist","parts_request","schedule_proposal"];
const statuses=["prepared","queued","awaiting_authorisation","completed"];
async function context(jobId:string,userId:string,businessId:string){
 const db=database();
 const [{data:job},{data:staff}]=await Promise.all([
  db.from("jobs").select("id,status").eq("id",jobId).eq("business_id",businessId).maybeSingle(),
  db.from("staff").select("id").eq("user_id",userId).eq("business_id",businessId).maybeSingle()
 ]);
 if(!job)return {db,job:null,allowed:false};
 const canManage=await userHasPermission(userId,"jobs.manage");
 const canPrepare=await userHasPermission(userId,"jobs.prepare");
 let assigned=false;
 if(staff){const {data:assignment}=await db.from("job_assignments").select("status").eq("business_id",businessId).eq("job_id",jobId).eq("staff_id",staff.id).maybeSingle();assigned=["assigned","accepted"].includes(String(assignment?.status));}
 return {db,job,allowed:canManage||(canPrepare&&assigned)};
}
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const user=await currentUser();if(!user)return jsonError("Not signed in.",401);
 const membership=await currentMembership(user.id);if(!membership)return jsonError("Staff access required.",403);
 const {id}=await params;if(!isUuid(id))return jsonError("Invalid Workcard ID.");
 const ctx=await context(id,user.id,membership.business_id);if(!ctx.allowed)return jsonError("Workcard not found or preparation access is not assigned.",404);
 const {data,error}=await ctx.db.from("job_preparation_items").select("id,item_type,title,details,status,requested_quantity,supplier_name,estimated_cost,proposed_start,created_by,created_at,updated_at").eq("business_id",membership.business_id).eq("job_id",id).order("created_at",{ascending:false});
 if(error)return jsonError("Could not load preparation items.",500);
 return Response.json({items:data??[]});
}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 if(!sameOrigin(request))return jsonError("Invalid request origin.",403);
 const user=await currentUser();if(!user)return jsonError("Not signed in.",401);
 const membership=await currentMembership(user.id);if(!membership)return jsonError("Staff access required.",403);
 const {id}=await params;if(!isUuid(id))return jsonError("Invalid Workcard ID.");
 const ctx=await context(id,user.id,membership.business_id);if(!ctx.allowed)return jsonError("Workcard not found or preparation access is not assigned.",404);
 try{
  const body=await request.json(),itemType=String(body.item_type??""),title=String(body.title??"").trim(),details=String(body.details??"").trim();
  if(!types.includes(itemType)||title.length<2||title.length>160||details.length>3000)return jsonError("Enter a valid preparation item.");
  const status=String(body.status??"prepared");if(!statuses.includes(status))return jsonError("Invalid preparation status.");
  const row:any={business_id:membership.business_id,job_id:id,item_type:itemType,title,details,status,created_by:user.id,updated_by:user.id};
  if(itemType==="parts_request"){
   const quantity=Number(body.requested_quantity),cost=body.estimated_cost==null||body.estimated_cost===""?null:Number(body.estimated_cost);
   if(!Number.isFinite(quantity)||quantity<=0||quantity>10000||cost!==null&&(!Number.isFinite(cost)||cost<0||cost>10000000))return jsonError("Enter a valid requested quantity and estimated cost.");
   row.requested_quantity=quantity;row.estimated_cost=cost;row.supplier_name=String(body.supplier_name??"").trim().slice(0,160)||null;
   if(status==="completed")return jsonError("A parts request cannot be marked purchased or received here.",409);
   if(status==="queued")row.status="awaiting_authorisation";
  }
  if(itemType==="schedule_proposal"&&body.proposed_start){const date=new Date(String(body.proposed_start));if(!Number.isFinite(date.getTime()))return jsonError("Enter a valid proposed date.");row.proposed_start=date.toISOString();}
  const {data:item,error}=await ctx.db.from("job_preparation_items").insert(row).select("id,item_type,title,details,status,requested_quantity,supplier_name,estimated_cost,proposed_start,created_by,created_at,updated_at").single();
  if(error||!item)return jsonError("Could not save preparation item.",500);
  await ctx.db.from("audit_events").insert({business_id:membership.business_id,actor_user_id:user.id,action:"workcard.preparation_item_added",entity_type:"job",entity_id:id,details:{item_id:item.id,item_type:itemType,status:item.status}});
  return Response.json({item},{status:201});
 }catch{return jsonError("Could not save preparation item.",500);}
}
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
 if(!sameOrigin(request))return jsonError("Invalid request origin.",403);
 const user=await currentUser();if(!user)return jsonError("Not signed in.",401);
 const membership=await currentMembership(user.id);if(!membership)return jsonError("Staff access required.",403);
 const {id}=await params;if(!isUuid(id))return jsonError("Invalid Workcard ID.");
 const ctx=await context(id,user.id,membership.business_id);if(!ctx.allowed)return jsonError("Workcard not found or preparation access is not assigned.",404);
 try{
  const body=await request.json(),itemId=String(body.item_id??""),status=String(body.status??"");
  if(!isUuid(itemId)||!statuses.includes(status))return jsonError("Invalid preparation item update.");
  const {data:existing}=await ctx.db.from("job_preparation_items").select("id,item_type").eq("id",itemId).eq("job_id",id).eq("business_id",membership.business_id).maybeSingle();
  if(!existing)return jsonError("Preparation item not found.",404);
  if(existing.item_type==="parts_request"&&status==="completed")return jsonError("A parts request cannot be marked purchased or received here.",409);
  const {data:item,error}=await ctx.db.from("job_preparation_items").update({status,updated_by:user.id,updated_at:new Date().toISOString()}).eq("id",itemId).eq("job_id",id).eq("business_id",membership.business_id).select("id,item_type,title,status").single();
  if(error||!item)return jsonError("Could not update preparation item.",500);
  await ctx.db.from("audit_events").insert({business_id:membership.business_id,actor_user_id:user.id,action:"workcard.preparation_item_status_changed",entity_type:"job",entity_id:id,details:{item_id:itemId,status}});
  return Response.json({item});
 }catch{return jsonError("Could not update preparation item.",500);}
}
