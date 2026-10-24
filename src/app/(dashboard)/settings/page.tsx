import { requireDashboard } from "@/lib/auth-gate";
import { headers } from "next/headers";
import { instanceCronSecret } from "@/lib/dashboard-auth";
import { requestOrigin } from "@/lib/request-origin";
import { AgentConnectTabs } from "@/components/agent-connect-tabs";
import { AgentSwitch } from "@/components/agent-switch";
import { agentById, builderAgents, isBuilderAgent, projectAgent } from "@/lib/agents";
import { getActiveProjectOrNull } from "@/lib/active-project";
import { credsForProject } from "@/lib/dataforseo";
import { DEFAULT_PROJECT_ID, fetchProjectToken, publishTarget } from "@/lib/projects";
import { setContentPathHint } from "@/app/repo-actions";
import { rewriteLiveCached } from "@/lib/hosted-rewrite";
import { normalizeTheme } from "@/lib/hosted-theme";
import { HostedBlogCard } from "./hosted-blog-card";
import { HostedSettings } from "./hosted-settings";
import { writerMode } from "../mode";
import { backendBaseUrl } from "@/lib/pipeline-pack";
import { isCloudMode } from "@/lib/cloud";
import { ClaudeTokenConnect } from "@/components/claude-token-connect";
import { BuilderTokenConnect } from "@/components/builder-token-connect";
import { checkRepoSecret } from "@/lib/github-app-secrets";
import { builderAgentToken } from "@/lib/github";
import { DeleteProjectForm } from "@/components/delete-project";
import { DisconnectRepoForm } from "@/components/disconnect-repo";
import { DeleteAccountForm } from "@/components/delete-account";
import { KeywordSourceSettings } from "@/components/keyword-source-settings";
import { MarketRow } from "@/components/market-row";
import { RepoRow } from "@/components/repo-row";
import { SiteLaunchedRow } from "@/components/site-launched";
import { CopyBlock } from "@/components/client";
import { PageHeader, SectionTitle } from "@/components/ui";
import { WordPressConnect } from "@/components/wordpress-connect";
import { connectionSummary } from "@/lib/wordpress-connect";

export const dynamic = "force-dynamic";
// Server actions run under the invoking page's limit, and this page owns the
// delete actions - which now walk a customer repo (disable ~11 workflows,
// commit a removal, delete a secret) BEFORE the row is deleted. The default
// 10s could cut that off mid-teardown, which would leave the project intact
// but its workflows half-disabled, so give the danger zone real headroom.
export const maxDuration = 60;

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
      <span className="text-sm text-neutral-400">{label}</span>
      <span className="text-sm text-neutral-100">{value}</span>
    </div>
  );
}

// The way out when the dashboard itself can't help. Sits immediately above the
// danger zone on both render paths: someone scrolled this far because something
// isn't working, and the next thing under this line is the delete buttons -
// better they find people first.
//
// /discord is our own redirect (next.config.ts), so the invite code is never
// duplicated here and a self-hosted install resolves it against its own origin.
// Account-level like AccountSection, so it also renders for someone who owns no
// site yet - being stuck at zero sites is exactly when you want to ask someone.
function HelpSection() {
  return (
    <section className="space-y-3">
      <SectionTitle sub="real people, not a ticket form">Help</SectionTitle>
      <div className="rounded-xl bg-neutral-900 px-4 py-4 text-sm leading-relaxed text-neutral-400 sm:px-5">
        Need help, or want to see what other people are doing with this?{" "}
        <a
          href="/discord"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-violet-400 underline underline-offset-2 hover:text-violet-300"
        >
          Join the Discord
        </a>
        .
      </div>
    </section>
  );
}

