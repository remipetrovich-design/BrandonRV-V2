import {authorizePermission,currentMembership,database,jsonError,sameOrigin} from "@/lib/auth";
import {writeAuditEvent} from "@/lib/audit-events.mjs";
export const runtime="nodejs";export const dynamic="force-dynamic";
const REPO="remipetrovich-design/BrandonRV-V2";
const WORKFLOWS={full_scan:"manual-full-scan.yml",scan_apply:"manual-scan-apply-migrations.yml",deploy:"manual-deploy-latest.yml"} as const;
export async function POST(request:Request){
 if(!sameOrigin(request))return jsonError("Invalid request origin.",403);
 const body:{action?:string}|null=await request.json().catch(()=>null),action=body?.action;
 if(action!=="full_scan"&&action!=="scan_apply"&&action!=="deploy")return jsonError("Choose a supported operation.",400);
 const access=await authorizePermission(action==="scan_apply"?"developer.migrations.manage":"developer.deploy");if(access.response)return access.response;
 const user=access.user!,token=process.env.GITHUB_ACTIONS_DISPATCH_TOKEN;
 if(!token)return jsonError("GitHub Actions connection is not configured for this Production deployment.",503);
 if(action==="deploy"&&String(process.env.BRANDON_RV_MANUAL_DEPLOY_ENABLED??"").trim().toLowerCase()!=="true")return jsonError("Manual deployment is OFF. Run the Full Scan and apply migrations independently; deployment remains unavailable until deliberately enabled.",423);
 const workflow=WORKFLOWS[action],membership=await currentMembership(user.id);if(!membership)return jsonError("Workspace access could not be verified.",403);
 try{await writeAuditEvent(database(),{businessId:membership.business_id,actorUserId:user.id,action:action==="scan_apply"?"deployment.migrations_requested":action==="full_scan"?"deployment.full_scan_requested":"deployment.latest_commit_requested",entityType:"application_deployment",details:{repository:REPO,workflow,branch:"main",operation:action,target:action==="scan_apply"?"supabase_v2":action==="full_scan"?"validation_only":"vercel_production"}});}catch{return jsonError("Could not record the operation in the audit history.",500);}
 const response=await fetch("https://api.github.com/repos/"+REPO+"/actions/workflows/"+workflow+"/dispatches",{method:"POST",headers:{Accept:"application/vnd.github+json",Authorization:"Bearer "+token,"X-GitHub-Api-Version":"2022-11-28","Content-Type":"application/json"},body:JSON.stringify({ref:"main",inputs:{confirm:"YES"}}),cache:"no-store"}).catch(()=>null);
 if(!response?.ok)return jsonError("GitHub Actions rejected the operation. Check workflow activation and dispatch permissions.",502);
 const messages={full_scan:"Read-only Full Scan queued for main. It runs tests, typecheck, migration checks and the Production build without deploying or applying SQL.",scan_apply:"V2 database migration scan and apply queued independently. Refresh status to inspect progress.",deploy:"Latest-main V2 Production deployment queued. The workflow verifies a successful Full Scan for the exact commit before building and deploying the complete main history."};
 return Response.json({success:true,message:messages[action]},{headers:{"cache-control":"no-store"}});
}
