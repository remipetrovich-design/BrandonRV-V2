import {authorizePermission,currentMembership,database,jsonError,sameOrigin} from "@/lib/auth";
import {writeAuditEvent} from "@/lib/audit-events.mjs";
export const runtime="nodejs";export const dynamic="force-dynamic";
const REPO="remipetrovich-design/BrandonRV-V2";
const WORKFLOWS={full_scan:"manual-full-scan.yml",scan_apply:"manual-scan-apply-migrations.yml",deploy:"manual-deploy-latest.yml",diagnostic:"reconcile-migration-history.yml"} as const;
export async function POST(request:Request){
 if(!sameOrigin(request))return jsonError("Invalid request origin.",403);
 const body=await request.json().catch(()=>null),operation=body?.operation,runId=Number(body?.runId);
 if(typeof operation!=="string"||!Object.hasOwn(WORKFLOWS,operation)||!Number.isSafeInteger(runId)||runId<=0)return jsonError("Choose a valid operation and workflow run.",400);
 const workflow=WORKFLOWS[operation as keyof typeof WORKFLOWS];
 const access=await authorizePermission(operation==="scan_apply"||operation==="diagnostic"?"developer.migrations.manage":"developer.deploy");if(access.response)return access.response;
 const token=process.env.GITHUB_ACTIONS_DISPATCH_TOKEN?.trim();if(!token)return jsonError("GitHub Actions retry access is not configured.",503);
 const headers={Accept:"application/vnd.github+json",Authorization:"Bearer "+token,"X-GitHub-Api-Version":"2022-11-28","Content-Type":"application/json"};
 try{
  const runResponse=await fetch("https://api.github.com/repos/"+REPO+"/actions/runs/"+runId,{headers,cache:"no-store"});
  if(!runResponse.ok)return jsonError("GitHub could not verify the workflow run ("+runResponse.status+").",502);
  const run=await runResponse.json();
  if(run.path!==".github/workflows/"+workflow)return jsonError("The requested run does not belong to this operation.",403);
  if(run.status!=="completed"||!["failure","cancelled","timed_out","action_required"].includes(run.conclusion))return jsonError("Only a completed failed or cancelled run can be retried.",409);
  const membership=await currentMembership(access.user!.id);if(!membership)return jsonError("Workspace access could not be verified.",403);
  try{await writeAuditEvent(database(),{businessId:membership.business_id,actorUserId:access.user!.id,action:"deployment.failed_job_retry_requested",entityType:"application_deployment",details:{repository:REPO,workflow,runId,operation}});}catch{return jsonError("Could not record the retry request in the audit history.",500);}
  const response=await fetch("https://api.github.com/repos/"+REPO+"/actions/runs/"+runId+"/rerun-failed-jobs",{method:"POST",headers,cache:"no-store"});
  if(!response.ok)return jsonError("GitHub rejected the failed-job retry ("+response.status+"). Check the Actions token permissions.",502);
  return Response.json({success:true,message:"Only failed jobs have been queued for retry. The same commit and migration SQL will run again."},{headers:{"cache-control":"no-store"}});
 }catch{return jsonError("Could not queue the failed-job retry.",502);}
}