// Which account this browser is signed in to. Account-level, not project-level,
// so it renders even when there is no site - and it is the answer to "am I in
// the right account", which nothing in the dashboard used to state anywhere.
function AccountSection({ email }: { email: string | null }) {
  return (
    <section className="space-y-3">
      <SectionTitle sub="the account this dashboard is signed in to">Account</SectionTitle>
      <div className="divide-y divide-neutral-800/70 rounded-xl bg-neutral-900 px-4 py-1.5 sm:px-5">
        <InfoRow label="Signed in as" value={email ?? "no email on file"} />
      </div>
    </section>
  );
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ credential?: string; section?: string }>;
}) {
  const auth = await requireDashboard();

  // Account-level facts, resolved once: both the last-site warning and the
  // close-account form need them, and they must be available on the no-project
  // branch below too. Null on self-host, which has no accounts.
  const user = auth.user;
  const account = user
    ? await (async () => {
        const [{ getSubscription, isActive }, { scopedProjects }] = await Promise.all([
          import("@/lib/billing"),
          import("@/lib/active-project"),
        ]);
        const [mine, sub] = await Promise.all([scopedProjects(), getSubscription(user.id)]);
        return { email: user.email, siteCount: mine.length, subscribed: isActive(sub) };
      })()
    : null;

  // OrNull, not getActiveProject: this page has to survive owning no site.
  // getActiveProject would bounce to the wizard, which is where someone who
  // just deleted their last project already is - so the one screen that says
  // which account they are in would be the one screen they cannot open.
  // Self-host has no accounts (auth.user is null), so it skips the section.
  const project = await getActiveProjectOrNull();
  if (!project) {
    return (
      <div className="mx-auto max-w-xl space-y-8">
        <PageHeader
          title="Settings"
          hint="Add a site to configure it. Your account details are below either way."
        />
        {auth.user ? <AccountSection email={auth.user.email} /> : null}
        <section className="space-y-3">
          <SectionTitle sub="nothing to configure until a site exists">Site settings</SectionTitle>
          <div className="rounded-xl bg-neutral-900 px-4 py-4 text-sm leading-relaxed text-neutral-400 sm:px-5">
            You don&apos;t have a site yet.{" "}
            <a
              href="/onboarding?new=1"
              className="font-medium text-violet-400 underline underline-offset-2 hover:text-violet-300"
            >
              Add one
            </a>{" "}
            and its settings appear here. To change or cancel your plan, open{" "}
            <a
              href="/billing"
              className="font-medium text-violet-400 underline underline-offset-2 hover:text-violet-300"
            >
              Billing
            </a>
            .
          </div>
        </section>
        <HelpSection />
        {account ? (
          <section className="space-y-3">
            <SectionTitle sub="irreversible - read before you click">Danger zone</SectionTitle>
            <div className="rounded-xl border border-red-500/25 bg-neutral-900 p-4 sm:p-5">
              <DeleteAccountForm
                email={account.email}
                siteCount={account.siteCount}
                subscribed={account.subscribed}
              />
            </div>
          </section>
        ) : null}
      </div>
    );
  }

  // Hosted writer: the short settings page with only the owner's controls.
  // Everything below (agent, project key, cron key, keyword source) is the
  // agent-mode page, unchanged.
  if (writerMode(project) === "hosted") {
    return <HostedSettings project={project} email={auth.user?.email ?? null} account={account} section={(await searchParams).section} />;
  }

  const isDefault = project.id === DEFAULT_PROJECT_ID;
  const mcpToken = await fetchProjectToken(project.id);
  // Never includes the password - connectionSummary() exists precisely so no
  // page can accidentally render it.
  const wp = connectionSummary(project);
  // Whether THIS project's agent already has its credential stored on the repo,
  // so Settings can say "you're done, this is only for rotating" instead of
  // looking like a required first-time setup. Keyed off the project's agent
  // rather than Claude's secret name: after a switch to Codex, checking for a
  // Claude token would report "connected" off a secret nothing reads any more.
  // GitHub never returns secret values, only existence; fail closed on error.
  const agent = projectAgent(project);
  // Which agent the credential box opens on. Usually the project's agent, but
  // the header switcher deep-links here with ?credential=codex when the owner
  // is adding the OTHER agent's key - opening on the current agent's tab in
  // that moment would ask them to paste a Codex key into a form labeled
  // Claude.
  const { credential: credentialParam } = await searchParams;
  // isBuilderAgent: this picks which BUILDER credential box to show, and a
  // connect-only agent has no builder credential to collect.
  const credentialAgent = isBuilderAgent(credentialParam) ? agentById(credentialParam) : agent;
  // Whether each agent already has its credential stored, so the box can say
  // "already saved - this replaces it" per tab instead of looking like a
  // required first-time setup for a key the owner pasted weeks ago. Three
  // states on purpose: true (stored), false (GitHub/the DB said no), and
  // "unknown" (couldn't ask - no App reachable). Collapsing unknown into
  // false is how a stored key gets presented as missing.
  const agentCredentialSet: Record<string, boolean | "unknown"> = Object.fromEntries(
    await Promise.all(
      builderAgents().map(async (a) => {
        if (isCloudMode()) {
          return [
            a.id,
            project.github_installation_id
              ? await checkRepoSecret(project, a.credential.repoSecretName).catch(
                  () => "unknown" as const,
                )
              : ("unknown" as const),
          ] as const;
        }
        // Self-host: the instance credential is our own row - readable truth.
        return [a.id, Boolean(await builderAgentToken(a.id).catch(() => null))] as const;
      }),
    ),
  );
  // Self-host only: the cron secret is INSTANCE-wide, not per-project, so in
  // cloud it would hand every tenant the platform's own key. Null on a classic
  // env install (no instance row) - the section just doesn't render.
  const cronSecret = isCloudMode() ? null : await instanceCronSecret();
  // Deleting the last site leaves a paying account with no dashboard to reach
  // Billing from, so the danger zone has to say that up front. Self-host has
  // no subscription and can't delete the home project anyway, hence cloud-only.
  const lastSiteWhileSubscribed =
    isCloudMode() && account?.siteCount === 1 && account.subscribed;
  const hdrs = await headers();
  const dashOrigin = requestOrigin(hdrs);

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <PageHeader
        title="Project settings"
        hint={`Everything DispatchSEO knows about ${project.name}. Switch projects from the header to manage a different one.`}
      />

      {auth.user ? <AccountSection email={auth.user.email} /> : null}

      <section className="space-y-3">
        <SectionTitle>Project</SectionTitle>
        <div className="divide-y divide-neutral-800/70 rounded-xl bg-neutral-900 px-4 py-1.5 sm:px-5">
          <InfoRow label="Name" value={project.name} />
          <InfoRow label="Domain" value={project.domain} />
          {/* Self-host: editable, because creation was the only writer and a
              disconnect left the project stranded with no repo. Cloud stays
              read-only - its repo choice belongs to the App installation. */}
          {isCloudMode() ? (
            <InfoRow label="GitHub repo" value={project.github_repo ?? "not connected"} />
          ) : (
            <RepoRow current={project.github_repo} slug={project.slug} />
          )}
          <InfoRow label="Search Console property" value={project.gsc_site_url ?? "not connected"} />
          <InfoRow
            label="DataForSEO"
            value={
              project.dataforseo_login
                ? `connected (${project.dataforseo_login})`
                : (await credsForProject(project))
                  ? "connected (platform account)"
                  : project.keyword_source === "dataforseo"
                    ? "not connected - see the setup card on Home"
                    : `not used - this project runs on ${project.keyword_source === "serpapi" ? "a free SerpApi key" : "Search Console only (free)"}`
            }
          />
          <InfoRow
            label="Mode"
            value={project.mode === "auto" ? "Auto - hands-off publishing" : "Semi - you approve and merge"}
          />
          {/* Which Google the rank checks and keyword research query. Every
              project starts at US/English - a site whose audience searches in
              another country or language measures the wrong market until this
              is corrected here (or via the set_market MCP tool). */}
          <MarketRow
            locationCode={project.location_code}
            languageCode={project.language_code}
            slug={project.slug}
          />
          {/* Feeds the site-age readout (Journey) - 0015 backfills it from
              created_at, so pre-existing sites need this corrected once. */}
          <SiteLaunchedRow
            current={project.site_launched_at ?? project.created_at}
            slug={project.slug}
          />
        </div>
      </section>

      {/* Where this site's articles go. Only rendered once a project exists.
          The WordPress case leads, being the one an owner has to do by hand;
          the repo case needs exactly one answer from them, and only when our
          own scan of the repo could not find it. */}
      <section className="space-y-3">
        <SectionTitle sub="where finished articles get published - connect WordPress if your site isn't built from a code repository">
          Your website
        </SectionTitle>
        <div className="rounded-xl bg-neutral-900 px-4 py-4 sm:px-5">
          <WordPressConnect
            status={{
              connected: wp.connected,
              url: wp.url,
              username: wp.username,
              seoPlugin: wp.seo_plugin,
              canPublish: Boolean(wp.capabilities?.publish_posts),
              canUploadMedia: Boolean(wp.capabilities?.upload_files),
            }}
          />
        </div>
        {/* THE ONE QUESTION THE REPO ROUTE CAN GET WRONG. We commit the article
            into the folder this site already keeps its articles in, worked out
            by reading the repo - which is right for almost every layout and
            guessable-wrong for the rest. Left empty on purpose: an answer is
            only needed when an article parks itself asking for one. */}
        {(publishTarget(project) === "github" || publishTarget(project) === "hosted") && project.github_repo ? (
          <div className="rounded-xl bg-neutral-900 px-4 py-4 sm:px-5">
            <h3 className="text-sm font-semibold text-neutral-100">Where your articles live</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-neutral-400">
              {publishTarget(project) === "hosted"
                ? "Your blog is served by DispatchSEO (below). If your repo does have a blog folder, name it here and articles go back to being pull requests in your repo - then revert the forwarding pull request."
                : "The folder in your repo that holds your articles. Leave empty and we work it out from the repo."}
            </p>
            <form action={setContentPathHint} className="mt-3 flex flex-wrap items-center gap-2">
              <input
                type="text"
                name="content_path_hint"
                defaultValue={project.content_path_hint ?? ""}
                placeholder="content/blog"
                maxLength={120}
                // The server's three rules, enforced before the submit leaves
                // the browser: allowed characters, and no `..` segment climbing
                // out of the repo.
                pattern="(?!.*\.\.)[A-Za-z0-9._/-]*"
                title="A plain folder path, like content/blog"
                className="w-64 rounded-md bg-neutral-800 px-2 py-1 text-sm text-neutral-200 placeholder:text-neutral-600"
              />
              <button
                type="submit"
                className="cursor-pointer rounded-md bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-500/25"
              >
                Save
              </button>
            </form>
          </div>
        ) : null}
        {/* THE HOSTED BLOG. This site has no blog of its own, so we serve
            /blog for it (src/lib/hosted-blog.ts). Two facts the owner needs:
            does their domain forward to us yet (checked live, by the marker
            header our pages send), and where the button under every article
            points. */}
        {publishTarget(project) === "hosted" ? (
          <HostedBlogCard
            slug={project.slug}
            domain={project.domain}
            hostedKey={project.hosted_key ?? ""}
            prUrl={project.hosted_rewrite_pr_url}
            ctaUrl={project.hosted_cta_url}
            ctaLabel={project.hosted_cta_label}
            live={await rewriteLiveCached(project)}
            backend={await backendBaseUrl()}
            theme={normalizeTheme(project.hosted_theme)}
          />
        ) : null}
      </section>

      <section className="space-y-3">
        <SectionTitle
          sub={
            isCloudMode()
              ? "where rank checks and keyword research come from - DataForSEO, included in your plan"
              : "where rank checks and keyword research come from - the onboarding choice, switchable anytime"
          }
        >
          Keyword data source
        </SectionTitle>
        <KeywordSourceSettings
          current={project.keyword_source}
          hasDataforseoCreds={Boolean(project.dataforseo_login && project.dataforseo_password)}
          bundledDataforseo={isCloudMode()}
          cloud={isCloudMode()}
          hasSerpapiKey={Boolean(project.serpapi_key)}
        />
      </section>

      {/* ONE section for the whole agent story: which agent runs the builds
          (the cards), then the key it runs on (the box below, one tab per
          agent so it always says which agent's key it is taking). Anchored:
          the switch cards link here the moment a switch leaves the builders
          without a credential, and the header switcher's post-switch reminder
          deep-links here with ?credential=<agent> preselecting the right tab.
          scroll-mt keeps the heading clear of the sticky header.

          BOTH runners get a box, because the anchor is only honest if it
          exists everywhere the switch renders. Cloud (App-connected) stores a
          repo secret; everything else stores the instance credential the
          in-stack builder reads. Before the self-host branch existed, the only
          paste surface was Home's "Turn on automatic builds" card - which
          disappears forever once ANY project's builds are active, so an owner
          adding a Codex site to a working Claude stack had a switch banner
          pointing at a box that no longer rendered anywhere, and a project
          that silently built nothing. */}
      <section id="agent-credential" className="scroll-mt-24 space-y-3">
        <SectionTitle sub="which agent your scheduled builders run, and the credential they run on - not which agent you use day to day">
          Coding agent
        </SectionTitle>
        <AgentSwitch current={agent.id} slug={project.slug} />
        <div className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900 p-4 sm:p-5">
          <div>
            <h3 className="text-sm font-semibold text-neutral-100">Credential</h3>
            <p className="mt-0.5 text-xs text-neutral-500">
              {isCloudMode()
                ? "one secret per agent, stored on your repo - adding one agent's key never touches the other's, and pasting here never switches anything by itself"
                : "one credential per agent, stored once per instance and shared by every project on the same agent - pasting here never switches anything by itself"}
            </p>
          </div>
          {/* Branch on the MODE alone, never on the installation: a cloud
              tenant whose App lapsed must see the repo-secret box (which
              says "can't check" and fails storing with the reconnect
              message), not the instance box - that one describes, and
              writes, deployment-shared state. */}
          {isCloudMode() ? (
            <ClaudeTokenConnect
              agent={credentialAgent.id}
              connected={agentCredentialSet}
              slug={project.slug}
            />
          ) : (
            <BuilderTokenConnect
              current={credentialAgent.id}
              connected={agentCredentialSet}
              cta="Save credential"
            />
          )}
        </div>
      </section>

      {/* Folded away by default: the key and the connect paste are a
          once-per-site errand, but they were the tallest thing on the page and
          pushed everything you actually change past the fold. Plain <details>,
          so it works identically on the cloud and self-hosted renders and needs
          no client JS. */}
      {mcpToken ? (
        <details className="group space-y-3">
          <summary className="flex cursor-pointer select-none items-start justify-between gap-4 list-none [&::-webkit-details-marker]:hidden">
            <SectionTitle sub="what the CI workflows and your coding agent use to talk to this project - every call made with it only sees this project's data">
              Project key
            </SectionTitle>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="mt-1.5 h-4 w-4 shrink-0 text-neutral-500 transition-transform group-open:rotate-180"
              aria-hidden
            >
              <polyline points="6 9 12 15 18 9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </summary>
          <div className="space-y-3">
            <CopyBlock text={mcpToken} />
            <p className="text-sm text-neutral-400">
              Connect your coding agent to this project (the server name carries the project slug,
              so every connected site keeps its own entry):
            </p>
            <p className="text-sm text-neutral-500">
              Once connected, your agent can drive everything the dashboard does -{" "}
              <a
                href="/docs/mcp-tools"
                target="_blank"
                rel="noopener noreferrer"
                className="text-violet-400 underline underline-offset-2 hover:text-violet-300"
              >
                every tool is documented here
              </a>
              .
            </p>
            <AgentConnectTabs
              slug={project.slug}
              origin={dashOrigin}
              token={mcpToken}
              box="card"
            />
          </div>
        </details>
      ) : null}

      {cronSecret ? (
        <section className="space-y-3">
          <SectionTitle sub="what the scheduled jobs use to call this backend - the pipeline install writes it into your repo as a secret, so you should never need to paste it by hand">
            Cron key
          </SectionTitle>
          <CopyBlock text={cronSecret} />
        </section>
      ) : null}

      <HelpSection />

      <section className="space-y-3">
        <SectionTitle sub="irreversible - read before you click">Danger zone</SectionTitle>
        <div className="space-y-3 rounded-xl border border-red-500/25 bg-neutral-900 p-4 sm:p-5">
          {/* Disconnect sits ABOVE delete and outside the isDefault branch,
              because the home project is the one that cannot be deleted - if
              this were inside the else, the only project a self-hoster can
              have would still have no way to stop. */}
          {project.github_repo ? (
            <div className={isDefault ? "" : "border-b border-neutral-800 pb-4"}>
              <p className="mb-2 text-sm font-medium text-neutral-200">Disconnect the repo</p>
              <DisconnectRepoForm slug={project.slug} repo={project.github_repo} />
            </div>
          ) : null}
          {isDefault ? (
            <p className="text-sm text-neutral-400">
              This is the home project - it can&apos;t be deleted.
              {project.github_repo
                ? " Disconnecting the repo above is how you stop it running."
                : ""}
            </p>
          ) : (
            <>
              <p className="text-sm text-neutral-400">
                Deleting {project.name} forgets everything DispatchSEO tracked for it: keywords,
                rank history, suggestions, the pages registry, traffic snapshots, playbook
                progress, and the product profile. There is no undo.
              </p>
              <DeleteProjectForm
                slug={project.slug}
                domain={project.domain}
                repo={project.github_repo}
                lastSiteWhileSubscribed={lastSiteWhileSubscribed}
              />
            </>
          )}
          {/* Closing the whole account, below deleting one site: a heavier
              action reached from the same place, but folded away so it isn't
              the first red control the eye lands on. */}
          {account ? (
            <div className="border-t border-neutral-800 pt-3">
              <DeleteAccountForm
                email={account.email}
                siteCount={account.siteCount}
                subscribed={account.subscribed}
              />
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
