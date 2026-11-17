import {currentUser,jsonError,sameOrigin} from "@/lib/auth";
import {isGlobalAdministrator} from "@/lib/user-role-policy.mjs";
export const runtime="nodejs";export const dynamic="force-dynamic";
const REPO="remipetrovich-design/BrandonRV-V2";
export async function GET(request:Request){
 if(!sameOrigin(request))return jsonError("Invalid request origin.",403);
 const user=await currentUser();if(!user)return jsonError("Not signed in.",401);
 if(!isGlobalAdministrator(String(user.user_role??"").toLowerCase()))return jsonError("Not authorised.",403);
 const token=process.env.GITHUB_ACTIONS_DISPATCH_TOKEN;if(!token)return jsonError("GitHub status connection is not configured.",503);
 const headers={Accept:"application/vnd.github+json",Authorization:"Bearer "+token,"X-GitHub-Api-Version":"2022-11-28"};
 const [c,r]=await Promise.all([fetch("https://api.github.com/repos/"+REPO+"/commits/main",{headers,cache:"no-store"}),fetch("https://api.github.com/repos/"+REPO+"/actions/runs?branch=main&per_page=1",{headers,cache:"no-store"})]);
 if(!c.ok||!r.ok)return jsonError("Could not retrieve GitHub deployment status.",502);
 const [commit,runs]=await Promise.all([c.json(),r.json()]),run=runs.workflow_runs?.[0];
 return Response.json({latestCommit:commit.sha?.slice(0,12),latestRun:run?{id:run.id,name:run.name,status:run.status,conclusion:run.conclusion,url:run.html_url}:null},{headers:{"cache-control":"no-store"}});
}
