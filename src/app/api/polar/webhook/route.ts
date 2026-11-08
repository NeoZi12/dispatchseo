import { validateEvent, WebhookVerificationError } from "@polar-sh/sdk/webhooks";
import { applyUnlessSecondPlan, findUserIdForSubscription, polar, tierForProductId } from "@/lib/billing";
import { reportCronRun } from "@/lib/cron-alerts";

// Polar webhook. Two event families, because neither alone is sufficient:
//
//   subscription.* - the SOURCE OF TRUTH. The event names the subscription and
//     the live object fetched from Polar carries its own `status` field, so a
//     TRIAL (status "trialing") activates correctly. customer.state_changed can't do this: its active_subscriptions
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
  // Set the moment a cancellation is scheduled, and back to false on
  // subscription.uncanceled. Note that `status` does NOT change with it - a
  // subscription cancelled at period end stays active/trialing until the period
  // ends - so this is the only field that carries the news.
  cancelAtPeriodEnd?: boolean;
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

// A failed subscription write is money-critical and must reach a human, not
// just Polar's delivery log. The 500 gets Polar to retry (which covers a
// transient blip); the cron_runs row gets the Home banner and the alert email
// (which covers a persistent one, where Polar would otherwise exhaust its
// retries in silence). reportCronRun never throws, so it cannot itself turn
// this into a different failure.
async function webhookWriteFailed(
  e: unknown,
  eventType: string,
  userId: string,
  status: string,
): Promise<Response> {
  const message = e instanceof Error ? e.message : String(e);
  // A foreign-key violation means the account this event belongs to no longer
  // exists, so no retry can ever succeed. Answer 200 for that one: Polar
  // disables an endpoint after 10 CONSECUTIVE non-2xx deliveries, and a single
  // deleted account produces exactly such a poison event (its own revoke, then
  // every later renewal) - which would silently take billing webhooks down for
  // every other customer. Everything else still 500s, because that is the
  // signal Polar's retry schedule exists for. Either way the failure is
  // recorded and alerted, so nothing goes quiet.
  const permanent = (e as { pgCode?: string } | null)?.pgCode === "23503";
  await reportCronRun(
    "polar-webhook",
    { error: message, event: eventType, userId, status, permanent },
    true,
  );
  return Response.json(
    { error: "subscription write failed", permanent },
    { status: permanent ? 200 : 500 },
  );
}

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
    // Retries can arrive out of order (a delayed subscription.active landing
    // after subscription.revoked), so the event body is only a pointer: the
    // live subscription fetched from Polar is the only authoritative state.
    // A failed fetch answers 500 so Polar retries the delivery.
    let live;
    try {
      live = await polar().subscriptions.get({ id: sub.id });
    } catch (e) {
      console.error(
        `[polar-webhook] ${event.type}: could not fetch subscription ${sub.id}: ${e instanceof Error ? e.message : String(e)}`,
      );
      return Response.json({ error: "subscription fetch failed" }, { status: 500 });
    }
    // Store the subscription's real status - isActive() treats "active" and
    // "trialing" as access-granting, everything else (past_due, canceled,
    // revoked, incomplete) as gated.
    const state = {
      status: live.status as string,
      tier: tierForProductId(live.productId),
      providerCustomerId: live.customerId ?? null,
      providerSubscriptionId: live.id,
      currentPeriodEnd: live.currentPeriodEnd ? new Date(live.currentPeriodEnd).toISOString() : null,
      cancelAtPeriodEnd: Boolean(live.cancelAtPeriodEnd),
    };
    if (userId) {
      // Never over a DIFFERENT live plan on the same account (see
      // applyUnlessSecondPlan) - an event for an old subscription must not
      // replace the one the account runs on.
      try {
        await applyUnlessSecondPlan(userId, state, event.type);
      } catch (e) {
        return await webhookWriteFailed(e, event.type, userId, state.status);
      }
    } else {
      // No externalId. Polar leaves it empty on every cancellation we have seen,
      // so this is the NORMAL path for subscription.canceled / .revoked, not an
      // edge case - it silently dropped every cancellation until 2026-08-02.
      // Fall back to the ids we stored at checkout before giving up.
      const known = await findUserIdForSubscription(sub.id, sub.customerId);
      if (known) {
        try {
          await applyUnlessSecondPlan(known, state, event.type);
        } catch (e) {
          return await webhookWriteFailed(e, event.type, known, state.status);
        }
        return Response.json({ ok: true });
      }
      // Genuinely unattributable. Never a console line only: a dropped billing
      // event is money, and the log rolls off long before anyone reads it.
      // Answer 200 - no retry can conjure an id Polar never sent - but put it
      // on the banner + email rails so the event can be replayed by hand.
      await reportCronRun(
        "polar-webhook",
        {
          error:
            `${event.type} for Polar subscription ${sub.id} (customer ${sub.customerId ?? "unknown"}) ` +
            `carried no customer.external_id and matches no stored subscription - ` +
            `status "${state.status}" was NOT applied. Look the subscription up in Polar and ` +
            `reconcile the account by hand.`,
          event: event.type,
        },
        true,
      );
    }
    return Response.json({ ok: true });
  }

  if (event.type === "customer.state_changed") {
    const state = event.data;
    const userId = state.externalId;
    const active = state.activeSubscriptions?.[0] ?? null;
    // Upgrade-only: never downgrade on an empty list (see header comment).
    if (userId && active) {
      try {
        await applyUnlessSecondPlan(userId, {
          // NEVER invent a status. This branch hardcoded "active", and since it
          // fires ~2 seconds after subscription.created it silently overwrote
          // the "trialing" that event had just written correctly - so every
          // trial has been stored, and displayed, as a paid plan. planBadge()
          // exists to show "Free trial" precisely because a card is about to be
          // charged; that badge could never fire (found live 2026-08-02, with
          // two customers days from their first charge).
          status: active.status ?? "active",
          tier: tierForProductId(active.productId),
          providerCustomerId: state.id,
          providerSubscriptionId: active.id,
          currentPeriodEnd: active.currentPeriodEnd
            ? new Date(active.currentPeriodEnd).toISOString()
            : null,
        }, event.type);
      } catch (e) {
        return await webhookWriteFailed(e, event.type, userId, "active");
      }
    }
  }

  return Response.json({ ok: true });
}
