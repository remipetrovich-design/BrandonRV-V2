import { authorizePermission, database, jsonError, sameOrigin } from "@/lib/auth";
import { isManualDeployAvailable } from "@/lib/deployment-control.mjs";
import { writeAuditEvent } from "@/lib/audit-events.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPOSITORY = "remipetrovich-design/BrandonRV-V2";
const WORKFLOW = "manual-deploy-latest.yml";
const BRANCH = "main";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return jsonError("Invalid request origin.", 403);

  const access = await authorizePermission("developer.deploy");
  if (access.response) return access.response;
  const user = access.user!;

  const token = process.env.GITHUB_ACTIONS_DISPATCH_TOKEN;
  const state = isManualDeployAvailable({
    enabledFlag: process.env.BRANDON_RV_MANUAL_DEPLOY_ENABLED,
    dispatchToken: token
  });
  if (!state.available) {
    return jsonError("Manual deployment is not activated or its GitHub connection is not configured.", 423);
  }

  const membership = access.membership!;

  const db = database();
  try {
    await writeAuditEvent(db, {
      businessId: membership.business_id,
      actorUserId: user.id,
      action: "deployment.manual_dispatch_requested",
      entityType: "application_deployment",
      details: { repository: REPOSITORY, workflow: WORKFLOW, branch: BRANCH, target: "production" }
    });
  } catch {
    return jsonError("The deployment request could not be recorded in the audit history.", 500);
  }

  let response: Response;
  try {
    response = await fetch(`https://api.github.com/repos/${REPOSITORY}/actions/workflows/${WORKFLOW}/dispatches`, {
      method: "POST",
      headers: {
        "Accept": "application/vnd.github+json",
        "Authorization": `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ ref: BRANCH, inputs: { confirm: "YES" } }),
      cache: "no-store"
    });
  } catch {
    return jsonError("Could not contact GitHub Actions to queue the deployment.", 502);
  }

  if (!response.ok) {
    return jsonError("GitHub Actions rejected the deployment request. Check the dispatch token permissions and workflow status.", 502);
  }

  return Response.json({
    success: true,
    message: "The manual deployment workflow has been queued. Follow its progress in GitHub Actions."
  }, { headers: { "cache-control": "no-store" } });
}
