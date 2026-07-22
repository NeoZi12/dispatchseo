import { Polar } from "@polar-sh/sdk";
import { db } from "./db";
import { isCloudMode } from "./cloud";

// Polar billing for CLOUD_MODE (Neo's 2026-07-22 decision: Polar as merchant
// of record). One subscriptions row per user (migration 0031), upserted by
// the webhook; tier limits live denormalized on the row so enforcement never
// calls Polar on the hot path. Self-host never touches any of this.
//
// NOTE on MCP parity: billing is ACCOUNT state, not project state - the MCP
// bearer token identifies a project, not a user, so there is deliberately no
// MCP counterpart for checkout/portal.

export type Tier = "starter" | "growth" | "scale";

export const TIER_LIMITS: Record<Tier, { sites: number; keywords: number; price: number }> = {
  starter: { sites: 1, keywords: 100, price: 49 },
  growth: { sites: 3, keywords: 300, price: 99 },
  scale: { sites: 10, keywords: 1000, price: 149 },
};

// Product ids come from the Polar dashboard once the three products exist.
export function productIdForTier(tier: Tier): string | null {
  const key = {
    starter: "POLAR_PRODUCT_STARTER",
    growth: "POLAR_PRODUCT_GROWTH",
    scale: "POLAR_PRODUCT_SCALE",
  }[tier];
  return process.env[key] ?? null;
}

export function tierForProductId(productId: string): Tier | null {
  for (const tier of ["starter", "growth", "scale"] as const) {
    if (productIdForTier(tier) === productId) return tier;
  }
  return null;
}

export function polarConfigured(): boolean {
  return Boolean(process.env.POLAR_ACCESS_TOKEN);
}

export function polar(): Polar {
  const accessToken = process.env.POLAR_ACCESS_TOKEN;
  if (!accessToken) throw new Error("POLAR_ACCESS_TOKEN is not set");
  return new Polar({
    accessToken,
    server: process.env.POLAR_SERVER === "sandbox" ? "sandbox" : "production",
  });
}

export type Subscription = {
  user_id: string;
  provider: string;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  tier: Tier;
  status: string;
  sites_limit: number;
  keywords_limit: number;
  current_period_end: string | null;
};

export async function getSubscription(userId: string): Promise<Subscription | null> {
  const { data, error } = await db()
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return null;
  return (data as Subscription) ?? null;
}

export function isActive(sub: Subscription | null): boolean {
  return sub?.status === "active" || sub?.status === "trialing";
}

// The webhook's single write path. Missing tier (unknown product) keeps the
// stored tier; status always updates so a cancellation is never missed.
export async function applySubscriptionState(state: {
  userId: string;
  status: string;
  tier?: Tier | null;
  providerCustomerId?: string | null;
  providerSubscriptionId?: string | null;
  currentPeriodEnd?: string | null;
}): Promise<void> {
  const limits = state.tier ? TIER_LIMITS[state.tier] : null;
  const row: Record<string, unknown> = {
    user_id: state.userId,
    provider: "polar",
    status: state.status,
    updated_at: new Date().toISOString(),
  };
  if (state.tier) {
    row.tier = state.tier;
    row.sites_limit = limits!.sites;
    row.keywords_limit = limits!.keywords;
  }
  if (state.providerCustomerId !== undefined) row.provider_customer_id = state.providerCustomerId;
  if (state.providerSubscriptionId !== undefined)
    row.provider_subscription_id = state.providerSubscriptionId;
  if (state.currentPeriodEnd !== undefined) row.current_period_end = state.currentPeriodEnd;
  const { error } = await db().from("subscriptions").upsert(row, { onConflict: "user_id" });
  if (error) console.error(`[billing] subscription upsert failed: ${error.message}`);
}

// How many more sites this user's plan allows. null = unlimited (self-host,
// or cloud with billing not yet configured - fail open, never lock the
// owner out of their own product because an env var is missing).
export async function remainingSites(userId: string): Promise<number | null> {
  if (!isCloudMode() || !polarConfigured()) return null;
  const sub = await getSubscription(userId);
  if (!isActive(sub)) return 0;
  const { count } = await db()
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("owner_user_id", userId);
  return Math.max(0, sub!.sites_limit - (count ?? 0));
}

// The projects an owner's plan actually covers: the OLDEST sites_limit ones.
// Deterministic and stable, so a Scale->Starter downgrade doesn't delete
// anything - the newest sites just fall outside coverage (crons skip them,
// data stays, upgrading re-covers them instantly).
async function ownedProjectsOldestFirst(ownerId: string): Promise<string[]> {
  const { data } = await db()
    .from("projects")
    .select("id")
    .eq("owner_user_id", ownerId)
    .order("created_at", { ascending: true });
  return ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
}

// Is this project covered by its owner's current plan? Crons call this per
// project; not-allowed is an informational skip (the "crons never run what
// setup hasn't finished" pattern), never an error. Self-host, unconfigured
// billing, and ownerless projects are always allowed.
export async function planGate(
  projectId: string,
): Promise<{ allowed: true } | { allowed: false; reason: string }> {
  if (!isCloudMode() || !polarConfigured()) return { allowed: true };
  const { data, error } = await db()
    .from("projects")
    .select("owner_user_id")
    .eq("id", projectId)
    .maybeSingle();
  if (error || !data) return { allowed: true }; // pre-0031 tolerance
  const ownerId = (data as { owner_user_id: string | null }).owner_user_id;
  if (!ownerId) return { allowed: true };
  const sub = await getSubscription(ownerId);
  if (!isActive(sub)) return { allowed: false, reason: "subscription inactive" };
  const covered = (await ownedProjectsOldestFirst(ownerId)).slice(0, sub!.sites_limit);
  if (!covered.includes(projectId)) {
    return { allowed: false, reason: `beyond the plan's ${sub!.sites_limit}-site limit` };
  }
  return { allowed: true };
}

// The tracked-keyword allowance left on this project's ACCOUNT plan (the
// limit is per account, not per site - otherwise 3 sites x 300 would
// triple the quota). Tracked keywords x daily SERP checks is ~90% of
// DataForSEO cost, so this cap is the real abuse guard. null = unlimited
// (self-host, billing unconfigured, or ownerless project). owner_user_id is
// looked up directly because the MCP's currentProject() doesn't carry it.
export async function remainingKeywords(projectId: string): Promise<number | null> {
  if (!isCloudMode() || !polarConfigured()) return null;
  const { data, error } = await db()
    .from("projects")
    .select("owner_user_id")
    .eq("id", projectId)
    .maybeSingle();
  // Column/table missing (pre-0031) or no owner: don't cap.
  if (error || !data) return null;
  const ownerId = (data as { owner_user_id: string | null }).owner_user_id;
  if (!ownerId) return null;
  const sub = await getSubscription(ownerId);
  if (!isActive(sub)) return 0;
  const owned = await ownedProjectsOldestFirst(ownerId);
  const { count } = await db()
    .from("keywords")
    .select("id", { count: "exact", head: true })
    .in("project_id", owned)
    .eq("status", "tracking");
  return Math.max(0, sub!.keywords_limit - (count ?? 0));
}
