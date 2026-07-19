import pack from "./pipeline-pack.json";
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

// Where the pack's workflows call home. Self-hosted deploys set APP_URL;
// the cloud default stays the public domain.
export function backendBaseUrl(): string {
  return process.env.APP_URL ?? "https://dispatchseo.com";
}

export function getPipelinePack(project: Project): PackFile[] {
  const base = backendBaseUrl();
  return (pack.files as PackFile[]).map((f) => ({
    path: f.path,
    content: f.content
      .replaceAll("{{SITE_NAME}}", project.name)
      .replaceAll("{{DOMAIN}}", project.domain)
      .replaceAll("{{BACKEND_URL}}", base),
  }));
}
