import { redirect } from "next/navigation";
import { requireDashboard } from "@/lib/auth-gate";
import { isCloudMode } from "@/lib/cloud";
import { scopedProjects } from "@/lib/active-project";
import { DEFAULT_PROJECT_ID, publishTarget, writerMode, type Project } from "@/lib/projects";
import { hostedPath } from "@/lib/hosted-blog";
import {
  articlesPerMonthFor,
  FREE_ARTICLES_PER_MONTH,
  getSubscription,
  isActive,
  polarConfigured,
  sitesLimitOf,
  sitesRemaining,
  TIER_LIMITS,
  type Tier,
} from "@/lib/billing";
import { customShareLimit, siteShareReport, type SiteShareReport } from "@/lib/site-shares";
import { DispatcherNote } from "@/components/dispatcher-note";
import { cx } from "@/components/ui/styles";
import { BTN_PRIMARY, BTN_SECONDARY } from "@/components/setup-stage/primitives";
import { BackToSettings } from "../more-links";
import { SiteList, WebsitesHeader, type SiteCard } from "./websites-client";

export const dynamic = "force-dynamic";
// Removing a website runs deleteProject from this page, which walks the
// site's repo (disables workflows, removes the pack) before the row goes,
// and adding one probes the address first. Same headroom as Settings.
export const maxDuration = 60;

// Settings > Websites (multi-site plans, 2026-11-11): every site on the
// account, how this month's articles are split between them, and adding or
// removing one. One pool of articles a month per owner; each covered site
// gets a share (lib/site-shares.ts). The numbers come from siteShareReport,
// the same read the get_site_share MCP tool returns; the Auto / Custom
// control writes through setSiteShare, the same write as set_site_share.
//
// Layout (2026-11-11): one column, like every other Settings pane. The
// sidebar is the settings menu while this page is open (nav.tsx
// settingsGroups has the Websites entry), so there is no section list here.
// Each site is a card of its own with its controls in view: how its articles
// go live, its share of the month, pause, and remove.

const at = (ms: number, i = 0) => ({ "--at": `${ms}ms`, "--i": i }) as React.CSSProperties;

/** One colour per site in the split: the bar's slots and that site's big
 *  number share it, so a row reads back to its part of the bar. Violet to
 *  pink, the accent's family; nothing that means ok / warn / danger. */
const HUES = ["#a78bfa", "#e879f9", "#818cf8", "#f472b6", "#c084fc"];

/** The ramp's reason, said per month. The ramp phrases its reasons per week
 *  (autopilot/math.ts rampVerdict); this page counts months only. */
function slowerLine(reason: string | null, n: number): string {
  const r = reason ?? "";
  const per = `${n} ${n === 1 ? "article" : "articles"} a month`;
  if (/search console/i.test(r)) return `I'm keeping it to ${per} until Google Search Console starts sending its numbers.`;
  if (/new site/i.test(r)) return `New sites start slower while Google gets to know them, so it gets ${per} for now.`;
  if (/second month/i.test(r)) return `It's in its second month, so it gets ${per} for now. More comes as Google trusts it.`;
  if (/could not be read/i.test(r)) return `I couldn't read its history just now, so it gets ${per} to be safe.`;
  if (/index/i.test(r)) return `I'm keeping it to ${per} until Google indexes more of its articles.`;
  return `It gets ${per} for now while Google gets to know it.`;
}

/** What removing the site does to its articles, said before the click. */
function removeNote(p: Project): string {
  const target = publishTarget(p);
  if (target === "hosted") {
    const kept = p.github_repo ? " Articles already merged into your repo stay." : "";
    return `The blog we host at ${p.domain}/${hostedPath(p)} goes offline, so its articles stop showing.${kept} Its rankings and traffic history go too. There's no undo.`;
  }
  if (target === "wordpress") return "Articles already on your site stay. Its rankings and traffic history go. There's no undo.";
  return "Articles already merged into your repo stay. Its rankings and traffic history go. There's no undo.";
}

function nextMonthLabel(now = new Date()): string {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return next.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
}

