import {currentUser,currentMembership,database,userHasPermission,jsonError,sameOrigin} from "@/lib/auth";
import {normalizeWorkcardStaffIds} from "@/lib/workcard-assignment-input.mjs";
import {emitIntegrationEvent} from "@/lib/emit-integration-event";
export const runtime="nodejs";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const user=await currentUser();if(!user)return jsonError("Not signed in.",401);const membership=await currentMembership(user.id);if(!membership||!(await userHasPermission(user.id,"jobs.assign")))return jsonError("You do not have permission to assign jobs.",403);
 const {id}=await params;const db=database();const {data:job}=await db.from("jobs").select("id,workcard_review_status").eq("id",id).eq("business_id",membership.business_id).maybeSingle();if(!job)return jsonError("Workcard not found.",404);
 const [{data:staff},{data:assignments}]=await Promise.all([db.from("staff").select("id,user_id,job_title,employment_status,full_name,email").eq("business_id",membership.business_id).eq("employment_status","active"),db.from("job_assignments").select("staff_id,status").eq("job_id",id).eq("business_id",membership.business_id)]);
 return Response.json({staff:staff??[],assignments:assignments??[],canAssign:["approved","legacy_approved"].includes(String(job.workcard_review_status??"legacy_approved")),workcardReviewStatus:job.workcard_review_status??"legacy_approved"});
}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 if(!sameOrigin(request))return jsonError("Invalid request origin.",403);const user=await currentUser();if(!user)return jsonError("Not signed in.",401);const membership=await currentMembership(user.id);if(!membership||!(await userHasPermission(user.id,"jobs.assign")))return jsonError("You do not have permission to assign jobs.",403);
 try{
  const {id}=await params;const body=await request.json();if(!Array.isArray(body.staffIds))return jsonError("Choose the staff members to assign.");
  const ids=normalizeWorkcardStaffIds(body.staffIds);
  if(!ids)return jsonError("Invalid staff selection.");
  const {data,error}=await database().rpc("replace_workcard_assignments",{p_job_id:id,p_business_id:membership.business_id,p_actor_user_id:user.id,p_staff_ids:ids});
  if(error){if(error.code==="P0001")return jsonError(error.message??"This Workcard cannot be assigned.",409);if(error.code==="22023")return jsonError(error.message??"Invalid staff selection.");return jsonError("Could not save staff assignments. No changes were made.",500);}
  const db=database();
  const [{data:job},{data:assignedStaff}]=await Promise.all([
   db.from("jobs").select("id,job_number,title,status,customer_id,user_id").eq("id",id).eq("business_id",membership.business_id).maybeSingle(),
   ids.length?db.from("staff").select("id,full_name,email,job_title").eq("business_id",membership.business_id).in("id",ids).eq("employment_status","active"):Promise.resolve({data:[]})
  ]);
  for(const member of assignedStaff??[])if(member.email)await emitIntegrationEvent("job.assigned",{
   recipient:{email:member.email,firstName:member.full_name},staff:{id:member.id,name:member.full_name,email:member.email,jobTitle:member.job_title},
   job:{id,number:job?.job_number??null,title:job?.title??null,status:job?.status??null},business:{name:"Brandon RV"},assignedAt:new Date().toISOString()
  });
  return Response.json(data);
 }catch{return jsonError("Could not assign staff.",500);}
}
