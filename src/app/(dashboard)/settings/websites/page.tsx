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
  isFreePlan,
  polarConfigured,
  sitesLimitOf,
  sitesRemaining,
  TIER_LIMITS,
  type Tier,
} from "@/lib/billing";
import { customShareLimit, siteShareReport, type SiteShareReport } from "@/lib/site-shares";
import { buttonClass } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { GrowFasterCard } from "@/components/grow-faster-card";
import { BackToSettings } from "../more-links";
import { SitesBoard, WebsitesHeader, type SiteCard } from "./websites-client";

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
// Layout (2026-11-11): one column, like every other Settings page. The
// sidebar is the settings menu while this page is open (nav.tsx
// settingsGroups has the Websites entry), so there is no section list here.
// One card holds everything: the plan's two numbers, a slim bar divided
// between the websites, and a row per website that opens to its settings.

/** One colour per site in the split: the bar's slots and that site's big
 *  number share it, so a row reads back to its part of the bar. Violet to
 *  pink, the accent's family; nothing that means ok / warn / danger. */
const HUES = ["#a78bfa", "#e879f9", "#818cf8", "#f472b6", "#c084fc"];

/** The ramp's reason, said per month. The ramp phrases its reasons per week
 *  (autopilot/math.ts rampVerdict); this page counts months only. Only paid
 *  sites reach this, and paid plans have no slow start, so no line here may
 *  say a new or young site gets fewer articles. */