export default async function WebsitesPage({ searchParams }: { searchParams: Promise<{ add?: string }> }) {
  const auth = await requireDashboard();
  // The split is a hosted-plan idea: self-host has no plan and adds sites
  // from the switcher.
  if (!isCloudMode() || !auth.user) redirect("/settings");
  const user = auth.user;
  const [mine, sub, params] = await Promise.all([scopedProjects(), getSubscription(user.id), searchParams]);
  if (!mine.length) redirect("/onboarding");

  const billed = polarConfigured();
  const active = isActive(sub);
  const free = billed && !active;
  const tier: Tier | null = active ? (sub!.status === "trialing" ? "starter" : sub!.tier) : null;
  const limit = active ? sitesLimitOf(sub!) : billed ? 1 : null;
  const room = sitesRemaining(sub, mine.length);
  const canAdd = room === null || room > 0;

  // One report per site (each has its own ramp and month), read fresh. A
  // site whose read fails still gets its row, with dashes.
  const reports = await Promise.all(mine.map((p) => siteShareReport(p.id).catch(() => null)));
  const byId = new Map(mine.map((p, i) => [p.id, reports[i]]));
  // The account-wide numbers (pool, held, every site's share) are the same in
  // every report, except that a site on the operator's hand-set pace reports
  // no pool: prefer one that has it.
  const head: SiteShareReport | null = reports.find((r) => r?.pool != null) ?? reports.find((r) => r != null) ?? null;
  // Coverage order (oldest first), as the plan decides it.
  const order = new Map((head?.sites ?? []).map((s, i) => [s.slug, i]));
  const sorted = [...mine].sort((a, b) => (order.get(a.slug) ?? 99) - (order.get(b.slug) ?? 99) || (a.created_at < b.created_at ? -1 : 1));
  const siblings = new Map((head?.sites ?? []).map((s) => [s.slug, s]));
  const pool = head?.pool ?? null;

  let hue = 0;
  const cards: SiteCard[] = sorted.map((p) => {
    const r = byId.get(p.id) ?? null;
    const sib = siblings.get(p.slug);
    const covered = sib ? sib.covered : true;
    // A site on the operator's hand-set pace sits outside the split.
    const outside = pool != null && sib != null && sib.share == null;
    const share = free ? (covered ? (r?.share ?? FREE_ARTICLES_PER_MONTH) : 0) : outside ? null : (sib?.share ?? r?.share ?? null);
    const inSplit = covered && !outside && share != null;
    const otherCustom = (head?.sites ?? [])
      .filter((s) => s.slug !== p.slug && s.covered && s.mode === "custom" && s.share != null)
      .reduce((a, s) => a + (s.share ?? 0), 0);
    const settingUp = writerMode(p) === "hosted" && !p.setup_connected_at;

    let status: SiteCard["status"] = "writing";
    let line: string | null = null;
    if (!covered) {
      status = "uncovered";
      line = `Your plan covers your ${limit === 1 ? "oldest website" : `${limit} oldest websites`}, so I'm holding this one. Remove a website or upgrade, and I'll pick it up.`;
    } else if (settingUp) {
      status = "setup";
      line = `I start writing for ${p.domain} once its setup is finished.`;
    } else if (p.writer_paused_at) {
      status = "paused";
      line = "Writing is paused for this site. Resume it from its Overview.";
    } else if (r?.safeMax === 0) {
      status = "paused";
      line = "Google has indexed too few of its older articles, so I've paused it. It picks up again on its own once Google catches up.";
    } else if (r?.safeMax != null) {
      status = "slower";
      line = slowerLine(r.reason, r.safeMax);
    } else if (inSplit && share === 0 && pool != null) {
      line = "Your plan's articles this month all went to your other sites.";
    }

    return {
      slug: p.slug,
      domain: p.domain,
      hue: inSplit ? HUES[hue++ % HUES.length] : null,
      share,
      used: r?.usedThisMonth ?? sib?.usedThisMonth ?? null,
      mode: r?.mode ?? sib?.mode ?? "auto",
      status,
      outside,
      line,
      safeMax: r?.safeMax ?? null,
      // Free has no split to set; a site outside coverage or the split has
      // no share to change.
      editable: pool != null && inSplit,
      customMax: pool != null ? customShareLimit(pool, otherCustom) : 0,
      pool,
      removable: p.id !== DEFAULT_PROJECT_ID,
      removeNote: removeNote(p),
      repo: p.github_repo,
      hosted: writerMode(p) === "hosted",
      // null (never chosen, or a pre-0089 database) reads as automatic.
      publishMode: p.publish_mode === "review" ? "review" : "auto",
      ownerPaused: Boolean(p.writer_paused_at),
      // The per-site switches only mean something for a site we write for
      // that the plan covers and whose setup is done.
      controllable: writerMode(p) === "hosted" && covered && !settingUp,
      isLastSite: mine.length === 1,
      lastSiteWhileSubscribed: mine.length === 1 && active,
    };
  });

  const uncovered = cards.filter((c) => c.status === "uncovered");
  const owned = mine.length;
  const sitesFigure = limit == null ? `${owned}` : owned > limit ? `${limit} of ${owned}` : `${owned} of ${limit}`;
  const sitesLabel = limit == null ? (owned === 1 ? "website" : "websites") : owned > limit ? "websites covered" : limit === 1 ? "website" : "websites";
  const poolFigure = free ? FREE_ARTICLES_PER_MONTH : pool;
  const segments = cards.filter((c) => c.hue && (c.share ?? 0) > 0);
  const held = head?.held ?? 0;
  const upgradable = tier !== "scale";

  const headerAction = canAdd ? null : free ? null : upgradable ? (
    <a href="/billing" className={cx(BTN_SECONDARY, "px-4 py-2.5 text-[14px]")}>
      Upgrade for more websites
    </a>
  ) : null;

  return (
    <WebsitesView
      canAdd={canAdd}
      initialOpen={params.add === "1" && canAdd}
      headerAction={headerAction}
      unread={head == null}
      poolFigure={poolFigure}
      free={free}
      sitesFigure={sitesFigure}
      sitesLabel={sitesLabel}
      segments={segments}
      held={held}
      uncovered={uncovered}
      limit={limit}
      upgradable={upgradable}
      cards={cards}
    />
  );
}

