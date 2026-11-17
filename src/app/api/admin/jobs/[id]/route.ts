import {authorizePermission,database,jsonError,sameOrigin} from "@/lib/auth";
import {isUuid} from "@/lib/api-validation.mjs";
import {canTransitionWorkcardStatus} from "@/lib/workcard-engine.mjs";
export const runtime="nodejs";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const access=await authorizePermission("jobs.manage");if(access.response)return access.response;
 const {id}=await params;
 const {data:job,error}=await database().from("jobs").select("id,job_number,title,status,priority,scheduled_start,scheduled_end,scope_of_work,customer_visible_notes,worker_signed_off_at,senior_approval_status,customer_approval_status").eq("id",id).eq("business_id",access.membership!.business_id).maybeSingle();
 if(error||!job)return jsonError("Workcard not found.",404);
 return Response.json({job});
}
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
 if(!sameOrigin(request))return jsonError("Invalid request origin.",403);
 const access=await authorizePermission("jobs.manage");if(access.response)return access.response;
 const {id}=await params;if(!isUuid(id))return jsonError("Invalid Workcard ID.");
 try{
  const body=await request.json(),db=database(),businessId=access.membership!.business_id;
  const {data:current,error:loadError}=await db.from("jobs").select("id,status,quote_id,appointment_id,senior_approval_status,worker_signed_off_at,customer_approval_status").eq("id",id).eq("business_id",businessId).maybeSingle();
  if(loadError||!current)return jsonError("Workcard not found.",404);
  const patch:Record<string,unknown>={};
  if(body.title!==undefined){const v=String(body.title).trim();if(v.length<3||v.length>180)return jsonError("Workcard title must be between 3 and 180 characters.");patch.title=v;}
  if(body.scope_of_work!==undefined){const v=String(body.scope_of_work).trim();if(v.length<3||v.length>5000)return jsonError("Work scope must be between 3 and 5000 characters.");if(current.worker_signed_off_at)return jsonError("A signed-off Workcard cannot have its approved scope overwritten. Record a variation instead.",409);patch.scope_of_work=v;}
  if(body.customer_visible_notes!==undefined)patch.customer_visible_notes=String(body.customer_visible_notes).trim().slice(0,3000)||null;
  if(body.internal_notes!==undefined)patch.internal_notes=String(body.internal_notes).trim().slice(0,5000)||null;
  if(body.priority!==undefined){if(!["low","normal","high","urgent"].includes(String(body.priority)))return jsonError("Invalid Workcard priority.");patch.priority=body.priority;}
  if(body.estimated_hours!==undefined){if(body.estimated_hours===null||body.estimated_hours===""){patch.estimated_hours=null;}else{const hours=Number(body.estimated_hours);if(!Number.isFinite(hours)||hours<0||hours>1000)return jsonError("Enter valid estimated labour hours.");patch.estimated_hours=hours;}}
  if(body.status!==undefined){const next=String(body.status);if(!["pending","scheduled","in_progress","waiting_parts","completed","cancelled"].includes(next))return jsonError("Invalid Workcard status.");if(next==="completed"&&current.status!=="completed")return jsonError("Only the assigned worker can sign off a Workcard and generate its final invoice.",409);
  if(next==="scheduled"&&current.status!=="scheduled"){if(!current.appointment_id)return jsonError("A confirmed booking is required before scheduling this Workcard.",409);const {data:booking}=await db.from("appointments").select("id,status").eq("id",current.appointment_id).eq("business_id",businessId).maybeSingle();if(!booking||booking.status!=="confirmed")return jsonError("A confirmed booking is required before scheduling this Workcard.",409);}
  if(next==="in_progress"&&current.status!=="in_progress"){if(!current.appointment_id)return jsonError("A confirmed booking is required before starting this Workcard.",409);const {data:booking}=await db.from("appointments").select("id,status").eq("id",current.appointment_id).eq("business_id",businessId).maybeSingle();if(!booking||booking.status!=="confirmed")return jsonError("A confirmed booking is required before starting this Workcard.",409);const {data:assignment}=await db.from("job_assignments").select("id").eq("business_id",businessId).eq("job_id",id).in("status",["accepted"]).maybeSingle();if(!assignment)return jsonError("An accepted staff assignment is required before starting this Workcard.",409);}
  if(!canTransitionWorkcardStatus(current.status,next))return jsonError("This Workcard cannot move from "+String(current.status).replaceAll("_"," ")+" to "+next.replaceAll("_"," ")+".",409);if(next==="completed"&&current.senior_approval_status!=="approved"&&current.senior_approval_status!=="legacy_approved")return jsonError("Senior approval is required before completing a Workcard.",409);if(next==="completed"&&current.customer_approval_status!=="approved")return jsonError("Customer approval is required before completing a Workcard.",409);patch.status=next;}
  for(const field of ["scheduled_start","scheduled_end"] as const){if(body[field]!==undefined){const value=body[field]?new Date(String(body[field])):null;if(value&&!Number.isFinite(value.getTime()))return jsonError("Enter a valid Workcard schedule.");patch[field]=value?.toISOString()??null;}}
  if(patch.scheduled_start&&patch.scheduled_end&&new Date(String(patch.scheduled_end))<=new Date(String(patch.scheduled_start)))return jsonError("Workcard end must be after its start.");
  if(Object.keys(patch).length===0)return jsonError("No Workcard changes supplied.");
  const {data:result,error}=await db.rpc("update_workcard_with_jobcard_stage",{
   p_business_id:businessId,
   p_job_id:id,
   p_actor_user_id:access.user!.id,
   p_patch:patch
  });
  if(error){
   console.error("Transactional Workcard update failed",error);
   const status=error.code==="P0002"?404:error.code==="P0001"?409:error.code==="22023"?400:500;
   return jsonError(status===404?"Workcard not found.":status===409?error.message||"This Workcard update is not permitted.":status===400?"Workcard update values are invalid.":"Could not update Workcard.",status);
  }
  if(!result?.job)return jsonError("Workcard update returned an incomplete result.",500);
  return Response.json({job:result.job});
 }catch{return jsonError("Could not update Workcard.",500);}
}
export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){
 if(!sameOrigin(request))return jsonError("Invalid request origin.",403);
 const access=await authorizePermission("jobs.manage");if(access.response)return access.response;
 const {id}=await params;if(!isUuid(id))return jsonError("Invalid Workcard ID.");
 const {data,error}=await database().rpc("delete_untouched_workcard",{
  p_business_id:access.membership!.business_id,
  p_job_id:id,
  p_actor_user_id:access.user!.id
 });
 if(error){
  console.error("Transactional Workcard deletion failed",error);
  const status=error.code==="P0002"?404:error.code==="P0001"?409:error.code==="22023"?400:500;
  return jsonError(status===404?"Workcard not found.":status===409?error.message||"This Workcard cannot be deleted.":status===400?"Invalid Workcard deletion details.":"Could not delete Workcard.",status);
 }
 return Response.json({success:Boolean(data?.success)});
}
