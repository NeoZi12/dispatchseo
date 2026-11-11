import Link from "next/link";

import { cx } from "@/components/ui/styles";
import type { Customer, CustomersReport, SiteMode } from "@/lib/owner-analytics";
import { TIER_LIMITS, TIER_NAMES, type Tier } from "@/lib/billing";
import { Panel, StatCells } from "./bits";
import { ClickRow } from "./row-link";
import { ago, cancelNote, fmt, money, rangeShort, shortDate } from "./format";

// The sections of /owner, Polar-style: hairline panels, large light figures,
// one accent per chart, numbers in mono so columns line up.

// ---------- money ----------

function StatusChip({ c }: { c: Customer }) {
  const tone = c.plan.tone;
  const word = c.plan.cancelled
    ? "Cancelled"
    : c.plan.status === "active"
      ? "Active"
      : c.plan.status === "trialing"
        ? "Trial"
        : c.plan.status === "past_due"
          ? "Past due"
          : c.plan.status === "incomplete"
            ? "Unfinished"
            : c.sites.length
              ? "Free plan"
              : "No plan";
  const cls =
    tone === "ok"
      ? "border-ok/30 bg-ok/10 text-ok"
      : tone === "active"
        ? "border-info/30 bg-info/10 text-info"
        : tone === "warn"
          ? "border-warn/30 bg-warn/10 text-warn"
          : tone === "danger"
            ? "border-danger/30 bg-danger/10 text-danger"
            : "border-line bg-surface-2 text-ink-faint";
  return <span className={cx("inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[11.5px] font-medium", cls)}>{word}</span>;
}

const MODE_LABEL: Record<SiteMode, string> = { autopilot: "Autopilot", manual: "Manual", paused: "Paused", blocked: "Wrong repo", agent: "Own agent" };
const MODE_CLS: Record<SiteMode, string> = {
  autopilot: "text-ok",
  manual: "text-info",
  paused: "text-warn",
  blocked: "text-danger",
  agent: "text-ink-faint",
};
const MODE_HINT: Record<SiteMode, string> = {
  autopilot: "Articles go live by themselves",
  manual: "Each article waits for the owner to press Publish",
  paused: "The Dispatcher is paused: nothing is written or published",
  blocked: "The connected repository doesn't build their site, so nothing can publish and the Dispatcher writes nothing until they connect the right one",
  agent: "The owner's own coding agent builds the articles",
};

/** How a customer's sites publish: Autopilot, Manual (review first), Paused,
 *  or Own agent. One tag per distinct mode, so a two-site owner with one site
 *  paused shows both. */
function ModeTag({ x, className = "" }: { x: Customer; className?: string }) {
  if (!x.sites.length) return <span className={cx("text-[12px] text-ink-faint", className)}>-</span>;
  const order: SiteMode[] = ["blocked", "paused", "manual", "autopilot", "agent"];
  const modes = order.filter((m) => x.sites.some((s) => s.mode === m));
  const many = x.sites.length > 1;
  return (
    <span className={cx("inline-flex flex-wrap items-center gap-x-2.5 gap-y-0.5", className)}>
      {modes.map((m) => {
        const sites = x.sites.filter((s) => s.mode === m);
        const reason = m === "paused" || m === "blocked" ? sites.map((s) => s.pauseReason).find(Boolean) : null;
        const title = [MODE_HINT[m], reason, many ? sites.map((s) => s.domain).join(", ") : null].filter(Boolean).join(" · ");
        return (
          <span key={m} className={cx("inline-flex items-center gap-1.5 whitespace-nowrap text-[12.5px] font-medium", MODE_CLS[m])} title={title}>
            {m === "paused" ? (
              <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" aria-hidden="true">
                <rect x="1.5" y="1" width="2.5" height="8" rx="0.6" fill="currentColor" />
                <rect x="6" y="1" width="2.5" height="8" rx="0.6" fill="currentColor" />
              </svg>
            ) : (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
            )}
            {MODE_LABEL[m]}
            {many && modes.length > 1 ? <span className="font-mono text-[11px] font-normal text-ink-faint">{sites.length}</span> : null}
          </span>
        );
      })}
    </span>
  );
}

