import {currentUser,jsonError,sameOrigin,userHasPermissions} from "@/lib/auth";
import {extractConsoleErrors,extractZipText,tailConsoleOutput} from "@/lib/deployment-console.mjs";
export const runtime="nodejs";export const dynamic="force-dynamic";
const REPO="remipetrovich-design/BrandonRV-V2";
const WORKFLOWS={full_scan:"manual-full-scan.yml",scan_apply:"manual-scan-apply-migrations.yml",deploy:"manual-deploy-latest.yml"} as const;
export async function GET(request:Request){
 if(!sameOrigin(request))return jsonError("Invalid request origin.",403);
 const user=await currentUser();if(!user)return jsonError("Not signed in.",401);
 const url=new URL(request.url),operation=url.searchParams.get("operation")||"",runId=Number(url.searchParams.get("runId"));
 if(typeof operation!=="string"||!(operation in WORKFLOWS)||!Number.isSafeInteger(runId)||runId<=0)return jsonError("Choose a valid operation and workflow run.",400);
 const permission=operation==="scan_apply"?"developer.migrations.manage":"developer.deploy";
 const access=await userHasPermissions(user.id,[permission]);if(!access.size)return jsonError("Not authorised.",403);
 const token=process.env.GITHUB_ACTIONS_DISPATCH_TOKEN?.trim();if(!token)return jsonError("GitHub Actions log access is not configured.",503);
 const headers={Accept:"application/vnd.github+json",Authorization:"Bearer "+token,"X-GitHub-Api-Version":"2022-11-28"};
 try{
  const runResponse=await fetch("https://api.github.com/repos/"+REPO+"/actions/runs/"+runId,{headers,cache:"no-store"});
  if(!runResponse.ok)return jsonError("GitHub could not load this workflow run ("+runResponse.status+").",502);
  const run=await runResponse.json();
  if(run.path!==".github/workflows/"+WORKFLOWS[operation])return jsonError("The requested run does not belong to this operation.",403);
  const jobsResponse=await fetch("https://api.github.com/repos/"+REPO+"/actions/runs/"+runId+"/jobs?per_page=100&filter=latest",{headers,cache:"no-store"});
  if(!jobsResponse.ok)return jsonError("GitHub could not load workflow jobs ("+jobsResponse.status+").",502);
  const jobsPayload=await jobsResponse.json();
  const jobs=await Promise.all((jobsPayload.jobs||[]).map(async(job:any)=>{
   let log="";
   if(job.status==="completed"||job.status==="in_progress"){
    const response=await fetch("https://api.github.com/repos/"+REPO+"/actions/jobs/"+job.id+"/logs",{headers,cache:"no-store"});
    if(response.ok){try{log=tailConsoleOutput(extractZipText(await response.arrayBuffer()));}catch{log="GitHub has not published readable logs for this job yet. Refresh while it is running or after it completes.";}}
    else log="Job log is not available yet ("+response.status+"). Refresh to try again.";
   }
   return {id:job.id,name:job.name,status:job.status,conclusion:job.conclusion??null,startedAt:job.started_at??null,completedAt:job.completed_at??null,url:job.html_url,log,errors:extractConsoleErrors(log)};
  }));
  return Response.json({runId,jobs,updatedAt:new Date().toISOString()},{headers:{"cache-control":"no-store"}});
 }catch{return jsonError("Could not retrieve live workflow logs from GitHub Actions.",502);}
}
