import Link from "next/link";
import { notFound } from "next/navigation";

import { requireDashboard } from "@/lib/auth-gate";
import { isOperator } from "@/lib/autopilot/operator";
import { isCloudMode } from "@/lib/cloud";
import { customerDetail } from "@/lib/owner-customer";
import { keptUsd } from "@/lib/owner-money";
import { cx } from "@/components/ui/styles";
import { AreaChart } from "../../area";
import { BarList, Panel, PanelHead, StatCells } from "../../bits";
import { ago, compact, fmt, fullDate, money, pct, shortDate } from "../../format";

// One customer, the full picture: what they paid, what they cost, what their
// sites got, how the writer did, and what they did. Operators only.
export const dynamic = "force-dynamic";

const STATUS: Record<string, { word: string; cls: string }> = {
  active: { word: "Active", cls: "border-ok/30 bg-ok/10 text-ok" },
  trialing: { word: "Trial", cls: "border-info/30 bg-info/10 text-info" },
  past_due: { word: "Past due", cls: "border-warn/30 bg-warn/10 text-warn" },
  canceled: { word: "Churned", cls: "border-danger/30 bg-danger/10 text-danger" },
  revoked: { word: "Churned", cls: "border-danger/30 bg-danger/10 text-danger" },
  incomplete: { word: "Unfinished", cls: "border-warn/30 bg-warn/10 text-warn" },
};

const LINE_LABEL: Record<string, string> = {
  writer: "AI: writing",
  judge: "AI: quality check",
  planner: "AI: planning",
  extractor: "AI: fact extraction",
  illustrator: "AI: cover drawing",
};

