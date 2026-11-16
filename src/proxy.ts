import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {firstInstallDecision} from "@/lib/first-install.mjs";

const SETUP_PATH="/setup";
const BOOTSTRAP_PATH="/api/auth/bootstrap-owner";

function unavailableResponse(pathname:string){
 if(pathname.startsWith("/api/"))return NextResponse.json({error:"V2 database service is unavailable. Check the server configuration."},{status:503,headers:{"Cache-Control":"no-store"}});
 return new NextResponse("V2 is temporarily unavailable because the database service could not be verified.",{status:503,headers:{"Cache-Control":"no-store"}});
}

export async function proxy(request:NextRequest){
 const pathname=request.nextUrl.pathname;
 if(pathname===BOOTSTRAP_PATH||pathname.startsWith("/_next/")||/\.[^/]+$/.test(pathname))return NextResponse.next();

 const supabaseUrl=process.env.SUPABASE_URL??process.env.NEXT_PUBLIC_SUPABASE_URL;
 const serverKey=process.env.SUPABASE_SECRET_KEY??process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(pathname===SETUP_PATH&&(!supabaseUrl||!serverKey))return NextResponse.next();
 if(!supabaseUrl||!serverKey){
  console.error("First-install guard: Supabase server credentials are missing.");
  return unavailableResponse(pathname);
 }

 try{
  const db=createClient(supabaseUrl,serverKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const {count,error}=await db.from("users").select("id",{count:"exact",head:true});
  if(error||count===null)throw error??new Error("User count could not be verified.");
  const decision=firstInstallDecision(count,pathname);
  if(decision==="unavailable")return unavailableResponse(request,pathname);
  if(decision==="setup"){
   if(pathname.startsWith("/api/"))return NextResponse.json({error:"Complete first-time owner setup before using the application."},{status:503,headers:{"Cache-Control":"no-store"}});
   const setupUrl=request.nextUrl.clone();setupUrl.pathname=SETUP_PATH;setupUrl.search="";
   return NextResponse.redirect(setupUrl);
  }
  if(decision==="sign-in"){
   const signInUrl=request.nextUrl.clone();signInUrl.pathname="/portal/sign-in";signInUrl.search="";
   return NextResponse.redirect(signInUrl);
  }
  return NextResponse.next();
 }catch(error){
  console.error("First-install guard could not verify the account state.",error);
  if(pathname===SETUP_PATH)return NextResponse.next();
  return unavailableResponse(request,pathname);
 }
}
export const config={matcher:["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"]};
