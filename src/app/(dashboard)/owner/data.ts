import { notFound } from "next/navigation";

import { requireDashboard } from "@/lib/auth-gate";
import { isOperator } from "@/lib/autopilot/operator";
import { isCloudMode } from "@/lib/cloud";
import { customersReport, parseRange, trafficReport, type CustomersReport, type Range, type TrafficReport } from "@/lib/owner-analytics";

// What every /owner page does first: the gate, the range, and the two reads
// most sections build on. Each page loads only the halves it shows, and each
// half fails on its own (a missing migration or a slow Polar must never blank
// the other).

export type Settled<T> = { value: T; error: null } | { value: null; error: string };

export function settle<T>(p: Promise<T>): Promise<Settled<T>> {
  return p.then(
    (value) => ({ value, error: null }),
    (e: unknown) => ({ value: null, error: e instanceof Error ? e.message : String(e) }),
  );
}

/** Cloud: OPERATOR_USER_IDS only, 404 for anyone else (the page does not exist
 *  for a customer). Self-host: the one owner. */
export async function ownerGate(searchParams: Promise<{ range?: string }>): Promise<{ range: Range; now: number }> {
  const auth = await requireDashboard();
  if (isCloudMode() && !isOperator(auth.user?.id)) notFound();
  return { range: parseRange((await searchParams).range), now: Date.now() };
}

export const loadTraffic = (range: Range, now: number): Promise<Settled<TrafficReport>> => settle(trafficReport(range, now));
export const loadCustomers = (range: Range, now: number): Promise<Settled<CustomersReport | null>> => settle(customersReport(range, now));

export type SiteRef = { id: string; domain: string; owner: string | null; userId: string | null };

/** Every site, the customers' and the ownerless ones, for the Google section. */
export function allSitesOf(c: CustomersReport | null): SiteRef[] {
  return [
    ...(c?.customers ?? []).flatMap((x) => x.sites.map((s) => ({ id: s.id, domain: s.domain, owner: x.operator ? null : x.email, userId: x.userId }))),
    ...(c?.orphanSites ?? []).map((s) => ({ id: s.id, domain: s.domain, owner: null, userId: null as string | null })),
  ];
}

export function siteHrefsOf(sites: SiteRef[]): Record<string, string> {
  return Object.fromEntries(sites.filter((s) => s.userId).map((s) => [s.id, `/owner/customers/${s.userId}`]));
}

/** Turns a raw distinct id (a user id, a project id, setup:<nonce>) into a
 *  name a person recognises: the email, the domain, or a short hash. */
export function whoResolver(c: CustomersReport | null): (id: string) => string {
  const emailOf = new Map<string, string>();
  const siteOf = new Map<string, string>();
  for (const x of c?.customers ?? []) {
    emailOf.set(x.userId, x.email);
    for (const s of x.sites) siteOf.set(s.id, s.domain);
  }
  for (const s of c?.orphanSites ?? []) siteOf.set(s.id, s.domain);
  return (id: string) => emailOf.get(id) ?? siteOf.get(id) ?? (id.startsWith("setup:") ? "a visitor" : id.length > 20 ? id.slice(0, 8) : id);
}

export function visitorsError(error: string | null): string {
  return error?.includes("owner_visits") || error?.includes("web_visits")
    ? "Migration 0073 (owner analytics) has not been applied to this database yet. Apply it and reload."
    : `The visitor read failed: ${error ?? "unknown error"}.`;
}