/** The page itself, from numbers already worked out above. */
function WebsitesView({
  canAdd,
  initialOpen,
  headerAction,
  unread,
  poolFigure,
  free,
  sitesFigure,
  sitesLabel,
  segments,
  held,
  uncovered,
  limit,
  upgradable,
  cards,
}: {
  canAdd: boolean;
  initialOpen: boolean;
  headerAction: React.ReactNode;
  /** This month's numbers couldn't be read; the sites still list. */
  unread: boolean;
  poolFigure: number | null;
  free: boolean;
  sitesFigure: string;
  sitesLabel: string;
  segments: SiteCard[];
  held: number;
  uncovered: SiteCard[];
  limit: number | null;
  upgradable: boolean;
  cards: SiteCard[];
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-3">
        {/* Phones only: there the settings menu is a drawer. */}
        <BackToSettings />
        <section aria-labelledby="websites-title" className="min-w-0 space-y-6">
          <WebsitesHeader canAdd={canAdd} initialOpen={initialOpen} action={headerAction} style={at(40)} />

          {unread ? (
            <DispatcherNote
              kind="alert"
              title="I couldn't read this month's numbers just now"
              action={
                <a href="/settings/websites" className={cx(BTN_SECONDARY, "px-4 py-2.5 text-[14px]")}>
                  Try again
                </a>
              }
              className="arrive-up"
              style={at(140)}
            >
              Your sites are fine and still writing. Reload in a moment to see how the month is split.
            </DispatcherNote>
          ) : (
            <SplitBoard
              poolFigure={poolFigure}
              poolLabel={free ? "articles a month on the free plan" : "articles a month on your plan"}
              sitesFigure={sitesFigure}
              sitesLabel={sitesLabel}
              segments={segments}
              held={free ? 0 : held}
              resets={nextMonthLabel()}
              style={at(140)}
            />
          )}

          {/* Paid plans hand out the whole plan (no slow start since
              2026-11-11), so articles are only ever left over by the owner's
              own choices: custom numbers that add up to less than the plan,
              or every other site paused or still being set up. Say how to
              use them rather than "held", which reads as us keeping them. */}
          {!free && !unread && held > 0 ? (
            <DispatcherNote kind="waiting" title={`${held} of your ${poolFigure ?? ""} articles ${held === 1 ? "isn't" : "aren't"} assigned to a website`} className="arrive-up" style={at(170)}>
              They&apos;re yours to use this month. Raise a website&apos;s number below, or switch one to Automatic, and I&apos;ll write them. Paused websites and ones still being set up
              don&apos;t take any.
            </DispatcherNote>
          ) : null}

          {uncovered.length > 0 ? (
            <DispatcherNote
              kind="alert"
              title={uncovered.length === 1 ? `${uncovered[0].domain} isn't covered by your plan` : `${uncovered.length} of your websites aren't covered by your plan`}
              action={
                upgradable ? (
                  <a href="/billing" className={cx(BTN_PRIMARY, "px-5 py-2.5 text-[14px]")}>
                    Upgrade
                  </a>
                ) : undefined
              }
              className="arrive-up"
              style={at(180)}
            >
              Your plan covers {limit === 1 ? "1 website" : `${limit} websites`}, and the oldest come first. {uncovered.length === 1 ? "That one writes" : "Those write"} nothing
              until you remove a website{upgradable ? " or upgrade" : ""}. Nothing on {uncovered.length === 1 ? "it" : "them"} is deleted.
            </DispatcherNote>
          ) : null}

          <SiteList cards={cards} style={at(200)} />

          {free ? (
            <DispatcherNote
              kind="waiting"
              title="Want more than one website?"
              action={
                <a href="/billing" className={cx(BTN_PRIMARY, "px-5 py-2.5 text-[14px]")}>
                  See plans
                </a>
              }
              className="arrive-up"
              style={at(260)}
            >
              The free plan writes for 1 website. Growth covers 1 to {TIER_LIMITS.growth.sites} websites with {articlesPerMonthFor("growth")} articles a month, and Scale 1 to{" "}
              {TIER_LIMITS.scale.sites} with {articlesPerMonthFor("scale")}. I split them between your sites for you.
            </DispatcherNote>
          ) : null}
        </section>
    </div>
  );
}

