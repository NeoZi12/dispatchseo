import { redirect } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";
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
  } catch {
    // No Polar customer yet (never checked out) - nothing to show.
    redirect("/billing?error=no-customer");
  }
  redirect(url);
}
