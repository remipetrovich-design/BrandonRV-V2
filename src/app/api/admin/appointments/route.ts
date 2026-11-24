import {authorizePermission,database,jsonError,sameOrigin,userHasPermission} from "@/lib/auth";
import {validateBookingWindow} from "@/lib/booking-rules";
import {bookingWindowsConflict} from "@/lib/booking-window-policy.mjs";
import {emitIntegrationEvent} from "@/lib/emit-integration-event";
export const runtime="nodejs";
export async function POST(request:Request){
 if(!sameOrigin(request))return jsonError("Invalid request origin.",403);
 const access=await authorizePermission("appointments.manage");if(access.response)return access.response;
 try{
  const body=await request.json(),jobId=String(body.job_id??"");
  const startsAt=new Date(String(body.starts_at??""));
  const endsAt=body.ends_at?new Date(String(body.ends_at)):null;
  const location=String(body.location??"").trim().slice(0,200);
  const bypassRestrictions=await userHasPermission(access.user!.id,"appointments.override_scheduling_restrictions");
  if(!/^[0-9a-f-]{36}$/i.test(jobId))return jsonError("Select a Workcard for this appointment.");
  if(!Number.isFinite(startsAt.getTime())||(endsAt&&(!Number.isFinite(endsAt.getTime())||endsAt<=startsAt)))return jsonError("Enter a valid appointment start time.");
  if(location.length<3)return jsonError("Enter the agreed service location.");
  const db=database(),businessId=access.membership!.business_id,now=new Date();
  const {data:job,error:jobError}=await db.from("jobs").select("id,job_number,status,appointment_id,quote_id,customer_id,user_id,guest_name,guest_email").eq("id",jobId).eq("business_id",businessId).maybeSingle();
  if(jobError||!job)return jsonError("Workcard not found.",404);
  if(["completed","cancelled"].includes(job.status))return jsonError("A closed Workcard cannot be booked.",409);
  if(job.appointment_id){
   const {data:linkedAppointment}=await db.from("appointments").select("id,status").eq("id",job.appointment_id).eq("business_id",businessId).maybeSingle();
   if(linkedAppointment&&!["cancelled","completed"].includes(linkedAppointment.status))return jsonError("This Workcard already has an active appointment. Update it from the master calendar.",409);
  }
  if(!job.quote_id)return jsonError("Create the Workcard from an accepted quote before booking.",409);
  if(job.quote_id){
   const {data:existingRequest}=await db.from("appointments").select("id,status").eq("business_id",businessId).eq("quote_id",job.quote_id).in("status",["requested","confirmed","rescheduled"]).limit(1).maybeSingle();
   if(existingRequest)return jsonError("An appointment request already exists. Accept or update it in the master calendar.",409);
  }
  let enquiryId:string|null=null,vehicleId:string|null=null;
  if(job.quote_id){
   const {data:quote}=await db.from("quotes").select("id,status,enquiry_id").eq("id",job.quote_id).eq("business_id",businessId).maybeSingle();
   if(!quote||quote.status!=="accepted")return jsonError("The linked quote must be accepted before booking.",409);
   enquiryId=quote.enquiry_id??null;
   if(enquiryId){const {data:enquiry}=await db.from("enquiries").select("vehicle_id").eq("id",enquiryId).eq("business_id",businessId).maybeSingle();vehicleId=enquiry?.vehicle_id??null;}
  }
  const {data:settingsRow}=await db.from("business_settings").select("settings").eq("business_id",businessId).maybeSingle();
  const settings=(settingsRow?.settings&&typeof settingsRow.settings==="object"?settingsRow.settings:{}) as unknown as import("@/lib/booking-rules").BookingPolicy;
  const policyError=validateBookingWindow(startsAt,endsAt,settings,now,bypassRestrictions);if(policyError)return jsonError(policyError,409);
  if(!bypassRestrictions){
   const {data:busyAppointments,error:conflictError}=await db.from("appointments").select("id,starts_at,ends_at").eq("business_id",businessId).in("status",["confirmed","rescheduled"]).not("starts_at","is",null);
   if(conflictError)return jsonError("Could not verify calendar availability.",500);
   const conflict=(busyAppointments??[]).some(existing=>bookingWindowsConflict(startsAt,endsAt,existing.starts_at,existing.ends_at,settings));
   if(conflict)return jsonError("That time conflicts with another booking or its travel buffer.",409);
  }
  const nowIso=now.toISOString();
  const {data:appointment,error}=await db.from("appointments").insert({business_id:businessId,customer_id:job.customer_id??null,user_id:job.user_id??null,quote_id:job.quote_id??null,enquiry_id:enquiryId,vehicle_id:vehicleId,guest_name:job.guest_name??null,guest_email:job.guest_email??null,starts_at:startsAt.toISOString(),ends_at:endsAt?.toISOString()??null,preferred_start:startsAt.toISOString(),preferred_end:null,location,status:"requested",confirmed_by:null,confirmed_at:null}).select("id,status,starts_at,ends_at,location,quote_id").single();
  if(error||!appointment)return jsonError("Could not create the appointment.",500);
  const {data:bookingResult,error:bookingError}=await db.rpc("update_jobcard_booking",{
   p_business_id:businessId,p_actor_user_id:access.user!.id,p_enquiry_id:enquiryId!,p_appointment_id:appointment.id,
   p_action:"confirm",p_starts_at:startsAt.toISOString(),p_ends_at:endsAt?.toISOString()??null,
   p_location:location,p_bypass_conflicts:bypassRestrictions
  });
  if(bookingError){await db.from("appointments").delete().eq("id",appointment.id).eq("business_id",businessId);const status=bookingError.code==="P0002"?404:bookingError.code==="P0001"?409:500;return jsonError(bookingError.message??"Could not create and link the appointment.",status);}
  let recipientEmail=job.guest_email??null,recipientName:string|null=null;
  if(job.user_id){const {data:customerUser}=await db.from("users").select("email,full_name").eq("id",job.user_id).maybeSingle();recipientEmail=customerUser?.email??recipientEmail;recipientName=customerUser?.full_name??null;}
  if(recipientEmail)await emitIntegrationEvent("booking.confirmed",{
   recipient:{email:recipientEmail,firstName:recipientName},customer:{email:recipientEmail,name:recipientName},
   booking:{id:bookingResult.appointment?.id??appointment.id,status:"confirmed",startsAt:startsAt.toISOString(),endsAt:endsAt?.toISOString()??null,location},
   job:{id:job.id,number:job.job_number},business:{name:"Brandon RV"},confirmedAt:new Date().toISOString()
  });
  return Response.json({appointment:bookingResult.appointment,jobId:job.id,workcardsUpdated:bookingResult.workcardsUpdated},{status:201});
 }catch(error){console.error("Calendar appointment creation failed",error);return jsonError("Could not create appointment.",500);}
}
