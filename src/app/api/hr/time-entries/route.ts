import {authorizePermission,database,jsonError,sameOrigin,userHasPermission} from "@/lib/auth";
export const runtime="nodejs";
export async function GET(){
 const access=await authorizePermission("time.view");if(access.response)return access.response;
 const db=database(),businessId=access.membership!.business_id,canManage=await userHasPermission(access.user!.id,"time.manage");
 let query=db.from("time_entries").select("id,staff_id,job_id,work_entry_id,entry_type,started_at,ended_at,duration_minutes,notes,approved_at,approved_by").eq("business_id",businessId).not("ended_at","is",null).order("started_at",{ascending:false}).limit(200);
 if(!canManage){
  const {data:staff}=await db.from("staff").select("id").eq("business_id",businessId).eq("user_id",access.user!.id).eq("employment_status","active").maybeSingle();
  if(!staff)return jsonError("Active employee profile not found.",404);
  query=query.eq("staff_id",staff.id);
 }
 const {data,error}=await query;if(error)return jsonError("Could not load completed time entries.",500);
 const entries=data??[],staffIds=[...new Set(entries.map(x=>x.staff_id))],jobIds=[...new Set(entries.map(x=>x.job_id).filter((id):id is string=>Boolean(id)))],workEntryIds=[...new Set(entries.map(x=>x.work_entry_id).filter((id):id is string=>Boolean(id)))];
 const [staffResult,jobsResult,workEntriesResult]=await Promise.all([
  staffIds.length?db.from("staff").select("id,user_id").eq("business_id",businessId).in("id",staffIds):Promise.resolve({data:[],error:null}),
  jobIds.length?db.from("jobs").select("id,job_number,title").eq("business_id",businessId).in("id",jobIds):Promise.resolve({data:[],error:null}),
  workEntryIds.length?db.from("job_work_entries").select("id,description").eq("business_id",businessId).in("id",workEntryIds):Promise.resolve({data:[],error:null})
 ]);
 if(staffResult.error||jobsResult.error||workEntriesResult.error)return jsonError("Could not load time entry context.",500);
 const userIds=[...new Set((staffResult.data??[]).map(x=>x.user_id))];
 const usersResult=userIds.length?await db.from("users").select("id,full_name,email").eq("business_id",businessId).in("id",userIds):{data:[],error:null};
 if(usersResult.error)return jsonError("Could not load employee names.",500);
 const staffById=new Map<string,string>((staffResult.data??[]).map(x=>[x.id,x.user_id]));
 const userById=new Map<string,{id:string;full_name:string|null;email:string}>((usersResult.data??[]).map(x=>[x.id,x]));
 const jobById=new Map<string,{id:string;job_number:string;title:string}>((jobsResult.data??[]).map(x=>[x.id,x]));
 const workById=new Map<string,{id:string;description:string}>((workEntriesResult.data??[]).map(x=>[x.id,x]));
 return Response.json({canManage,entries:entries.map(entry=>{
  const userId=staffById.get(entry.staff_id);
  return {...entry,employee:userId?userById.get(userId)??null:null,job:entry.job_id?jobById.get(entry.job_id)??null:null,workEntry:entry.work_entry_id?workById.get(entry.work_entry_id)??null:null};
 })});
}
export async function PATCH(request:Request){
 if(!sameOrigin(request))return jsonError("Invalid request origin.",403);
 const access=await authorizePermission("time.manage");if(access.response)return access.response;
 try{
  const body=await request.json(),id=String(body.id??"");
  if(!/^[0-9a-f-]{36}$/i.test(id)||typeof body.approved!=="boolean")return jsonError("Choose a valid time entry and approval decision.");
  const {data,error}=await database().rpc("approve_work_time_entry",{p_business_id:access.membership!.business_id,p_time_entry_id:id,p_actor_user_id:access.user!.id,p_approved:body.approved});
  if(error){if(error.code==="P0001")return jsonError(error.message??"This time entry cannot be approved.",409);return jsonError("Could not update time approval. No changes were made.",500);}
  return Response.json(data);
 }catch(error){console.error("Time entry approval failed.",error);return jsonError("Could not update time approval.",500);}
}
