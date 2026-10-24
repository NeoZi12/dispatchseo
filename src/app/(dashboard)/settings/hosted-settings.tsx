import Link from "next/link";
import type { Project } from "@/lib/projects";
import { publishTarget } from "@/lib/projects";
import { hostBlogHere, saveBrand, saveFolder } from "@/app/autopilot-actions";
import { RepoRow } from "@/components/repo-row";
import { rewriteLiveCached } from "@/lib/hosted-rewrite";
import { normalizeTheme } from "@/lib/hosted-theme";
import { backendBaseUrl } from "@/lib/pipeline-pack";
import { isCloudMode } from "@/lib/cloud";
import { loadSiteProfile } from "@/lib/site-profile";
import { MarketRow } from "@/components/market-row";
import { SiteLaunchedRow } from "@/components/site-launched";
import { DeleteProjectForm } from "@/components/delete-project";
import { DisconnectRepoForm } from "@/components/disconnect-repo";
import { DeleteAccountForm } from "@/components/delete-account";
import { DEFAULT_PROJECT_ID } from "@/lib/projects";
import type { AutopilotReport } from "@/lib/autopilot/report";
import { BRAND_LIMITS } from "@/lib/autopilot/controls";
import { HOUSE_RULES_MAX } from "@/lib/content-prefs";
import { ActionForm } from "@/components/ui/action-form";
import { buttonClass } from "@/components/ui/button";
import { ChipsInput } from "@/components/ui/chips-input";
import { Input } from "@/components/ui/input";
import { OnAir } from "@/components/ui/on-air";
import { PageHeading } from "@/components/ui/page-heading";
import { SiteIcon } from "@/components/ui/site-icon";
import { StatusPill } from "@/components/ui/status-pill";
import { cx, FOCUS_RING } from "@/components/ui/styles";
import { Textarea } from "@/components/ui/textarea";
import { ForwardingHelp, LookForm } from "./hosted-blog-card";
import { saveVoice } from "./voice-action";
import { authorOf, loadReport } from "../mode";

// Settings for a hosted-writer project, laid out like Polar's: a slim list
// of sections on the left, the chosen one on the right (?section=, one URL
// each), and inside it settings as ROWS - the setting's name and one muted
// line on the left, its control on the right - in one card, hairlines
// between. Long text and chip fields sit full width under their name.
// Destructive actions live in their own card at the end of Advanced.
//
// Only what an owner must be able to change (owner, 2026-10-24). Gone from
// this page, still reachable over MCP: the author byline (articles sign as
// the site unless author_name is already set), the tagline / long
// description (the one sentence here is the short description; the other
// two ride along unchanged), and WordPress, which this product doesn't
// support.

type Controls = AutopilotReport["controls"];

