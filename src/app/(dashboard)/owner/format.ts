// Number and date words for /owner. Server-only helpers (no "use client").

export function fmt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

export function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return fmt(n);
}

/** Dollars. Costs are often cents or less, so small amounts keep their
 *  precision instead of rounding to a lying "$0". */
export function money(usd: number, { precise = false }: { precise?: boolean } = {}): string {
  const abs = Math.abs(usd);
  const sign = usd < 0 ? "-" : "";
  if (abs === 0) return "$0";
  if (abs < 0.01) return `${sign}<$0.01`;
  if (precise && abs < 1) return `${sign}$${abs.toFixed(3)}`;
  if (abs < 100) return `${sign}$${abs.toFixed(2)}`;
  return `${sign}$${Math.round(abs).toLocaleString("en-US")}`;
}

export function pct(part: number, whole: number): string {
  if (!whole) return "–";
  const v = (part / whole) * 100;
  return `${v >= 10 || v === 0 ? Math.round(v) : v.toFixed(1)}%`;
}

/** Percent change, null when there is nothing to compare against. */
export function delta(now: number, before: number): number | null {
  if (!before) return null;
  return ((now - before) / before) * 100;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function fullDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

export function ago(iso: string | null, now = Date.now()): string {
  if (!iso) return "never";
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const d = Math.floor(s / 86400);
  if (d < 30) return `${d}d ago`;
  return shortDate(iso);
}

export function rangeLabel(range: number): string {
  return range === 7 ? "Last 7 days" : range === 30 ? "Last 30 days" : range === 90 ? "Last 90 days" : "Last 12 months";
}

/** "30 d" / "12 mo" for small meta labels. */
export function rangeShort(range: number): string {
  return range === 365 ? "12 mo" : `${range} d`;
}

/** A length of time in plain words: "16 min", "5 hours", "3 days". */
export function span(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 1) return "under a minute";
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} hour${h === 1 ? "" : "s"}`;
  const d = Math.round(h / 24);
  return `${d} days`;
}

/** How a cancellation reads under the status chip, or null when nothing was cancelled. */
export function cancelNote(p: { status: string; cancelAtPeriodEnd: boolean; startedAt?: string | null; canceledAt?: string | null; periodEnd: string | null }): string | null {
  const after = p.startedAt && p.canceledAt ? span(new Date(p.canceledAt).getTime() - new Date(p.startedAt).getTime()) : null;
  if (p.status === "trialing" && p.cancelAtPeriodEnd) return after ? `Cancelled ${after} into the trial` : "Cancelled during the trial";
  if ((p.status === "active" || p.status === "past_due") && p.cancelAtPeriodEnd) return p.periodEnd ? `Cancelled · paid until ${shortDate(p.periodEnd)}` : "Cancelled";
  if (p.status === "canceled" || p.status === "revoked") return p.canceledAt ? `Cancelled ${shortDate(p.canceledAt)}${after ? `, ${after} after starting` : ""}` : null;
  return null;
}