// ---------- one subject per section ----------

/** A section's frame: a title, one plain sentence saying what it shows, an
 *  optional note on the right. */
export function SectionHead({ title, says, note }: { title: string; says: string; note?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line-soft px-5 py-4 sm:px-6">
      <div className="min-w-0">
        <h2 className="text-[16px] font-semibold tracking-tight text-ink">{title}</h2>
        <p className="mt-0.5 text-[13px] text-ink-faint">{says}</p>
      </div>
      {note ? <div className="text-[12.5px] text-ink-faint">{note}</div> : null}
    </div>
  );
}

// ---------- who is on which plan ----------

const TIER_COLOR: Record<Tier, string> = { starter: "var(--color-info)", growth: "var(--color-accent)", scale: "var(--color-ok)" };

type PlanKey = "free" | Tier;
/** The table's sections: the four plans, then the people who cancelled. */
type GroupKey = PlanKey | "cancelled";
const PLAN_KEYS: PlanKey[] = ["free", "starter", "growth", "scale"];
const PLAN_COLOR: Record<GroupKey, string> = { free: "var(--color-ink-faint)", cancelled: "var(--color-ink-faint)", ...TIER_COLOR };
const PLAN_NAME: Record<GroupKey, string> = { free: "Free", cancelled: "Cancelled", ...TIER_NAMES };

/** Where a customer sits today. A live or trialing subscription is its tier.
 *  Someone whose subscription ended, or is set to end, is CANCELLED - their
 *  own section, counted on no plan (owner, 2026-11-09: a lapsed trial is not
 *  a free-plan user; the engine gives such a site nothing). Someone with a
 *  site who never had a subscription is on the free plan. Accounts with no
 *  site and no plan are on nothing yet and stay out of the groups. */
function planKeyOf(x: Customer): GroupKey | null {
  const live = x.plan.status === "active" || x.plan.status === "past_due" || (x.plan.status === "trialing" && !x.plan.cancelled);
  if (live) return x.plan.tier ?? "starter";
  if (x.plan.cancelled) return "cancelled";
  return x.sites.length > 0 ? "free" : null;
}

type PlanGroup = { key: GroupKey; people: Customer[]; mrr: number; revenue: number; cost: number; margin: number; trials: number; leaving: number };

/** The four plan groups (tiles + table sections), the cancelled section, and
 *  the accounts on nothing. Cancelled people count toward no plan. */
function planGroups(c: CustomersReport): { groups: PlanGroup[]; cancelled: PlanGroup; idle: Customer[] } {
  const real = c.customers.filter((x) => !x.operator);
  const idle: Customer[] = [];
  const keys: GroupKey[] = [...PLAN_KEYS, "cancelled"];
  const by = new Map<GroupKey, Customer[]>(keys.map((k) => [k, []]));
  for (const x of real) {
    const k = planKeyOf(x);
    if (k) by.get(k)!.push(x);
    else idle.push(x);
  }
  // Newest sign-up first inside every plan, oldest at the bottom: the people
  // who just arrived are the ones worth looking at (Neo, 2026-11-10).
  // Cancelled re-sorts by cancel date where it is drawn.
  const newestFirst = (a: Customer, b: Customer) => b.createdAt.localeCompare(a.createdAt);
  for (const list of by.values()) list.sort(newestFirst);
  idle.sort(newestFirst);
  const all = keys.map((key) => {
    const people = by.get(key)!;
    const revenue = people.reduce((a, x) => a + x.revenueRecentUsd, 0);
    const cost = people.reduce((a, x) => a + x.totalCostRecentUsd, 0);
    return {
      key,
      people,
      mrr: people.reduce((a, x) => a + x.plan.monthlyUsd, 0),
      revenue,
      cost,
      margin: revenue - cost,
      trials: people.filter((x) => x.plan.status === "trialing").length,
      leaving: people.filter((x) => x.plan.cancelAtPeriodEnd && x.plan.status === "active").length,
    };
  });
  return { groups: all.filter((g) => g.key !== "cancelled"), cancelled: all.find((g) => g.key === "cancelled")!, idle };
}

