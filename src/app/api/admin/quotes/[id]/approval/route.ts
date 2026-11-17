import {authorizePermission,database,jsonError,sameOrigin} from "@/lib/auth";
import {canOverrideQuoteSelfReview} from "@/lib/user-role-policy.mjs";
export const runtime="nodejs";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const primary=await authorizePermission("quotes.approve");let access=primary,workcardOnly=false;if(primary.response){const alternate=await authorizePermission("jobs.approve");if(alternate.response)return primary.response;access=alternate;workcardOnly=true;}
 const {id}=await params;
 const {data:quote,error}=await database().from("quotes").select("id,quote_number,status,quote_kind,prepared_by,senior_approval_status,senior_approved_by,senior_approved_at,senior_approval_note,issue_date").eq("id",id).eq("business_id",access.membership!.business_id).maybeSingle();
 if(error||!quote)return jsonError("Quote not found.",404);
 if(workcardOnly&&quote.quote_kind!=="variation")return jsonError("Quote approval permission is required for standard quotes.",403);
 return Response.json({quote,preparedByCurrentUser:quote.prepared_by===access.user!.id,canOverrideSelfReview:canOverrideQuoteSelfReview(access.user!.user_role)});
}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 if(!sameOrigin(request))return jsonError("Invalid request origin.",403);
 const primary=await authorizePermission("quotes.approve");let access=primary,workcardOnly=false;if(primary.response){const alternate=await authorizePermission("jobs.approve");if(alternate.response)return primary.response;access=alternate;workcardOnly=true;}
 try{
  const {id}=await params,body=await request.json(),decision=String(body.decision??""),note=String(body.note??"").trim().slice(0,2000);
  const {data:target}=await database().from("quotes").select("quote_kind").eq("id",id).eq("business_id",access.membership!.business_id).maybeSingle();
  if(!target)return jsonError("Quote not found.",404);
  if(workcardOnly&&target.quote_kind!=="variation")return jsonError("Quote approval permission is required for standard quotes.",403);
  if(!["approved","changes_requested"].includes(decision))return jsonError("Choose approve or request changes.");
  if(decision==="changes_requested"&&note.length<5)return jsonError("Describe the quote changes required.");
  const {data,error}=await database().rpc("review_quote",{p_quote_id:id,p_business_id:access.membership!.business_id,p_actor_user_id:access.user!.id,p_decision:decision,p_note:note||null});
  if(error){if(error.code==="P0001")return jsonError(error.message??"This quote is not awaiting senior review.",409);return jsonError("Could not record senior review. No changes were made.",500);}
  return Response.json(data);
 }catch{return jsonError("Could not review quote.",500);}
}
