import { requireDashboard } from "@/lib/auth-gate";
import { headers } from "next/headers";
import { mcpAddCommand } from "@/lib/mcp-connect";
import { getActiveProject } from "@/lib/active-project";
import { credsForProject } from "@/lib/dataforseo";
import { DEFAULT_PROJECT_ID, fetchProjectToken } from "@/lib/projects";
import { isCloudMode } from "@/lib/cloud";
import { ClaudeTokenConnect } from "@/components/claude-token-connect";
import { hasRepoSecret } from "@/lib/github-app-secrets";
import { DeleteProjectForm } from "@/components/delete-project";
import { KeywordSourceSettings } from "@/components/keyword-source-settings";
import { SiteLaunchedRow } from "@/components/site-launched";
import { CopyBlock } from "@/components/client";
import { PageHeader, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
      <span className="text-sm text-neutral-400">{label}</span>
      <span className="text-sm text-neutral-100">{value}</span>
    </div>
  );
}

export default async function SettingsPage() {
  await requireDashboard();

  const project = await getActiveProject();
  const isDefault = project.id === DEFAULT_PROJECT_ID;
  const mcpToken = await fetchProjectToken(project.id);
  // Whether a Claude Code token is already stored on the repo, so Settings can
  // say "you're done, this is only for rotating" instead of looking like a
  // required first-time setup. GitHub never returns secret values, only
  // existence; fail closed (treat as not-set) on any error.
  const claudeTokenSet =
    isCloudMode() && project.github_installation_id
      ? await hasRepoSecret(project, "CLAUDE_CODE_OAUTH_TOKEN").catch(() => false)
      : false;
  const hdrs = await headers();
  const dashOrigin = `${hdrs.get("x-forwarded-proto") ?? "https"}://${hdrs.get("host") ?? "dispatchseo.com"}`;

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <PageHeader
        title="Project settings"
        hint={`Everything DispatchSEO knows about ${project.name}. Switch projects from the header to manage a different one.`}
      />

      <section className="space-y-3">
        <SectionTitle>Project</SectionTitle>
        <div className="divide-y divide-neutral-800/70 rounded-xl bg-neutral-900 px-4 py-1.5 sm:px-5">
          <InfoRow label="Name" value={project.name} />
          <InfoRow label="Domain" value={project.domain} />
          <InfoRow label="GitHub repo" value={project.github_repo ?? "not connected"} />
          <InfoRow label="Search Console property" value={project.gsc_site_url ?? "not connected"} />
          <InfoRow
            label="DataForSEO"
            value={
              project.dataforseo_login
                ? `connected (${project.dataforseo_login})`
                : (await credsForProject(project))
                  ? "connected (platform account)"
                  : "not connected - see the setup card on Home"
            }
          />
          <InfoRow
            label="Mode"
            value={project.mode === "auto" ? "Auto - hands-off publishing" : "Semi - you approve and merge"}
          />
          {/* Feeds the site-age readout (Journey) - 0015 backfills it from
              created_at, so pre-existing sites need this corrected once. */}
          <SiteLaunchedRow current={project.site_launched_at ?? project.created_at} />
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle sub="where rank checks and keyword research come from - the onboarding choice, switchable anytime">
          Keyword data source
        </SectionTitle>
        <KeywordSourceSettings
          current={project.keyword_source}
          hasDataforseoCreds={Boolean(project.dataforseo_login && project.dataforseo_password)}
          bundledDataforseo={isCloudMode()}
          hasSerpapiKey={Boolean(project.serpapi_key)}
        />
      </section>

      {isCloudMode() && project.github_installation_id ? (
        <section className="space-y-3">
          <SectionTitle sub="the token builds run on - rotate it here whenever it expires or gets revoked">
            Claude Code token
          </SectionTitle>
          <ClaudeTokenConnect connected={claudeTokenSet} />
        </section>
      ) : null}

      {mcpToken ? (
        <section className="space-y-3">
          <SectionTitle sub="what the CI workflows and Claude Code use to talk to this project - every call made with it only sees this project's data">
            Project key
          </SectionTitle>
          <CopyBlock text={mcpToken} />
          <p className="text-sm text-neutral-400">
            Connect Claude Code to this project (the server name carries the project slug, so
            every connected site keeps its own entry):
          </p>
          <CopyBlock text={mcpAddCommand(project.slug, dashOrigin, mcpToken)} />
        </section>
      ) : null}

      <section className="space-y-3">
        <SectionTitle sub="irreversible - read before you click">Danger zone</SectionTitle>
        <div className="space-y-3 rounded-xl border border-red-500/25 bg-neutral-900 p-4 sm:p-5">
          {isDefault ? (
            <p className="text-sm text-neutral-400">
              This is the home project - it can&apos;t be deleted.
            </p>
          ) : (
            <>
              <p className="text-sm text-neutral-400">
                Deleting {project.name} forgets everything DispatchSEO tracked for it: keywords,
                rank history, suggestions, the pages registry, traffic snapshots, playbook
                progress, and the product profile. The live site itself is untouched. There is
                no undo.
              </p>
              <DeleteProjectForm slug={project.slug} domain={project.domain} />
            </>
          )}
        </div>
      </section>
    </div>
  );
}
