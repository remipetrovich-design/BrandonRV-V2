import {createHash} from "node:crypto";
import {database,digest,newToken,normalizeEmail,jsonError,sameOrigin} from "@/lib/auth";
import {dispatchIntegrationEvent} from "@/lib/integration-runtime";
export const runtime="nodejs";
const genericMessage="If an active account matches those details and account recovery is available, instructions will be sent.";
export async function POST(request:Request){
 if(!sameOrigin(request))return jsonError("Invalid request origin.",403);
 try{
  const body=await request.json(),email=normalizeEmail(String(body.email??""));
  if(!email||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return jsonError("Enter a valid email address.");
  const db=database(),ip=request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()??"unknown",ipHash=createHash("sha256").update(ip).digest("hex");
  const since=new Date(Date.now()-60*60*1000).toISOString();
  const {count}=await db.from("login_attempts").select("id",{count:"exact",head:true}).eq("attempt_type","password_reset").eq("email",email).eq("ip_hash",ipHash).gte("attempted_at",since);
  if((count??0)>=5)return jsonError("Too many account recovery attempts. Try again later.",429);
  await db.from("login_attempts").insert({attempt_type:"password_reset",email,ip_hash:ipHash,succeeded:true});
  const {data:user,error}=await db.from("users").select("id,email,full_name,first_name,status,primary_group").eq("email",email).eq("status","active").maybeSingle();
  if(error||!user||user.primary_group!=="customer")return Response.json({success:true,message:genericMessage});
  const token=newToken(),expiresAt=new Date(Date.now()+60*60*1000).toISOString();
  await db.from("password_reset_tokens").delete().eq("user_id",user.id);
  const {error:tokenError}=await db.from("password_reset_tokens").insert({user_id:user.id,token_hash:digest(token),expires_at:expiresAt});
  if(tokenError){console.error("[account-recovery] Could not create reset token.");return Response.json({success:true,message:genericMessage});}
  const base=(process.env.NEXT_PUBLIC_APP_URL?.trim()||new URL(request.url).origin).replace(/\/+$/g,"");
  const resetUrl=base+"/portal/reset-password?token="+encodeURIComponent(token);
  try{
   const results=await dispatchIntegrationEvent("account.password_reset_requested",{recipient:{email:user.email,firstName:user.first_name??String(user.full_name??"").split(/\s+/)[0]??""},resetUrl,expiresAt});
   if(!results.length||results.some(result=>!result.ok))console.warn("[account-recovery] No successful account recovery notification handler was available.");
  }catch(error){console.error("[account-recovery] Notification dispatch failed.",error instanceof Error?error.message:"unknown error");}
  return Response.json({success:true,message:genericMessage});
 }catch(error){
  console.error("[account-recovery] Request could not be processed.",error instanceof Error?error.message:"unknown error");
  return Response.json({success:true,message:genericMessage});
 }
}
