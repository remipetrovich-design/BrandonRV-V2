import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readdir } from "node:fs/promises";
import { resolveSupabaseMigrationTarget } from "../src/lib/supabase-migration-target.mjs";

const execFileAsync = promisify(execFile);
const projectRef = resolveSupabaseMigrationTarget(process.env);
const localDir = "supabase/migrations";
const localFiles = (await readdir(localDir)).filter(f => /^\d{14}_.+\.sql$/.test(f));
const localVersions = new Set(localFiles.map(f => f.slice(0,14)));

const { stdout } = await execFileAsync("supabase", ["migration","list",`--remote=${projectRef}`], {
  env: process.env, maxBuffer: 8 * 1024 * 1024
});
console.log(stdout);
const remoteVersions = new Set([...stdout.matchAll(/(?:^|\s)(\d{14})(?=\s|$)/gm)].map(m=>m[1]));
if (!remoteVersions.size) {
  console.error("Unable to reliably parse remote migration history. Stopping rather than assuming the database is empty.");
  process.exit(2);
}
const remoteOnly=[...remoteVersions].filter(v=>!localVersions.has(v)).sort();
const localOnly=[...localVersions].filter(v=>!remoteVersions.has(v)).sort();
if(remoteOnly.length){
 console.error("\nREMOTE-ONLY migration versions (history entries without local files):");
 for(const v of remoteOnly) console.error(" - "+v);
 console.error("\nThis is migration-history drift. No migrations were applied or history records changed.");
 console.error("Reconciliation is required: restore the corresponding migration files or review the schema/history and reconcile deliberately.");
 process.exit(1);
}
if(localOnly.length){
 console.log("\nLOCAL PENDING migration versions:");
 for(const v of localOnly) console.log(" - "+v);
 console.log("Remote history is consistent with the local migration set; pending files may be previewed.");
}else{
 console.log("\nMigration histories match: no pending local migration versions.");
}