function lineLabel(kind: string, item: string): string {
  if (kind === "fee") return item;
  if (kind === "llm") return LINE_LABEL[item] ?? `AI: ${item}`;
  return `DataForSEO: ${item.replace(/^\/?v3\//, "").replace(/\//g, " / ")}`;
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

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const auth = await requireDashboard();
  if (isCloudMode() && !isOperator(auth.user?.id)) notFound();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const now = Date.now();
  const d = await customerDetail(id, now);
  if (!d) notFound();

  const kept = d.money?.keptUsd ?? 0;
  const margin = kept - (d.cost.totalUsd - (d.money?.feeUsd ?? 0));
  const status = STATUS[d.plan.status] ?? { word: "No plan", cls: "border-line bg-surface-2 text-ink-faint" };
  const perArticle = d.articleCount ? (d.cost.llmUsd + d.cost.dfsUsd) / d.articleCount : null;
  const failRate = d.writer.done + d.writer.failed ? d.writer.failed / (d.writer.done + d.writer.failed) : 0;
  const activeDays = d.activeDays.length;

  return (
    <div className="mx-auto max-w-[1280px] space-y-4 sm:space-y-5">
      <Link href="/owner" className="inline-flex items-center gap-1.5 text-[13px] text-ink-faint hover:text-ink">
        <span aria-hidden="true">←</span> Owner
      </Link>

      <header className="flex flex-col gap-3 pb-1 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-[1.6rem] font-semibold leading-tight tracking-tight text-ink sm:text-[1.75rem]">{d.email}</h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-ink-muted">
            <span className={cx("inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11.5px] font-medium", status.cls)}>
              {status.word}
              {d.plan.cancelAtPeriodEnd ? " · ending" : ""}
            </span>
            {d.plan.tier ? <span className="capitalize">{d.plan.tier}</span> : null}
            <span className="text-ink-faint">Joined {fullDate(d.createdAt)}</span>
            <span className="text-ink-faint">Last sign-in {ago(d.lastSignInAt, now)}</span>
            {d.plan.periodEnd && (d.plan.status === "active" || d.plan.status === "trialing") ? (
              <span className="text-ink-faint">
                {d.plan.status === "trialing" ? "Trial ends" : d.plan.cancelAtPeriodEnd ? "Ends" : "Renews"} {fullDate(d.plan.periodEnd)}
              </span>
            ) : null}
          </p>
        </div>
        {d.plan.polarCustomerId ? (
          <a
            href={`https://polar.sh/dashboard/dispatchseo/customers/${d.plan.polarCustomerId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-lg border border-line-soft bg-surface px-3 py-1.5 text-[12.5px] text-ink-muted hover:text-ink"
          >
            Open in Polar ↗
          </a>
        ) : null}
      </header>

      <Panel label="Money" className="grid grid-cols-2 gap-px bg-line-soft xl:grid-cols-4">
        {[
          d.money
            ? { label: "Charged to their card", value: money(d.money.chargedUsd), sub: `${d.money.orders} ${d.money.orders === 1 ? "payment" : "payments"} · tax ${money(d.money.taxUsd)}` }
            : { label: "Charged to their card", value: "–", sub: d.moneyError ?? "Polar's payments could not be read." },
          d.money
            ? { label: "You kept", value: money(kept), sub: `after tax, ${money(d.money.refundedUsd)} refunds, ${money(d.money.feeUsd)} Polar fee` }
            : { label: "You kept", value: "–", sub: "needs Polar's payments" },
          d.costError
            ? { label: "They cost you", value: "–", sub: "Apply migration 0076 to see cost" }
            : { label: "They cost you", value: money(d.cost.llmUsd + d.cost.dfsUsd, { precise: true }), sub: `AI ${money(d.cost.llmUsd, { precise: true })} · DataForSEO ${money(d.cost.dfsUsd, { precise: true })}` },
          d.costError || !d.money
            ? { label: "Margin, all time", value: "–", sub: d.costError ? "needs the cost" : "needs Polar's payments" }
            : { label: "Margin, all time", value: money(margin), sub: kept ? `${pct(margin, kept)} of what you kept` : "nothing paid yet", tone: margin < 0 ? "text-danger" : margin > 0 ? "text-ok" : "text-ink" },
        ].map((k) => (
          <div key={k.label} className="min-w-0 bg-surface px-4 pb-5 pt-4 sm:px-6 sm:pt-5">
            <p className="text-[12.5px] text-ink-muted sm:text-[13px]">{k.label}</p>
            <p className={cx("mt-2 text-[1.5rem] font-light leading-none tracking-tight tabular-nums sm:text-[2.1rem]", k.tone ?? "text-ink")}>{k.value}</p>
            <p className="mt-2 line-clamp-2 text-[12px] leading-snug text-ink-faint">{k.sub}</p>
          </div>
        ))}
      </Panel>

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-5">
        <Panel label="Ledger" className="lg:col-span-3">
          <PanelHead title={d.money ? "Kept vs cost, since they joined" : "Cost, since they joined"} meta="cumulative" />
          <div className="px-4 pb-5 pt-7 sm:px-6">
            {d.money ? (
            <AreaChart
              days={d.ledger.days}
              values={d.ledger.kept}
              previous={d.ledger.cost}
              unit="usd"
              tone="green"
              tone2="gray"
              height={200}
              label="Kept"
              legend="Kept"
              compareLabel="cost"
            />
            ) : (
              <AreaChart days={d.ledger.days} values={d.ledger.cost} unit="usd" tone="gray" height={200} label="Cost" legend="Cost so far" />
            )}
          </div>
        </Panel>
        <Panel label="Where the cost goes" className="lg:col-span-2">
          <PanelHead title="Where the cost goes" meta="all time" />
          <div className="px-5 pb-6 pt-5 sm:px-6">
            <BarList
              rows={d.cost.lines.slice(0, 9).map((l) => ({ key: `${l.kind}:${l.item}`, label: lineLabel(l.kind, l.item), value: l.usd }))}
              format="usd"
              tone="gray"
              empty={d.costError ? "Apply migration 0076 to see the cost lines." : "Nothing metered for this customer yet."}
            />
          </div>
          <StatCells
            className="border-b-0"
            items={[
              { label: "Per article", value: perArticle != null ? money(perArticle) : "–" },
              { label: "Articles live", value: fmt(d.articleCount) },
              { label: "Writer failures, 90 d", value: d.writer.done + d.writer.failed ? pct(d.writer.failed, d.writer.done + d.writer.failed) : "–", tone: failRate > 0.3 ? "danger" : undefined },
            ]}
          />
        </Panel>
      </div>

      <Panel label="Payments">
        <PanelHead title="Payments" meta={d.money ? `${d.money.orders} from Polar` : "not readable"} />
        {d.orders && d.orders.length ? (
          <div className="overflow-x-auto px-5 pb-4 pt-3 sm:px-6">
            <table className="w-full min-w-[520px] text-left text-[13px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-ink-faint">
                  <th scope="col" className="pb-2 font-medium">Date</th>
                  <th scope="col" className="pb-2 font-medium">What</th>
                  <th scope="col" className="pb-2 text-right font-medium">Charged</th>
                  <th scope="col" className="pb-2 text-right font-medium">Tax</th>
                  <th scope="col" className="pb-2 text-right font-medium">Polar fee</th>
                  <th scope="col" className="pb-2 text-right font-medium">Refunded</th>
                  <th scope="col" className="pb-2 text-right font-medium">Kept</th>
                </tr>
              </thead>
              <tbody>
                {d.orders.map((o) => (
                  <tr key={o.id} className="border-t border-line-soft">
                    <td className="py-2.5 font-mono tabular-nums text-ink-muted">{shortDate(o.at)}</td>
                    <td className="max-w-[14rem] truncate py-2.5 text-ink">
                      {o.product ?? "Order"} <span className="text-ink-faint">· {o.reason.replace(/_/g, " ")}</span>
                    </td>
                    <td className="py-2.5 text-right font-mono tabular-nums text-ink">{money(o.totalUsd)}</td>
                    <td className="py-2.5 text-right font-mono tabular-nums text-ink-faint">{money(o.taxUsd)}</td>
                    <td className="py-2.5 text-right font-mono tabular-nums text-ink-faint">{money(o.feeUsd)}</td>
                    <td className="py-2.5 text-right font-mono tabular-nums text-ink-faint">{o.refundedUsd ? money(o.refundedUsd) : "–"}</td>
                    <td className="py-2.5 text-right font-mono tabular-nums text-ok">{money(keptUsd(o))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="m-5 rounded-xl border border-dashed border-line px-4 py-6 text-center text-[13px] text-ink-faint sm:m-6">
            {d.money ? "No payment from this customer yet." : d.moneyError ?? "Polar's payments could not be read."}
          </p>
        )}
      </Panel>

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
        <Panel label="Google">
          <PanelHead title="Google clicks to their sites" meta="90 d" />
          <div className="px-4 pb-5 pt-7 sm:px-6">
            <AreaChart days={d.google.days} values={d.google.clicks} tone="green" height={160} label="Clicks" legend={`${fmt(d.google.totalClicks)} clicks · ${compact(d.google.totalImpressions)} impressions`} />
          </div>
          <StatCells
            className="border-b-0"
            items={[
              { label: "Sites", value: fmt(d.sites.length) },
              { label: "Search Console", value: `${d.sites.filter((s) => s.gscConnected).length} of ${d.sites.length}` },
              { label: "Cited by AI, 90 d", value: d.citations.checks ? `${d.citations.cited} of ${d.citations.checks}` : "–" },
            ]}
          />
        </Panel>
        <Panel label="Sites and setup">
          <PanelHead title="Sites and setup" />
          <ul className="divide-y divide-line-soft px-5 pb-2 pt-3 sm:px-6">
            {d.sites.length ? (
              d.sites.map((s) => (
                <li key={s.id} className="flex items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] text-ink">{s.domain}</span>
                    <span className="block truncate text-[12px] text-ink-faint">
                      {s.hosted ? "Hosted writer" : "Their own agent"} · added {shortDate(s.createdAt)}
                      {s.repo ? ` · ${s.repo}` : " · no repo"}
                    </span>
                  </span>
                  <span className={cx("shrink-0 text-[12px]", s.gscConnected ? "text-ok" : "text-warn")}>{s.gscConnected ? "Google on" : "No Google"}</span>
                </li>
              ))
            ) : (
              <li className="py-4 text-[13px] text-ink-faint">No site added.</li>
            )}
          </ul>
          {d.qualifier ? (
            <p className="border-t border-line-soft px-5 py-3.5 text-[12.5px] text-ink-faint sm:px-6">
              At sign-up: {d.qualifier.domain} on <span className="text-ink-muted">{d.qualifier.platform}</span>
              {d.qualifier.aiChoice ? ` · AI ${d.qualifier.aiChoice}` : ""}
              {d.qualifier.verdict ? ` · verdict ${d.qualifier.verdict}` : ""}
            </p>
          ) : null}
          {d.writer.lastError ? (
            <p className="border-t border-line-soft px-5 py-3.5 text-[12.5px] sm:px-6">
              <span className="text-danger">Last writer failure {ago(d.writer.lastErrorAt, now)}:</span> <span className="text-ink-muted">{d.writer.lastError}</span>
            </p>
          ) : null}
        </Panel>
      </div>

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
        <Panel label="Articles">
          <PanelHead title="Articles" meta={`${fmt(d.articleCount)} live`} />
          {d.articles.length ? (
            <ol className="px-2 pb-3 pt-2 sm:px-3">
              {d.articles.map((a, i) => (
                <li key={i} className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-surface-2/50">
                  <span className="min-w-0 flex-1">
                    {a.url ? (
                      <a href={a.url} target="_blank" rel="noopener noreferrer" className="block truncate text-[13.5px] text-ink hover:underline">
                        {a.title}
                      </a>
                    ) : (
                      <span className="block truncate text-[13.5px] text-ink">{a.title}</span>
                    )}
                    <span className="block truncate text-[12px] text-ink-faint">
                      {a.domain} · {shortDate(a.publishedAt)}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[12.5px] tabular-nums text-ink-muted">{a.costUsd != null ? money(a.costUsd) : ""}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="m-5 rounded-xl border border-dashed border-line px-4 py-6 text-center text-[13px] text-ink-faint sm:m-6">No article published yet.</p>
          )}
        </Panel>
        <Panel label="What they did">
          <PanelHead title="What they did" meta={`${activeDays} active ${activeDays === 1 ? "day" : "days"} · 90 d`} />
          {d.events.length ? (
            <ol className="px-2 pb-3 pt-2 sm:px-3">
              {d.events.slice(0, 16).map((e, i) => (
                <li key={i} className="flex items-center gap-3 rounded-lg px-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] text-ink">{EVENT_WORDS[e.event] ?? e.event.replace(/_/g, " ")}</span>
                    {e.detail ? <span className="block truncate text-[12px] text-ink-faint">{e.detail}</span> : null}
                  </span>
                  <span className="shrink-0 font-mono text-[12px] tabular-nums text-ink-faint">{ago(e.at, now)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="m-5 rounded-xl border border-dashed border-line px-4 py-6 text-center text-[13px] text-ink-faint sm:m-6">
              No product event recorded for them yet. Events are kept since Nov 6, plus whatever the PostHog import brings.
            </p>
          )}
        </Panel>
      </div>
    </div>
  );
}
