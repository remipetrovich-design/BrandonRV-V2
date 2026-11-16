import {authorizePermission,database,jsonError,sameOrigin} from "@/lib/auth";
import {isUuid} from "@/lib/api-validation.mjs";
export const runtime="nodejs";
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
 if(!sameOrigin(request))return jsonError("Invalid request origin.",403);
 const access=await authorizePermission("suppliers.manage");if(access.response)return access.response;
 const {id}=await params;if(!isUuid(id))return jsonError("Supplier order not found.",404);
 try{
  const body=await request.json(),status=String(body.status??"");
  if(!["ordered","cancelled"].includes(status))return jsonError("Choose mark ordered or cancel.");
  const {data,error}=await database().rpc("transition_supplier_order",{p_business_id:access.membership!.business_id,p_order_id:id,p_actor_user_id:access.user!.id,p_next_status:status});
  if(error){if(error.code==="P0001"||error.code==="P0002")return jsonError(error.message??"Supplier order can no longer be changed.",409);return jsonError("Could not update supplier order. No changes were made.",500);}
  return Response.json(data);
 }catch(error){console.error("Supplier order transition failed.",error);return jsonError("Could not update supplier order.",500);}
}
