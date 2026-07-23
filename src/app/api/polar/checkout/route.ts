import { redirect } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/cloud-auth";
import { isCloudMode } from "@/lib/cloud";
import { polar, polarConfigured, productIdForTier, type Tier } from "@/lib/billing";

// GET /api/polar/checkout?tier=starter|growth|scale - sends the signed-in
// user to a Polar checkout for that tier. externalCustomerId ties the Polar
// customer to the Supabase user id, which is what the webhook maps back on.
export async function GET(req: NextRequest) {
  if (!isCloudMode() || !polarConfigured()) {
    return NextResponse.json({ error: "billing not enabled" }, { status: 404 });
  }
  const user = await currentUser();
  if (!user) redirect("/login");

  const tier = (req.nextUrl.searchParams.get("tier") ?? "") as Tier;
  const productId = productIdForTier(tier);
  if (!productId) return NextResponse.json({ error: "unknown tier" }, { status: 400 });

  const origin = req.nextUrl.origin;
  const checkout = await polar().checkouts.create({
    products: [productId],
    externalCustomerId: user.id,
    customerEmail: user.email ?? undefined,
    // Straight into the wizard - the onboarding gate absorbs the webhook
    // race (checkout=success renders a confirming poll, never a bounce
    // back to /billing after the user just paid).
    successUrl: `${origin}/onboarding?new=1&checkout=success`,
  });
  redirect(checkout.url);
}
