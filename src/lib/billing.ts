import { cache } from "react";
import { Polar } from "@polar-sh/sdk";
import { db } from "./db";
import { isCloudMode } from "./cloud";
import { captureServer } from "./posthog-server";
import { REASON_LABELS, type CancellationReason } from "./cancellation-reasons";

// Polar billing for CLOUD_MODE (Neo's 2026-07-22 decision: Polar as merchant
// of record). One subscriptions row per user (migration 0031), upserted by
// the webhook; tier limits live denormalized on the row so enforcement never
// calls Polar on the hot path. Self-host never touches any of this.
//
// NOTE on MCP parity: billing is ACCOUNT state, not project state - the MCP
// bearer token identifies a project, not a user, so there is deliberately no
// MCP counterpart for checkout/portal/cancellation. A project-scoped token
// able to cancel the account's plan (and with it every OTHER project the owner
// pays for) would be a privilege escalation rather than parity - the same
// reasoning that keeps deleteAccount off the MCP.

export type Tier = "starter" | "growth" | "scale";

// Billing interval. Monthly is the default everywhere a caller omits it, so
// every pre-annual code path keeps behaving exactly as before.
export type BillingInterval = "month" | "year";
export const BILLING_INTERVALS: readonly BillingInterval[] = ["month", "year"];

export function isBillingInterval(value: unknown): value is BillingInterval {
  return value === "month" || value === "year";
}

// The price table - the ONLY place a number lives. `price` is the monthly
// plan; `annual` is the yearly plan expressed per month (what the card shows),
// and the yearly charge Polar takes is annual x 12 (annualCharge below). Both
// products for a tier MUST be priced in the Polar dashboard to match these
// numbers, because the page advertises this table and Polar charges its own.
//
// Why these numbers (2026-08-20): the customer's own coding agent does the
// research and writing, so our per-site cost is DataForSEO (~$1/site/mo
// measured on prod) plus the Polar fee - there is no token bill to pass on.
// That is what lets Starter sit under every competitor that opens PRs (Lyra,
// Edward ~$39 + the customer's API tokens) while keeping a wide margin. The
// yearly plan is deliberately generous (~30% off) because annual billing is
// the single strongest retention lever in this category.
export const TIER_LIMITS: Record<Tier, { sites: number; price: number; annual: number }> = {
  starter: { sites: 1, price: 29, annual: 20 },
  growth: { sites: 3, price: 59, annual: 40 },
  // Scale was 10 sites until 2026-08-21. Cut to 5 so the ladder is a flat
  // ~$20/site (Growth $59/3, Scale $99/5) instead of a 50% volume discount a
  // bootstrapped founder never asked for - and because a 10-site buyer is an
  // agency with agency-sized support needs. More than 5 is a conversation.
  scale: { sites: 5, price: 99, annual: 69 },
};

// Articles a week the hosted writer (the autopilot) publishes per tier. Weekly,
// never daily: a young site that suddenly gains a post a day reads as a
// content farm to Google, and the plan is sold as a steady cadence, not a
// volume. Env-overridable so the operator can tune cost against results
// without a deploy. Prices above are unchanged by this (2026-10-23 decision:
// the Polar products are the owner's call).
export const ARTICLES_PER_WEEK: Record<Tier, number> = {
  starter: 1,
  growth: 2,
  scale: 3,
};

/** Interactive tool pages (calculators, generators) are a feature of the
 *  plans above Starter. No tier (self-host, unbilled) means no plan gate at
 *  all, so tools are allowed there. Read-only presentation gate: the tool
 *  builder's own cadence is decided elsewhere. */
export function planAllowsTools(tier: Tier | null | undefined): boolean {
  if (!tier) return true;
  return tier === "growth" || tier === "scale";
}

/** Hosted projects outside cloud billing (self-host, billing unconfigured, the
 *  operator's ownerless rows) - there is no tier to read. */
export const UNBILLED_ARTICLES_PER_WEEK = 2;

const WEEKLY_ENV: Record<Tier, string> = {
  starter: "WRITER_WEEKLY_STARTER",
  growth: "WRITER_WEEKLY_GROWTH",
  scale: "WRITER_WEEKLY_SCALE",
};

/** Articles a week for a tier; null = no tier (see UNBILLED_ARTICLES_PER_WEEK).
 *  A trial is Starter (Polar models the trial on the Starter product). */
