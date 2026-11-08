import { NextResponse, type NextRequest } from "next/server";
import { isCloudMode } from "@/lib/cloud";
import { currentUser } from "@/lib/cloud-auth";
import { polar, polarConfigured } from "@/lib/billing";
import { captureServer } from "@/lib/posthog-server";
import { reportCronRun } from "@/lib/cron-alerts";
import { claimCheckoutForUser, type ClaimResult } from "@/lib/setup-flow";

// Polar's success URL for the setup flow's checkout step:
// /api/polar/return?checkout_id=…
//
// The account always exists before checkout (owner, 2026-11-08), so this only
// confirms the checkout was made for the signed-in user, writes the plan row
// (claimCheckoutForUser) and sends them on to the GitHub step. A checkout made
// for any other account is refused. Safe to hit twice.

const to = (req: NextRequest, path: string) => NextResponse.redirect(new URL(path, req.url));

/** Polar is still finishing the checkout: a holding page that retries this
 *  same URL, rather than a failure notice for something that is working. */
function confirming(): Response {
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="3"><title>Confirming your payment…</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.5 system-ui,sans-serif;background:#0b0b0f;color:#e7e7ea}p{opacity:.75}@media (prefers-color-scheme:light){body{background:#fafafa;color:#18181b}}</style></head><body><main><h1 style="font-size:20px;margin:0">Confirming your payment…</h1><p>Polar is finishing up. This page checks again every few seconds.</p></main></body></html>`;
  return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

function landing(req: NextRequest, r: ClaimResult): Response {
  if ("pending" in r) return to(req, "/onboarding?checkout=success");
  if ("error" in r) return to(req, `/onboarding?error=${r.error === "taken" || r.error === "duplicate" ? r.error : "checkout"}`);
  return to(req, "/onboarding");
}

export async function GET(req: NextRequest): Promise<Response> {
  if (!isCloudMode() || !polarConfigured()) {
    return NextResponse.json({ error: "billing not enabled" }, { status: 404 });
  }
  const id = req.nextUrl.searchParams.get("checkout_id");
  if (!id || id.includes("{") || !/^[\w-]{1,100}$/.test(id)) return to(req, "/onboarding?error=checkout");

  // Signed out on the way back (a different browser, a cleared cookie): the
  // webhook writes the plan on its own, so signing in picks setup back up.
  const user = await currentUser();
  if (!user) return to(req, "/login");

  // Polar can send the browser back a beat before "confirmed" flips to
  // "succeeded"; wait briefly, then hand over to the holding page.
  let checkout;
  try {
    checkout = await polar().checkouts.get({ id });
    for (let i = 0; i < 4 && checkout.status === "confirmed"; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      checkout = await polar().checkouts.get({ id });
    }
  } catch {
    return to(req, "/onboarding?error=checkout");
  }
  if (checkout.status === "confirmed") return confirming();
  if (checkout.status !== "succeeded") return to(req, "/onboarding?error=checkout");

  // They have just been charged: a blip writing the plan row must never be
  // an error page. Reported, and the page waits for the webhook instead.
  let result: ClaimResult;
  try {
    result = await claimCheckoutForUser(checkout, user.id);
  } catch (e) {
    await reportCronRun("polar-return", { error: `Checkout ${checkout.id} for ${user.id}: ${e instanceof Error ? e.message : String(e)}` }, true);
    result = { pending: true };
  }
  if ("ok" in result) await captureServer(user.id, "setup_plan_started", {});
  return landing(req, result);
}