const SECTIONS = [
  { id: "site", title: "Site", description: "What your site is. The writer reads this before every article." },
  { id: "writing", title: "Writing", description: "How articles sound, and what they never cover." },
  { id: "publishing", title: "Publishing", description: "Where finished articles go." },
  { id: "google", title: "Google", description: "Where the clicks and searches in your report come from. Read-only." },
  { id: "plan", title: "Plan", description: "What you're on. Change or cancel it on Billing." },
  { id: "advanced", title: "Advanced", description: "Set when you added the site, plus disconnecting and deleting." },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

const at = (ms: number, i = 0) => ({ "--at": `${ms}ms`, "--i": i }) as React.CSSProperties;

// The report is the source of truth for these values; if it can't be built
// this request, read the same rows directly so Settings still opens with
// the owner's own words in the boxes rather than empty fields that would
// overwrite them on save.
async function controlsFor(project: Project): Promise<{ c: Controls; plan: AutopilotReport["plan"] | null }> {
  const report = await loadReport(project.id);
  if (report) return { c: report.controls, plan: report.plan };
  const { profile } = await loadSiteProfile(project);
  const prefs = (project.content_prefs ?? {}) as { house_rules?: unknown; blocked_topics?: unknown };
  return {
    c: {
      brand: { name: profile.name, tagline: profile.tagline, short: profile.short, long: profile.long, categories: profile.categories },
      tone: typeof prefs.house_rules === "string" ? prefs.house_rules : "",
      blockedTopics: Array.isArray(prefs.blocked_topics) ? prefs.blocked_topics.map(String) : [],
      author: authorOf(project),
    },
    plan: null,
  };
}

export async function HostedSettings({
  project,
  account,
  section,
}: {
  project: Project;
  email: string | null;
  account: { email: string | null; siteCount: number; subscribed: boolean } | null;
  /** ?section= - which pane is open. */
  section?: string;
}) {
  const sections = SECTIONS.filter((x) => x.id !== "plan" || isCloudMode());
  const active: SectionId = sections.find((x) => x.id === section)?.id ?? "site";
  const meta = SECTIONS.find((x) => x.id === active)!;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeading className="arrive-up" title="Settings" />
      <div className="grid gap-6 md:grid-cols-[12rem_minmax(0,1fr)] md:gap-10">
        {/* Sections: a sticky list on desktop, a row of chips on a phone. */}
        <nav aria-label="Settings sections" className="arrive-up md:sticky md:top-20 md:self-start" style={at(40)}>
          <ul className="flex flex-wrap gap-1.5 md:flex-col md:gap-0.5">
            {sections.map((x) => (
              <li key={x.id}>
                <Link
                  href={x.id === "site" ? "/settings" : `/settings?section=${x.id}`}
                  scroll={false}
                  aria-current={x.id === active ? "page" : undefined}
                  className={cx(
                    "block rounded-lg px-3 py-2 text-[14px] transition-colors",
                    x.id === active ? "bg-surface-2 font-medium text-ink" : "text-ink-muted hover:bg-surface hover:text-ink",
                    "max-md:border max-md:border-line-soft",
                    FOCUS_RING,
                  )}
                >
                  {x.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <section aria-labelledby="section-title" className="min-w-0 space-y-5" key={active}>
          <div className="arrive-up" style={at(80)}>
            <h2 id="section-title" className="text-[1.4rem] font-semibold tracking-tight text-ink">
              {meta.title}
            </h2>
            <p className="mt-1 text-[14px] text-ink-muted">{meta.description}</p>
          </div>
          <div className="arrive-up space-y-5" style={at(140)}>
            {active === "site" ? <SiteSection project={project} /> : null}
            {active === "writing" ? <WritingSection project={project} /> : null}
            {active === "publishing" ? <PublishingSection project={project} /> : null}
            {active === "google" ? <GoogleSection project={project} /> : null}
            {active === "plan" ? <PlanSection project={project} /> : null}
            {active === "advanced" ? <AdvancedSection project={project} account={account} /> : null}
          </div>
        </section>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- rows */

/** The card the rows sit in: one surface, hairlines between rows. */
function Rows({ children, danger = false }: { children: React.ReactNode; danger?: boolean }) {
  return (
    <div className={cx("divide-y rounded-xl border bg-surface", danger ? "divide-danger/15 border-danger/30" : "divide-line-soft border-line-soft")}>{children}</div>
  );
}

/** One setting: its name and a muted line on the left, the control on the
 *  right. `full` puts the control under the name at full width (text
 *  boxes, chips). */
function Row({ title, description, children, full = false }: { title: string; description?: React.ReactNode; children?: React.ReactNode; full?: boolean }) {
  return (
    <div className={cx("px-5 py-4", full ? "space-y-3" : "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6")}>
      <div className="min-w-0">
        <p className="text-[14.5px] font-medium text-ink">{title}</p>
        {description ? <p className="mt-0.5 text-[13px] leading-relaxed text-ink-muted">{description}</p> : null}
      </div>
      {children ? <div className={cx("min-w-0", full ? "" : "shrink-0 sm:text-right")}>{children}</div> : null}
    </div>
  );
}

/** Save row at the foot of a form card. */
const SAVE_ROW = "[&>div:last-child]:justify-end [&>div:last-child]:px-5 [&>div:last-child]:pb-4";

/* ---------------------------------------------------------------- sections */

async function SiteSection({ project }: { project: Project }) {
  const { c } = await controlsFor(project);
  return (
    <Rows>
      <Row title="Site name" description="Set when you added the site.">
        <span className="inline-flex items-center gap-2.5 text-[14px] text-ink">
          <SiteIcon domain={project.domain} className="h-6 w-6" />
          {c.brand.name || project.name}
        </span>
      </Row>
      <Row title="Domain">
        <a href={`https://${project.domain}`} target="_blank" rel="noopener noreferrer" className="text-[14px] text-ink-muted underline decoration-line underline-offset-[3px] hover:text-ink">
          {project.domain}
        </a>
      </Row>
      {/* The tagline and long description ride along unchanged: the action
          saves every field it's given, and a missing one saves as empty. */}
      <ActionForm action={saveBrand} slug={project.slug} submitLabel="Save site details" size="sm" className={SAVE_ROW} hidden={{ tagline: c.brand.tagline, long: c.brand.long }}>
        <div className="divide-y divide-line-soft">
          <Row title="What your site is" description={`A sentence or two, ${BRAND_LIMITS.short} characters at most.`} full>
            <Textarea id="brand-short" name="short" aria-label="What your site is" defaultValue={c.brand.short} maxLength={BRAND_LIMITS.short} rows={3} required />
          </Row>
          <Row title="Topics it covers" description={`Research looks for articles inside these. Up to ${BRAND_LIMITS.categories}.`} full>
            <ChipsInput id="brand-categories" name="categories" defaultValue={c.brand.categories} max={BRAND_LIMITS.categories} maxLength={BRAND_LIMITS.category} placeholder="Add a topic and press Enter" />
          </Row>
        </div>
      </ActionForm>
    </Rows>
  );
}

async function WritingSection({ project }: { project: Project }) {
  const { c } = await controlsFor(project);
  return (
    <Rows>
      <ActionForm action={saveVoice} slug={project.slug} submitLabel="Save writing rules" size="sm" className={SAVE_ROW}>
        <div className="divide-y divide-line-soft">
          <Row title="Rules every article follows" description="Voice, words to use or avoid, claims you never make. Empty means our house style." full>
            <Textarea
              id="tone-rules"
              name="tone"
              aria-label="Rules every article follows"
              defaultValue={c.tone}
              maxLength={HOUSE_RULES_MAX}
              rows={4}
              placeholder={"Plain and direct, second person.\nSay \"customers\", never \"users\".\nNever promise rankings or results."}
            />
          </Row>
          <Row title="Topics to never write about" description="Research skips these and the writer refuses them." full>
            <ChipsInput id="topics-avoid" name="topics" defaultValue={c.blockedTopics} max={50} maxLength={80} placeholder="e.g. competitor names" />
          </Row>
        </div>
      </ActionForm>
    </Rows>
  );
}

async function PublishingSection({ project }: { project: Project }) {
  const target = publishTarget(project);
  const [live, backend] = target === "hosted" ? await Promise.all([rewriteLiveCached(project), backendBaseUrl()]) : [false, ""];
  const hasRepo = target === "github" && Boolean(project.github_repo);
  const nowhere = (target === "github" && !project.github_repo) || target === "manual";
  const route =
    target === "hosted" ? `Your blog at ${project.domain}/blog, hosted by us` : hasRepo ? "Your GitHub repo, as pull requests" : target === "wordpress" ? "Your WordPress site" : "Nowhere yet";

  if (target === "wordpress") {
    // Not supported in this product: shown as it is, with the way out.
    return (
      <Rows>
        <Row title="Articles go to" description={<>WordPress isn&apos;t supported any more. To move this site to GitHub or a blog we host, email support@dispatchseo.com.</>}>
          <span className="text-[14px] text-ink">{route}</span>
        </Row>
      </Rows>
    );
  }

  const alternatives = (
    <div className="grid gap-3 sm:grid-cols-2">
      {target !== "github" || !project.github_repo ? (
        <RouteOption title="Your site's GitHub repo" line="Articles arrive in its blog folder as pull requests.">
          <GitHubConnect project={project} />
        </RouteOption>
      ) : null}
      {target !== "hosted" ? (
        <RouteOption title="A blog we host" line={`We serve ${project.domain}/blog for you. You add one forwarding rule.`}>
          <ActionForm action={hostBlogHere} slug={project.slug} submitLabel="Host my blog" size="sm" className="[&_p:empty]:hidden" />
        </RouteOption>
      ) : null}
    </div>
  );

  return (
    <Rows>
      {nowhere ? (
        <Row title="Articles go to" description="Pick one, and finished articles start going out." full>
          {alternatives}
        </Row>
      ) : (
        // The whole row is the "Change" toggle; the alternatives open under it.
        <details className="group">
          <summary className={cx("flex cursor-pointer list-none flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 [&::-webkit-details-marker]:hidden", FOCUS_RING, "rounded-t-xl")}>
            <span className="min-w-0">
              <span className="block text-[14.5px] font-medium text-ink">Articles go to</span>
              <span className="mt-0.5 block text-[13px] text-ink-muted">
                {route}
                {hasRepo ? <span className="ml-1.5 font-mono text-[12.5px] text-ink-faint">{project.github_repo}</span> : null}
              </span>
            </span>
            <span className={buttonClass("secondary", "sm", "pointer-events-none")}>
              <span className="group-open:hidden">Change</span>
              <span className="hidden group-open:inline">Close</span>
            </span>
          </summary>
          <div className="dispatch-details-body px-5 pb-5">
            {target === "hosted" && project.github_repo ? (
              <FolderForm project={project} label="Publish into your repo instead" hint="Name your repo's blog folder and articles go there as pull requests." />
            ) : (
              alternatives
            )}
          </div>
        </details>
      )}

      {hasRepo ? (
        <Row title="Blog folder" description="Where in the repo articles go. Empty means we work it out." full>
          <FolderForm project={project} />
        </Row>
      ) : null}

      {target === "hosted" ? (
        <>
          <Row title="Forwarding" description={`Your domain's /blog has to reach us before articles show at ${project.domain}/blog.`}>
            <OnAir on={live}>{live ? "Forwarding live" : "Not forwarding yet"}</OnAir>
          </Row>
          {!live ? (
            <div className="px-5 py-4">
              <ForwardingHelp live={live} prUrl={project.hosted_rewrite_pr_url} backend={backend} hostedKey={project.hosted_key ?? ""} />
            </div>
          ) : null}
          <details className="group">
            <summary className={cx("flex cursor-pointer list-none flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 [&::-webkit-details-marker]:hidden", FOCUS_RING)}>
              <span className="min-w-0">
                <span className="block text-[14.5px] font-medium text-ink">Blog look</span>
                <span className="mt-0.5 block text-[13px] text-ink-muted">Colour, light or dark, logo, and the button under every article.</span>
              </span>
              <span className={buttonClass("secondary", "sm", "pointer-events-none")}>
                <span className="group-open:hidden">Edit</span>
                <span className="hidden group-open:inline">Close</span>
              </span>
            </summary>
            <div className="dispatch-details-body px-5 pb-5">
              <LookForm slug={project.slug} domain={project.domain} ctaUrl={project.hosted_cta_url} ctaLabel={project.hosted_cta_label} theme={normalizeTheme(project.hosted_theme)} />
            </div>
          </details>
        </>
      ) : null}
    </Rows>
  );
}

function GoogleSection({ project }: { project: Project }) {
  return (
    <Rows>
      <Row title="Search Console" description={project.gsc_site_url ?? "Connect it so the report can show who finds you."}>
        <span className="flex flex-wrap items-center gap-3 sm:justify-end">
          <StatusPill tone={project.gsc_site_url ? "ok" : "warn"}>{project.gsc_site_url ? "Connected" : "Not connected"}</StatusPill>
          <Link href="/google" className={buttonClass(project.gsc_site_url ? "secondary" : "primary", "sm")}>
            {project.gsc_site_url ? "Manage" : "Connect"}
          </Link>
        </span>
      </Row>
    </Rows>
  );
}

async function PlanSection({ project }: { project: Project }) {
  const { plan } = await controlsFor(project);
  const tier = plan?.tier && plan.tier !== "none" ? plan.tier.charAt(0).toUpperCase() + plan.tier.slice(1) : null;
  return (
    <Rows>
      <Row
        title={tier ? `${tier} plan` : "No plan yet"}
        description={tier && plan && plan.articlesPerWeek > 0 ? `${plan.articlesPerWeek} ${plan.articlesPerWeek === 1 ? "article" : "articles"} a week` : "Pick one to start publishing."}
      >
        <Link href="/billing" className={buttonClass("secondary", "sm")}>
          {tier ? "Manage plan" : "Pick a plan"}
        </Link>
      </Row>
    </Rows>
  );
}

function AdvancedSection({ project, account }: { project: Project; account: { email: string | null; siteCount: number; subscribed: boolean } | null }) {
  const target = publishTarget(project);
  const isDefault = project.id === DEFAULT_PROJECT_ID;
  const lastSiteWhileSubscribed = isCloudMode() && account?.siteCount === 1 && account.subscribed;
  return (
    <>
      <Rows>
        <div className="px-5 py-1.5">
          <MarketRow locationCode={project.location_code} languageCode={project.language_code} slug={project.slug} />
        </div>
        <div className="px-5 py-1.5">
          <SiteLaunchedRow current={project.site_launched_at ?? project.created_at} slug={project.slug} />
        </div>
      </Rows>

      <Rows danger>
        {project.github_repo ? (
          <Row title="Disconnect the repo" description="Articles stop going to it. Nothing in the repo changes." full>
            <DisconnectRepoForm slug={project.slug} repo={project.github_repo} hosted />
          </Row>
        ) : null}
        <Row
          title="Delete this site"
          description={
            isDefault
              ? "This is the home project, so it can't be deleted."
              : `Removes its articles, rankings, traffic history and settings${target === "hosted" ? ", and the blog we host goes offline" : ". Articles already on your site stay there"}. There is no undo.`
          }
          full={!isDefault}
        >
          {isDefault ? null : (
            <DeleteProjectForm slug={project.slug} domain={project.domain} repo={project.github_repo} lastSiteWhileSubscribed={lastSiteWhileSubscribed} hosted />
          )}
        </Row>
        {account ? (
          <Row title="Delete your account" description="Every site, and the account itself." full>
            <DeleteAccountForm email={account.email} siteCount={account.siteCount} subscribed={account.subscribed} />
          </Row>
        ) : null}
      </Rows>
    </>
  );
}

/* ---------------------------------------------------------------- bits */

function RouteOption({ title, line, children }: { title: string; line: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col rounded-xl border border-line-soft bg-surface-2/40 p-4">
      <p className="text-sm font-semibold text-ink">{title}</p>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{line}</p>
      <div className="mt-auto pt-4">{children}</div>
    </div>
  );
}

function GitHubConnect({ project }: { project: Project }) {
  return isCloudMode() ? (
    <a href={`/api/github/install/start?slug=${encodeURIComponent(project.slug)}`} className={buttonClass("secondary", "sm")}>
      Connect GitHub
    </a>
  ) : (
    <div className="rounded-lg bg-surface-2 px-3">
      <RepoRow current={project.github_repo} slug={project.slug} />
    </div>
  );
}

// An ActionForm, not a bare <form action>: the save answers beside the button
// ("Saved" / why not), where a thrown refusal used to replace the whole
// page with the error boundary. The pattern escapes `/` and `-` inside the
// class: browsers compile the attribute with the `v` flag, which rejects
// them bare, and silently skipped the whole check (audit, 2026-10-24).
function FolderForm({ project, label, hint }: { project: Project; label?: string; hint?: string }) {
  return (
    <ActionForm action={saveFolder} slug={project.slug} submitLabel="Save folder" size="sm" successLabel="Saved">
      {label ? <p className="text-[14px] font-medium text-ink">{label}</p> : null}
      {hint ? <p className="text-[13px] text-ink-muted">{hint}</p> : null}
      <Input
        id="content-path"
        name="content_path_hint"
        aria-label="Blog folder in your repo"
        defaultValue={project.content_path_hint ?? ""}
        placeholder="content/blog"
        maxLength={120}
        pattern="(?!.*\.\.)[A-Za-z0-9._\/\-]*"
        title="A plain folder path, like content/blog"
        className="font-mono sm:max-w-md"
      />
    </ActionForm>
  );
}
