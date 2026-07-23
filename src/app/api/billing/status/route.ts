import { NextResponse } from "next/server";
import { dashboardAuth } from "@/lib/auth-gate";
import { isCloudMode } from "@/lib/cloud";
import { getSubscription, isActive } from "@/lib/billing";

export const dynamic = "force-dynamic";

// Polled by the post-checkout confirming screen: has the Polar webhook
// landed the subscription row yet? /api/* bypasses the proxy cookie gate,
// so the route re-checks auth itself like every other API route.
export async function GET() {
  const auth = await dashboardAuth();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isCloudMode() || !auth.user) {
    return NextResponse.json({ active: false });
  }
  const sub = await getSubscription(auth.user.id);
  return NextResponse.json({ active: isActive(sub) });
}
