import {jsonError,sameOrigin} from "@/lib/auth";
export const runtime="nodejs";
export async function POST(request:Request){
 if(!sameOrigin(request))return jsonError("Invalid request origin.",403);
 return jsonError("Password recovery is not available until the account-notification module is installed.",503);
}
