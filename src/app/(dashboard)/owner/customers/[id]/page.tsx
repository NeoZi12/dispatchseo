import Link from "next/link";
import { notFound } from "next/navigation";

import { requireDashboard } from "@/lib/auth-gate";
import { isOperator } from "@/lib/autopilot/operator";
import type { MarkState } from "@/lib/article-signature";
import { isCloudMode } from "@/lib/cloud";
import { customerDetail, type CustomerArticle, type CustomerDetail } from "@/lib/owner-customer";
import { revenueUsd } from "@/lib/owner-money";
import { PHASE_WORDS, setupShort, type SetupProgress } from "@/lib/owner-setup";
import { TIER_NAMES } from "@/lib/billing";
import { cx } from "@/components/ui/styles";
import { AreaChart, MetricChart } from "../../area";
import { BarList, DeltaPill, Panel, PanelHead, PublishStrip, StatCells } from "../../bits";
import { ago, cancelNote, compact, delta, fmt, fullDate, money, pct, shortDate } from "../../format";

// One customer, the full picture, top to bottom: who they are and where
// they stand; six figures (paid, cost, margin, articles, clicks,
// impressions); the money over time and where the cost went; Google across
// their sites; every article with its own Google numbers and whether the
// live page still carries our signature; the plan and its payments; their
// sites; what they did on dispatchseo.com. Operators only.
//
// Operator-only telemetry with no MCP counterpart, on purpose: an MCP token
// is one tenant, and nothing here is one tenant's to read.
export const dynamic = "force-dynamic";

const STATUS: Record<string, { word: string; cls: string }> = {
  active: { word: "Active", cls: "border-ok/30 bg-ok/10 text-ok" },
  trialing: { word: "Trial", cls: "border-info/30 bg-info/10 text-info" },
  past_due: { word: "Past due", cls: "border-warn/30 bg-warn/10 text-warn" },
  canceled: { word: "Cancelled", cls: "border-danger/30 bg-danger/10 text-danger" },
  revoked: { word: "Cancelled", cls: "border-danger/30 bg-danger/10 text-danger" },
  incomplete: { word: "Unfinished", cls: "border-warn/30 bg-warn/10 text-warn" },
};
const FREE = { word: "Free plan", cls: "border-line bg-surface-2 text-ink-muted" };
const NONE = { word: "No plan", cls: "border-line bg-surface-2 text-ink-faint" };

const LINE_LABEL: Record<string, string> = {
  writer: "AI: writing",
  judge: "AI: quality check",
  planner: "AI: planning",
  extractor: "AI: fact extraction",
  illustrator: "AI: cover drawing",
};

// DataForSEO endpoints in plain words: what the money bought.
const DATA_LABELS: Array<[RegExp, string]> = [
  [/ranked_keywords/, "Data: keywords a site ranks for"],
  [/keyword_ideas|keyword_suggestions|related_keywords/, "Data: keyword ideas"],
  [/search_volume|keyword_overview|keyword_difficulty|bulk_keyword/, "Data: search volume and difficulty"],
  [/serp/, "Data: Google results checks"],
  [/backlinks/, "Data: backlinks"],
  [/on_page/, "Data: site audit"],
  [/domain_rank|competitors|domain_intersection/, "Data: competitors"],
];

function lineLabel(kind: string, item: string): string {
  if (kind === "fee") return item;
  if (kind === "llm") return LINE_LABEL[item] ?? `AI: ${item}`;
  for (const [re, label] of DATA_LABELS) if (re.test(item)) return label;
  return "Data: other";
}

const EVENT_WORDS: Record<string, string> = {
  user_signed_up: "Signed up",
  user_logged_in: "Logged in",
  user_confirmed_email: "Confirmed email",
  checkout_started: "Opened checkout",
  setup_trial_started: "Started trial",
  subscription_activated: "Subscription active",
  subscription_cancel_scheduled: "Cancellation scheduled",
  subscription_canceled: "Subscription ended",
  subscription_updated: "Subscription changed",
  subscription_resumed: "Subscription resumed",
  project_created: "Added a site",
  project_deleted: "Deleted a site",
  github_connected: "Connected GitHub",
  pipeline_installed: "Pipeline installed",
  gsc_connected: "Connected Search Console",
  pr_merged: "Merged a PR",
  billing_portal_opened: "Opened billing",
  setup_step_viewed: "Viewed setup step",
  setup_step_deferred: "Skipped setup step",
  setup_connect_complete: "Finished connecting",
};

