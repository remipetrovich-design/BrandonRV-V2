import {currentUser,currentMembership,database,jsonError,sameOrigin} from "@/lib/auth";
import {canStartWorkOrder,canFinishWorkOrder} from "@/lib/work-order-lifecycle.mjs";
import {emitIntegrationEvent} from "@/lib/emit-integration-event";
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
  if(action==="start"){
   if(job.status==="in_progress")return Response.json({success:true,status:"in_progress",alreadyStarted:true});
   if(!canStartWorkOrder(job.status,assignment?.status,false))return jsonError("This Work Order cannot be started from its current status or assignment.",409);
   const {data:started,error}=await db.rpc("start_workcard",{p_job_id:id,p_business_id:membership.business_id,p_actor_user_id:user.id,p_staff_id:staff.id});
   if(error){if(error.code==="P0001")return jsonError(error.message??"This Workcard cannot be started.",409);return jsonError("Could not start this Workcard. No changes were saved.",500);}
   const {data:customerUser}=job.user_id?await db.from("users").select("email,full_name").eq("id",job.user_id).maybeSingle():{data:null};
   const recipientEmail=customerUser?.email??job.guest_email??null;
   if(recipientEmail)await emitIntegrationEvent("job.started",{
    recipient:{email:recipientEmail,firstName:customerUser?.full_name??null},customer:{email:recipientEmail,name:customerUser?.full_name??null},
    job:{id:job.id,number:job.job_number,title:job.title,status:"in_progress"},business:{name:"Brandon RV"},startedAt:new Date().toISOString()
   });
   return Response.json(started);
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
  const {data:customerUser}=job.user_id?await db.from("users").select("email,full_name").eq("id",job.user_id).maybeSingle():{data:null};
  const recipientEmail=customerUser?.email??job.guest_email??null;
  if(recipientEmail){
   const payload={recipient:{email:recipientEmail,firstName:customerUser?.full_name??null},customer:{email:recipientEmail,name:customerUser?.full_name??null},job:{id:job.id,number:job.job_number,title:job.title,status:"completed"},workSummary:summary,business:{name:"Brandon RV"},completedAt:new Date().toISOString()};
   await emitIntegrationEvent("job.completed",payload);
   await emitIntegrationEvent("job.customer_approval_requested",{...payload,approvalUrl:(process.env.NEXT_PUBLIC_APP_URL?.trim()||new URL(request.url).origin).replace(/\\/+$/g,"")+"/portal/jobcards/"+id});
  }
  return Response.json({success:true,status:"completed",invoice:result?.invoice,alreadyFinished:result?.already_finished===true});
 }catch{return jsonError("Could not update Work Order.",500);}
}