function slowerLine(reason: string | null, n: number): string {
  const r = reason ?? "";
  const per = `${n} ${n === 1 ? "article" : "articles"} a month`;
  if (/search console/i.test(r)) return `I'm keeping it to ${per} until Google Search Console starts sending its numbers.`;
  if (/could not be read/i.test(r)) return `I couldn't read its history just now, so it gets ${per} to be safe.`;
  if (/index/i.test(r)) return `I'm keeping it to ${per} until Google indexes more of its articles.`;
  return `I'm keeping it to ${per} for now.`;
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
  // A card that failed (past_due) is still a paid plan, not the free one:
  // isFreePlan says no to it, so it keeps its own numbers and each site
  // says why nothing is being written.
  const pastDue = billed && sub?.status === "past_due";
  const free = billed && !active && (!sub || isFreePlan(sub));
  const tier: Tier | null = active || pastDue ? (sub!.status === "trialing" ? "starter" : sub!.tier) : null;
  const limit = active || pastDue ? sitesLimitOf(sub!) : billed ? 1 : null;
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
      // The number set by hand, not today's share: a paused Custom site
      // holds 0 for now and takes its number back when it writes again.
      .reduce((a, s) => a + (s.custom ?? s.share ?? 0), 0);
    const settingUp = writerMode(p) === "hosted" && !p.setup_connected_at;

    let status: SiteCard["status"] = "writing";
    let line: string | null = null;
    if (pastDue) {
      status = "paused";
      line = "Your last payment didn't go through, so nothing is written until it's updated.";
    } else if (!covered) {
      status = "uncovered";
      line = `Your plan covers ${limit === 1 ? "1 website" : `${limit} websites`}, and you have more than that, so I'm holding this one. Remove a website or upgrade, and I'll pick it up.`;
    } else if (settingUp) {
      status = "setup";
      line = `I start writing for ${p.domain} once its setup is finished.`;
    } else if (p.writer_paused_at) {
      status = "paused";
      line = "Writing is paused for this website. Switch it back on below whenever you like.";
    } else if (r?.safeMax === 0) {
      status = "paused";
      line = "Google has indexed too few of its older articles, so I've paused it. It picks up again on its own once Google catches up.";
    } else if (!free && writerMode(p) === "hosted" && r?.safeMax != null) {
      // Paid plans have no slow start any more, so this is only the safe
      // fallback when a site's history couldn't be read. A free site keeps
      // the ramp's number in the report, but it gets the free plan's 2 a
      // month whatever that says, so it never reads as "slower" here. An
      // agent-mode site's own coding agent sets its pace, not this ramp.
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
      // Free has no split to set; a site outside coverage or the split has
      // no share to change.
      editable: pool != null && inSplit,
      customMax: pool != null ? customShareLimit(pool, otherCustom) : 0,
      customShare: sib?.custom ?? null,
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
  // Past due reports no pool (nothing is written), so show what the plan buys.
  const poolFigure = free ? FREE_ARTICLES_PER_MONTH : pastDue ? (pool ?? articlesPerMonthFor(tier)) : pool;
  const upgradable = tier !== "scale";
  // Free plan: Home's "Grow faster" card, always (owner, 2026-11-11), with
  // this month's free articles from the one site the plan covers.
  const freeSite = free ? (cards.find((c) => c.status !== "uncovered" && c.share != null) ?? null) : null;
  const growFaster = free ? { share: freeSite?.share || FREE_ARTICLES_PER_MONTH, used: freeSite?.used ?? 0 } : null;

  const headerAction = canAdd ? null : free ? null : pastDue ? (
    <a href="/billing" className={buttonClass("secondary", "md")}>
      Update payment
    </a>
  ) : upgradable ? (
    <a href="/billing" className={buttonClass("secondary", "md")}>
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
      uncovered={uncovered}
      limit={limit}
      upgradable={upgradable}
      cards={cards}
      growFaster={growFaster}
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
  uncovered,
  limit,
  upgradable,
  cards,
  growFaster,
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
  uncovered: SiteCard[];
  limit: number | null;
  upgradable: boolean;
  cards: SiteCard[];
  /** Free plan only: this month's free articles, for the Grow faster card. */
  growFaster: { share: number; used: number } | null;
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      {/* Phones only: there the settings menu is a drawer. */}
      <BackToSettings />
      <section aria-labelledby="websites-title" className="min-w-0 space-y-6">
        <WebsitesHeader canAdd={canAdd} initialOpen={initialOpen} action={headerAction} />

        {unread ? (
          <Callout
            tone="warn"
            role="alert"
            title="This month's numbers couldn't be read just now"
            action={
              <a href="/settings/websites" className={buttonClass("secondary", "sm")}>
                Try again
              </a>
            }
          >
            Your websites are fine and still writing. Reload in a moment to see how the month is divided.
          </Callout>
        ) : null}

        {uncovered.length > 0 ? (
          <Callout
            tone="warn"
            role="alert"
            title={uncovered.length === 1 ? `${uncovered[0].domain} isn't covered by your plan` : `${uncovered.length} of your websites aren't covered by your plan`}
            action={
              upgradable ? (
                <a href="/billing" className={buttonClass("primary", "sm")}>
                  Upgrade
                </a>
              ) : undefined
            }
          >
            Your plan covers {limit === 1 ? "1 website" : `${limit} websites`}, and the oldest come first. {uncovered.length === 1 ? "That one writes" : "Those write"} nothing until
            you remove a website{upgradable ? " or upgrade" : ""}. Nothing on {uncovered.length === 1 ? "it" : "them"} is deleted.
          </Callout>
        ) : null}

        {/* The whole page in one card (owner, 2026-11-11: "just show the
            division"): the plan's two numbers, and a row per website with
            its articles a month that opens to its settings. No dispatcher
            scene, no bar, no colour per site, no leftover-articles row. */}
        <SitesBoard
          pool={poolFigure}
          poolLabel={free ? "articles a month on the free plan" : "articles a month on your plan"}
          sitesFigure={sitesFigure}
          sitesLabel={sitesLabel}
          cards={cards}
          resets={nextMonthLabel()}
        />

        {growFaster ? <GrowFasterCard share={growFaster.share} used={growFaster.used} now={Date.now()} /> : null}

        {free ? (
          <p className="text-[13.5px] text-ink-muted">
            The free plan writes for 1 website. Growth covers up to {TIER_LIMITS.growth.sites} websites with {articlesPerMonthFor("growth")} articles a month, and Scale up to{" "}
            {TIER_LIMITS.scale.sites} with {articlesPerMonthFor("scale")}.{" "}
            <a href="/billing" className="font-medium text-accent underline underline-offset-2 hover:text-ink">
              See plans
            </a>
          </p>
        ) : null}
      </section>
    </div>
  );
}
