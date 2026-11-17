import {currentUser,currentMembership,database,jsonError,sameOrigin} from "@/lib/auth";
import {canStartWorkOrder,canFinishWorkOrder} from "@/lib/work-order-lifecycle.mjs";
export const runtime="nodejs";

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
 if(!sameOrigin(request))return jsonError("Invalid request origin.",403);
 const user=await currentUser();if(!user)return jsonError("Not signed in.",401);
 const membership=await currentMembership(user.id);if(!membership)return jsonError("Staff access required.",403);
 const {id}=await params;
 try{
  const body=await request.json();const action=String(body.action??"");
  if(!["start","finish"].includes(action))return jsonError("Choose start or finish.");
  const db=database();const {data:staff}=await db.from("staff").select("id").eq("user_id",user.id).eq("business_id",membership.business_id).maybeSingle();
  if(!staff)return jsonError("Employee profile not found.",404);
    const {data:job}=await db.from("jobs").select("id,status,customer_id,user_id,quote_id,appointment_id,job_number,title,customer_approval_status,senior_approval_status").eq("id",id).eq("business_id",membership.business_id).maybeSingle();
  if(!job)return jsonError("Work Order not found.",404);
  const {data:assignment}=await db.from("job_assignments").select("id,status").eq("business_id",membership.business_id).eq("job_id",id).eq("staff_id",staff.id).maybeSingle();
  if(assignment?.status!=="accepted")return jsonError("Accept this Work Order assignment before starting or finishing it.",403);
  const now=new Date().toISOString();
  if(action==="start"){
   if(job.status==="in_progress")return Response.json({success:true,status:"in_progress",alreadyStarted:true});
   if(!job.appointment_id)return jsonError("A booking must be confirmed before work can start.",409);
   const {data:booking}=await db.from("appointments").select("id,status,starts_at,ends_at,location").eq("id",job.appointment_id).eq("business_id",membership.business_id).maybeSingle();
   if(!booking||booking.status!=="confirmed"||!booking.starts_at||!booking.location)return jsonError("A confirmed booking with a start time and customer-site location is required before work can start.",409);
   if(!canStartWorkOrder(job.status,assignment?.status,false))return jsonError("This Work Order cannot be started from its current status or assignment.",409);
   const {error}=await db.from("jobs").update({status:"in_progress",actual_start:now,updated_at:now}).eq("id",id).eq("business_id",membership.business_id);
   if(error)return jsonError("Could not start Work Order.",500);
   await db.from("audit_events").insert({business_id:membership.business_id,actor_user_id:user.id,action:"work_order.started",entity_type:"job",entity_id:id,details:{staff_id:staff.id}});
   return Response.json({success:true,status:"in_progress"});
  }
  if(job.status==="completed"&&["pending","approved","legacy_approved"].includes(String(job.senior_approval_status))){
   const {data:existingInvoice}=await db.from("invoices").select("id,invoice_number,total,status").eq("job_id",id).eq("business_id",membership.business_id).eq("workcard_signoff_invoice",true).maybeSingle();
   if(!existingInvoice)return jsonError("This Workcard is signed off but its final invoice is missing. An administrator must review the record.",409);
   return Response.json({success:true,status:"completed",invoice:existingInvoice,alreadyFinished:true});
  }
  if(!canFinishWorkOrder(job.status,assignment?.status,false))return jsonError("Only an in-progress Work Order with an accepted assignment can be finished.",409);
  const summary=String(body.workSummary??"").trim().slice(0,8000);
  if(summary.length<10)return jsonError("Add a useful summary of the work completed before finishing the Work Order.");
  const {data:result,error:finishError}=await db.rpc("finish_workcard_and_create_invoice",{
   p_job_id:id,p_business_id:membership.business_id,p_actor_user_id:user.id,p_staff_id:staff.id,p_work_summary:summary
  });
  if(finishError){if(finishError.code==="P0001")return jsonError(finishError.message??"Workcard could not be signed off.",409);if(finishError.code==="22023")return jsonError(finishError.message??"Enter a valid work summary.");return jsonError("Workcard sign-off and invoice creation failed. No changes were saved.",500);}
  return Response.json({success:true,status:"completed",invoice:result?.invoice,alreadyFinished:result?.already_finished===true});
 }catch{return jsonError("Could not update Work Order.",500);}
}
