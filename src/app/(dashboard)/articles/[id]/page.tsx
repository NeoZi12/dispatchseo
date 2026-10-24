import Link from "next/link";
import { notFound } from "next/navigation";
import { requireDashboard } from "@/lib/auth-gate";
import { getActiveProject } from "@/lib/active-project";
import type { AutopilotArticle } from "@/lib/autopilot/report";
import { releaseArticle, retryArticle } from "@/app/autopilot-actions";
import { ActionForm } from "@/components/ui/action-form";
import { ExternalIcon } from "@/components/ui/article-list";
import { buttonClass } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { packDays } from "@/components/ui/overview-pack";
import { OverviewChart } from "@/components/ui/overview-chart";
import { PipelineSteps } from "@/components/ui/pipeline-steps";
import { StatusPill } from "@/components/ui/status-pill";
import { cx } from "@/components/ui/styles";
import { ARTICLE_STATUS, articleStep, holdText, longDate, statusLabel, stepLine } from "../../article-status";
import { loadReport, redirectIfAgent } from "../../mode";
import { loadGoneUrls, loadLedger, loadPageDays, loadStepTimes, type Ledger } from "../article-data";
import { normalizePageUrl } from "@/lib/metrics";

export const dynamic = "force-dynamic";

// One article, everything about it, Polar-style: what it is and the one
// thing to do with it (open it, or publish / fix / retry it), how it does on
// Google (the same overview card as Home, for this page alone: people, times
// shown, spot now and best), how it was made (the research ledger and its
// sources), and when each step happened. Only real data: the per-page
// numbers are Google's daily top-100 pages, the step dates the writer's own
// model-call log.

const at = (ms: number, i = 0) => ({ "--at": `${ms}ms`, "--i": i }) as React.CSSProperties;

