import type { CronHealth } from "./cron-alerts";
import type { Project } from "./projects";

// The Home banner's "Copy fix prompt" payload: a self-contained prompt the
// owner pastes into Claude Code when a background job alerts. It carries the
// failing jobs, where each one runs (the owner shouldn't have to remember
// the two-scheduler split), and the contract that closes the loop - fix
// first, verify, then call mark_cron_fixed over MCP so the banner clears
// itself. Pure string building, safe to import anywhere.

function issueLine(h: CronHealth): string {
  return !h.ok
    ? `- ${h.job} failed on its last run (${new Date(h.last_run_at).toUTCString()})${
        h.errors.length > 0 ? `\n  errors: ${h.errors.slice(0, 5).join(" | ")}` : ""
      }`
    : `- ${h.job} is overdue - hasn't run since ${new Date(h.last_run_at).toUTCString()}`;
}

export function buildCronFixPrompt(project: Project, issues: CronHealth[]): string {
  const jobNames = issues.map((h) => `"${h.job}"`).join(", ");
  const repo = project.github_repo
    ? `the connected project repo (${project.github_repo})`
    : "the connected project repo";
  return `My DispatchSEO dashboard for ${project.domain} shows a background-job alert:

${issues.map(issueLine).join("\n")}

Inspect and fix this:

1. Call the get_cron_health tool on the DispatchSEO MCP server to see the live state of every background job.
2. Locate the failing job:
   - daily-ranks is a Vercel cron on the DispatchSEO backend (vercel.json -> /api/cron/daily-ranks); its logs are in the Vercel function logs.
   - hourly-gsc, weekly-opportunities, deploy-check, and secrets-canary are GitHub Actions workflows in the DispatchSEO backend repo (.github/workflows/) that curl the backend cron endpoints with CRON_SECRET.
   - Jobs starting with "seo-" are GitHub Actions workflows in ${repo}. An overdue seo-* job usually means its last workflow run failed, GitHub disabled the schedule (happens after 60 days without repo activity), or a repo secret rotted - check the repo's Actions tab for the latest runs and error output.
3. Find the root cause and fix it, then VERIFY: re-run the workflow (or hit the cron endpoint) and confirm it completes and reports ok.
4. Only after a verified fix, call the mark_cron_fixed MCP tool with the exact job name (${jobNames}) so the dashboard alert clears. If you could not fix it, do NOT call mark_cron_fixed - report what you found and what is still broken instead.`;
}

// The "Pipeline update available" notice's copy payload: unlike the fix
// prompt (something is broken, go diagnose), this one has a known action -
// re-apply the current pipeline pack to the connected repo. The install
// workflow is idempotent and preserves repo adaptations (secrets stay,
// .dispatchseo/ config files are repo-owned and not part of the pack).
export function buildPipelineUpdatePrompt(project: Project): string {
  const repo = project.github_repo ?? "the repo this project publishes to";
  return `My DispatchSEO dashboard for ${project.domain} says a pipeline update is available - the SEO workflows in ${repo} are a version behind the backend's current pack.

Apply the update (run this inside a checkout of ${repo}, with the project's DispatchSEO MCP server connected):

1. Call the get_instructions MCP tool with workflow="install" and follow it. It fetches the current pipeline pack and applies it to this repo. Repo secrets already exist - skip re-minting anything that is set - and repo-owned config under .dispatchseo/ (conventions.md, publish-paths) must be kept, not overwritten; only the pack's own files (.github workflows, .claude commands, the .dispatchseo/pipeline-version stamp) get refreshed.
2. Open the update PR, have it merged, and confirm the workflows on the default branch carry the new .dispatchseo/pipeline-version stamp.
3. The notice clears itself after the next nightly health check reports the versions match. To clear it immediately, call mark_cron_fixed with the exact job name from the notice.`;
}
