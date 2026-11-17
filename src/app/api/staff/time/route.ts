import {currentUser,currentMembership,database,jsonError,sameOrigin,userHasPermission} from "@/lib/auth";
export const runtime="nodejs";
async function staffContext(){
 const user=await currentUser();if(!user)return {error:jsonError("Not signed in.",401)};
 const membership=await currentMembership(user.id);if(!membership)return {error:jsonError("Staff access required.",403)};
 if(!(await userHasPermission(user.id,"time.clock")))return {error:jsonError("You do not have permission to use the time clock.",403)};
 const db=database();
 const {data:staff}=await db.from("staff").select("id").eq("user_id",user.id).eq("business_id",membership.business_id).eq("employment_status","active").maybeSingle();
 if(!staff)return {error:jsonError("Active employee profile not found.",404)};
 return {user,membership,staff,db};
}
export async function GET(){
 const ctx=await staffContext();if(ctx.error)return ctx.error;
 const {staff,membership,db}=ctx;
 const [{data:active,error:activeError},{data:recent,error:recentError},{data:assignments,error:assignmentError}]=await Promise.all([
  db.from("time_entries").select("id,entry_type,started_at,job_id,work_entry_id").eq("business_id",membership.business_id).eq("staff_id",staff.id).is("ended_at",null).maybeSingle(),
  db.from("time_entries").select("id,entry_type,started_at,ended_at,duration_minutes,notes,job_id,work_entry_id,approved_at").eq("business_id",membership.business_id).eq("staff_id",staff.id).order("started_at",{ascending:false}).limit(10),
  db.from("job_assignments").select("job_id").eq("business_id",membership.business_id).eq("staff_id",staff.id).eq("status","accepted")
 ]);
 if(activeError||recentError||assignmentError)return jsonError("Could not load time clock records.",500);
 const jobIds=[...new Set((assignments??[]).map(x=>x.job_id))];
 if(!jobIds.length)return Response.json({active:active??null,recent:recent??[],workOptions:[]});
 const [jobsResult,entriesResult]=await Promise.all([
  db.from("jobs").select("id,job_number,title,status,worker_signed_off_at,appointment_id").eq("business_id",membership.business_id).in("id",jobIds),
  db.from("job_work_entries").select("id,job_id,description,quantity_used").eq("business_id",membership.business_id).in("job_id",jobIds).eq("entry_type","labour").order("created_at")
 ]);
 if(jobsResult.error||entriesResult.error)return jsonError("Could not load assigned Workcards and labour tasks.",500);
 const appointmentIds=[...new Set((jobsResult.data??[]).map(job=>job.appointment_id).filter(Boolean))];
 const {data:bookings,error:bookingError}=appointmentIds.length?await db.from("appointments").select("id,status").eq("business_id",membership.business_id).in("id",appointmentIds):{data:[],error:null};
 if(bookingError)return jsonError("Could not load confirmed Workcard bookings.",500);
 const confirmedBookings=new Set((bookings??[]).filter(x=>x.status==="confirmed").map(x=>x.id));
 const workOptions=(jobsResult.data??[]).filter(job=>!job.worker_signed_off_at&&confirmedBookings.has(job.appointment_id)&&["scheduled","in_progress"].includes(job.status)).map(job=>({...job,labourEntries:job.status==="in_progress"?(entriesResult.data??[]).filter(entry=>entry.job_id===job.id):[]}));
 return Response.json({active:active??null,recent:recent??[],workOptions});
}
export async function POST(request:Request){
 if(!sameOrigin(request))return jsonError("Invalid request origin.",403);
 const ctx=await staffContext();if(ctx.error)return ctx.error;const {membership,staff,db}=ctx;
 try{
  const body=await request.json(),action=String(body.action??""),now=new Date();
  if(action==="start"){
   const entryType=body.entryType==="travel"?"travel":"work";
   const jobId=body.jobId?String(body.jobId):null,workEntryId=body.workEntryId?String(body.workEntryId):null;
   if(workEntryId&&!jobId)return jsonError("Select a Workcard before selecting a labour task.");
   if(jobId&&!/^[0-9a-f-]{36}$/i.test(jobId))return jsonError("Select a valid Workcard.");
   if(workEntryId&&!/^[0-9a-f-]{36}$/i.test(workEntryId))return jsonError("Select a valid labour task.");
   if(jobId){
    const {data:assignment}=await db.from("job_assignments").select("id,status").eq("business_id",membership.business_id).eq("job_id",jobId).eq("staff_id",staff.id).maybeSingle();
    if(assignment?.status!=="accepted")return jsonError("Accept the Workcard assignment before recording time.",403);
    const {data:job}=await db.from("jobs").select("id,status,worker_signed_off_at,appointment_id").eq("id",jobId).eq("business_id",membership.business_id).maybeSingle();
    if(!job||job.worker_signed_off_at||["completed","cancelled"].includes(job.status))return jsonError("This Workcard is closed and cannot accept new time.",409);
    if(!job.appointment_id)return jsonError("A confirmed booking is required before recording Workcard time.",409);
    const {data:booking}=await db.from("appointments").select("id,status").eq("id",job.appointment_id).eq("business_id",membership.business_id).maybeSingle();
    if(!booking||!["confirmed","rescheduled"].includes(booking.status))return jsonError("A confirmed booking is required before recording Workcard time.",409);
    if(entryType==="work"&&job.status!=="in_progress")return jsonError("Work time can only be recorded after the Workcard has been started.",409);
    if(entryType==="travel"&&!["scheduled","in_progress"].includes(job.status))return jsonError("Travel time can only be recorded for a scheduled or active Workcard.",409);
   }
   if(workEntryId){
    const {data:entry}=await db.from("job_work_entries").select("id,job_id,entry_type").eq("id",workEntryId).eq("job_id",jobId).eq("business_id",membership.business_id).maybeSingle();
    if(!entry||entry.entry_type!=="labour")return jsonError("Select a valid labour task on this Workcard.",409);
   }
   if(workEntryId&&entryType!=="work")return jsonError("Travel time cannot be recorded against a labour task.");
   const {data:entry,error}=await db.from("time_entries").insert({business_id:membership.business_id,staff_id:staff.id,job_id:jobId,work_entry_id:workEntryId,entry_type:entryType,started_at:now.toISOString()}).select("id,entry_type,started_at,job_id,work_entry_id").single();
   if(error||!entry){if(error?.code==="23505")return jsonError("You already have an active time entry.",409);return jsonError("Could not start time entry.",500);}
   return Response.json({active:entry},{status:201});
  }
  if(action==="stop"){
   const {data:active}=await db.from("time_entries").select("id,started_at").eq("business_id",membership.business_id).eq("staff_id",staff.id).is("ended_at",null).maybeSingle();
   if(!active)return jsonError("There is no active time entry.",409);
   const duration=Math.max(0,Math.round((now.getTime()-new Date(active.started_at).getTime())/60000));
   const {error}=await db.from("time_entries").update({ended_at:now.toISOString(),duration_minutes:duration}).eq("id",active.id).eq("business_id",membership.business_id).eq("staff_id",staff.id).is("ended_at",null);
   if(error)return jsonError("Could not stop time entry.",500);
   return Response.json({success:true,durationMinutes:duration});
  }
  return jsonError("Choose start or stop.");
 }catch(error){console.error("Staff time clock failed.",error);return jsonError("Could not update time entry.",500);}
}
