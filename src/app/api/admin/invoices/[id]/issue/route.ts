import {currentUser,currentMembership,database,userHasPermission,jsonError,sameOrigin} from "@/lib/auth";
export const runtime="nodejs";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 if(!sameOrigin(request))return jsonError("Invalid request origin.",403);
 const user=await currentUser();if(!user)return jsonError("Not signed in.",401);
 const membership=await currentMembership(user.id);if(!membership||!(await userHasPermission(user.id,"invoices.manage")))return jsonError("You do not have permission to issue invoices.",403);
 const {id}=await params;if(!/^[0-9a-f-]{36}$/i.test(id))return jsonError("Invalid invoice ID.");
 const {data,error}=await database().rpc("issue_invoice",{p_invoice_id:id,p_business_id:membership.business_id,p_actor_user_id:user.id});
 if(error){if(error.code==="P0002")return jsonError(error.message??"Invoice not found.",404);if(error.code==="P0001")return jsonError(error.message??"Invoice is not ready to issue.",409);return jsonError("Could not issue invoice. No changes were made.",500);}
 return Response.json(data);
}
