import {database,normalizeEmail,passwordHash,createSession,jsonError,sameOrigin} from "@/lib/auth";
export const runtime="nodejs";
export async function POST(request:Request){
 if(!sameOrigin(request))return jsonError("Invalid request origin.",403);
 const supabaseUrl=process.env.SUPABASE_URL??process.env.NEXT_PUBLIC_SUPABASE_URL;
 const serverKey=process.env.SUPABASE_SECRET_KEY??process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!supabaseUrl||!serverKey)return jsonError("V2 Supabase server credentials are not configured.",503);
 try{
  const body=await request.json(),email=normalizeEmail(String(body.email??"")),fullName=String(body.fullName??"").trim(),password=String(body.password??"");
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||fullName.length<2||fullName.length>160||password.length<12||password.length>128)return jsonError("Provide a valid name, email and password of at least 12 characters.");
  const {data,error}=await database().rpc("bootstrap_first_owner",{p_email:email,p_full_name:fullName,p_password_hash:await passwordHash(password)});
  if(error){
   if(error.code==="P0001"||error.code==="23505")return jsonError("Initial owner setup has already been completed.",409);
   if(error.code==="P0002")return jsonError(error.message??"Business owner setup is incomplete.",503);
   if(error.code==="22023")return jsonError(error.message??"Provide valid owner details.");
   console.error("Atomic first-owner creation failed.",error);
   return jsonError("Could not create the first owner account.",503);
  }
  const user=data?.user;
  if(!user?.id)return jsonError("Owner account creation returned an invalid result.",500);
  await createSession(user.id,request);
  return Response.json({user:{...user,account_type:"customer"}},{status:201});
 }catch(error){console.error("First-owner bootstrap failed.",error);return jsonError("Owner setup failed. Check the V2 Supabase server credentials and database configuration.",503);}
}
