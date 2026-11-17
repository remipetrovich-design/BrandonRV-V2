import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { loadEnvConfig } from "@next/env";
import { resolveManualDeployTarget } from "../src/lib/manual-deploy-target.mjs";

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

function run(args) {
  const result = spawnSync("supabase", args, {
    encoding: "utf8",
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.replaceAll(databaseUrl, "[redacted database URL]");
  if (output) process.stdout.write(output);
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (mode === "preview") {
  run(["migration", "list", `--remote=${databaseUrl}`]);
  run(["db", "push", `--remote=${databaseUrl}`, "--dry-run"]);
} else {
  run(["db", "push", `--remote=${databaseUrl}`, "--yes"]);
}
