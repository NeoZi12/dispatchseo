import pack from "./pipeline-pack.json";
import { instanceSettings } from "@/lib/dashboard-auth";
import type { Project } from "@/lib/projects";

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
// right domain with zero configuration) -> Vercel's own production URL env
// (present on every Vercel deploy, covers pre-0027 claims) -> the cloud
// domain as the true last resort. Before this chain, every self-hosted
// deploy that didn't discover the undocumented APP_URL shipped pipelines
// wired to the cloud backend - instant 401s on their very first CI run.
export async function backendBaseUrl(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL;
  const stored = (await instanceSettings())?.app_url;
  if (stored) return stored;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return "https://dispatchseo.com";
}

export async function getPipelinePack(project: Project): Promise<PackFile[]> {
  const base = await backendBaseUrl();
  return (pack.files as PackFile[]).map((f) => ({
    path: f.path,
    content: f.content
      .replaceAll("{{SITE_NAME}}", project.name)
      .replaceAll("{{DOMAIN}}", project.domain)
      .replaceAll("{{BACKEND_URL}}", base),
  }));
}