/** "3 days", "6 weeks", "4 months", "1 year" - how long they have been with us. */
function sinceWords(fromIso: string, now: number): string {
  const d = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 86_400_000));
  if (d < 1) return "today";
  if (d < 14) return `${d} ${d === 1 ? "day" : "days"}`;
  if (d < 60) return `${Math.round(d / 7)} weeks`;
  if (d < 365) return `${Math.round(d / 30)} months`;
  const y = Math.floor(d / 365);
  return `${y} ${y === 1 ? "year" : "years"}`;
}

const MARK_WORDS: Record<MarkState, { word: string; cls: string; title: string }> = {
  "signed+badge": { word: "Signed · badge", cls: "text-ink-muted", title: "The live page carries the hidden signature and the visible credit" },
  signed: { word: "Signed", cls: "text-ink-muted", title: "The live page carries the hidden signature" },
  badge: { word: "Badge only", cls: "text-ink-muted", title: "The live page shows the credit but was published before the signature existed" },
  none: { word: "No mark", cls: "text-warn", title: "The live page carries neither the signature nor the credit" },
  unchecked: { word: "–", cls: "text-ink-faint", title: "Not scanned yet - live pages are read nightly" },
};

function Mark({ state }: { state: MarkState }) {
  const m = MARK_WORDS[state];
  return (
    <span className={cx("whitespace-nowrap text-[12.5px]", m.cls)} title={m.title}>
      {m.word}
    </span>
  );
}

function Figure({ label, value, sub, tone, pill }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "ok" | "danger"; pill?: React.ReactNode }) {
  return (
    <div className="min-w-0 bg-surface px-4 pb-4 pt-4 sm:px-5 sm:pt-5">
      <p className="truncate text-[12.5px] text-ink-muted">{label}</p>
      <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className={cx("text-[1.5rem] font-light leading-none tracking-tight tabular-nums sm:text-[1.9rem]", tone === "ok" ? "text-ok" : tone === "danger" ? "text-danger" : "text-ink")}>
          {value}
        </span>
        {pill}
      </p>
      {sub ? <p className="mt-2 line-clamp-2 text-[12px] leading-snug text-ink-faint">{sub}</p> : null}
    </div>
  );
}

function Fact({ k, v, tone }: { k: string; v: React.ReactNode; tone?: "danger" }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-[12.5px] text-ink-faint">{k}</dt>
      <dd className={cx("text-right text-[13px] tabular-nums", tone === "danger" ? "text-danger" : "text-ink")}>{v}</dd>
    </div>
  );
}

/** Where a customer still setting up stands: the connect rail with what is
 *  done, the one step in front of them, and whether it is stuck. */
function SetupPanel({ s, now }: { s: SetupProgress; now: number }) {
  const past = s.index >= s.total;
  return (
    <Panel label="Setup">
      <PanelHead
        title={past ? PHASE_WORDS[s.phase] : `Setting up · step ${s.index + 1} of ${s.total}`}
        sub={past ? "Their site is connected; what is left runs mostly on our side." : "They have not finished connecting their site. This is the one thing in front of them right now."}
        meta={s.kind === "wait" ? "waiting on us" : "waiting on them"}
      />
      {s.labels.length ? (
        <ol className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-line-soft px-5 pt-4 sm:px-6" aria-label="Connect steps">
          {s.labels.map((label, i) => {
            const done = past || i < s.index;
            const current = !past && i === s.index;
            return (
              <li key={label} className={cx("flex items-center gap-2 text-[12.5px]", current ? "text-ink" : done ? "text-ink-muted" : "text-ink-faint")}>
                <span
                  aria-hidden="true"
                  className={cx(
                    "flex h-4 w-4 items-center justify-center rounded-full border text-[9px] font-semibold",
                    done ? "border-ink-faint/40 bg-surface-3 text-ink-muted" : current ? "border-accent bg-accent/15 text-accent" : "border-line text-ink-faint",
                  )}
                >
                  {done ? "✓" : i + 1}
                </span>
                {label}
                <span className="sr-only">{done ? ", done" : current ? ", current" : ", to do"}</span>
              </li>
            );
          })}
        </ol>
      ) : null}
      <div className="px-5 pb-5 pt-4 sm:px-6">
        <p className="text-[15px] font-medium text-ink">{s.title}</p>
        <p className="mt-1 max-w-[70ch] text-[13px] leading-relaxed text-ink-muted">{s.why}</p>
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-faint">
          <span>{setupShort(s)}</span>
          {s.waitingSince ? <span className={s.slow ? "text-warn" : undefined}>Waiting since {fullDate(s.waitingSince)} ({ago(s.waitingSince, now)}){s.slow ? " · slower than usual" : ""}</span> : null}
          {s.deferred.length ? <span>Skipped for later: {s.deferred.map((d) => d.replace(/_/g, " ")).join(", ")}</span> : null}
        </p>
        {s.slowHint ? <p className="mt-2 text-[12.5px] text-warn">{s.slowHint}</p> : null}
        {s.error ? <p className="mt-2 text-[12.5px] text-danger">{s.error}</p> : null}
      </div>
    </Panel>
  );
}

