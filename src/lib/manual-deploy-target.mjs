export function resolveManualDeployTarget(env, expectedProjectRef) {
  if (String(env?.BRANDON_RV_MANUAL_DEPLOY_ENABLED ?? "").trim().toLowerCase() !== "true") {
    throw new Error("Manual deployment is disabled in the Vercel production configuration.");
  }

  let supabaseUrl;
  try {
    supabaseUrl = new URL(String(env?.NEXT_PUBLIC_SUPABASE_URL ?? ""));
  } catch {
    throw new Error("The Vercel Supabase integration URL is missing or invalid.");
  }
  if (supabaseUrl.hostname !== `${expectedProjectRef}.supabase.co`) {
    throw new Error("The Vercel Supabase integration does not match the dedicated V2 project.");
  }

  const rawDatabaseUrl = String(env?.POSTGRES_URL_NON_POOLING ?? "").trim();
  if (!rawDatabaseUrl) throw new Error("Vercel Supabase integration variable POSTGRES_URL_NON_POOLING is missing.");

  let databaseUrl;
  try {
    databaseUrl = new URL(rawDatabaseUrl);
  } catch {
    throw new Error("Vercel Supabase integration variable POSTGRES_URL_NON_POOLING is invalid.");
  }
  if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol) || !databaseUrl.hostname) {
    throw new Error("POSTGRES_URL_NON_POOLING must be a PostgreSQL connection URL.");
  }

  return databaseUrl.toString();
}
