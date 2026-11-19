import { checkAlisLicense } from '../.alis/proxy-license.js';
import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {firstInstallDecision,requiresFirstOwnerSetup} from "@/lib/first-install.mjs";

const SETUP_PATH="/setup";
const BOOTSTRAP_PATH="/api/auth/bootstrap-owner";

// The first-owner guard is an installation bootstrap check, not a per-page
// authorization check. Cache the count briefly per warm function instance so
// ordinary Staff Portal navigation does not query the users table every time.
const USER_COUNT_CACHE_MS=60000;
let userCountCache:{count:number;checkedAt:number}|null=null;
let userCountPending:Promise<number>|null=null;

async function readUserCount(db:any):Promise<number>{
 if(userCountCache&&Date.now()-userCountCache.checkedAt<USER_COUNT_CACHE_MS)return userCountCache.count;
 if(userCountPending)return userCountPending;
 userCountPending=(async()=>{
  const {count,error}=await db.from("users").select("id",{count:"exact",head:true});
  if(error||count===null)throw error??new Error("User count could not be verified.");
  userCountCache=count>0?{count,checkedAt:Date.now()}:null;
  return count;
 })();
 try{return await userCountPending;}finally{userCountPending=null;}
}

function unavailableResponse(pathname:string){
 if(pathname.startsWith("/api/"))return NextResponse.json({error:"V2 database service is unavailable. Check the server configuration."},{status:503,headers:{"Cache-Control":"no-store"}});
 return new NextResponse("V2 is temporarily unavailable because the database service could not be verified.",{status:503,headers:{"Cache-Control":"no-store"}});
}

export async function proxy(request:NextRequest){
 const alisResponse = await checkAlisLicense(request);
 if (alisResponse) return alisResponse;
 const pathname=request.nextUrl.pathname;
 if(pathname===BOOTSTRAP_PATH||pathname.startsWith("/_next/")||/\.[^/]+$/.test(pathname))return NextResponse.next();

 const supabaseUrl=(process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL||"").trim();
 const serverKey=(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||"").trim();
 if(pathname===SETUP_PATH&&(!supabaseUrl||!serverKey))return NextResponse.next();
 if(!supabaseUrl||!serverKey){
  console.error("First-install guard: Supabase server credentials are missing.");
  return unavailableResponse(pathname);
 }

 try{
  const db=createClient(supabaseUrl,serverKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const count=await readUserCount(db);
  const needsFirstOwner=requiresFirstOwnerSetup(count);
  const decision=firstInstallDecision(count,pathname);
  if(decision==="unavailable")return unavailableResponse(pathname);
  if(needsFirstOwner&&decision==="setup"){
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
  return unavailableResponse(pathname);
 }
}
export const config={matcher:["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"]};
