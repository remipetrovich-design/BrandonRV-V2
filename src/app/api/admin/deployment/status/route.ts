import {currentUser,jsonError,sameOrigin} from "@/lib/auth";
import {isGlobalAdministrator} from "@/lib/user-role-policy.mjs";
export const runtime="nodejs";export const dynamic="force-dynamic";
const REPO="remipetrovich-design/BrandonRV-V2";
const WORKFLOWS={deployment:"manual-deploy-latest.yml",migrations:"manual-scan-apply-migrations.yml"};
async function latestWorkflowRun(headers:HeadersInit,workflow:string){
 const response=await fetch("https://api.github.com/repos/"+REPO+"/actions/workflows/"+workflow+"/runs?branch=main&per_page=1",{headers,cache:"no-store"});
 if(!response.ok)throw new Error("Could not retrieve "+workflow+" status.");
 const payload=await response.json(),run=payload.workflow_runs?.[0];
 return run?{id:run.id,name:run.name,status:run.status,conclusion:run.conclusion,url:run.html_url,createdAt:run.created_at}:null;
}
export async function GET(request:Request){
 if(!sameOrigin(request))return jsonError("Invalid request origin.",403);
 const user=await currentUser();if(!user)return jsonError("Not signed in.",401);
 if(!isGlobalAdministrator(String(user.user_role??"").toLowerCase()))return jsonError("Not authorised.",403);
 const token=process.env.GITHUB_ACTIONS_DISPATCH_TOKEN;if(!token)return jsonError("GitHub status connection is not configured.",503);
 const headers={Accept:"application/vnd.github+json",Authorization:"Bearer "+token,"X-GitHub-Api-Version":"2022-11-28"};
 const [commit,deploymentRun,migrationRun]=await Promise.all([
  fetch("https://api.github.com/repos/"+REPO+"/commits/main",{headers,cache:"no-store"}),
  latestWorkflowRun(headers,WORKFLOWS.deployment),
  latestWorkflowRun(headers,WORKFLOWS.migrations)
 ]);
 if(!commit.ok)return jsonError("Could not retrieve latest V2 main commit.",502);
 const commitData=await commit.json();
 return Response.json({latestCommit:commitData.sha?.slice(0,12),deploymentRun,migrationRun},{headers:{"cache-control":"no-store"}});
}
