import {database,digest,passwordHash,jsonError,sameOrigin} from "@/lib/auth";
import {emitIntegrationEvent} from "@/lib/emit-integration-event";
export const runtime="nodejs";
export async function POST(request:Request){
 if(!sameOrigin(request))return jsonError("Invalid request origin.",403);
 try{
  const body=await request.json(),token=String(body.token??""),password=String(body.password??"");
  if(token.length<32||password.length<12||password.length>128)return jsonError("Use a valid reset link and a password between 12 and 128 characters.");
  const db=database(),{data:record}=await db.from("password_reset_tokens").select("id,user_id").eq("token_hash",digest(token)).is("used_at",null).gt("expires_at",new Date().toISOString()).maybeSingle();
  if(!record)return jsonError("This password reset link is invalid or expired.",410);
  const now=new Date().toISOString(),{error}=await db.from("users").update({password_hash:await passwordHash(password),force_password_change:false,updated_at:now}).eq("id",record.user_id);
  if(error)return jsonError("Could not update your password.",500);
  await db.from("password_reset_tokens").update({used_at:now}).eq("id",record.id);
  await db.from("user_sessions").delete().eq("user_id",record.user_id);
  try{
   const {data:user}=await db.from("users").select("email,full_name,first_name").eq("id",record.user_id).maybeSingle();
   if(user)await emitIntegrationEvent("account.password_changed",{recipient:{email:user.email,firstName:user.first_name??String(user.full_name??"").split(/\s+/)[0]??""},changedAt:now});
  }catch(error){console.error("[account-recovery] Password-change event dispatch failed.",error instanceof Error?error.message:"unknown error");}
  return Response.json({success:true,message:"Password updated. Sign in with your new password."});
 }catch{return jsonError("Password reset is temporarily unavailable.",500);}
}
