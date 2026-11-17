import {currentUser,currentMembership,database,jsonError,sameOrigin} from "@/lib/auth";
import {isGlobalAdministrator} from "@/lib/user-role-policy.mjs";
import {isManualDeployAvailable} from "@/lib/deployment-control.mjs";
import {writeAuditEvent} from "@/lib/audit-events.mjs";
export const runtime="nodejs";export const dynamic="force-dynamic";
const REPO="remipetrovich-design/BrandonRV-V2";
const WORKFLOWS={scan_apply:"manual-scan-apply-migrations.yml",deploy:"manual-deploy-latest.yml"} as const;
export async function POST(request:Request){
 if(!sameOrigin(request))return jsonError("Invalid request origin.",403);
 const user=await currentUser();if(!user)return jsonError("Not signed in.",401);
 if(!isGlobalAdministrator(String(user.user_role??"").toLowerCase()))return jsonError("Not authorised.",403);
 const token=process.env.GITHUB_ACTIONS_DISPATCH_TOKEN;
 if(!isManualDeployAvailable({enabledFlag:process.env.BRANDON_RV_MANUAL_DEPLOY_ENABLED,dispatchToken:token}).available)return jsonError("Manual operations are not activated or configured.",423);
 const body=await request.json().catch(()=>null),action=body?.action;
 if(action!=="scan_apply"&&action!=="deploy")return jsonError("Choose a supported operation.",400);
 const workflow=WORKFLOWS[action];
 const membership=await currentMembership(user.id);if(!membership)return jsonError("Workspace access could not be verified.",403);
 try{await writeAuditEvent(database(),{businessId:membership.business_id,actorUserId:user.id,action:action==="scan_apply"?"deployment.migrations_requested":"deployment.latest_commit_requested",entityType:"application_deployment",details:{repository:REPO,workflow,branch:"main",operation:action,target:action==="deploy"?"vercel_production":"supabase_v2"}});}catch{return jsonError("Could not record the operation in the audit history.",500);}
 const response=await fetch("https://api.github.com/repos/"+REPO+"/actions/workflows/"+workflow+"/dispatches",{method:"POST",headers:{Accept:"application/vnd.github+json",Authorization:"Bearer "+token,"X-GitHub-Api-Version":"2022-11-28","Content-Type":"application/json"},body:JSON.stringify({ref:"main",inputs:{confirm:"YES"}}),cache:"no-store"}).catch(()=>null);
 if(!response?.ok)return jsonError("GitHub Actions rejected the operation. Check dispatch permissions and workflow activation.",502);
 return Response.json({success:true,message:action==="scan_apply"?"V2 migration scan and apply queued independently. Refresh migration status to inspect progress.":"Latest-main V2 Production deployment queued independently. The workflow fetches the newest main commit and its complete history before building. Refresh deployment status to inspect progress."},{headers:{"cache-control":"no-store"}});
}
