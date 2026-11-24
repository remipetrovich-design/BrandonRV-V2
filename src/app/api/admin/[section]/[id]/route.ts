import {currentUser,currentMembership,database,userHasPermission,jsonError,sameOrigin} from "@/lib/auth";
import {validateBookingWindow} from "@/lib/booking-rules";
import {bookingWindowsConflict} from "@/lib/booking-window-policy.mjs";
export const runtime="nodejs";
const config:any={
 enquiries:{table:"enquiries",permission:"enquiries.manage",status:["new","reviewing","quoted","accepted","declined","converted","closed"],fields:["status","internal_notes"]},
 appointments:{table:"appointments",permission:"appointments.manage",status:["requested","confirmed","rescheduled","completed","cancelled"],fields:["status","starts_at","ends_at","location","internal_notes"]},
 jobs:{table:"jobs",permission:"jobs.manage",status:["pending","scheduled","waiting_parts","cancelled"],fields:["status","priority","scheduled_start","scheduled_end","customer_visible_notes","internal_notes","estimated_hours"]},
 quotes:{table:"quotes",permission:"quotes.manage",status:["draft","sent","expired"],fields:["status"]},
 invoices:{table:"invoices",permission:"invoices.manage",status:["draft","issued","void"],fields:["status"]},
 customers:{table:"customers",permission:"customers.manage",status:["active","inactive"],fields:["status"]},
 suppliers:{table:"suppliers",permission:"suppliers.manage",fields:["is_active","notes"]},
 website:{table:"site_pages",permission:"website.manage",fields:["is_published","title","content","meta_title","meta_description"]}
};
export async function PATCH(request:Request,{params}:{params:Promise<{section:string;id:string}>}){
 if(!sameOrigin(request))return jsonError("Invalid request origin.",403);const user=await currentUser();if(!user)return jsonError("Not signed in.",401);const membership=await currentMembership(user.id);if(!membership)return jsonError("Business access required.",403);
 const {section,id}=await params;const c=config[section];if(!c||!/^[0-9a-f-]{36}$/i.test(id))return jsonError("Record not found.",404);
 if(!(await userHasPermission(user.id,c.permission)))return jsonError("You do not have permission to update this record.",403);
 try{
  const body=await request.json();const update:any={};
  for(const field of c.fields){if(body[field]===undefined)continue;const value=body[field];
   if(field==="status"){if(!c.status?.includes(String(value)))return jsonError("Invalid status.");update.status=String(value);}
   else if(field==="is_active"||field==="is_published"){if(typeof value!=="boolean")return jsonError("Invalid setting.");update[field]=value;}
   else if(["starts_at","ends_at","scheduled_start","scheduled_end"].includes(field)){if(value!==null&&!Number.isFinite(Date.parse(String(value))))return jsonError("Enter a valid date and time.");update[field]=value?new Date(String(value)).toISOString():null;}
   else if(field==="content"){if(!value||typeof value!=="object"||Array.isArray(value)||JSON.stringify(value).length>30000)return jsonError("Page content must be a JSON object under 30 KB.");update.content=value;}
   else if(field==="estimated_hours"){const n=Number(value);if(!Number.isFinite(n)||n<0||n>1000)return jsonError("Enter valid estimated hours.");update[field]=n;}
   else if(field==="priority"){if(!["low","normal","high","urgent"].includes(String(value)))return jsonError("Invalid priority.");update[field]=String(value);}
   else if(typeof value==="string")update[field]=value.trim().slice(0,5000)||null;
  }
  if(!Object.keys(update).length)return jsonError("No valid changes supplied.");
  const db=database();
  let quoteIssued=false;
  if(section==="quotes"&&update.status==="sent"){
   const {data:issued,error:issueError}=await db.rpc("issue_quote_for_jobcard",{p_quote_id:id,p_business_id:membership.business_id,p_actor_user_id:user.id});
   if(issueError){if(issueError.code==="P0001")return jsonError("This quote or Jobcard is no longer available for issue.",409);return jsonError("Could not issue quote. No changes were made.",500);}
   if(!issued?.success)return jsonError("Could not confirm quote issue. No changes were made.",500);
   quoteIssued=true;
  }
  let appointment:any=null;let quote:any=null;let linkedWorkcard:any=null;
  if(section==="appointments"&&["confirmed","rescheduled"].includes(String(update.status??""))){
   const result=await db.from("appointments").select("id,business_id,customer_id,user_id,quote_id,enquiry_id,location,starts_at,ends_at,preferred_start,preferred_end,guest_name,guest_email,confirmed_by,confirmed_at,updated_at").eq("id",id).eq("business_id",membership.business_id).maybeSingle();
   appointment=result.data;
   if(result.error||!appointment)return jsonError("Could not load the appointment.",404);
   const startsAt=new Date(String(update.starts_at??appointment.starts_at??appointment.preferred_start??""));
   const endValue=update.ends_at!==undefined?update.ends_at:null;
   const endsAt=endValue?new Date(String(endValue)):null;
   const location=String(update.location??appointment.location??"").trim();
   const bypassRestrictions=await userHasPermission(user.id,"appointments.override_scheduling_restrictions");
   if(!location||!Number.isFinite(startsAt.getTime())||(endsAt&&(!Number.isFinite(endsAt.getTime())||endsAt<=startsAt)))return jsonError("Set a valid booking start time and service location.");
   if(appointment.quote_id){
    const quoteResult=await db.from("quotes").select("id,quote_number,status,enquiry_id").eq("id",appointment.quote_id).eq("business_id",membership.business_id).maybeSingle();quote=quoteResult.data;
    if(!quote||quote.status!=="accepted")return jsonError("The linked quote must be accepted before confirming this booking.",409);
    const byQuote=await db.from("jobs").select("id,job_number,appointment_id,status").eq("business_id",membership.business_id).eq("quote_id",quote.id).maybeSingle();
    linkedWorkcard=byQuote.data;
   }else{
    const byAppointment=await db.from("jobs").select("id,job_number,appointment_id,status").eq("business_id",membership.business_id).eq("appointment_id",id).maybeSingle();
    linkedWorkcard=byAppointment.data;
   }
   if(!linkedWorkcard)return jsonError("Create the Workcard from the accepted quote before confirming its booking.",409);
   if(linkedWorkcard.appointment_id&&linkedWorkcard.appointment_id!==id)return jsonError("This Workcard is already linked to another appointment.",409);
   const {data:settingsRow}=await db.from("business_settings").select("settings").eq("business_id",membership.business_id).maybeSingle();
   const settings=(settingsRow?.settings&&typeof settingsRow.settings==="object"?settingsRow.settings:{}) as unknown as import("@/lib/booking-rules").BookingPolicy;
   const policyError=validateBookingWindow(startsAt,endsAt,settings,new Date(),bypassRestrictions);if(policyError)return jsonError(policyError,409);
   if(!bypassRestrictions){
    const {data:busyAppointments,error:conflictError}=await db.from("appointments").select("id,starts_at,ends_at").eq("business_id",membership.business_id).neq("id",id).in("status",["confirmed","rescheduled"]).not("starts_at","is",null);
    if(conflictError)return jsonError("Could not verify calendar availability.",500);
    const conflict=(busyAppointments??[]).some(existing=>bookingWindowsConflict(startsAt,endsAt,existing.starts_at,existing.ends_at,settings));
    if(conflict)return jsonError("That time conflicts with another booking or its travel buffer.",409);
   }
   update.starts_at=startsAt.toISOString();update.ends_at=endsAt?.toISOString()??null;update.location=location;
   if(update.status==="confirmed"){update.confirmed_by=user.id;update.confirmed_at=new Date().toISOString();}
   const enquiryId=quote?.enquiry_id??appointment.enquiry_id;
   if(!enquiryId)return jsonError("This calendar booking must be linked to a customer Jobcard.",409);
   const {data:bookingResult,error:bookingError}=await db.rpc("update_jobcard_booking",{
    p_business_id:membership.business_id,p_actor_user_id:user.id,p_enquiry_id:enquiryId,p_appointment_id:id,
    p_action:update.status==="confirmed"?"confirm":"reschedule",
    p_starts_at:update.starts_at,p_ends_at:update.ends_at,p_location:update.location,
    p_bypass_conflicts:bypassRestrictions
   });
   if(bookingError){const status=bookingError.code==="P0002"?404:bookingError.code==="P0001"?409:bookingError.code==="22023"?400:500;return jsonError(bookingError.message??"Could not update the booking and linked Workcard.",status);}
   return Response.json({success:true,emailSent:false,workcardLinked:(bookingResult?.workcardsUpdated??0)>0,booking:bookingResult});
  }
  if(section==="appointments"&&update.status==="cancelled"){
   const {data:appointment,error:appointmentError}=await db.from("appointments").select("id,enquiry_id,quote_id").eq("id",id).eq("business_id",membership.business_id).maybeSingle();
   if(appointmentError||!appointment)return jsonError("Could not load the appointment.",404);
   let enquiryId=appointment.enquiry_id??null;
   if(!enquiryId&&appointment.quote_id){
    const {data:quote}=await db.from("quotes").select("enquiry_id").eq("id",appointment.quote_id).eq("business_id",membership.business_id).maybeSingle();
    enquiryId=quote?.enquiry_id??null;
   }
   if(!enquiryId)return jsonError("This calendar booking must be linked to a customer Jobcard.",409);
   const {data:bookingResult,error:bookingError}=await db.rpc("update_jobcard_booking",{
    p_business_id:membership.business_id,p_actor_user_id:user.id,p_enquiry_id:enquiryId,p_appointment_id:id,
    p_action:"cancel",p_starts_at:null,p_ends_at:null,p_location:null,p_bypass_conflicts:false
   });
   if(bookingError){const status=bookingError.code==="P0002"?404:bookingError.code==="P0001"?409:500;return jsonError(bookingError.message??"Could not cancel the booking and update its Workcard.",status);}
   return Response.json({success:true,emailSent:false,workcardLinked:(bookingResult?.workcardsUpdated??0)>0,booking:bookingResult});
  }
  update.updated_at=new Date().toISOString();
  let record:any={id};
  if(!quoteIssued){
   const result=await db.from(c.table).update(update).eq("id",id).eq("business_id",membership.business_id).select("id").maybeSingle();
   if(result.error||!result.data)return jsonError("Could not update record. Check the record and your permissions.",500);
   record=result.data;
   await db.from("audit_events").insert({business_id:membership.business_id,actor_user_id:user.id,action:section+".updated",entity_type:section,entity_id:id,details:update});
  }

  return Response.json({success:true,emailSent:false});
 }catch{return jsonError("Could not update record.",500);}
}