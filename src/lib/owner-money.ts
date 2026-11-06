import { polar, polarConfigured } from "./billing";

// Every real charge from Polar, for /owner. The subscriptions table knows a
// tier and a status; only Polar's orders know what a customer actually paid,
// what tax Polar collected on it (Polar is the merchant of record and remits
// it), what Polar kept as its fee, and what was refunded. The owner page's
// money columns come from here, so "paid" and "margin" are real charges, not
// plan list prices.
//
// One paginated read of the organisation's orders, cached for a minute so a
// range switch doesn't re-walk Polar. Capped in time and size: a slow Polar
// costs the money columns ("not available"), never the page.

export type PolarOrder = {
  id: string;
  at: string;
  /** Supabase user id when the checkout carried it (every checkout we open does). */
  externalId: string | null;
  customerId: string;
  customerEmail: string | null;
  product: string | null;
  reason: string;
  status: string;
  /** What the customer's card was charged, tax included. */
  totalUsd: number;
  taxUsd: number;
  /** Before tax, after discounts: the part that is ours before fees. */
  netUsd: number;
  /** Refunded, tax excluded. */
  refundedUsd: number;
  /** What Polar kept. */
  feeUsd: number;
};

const cents = (n: number | null | undefined) => (Number(n) || 0) / 100;

/** What an order leaves in your pocket: net of tax, refunds and Polar's fee. */
export function keptUsd(o: PolarOrder): number {
  return o.netUsd - o.refundedUsd - o.feeUsd;
}

let cache: { at: number; orders: PolarOrder[] } | null = null;
let lastError: string | null = null;

/** Why the last read failed, in plain words; null when it worked. */
export function polarOrdersError(): string | null {
  return lastError;
}
const TTL = 60_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("Polar timed out")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

async function walk(): Promise<PolarOrder[]> {
  const out: PolarOrder[] = [];
  const pages = await polar().orders.list({ limit: 100 });
  for await (const page of pages) {
    for (const o of page.result.items) {
      // Only money that moved: an unpaid draft or a failed attempt is not revenue.
      if (!o.paid) continue;
      out.push({
        id: o.id,
        at: new Date(o.createdAt).toISOString(),
        externalId: o.customer?.externalId ?? null,
        customerId: o.customerId,
        customerEmail: o.customer?.email ?? null,
        product: o.product?.name ?? null,
        reason: String(o.billingReason ?? ""),
        status: String(o.status ?? ""),
        totalUsd: cents(o.totalAmount),
        taxUsd: cents(o.taxAmount),
        netUsd: cents(o.netAmount),
        refundedUsd: cents((o.refundedAmount ?? 0) - (o.refundedTaxAmount ?? 0)),
        feeUsd: cents(o.platformFeeAmount),
      });
    }
    if (out.length >= 5000) break;
  }
  return out;
}

/** Every paid order, newest first. null when Polar is not configured or did not answer. */
export async function polarOrders(): Promise<PolarOrder[] | null> {
  if (!polarConfigured()) return null;
  if (cache && Date.now() - cache.at < TTL) return cache.orders;
  try {
    const orders = (await withTimeout(walk(), 10_000)).sort((a, b) => b.at.localeCompare(a.at));
    cache = { at: Date.now(), orders };
    lastError = null;
    return orders;
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    lastError = /insufficient_scope|403/.test(msg)
      ? "Polar's access token can't read payments: it needs the orders:read scope."
      : /timed out/.test(msg)
        ? "Polar did not answer in time."
        : `Polar error: ${msg.slice(0, 160)}`;
    return cache?.orders ?? null;
  }
}

/** Orders grouped by Supabase user id: the checkout's external id first, else
 *  the Polar customer id our subscriptions table stored for that user. */
export function ordersByUser(orders: PolarOrder[], customerToUser: Map<string, string>, knownUsers: Set<string>): Map<string, PolarOrder[]> {
  const out = new Map<string, PolarOrder[]>();
  for (const o of orders) {
    const user = o.externalId && knownUsers.has(o.externalId) ? o.externalId : customerToUser.get(o.customerId);
    if (!user) continue;
    out.set(user, [...(out.get(user) ?? []), o]);
  }
  return out;
}

export type MoneySummary = {
  orders: number;
  /** Charged to the card, tax included. */
  chargedUsd: number;
  taxUsd: number;
  feeUsd: number;
  refundedUsd: number;
  /** What you keep before your own costs: net - refunds - Polar fee. */
  keptUsd: number;
  lastPaidAt: string | null;
};

export function summarize(orders: PolarOrder[], since?: number): MoneySummary {
  const list = since == null ? orders : orders.filter((o) => new Date(o.at).getTime() >= since);
  return {
    orders: list.length,
    chargedUsd: list.reduce((a, o) => a + o.totalUsd, 0),
    taxUsd: list.reduce((a, o) => a + o.taxUsd, 0),
    feeUsd: list.reduce((a, o) => a + o.feeUsd, 0),
    refundedUsd: list.reduce((a, o) => a + o.refundedUsd, 0),
    keptUsd: list.reduce((a, o) => a + keptUsd(o), 0),
    lastPaidAt: list[0]?.at ?? null,
  };
}
