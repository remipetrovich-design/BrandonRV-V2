import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readdir } from "node:fs/promises";
import { resolveSupabaseMigrationTarget } from "../src/lib/supabase-migration-target.mjs";

const execFileAsync = promisify(execFile);
const projectRef = resolveSupabaseMigrationTarget(process.env);
const localFiles = (await readdir("supabase/migrations")).filter(f => /^\d{14}_.+\.sql$/.test(f));
const localVersions = new Set(localFiles.map(f => f.slice(0,14)));
const { stdout } = await execFileAsync("supabase", ["migration","list",`--remote=${projectRef}`], { env: process.env, maxBuffer: 8 * 1024 * 1024 });
console.log(stdout);

// Supabase CLI migration-list table columns: LOCAL version, REMOTE version, timestamp.
// Parse column-by-column, never treat the local column as proof of remote history.
const remoteVersions = new Set();
for (const line of stdout.split(/\r?\n/)) {
  const cells = line.split("|").map(c => c.trim());
  if (cells.length >= 2 && /^\d{14}$/.test(cells[1])) remoteVersions.add(cells[1]);
}
if (!remoteVersions.size) {
  console.error("Remote migration column could not be parsed reliably. Stopping safely.");
  process.exit(2);
}
const remoteOnly=[...remoteVersions].filter(v=>!localVersions.has(v)).sort();
const localPending=[...localVersions].filter(v=>!remoteVersions.has(v)).sort();
if(remoteOnly.length){
 console.error("\nREMOTE-ONLY versions (remote history entries missing local files):");
 for(const v of remoteOnly) console.error(" - "+v);
 console.error("\nHistory drift detected. No migration was applied and remote history was not changed.");
 console.error("Restore reviewed migration files or reconcile deliberately before applying.");
 process.exit(1);
}
console.log(localPending.length ? "\nLocal migration files pending remotely:" : "\nNo local migrations pending.");
for(const v of localPending) console.log(" - "+v);
console.log("Remote history appears consistent with local files; safe to proceed to CLI preview.");