function PlanTile({ g, range }: { g: PlanGroup; range: number }) {
  const price = g.key === "free" || g.key === "cancelled" ? "$0" : `${money(TIER_LIMITS[g.key].price)}/mo`;
  const notes = [g.trials ? `${g.trials} on trial` : null, g.leaving ? `${g.leaving} leaving` : null].filter(Boolean).join(" · ");
  return (
    <div className="flex min-w-0 flex-col bg-surface px-4 pb-4 pt-4 sm:px-6 sm:pt-5">
      <p className="flex items-center gap-2 text-[12.5px] text-ink-muted sm:text-[13px]">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: PLAN_COLOR[g.key] }} aria-hidden="true" />
        {PLAN_NAME[g.key]}
        <span className="ml-auto font-mono text-[11.5px] tabular-nums text-ink-faint">{price}</span>
      </p>
      <p className="mt-2 flex items-baseline gap-2 sm:mt-2.5">
        <span className="text-[1.5rem] font-light leading-none tracking-tight tabular-nums text-ink sm:text-[2.1rem]">{fmt(g.people.length)}</span>
        <span className="text-[12px] text-ink-faint">{g.people.length === 1 ? "person" : "people"}</span>
      </p>
      <p className="mt-2 min-h-[1rem] text-[12px] leading-snug text-ink-faint sm:text-[12.5px]">{notes || (g.key === "free" ? "sites with no paid plan" : " ")}</p>
      <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-line-soft pt-3 font-mono text-[12.5px] tabular-nums">
        {[
          ["MRR", money(g.mrr), "text-ink"],
          [`Cost ${rangeShort(range)}`, money(g.cost, { precise: true }), "text-ink"],
          ["Margin", money(g.margin), marginClass(g.people.length ? g.margin : null)],
        ].map(([k, v, cls]) => (
          <div key={k} className="min-w-0">
            <dt className="truncate font-sans text-[11px] text-ink-faint">{k}</dt>
            <dd className={cx("mt-0.5 truncate", cls)}>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function PlanRow({ x, now }: { x: Customer; now: number }) {
  const note = cancelNote(x.plan);
  return (
    <ClickRow href={`/owner/customers/${x.userId}`} className="group border-t border-line-soft transition-colors hover:bg-surface-2/40">
      <td className="max-w-[17rem] px-6 py-3">
        <span className="block truncate text-[13.5px] font-medium text-ink" title={x.email}>
          {x.email}
        </span>
        <SiteList x={x} />
      </td>
      <td className="px-3 py-3">
        <StatusChip c={x} />
        {note ? <span className="mt-1 block whitespace-nowrap text-[11.5px] text-danger/90">{note}</span> : null}
      </td>
      <td className="px-3 py-3">
        <ModeTag x={x} />
      </td>
      <td className="max-w-[13rem] px-3 py-3">
        <NextArticleCell x={x} now={now} />
      </td>
      <td className="px-3 py-3 text-right font-mono tabular-nums text-ink">{fmt(x.articles)}</td>
      <td className="px-3 py-3 text-right font-mono tabular-nums text-ink">{money(x.revenueRecentUsd)}</td>
      <td className="px-3 py-3 text-right font-mono tabular-nums text-ink">{money(x.totalCostRecentUsd, { precise: true })}</td>
      <td className={cx("px-3 py-3 text-right font-mono tabular-nums", marginClass(x.marginRecentUsd))}>{money(x.marginRecentUsd)}</td>
      <td className="hidden whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums text-ink lg:table-cell">{ago(x.lastDashboardAt, now)}</td>
      <td className="hidden whitespace-nowrap px-6 py-3 text-right font-mono tabular-nums text-ink lg:table-cell">{ago(x.lastSiteAt, now)}</td>
    </ClickRow>
  );
}

function PlanCard({ x, now }: { x: Customer; now: number }) {
  const note = cancelNote(x.plan);
  return (
    <li>
      <Link href={`/owner/customers/${x.userId}`} scroll={false} className="block px-5 py-3.5 transition-colors active:bg-surface-2/60">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[14px] font-medium text-ink">{x.email}</p>
            <SiteList x={x} />
          </div>
          <StatusChip c={x} />
        </div>
        {note ? <p className="mt-1.5 text-[12px] text-danger/90">{note}</p> : null}
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[12px] text-ink-faint">
          <ModeTag x={x} />
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">
            {fmt(x.articles)} {x.articles === 1 ? "article" : "articles"}
          </span>
        </p>
        <dl className="mt-3 grid grid-cols-3 gap-2 font-mono tabular-nums">
          {[
            ["Revenue", money(x.revenueRecentUsd), "text-ink"],
            ["Cost", money(x.totalCostRecentUsd, { precise: true }), "text-ink"],
            ["Margin", money(x.marginRecentUsd), marginClass(x.marginRecentUsd)],
          ].map(([k, v, cls]) => (
            <div key={k} className="min-w-0">
              <dt className="font-sans text-[11px] text-ink-faint">{k}</dt>
              <dd className={cx("mt-0.5 truncate text-[13px]", cls)}>{v}</dd>
            </div>
          ))}
        </dl>
        <MobileExtras x={x} now={now} />
      </Link>
    </li>
  );
}

export function PlansPanel({ c, range, now }: { c: CustomersReport; range: number; now: number }) {
  const { groups, cancelled, idle } = planGroups(c);
  const total = groups.reduce((a, g) => a + g.people.length, 0);
  // Cancelled people get no tile and no place in the headcount: they are on
  // no plan, and they sit folded under the table (CancelledSection).
  const filled = groups.filter((g) => g.people.length > 0);
  return (
    <Panel id="plans" label="Plans">
      <SectionHead
        title="Plans"
        says="How many people are on the free plan and on each paid plan, and who they are. Free means a site that never had a subscription; people who cancelled sit in their own section and count toward no plan."
        note={`${fmt(total)} ${total === 1 ? "person" : "people"} on a plan`}
      />
      <div className="grid grid-cols-2 gap-px bg-line-soft md:grid-cols-4">
        {groups.map((g) => (
          <PlanTile key={g.key} g={g} range={range} />
        ))}
      </div>
      {filled.length === 0 ? (
        <p className="border-t border-line-soft px-5 py-6 text-center text-[13px] text-ink-faint sm:px-6">Nobody has a site or a plan yet.</p>
      ) : (
        <>
          <div className="hidden border-t border-line-soft md:block">
            <table className="w-full text-left text-[13px]">
              <caption className="sr-only">Every customer, grouped by plan</caption>
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-ink-faint">
                  <th scope="col" className="px-6 pb-3 pt-4 font-medium">Customer</th>
                  <th scope="col" className="px-3 pb-3 pt-4 font-medium">Status</th>
                  <th scope="col" className="px-3 pb-3 pt-4 font-medium">Mode</th>
                  <th scope="col" className="px-3 pb-3 pt-4 font-medium">Next article</th>
                  <th scope="col" className="px-3 pb-3 pt-4 text-right font-medium">Articles</th>
                  <th scope="col" className="px-3 pb-3 pt-4 text-right font-medium">Revenue, {rangeShort(range)}</th>
                  <th scope="col" className="px-3 pb-3 pt-4 text-right font-medium">Cost</th>
                  <th scope="col" className="px-3 pb-3 pt-4 text-right font-medium">Margin</th>
                  <th scope="col" className="hidden px-3 pb-3 pt-4 text-right font-medium lg:table-cell" title={VISIT_HINT.dashboard}>Dashboard</th>
                  <th scope="col" className="hidden px-6 pb-3 pt-4 text-right font-medium lg:table-cell" title={VISIT_HINT.site}>Site</th>
                </tr>
              </thead>
              {filled.map((g) => (
                <tbody key={g.key}>
                  <tr className="border-t border-line-soft bg-surface-2/50">
                    <th scope="rowgroup" colSpan={8} className="px-6 py-2 text-left">
                      <span className="flex items-center gap-2 text-[12px] font-medium text-ink">
                        <span className="h-2 w-2 rounded-full" style={{ background: PLAN_COLOR[g.key] }} aria-hidden="true" />
                        {PLAN_NAME[g.key]}
                        <span className="font-mono font-normal tabular-nums text-ink-faint">
                          {fmt(g.people.length)} · {money(g.mrr)} MRR · margin {money(g.margin)}
                        </span>
                      </span>
                    </th>
                  </tr>
                  {g.people.map((x) => (
                    <PlanRow key={x.userId} x={x} now={now} />
                  ))}
                </tbody>
              ))}
            </table>
          </div>
          <div className="md:hidden">
            {filled.map((g) => (
              <div key={g.key} className="border-t border-line-soft">
                <p className="flex items-center gap-2 bg-surface-2/50 px-5 py-2 text-[12px] font-medium text-ink">
                  <span className="h-2 w-2 rounded-full" style={{ background: PLAN_COLOR[g.key] }} aria-hidden="true" />
                  {PLAN_NAME[g.key]}
                  <span className="font-mono font-normal tabular-nums text-ink-faint">{fmt(g.people.length)}</span>
                </p>
                <ol className="divide-y divide-line-soft">
                  {g.people.map((x) => (
                    <PlanCard key={x.userId} x={x} now={now} />
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </>
      )}
      <CancelledSection people={cancelled.people} />
      {idle.length ? (
        <p className="border-t border-line-soft px-5 py-3 text-[12.5px] text-ink-faint sm:px-6">
          {fmt(idle.length)} {idle.length === 1 ? "account" : "accounts"} signed up and never added a site or picked a plan, so they are on nothing yet.
        </p>
      ) : null}
    </Panel>
  );
}

// ---------- every customer ----------

function SiteList({ x }: { x: Customer }) {
  if (!x.sites.length) return <span className="text-[12px] text-ink-faint">No site yet</span>;
  return <span className="block truncate text-[12px] text-ink-faint">{x.sites.map((s) => s.domain).join(", ")}</span>;
}

/** "today" / "tomorrow" / "in 3d" for a yyyy-mm-dd (UTC) day. */
function untilWords(day: string, now: number): string {
  const today = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate());
  const d = Math.round((Date.parse(`${day}T00:00:00Z`) - today) / 86_400_000);
  return d <= 0 ? "today" : d === 1 ? "tomorrow" : `in ${d}d`;
}

/** Why there is no next-article date: their own agent builds, the writer is
 *  paused, or there is simply none (no site, a plan with no articles). */
function noNextWord(x: Customer): string {
  if (!x.sites.length) return "-";
  if (x.sites.every((s) => s.mode === "agent")) return "their agent";
  if (x.sites.some((s) => s.mode === "blocked") && x.sites.every((s) => s.mode !== "autopilot" && s.mode !== "manual")) return "none: wrong repo";
  if (x.sites.every((s) => s.mode === "paused" || s.mode === "agent")) return "paused";
  return "-";
}

/** The next article's day and title (or "topic picked that morning" when the
 *  queue is empty and the day's run researches first). */
function NextArticleCell({ x, now }: { x: Customer; now: number }) {
  const n = x.nextArticle;
  if (!n) return <span className="text-[12px] text-ink-faint">{noNextWord(x)}</span>;
  const title = n.title ?? "Topic picked that morning";
  return (
    <span className="block min-w-0" title={`${title}${x.sites.length > 1 ? ` · ${n.domain}` : ""}`}>
      <span className="block whitespace-nowrap font-mono text-[12.5px] tabular-nums text-ink">
        {shortDate(n.at)} <span className="text-ink-faint">· {untilWords(n.at, now)}</span>
      </span>
      <span className={cx("block truncate text-[12px]", n.title ? "text-ink-muted" : "text-ink-faint")}>{title}</span>
    </span>
  );
}

/** Phone cards: the next article and the two last visits, two short lines. */
function MobileExtras({ x, now }: { x: Customer; now: number }) {
  const n = x.nextArticle;
  return (
    <div className="mt-3 space-y-1 text-[12px] text-ink-faint">
      <p className="truncate">
        Next article:{" "}
        {n ? (
          <>
            <span className="font-mono tabular-nums text-ink">
              {shortDate(n.at)} ({untilWords(n.at, now)})
            </span>{" "}
            · <span className="text-ink-muted">{n.title ?? "topic picked that morning"}</span>
          </>
        ) : (
          noNextWord(x)
        )}
      </p>
      <p>
        Dashboard <span className="font-mono tabular-nums text-ink">{ago(x.lastDashboardAt, now)}</span>
        <span aria-hidden="true"> · </span>
        Site <span className="font-mono tabular-nums text-ink">{ago(x.lastSiteAt, now)}</span>
      </p>
    </div>
  );
}

const VISIT_HINT = {
  dashboard: "The last dashboard page they opened (a sign-in counts).",
  site: "The last public dispatchseo.com page (home, blog, docs, free tools, plans) they opened while signed in.",
};

function marginClass(v: number | null): string {
  return v == null ? "text-ink-faint" : v < 0 ? "text-danger" : v > 0 ? "text-ok" : "text-ink";
}

function MobileCustomer({ x, now }: { x: Customer; now: number; range: number }) {
  return (
    <li className={cx(x.operator && "opacity-70")}>
      <Link href={`/owner/customers/${x.userId}`} scroll={false} className="block px-5 py-4 transition-colors active:bg-surface-2/60">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[14px] font-medium text-ink">
              {x.email}
              {x.operator ? <span className="ml-2 text-[11px] font-normal text-ink-faint">you</span> : null}
            </p>
            <SiteList x={x} />
          </div>
          <StatusChip c={x} />
        </div>
        {cancelNote(x.plan) ? <p className="mt-1.5 text-[12px] text-danger/90">{cancelNote(x.plan)}</p> : null}
        <ModeTag x={x} className="mt-1.5" />
        <dl className="mt-3 grid grid-cols-3 gap-2 font-mono tabular-nums">
          {[
            ["Revenue", money(x.revenueRecentUsd), "text-ink"],
            ["Cost", money(x.totalCostRecentUsd, { precise: true }), "text-ink"],
            ["Margin", money(x.marginRecentUsd), marginClass(x.marginRecentUsd)],
          ].map(([k, v, cls]) => (
            <div key={k} className="min-w-0">
              <dt className="font-sans text-[11px] text-ink-faint">{k}</dt>
              <dd className={cx("mt-0.5 truncate text-[13px]", cls)}>{v}</dd>
            </div>
          ))}
        </dl>
        <MobileExtras x={x} now={now} />
      </Link>
    </li>
  );
}

/** The customer rows: cards on a phone, the table otherwise. */
function CustomerRows({ rows, now, range }: { rows: Customer[]; now: number; range: number }) {
  return (
    <>
      <ol className="divide-y divide-line-soft md:hidden">
        {rows.map((x) => (
          <MobileCustomer key={x.userId} x={x} now={now} range={range} />
        ))}
      </ol>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-[13px]">
          <caption className="sr-only">Every customer</caption>
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-ink-faint">
              <th scope="col" className="px-6 pb-3 pt-4 font-medium">Customer</th>
              <th scope="col" className="px-3 pb-3 pt-4 font-medium">Status</th>
              <th scope="col" className="px-3 pb-3 pt-4 font-medium">Mode</th>
              <th scope="col" className="px-3 pb-3 pt-4 font-medium">Next article</th>
              <th scope="col" className="px-3 pb-3 pt-4 text-right font-medium">Revenue</th>
              <th scope="col" className="px-3 pb-3 pt-4 text-right font-medium">Cost</th>
              <th scope="col" className="px-3 pb-3 pt-4 text-right font-medium">Margin</th>
              <th scope="col" className="hidden px-3 pb-3 pt-4 text-right font-medium xl:table-cell">Articles</th>
              <th scope="col" className="hidden px-3 pb-3 pt-4 text-right font-medium xl:table-cell">Clicks 28d</th>
              <th scope="col" className="hidden px-3 pb-3 pt-4 text-right font-medium lg:table-cell" title={VISIT_HINT.dashboard}>Dashboard</th>
              <th scope="col" className="hidden px-6 pb-3 pt-4 text-right font-medium lg:table-cell" title={VISIT_HINT.site}>Site</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <ClickRow
                key={x.userId}
                href={`/owner/customers/${x.userId}`}
                className={cx("group border-t border-line-soft transition-colors hover:bg-surface-2/40", x.operator && "opacity-70")}
              >
                <td className="max-w-[17rem] px-6 py-3">
                  <span className="block truncate text-[13.5px] font-medium text-ink" title={x.email}>
                    {x.email}
                    {x.operator ? <span className="ml-2 text-[11px] font-normal text-ink-faint">you</span> : null}
                  </span>
                  <SiteList x={x} />
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <StatusChip c={x} />
                    <span className="text-[12.5px] capitalize text-ink-muted">{x.plan.tier ?? ""}</span>
                  </div>
                  {cancelNote(x.plan) ? <span className="mt-1 block whitespace-nowrap text-[11.5px] text-danger/90">{cancelNote(x.plan)}</span> : null}
                </td>
                <td className="px-3 py-3">
                  <ModeTag x={x} />
                </td>
                <td className="max-w-[13rem] px-3 py-3">
                  <NextArticleCell x={x} now={now} />
                </td>
                <td className="px-3 py-3 text-right font-mono tabular-nums text-ink">{money(x.revenueRecentUsd)}</td>
                <td className="px-3 py-3 text-right font-mono tabular-nums text-ink">{money(x.totalCostRecentUsd, { precise: true })}</td>
                <td className={cx("px-3 py-3 text-right font-mono tabular-nums", marginClass(x.marginRecentUsd))}>{money(x.marginRecentUsd)}</td>
                <td className="hidden px-3 py-3 text-right font-mono tabular-nums text-ink xl:table-cell">{fmt(x.articles)}</td>
                <td className="hidden px-3 py-3 text-right font-mono tabular-nums text-ink xl:table-cell">{fmt(x.clicks28d)}</td>
                <td className="hidden whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums text-ink lg:table-cell">{ago(x.lastDashboardAt, now)}</td>
                <td className="hidden whitespace-nowrap px-6 py-3 text-right font-mono tabular-nums text-ink lg:table-cell">{ago(x.lastSiteAt, now)}</td>
              </ClickRow>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** The people who cancelled, one compact line each, inside a disclosure. */
function CancelledList({ people }: { people: Customer[] }) {
  return (
    <ul className="px-5 pb-4 sm:px-6">
      {people
        .slice()
        .sort((a, b) => (b.plan.canceledAt ?? b.createdAt).localeCompare(a.plan.canceledAt ?? a.createdAt))
        .map((x) => (
          <li key={x.userId} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-line-soft py-2.5 text-[12.5px]">
            <span className="min-w-0 flex-1">
              <Link href={`/owner/customers/${x.userId}`} scroll={false} className="block truncate text-ink hover:underline" title={x.email}>
                {x.email}
              </Link>
              <SiteList x={x} />
            </span>
            <span className="text-danger/90">{cancelNote(x.plan) ?? "Cancelled"}</span>
            <span className="w-24 text-right font-mono text-[11.5px] tabular-nums text-ink-faint">{x.revenueAllUsd ? `${money(x.revenueAllUsd)} paid` : "nothing paid"}</span>
          </li>
        ))}
    </ul>
  );
}

/** "N people cancelled - Show": the same disclosure on Customers and Plans. */
function CancelledSection({ people }: { people: Customer[] }) {
  if (!people.length) return null;
  return (
    <details className="group/gone border-t border-line-soft">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-3.5 text-[13px] text-ink-muted hover:text-ink sm:px-6">
        <span>
          {people.length} {people.length === 1 ? "person" : "people"} cancelled
        </span>
        <span className="font-mono text-[12px] text-ink-faint group-open/gone:hidden">Show</span>
        <span className="hidden font-mono text-[12px] text-ink-faint group-open/gone:inline">Hide</span>
      </summary>
      <CancelledList people={people} />
    </details>
  );
}

export function CustomersPanel({ c, range, now }: { c: CustomersReport; range: number; now: number }) {
  // Accounts that never added a site or picked a plan cost nothing and say
  // little each; they fold into one list under the table. People who
  // cancelled fold into another (owner, 2026-11-09: "I don't want to see
  // them"). What is left is sorted by when they were last seen, newest
  // first, the operator's own account last.
  // The operator's own accounts sit in a section of their own under the
  // table (owner, 2026-11-09: "I won't see them in the table with all the
  // other users"), with the same columns so their costs stay readable.
  const mine = c.customers.filter((x) => x.operator);
  const cancelled = c.customers.filter((x) => !x.operator && x.plan.cancelled);
  const byRecency = (a: Customer, b: Customer) => (b.lastSeen ?? b.createdAt).localeCompare(a.lastSeen ?? a.createdAt);
  const engaged = c.customers.filter((x) => !x.operator && !cancelled.includes(x) && (x.plan.status !== "none" || x.sites.length > 0 || x.costUsd > 0)).sort(byRecency);
  const idle = c.customers.filter((x) => !x.operator && !engaged.includes(x) && !cancelled.includes(x));
  return (
    <Panel id="customers" label="Customers">
      <SectionHead
        title="Customers"
        says={`${
          c.ordersRead
            ? "What each customer pays you, what they cost you, and what is left."
            : "What each customer pays you (their plan price), what they cost you, and what is left."
        }${c.totals.claudeCreditMonthly > 0 ? ` The first ${money(c.totals.claudeCreditMonthly)} of Claude each month is free credit, so it is not counted as cost.` : ""}`}
        note={`${fmt(engaged.filter((x) => !x.operator).length)} with a site or plan`}
      />
      <StatCells
        className="border-t-0"
        items={[
          { label: "Paying", value: `${fmt(c.totals.paying)}${c.totals.trialing ? ` · ${fmt(c.totals.trialing)} on trial` : ""}` },
          { label: `Revenue, ${rangeShort(range)}`, value: money(c.totals.revenueRecent) },
          { label: `Cost, ${rangeShort(range)}`, value: money(c.totals.costRecent) },
          { label: `Margin, ${rangeShort(range)}`, value: money(c.totals.revenueRecent - c.totals.costRecent), tone: c.totals.revenueRecent - c.totals.costRecent < 0 ? "danger" : "ok" },
        ]}
      />
      <CustomerRows rows={engaged} now={now} range={range} />
      <CancelledSection people={cancelled} />
      {mine.length ? (
        <details className="group/mine border-t border-line-soft">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-3.5 text-[13px] text-ink-muted hover:text-ink sm:px-6">
            <span>Your own {mine.length === 1 ? "account" : "accounts"}: what your sites cost</span>
            <span className="font-mono text-[12px] text-ink-faint group-open/mine:hidden">Show</span>
            <span className="hidden font-mono text-[12px] text-ink-faint group-open/mine:inline">Hide</span>
          </summary>
          <CustomerRows rows={mine} now={now} range={range} />
        </details>
      ) : null}
      {idle.length ? (
        <details className="group/idle border-t border-line-soft">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-3.5 text-[13px] text-ink-muted hover:text-ink sm:px-6">
            <span>
              {idle.length} {idle.length === 1 ? "account" : "accounts"} signed up and never added a site or picked a plan
            </span>
            <span className="font-mono text-[12px] text-ink-faint group-open/idle:hidden">Show</span>
            <span className="hidden font-mono text-[12px] text-ink-faint group-open/idle:inline">Hide</span>
          </summary>
          <ul className="grid gap-x-6 px-5 pb-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
            {idle.map((x) => (
              <li key={x.userId} className="flex items-baseline justify-between gap-3 border-t border-line-soft py-2 text-[12.5px]">
                <Link href={`/owner/customers/${x.userId}`} scroll={false} className="min-w-0 truncate text-ink hover:underline" title={x.email}>
                  {x.email}
                </Link>
                <span className="shrink-0 font-mono text-[11.5px] tabular-nums text-ink-faint">joined {shortDate(x.createdAt)}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {c.orphanSites.length ? (
        <div className="border-t border-line-soft px-5 py-4 sm:px-6">
          <h3 className="text-[12.5px] text-ink-faint">Sites without an owner account (your own)</h3>
          <ul className="mt-2 space-y-1.5">
            {c.orphanSites.map((s) => (
              <li key={s.id} className="flex items-center gap-4 text-[13px]">
                <span className="min-w-0 flex-1 truncate text-ink">{s.domain}</span>
                <span className="font-mono tabular-nums text-ink-muted">{fmt(s.articles)} art.</span>
                <span className="w-20 text-right font-mono tabular-nums text-ink-muted">{money(s.costRecentUsd, { precise: true })}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Panel>
  );
}