export default async function ArticlePage({ params }: { params: Promise<{ id: string }> }) {
  await requireDashboard();
  await redirectIfAgent("/drafts");
  // Ids are UUIDs, but decode anyway: a param can arrive percent-encoded.
  const id = decodeURIComponent((await params).id);
  const project = await getActiveProject();
  const report = await loadReport(project.id);
  // Scoped to the active project by construction: the report only holds its
  // articles, so another site's id is simply not found.
  const a = report?.articles.find((x) => x.draftId === id || x.runId === id);
  if (!report || !a) notFound();

  const [days, ledger, steps, goneUrls] = await Promise.all([
    a.url ? loadPageDays(project.id, a.url).catch(() => []) : Promise.resolve([]),
    loadLedger(project.id, a.draftId),
    loadStepTimes(project.id, a.runId),
    a.url ? loadGoneUrls(project.id) : Promise.resolve(new Set<string>()),
  ]);
  // Known not to load any more: say so, and don't send anyone to it.
  const gone = a.url ? goneUrls.has(normalizePageUrl(a.url)) : false;
  const s = ARTICLE_STATUS[a.status];
  const step = articleStep(a);
  const live = a.status === "published";
  const paused = Boolean(report.paused);

  return (
    <div className="mx-auto max-w-5xl space-y-12">
      <Link href="/articles" className="arrive-up inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-muted hover:text-ink">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        All articles
      </Link>

      {/* ---- what it is, and the one thing to do with it ---- */}
      <header className="-mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start lg:gap-12">
        <div className="arrive-up min-w-0" style={at(40)}>
          {gone ? (
            <StatusPill tone="neutral" className="text-[14px]">
              Gone
            </StatusPill>
          ) : (
            <StatusPill tone={s.tone} live={s.live} className="text-[14px]">
              {statusLabel(a)}
            </StatusPill>
          )}
          <h1 className="mt-3 text-balance text-[1.9rem] font-semibold leading-[1.15] tracking-tight text-ink sm:text-[2.4rem]">{a.title}</h1>
          <div className="mt-4 space-y-1 text-[15px] text-ink-muted">
            {a.keyword ? (
              <p>
                Written for the search <span className="font-medium text-ink">&ldquo;{a.keyword}&rdquo;</span>
              </p>
            ) : null}
            <p>{whenLine(a)}</p>
          </div>
        </div>
        <div className="arrive-up flex flex-col items-start gap-3 lg:items-end" style={at(120)}>
          {gone ? null : <PrimaryAction a={a} slug={project.slug} paused={paused} />}
          {live && !gone ? (
            <a
              href={`https://www.google.com/search?q=${encodeURIComponent(a.keyword ?? a.title)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[14px] font-medium text-ink-muted underline decoration-line underline-offset-[4px] hover:text-ink"
            >
              See it on Google
              <ExternalIcon />
            </a>
          ) : null}
        </div>
      </header>

      {step != null ? (
        <section aria-label="Where it is now" className="arrive-up rounded-2xl border border-accent/25 bg-accent-soft/40 p-5 sm:p-7" style={at(200)}>
          <PipelineSteps current={step} labels />
          <p className="mt-4 text-[15px] leading-relaxed text-ink">{stepLine(step)}</p>
        </section>
      ) : null}

      {gone ? (
        <Callout tone="warn" title="This page doesn't load any more">
          It was live, and Google still remembers it, but the page no longer loads on your site. Its past numbers stay below.
        </Callout>
      ) : null}

      {a.status === "held" ? (
        <Callout tone="warn" title={holdText(a.holdReason).first ? "Your first article waits for your read" : "Held back before publishing"}>
          {holdText(a.holdReason).text}
        </Callout>
      ) : a.status === "needs_setup" ? (
        <Callout tone="warn" title="Finished, with nowhere to publish">
          Choose where articles go and it goes out straight away.
        </Callout>
      ) : a.status === "failed" ? (
        <Callout tone="danger" title="The writer stopped this one">
          {a.error ?? "It couldn't finish with facts it could verify, so nothing was published."}
          {a.runStatus === "failed" && paused ? " Resume autopilot to try it again." : null}
        </Callout>
      ) : null}

      {/* ---- how it does on Google ---- */}
      {live ? (
        days.length ? (
          <OverviewChart daily={packDays(days)} page />
        ) : (
          <section className="arrive-up rounded-2xl border border-dashed border-line px-6 py-10 text-center" style={at(200)}>
            <p className="text-[16px] font-medium text-ink">Not on Google yet</p>
            <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-ink-muted">
              New pages usually take a few days to a few weeks to show up. Google&apos;s numbers also run two to three days behind. This fills in on its own.
            </p>
          </section>
        )
      ) : null}

      {a.source === "agent" ? (
        // Published before autopilot: no research ledger, no writer steps -
        // just who wrote it and when.
        <section aria-labelledby="made-title" className="arrive-up rounded-2xl border border-line-soft bg-surface p-5 sm:p-6" style={at(300)}>
          <h2 id="made-title" className="text-[1.15rem] font-semibold tracking-tight text-ink">
            Written before autopilot
          </h2>
          <p className="mt-1.5 text-[15px] leading-relaxed text-ink-muted">
            Your coding agent wrote and published this one{a.publishedAt ? ` on ${longDate(a.publishedAt)}` : ""}, before the writer took over. Its
            Google numbers are tracked the same way as everything since.
          </p>
        </section>
      ) : (
        <>
          {/* ---- how it was made ---- */}
          {ledger || a.gain ? <HowItWasMade ledger={ledger} gain={a.gain} /> : null}

          {/* ---- when each step happened ---- */}
          <Timeline a={a} steps={steps} />
        </>
      )}
    </div>
  );
}

function whenLine(a: AutopilotArticle): string {
  if (a.status === "published") return `Published ${longDate(a.publishedAt ?? a.createdAt)}`;
  if (articleStep(a) != null) return `Being written since ${longDate(a.createdAt)}`;
  if (ARTICLE_STATUS[a.status].attention) return `Waiting since ${longDate(a.createdAt)}`;
  return `Started ${longDate(a.createdAt)}, then stopped`;
}

/** The one unmistakable button: open it if it's live, otherwise the action
 *  that moves it on. */
function PrimaryAction({ a, slug, paused }: { a: AutopilotArticle; slug: string; paused: boolean }) {
  if (a.status === "published" && a.url) {
    return (
      <a href={a.url} target="_blank" rel="noopener noreferrer" className={buttonClass("primary", "lg")}>
        Open the live article
        <ExternalIcon className="h-4 w-4" />
      </a>
    );
  }
  if (a.status === "held" && a.runId) {
    return <ActionForm action={releaseArticle} slug={slug} submitLabel="Publish now" size="lg" hidden={{ run_id: a.runId }} className="[&_p:empty]:hidden" />;
  }
  if (a.status === "needs_setup") {
    return (
      <Link href="/settings?section=publishing" className={buttonClass("primary", "lg")}>
        Choose where articles go
      </Link>
    );
  }
  if (a.runStatus === "failed" && a.runId && !paused) {
    return <ActionForm action={retryArticle} slug={slug} submitLabel="Try again" size="lg" hidden={{ run_id: a.runId }} className="[&_p:empty]:hidden" />;
  }
  return null;
}

function HowItWasMade({ ledger, gain }: { ledger: Ledger | null; gain: string | null }) {
  const pct = ledger && ledger.claims > 0 ? Math.round((ledger.supported / ledger.claims) * 100) : null;
  return (
    <section aria-labelledby="made-title" className="arrive-up space-y-5" style={at(300)}>
      <h2 id="made-title" className="text-[1.4rem] font-semibold tracking-tight text-ink">
        How it was made
      </h2>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="space-y-5 rounded-2xl border border-line-soft bg-surface p-5 sm:p-6">
          {ledger?.angle ? <Made label="The angle">{ledger.angle}</Made> : null}
          {gain ? <Made label="What it adds that Google's top results don't">{gain}</Made> : null}
          {pct != null ? (
            <Made label="Fact check">
              <span className="tabular-nums">
                {ledger!.supported} of {ledger!.claims}
              </span>{" "}
              claims matched a quoted source.
              <span className="mt-2.5 block h-2 overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
                <span className="arrive-grow block h-full rounded-full bg-ok" style={{ width: `${pct}%`, ...at(600) }} />
              </span>
              {ledger!.maxOverlap != null ? (
                <span className="mt-2 block text-[13px] text-ink-muted">
                  At most {Math.round(ledger!.maxOverlap * 100)}% of its wording matches any one source.
                </span>
              ) : null}
            </Made>
          ) : null}
        </div>
        {ledger?.score != null ? <ScoreRing score={ledger.score} /> : null}
      </div>

      {ledger && ledger.sources.length ? (
        <div className="rounded-2xl border border-line-soft bg-surface">
          <p className="border-b border-line-soft px-5 py-3.5 text-[14px] font-medium text-ink sm:px-6">
            Sources it read <span className="font-normal text-ink-faint">{ledger.sources.length}</span>
          </p>
          <ul className="divide-y divide-line-soft">
            {ledger.sources.map((src, i) => (
              <li key={src.url} className="arrive-up" style={{ ...at(500, i), "--step": "40ms" } as React.CSSProperties}>
                <a href={src.url} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-3.5 px-5 py-3.5 transition-colors hover:bg-surface-2/50 sm:px-6">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(src.host)}&sz=32`} alt="" aria-hidden="true" width={18} height={18} className="h-[18px] w-[18px] shrink-0 rounded-sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] text-ink group-hover:text-accent">{src.title ?? src.host}</span>
                    {src.title ? <span className="block truncate text-[12.5px] text-ink-faint">{src.host}</span> : null}
                  </span>
                  <ExternalIcon className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function Made({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[13px] text-ink-muted">{label}</p>
      <div className="mt-1 text-[15px] leading-relaxed text-ink">{children}</div>
    </div>
  );
}

/** The quality gate's score as a ring that draws itself in. */
function ScoreRing({ score }: { score: number }) {
  const v = Math.max(0, Math.min(100, Math.round(score)));
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-line-soft bg-surface p-6 text-center">
      <div className="relative h-32 w-32">
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden="true">
          <circle cx="60" cy="60" r="50" fill="none" stroke="var(--color-surface-3)" strokeWidth="10" />
          <circle
            cx="60"
            cy="60"
            r="50"
            fill="none"
            stroke={v >= 80 ? "var(--color-ok)" : v >= 60 ? "var(--color-warn)" : "var(--color-danger)"}
            strokeWidth="10"
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={`${v} 100`}
            className="arrive-in"
            style={at(500)}
          />
        </svg>
        <p className="absolute inset-0 flex items-center justify-center text-[2rem] font-semibold tabular-nums text-ink">{v}</p>
      </div>
      <p className="mt-3 text-[14px] font-medium text-ink">Quality score</p>
      <p className="text-[13px] text-ink-muted">out of 100</p>
    </div>
  );
}

/** When each step happened, top to bottom. A date shows only when we know
 *  it; a step that's done without one just reads done. */
function Timeline({ a, steps }: { a: AutopilotArticle; steps: Awaited<ReturnType<typeof loadStepTimes>> }) {
  const live = a.status === "published";
  const step = articleStep(a);
  const items: Array<{ label: string; at: string | null }> = [
    { label: "Topic picked", at: steps.started ?? a.createdAt },
    { label: "Researched", at: steps.research },
    { label: "Planned", at: steps.plan },
    { label: "Written", at: steps.write },
    { label: "Facts checked", at: steps.check },
    { label: "Published", at: a.publishedAt },
  ];
  // Where the article is on this list: everything before is done.
  const current = live ? items.length : step != null ? step + 1 : (() => {
    let last = 0;
    items.forEach((it, i) => it.at && (last = i));
    return last + 1;
  })();
  const stopped = a.status === "failed";
  const waiting = ARTICLE_STATUS[a.status].attention;
  return (
    <section aria-labelledby="timeline-title" className="arrive-up space-y-5" style={at(380)}>
      <h2 id="timeline-title" className="text-[1.4rem] font-semibold tracking-tight text-ink">
        Timeline
      </h2>
      <ol className="rounded-2xl border border-line-soft bg-surface px-5 py-5 sm:px-6">
        {items.map((it, i) => {
          const done = i < current;
          const now = i === current && !live;
          const tone = done ? "bg-ok" : now ? (stopped ? "bg-danger" : waiting ? "bg-warn" : "bg-accent") : "bg-surface-3";
          return (
            <li key={it.label} className="relative flex gap-4 pb-5 last:pb-0">
              {i < items.length - 1 ? (
                <span aria-hidden="true" className={cx("absolute left-[5px] top-4 h-[calc(100%-6px)] w-0.5 rounded-full", done ? "bg-ok/50" : "bg-surface-3")} />
              ) : null}
              <span aria-hidden="true" className={cx("relative mt-1.5 h-3 w-3 shrink-0 rounded-full", tone, now && !stopped ? "dispatch-calm" : "")} />
              <div className="min-w-0">
                <p className={cx("text-[15px]", done || now ? "font-medium text-ink" : "text-ink-faint")}>
                  {it.label}
                  {now ? (
                    <span className="ml-2 text-[13px] font-normal text-ink-muted">
                      {stopped ? "stopped here" : waiting ? "waiting for you" : "in progress"}
                    </span>
                  ) : null}
                </p>
                {done && it.at ? <p className="text-[13px] text-ink-muted">{longDate(it.at)}</p> : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
