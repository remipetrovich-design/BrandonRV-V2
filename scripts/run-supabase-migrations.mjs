import { resolveSupabaseMigrationTarget } from "../src/lib/supabase-migration-target.mjs";
import { runCommand } from "../src/lib/stream-command.mjs";

const mode = process.argv[2];
if (!["preview", "apply"].includes(mode)) {
  throw new Error("Usage: node scripts/run-supabase-migrations.mjs <preview|apply>");
}

const projectRef = resolveSupabaseMigrationTarget(process.env);
const secrets = [
  process.env.SUPABASE_ACCESS_TOKEN,
  process.env.SUPABASE_DB_PASSWORD,
].filter(Boolean);

async function run(args) {
  const status = await runCommand("supabase", args, {
    env: process.env,
    redact: secrets,
  });
  if (status !== 0) process.exit(status);
}

if (mode === "preview") {
  await run(["migration", "list", `--remote=${projectRef}`]);
  await run(["db", "push", `--remote=${projectRef}`, "--dry-run"]);
} else {
  await run(["db", "push", `--remote=${projectRef}`, "--yes"]);
}
