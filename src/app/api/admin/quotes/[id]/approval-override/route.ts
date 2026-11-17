import {authorizePermission,database,jsonError,sameOrigin,userHasPermission} from "@/lib/auth";
import {isUuid} from "@/lib/api-validation.mjs";
export const runtime="nodejs";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const access=await authorizePermission("quotes.view");if(access.response)return access.response;
 const {id}=await params;if(!isUuid(id))return jsonError("Invalid quote ID.");
 const {data:quote}=await database().from("quotes").select("id,status,quote_kind,customer_approval_bypassed_at,customer_approval_bypass_reason").eq("id",id).eq("business_id",access.membership!.business_id).maybeSingle();
 if(!quote)return jsonError("Quote not found.",404);
 return Response.json({quote,canBypass:await userHasPermission(access.user!.id,"workflow.bypass_customer_approval")});
}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 if(!sameOrigin(request))return jsonError("Invalid request origin.",403);
 const access=await authorizePermission("workflow.bypass_customer_approval");if(access.response)return access.response;
 const {id}=await params;if(!isUuid(id))return jsonError("Invalid quote ID.");
 try{const body=await request.json(),reason=String(body.reason??"").trim();if(reason.length<5||reason.length>2000)return jsonError("Provide a reason between 5 and 2,000 characters.");
 const {data,error}=await database().rpc("bypass_quote_customer_approval",{p_quote_id:id,p_business_id:access.membership!.business_id,p_actor_user_id:access.user!.id,p_reason:reason});
 if(error){const status=error.code==="42501"?403:error.code==="P0001"?409:error.code==="22023"?400:500;return jsonError(error.message||"Could not bypass quote approval.",status);}
 return Response.json(data);
 }catch{return jsonError("Could not bypass quote approval.",500);}
}