export function articlesPerWeekFor(tier: Tier | null | undefined): number {
  if (!tier) return UNBILLED_ARTICLES_PER_WEEK;
  const override = Number(process.env[WEEKLY_ENV[tier]]);
  if (process.env[WEEKLY_ENV[tier]]?.trim() && Number.isFinite(override) && override >= 0) return Math.floor(override);
  return ARTICLES_PER_WEEK[tier] ?? UNBILLED_ARTICLES_PER_WEEK;
}

/** What Polar charges once a year for the annual plan, in whole dollars. */
export function annualCharge(tier: Tier): number {
  return TIER_LIMITS[tier].annual * 12;
}

/** "31" for Starter: the yearly plan's saving against 12 monthly payments. */
export function annualSavingsPct(tier: Tier): number {
  const { price, annual } = TIER_LIMITS[tier];
  return Math.round((1 - annual / price) * 100);
}

/** The per-month figure for the chosen interval - the number a card shows big. */
export function monthlyPrice(tier: Tier, interval: BillingInterval = "month"): number {
  return interval === "year" ? TIER_LIMITS[tier].annual : TIER_LIMITS[tier].price;
}

// $29 -> "$29", 24.5 -> "$24.50". Half-dollars are shown, never rounded: the
// number on the page has to equal the number Polar charges.
export function priceLabel(amount: number): string {
  return Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`;
}

// Display names for the badge in the dashboard chrome. Deliberately a map
// rather than capitalizing the tier string: a tier id that isn't a single
// lowercase word would render as mangled copy in the one place every owner
// sees on every screen.
export const TIER_NAMES: Record<Tier, string> = {
  starter: "Starter",
  growth: "Growth",
  scale: "Scale",
};

// Product ids come from the Polar dashboard once the six products exist
// (three tiers x monthly/yearly). The yearly ids are optional: a deployment
// that has not created them yet simply never offers the yearly plan - the
// pricing surfaces check productIdForTier(tier, "year") before showing one.
export function productIdForTier(tier: Tier, interval: BillingInterval = "month"): string | null {
  const base = {
    starter: "POLAR_PRODUCT_STARTER",
    growth: "POLAR_PRODUCT_GROWTH",
    scale: "POLAR_PRODUCT_SCALE",
  }[tier];
  const key = interval === "year" ? `${base}_ANNUAL` : base;
  return process.env[key] ?? null;
}

export function annualBillingAvailable(): boolean {
  return (["starter", "growth", "scale"] as const).every((t) => Boolean(productIdForTier(t, "year")));
}

export function tierForProductId(productId: string): Tier | null {
  for (const tier of ["starter", "growth", "scale"] as const) {
    for (const interval of BILLING_INTERVALS) {
      if (productIdForTier(tier, interval) === productId) return tier;
    }
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
  current_period_end: string | null;
  /**
   * Pending cancellation. Polar leaves a cancelled-at-period-end subscription
   * at status active/trialing until the period really ends, so `status` alone
   * can't tell a renewing plan from an ending one - this can.
   */
  cancel_at_period_end: boolean;
  /**
   * Third-site GitHub Actions cost acknowledgement (migration 0048), and which
   * way out the owner took. Optional on the type, not just nullable: a database
   * that hasn't run 0048 omits the columns entirely from `select("*")`, and
   * githubCostGate tells that apart from a genuine null so a pending migration
   * can't put every owner on a step whose answer it has nowhere to store.
   */
  github_cost_ack_at?: string | null;
  github_cost_ack_reason?: string | null;
};

// Per-request memo, POSITIVE RESULTS ONLY. cache(() => new Map()) hands every
// request its own map; with no request scope (scripts, module init, cron
// module load) React calls the factory fresh each time, which just means no
// memoizing - never an error.
//
// Only a FOUND subscription is memoized, and that restraint is load-bearing
// twice over. A null here is either a transient read error or "hasn't landed
// yet", and both can legitimately change inside one request:
//   - /onboarding polls this in a server-side retry loop while it waits for
//     the Polar webhook (onboarding/page.tsx). Memoizing the first null would
//     make every retry return it and bounce someone who JUST paid.
//   - planGate treats a null as "subscription inactive" and DENIES. Memoizing
//     an error-null would turn one blipped read into a whole cron run's worth
//     of denials for that owner.
// A found subscription can't change mid-request (only the webhook writes one,
// in its own request), so caching that direction is free.
const subscriptionMemo = cache(() => new Map<string, Subscription>());

export async function getSubscription(userId: string): Promise<Subscription | null> {
  const memo = subscriptionMemo();
  const hit = memo.get(userId);
  if (hit) return hit;
  const { data, error } = await db()
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return null;
  // Normalize BEFORE memoizing, so the cached object is the same shape every
  // reader gets on a miss.
  const sub = normalize(data);
  if (sub) memo.set(userId, sub);
  return sub;
}

// `select("*")` against a database that hasn't run 0047 yet simply omits the
// column, leaving a field typed boolean as undefined - falsy in practice, but
// only by luck. Coerce it once here so every reader gets a real boolean, and
// so "not migrated yet" reads as "nothing pending" - which is the truthful
// answer: a database without the column has never recorded a cancellation.
function normalize(data: unknown): Subscription | null {
  if (!data) return null;
  const row = data as Subscription;
  return { ...row, cancel_at_period_end: Boolean(row.cancel_at_period_end) };
}

// Error-SURFACING twin of getSubscription, for the one caller where "couldn't
// read it" must never be mistaken for "there isn't one": account deletion.
// getSubscription stays deliberately tolerant - its other callers gate access
// and failing open is right there - but deleteAccount uses the answer to decide
// whether to cancel billing, so a transient read error would delete the account
// and leave the card being charged with no dashboard left to cancel from. That
// is the precise outcome deleteAccount's own header calls unrecoverable.
export async function getSubscriptionOrThrow(userId: string): Promise<Subscription | null> {
  const { data, error } = await db()
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return normalize(data);
}

export function isActive(sub: Subscription | null): boolean {
  return sub?.status === "active" || sub?.status === "trialing";
}

export type PlanNotice = { kind: "past_due" | "ended"; endedAt: string | null };

// Does this account need to be TOLD that its plan stopped working?
//
// This exists because of what an inactive plan actually looks like from the
// inside. Nothing revokes dashboard access - requireDashboard only checks that
// you're signed in - so a lapsed customer keeps every page, every chart and
// every past result. What they lose is the WORK: planGate turns every cron into
// an informational skip, so ranks stop refreshing, Search Console stops
// importing, and the overnight builder stops building. The dashboard looks
// completely normal and quietly stops changing, with nothing anywhere saying
// why. Someone in that state can't tell "my plan ended" from "this product is
// broken", and the second reading is the one that generates support mail and
// chargebacks.
//
// Two states, because they need different sentences and different buttons:
//   past_due - the card failed. Recoverable in thirty seconds at the portal,
//              and the most valuable thing on this list to surface, since it is
//              churn nobody chose.
//   ended    - cancelled, revoked, unpaid or expired. Needs a plan, not a card.
//
// null for: healthy plans, self-host, billing not configured, and accounts that
// never subscribed at all (a fresh signup is mid-onboarding, not lapsed).
export function planNotice(sub: Subscription | null): PlanNotice | null {
  if (!isCloudMode() || !polarConfigured() || !sub) return null;
  if (sub.status === "past_due") return { kind: "past_due", endedAt: sub.current_period_end };
  if (isActive(sub)) return null;
  // Everything left is a plan that existed and no longer works. Deliberately
  // not an allowlist of dead statuses: a provider can add one at any time, and
  // an unrecognised status silently rendering NOTHING is how this gap got here.
  return { kind: "ended", endedAt: sub.current_period_end };
}

export type PlanBadge = { label: string; tone: "trial" | "plan" | "warn" };

// What plan this account is on, in two words, for the dashboard chrome.
//
// The tier was previously visible ONLY on /billing, so "how many sites does my
// plan allow" and "am I still in the trial" were questions you had to navigate
// to answer - and the add-site limit that enforces the tier gave no hint the
// tier existed at all.
//
// A TRIAL outranks the tier name. Polar models a trial as status "trialing" on
// the tier the customer picked (Starter today - the only tier with one), so
// showing "Starter" during those seven days would hide the single most
// time-sensitive fact about the account: that a card is about to be charged.
// isActive() treats both the same, so nothing downstream cares which one shows.
//
// null when there is nothing truthful to say: self-host, billing unconfigured,
// or an account that has never subscribed (a fresh signup is mid-onboarding,
// not planless). A dead plan still gets a badge - it's the one state where
// silence reads as "everything's fine".
export function planBadge(sub: Subscription | null): PlanBadge | null {
  if (!isCloudMode() || !polarConfigured() || !sub) return null;
  if (sub.status === "trialing") return { label: "Free trial", tone: "trial" };
  if (sub.status === "active") return { label: TIER_NAMES[sub.tier] ?? sub.tier, tone: "plan" };
  if (sub.status === "past_due") return { label: "Past due", tone: "warn" };
  return { label: "Plan ended", tone: "warn" };
}

// "This database doesn't have that column (yet)", told apart from every other
// write failure. PostgREST answers PGRST204 on a write naming an unknown
// column and 42703 when Postgres itself rejects it; both spell the message out,
// and the column name must appear in it so an unrelated missing column can
// never be waved through as "expected".
function isMissingColumn(error: { code?: string; message?: string }, column: string): boolean {
  const code = error.code ?? "";
  const msg = error.message ?? "";
  const known =
    code === "PGRST204" || code === "42703" || /does not exist|could not find/i.test(msg);
  return known && msg.includes(column);
}

// Polar does not always carry customer.external_id. Every CANCELLED
// subscription in the live account has it empty (checked 2026-08-02: 9 of 9),
// so subscription.canceled / .revoked arrived with no way to name the account
// and the webhook discarded them - which is why a subscription cancelled on
// 2026-07-31 still read "active" here two days later, granting a non-paying
// account full access and platform DataForSEO spend.
//
// The ids we already stored at checkout are the way back: provider_subscription_id
// identifies the exact subscription, provider_customer_id the account. Both are
// written by applySubscriptionState on the FIRST event (subscription.created
// always carries externalId), so by the time a cancellation arrives the row is
// already findable. Subscription id first - it is the narrower key, and a
// customer can hold more than one subscription over time.
export async function findUserIdForSubscription(
  providerSubscriptionId?: string | null,
  providerCustomerId?: string | null,
): Promise<string | null> {
  for (const [column, value] of [
    ["provider_subscription_id", providerSubscriptionId],
    ["provider_customer_id", providerCustomerId],
  ] as const) {
    if (!value) continue;
    const { data, error } = await db()
      .from("subscriptions")
      .select("user_id")
      .eq(column, value)
      .maybeSingle();
    // A read error is not "no match" - fall through to the next key rather
    // than reporting a definitive miss off a transient failure.
    if (error) continue;
    const userId = (data as { user_id?: string } | null)?.user_id;
    if (userId) return userId;
  }
  return null;
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
  cancelAtPeriodEnd?: boolean;
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
  }
  if (state.providerCustomerId !== undefined) row.provider_customer_id = state.providerCustomerId;
  if (state.providerSubscriptionId !== undefined)
    row.provider_subscription_id = state.providerSubscriptionId;
  if (state.currentPeriodEnd !== undefined) row.current_period_end = state.currentPeriodEnd;
  if (state.cancelAtPeriodEnd !== undefined) row.cancel_at_period_end = state.cancelAtPeriodEnd;
  let { error } = await db().from("subscriptions").upsert(row, { onConflict: "user_id" });
  // Migrations here are applied by hand, so a deploy can legitimately land
  // minutes before 0047 does. Everything else in this row is older than that
  // column, and a plan whose status/tier/period couldn't be written because a
  // COSMETIC flag was unknown is a far worse outcome than a missing flag: it is
  // the "customer paid, has no plan" failure the comment below is about. So on
  // the one error that means exactly "this database predates 0047", drop the
  // new field and write the rest. Any other error still throws.
  if (error && isMissingColumn(error, "cancel_at_period_end")) {
    delete row.cancel_at_period_end;
    console.warn("[billing] subscriptions.cancel_at_period_end missing - apply migration 0047");
    ({ error } = await db().from("subscriptions").upsert(row, { onConflict: "user_id" }));
  }
  // THROW, do not swallow. This is the only write to `subscriptions` anywhere in
  // the repo, and there is no reconciliation job to repair a dropped one - so a
  // swallowed error here is permanent. Returning void meant the webhook route
  // could not tell the write had failed and answered 200, Polar recorded a
  // successful delivery, and it never redelivered. Both directions hurt: a
  // customer who just paid is left with no plan (every cron gated, /plans still
  // showing them pricing) while their card is charged monthly, and a lost
  // cancellation strands the row at "active" forever, so a non-paying account
  // keeps full access and keeps spending the platform's DataForSEO budget.
  // Throwing gives the route a 500, which is exactly the signal Polar's retry
  // schedule exists for; the upsert is idempotent on user_id, so redelivery is
  // safe (2026-07-27).
  if (error) {
    // Carry the Postgres code so the webhook can tell a PERMANENT failure from
    // a transient one. 23503 (foreign-key violation) means the auth user row is
    // gone - subscriptions.user_id cascades from auth.users, so deleting an
    // account removes the row, and any later Polar event for that customer
    // (the revoke we ourselves triggered, or a renewal) can never be written.
    // Retrying that forever would burn all 10 of Polar's attempts and get the
    // endpoint auto-disabled for EVERY customer.
    const err = new Error(`subscription upsert failed: ${error.message}`) as Error & {
      pgCode?: string;
    };
    err.pgCode = error.code;
    throw err;
  }
  // The pending-cancel case has to be tested BEFORE the status test, because a
  // subscription cancelled at period end is still `active` - so the plain
  // status mapping filed every cancellation as an ACTIVATION, exactly
  // backwards, and the churn it represents never showed up in the funnel.
  // Doing it here rather than at the click means portal-initiated
  // cancellations are counted too; the webhook sees both.
  const event =
    state.cancelAtPeriodEnd && ["active", "trialing"].includes(state.status)
      ? "subscription_cancel_scheduled"
      : ["active", "trialing"].includes(state.status)
        ? "subscription_activated"
        : ["canceled", "revoked"].includes(state.status)
          ? "subscription_canceled"
          : "subscription_updated";
  await captureServer(state.userId, event, { tier: state.tier ?? undefined, status: state.status });
}

export type CancelOutcome =
  | { ok: true; endsAt: string | null }
  | { ok: false; error: string; portal?: boolean };

// Schedule (or call off) a cancellation, in one place, for whoever asks - the
// billing page's server action today, anything else later.
//
// AT PERIOD END, never immediately. The customer paid through the end of the
// period; taking their sites off autopilot the moment they click cancel would
// be keeping money for a service we stopped providing. Polar models this
// exactly: the subscription stays `active`/`trialing` until the period runs
// out, so isActive() keeps returning true and every gate downstream keeps
// letting them work, with no special-casing anywhere. During a TRIAL the same
// call means the card is simply never charged.
//
// `cancel: false` is the same API call inverted - it un-schedules a pending
// cancellation, which is what lets someone change their mind without going
// through checkout again and landing a second parallel subscription.
export async function setCancelAtPeriodEnd(
  userId: string,
  cancel: boolean,
  opts: {
    reason?: CancellationReason | null;
    comment?: string | null;
    /** For the owner notification only - "who cancelled" is the first thing you want to know. */
    email?: string | null;
  } = {},
): Promise<CancelOutcome> {
  const reason = opts.reason ?? null;
  // Polar rejects overlong values and nobody writes an essay in a cancel box.
  const comment = opts.comment?.trim().slice(0, 1000) || null;
  if (!isCloudMode() || !polarConfigured()) {
    return { ok: false, error: "Billing isn't enabled on this deployment." };
  }

  let sub: Subscription | null;
  try {
    sub = await getSubscriptionOrThrow(userId);
  } catch {
    // Same posture as deleteAccount: "couldn't read it" must never be acted on
    // as "there's nothing there". Nothing has changed yet, so retrying is free.
    return {
      ok: false,
      error: "Couldn't reach your billing record just now. Try again in a moment.",
    };
  }

  // No id to act on - a pre-billing row, or a plan that never went through
  // Polar. Send them to the portal rather than claim there's nothing to cancel.
  if (!sub?.provider_subscription_id) {
    return {
      ok: false,
      error: "We couldn't find a subscription to change on this account.",
      portal: true,
    };
  }
  // Polar can't uncancel a subscription that has actually ended, and there's
  // nothing left to cancel on one either - but the two need different sentences
  // or the resume button answers a question nobody asked.
  if (TERMINAL_STATUSES.has(sub.status)) {
    return {
      ok: false,
      error: cancel
        ? "This plan has already ended - there's nothing left to cancel."
        : "This plan has already ended, so it can't be restarted. Pick a plan above to start again.",
    };
  }

  let endsAt: string | null = sub.current_period_end;
  try {
    const updated = await polar().subscriptions.update({
      id: sub.provider_subscription_id,
      subscriptionUpdate: {
        cancelAtPeriodEnd: cancel,
        // Polar surfaces these back to the customer in their purchases library,
        // so only send what they actually chose to say. Sending them here is
        // also what makes the feedback DURABLE: it lives on the subscription
        // record whether or not the notification email below goes through.
        ...(cancel && reason ? { customerCancellationReason: reason } : {}),
        ...(cancel && comment ? { customerCancellationComment: comment } : {}),
      },
    });
    endsAt = (updated.endsAt ?? updated.currentPeriodEnd)?.toISOString() ?? endsAt;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Polar rejects re-cancelling an already-cancelled subscription. That is
    // the state the caller wanted, so treat it as success rather than making
    // someone stare at an error about a thing that is already done.
    if (cancel && /already.?cancell?ed/i.test(msg)) {
      await writeCancelFlag(userId, true, endsAt);
      return { ok: true, endsAt };
    }
    console.error(`[billing] ${cancel ? "cancel" : "resume"} failed for ${userId}: ${msg}`);
    return {
      ok: false,
      error: cancel
        ? "We couldn't cancel your plan automatically. Open the billing portal and cancel there - it takes effect the same way."
        : "We couldn't restart your plan automatically. Open the billing portal to sort it out.",
      portal: true,
    };
  }

  // Polar has accepted it; write it locally too. The `subscription.canceled`
  // webhook will say the same thing seconds later (and is still the source of
  // truth), but a dashboard that looks unchanged after the click is how someone
  // ends up cancelling twice or emailing support to ask whether it worked.
  await writeCancelFlag(userId, cancel, endsAt);
  // Only the resume is captured here. `subscription_cancel_scheduled` belongs
  // to the webhook (see applySubscriptionState) so that cancellations made in
  // the provider's own portal are counted the same as these - emitting it from
  // both places would double-count every dashboard cancellation. The reason the
  // customer picked is stored on their subscription at Polar, which is where
  // churn reasons are read anyway.
  if (!cancel) await captureServer(userId, "subscription_resumed", { tier: sub.tier });
  if (cancel) {
    await notifyOwnerOfCancellation({
      email: opts.email ?? null,
      tier: sub.tier,
      reason,
      comment,
      endsAt,
    });
  }
  return { ok: true, endsAt };
}

// Tell the owner someone cancelled, and what they said on the way out.
//
// Every cancellation is sent, feedback or not: churn is worth knowing about on
// its own, and an empty one still says "this person left without telling us
// why", which is its own signal. Volume is low enough that this can't become
// noise, and unlike the churn event in PostHog it lands somewhere a human
// actually reads.
//
// Best-effort by design. The customer's cancellation has already gone through
// at this point, and no mail problem may be allowed to fail it or to make them
// think it didn't work. The feedback is NOT lost if this fails - it is stored
// on the subscription at Polar by the call above, which is the durable copy.
// The console line is there so a missing RESEND_API_KEY shows up in the logs
// instead of silently swallowing customer feedback forever.
async function notifyOwnerOfCancellation(input: {
  email: string | null;
  tier: Tier;
  reason: CancellationReason | null;
  comment: string | null;
  endsAt: string | null;
}): Promise<void> {
  const who = input.email ?? "an account with no email on file";
  const reasonLine = input.reason ? REASON_LABELS[input.reason] : "(not given)";
  const body =
    `${who} cancelled their ${input.tier} plan.\n\n` +
    `Reason: ${reasonLine}\n` +
    `What they said: ${input.comment || "(nothing)"}\n\n` +
    `Access runs until: ${input.endsAt ? new Date(input.endsAt).toDateString() : "unknown"}\n` +
    `The full record, including this feedback, is on the subscription in Polar.`;

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ALERT_EMAIL;
  if (!apiKey || !to) {
    console.warn(
      `[billing] cancellation feedback not emailed (no RESEND_API_KEY/ALERT_EMAIL):\n${body}`,
    );
    return;
  }
  // `||` not `??` - docker passes this through as a present-but-empty string.
  // Same fix and full story in cron-alerts.ts.
  const from = process.env.ALERT_EMAIL_FROM || "DispatchSEO <onboarding@resend.dev>";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to,
        subject: `DispatchSEO cancellation: ${who} (${input.tier})`.slice(0, 180),
        text: body,
      }),
      signal: AbortSignal.timeout(15000),
    });
    // Log the body on a failed send so the feedback still reaches the logs
    // rather than evaporating with the HTTP error.
    if (!res.ok) console.error(`[billing] cancellation email failed HTTP ${res.status}:\n${body}`);
  } catch (e) {
    console.error(`[billing] cancellation email failed: ${String(e)}\n${body}`);
  }
}

// States where a cancellation is already a settled fact. A DENYLIST for the
// same reason deleteAccount uses one: an unknown status errs toward "try to
// cancel it", and a redundant cancel is a no-op while a missed one keeps
// charging a card.
const TERMINAL_STATUSES = new Set(["canceled", "cancelled", "revoked", "incomplete_expired"]);

// Best-effort local mirror of what Polar just confirmed. Deliberately does NOT
// throw: the money side already succeeded, and failing the whole action over a
// display flag would tell someone their cancellation didn't go through when it
// did - the one lie this flow must never tell. The webhook repairs the row.
async function writeCancelFlag(
  userId: string,
  cancel: boolean,
  endsAt: string | null,
): Promise<void> {
  const { error } = await db()
    .from("subscriptions")
    .update({
      cancel_at_period_end: cancel,
      current_period_end: endsAt,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  if (error) console.error(`[billing] cancel flag write failed for ${userId}: ${error.message}`);
}

// The site-allowance arithmetic, given a subscription and a count the caller
// already has. Split out so the dashboard layout can render the "plan full"
// state without a second round trip: it has already loaded the subscription
// (for planNotice) and the owner's projects (for the switcher), which is
// exactly the same set remainingSites() would go and COUNT again. Both callers
// share this one definition so the button the owner sees and the gate that
// refuses them can never disagree.
export function sitesRemaining(sub: Subscription | null, ownedCount: number): number | null {
  if (!isCloudMode() || !polarConfigured()) return null;
  if (!isActive(sub)) return 0;
  return Math.max(0, sub!.sites_limit - ownedCount);
}

// How many more sites this user's plan allows. null = unlimited (self-host,
// or cloud with billing not yet configured - fail open, never lock the
// owner out of their own product because an env var is missing).
//
// Counts from the database rather than trusting a caller's list: this is the
// enforcement path (createProjectCore), and it has to be right even when it's
// reached from somewhere that never loaded the owner's projects.
export async function remainingSites(userId: string): Promise<number | null> {
  if (!isCloudMode() || !polarConfigured()) return null;
  const sub = await getSubscription(userId);
  if (!isActive(sub)) return 0;
  const { count } = await db()
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("owner_user_id", userId);
  return sitesRemaining(sub, count ?? 0);
}

// Same positive-only memo as getSubscription above, for the same reason: a
// null is "self-host / pre-0031 / couldn't read it", any of which can differ
// on the next call within a request (project creation sets an owner mid-flow),
// while a found owner is immutable for the life of the request.
const projectOwnerMemo = cache(() => new Map<string, string>());

// The owner lookup planGate and platformBudgetGate (see
// dataforseo-usage.ts) all need: which user owns this project, or null for
// self-host/pre-0031 rows. Collapses any lookup error the same way every
// caller already tolerated - "can't tell who owns it" reads as "don't gate".
export async function ownerUserIdForProject(projectId: string): Promise<string | null> {
  const memo = projectOwnerMemo();
  const hit = memo.get(projectId);
  if (hit) return hit;
  const { data, error } = await db()
    .from("projects")
    .select("owner_user_id")
    .eq("id", projectId)
    .maybeSingle();
  if (error || !data) return null;
  const ownerId = (data as { owner_user_id: string | null }).owner_user_id;
  if (ownerId) memo.set(projectId, ownerId);
  return ownerId;
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
  const ownerId = await ownerUserIdForProject(projectId); // null = pre-0031 row or no owner
  if (!ownerId) return { allowed: true };
  const sub = await getSubscription(ownerId);
  if (!isActive(sub)) return { allowed: false, reason: "subscription inactive" };
  const covered = (await ownedProjectsOldestFirst(ownerId)).slice(0, sub!.sites_limit);
  if (!covered.includes(projectId)) {
    return { allowed: false, reason: `beyond the plan's ${sub!.sites_limit}-site limit` };
  }
  return { allowed: true };
}

