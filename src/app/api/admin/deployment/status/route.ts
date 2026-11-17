import {currentUser,jsonError,sameOrigin,userHasPermissions} from "@/lib/auth";
export const runtime="nodejs";export const dynamic="force-dynamic";
const REPO="remipetrovich-design/BrandonRV-V2";
const WORKFLOWS={fullScan:"manual-full-scan.yml",deployment:"manual-deploy-latest.yml",migrations:"manual-scan-apply-migrations.yml"};
type Run={id:number;name:string;status:string;conclusion:string|null;url:string;createdAt:string;headSha?:string};
async function githubJson(url:string,headers:HeadersInit){const response=await fetch(url,{headers,cache:"no-store"});if(!response.ok)throw new Error("GitHub returned "+response.status+" for "+url);return response.json();}
async function latestWorkflowRun(headers:HeadersInit,workflow:string):Promise<Run|null>{const payload=await githubJson("https://api.github.com/repos/"+REPO+"/actions/workflows/"+workflow+"/runs?branch=main&per_page=10",headers);const run=payload.workflow_runs?.[0];return run?{id:run.id,name:run.name,status:run.status,conclusion:run.conclusion,url:run.html_url,createdAt:run.created_at,headSha:run.head_sha}:null;}
export async function GET(request:Request){
 if(!sameOrigin(request))return jsonError("Invalid request origin.",403);
 const user=await currentUser();if(!user)return jsonError("Not signed in.",401);
 const access=await userHasPermissions(user.id,["developer.deploy","developer.migrations.manage"]);if(!access.size)return jsonError("Not authorised.",403);
 const token=process.env.GITHUB_ACTIONS_DISPATCH_TOKEN;if(!token)return jsonError("GitHub Actions status connection is not configured in this Production runtime.",503);
 const headers={Accept:"application/vnd.github+json",Authorization:"Bearer "+token,"X-GitHub-Api-Version":"2022-11-28"},statusErrors:string[]=[];
 const [commit,fullScanRun,deploymentRun,migrationRun,checkPayload]=await Promise.all([
  githubJson("https://api.github.com/repos/"+REPO+"/commits/main",headers).catch(e=>{statusErrors.push("Latest main commit: "+String(e));return null;}),
  latestWorkflowRun(headers,WORKFLOWS.fullScan).catch(e=>{statusErrors.push("Full Scan history: "+String(e));return null;}),
  latestWorkflowRun(headers,WORKFLOWS.deployment).catch(e=>{statusErrors.push("Deployment history: "+String(e));return null;}),
  latestWorkflowRun(headers,WORKFLOWS.migrations).catch(e=>{statusErrors.push("Migration history: "+String(e));return null;}),
  githubJson("https://api.github.com/repos/"+REPO+"/commits/main/check-runs?per_page=100",headers).catch(e=>{statusErrors.push("Commit checks: "+String(e));return null;})
 ]);
 const checks=(checkPayload?.check_runs||[]).map((x:any)=>({name:x.name,status:x.status,conclusion:x.conclusion??null,url:x.html_url}));
 return Response.json({latestCommit:commit?.sha?.slice(0,12)||null,commitUrl:commit?.html_url||null,commitMessage:commit?.commit?.message?.split("\n")[0]||null,fullScanRun,deploymentRun,migrationRun,checks,statusErrors},{headers:{"cache-control":"no-store"}});
}
