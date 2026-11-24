import {authorizePermission,database,digest,newToken,jsonError,sameOrigin} from "@/lib/auth";
export const runtime="nodejs";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 if(!sameOrigin(request))return jsonError("Invalid request origin.",403);
 const access=await authorizePermission("customers.manage");if(access.response)return access.response;
 const {id}=await params;if(!/^[0-9a-f-]{36}$/i.test(id))return jsonError("Customer not found.",404);
 const db=database();const {data:customer}=await db.from("customers").select("id,user_id,full_name,email").eq("id",id).eq("business_id",access.membership!.business_id).maybeSingle();
 if(!customer?.user_id)return jsonError("This customer does not have a portal account.",404);
 const {data:user}=await db.from("users").select("id,email,full_name,status").eq("id",customer.user_id).eq("status","active").maybeSingle();
 if(!user)return jsonError("This customer account is not active.",409);
 const token=newToken();const tokenHash=digest(token);const expiresAt=new Date(Date.now()+60*60*1000).toISOString();
 await db.from("password_reset_tokens").delete().eq("user_id",user.id);
 const {error}=await db.from("password_reset_tokens").insert({user_id:user.id,token_hash:tokenHash,expires_at:expiresAt});
 if(error)return jsonError("Could not create a password reset link.",500);
 const base=process.env.NEXT_PUBLIC_APP_URL??new URL(request.url).origin;const resetUrl=base+"/portal/reset-password?token="+encodeURIComponent(token);
 const safeName=String(user.full_name??customer.full_name??"Customer").replace(/[&<>"]/g,"");
 await db.from("audit_events").insert({business_id:access.membership!.business_id,actor_user_id:access.user!.id,action:"customer.password_reset_link_created",entity_type:"customer",entity_id:customer.id,details:{delivery:"manual_link",expires_at:expiresAt}});
 return Response.json({resetUrl,emailSent:false,expiresAt});
}