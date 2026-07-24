import pack from "./pipeline-pack.json";
import { instanceSettings } from "@/lib/dashboard-auth";
import { DEFAULT_PROJECT_ID, type Project } from "@/lib/projects";

// The repo-side shim, served as data. A connected repo keeps only these
// files (GitHub workflows + MCP configs + thin slash commands); the actual
// playbooks live in src/lib/instructions/ and are fetched at run time via
// get_instructions. The `install` workflow tells the agent to fetch this
// pack, adapt the stack-specific spots to the target repo, and commit it -
// which replaces the old "copy the files from the reference repo by hand"
// setup step. Regenerate the JSON with scripts/generate-pipeline-pack.mjs
// after editing the reference repo's files.

export type PackFile = { path: string; content: string };

// Where the pack's workflows call home, in priority order: APP_URL env
// (explicit override) -> the URL captured at claim time (self-hosts get the
// right domain with zero configuration) -> the cloud domain as the true last
// resort. We deliberately do NOT fall back to VERCEL_PROJECT_PRODUCTION_URL:
// that env holds the project's INTERNAL *.vercel.app alias, not the custom
// domain, so whenever APP_URL and the stored app_url were both empty it
// silently stamped the internal alias (e.g. dispatchseo-test4.vercel.app)
// into every generated pack, password-reset link, and onboarding URL - the
// cloud's own production instance leaked its alias exactly this way
// (2026-07-24). A public URL must come from explicit config; guessing it from
// Vercel's internal name is worse than the honest, visible default below.
export async function backendBaseUrl(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL;
  const stored = (await instanceSettings())?.app_url;
  if (stored) return stored;
  // Neither source set. On the hosted cloud this never fires (APP_URL is set);
  // on a self-host it means the owner skipped APP_URL (see content/docs/vps).
  // Warn loudly instead of silently guessing, then fall back to the cloud
  // domain rather than an internal Vercel alias.
  console.warn(
    "[pipeline-pack] No public backend URL configured: APP_URL is unset and no " +
      "app_url was stored at claim time. Defaulting to https://dispatchseo.com. " +
      "Self-hosted instances MUST set APP_URL to their own domain.",
  );
  return "https://dispatchseo.com";
}

// Whether the project's repo will have DataForSEO credentials to feed the
// dataforseo MCP server: its own connected account, or (default project
// only) the instance env fallback - the same resolution credsForProject
// uses. Free-mode projects get mcp-ci.json WITHOUT the dataforseo block:
// shipping a stdio server wired to blank secrets into every repo was the
// RELIABILITY.md "conditional dataforseo block" deferred item - an
// unset-credentials state must configure itself away, not ride along as a
// maybe-crash in every scheduled agent run.
export function hasDataforseo(project: Project): boolean {
  // Own per-project creds always count - require BOTH login and password
  // (an empty-string login from the free-mode onboarding path used to read as
  // "has DataForSEO", queuing nothing - 2026-07-24).
  if (project.dataforseo_login && project.dataforseo_password) return true;
  // The default project falls back to env DataForSEO creds - but ONLY when
  // they actually exist, matching credsForProject. Keying on the default id
  // ALONE was a trap on self-host: the owner's first site REUSES the default
  // project row (keeps the id, gets renamed), so every free/GSC-only self-host
  // install reported dataforseo_repo_mcp: true and the agent was handed a
  // DataForSEO path it had no account for, then asked for creds that don't
  // exist (2026-07-24, live install of neozino.dev).
  return Boolean(
    project.id === DEFAULT_PROJECT_ID &&
      process.env.DATAFORSEO_LOGIN &&
      process.env.DATAFORSEO_PASSWORD,
  );
}

export async function getPipelinePack(project: Project): Promise<PackFile[]> {
  const base = await backendBaseUrl();
  return (pack.files as PackFile[]).map((f) => {
    let content = f.content
      .replaceAll("{{SITE_NAME}}", project.name)
      .replaceAll("{{DOMAIN}}", project.domain)
      .replaceAll("{{BACKEND_URL}}", base);
    if (f.path === ".github/mcp-ci.json" && !hasDataforseo(project)) {
      try {
        const parsed = JSON.parse(content) as { mcpServers?: Record<string, unknown> };
        if (parsed.mcpServers) {
          delete parsed.mcpServers.dataforseo;
          content = JSON.stringify(parsed, null, 2) + "\n";
        }
      } catch {
        // Malformed template JSON would be a build-time bug; serve verbatim
        // rather than dying here.
      }
    }
    return { path: f.path, content };
  });
}
