import { redirect } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";
import { currentUserStrict } from "@/lib/cloud-auth";
import { isCloudMode } from "@/lib/cloud";
import {
  getSubscription,
  isBillingInterval,
  polar,
  polarConfigured,
  productIdForTier,
  type Tier,
} from "@/lib/billing";
import { captureServer } from "@/lib/posthog-server";
import { pendingSetupProject, readSetupSite } from "@/lib/setup-flow";

// GET /api/polar/checkout?tier=starter|growth|scale[&interval=month|year] -
// sends the signed-in user to a Polar checkout for that tier. The interval
// picks the monthly or the yearly Polar product (default monthly, so every
// older link keeps working). externalCustomerId ties the Polar customer to the
// Supabase user id, which is what the webhook maps back on.
//
// &flow=setup is the cloud setup's checkout step (a paid plan picked on the
// pricing page). The account always exists first (owner, 2026-11-08: no
// trial, a free plan), so every checkout carries externalCustomerId and the
// return route (/api/polar/return) only has to check it is the same user.
export async function GET(req: NextRequest) {
  if (!isCloudMode() || !polarConfigured()) {
    return NextResponse.json({ error: "billing not enabled" }, { status: 404 });
  }
  const setupFlow = req.nextUrl.searchParams.get("flow") === "setup";
  const user = await currentUserStrict();
  // Setup's sign-in step comes first, so a signed-out setup visitor is back
  // at the start; anyone else signs in.
  if (!user) redirect(setupFlow ? "/onboarding" : "/login");
  const site = setupFlow ? await readSetupSite() : null;

  const tier = (req.nextUrl.searchParams.get("tier") ?? "") as Tier;
  const rawInterval = req.nextUrl.searchParams.get("interval") ?? "month";
  if (!isBillingInterval(rawInterval)) {
    return NextResponse.json({ error: "unknown interval" }, { status: 400 });
  }
  const interval = rawInterval;
  const productId = productIdForTier(tier, interval);
  // A yearly link on a deployment whose yearly products are not configured is
  // a 400, never a silent fallback to monthly: the page advertised one price
  // and the checkout would charge another.
  if (!productId) return NextResponse.json({ error: "unknown tier" }, { status: 400 });

  // Last line of defence against a SECOND parallel subscription on one account.
  // Both callers already try to avoid it - /plans redirects an active subscriber
  // away, and /billing points them at the portal (which prorates and REPLACES
  // rather than stacking) - but both of those decisions rest on getSubscription,
  // which deliberately collapses a read error to null. So a transient Supabase
  // blip is enough to show a paying customer the pricing page and let them buy a
  // plan they already have, and their card gets charged twice with no
  // reconciliation job to catch it. This route is the only place the charge
  // actually originates, so the check belongs here too. past_due is included on
  // purpose: the subscription still exists at Polar, so the fix for a failed
  // payment is the portal, not a second subscription beside the unpaid one.
  const existing = await getSubscription(user.id);
  if (existing && ["active", "trialing", "past_due"].includes(existing.status)) {
    redirect("/api/polar/portal");
  }

  const origin = req.nextUrl.origin;
  // Polar fills {CHECKOUT_ID} in; the return route reads the checkout back
  // and writes the plan row before the webhook lands.
  const returnUrl = `${origin}/api/polar/return?checkout_id={CHECKOUT_ID}`;
  // A site already in setup is the one this plan is for, whatever address
  // the cookie holds (the return route reuses that project, too).
  const pending = setupFlow ? await pendingSetupProject() : null;
  const setupDomain = pending?.domain ?? (site?.ok ? site.domain : null);
  const checkout = await polar().checkouts.create({
    products: [productId],
    externalCustomerId: user.id,
    customerEmail: user.email ?? undefined,
    ...(setupFlow && setupDomain ? { metadata: { domain: setupDomain } } : {}),
    // The setup flow comes back through the return route, which writes the
    // plan row itself instead of waiting on the webhook. Every other caller
    // is an upgrade from inside the dashboard (a free site, or a lapsed
    // plan), so it lands back on Billing, which says the payment went through.
    successUrl: setupFlow ? returnUrl : `${origin}/billing?success=1`,
  });
  await captureServer(user.id, "checkout_started", { tier, interval, ...(setupFlow ? { flow: "setup" } : {}) });
  redirect(checkout.url);
}
