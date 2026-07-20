import { randomBytes } from "node:crypto";
import { db } from "./db";
import { bustInstanceCache, hashPassword } from "./dashboard-auth";
import { missingMigrations } from "./schema-check";

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
    if (data?.dashboard_password_hash) return "ready";
    // Unclaimed: hold the wizard at the migration step until EVERY probe
    // passes, not just the last table - a mid-sequence paste slip used to
    // read as "fully migrated" and bite days later. Claimed instances are
    // never sent back here (no lockouts); their drift surfaces through the
    // deploy-check schema alert instead.
    if ((await missingMigrations()).length > 0) return "no-tables";
    return "unclaimed";
  } catch {
    return "no-db";
  }
}

// Claim the instance: store the chosen password (scrypt hash) and generate
// everything the instance will ever need a secret for - the cron secret,
// the secrets-encryption key (so onboarding's DataForSEO/SerpApi connect
// works with zero manual env setup), and this deploy's own public URL
// (captured from the claim request; pipeline-pack bakes it into every
// connected repo so self-hosted pipelines phone the right backend).
// Insert-only: a concurrent claimer hits the single-row primary key and
// gets "already-claimed" instead of overwriting.
export async function claimInstance(
  password: string,
  appUrl?: string | null,
): Promise<{ cronSecret: string } | { error: "already-claimed" }> {
  const state = await getSetupState();
  if (state !== "unclaimed") return { error: "already-claimed" };
  const cronSecret = randomBytes(24).toString("hex");
  const row = {
    id: true,
    dashboard_password_hash: hashPassword(password),
    cron_secret: cronSecret,
    app_url: appUrl ?? null,
    enc_key: randomBytes(32).toString("base64"),
  };
  let { error } = await db().from("instance_settings").insert(row);
  // Pre-0027 schema (columns missing): claim with the original shape rather
  // than dead-ending the wizard; the runtime fallbacks cover the rest.
  if (error && /app_url|enc_key|column/i.test(error.message)) {
    ({ error } = await db().from("instance_settings").insert({
      id: row.id,
      dashboard_password_hash: row.dashboard_password_hash,
      cron_secret: cronSecret,
    }));
  }
  if (error) return { error: "already-claimed" };
  bustInstanceCache();
  return { cronSecret };
}
