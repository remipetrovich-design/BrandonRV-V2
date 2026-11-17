import {authorizePermission,database,jsonError,sameOrigin} from "@/lib/auth";
export const runtime="nodejs";

export async function GET(request:Request){
 const access=await authorizePermission("jobs.manage");if(access.response)return access.response;
 const db=database(),businessId=access.membership!.business_id,quoteId=new URL(request.url).searchParams.get("quoteId");
 let query=db.from("quotes").select("id,quote_number,total,status,revision_number,customer_approval_bypassed_at,customer_approval_bypass_reason,enquiry_id,quote_items(description,quantity,unit_price),users!quotes_user_id_users_fkey(full_name),enquiries!quotes_enquiry_id_fkey(contact_name,request_number,request_type,archived_at)").eq("business_id",businessId).eq("quote_kind","standard").eq("status","accepted").not("enquiry_id","is",null).order("updated_at",{ascending:false});
 if(quoteId)query=query.eq("id",quoteId);
 const [{data:quotes,error},{data:jobs,error:jobsError}]=await Promise.all([
  query,
  db.from("jobs").select("id,quote_id,job_number,title,status,senior_approval_status,workcard_review_status").eq("business_id",businessId).not("quote_id","is",null)
 ]);
 if(error||jobsError)return jsonError("Could not load accepted quotes and Workcards.",500);
 const availableQuotes=(quotes??[]).filter((quote:any)=>quote.enquiries?.request_type==="quote_request"&&!quote.enquiries?.archived_at);
 const jobsByQuote=new Map((jobs??[]).map(job=>[job.quote_id,job]));
 const quoteIds=availableQuotes.map(q=>q.id);
 const {data:appointments,error:appointmentError}=quoteIds.length?await db.from("appointments").select("id,quote_id,status,starts_at,preferred_start,location").eq("business_id",businessId).in("quote_id",quoteIds).eq("status","confirmed").order("starts_at",{ascending:true}):{data:[],error:null};
 if(appointmentError)return jsonError("Could not load confirmed bookings.",500);
 const bookingByQuote=new Map((appointments??[]).map(a=>[a.quote_id,a]));
 return Response.json({acceptedQuotes:availableQuotes.map(q=>({...q,existingWorkcard:jobsByQuote.get(q.id)??null,confirmedBooking:bookingByQuote.get(q.id)??null})),existingWorkcard:quoteId?jobsByQuote.get(quoteId)??null:null});
}

export async function POST(request:Request){
 if(!sameOrigin(request))return jsonError("Invalid request origin.",403);
 const access=await authorizePermission("jobs.manage");if(access.response)return access.response;
 try{
  const body=await request.json(),quoteId=String(body.quoteId??"");
  if(!/^[0-9a-f-]{36}$/i.test(quoteId))return jsonError("Select a customer-accepted quote.");
  const title=String(body.title??"").trim().slice(0,180)||null;
  const scope=String(body.scope??"").trim().slice(0,5000)||null;
  const jobNumber="BRV-WC-"+new Date().toISOString().slice(2,10).replaceAll("-","")+"-"+crypto.randomUUID().replaceAll("-","").slice(0,8).toUpperCase();
  const db=database(),businessId=access.membership!.business_id;
  const {data,error}=await db.rpc("create_workcard_from_accepted_quote",{
   p_business_id:businessId,
   p_quote_id:quoteId,
   p_actor_user_id:access.user!.id,
   p_job_number:jobNumber,
   p_title:title,
   p_scope:scope
  });
  if(error){
   console.error("Atomic Workcard conversion failed",error);
   const status=error.code==="P0001"?409:error.code==="22023"?400:500;
   return jsonError(status===409?"This accepted quote cannot currently be converted into a Workcard. Check the linked Jobcard and existing Workcard.":status===400?"The accepted quote does not contain valid Workcard details.":"Could not create Workcard.",status);
  }
  if(!data?.job)return jsonError("Workcard conversion returned an incomplete result.",500);
  return Response.json({job:data.job,alreadyCreated:Boolean(data.alreadyCreated)},{status:data.alreadyCreated?200:201});
 }catch(error){
  console.error("Workcard creation failed",error);
  return jsonError("Could not create Workcard.",500);
 }
}
