export const BRV_V2_SUPABASE_PROJECT_REF = "lciylmfpcefdpsouoqvm";

export function resolveSupabaseUrl(env, expectedProjectRef = BRV_V2_SUPABASE_PROJECT_REF) {
  const candidate = String(env?.NEXT_PUBLIC_SUPABASE_URL || env?.SUPABASE_URL || "").trim();
  if (!candidate) throw new Error("Supabase URL is missing; connect the dedicated V2 Supabase project through Vercel.");

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("Supabase URL is invalid.");
  }

  if (parsed.protocol !== "https:" || parsed.hostname !== `${expectedProjectRef}.supabase.co`) {
    throw new Error("Supabase URL must target the dedicated V2 project.");
  }

  return parsed.origin;
}
