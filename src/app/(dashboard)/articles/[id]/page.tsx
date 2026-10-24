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
import { cx, FOCUS_RING } from "@/components/ui/styles";
import { ARTICLE_STATUS, articleStep, fmtInt, holdText, longDate, statusLabel, stepLine } from "../../article-status";
import { loadReport, redirectIfAgent } from "../../mode";
import { loadGoneUrls, loadLedger, loadPageDays, type Check, type Ledger, type PageDay } from "../article-data";
import { normalizePageUrl } from "@/lib/metrics";

export const dynamic = "force-dynamic";

// One article, read top to bottom in the order an owner asks about it: what
// it looks like (the cover), what it is (title, the search it's for), the
// one thing to do with it (open it, or publish / fix / retry it), then six
// facts - when it went out, where it sits on Google, who clicked, how it
// scored, what it read, what it checked. The angle is one line under them;
// Google's daily chart and the claim-by-claim fact check come last, the
// check folded shut. Only real data: the per-page numbers are Google's daily
// top-100 pages, the score and claims the draft's own validation.

const at = (ms: number, i = 0) => ({ "--at": `${ms}ms`, "--i": i }) as React.CSSProperties;
const DAY = 86_400_000;

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

  // "page:<id>" articles predate autopilot: no draft, so no ledger and no
  // cover (loadLedger returns null for them without querying).
  const hasDraft = Boolean(a.draftId) && !a.draftId.startsWith("page:");
  const [days, ledger, goneUrls] = await Promise.all([
    a.url ? loadPageDays(project.id, a.url).catch(() => [] as PageDay[]) : Promise.resolve([] as PageDay[]),
    hasDraft ? loadLedger(project.id, a.draftId) : Promise.resolve(null),
    a.url ? loadGoneUrls(project.id) : Promise.resolve(new Set<string>()),
  ]);
  // Known not to load any more: say so, and don't send anyone to it.
  const gone = a.url ? goneUrls.has(normalizePageUrl(a.url)) : false;
  const s = ARTICLE_STATUS[a.status];
  const step = articleStep(a);
  const live = a.status === "published";
  const paused = Boolean(report.paused);
  const pill = gone ? (
    <StatusPill tone="neutral" className="text-[14px]">
      Gone
    </StatusPill>
  ) : (
    <StatusPill tone={s.tone} live={s.live} className="text-[14px]">
      {statusLabel(a)}
    </StatusPill>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <Link href="/articles" className="arrive-up inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-muted hover:text-ink">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        All articles
      </Link>

      {/* ---- the cover, what it is, and the one thing to do with it ---- */}
      <header className="-mt-4 grid gap-6 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)] lg:items-center lg:gap-10">
        <div className="arrive-in" style={at(0)}>
          {hasDraft && ledger?.cover ? (
            // A plain <img>: the route is dynamic and same-origin. alt is
            // empty on purpose - the title sits right beside it.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/cover/${encodeURIComponent(a.draftId)}`}
              alt=""
              width={1200}
              height={630}
              decoding="async"
              className="block aspect-[1200/630] w-full rounded-2xl bg-surface-2 object-cover ring-1 ring-line-soft"
            />
          ) : (
            <div className="flex aspect-[1200/630] w-full items-center justify-center rounded-2xl border border-dashed border-line bg-surface-2/50">{pill}</div>
          )}
        </div>

        <div className="arrive-up min-w-0" style={at(80)}>
          {pill}
          <h1 className="mt-3 text-balance text-[1.75rem] font-semibold leading-[1.15] tracking-tight text-ink sm:text-[2.15rem]">{a.title}</h1>
          {a.keyword ? (
            <p className="mt-3 text-[15px] text-ink-muted">
              Written for the search <span className="font-medium text-ink">&ldquo;{a.keyword}&rdquo;</span>
            </p>
          ) : null}
          {!gone ? (
            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
              <PrimaryAction a={a} slug={project.slug} paused={paused} />
              {live ? (
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
          ) : null}
        </div>
      </header>

      {step != null ? (
        <section aria-label="Where it is now" className="arrive-up rounded-2xl border border-accent/25 bg-accent-soft/40 p-5 sm:p-7" style={at(160)}>
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

      {/* ---- the facts ---- */}
      <Facts a={a} days={days} ledger={ledger} />

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
      ) : ledger?.angle || a.gain ? (
        <Angle angle={ledger?.angle ?? null} gain={a.gain} />
      ) : null}

      {/* ---- how it does on Google ---- */}
      {live ? (
        days.length ? (
          <OverviewChart daily={packDays(days)} page />
        ) : (
          <section className="arrive-up rounded-2xl border border-dashed border-line px-6 py-10 text-center" style={at(300)}>
            <p className="text-[16px] font-medium text-ink">Not on Google yet</p>
            <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-ink-muted">
              New pages usually take a few days to a few weeks to show up. Google&apos;s numbers also run two to three days behind. This fills in on its own.
            </p>
          </section>
        )
      ) : null}

      {a.source !== "agent" && ledger && (ledger.checks.length || ledger.sources.length) ? <FactCheck ledger={ledger} /> : null}
    </div>
  );
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

/** Six facts, one frame, hairlines between: a label, a value, at most one
 *  quiet line under it. Articles from before autopilot have no draft, so
 *  they get the three Google ones only. */
function Facts({ a, days, ledger }: { a: AutopilotArticle; days: PageDay[]; ledger: Ledger | null }) {
  const live = a.status === "published";
  const cutoff = Date.now() - 28 * DAY;
  const recent = days.filter((d) => Date.parse(`${d.date.slice(0, 10)}T00:00:00Z`) >= cutoff);
  const clicks = recent.reduce((n, d) => n + d.clicks, 0);
  const impressions = recent.reduce((n, d) => n + d.impressions, 0);
  const lastPos = [...days].reverse().find((d) => d.position != null)?.position ?? null;
  const pos = a.position ?? lastPos;
  const onGoogle = Boolean(a.url) && (days.length > 0 || pos != null);
  const hosts = ledger ? [...new Set(ledger.sources.map((src) => src.host))] : [];
  const score = ledger?.score != null ? Math.max(0, Math.min(100, Math.round(ledger.score))) : null;

  return (
    <dl
      aria-label="At a glance"
      className={cx(
        "arrive-up grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line-soft bg-line-soft sm:grid-cols-3",
        // An odd tile out on a phone spans the row rather than leaving a hole.
        "[&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1",
      )}
      style={at(200)}
    >
      <Fact
        label="Published"
        value={live ? longDate(a.publishedAt ?? a.createdAt) : statusLabel(a)}
        sub={live ? null : `Started ${longDate(a.createdAt)}`}
      />
      <Fact label="Spot on Google" value={pos != null ? `#${Math.max(1, Math.round(pos))}` : "Not on Google yet"} small={pos == null} />
      <Fact
        label="Clicks, last 28 days"
        value={onGoogle ? fmtInt(clicks) : "None yet"}
        small={!onGoogle}
        sub={onGoogle ? `Shown ${fmtInt(impressions)} ${impressions === 1 ? "time" : "times"}` : null}
      />
      {a.source === "agent" ? null : (
        <>
          <Fact
            label="Quality score"
            value={
              score != null ? (
                <>
                  {score}
                  <span className="ml-0.5 text-[0.95rem] font-medium text-ink-faint">/100</span>
                </>
              ) : (
                "Not scored yet"
              )
            }
            small={score == null}
          />
          <Fact
            label="Sources"
            value={ledger?.sources.length ? fmtInt(ledger.sources.length) : "None yet"}
            small={!ledger?.sources.length}
            sub={hosts.length ? hosts.join(", ") : null}
          />
          <Fact
            label="Facts checked"
            value={
              ledger?.claims ? (
                <>
                  {fmtInt(ledger.supported)}
                  <span className="text-[0.95rem] font-medium text-ink-faint"> of {fmtInt(ledger.claims)}</span>
                </>
              ) : (
                "Not checked yet"
              )
            }
            small={!ledger?.claims}
            sub={ledger?.claims ? "matched a source" : null}
          />
        </>
      )}
    </dl>
  );
}

function Fact({ label, value, sub, small = false }: { label: string; value: React.ReactNode; sub?: string | null; small?: boolean }) {
  return (
    <div className="min-w-0 bg-surface px-4 py-4 sm:px-5 sm:py-5">
      <dt className="text-[13px] text-ink-muted">{label}</dt>
      <dd
        className={cx(
          "mt-1.5 truncate font-semibold leading-tight tracking-tight tabular-nums",
          small ? "text-[1.05rem] text-ink-muted" : "text-[1.3rem] text-ink sm:text-[1.5rem]",
        )}
      >
        {value}
      </dd>
      {sub ? (
        <dd className="mt-1 truncate text-[12.5px] text-ink-faint" title={sub}>
          {sub}
        </dd>
      ) : null}
    </div>
  );
}

/** The plan's angle in one line, and what it adds that page one lacks. */
function Angle({ angle, gain }: { angle: string | null; gain: string | null }) {
  return (
    <section aria-label="Angle" className="arrive-up max-w-3xl border-l-2 border-line pl-4" style={at(280)}>
      <p className="text-[13px] text-ink-muted">Angle</p>
      <p className="mt-1 line-clamp-2 text-[15px] leading-relaxed text-ink">{angle ?? gain}</p>
      {angle && gain ? (
        <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-ink-muted">
          <span className="text-ink-faint">What it adds: </span>
          {gain}
        </p>
      ) : null}
    </section>
  );
}

const VERDICT: Record<Check["verdict"], { word: string; tone: string; path: string }> = {
  supports: { word: "Matched a source", tone: "text-ok", path: "M5 12.5l4.5 4.5L19 7.5" },
  contradicts: { word: "A source disagrees", tone: "text-danger", path: "M7 7l10 10M17 7L7 17" },
  says_nothing: { word: "No source says this", tone: "text-ink-faint", path: "M7 12h10" },
};

/** Writer markdown in a claim, flattened to the sentence a reader sees. */
function plainClaim(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\[\d+\]/g, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/^[-*#>\s]+/, "")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}

/** Every checked claim and the sources read, folded shut: there when you
 *  want to audit it, out of the way when you don't. */
function FactCheck({ ledger }: { ledger: Ledger }) {
  const n = ledger.checks.length;
  return (
    <details className="group arrive-up rounded-2xl border border-line-soft bg-surface" style={at(360)}>
      <summary
        className={cx(
          "flex cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-5 py-4 transition-colors hover:bg-surface-2/50 group-open:rounded-b-none sm:px-6 [&::-webkit-details-marker]:hidden",
          FOCUS_RING,
        )}
      >
        <span className="text-[15px] font-medium text-ink">
          {n ? `Fact check (${fmtInt(n)} ${n === 1 ? "claim" : "claims"})` : `Sources (${fmtInt(ledger.sources.length)})`}
        </span>
        <span className="flex items-center gap-3 text-[13px] text-ink-muted">
          {n ? <span className="tabular-nums">{fmtInt(ledger.checks.filter((c) => c.verdict === "supports").length)} matched</span> : null}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-ink-faint transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </summary>

      <div className="border-t border-line-soft">
        {n ? (
          <ol className="divide-y divide-line-soft">
            {ledger.checks.map((c, i) => {
              const v = VERDICT[c.verdict];
              return (
                <li key={i} className="flex gap-3 px-5 py-3.5 sm:px-6">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={cx("mt-[3px] h-4 w-4 shrink-0", v.tone)} aria-hidden="true">
                    <path d={v.path} />
                  </svg>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] leading-relaxed text-ink">
                      <span className="sr-only">{v.word}: </span>
                      {plainClaim(c.claim)}
                    </p>
                    {c.source ? (
                      <a href={c.source.url} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-flex max-w-full items-center gap-1 text-[12.5px] text-ink-faint hover:text-accent">
                        <span className="truncate">{c.source.host}</span>
                        <ExternalIcon className="h-3 w-3 shrink-0" />
                      </a>
                    ) : c.verdict !== "supports" ? (
                      <p className="mt-0.5 text-[12.5px] text-ink-faint">{v.word}</p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        ) : null}

        {ledger.sources.length ? (
          <div className={cx("px-5 py-4 sm:px-6", n ? "border-t border-line-soft bg-canvas/40" : "")}>
            {n ? <p className="text-[13px] text-ink-muted">Sources it read</p> : null}
            <ul className={cx("flex flex-wrap gap-x-5 gap-y-2", n ? "mt-2.5" : "")}>
              {ledger.sources.map((src) => (
                <li key={src.url} className="min-w-0 max-w-full">
                  <a href={src.url} target="_blank" rel="noopener noreferrer" title={src.title ?? src.url} className="inline-flex max-w-full items-center gap-2 text-[13.5px] text-ink hover:text-accent">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(src.host)}&sz=32`} alt="" aria-hidden="true" width={16} height={16} className="h-4 w-4 shrink-0 rounded-sm" />
                    <span className="truncate">{src.host}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </details>
  );
}