// planGate's verdict for every project at once, as a set of SLUGS - the shape
// the alerting rails need, because they work in job names ("seo-daily--acme"),
// not project ids.
//
// Why this exists. planGate stops the WORK when a plan lapses: crons skip the
// project, the scheduler never dispatches a build, DataForSEO is never called.
// It never stopped the NOISE, and the noise has its own engine - the customer's
// own repo keeps its GitHub-side schedules (the daily health check, the
// builders' dead-man's crons, the auto-merge sweep), which run on GitHub's
// clock, not ours, and phone their outcomes home. So an account that stopped
// paying kept filing failure rows, kept lighting the Home banner, and kept
// emailing - the operator AND the ex-customer - about a pipeline it was no
// longer entitled to have running. Maxpertise's trial lapsed and its dead
// Claude credential mailed the operator every morning for a week
// (2026-08-11). A plan that has stopped buying the work has stopped buying
// the alerting about it too.
//
// Computed in two queries and joined in memory rather than calling planGate
// per job: getCronHealth runs on every dashboard render and once per project
// inside the schedulers, and planGate costs three round-trips each time.
//
// FAILS OPEN in every direction - self-host, unconfigured billing, ownerless
// projects, any query error - and the asymmetry is deliberate: a wrong "paused"
// silences a PAYING customer's broken pipeline, which is far more expensive
// than one stray email about a lapsed one.
export const planPausedProjectSlugs = cache(async (): Promise<Set<string>> => {
  const paused = new Set<string>();
  if (!isCloudMode() || !polarConfigured()) return paused;
  try {
    const { data: projects, error } = await db()
      .from("projects")
      .select("slug, owner_user_id")
      .order("created_at", { ascending: true }); // same order coverage is decided in
    if (error || !projects) return paused;
    const byOwner = new Map<string, string[]>();
    for (const p of projects as Array<{ slug: string; owner_user_id: string | null }>) {
      if (!p.owner_user_id) continue; // ownerless = never gated, exactly like planGate
      byOwner.set(p.owner_user_id, [...(byOwner.get(p.owner_user_id) ?? []), p.slug]);
    }
    if (byOwner.size === 0) return paused;
    const { data: subs, error: subErr } = await db()
      .from("subscriptions")
      .select("user_id, status, sites_limit");
    if (subErr) return paused;
    const subByUser = new Map(
      ((subs ?? []) as Array<{ user_id: string } & Subscription>).map((s) => [s.user_id, s]),
    );
    for (const [ownerId, slugs] of byOwner) {
      const sub = subByUser.get(ownerId) ?? null;
      // No subscription row at all is NOT lapsed: a fresh signup is
      // mid-onboarding, and planGate (via isActive(null)) is the authority
      // both ways - it denies that account too, so its projects pause here in
      // the same breath they stop being worked on.
      if (!isActive(sub)) {
        for (const slug of slugs) paused.add(slug);
        continue;
      }
      for (const slug of slugs.slice(sub!.sites_limit)) paused.add(slug); // downgrade overflow
    }
    return paused;
  } catch {
    return new Set();
  }
});

