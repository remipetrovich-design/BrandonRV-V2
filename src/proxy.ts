import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {requiresFirstOwnerSetup} from "@/lib/first-install.mjs";

const SETUP_PATH="/setup";
const BOOTSTRAP_PATH="/api/auth/bootstrap-owner";

export async function proxy(request:NextRequest){
 const pathname=request.nextUrl.pathname;
 if(pathname===SETUP_PATH||pathname===BOOTSTRAP_PATH||pathname.startsWith("/_next/")||/\.[^/]+$/.test(pathname)){
  return NextResponse.next();
 }
 const supabaseUrl=process.env.SUPABASE_URL;
 const serviceRoleKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!supabaseUrl||!serviceRoleKey){
  console.error("First-install guard: Supabase server configuration is missing.");
  return NextResponse.next();
 }
 try{
  const db=createClient(supabaseUrl,serviceRoleKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const {count,error}=await db.from("users").select("id",{count:"exact",head:true});
  if(error)throw error;
  if(!requiresFirstOwnerSetup(count))return NextResponse.next();
  if(pathname.startsWith("/api/")){
   return NextResponse.json({error:"Complete first-time owner setup before using the application."},{status:503});
  }
  const setupUrl=request.nextUrl.clone();
  setupUrl.pathname=SETUP_PATH;
  setupUrl.search="";
  return NextResponse.redirect(setupUrl);
 }catch(error){
  console.error("First-install guard could not verify the account state.",error);
  return NextResponse.next();
 }
}

export const config={
 matcher:["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"]
};
