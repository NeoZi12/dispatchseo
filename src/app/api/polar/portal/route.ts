import { redirect } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";
import { ResourceNotFound } from "@polar-sh/sdk/models/errors/resourcenotfound.js";
import { currentUser } from "@/lib/cloud-auth";
import { isCloudMode } from "@/lib/cloud";
import { polar, polarConfigured } from "@/lib/billing";

// GET /api/polar/portal - Polar's hosted customer portal (invoices, plan
// changes, cancellation). Resolved by the same external id the checkout set.
export async function GET(req: NextRequest) {
  if (!isCloudMode() || !polarConfigured()) {
    return NextResponse.json({ error: "billing not enabled" }, { status: 404 });
  }
  const user = await currentUser();
  if (!user) redirect("/login");
  let url: string;
  try {
    const session = await polar().customerSessions.create({ externalCustomerId: user.id });
    url = session.customerPortalUrl;
  } catch (err) {
    // ResourceNotFound = no Polar customer for this user (never checked out,
    // or a subscription row that never went through Polar) - nothing to show.
    // Anything else (auth, network, Polar outage) must NOT be silently sold to
    // the user as "pick a plan first", so log it before the same fallback.
    if (!(err instanceof ResourceNotFound)) {
      console.error(`[billing] portal session failed for ${user.id}: ${String(err)}`);
    }
    redirect("/billing?error=no-customer");
  }
  redirect(url);
}