// The plan a project runs on, for the autopilot's cadence and its report.
// tier null = there is no plan to read (self-host, billing unconfigured, an
// ownerless operator row, or an owner with no subscription row yet); status
// says which: "self-host" | "unbilled" | "none" | the Polar status. A trial
// reads as Starter whatever product it was started on, because the trial is
// what the decision table prices.
export async function projectPlan(
  projectId: string,
): Promise<{ tier: Tier | null; status: string; articlesPerWeek: number }> {
  if (!isCloudMode()) return { tier: null, status: "self-host", articlesPerWeek: UNBILLED_ARTICLES_PER_WEEK };
  if (!polarConfigured()) return { tier: null, status: "unbilled", articlesPerWeek: UNBILLED_ARTICLES_PER_WEEK };
  const ownerId = await ownerUserIdForProject(projectId);
  if (!ownerId) return { tier: null, status: "unbilled", articlesPerWeek: UNBILLED_ARTICLES_PER_WEEK };
  const sub = await getSubscription(ownerId);
  if (!sub) return { tier: null, status: "none", articlesPerWeek: 0 };
  const tier: Tier = sub.status === "trialing" ? "starter" : sub.tier;
  return { tier, status: sub.status, articlesPerWeek: isActive(sub) ? articlesPerWeekFor(tier) : 0 };
}
