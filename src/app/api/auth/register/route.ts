import {createHash} from "node:crypto";
import {database,normalizeEmail,passwordHash,digest,jsonError,sameOrigin,createSession} from "@/lib/auth";
export const runtime="nodejs";
const isValidBirthDate=(value:string)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const date=new Date(value+"T00:00:00Z");return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===value&&date<=new Date();};
export async function POST(request:Request){
 if(!sameOrigin(request))return jsonError("Invalid request origin.",403);
 try{
  const body=await request.json();
  const suppliedFirstName=String(body.firstName??"").trim();
  const suppliedLastName=String(body.lastName??"").trim();
  const legacyName=String(body.fullName??"").trim();
  const nameParts=legacyName.split(/\s+/);
  const firstName=suppliedFirstName||nameParts[0]||"";
  const lastName=suppliedFirstName?suppliedLastName:(nameParts.slice(1).join(" ")||"");
  const fullName=[firstName,lastName].filter(Boolean).join(" ");
  const dateOfBirth=body.dateOfBirth?String(body.dateOfBirth):null;
  const email=normalizeEmail(String(body.email??""));
  const phone=String(body.phone??"").trim();
  const address=String(body.address??"").trim();
  const suburb=String(body.suburb??"").trim();
  const state=String(body.state??"").trim();
  const postcode=String(body.postcode??"").trim();
  const password=String(body.password??"");
  const invitationToken=String(body.invitationToken??"").trim();
  if(!firstName||!lastName||firstName.length>120||lastName.length>120||fullName.length<2||fullName.length>120)return jsonError("Enter a valid first and last name.");
  if(!email||email.length>254)return jsonError("Enter an email address.");
  if(password.length<12||password.length>128)return jsonError("Use a password between 12 and 128 characters.");
  if(phone.length>40||address.length>500||suburb.length>120||state.length>80||postcode.length>12)return jsonError("One or more contact details exceed the allowed length.");
  if(dateOfBirth&&!isValidBirthDate(dateOfBirth))return jsonError("Enter a valid date of birth.");
  const db=database();
  const ip=request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()??"unknown";
  const ipHash=createHash("sha256").update(ip).digest("hex");
  const since=new Date(Date.now()-60*60*1000).toISOString();
  const {count}=await db.from("login_attempts").select("id",{count:"exact",head:true}).eq("attempt_type","registration").eq("email",email).eq("ip_hash",ipHash).gte("attempted_at",since);
  if((count??0)>=5)return jsonError("Too many registration attempts. Try again later.",429);
  await db.from("login_attempts").insert({attempt_type:"registration",email,ip_hash:ipHash,succeeded:true});
  const {data:existing}=await db.from("users").select("id").eq("email",email).maybeSingle();
  if(existing)return jsonError("An account with that email already exists.",409);
  const {data:business,error:businessError}=await db.from("businesses").select("id").eq("slug","brandon-rv").single();
  if(businessError||!business)return jsonError("Business setup is incomplete. Please contact Brandon RV.",503);
  let staffInvitation:any=null;
  if(invitationToken){
   if(invitationToken.length<32||invitationToken.length>200)return jsonError("Invalid staff invitation link.",410);
   const {data:invite}=await db.from("staff_invitations").select("id,email,business_id,expires_at,accepted_at,revoked_at").eq("token_hash",digest(invitationToken)).maybeSingle();
   if(!invite||invite.email!==email||invite.business_id!==business.id||invite.accepted_at||invite.revoked_at||invite.expires_at<=new Date().toISOString())return jsonError("This staff invitation is invalid, expired or does not match this email address.",410);
   staffInvitation=invite;
  }
  const {data:user,error}=await db.from("users").insert({
   email,password_hash:await passwordHash(password),full_name:fullName,first_name:firstName,last_name:lastName||null,
   date_of_birth:dateOfBirth,phone:phone||null,address:address||null,suburb:suburb||null,state:state||null,postcode:postcode||null,account_type:"customer",primary_group:"customer",
   user_role:null,business_id:business.id,status:"active"
  }).select("id").single();
  if(error||!user)return jsonError("Could not create your account. Please try again.",500);
  if(staffInvitation)await createSession(user.id,request);
  return Response.json({verificationRequired:false,invitationUrl:staffInvitation?"/portal/accept-staff-invitation?token="+encodeURIComponent(invitationToken):null,message:staffInvitation?"Your customer account is ready. Continue to accept your staff invitation.":"Your customer account is ready. You can now sign in."},{status:201});
 }catch{return jsonError("Registration is temporarily unavailable.",500);}
}
