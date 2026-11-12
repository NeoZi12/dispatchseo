import { isCloudMode } from "@/lib/cloud";
import { db } from "@/lib/db";
import { mergeToken } from "@/lib/github";
import type { Project } from "@/lib/projects";

// Self-host: point a project at a (different) GitHub repo AFTER creation.
//
// Until 2026-08-06 the repo column was written exactly once, inside
// createProjectCore - set_github_repo and the wizard picker are both
// cloud-gated (they validate against a GitHub App installation self-host
// doesn't have), and Settings rendered the repo read-only. So a self-hoster
// who connected the wrong repo, or disconnected to fix one, was stranded
// with github_repo null and no supported way back (live incident: mia-tax
// pointed at the business's app repo instead of its website repo).
//
// Validation mirrors connectGithubToken's checks, with the same tolerance
// as creation: when the instance merge token exists it must be able to SEE
// the repo and READ its code (builds clone it), with the same guidance
// wording; when no token is stored yet the write is accepted on format
// alone - exactly what creation does, because the merge-token step is where
// reachability becomes checkable at all.
//
// Shared by the set_github_repo MCP tool's self-host branch and the
// Settings repo row's server action (the parity rule). Cloud keeps its
// installation-validated paths - this function refuses to run there.
export async function setProjectRepoSelfHost(
  project: Pick<Project, "id" | "github_repo">,
  repoInput: string,
): Promise<{ repo: string } | { error: string }> {
  // Self-host only, and said here as well as by both callers: the hosted
  // version pairs a site with a repository through the GitHub App, where
  // the installer's own access is checked (github-installer.ts).
  if (isCloudMode()) return { error: "Cloud picks the repo through the GitHub App installation." };
  const repo = repoInput
    .trim()
    .replace(/^https?:\/\/(www\.)?github\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "");
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    return {
      error:
        "Could not read that repo - paste the GitHub URL (https://github.com/owner/repo) or just owner/repo.",
    };
  }

  const token = await mergeToken();
  if (token) {
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    };
    let res: Response;
    try {
      res = await fetch(`https://api.github.com/repos/${repo}`, { headers });
    } catch {
      return { error: "Could not reach GitHub to validate the repo - try again." };
    }
    if (res.status === 404 || res.status === 403) {
      return {
        error:
          `The stored GitHub token can't see ${repo}. If it's a fine-grained token, make sure ` +
          `that repo is selected; classic tokens need the "repo" scope. (Also double-check the repo name.)`,
      };
    }
    if (!res.ok) {
      return { error: `GitHub answered ${res.status} while validating ${repo} - try again.` };
    }
    let commits: Response;
    try {
      commits = await fetch(`https://api.github.com/repos/${repo}/commits?per_page=1`, { headers });
    } catch {
      return { error: "Could not reach GitHub to validate the repo - try again." };
    }
    if (!commits.ok) {
      return {
        error:
          `The stored GitHub token can see ${repo} but can't read its code, so builds can't clone it. ` +
          `Fine-grained token? Give it "Contents" repository permission (Read and write).`,
      };
    }
  }

  const { error } = await db().from("projects").update({ github_repo: repo }).eq("id", project.id);
  if (error) return { error: error.message };
  return { repo };
}
