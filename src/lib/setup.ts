import { randomBytes } from "node:crypto";
import { db } from "./db";
import { bustInstanceCache, hashPassword } from "./dashboard-auth";

// First-boot setup wizard state machine (the /setup page). A fresh deploy
// walks three gates: connect a database, run the migrations, claim the
// instance. Classic installs (DASHBOARD_PASSWORD env set) are born "ready"
// and never see the wizard.
//
// No MCP counterpart, deliberately: setup runs before any MCP token can
// exist, so the parity rule cannot apply to it.

export type SetupState = "no-db" | "no-tables" | "unclaimed" | "ready";

export async function getSetupState(): Promise<SetupState> {
  if (process.env.DASHBOARD_PASSWORD) return "ready";
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return "no-db";
  try {
    const { data, error } = await db()
      .from("instance_settings")
      .select("dashboard_password_hash")
      .maybeSingle();
    if (error) {
      // PGRST205 = table not in PostgREST's schema cache; 42P01 = undefined
      // table. Both mean the DB answers but the migrations haven't run.
      // Anything else (bad key, paused project) reads as not connected.
      return error.code === "PGRST205" || error.code === "42P01" ? "no-tables" : "no-db";
    }
    return data?.dashboard_password_hash ? "ready" : "unclaimed";
  } catch {
    return "no-db";
  }
}

// Claim the instance: store the chosen password (scrypt hash) and generate
// the cron secret. Insert-only: a concurrent claimer hits the single-row
// primary key and gets "already-claimed" instead of overwriting.
export async function claimInstance(
  password: string,
): Promise<{ cronSecret: string } | { error: "already-claimed" }> {
  const state = await getSetupState();
  if (state !== "unclaimed") return { error: "already-claimed" };
  const cronSecret = randomBytes(24).toString("hex");
  const { error } = await db().from("instance_settings").insert({
    id: true,
    dashboard_password_hash: hashPassword(password),
    cron_secret: cronSecret,
  });
  if (error) return { error: "already-claimed" };
  bustInstanceCache();
  return { cronSecret };
}
