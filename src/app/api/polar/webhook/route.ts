import { validateEvent, WebhookVerificationError } from "@polar-sh/sdk/webhooks";
import { applySubscriptionState, tierForProductId } from "@/lib/billing";

// Polar webhook. Two event families, because neither alone is sufficient:
//
//   subscription.* - the SOURCE OF TRUTH. The event carries the subscription
//     with its own `status` field, so a TRIAL (status "trialing") activates
//     correctly. customer.state_changed can't do this: its active_subscriptions
//     list comes back EMPTY for a trialing sub (verified live 2026-07-23), so
//     relying on it alone left every trial signup stuck on "confirming payment".
//
//   customer.state_changed - an UPGRADE-ONLY backstop. If the customer has an
//     active subscription we record it, but an EMPTY list never downgrades:
//     empty can just mean a trial Polar doesn't surface here, and real
//     cancellations arrive as subscription.canceled / subscription.revoked.
//
// The customer's external id IS the Supabase user id (set at checkout). Handling
// is idempotent - applySubscriptionState upserts by user_id.

type PolarSubscription = {
  id: string;
  status: string;
  productId: string;
  customerId?: string | null;
  currentPeriodEnd?: string | null;
  customer?: { externalId?: string | null } | null;
};

const SUBSCRIPTION_EVENTS = new Set([
  "subscription.created",
  "subscription.updated",
  "subscription.active",
  "subscription.canceled",
  "subscription.revoked",
  "subscription.uncanceled",
]);

export async function POST(req: Request): Promise<Response> {
  const secret = process.env.POLAR_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "webhook not configured" }, { status: 500 });

  let event: ReturnType<typeof validateEvent>;
  try {
    event = validateEvent(await req.text(), Object.fromEntries(req.headers.entries()), secret);
  } catch (e) {
    if (e instanceof WebhookVerificationError) {
      return Response.json({ error: "invalid signature" }, { status: 403 });
    }
    throw e;
  }

  if (SUBSCRIPTION_EVENTS.has(event.type)) {
    const sub = event.data as unknown as PolarSubscription;
    const userId = sub.customer?.externalId;
    if (userId) {
      // Store the subscription's real status - isActive() treats "active" and
      // "trialing" as access-granting, everything else (past_due, canceled,
      // revoked, incomplete) as gated.
      await applySubscriptionState({
        userId,
        status: sub.status,
        tier: tierForProductId(sub.productId),
        providerCustomerId: sub.customerId ?? null,
        providerSubscriptionId: sub.id,
        currentPeriodEnd: sub.currentPeriodEnd
          ? new Date(sub.currentPeriodEnd).toISOString()
          : null,
      });
    }
    return Response.json({ ok: true });
  }

  if (event.type === "customer.state_changed") {
    const state = event.data;
    const userId = state.externalId;
    const active = state.activeSubscriptions?.[0] ?? null;
    // Upgrade-only: never downgrade on an empty list (see header comment).
    if (userId && active) {
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
    }
  }

  return Response.json({ ok: true });
}
