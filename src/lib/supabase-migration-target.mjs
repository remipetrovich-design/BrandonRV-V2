export const BRANDON_RV_V2_SUPABASE_PROJECT_ID = "lciylmfpcefdpsouoqvm";

export function resolveSupabaseMigrationTarget(env) {
  const projectRef = String(env?.SUPABASE_PROJECT_ID ?? "").trim();
  if (projectRef !== BRANDON_RV_V2_SUPABASE_PROJECT_ID) {
    throw new Error("SUPABASE_PROJECT_ID must identify the dedicated Brandon RV V2 Supabase project.");
  }

  for (const name of ["SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD"]) {
    if (!String(env?.[name] ?? "").trim()) {
      throw new Error(`Required GitHub Actions secret ${name} is not configured.`);
    }
  }

  return projectRef;
}
