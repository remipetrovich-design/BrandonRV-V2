import {authorizePermission,database,jsonError,sameOrigin} from "@/lib/auth";
import {isUuid} from "@/lib/api-validation.mjs";
export const runtime="nodejs";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 if(!sameOrigin(request))return jsonError("Invalid request origin.",403);
 const access=await authorizePermission("suppliers.manage");if(access.response)return access.response;
 const {id}=await params;if(!isUuid(id))return jsonError("Supplier order not found.",404);
 try{
  const body=await request.json(),itemId=String(body.itemId??""),quantity=Number(body.quantity);
  if(!isUuid(itemId)||!Number.isFinite(quantity)||quantity<=0)return jsonError("Enter a valid received quantity.");
  const {data,error}=await database().rpc("receive_supplier_order_item",{p_business_id:access.membership!.business_id,p_order_id:id,p_item_id:itemId,p_actor_user_id:access.user!.id,p_quantity:quantity});
  if(error){if(error.code==="P0001"||error.code==="P0002")return jsonError(error.message??"This supplier order line cannot be received.",409);if(error.code==="22023")return jsonError(error.message??"Enter a valid received quantity.");return jsonError("Could not record received goods. No changes were made.",500);}
  return Response.json(data);
 }catch(error){console.error("Supplier goods receipt failed.",error);return jsonError("Could not record received goods.",500);}
}