const TH = "pb-2.5 pt-3.5 text-[11px] font-medium uppercase tracking-wider text-ink-faint";
const TD_NUM = "py-3 text-right font-mono text-[13px] tabular-nums";

function ArticleTitle({ a }: { a: CustomerArticle }) {
  return (
    <>
      {a.url ? (
        <a href={a.url} target="_blank" rel="noopener noreferrer" className="block truncate text-[13.5px] font-medium text-ink hover:underline" title={a.title}>
          {a.title}
        </a>
      ) : (
        <span className="block truncate text-[13.5px] font-medium text-ink" title={a.title}>
          {a.title}
        </span>
      )}
      <span className="mt-0.5 block truncate text-[12px] text-ink-faint">
        {a.domain} · {shortDate(a.publishedAt)}
        {a.keyword ? ` · "${a.keyword}"` : ""}
        {a.live === false ? <span className="text-danger"> · page gone</span> : null}
      </span>
    </>
  );
}

function ArticlesTable({ d, rows }: { d: CustomerDetail; rows: CustomerArticle[] }) {
  const totals = rows.reduce(
    (t, a) => ({ impressions: t.impressions + a.impressions28d, clicks: t.clicks + a.clicks28d, cost: t.cost + (a.costUsd ?? 0) }),
    { impressions: 0, clicks: 0, cost: 0 },
  );
  if (!rows.length) {
    return (
      <p className="m-5 rounded-xl border border-dashed border-line px-4 py-6 text-center text-[13px] text-ink-faint sm:m-6">
        No article published yet{d.drafts.inFlight ? ` - ${d.drafts.inFlight} in progress` : ""}.
      </p>
    );
  }
  return (
    <>
      <div className="hidden md:block">
        <table className="w-full text-left">
          <caption className="sr-only">Every article published for this customer</caption>
          <thead>
            <tr className="border-b border-line-soft">
              <th scope="col" className={cx(TH, "w-9 pl-5 text-right sm:pl-6")}>#</th>
              <th scope="col" className={cx(TH, "pl-4")}>Article</th>
              <th scope="col" className={cx(TH, "px-3")}>Mark</th>
              <th scope="col" className={cx(TH, "px-3 text-right")}>Impressions</th>
              <th scope="col" className={cx(TH, "px-3 text-right")}>Clicks</th>
              <th scope="col" className={cx(TH, "px-3 text-right")}>Position</th>
              <th scope="col" className={cx(TH, "pl-3 pr-5 text-right sm:pr-6")}>Cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a, i) => (
              <tr key={a.id} className="border-b border-line-soft transition-colors last:border-b-0 hover:bg-surface-2/40">
                <td className="py-3 pl-5 text-right font-mono text-[12px] tabular-nums text-ink-faint sm:pl-6">{i + 1}</td>
                <td className="max-w-0 py-3 pl-4">
                  <ArticleTitle a={a} />
                </td>
                <td className="px-3 py-3">
                  <Mark state={a.mark} />
                </td>
                <td className={cx(TD_NUM, "px-3 text-ink-muted")}>{a.impressions28d ? fmt(a.impressions28d) : <span className="text-ink-faint">0</span>}</td>
                <td className={cx(TD_NUM, "px-3", a.clicks28d ? "text-ink" : "text-ink-faint")}>{fmt(a.clicks28d)}</td>
                <td className={cx(TD_NUM, "px-3 text-ink-muted")}>{a.position != null ? a.position.toFixed(1) : <span className="text-ink-faint">–</span>}</td>
                <td className={cx(TD_NUM, "pl-3 pr-5 text-ink-muted sm:pr-6")}>{a.costUsd != null ? money(a.costUsd) : <span className="text-ink-faint">–</span>}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-line-soft bg-surface-2/40">
              <td />
              <td className="py-3 pl-4 text-[12.5px] text-ink-muted">
                {fmt(rows.length)} {rows.length === 1 ? "article" : "articles"} · last 28 days
              </td>
              <td />
              <td className={cx(TD_NUM, "px-3 text-ink")}>{fmt(totals.impressions)}</td>
              <td className={cx(TD_NUM, "px-3 text-ink")}>{fmt(totals.clicks)}</td>
              <td />
              <td className={cx(TD_NUM, "pl-3 pr-5 text-ink sm:pr-6")}>{money(totals.cost)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <ol className="divide-y divide-line-soft md:hidden">
        {rows.map((a) => (
          <li key={a.id} className="px-5 py-3.5">
            <ArticleTitle a={a} />
            <dl className="mt-2.5 grid grid-cols-4 gap-2 font-mono text-[13px] tabular-nums">
              {[
                ["Impr.", fmt(a.impressions28d)],
                ["Clicks", fmt(a.clicks28d)],
                ["Pos.", a.position != null ? a.position.toFixed(1) : "–"],
                ["Cost", a.costUsd != null ? money(a.costUsd) : "–"],
              ].map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <dt className="font-sans text-[11px] text-ink-faint">{k}</dt>
                  <dd className="mt-0.5 truncate text-ink">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2">
              <Mark state={a.mark} />
            </p>
          </li>
        ))}
      </ol>
    </>
  );
}

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const auth = await requireDashboard();
  if (isCloudMode() && !isOperator(auth.user?.id)) notFound();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const now = Date.now();
  const d = await customerDetail(id, now);
  if (!d) notFound();

  const revenue = d.money?.revenueUsd ?? 0;
  const margin = revenue - d.cost.totalUsd;
  // Without Polar's payments: the plan price per month against last month's cost.
  const monthly = d.plan.monthlyUsd ?? 0;
  const monthlyMargin = monthly - d.cost30Usd;
  // Cost lines grouped by their plain name (several endpoints can share one).
  const grouped = [...d.cost.lines.reduce((m, l) => m.set(lineLabel(l.kind, l.item), (m.get(lineLabel(l.kind, l.item)) ?? 0) + l.usd), new Map<string, number>())]
    .map(([label, usd]) => ({ key: label, label, value: usd }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);
  const live = d.plan.status === "active" || d.plan.status === "trialing" || d.plan.status === "past_due";
  const cancelled = d.plan.cancelAtPeriodEnd && (d.plan.status === "active" || d.plan.status === "trialing");
  const status = cancelled ? STATUS.canceled : (STATUS[d.plan.status] ?? (d.sites.length ? FREE : NONE));
  const note = cancelNote(d.plan);
  const tierName = d.plan.tier ? (TIER_NAMES[d.plan.tier as keyof typeof TIER_NAMES] ?? d.plan.tier) : null;
  const perArticle = d.articleCount ? (d.cost.llmUsd + d.cost.dfsUsd) / d.articleCount : null;
  const writerRuns = d.writer.done + d.writer.failed;
  const failRate = writerRuns ? d.writer.failed / writerRuns : 0;
  const activeDays = d.activeDays.length;
  const views90 = d.activeDays.reduce((a, x) => a + x.views, 0);
  const lastSeen = [d.lastSignInAt, d.events[0]?.at, d.activeDays.map((x) => x.day).sort().at(-1)].filter((x): x is string => Boolean(x)).sort().at(-1) ?? null;
  const initial = (d.email.trim()[0] ?? "?").toUpperCase();
  const articles = [...d.articles].sort((a, b) => b.clicks28d - a.clicks28d || b.impressions28d - a.impressions28d || b.publishedAt.localeCompare(a.publishedAt));
  const scanned = d.marks.checked;
  // One cell per day for the 90-day activity strip, zero where they were away.
  const viewsByDay = new Map(d.activeDays.map((x) => [x.day, x.views]));
  const strip: Array<{ day: string; count: number }> = [];
  for (let i = 89; i >= 0; i--) {
    const day = new Date(now - i * 86_400_000).toISOString().slice(0, 10);
    strip.push({ day, count: viewsByDay.get(day) ?? 0 });
  }

  return (
    <div className="mx-auto max-w-[1280px] space-y-4 sm:space-y-5">
      <Link href="/owner/customers" className="inline-flex items-center gap-1.5 text-[13px] text-ink-faint hover:text-ink">
        <span aria-hidden="true">←</span> Customers
      </Link>

      <header className="flex flex-col gap-4 pb-1 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <span aria-hidden="true" className="flex h-12 w-12 shrink-0 select-none items-center justify-center rounded-xl border border-line-soft bg-surface-2 text-[18px] font-semibold text-ink-muted">
            {initial}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-[1.5rem] font-semibold leading-tight tracking-tight text-ink sm:text-[1.75rem]">
              {d.email}
              {d.operator ? <span className="ml-2 text-[13px] font-normal text-ink-faint">you</span> : null}
            </h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-ink-muted">
              <span className={cx("inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11.5px] font-medium", status.cls)}>{status.word}</span>
              {d.setup ? (
                <span
                  className={cx(
                    "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11.5px] font-medium",
                    d.setup.complete ? "border-line bg-surface-2 text-ink-muted" : d.setup.error || d.setup.slow ? "border-warn/30 bg-warn/10 text-warn" : "border-accent/30 bg-accent/10 text-accent",
                  )}
                >
                  {d.setup.complete ? "Set up" : setupShort(d.setup)}
                </span>
              ) : null}
              {tierName && live ? (
                <span>
                  {tierName}
                  {monthly ? <span className="font-mono text-[12px] tabular-nums text-ink-faint"> · {money(monthly)}/mo{d.plan.interval === "year" ? ", billed yearly" : ""}</span> : null}
                </span>
              ) : null}
              {note ? <span className="text-danger/90">{note}</span> : null}
              <span className="text-ink-faint">
                Customer for {sinceWords(d.createdAt, now)} · since {fullDate(d.createdAt)}
              </span>
              <span className="text-ink-faint">Last seen {ago(lastSeen, now)}</span>
              {d.plan.periodEnd && !cancelled && (d.plan.status === "active" || d.plan.status === "trialing") ? (
                <span className="text-ink-faint">
                  {d.plan.status === "trialing" ? "Trial ends" : "Renews"} {fullDate(d.plan.periodEnd)}
                </span>
              ) : null}
            </p>
          </div>
        </div>
        {d.plan.polarCustomerId ? (
          <a
            href={`https://polar.sh/dashboard/dispatchseo/customers/${d.plan.polarCustomerId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 self-start rounded-lg border border-line-soft bg-surface px-3 py-1.5 text-[12.5px] text-ink-muted hover:text-ink"
          >
            Open in Polar ↗
          </a>
        ) : null}
      </header>

      {d.setup && !d.setup.complete ? <SetupPanel s={d.setup} now={now} /> : null}

      {/* The six figures. Two per row on a phone, three on a tablet, one row on a desktop. */}
      <Panel label="At a glance" className="grid grid-cols-2 gap-px bg-line-soft sm:grid-cols-3 xl:grid-cols-6">
        {d.money ? (
          <Figure label="Paid us, all time" value={money(revenue)} sub={`${d.money.orders} ${d.money.orders === 1 ? "payment" : "payments"}${d.money.refundedUsd ? ` · ${money(d.money.refundedUsd)} refunded` : ""}`} />
        ) : (
          <Figure label="Pays us" value={monthly ? `${money(monthly)}/mo` : "$0"} sub={monthly ? "their plan price - Polar's payments not readable" : d.sites.length ? "on the free plan" : "no plan yet"} />
        )}
        {d.costError ? (
          <Figure label="Cost us, all time" value="–" sub="Apply migration 0076 to see the cost" />
        ) : (
          <Figure
            label="Cost us, all time"
            value={money(d.cost.totalUsd, { precise: true })}
            sub={`AI ${money(d.cost.llmUsd, { precise: true })} · data ${money(d.cost.dfsUsd, { precise: true })}${d.money?.feeUsd ? ` · fees ${money(d.money.feeUsd)}` : ""}`}
          />
        )}
        {d.costError ? (
          <Figure label="Margin" value="–" sub="needs the cost" />
        ) : d.money ? (
          <Figure label="Margin, all time" value={money(margin)} tone={margin < 0 ? "danger" : margin > 0 ? "ok" : undefined} sub={revenue ? `${pct(margin, revenue)} of what they paid` : "nothing paid yet"} />
        ) : (
          <Figure label="Margin, last 30 days" value={money(monthlyMargin)} tone={monthlyMargin < 0 ? "danger" : monthlyMargin > 0 ? "ok" : undefined} sub={`${money(monthly)} plan price − ${money(d.cost30Usd, { precise: true })} cost`} />
        )}
        <Figure
          label="Articles live"
          value={fmt(d.articleCount)}
          sub={
            [d.drafts.inFlight ? `${d.drafts.inFlight} in progress` : null, d.drafts.failed ? `${d.drafts.failed} failed the gate` : null, d.firstArticleAt ? `first ${shortDate(d.firstArticleAt)}` : null]
              .filter(Boolean)
              .join(" · ") || "none yet"
          }
        />
        <Figure label="Clicks, 28 days" value={fmt(d.google.clicks28d)} pill={<DeltaPill value={delta(d.google.clicks28d, d.google.prevClicks28d)} />} sub={`${fmt(d.google.totalClicks)} in 90 days · from Google`} />
        <Figure
          label="Impressions, 28 days"
          value={compact(d.google.impressions28d)}
          pill={<DeltaPill value={delta(d.google.impressions28d, d.google.prevImpressions28d)} />}
          sub={d.google.position != null ? `average position ${d.google.position.toFixed(1)} over 90 days` : `${compact(d.google.totalImpressions)} in 90 days`}
        />
      </Panel>

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-5">
        <Panel label="Ledger" className="lg:col-span-3">
          <PanelHead title={d.money ? "Paid us vs cost us, since they joined" : "Cost us, since they joined"} sub="Running totals, one point per day." meta="all time" />
          <div className="px-4 pb-5 pt-6 sm:px-6">
            {d.money ? (
              <AreaChart days={d.ledger.days} values={d.ledger.revenue} previous={d.ledger.cost} unit="usd" tone="green" tone2="gray" height={200} label="Paid" legend="Paid us" compareLabel="cost" />
            ) : (
              <AreaChart days={d.ledger.days} values={d.ledger.cost} unit="usd" tone="gray" height={200} label="Cost" legend="Cost so far" />
            )}
          </div>
        </Panel>
        <Panel label="Where the cost goes" className="lg:col-span-2">
          <PanelHead title="Where the cost goes" meta="all time" />
          <div className="px-5 pb-6 pt-5 sm:px-6">
            <BarList rows={grouped.slice(0, 8)} format="usd" tone="gray" empty={d.costError ? "Apply migration 0076 to see the cost lines." : "Nothing metered for this customer yet."} />
          </div>
          <StatCells
            className="border-b-0"
            items={[
              { label: "Per article", value: perArticle != null ? money(perArticle) : "–" },
              { label: "Last 30 days", value: d.costError ? "–" : money(d.cost30Usd, { precise: true }) },
              { label: "Writer failures, 90 d", value: writerRuns ? pct(d.writer.failed, writerRuns) : "–", tone: failRate > 0.3 ? "danger" : undefined },
            ]}
          />
        </Panel>
      </div>

      <Panel label="Google">
        <PanelHead title="Google Search, their sites" sub="Clicks and impressions across every site they own, from Search Console. The figures are the last 28 days against the 28 before." meta="90 d" />
        <div className="mt-4 border-t border-line-soft">
          <MetricChart
            days={d.google.days}
            height={220}
            metrics={[
              { key: "clicks", label: "Clicks", total: fmt(d.google.clicks28d), delta: delta(d.google.clicks28d, d.google.prevClicks28d), values: d.google.clicks, tone: "green" },
              { key: "impressions", label: "Impressions", total: compact(d.google.impressions28d), delta: delta(d.google.impressions28d, d.google.prevImpressions28d), values: d.google.impressions, tone: "blue" },
            ]}
          />
        </div>
        <StatCells
          className="border-b-0"
          items={[
            { label: "Average position, 90 d", value: d.google.position != null ? d.google.position.toFixed(1) : "–" },
            { label: "Search Console connected", value: `${d.sites.filter((s) => s.gscConnected).length} of ${d.sites.length} ${d.sites.length === 1 ? "site" : "sites"}` },
            { label: "Cited by AI, 90 d", value: d.citations.checks ? `${d.citations.cited} of ${d.citations.checks} checks` : "–" },
          ]}
        />
      </Panel>

      <Panel label="Articles">
        <PanelHead
          title="Articles"
          sub="Every article published for them, most clicked first, with its own Google numbers for the last 28 days. Mark is what the live page carried at its last nightly scan: our hidden signature, the visible credit, or neither."
          meta={`${fmt(d.articleCount)} live`}
        />
        <div className="mt-4">
          <ArticlesTable d={d} rows={articles} />
        </div>
        {scanned || d.marks.unchecked ? (
          <p className="border-t border-line-soft px-5 py-3 text-[12.5px] text-ink-faint sm:px-6">
            {scanned ? (
              <>
                Signature on <span className="text-ink-muted">{d.marks.signed} of {scanned}</span> scanned live pages
                {d.marks.badge ? ` · credit shown on ${d.marks.badge}` : ""}
                {d.marks.none ? <span className="text-warn"> · {d.marks.none} with no mark</span> : ""}
              </>
            ) : null}
            {d.marks.unchecked ? `${scanned ? " · " : ""}${d.marks.unchecked} not scanned yet` : ""}
            {scanned === 0 ? " - live pages are read nightly" : ""}
          </p>
        ) : null}
      </Panel>

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
        <Panel label="Plan and payments">
          <PanelHead title="Plan and payments" meta={d.money ? `${d.money.orders} from Polar` : "payments not readable"} />
          <dl className="mt-2 divide-y divide-line-soft px-5 sm:px-6">
            <Fact k="Plan" v={live && tierName ? `${tierName}${d.plan.status === "trialing" ? " (trial)" : ""}` : d.sites.length ? "Free" : "None"} />
            {monthly ? <Fact k="Price" v={`${money(monthly)}/mo${d.plan.interval === "year" ? ", billed yearly" : ""}`} /> : null}
            <Fact k="Signed up" v={fullDate(d.createdAt)} />
            {d.plan.startedAt && d.plan.status !== "none" ? <Fact k="Subscription started" v={fullDate(d.plan.startedAt)} /> : null}
            {d.plan.periodEnd && live ? <Fact k={d.plan.status === "trialing" ? "Trial ends" : cancelled ? "Paid until" : "Renews"} v={fullDate(d.plan.periodEnd)} /> : null}
            {d.plan.canceledAt ? <Fact k="Cancelled" v={fullDate(d.plan.canceledAt)} tone="danger" /> : null}
            {d.qualifier ? <Fact k="At sign-up" v={`${d.qualifier.domain} · ${d.qualifier.platform}${d.qualifier.aiChoice ? ` · ${d.qualifier.aiChoice}` : ""}`} /> : null}
          </dl>
          {d.orders && d.orders.length ? (
            <div className="mt-3 overflow-x-auto border-t border-line-soft px-5 pb-4 sm:px-6">
              <table className="w-full min-w-[480px] text-left text-[13px]">
                <thead>
                  <tr>
                    <th scope="col" className={TH}>Date</th>
                    <th scope="col" className={TH}>What</th>
                    <th scope="col" className={cx(TH, "text-right")}>Paid</th>
                    <th scope="col" className={cx(TH, "text-right")}>Fee</th>
                    <th scope="col" className={cx(TH, "text-right")}>Refunded</th>
                  </tr>
                </thead>
                <tbody>
                  {d.orders.map((o) => (
                    <tr key={o.id} className="border-t border-line-soft">
                      <td className="py-2.5 font-mono tabular-nums text-ink-muted">{shortDate(o.at)}</td>
                      <td className="max-w-[14rem] truncate py-2.5 text-ink">
                        {o.product ?? "Order"} <span className="text-ink-faint">· {o.reason.replace(/_/g, " ")}</span>
                      </td>
                      <td className="py-2.5 text-right font-mono tabular-nums text-ink">{money(revenueUsd(o))}</td>
                      <td className="py-2.5 text-right font-mono tabular-nums text-ink-faint">{money(o.feeUsd)}</td>
                      <td className="py-2.5 text-right font-mono tabular-nums text-ink-faint">{o.refundedUsd ? money(o.refundedUsd) : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mx-5 mb-5 mt-3 rounded-xl border border-dashed border-line px-4 py-5 text-center text-[13px] text-ink-faint sm:mx-6">
              {d.money ? "No payment from this customer yet." : d.moneyError ?? "Polar's payments could not be read."}
            </p>
          )}
        </Panel>

        <Panel label="Sites">
          <PanelHead title="Sites" meta={`${d.sites.length} ${d.sites.length === 1 ? "site" : "sites"}`} />
          <ul className="mt-2 divide-y divide-line-soft px-5 sm:px-6">
            {d.sites.length ? (
              d.sites.map((s) => (
                <li key={s.id} className="flex items-center gap-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-ink">{s.domain}</span>
                    <span className="block truncate text-[12px] text-ink-faint">
                      {s.hosted ? "Hosted writer" : "Their own agent"} · added {shortDate(s.createdAt)}
                      {s.repo ? ` · ${s.repo}` : ""}
                      {s.setup && !s.setup.complete ? <span className={s.setup.slow || s.setup.error ? " text-warn" : ""}> · {setupShort(s.setup)}: {s.setup.title}</span> : null}
                      {s.forwarding ? (
                        <span className={s.forwarding === "live" ? "" : s.forwarding.startsWith("merge failed") ? " text-warn" : " text-ink-muted"}>
                          {" · forwarding: "}
                          {s.forwardingUrl ? <a href={s.forwardingUrl} target="_blank" rel="noopener noreferrer" className="underline decoration-line underline-offset-2 hover:text-ink">{s.forwarding}</a> : s.forwarding}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <span className="shrink-0 text-right font-mono text-[12.5px] tabular-nums text-ink-muted">
                    {fmt(s.articles)} <span className="font-sans text-ink-faint">{s.articles === 1 ? "article" : "articles"}</span>
                    <span className="block text-[11.5px] text-ink-faint">{fmt(s.clicks28d)} clicks · 28 d</span>
                  </span>
                  <span className={cx("w-20 shrink-0 text-right text-[12px]", s.gscConnected ? "text-ink-muted" : "text-warn")}>{s.gscConnected ? "Google on" : "No Google"}</span>
                </li>
              ))
            ) : (
              <li className="py-5 text-center text-[13px] text-ink-faint">No site added.</li>
            )}
          </ul>
          <div className="mt-2 border-t border-line-soft px-5 py-3.5 text-[12.5px] sm:px-6">
            <p className="text-ink-faint">
              Writer, 90 days: <span className="text-ink-muted">{fmt(d.writer.done)} done</span>
              {d.writer.failed ? <span className={failRate > 0.3 ? "text-danger" : "text-ink-muted"}> · {fmt(d.writer.failed)} failed</span> : null}
              {d.writer.running ? <span className="text-ink-muted"> · {fmt(d.writer.running)} running</span> : null}
              {!writerRuns && !d.writer.running ? <span> no runs</span> : null}
            </p>
            {d.writer.lastError ? (
              <p className="mt-1.5">
                <span className="text-danger">Last failure {ago(d.writer.lastErrorAt, now)}:</span> <span className="text-ink-muted">{d.writer.lastError}</span>
              </p>
            ) : null}
          </div>
        </Panel>
      </div>

      <Panel label="What they did">
        <PanelHead
          title="What they did on DispatchSEO"
          sub="Days they opened the dashboard over the last 90, and the events we keep for them."
          meta={`${activeDays} active ${activeDays === 1 ? "day" : "days"} · ${fmt(views90)} ${views90 === 1 ? "view" : "views"} · 90 d`}
        />
        <div className="px-5 pb-2 pt-5 sm:px-6">
          <PublishStrip days={strip} label="Dashboard views per day" unit="view" units="views" />
          <p className="mt-2 flex justify-between font-mono text-[11px] tabular-nums text-ink-faint">
            <span>{shortDate(strip[0].day)}</span>
            <span>today</span>
          </p>
        </div>
        {d.events.length ? (
          <ol className="mt-2 grid border-t border-line-soft px-2 pb-3 pt-2 sm:px-3 lg:grid-cols-2 lg:gap-x-6">
            {d.events.slice(0, 20).map((e, i) => (
              <li key={i} className="flex items-center gap-3 rounded-lg px-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] text-ink">{EVENT_WORDS[e.event] ?? e.event.replace(/_/g, " ")}</span>
                  {e.detail ? <span className="block truncate text-[12px] text-ink-faint">{e.detail}</span> : null}
                </span>
                <span className="shrink-0 font-mono text-[12px] tabular-nums text-ink-faint" title={fullDate(e.at)}>
                  {ago(e.at, now)}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mx-5 mb-5 mt-2 rounded-xl border border-dashed border-line px-4 py-5 text-center text-[13px] text-ink-faint sm:mx-6">
            No product event recorded for them yet. Events are kept since Nov 6, plus whatever the PostHog import brings.
          </p>
        )}
      </Panel>
    </div>
  );
}