/* ------------------------------------------------------------ the split */

/** This month's articles as slots, one per article, grouped by site in that
 *  site's colour: filled = started already, tinted = still to come. Held
 *  slots (given to no site yet) are drawn empty. The one bar on the page. */
function SplitBoard({
  poolFigure,
  poolLabel,
  sitesFigure,
  sitesLabel,
  segments,
  held,
  resets,
  style,
}: {
  poolFigure: number | null;
  poolLabel: string;
  sitesFigure: string;
  sitesLabel: string;
  segments: SiteCard[];
  held: number;
  resets: string;
  style?: React.CSSProperties;
}) {
  const total = segments.reduce((a, s) => a + (s.share ?? 0), 0) + held;
  const summary = [
    ...segments.map((s) => `${s.domain} ${s.share}, ${Math.min(s.used ?? 0, s.share ?? 0)} started`),
    ...(held > 0 ? [`${held} not assigned to a website`] : []),
  ].join("; ");
  return (
    <div className="arrive-up overflow-hidden rounded-2xl border border-line-soft bg-surface px-5 py-5 sm:px-7 sm:py-6" style={style}>
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <Figure value={poolFigure ?? "-"} label={poolLabel} big />
        <Figure value={sitesFigure} label={sitesLabel} align="right" />
      </div>

      {total > 0 ? (
        <>
          <div role="img" aria-label={`This month's articles: ${summary}.`} className="mt-6 flex gap-2 sm:gap-2.5">
            {segments.map((s) => (
              <Slots key={s.slug} n={s.share ?? 0} used={s.used ?? 0} hue={s.hue!} />
            ))}
            {held > 0 ? <Slots n={held} used={0} hue={null} /> : null}
          </div>
          <ul className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px]">
            {segments.map((s) => (
              <li key={s.slug} className="flex min-w-0 items-center gap-2">
                <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: s.hue! }} />
                <span className="truncate text-ink">{s.domain}</span>
                <span className="tabular-nums text-ink-faint">
                  {s.share} a month, {Math.min(s.used ?? 0, s.share ?? 0)} used
                </span>
              </li>
            ))}
            {held > 0 ? (
              <li className="flex items-center gap-2">
                <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-[3px] border border-dashed border-ink-faint" />
                <span className="text-ink-muted">
                  <span className="tabular-nums text-ink">{held}</span> not assigned to a website
                </span>
              </li>
            ) : null}
          </ul>
          {/* What the bar is, said once: a box is an article. */}
          <p className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-line-soft pt-3 text-[12.5px] text-ink-faint">
            <span>Each box is one article.</span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[3px] bg-ink-muted" />
              Bright: already used this month
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[3px] bg-ink-muted/25 ring-1 ring-inset ring-ink-muted/40" />
              Faded: still to come
            </span>
            <span className="sm:ml-auto">Starts again on {resets}</span>
          </p>
        </>
      ) : null}
    </div>
  );
}

function Figure({ value, label, big = false, align = "left" }: { value: React.ReactNode; label: string; big?: boolean; align?: "left" | "right" }) {
  return (
    <div className={cx("min-w-0", align === "right" && "sm:text-right")}>
      <p className={cx("font-semibold leading-none tracking-tight tabular-nums text-ink", big ? "text-[2.75rem]" : "text-[1.75rem]")}>{value}</p>
      <p className="mt-2 text-[13.5px] text-ink-muted">{label}</p>
    </div>
  );
}

/** One site's run of slots: `used` filled, the rest tinted; null hue =
 *  not assigned to any site (dashed, empty). Grows with its count so every slot on the bar is
 *  the same width. */
function Slots({ n, used, hue }: { n: number; used: number; hue: string | null }) {
  const filled = Math.min(used, n);
  return (
    <div className="flex min-w-0 gap-[3px]" style={{ flex: `${n} 1 0%` }}>
      {Array.from({ length: n }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={cx("h-9 min-w-0 flex-1 rounded-[5px] sm:h-10", hue ? "" : "border border-dashed border-line bg-transparent")}
          style={
            hue
              ? i < filled
                ? { background: hue, boxShadow: `0 0 14px -4px ${hue}` }
                : { background: `color-mix(in srgb, ${hue} 18%, transparent)`, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${hue} 35%, transparent)` }
              : undefined
          }
        />
      ))}
    </div>
  );
}
