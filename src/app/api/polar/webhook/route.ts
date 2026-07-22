import { validateEvent, WebhookVerificationError } from "@polar-sh/sdk/webhooks";
import { applySubscriptionState, tierForProductId } from "@/lib/billing";

// Polar webhook. Subscribed to customer.state_changed - Polar's recommended
// single source of truth: it fires on every subscription lifecycle change
// and carries the customer's FULL current state, so handling is idempotent
// (no event ordering to reason about). The customer's external id IS the
// Supabase user id (set at checkout).

export async function POST(req: Request): Promise<Response> {
  const secret = process.env.POLAR_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "webhook not configured" }, { status: 500 });

  let event: ReturnType<typeof validateEvent>;
  try {
    event = validateEvent(
      await req.text(),
      Object.fromEntries(req.headers.entries()),
      secret,
    );
  } catch (e) {
    if (e instanceof WebhookVerificationError) {
      return Response.json({ error: "invalid signature" }, { status: 403 });
    }
    throw e;
  }

  if (event.type === "customer.state_changed") {
    const state = event.data;
    const userId = state.externalId;
    if (!userId) return Response.json({ ok: true, skipped: "no external id" });
    const active = state.activeSubscriptions?.[0] ?? null;
    if (active) {
      await applySubscriptionState({
        userId,
        status: "active",
        tier: tierForProductId(active.productId),
        providerCustomerId: state.id,
        providerSubscriptionId: active.id,
        currentPeriodEnd: active.currentPeriodEnd
          ? new Date(active.currentPeriodEnd).toISOString()
          : null,
      });
    } else {
      // No active subscriptions left: canceled/expired. Keep the stored tier
      // for display; status gates access.
      await applySubscriptionState({ userId, status: "canceled", providerCustomerId: state.id });
    }
  }

  return Response.json({ ok: true });
}
