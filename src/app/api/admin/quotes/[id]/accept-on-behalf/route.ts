import {authorizePermission,database,jsonError,sameOrigin} from "@/lib/auth";
import {isUuid} from "@/lib/api-validation.mjs";
export const runtime="nodejs";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 if(!sameOrigin(request))return jsonError("Invalid request origin.",403);
 const access=await authorizePermission("quotes.accept_on_behalf");if(access.response)return access.response;
 const {id}=await params;if(!isUuid(id))return jsonError("Invalid quote ID.");
 try{const body=await request.json(),reason=String(body.reason??"").trim();if(reason.length<5||reason.length>1000)return jsonError("Enter a confirmation record between 5 and 1,000 characters.");
 const {data,error}=await database().rpc("accept_quote_on_behalf",{p_quote_id:id,p_business_id:access.membership!.business_id,p_actor_user_id:access.user!.id,p_reason:reason});
 if(error){const status=error.code==="42501"?403:error.code==="P0001"?409:error.code==="22023"?400:500;return jsonError(error.message??"Could not record quote acceptance.",status);}return Response.json(data);
 }catch{return jsonError("Could not record quote acceptance.",500);}
}
