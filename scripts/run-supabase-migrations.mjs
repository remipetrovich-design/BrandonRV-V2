import { existsSync } from "node:fs";
import { loadEnvConfig } from "@next/env";
import { resolveManualDeployTarget } from "../src/lib/manual-deploy-target.mjs";
import { runCommand } from "../src/lib/stream-command.mjs";

const mode = process.argv[2];
if (!["preview", "apply"].includes(mode)) {
  throw new Error("Usage: node scripts/run-supabase-migrations.mjs <preview|apply>");
}
if (!existsSync(".env.production.local")) {
  throw new Error("Vercel Production environment file is missing. Run vercel env pull first.");
}

process.env.NODE_ENV = "production";
loadEnvConfig(process.cwd(), false, true);

const projectRef = String(process.env.SUPABASE_PROJECT_ID ?? "").trim();
if (projectRef !== "lciylmfpcefdpsouoqvm") {
  throw new Error("The migration workflow is not configured for the dedicated Brandon RV V2 Supabase project.");
}
const databaseUrl = resolveManualDeployTarget(process.env, projectRef);

async function run(args) {
  const status = await runCommand("supabase", args, {env:process.env,redact:[databaseUrl]});
  if (status !== 0) process.exit(status);
}

if (mode === "preview") {
  await run(["migration", "list", `--remote=${databaseUrl}`]);
  await run(["db", "push", `--remote=${databaseUrl}`, "--dry-run"]);
} else {
  await run(["db", "push", `--remote=${databaseUrl}`, "--yes"]);
}
