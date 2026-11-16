import {authorizePermission,database,jsonError} from "@/lib/auth";
export const runtime="nodejs";
function dateInSydney(){
 const parts=new Intl.DateTimeFormat("en-AU",{timeZone:"Australia/Sydney",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
 const value=Object.fromEntries(parts.map(part=>[part.type,part.value]));
 return value.year+"-"+value.month+"-"+value.day;
}
function validDate(value:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const parsed=new Date(value+"T00:00:00Z");
 return !Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===value;
}
export async function GET(request:Request){
 const access=await authorizePermission("reports.view");if(access.response)return access.response;
 const today=dateInSydney(),monthStart=today.slice(0,7)+"-01",url=new URL(request.url);
 const from=url.searchParams.get("from")??monthStart,to=url.searchParams.get("to")??today;
 if(!validDate(from)||!validDate(to)||from>to)return jsonError("Choose a valid report date range.");
 const {data,error}=await database().rpc("business_financial_report",{p_business_id:access.membership!.business_id,p_from:from,p_to:to});
 if(error){console.error("Business report query failed.",error);return jsonError("Could not load business reports.",500);}
 return Response.json(data);
}
