import "server-only";
import { db } from "@/lib/db";
import { effectiveAutomations, type Project } from "@/lib/projects";
import { yamlDoubleQuote } from "@/lib/article-render";
import { coverExt, coverTargetFor, creditLine, githubApi, parseFrontmatter, sampleCoverKey } from "@/lib/repo-publish";
import { articleSignature } from "@/lib/article-signature";
import { tokenForRef } from "@/lib/github";
import { creditParts } from "@/lib/hosted-blog";
import { isFreeProject } from "@/lib/billing";
import { fetchCover } from "@/lib/job-handlers/publish";

// Puts onto a LIVE repo article what a publish writes today and this one
// went out without: its cover picture, and the free plan's credit line.
//
// Why it exists: the first free site kept in a subfolder (tanstack-fetch,
// 2026-11-10) got its article with neither - the cover because only public/
// at the repo root was ever looked at, the credit because the markdown route
// never wrote one. Both are fixed for every later publish; this is the way
// back for an article that shipped before a fix like that, so the remedy is
// never a hand edit in a customer's repo and never a note asking them.
//
// It only ever ADDS: one frontmatter line (the key the neighbour posts use),
// one picture file beside the neighbours' own, one line above our signature.
// Nothing the owner wrote is touched, and an article that already has both
// is left alone (no pull request at all). Run by the article-repair job,
// which also sees the pull request through its merge.

export type RepairResult = { ok: true; nothing: true } | { ok: true; nothing: false; prNumber: number; prUrl: string; added: string[] } | { ok: false; error: string };

// How many neighbour posts are read looking for the site's cover convention.
const MAX_SAMPLES = 6;
const CREDIT_PRESENT = /<a href="https:\/\/dispatchseo\.com\/\?ref=[^"]*"[^>]*>DispatchSEO<\/a>/;

/** The article's file with what is missing added, and what that was. Null
 *  when the file has no frontmatter block to add to or lacks nothing. Pure,
 *  so the one thing that rewrites a customer's file can be tested on its own.
 *  `cover` and `credit` are what the caller found the article is owed; each
 *  is still skipped when the file already carries one. */
export function repairedFile(text: string, owed: { signature: string; cover: { key: string; ref: string } | null; credit: string | null }): { content: string; added: string[] } | null {
  const fence = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!fence) return null;
  const nl = fence[0].includes("\r\n") ? "\r\n" : "\n";
  let frontmatter = fence[1];
  let body = text.slice(fence[0].length);
  const added: string[] = [];
  if (owed.cover && !sampleCoverKey(parseFrontmatter(text))) {
    frontmatter += `${nl}${owed.cover.key}: ${yamlDoubleQuote(owed.cover.ref)}`;
    added.push("cover");
  }
  if (owed.credit && !CREDIT_PRESENT.test(body)) {
    // Above our signature, as the publish writes it; at the end when the
    // signature is gone (an owner's hand edit).
    body = body.includes(owed.signature) ? body.replace(owed.signature, () => `${owed.credit}${nl}${nl}${owed.signature}`) : `${body.trimEnd()}${nl}${nl}${owed.credit}${nl}`;
    added.push("credit");
  }
  return added.length ? { content: `---${nl}${frontmatter}${nl}---${nl}${body}`, added } : null;
}

export async function repairRepoArticle(project: Project, draftId: string): Promise<RepairResult> {
  const { data } = await db().from("article_drafts").select("id, slug, title, status, repo_path, cover_url").eq("id", draftId).eq("project_id", project.id).maybeSingle();
  const row = data as { id: string; slug: string; title: string; status: string; repo_path: string | null; cover_url: string | null } | null;
  if (!row) return { ok: false, error: "no such article" };
  const repo = project.github_repo;
  const path = row.repo_path;
  if (row.status !== "published" || !repo || !path || !/\.mdx?$/i.test(path)) return { ok: true, nothing: true };
  const token = await tokenForRef(project);
  if (!token) return { ok: false, error: "no GitHub token for this project" };
  const gh = (method: string, p: string, body?: unknown) => githubApi(token, method, p, body);

  const repoInfo = await gh("GET", `/repos/${repo}`);
  if (repoInfo.status !== 200) return { ok: false, error: `repo lookup: HTTP ${repoInfo.status}` };
  const baseBranch = String(repoInfo.json?.default_branch ?? "main");
  const read = async (p: string): Promise<string | null> => {
    const res = await gh("GET", `/repos/${repo}/contents/${encodeURI(p)}?ref=${encodeURIComponent(baseBranch)}`);
    return res.status === 200 && typeof res.json?.content === "string" ? Buffer.from(res.json.content, "base64").toString("utf8") : null;
  };
  const text = await read(path);
  // Moved or deleted on GitHub since: nothing of ours left to repair.
  if (text === null) return { ok: true, nothing: true };
  let cover: { key: string; ref: string } | null = null;
  const extra: Record<string, unknown>[] = [];

  // THE COVER: only when ours has none and a neighbour shows how this site
  // names one (the publish's own condition - no convention, no picture).
  if (row.cover_url && !sampleCoverKey(parseFrontmatter(text))) {
    const treeRes = await gh("GET", `/repos/${repo}/git/trees/${encodeURIComponent(baseBranch)}?recursive=1`);
    const entries = Array.isArray(treeRes.json?.tree) ? (treeRes.json.tree as { type?: string; path?: string }[]) : [];
    const allPaths = entries.filter((e) => e.type === "blob").map((e) => String(e.path ?? ""));
    const dir = path.slice(0, path.lastIndexOf("/"));
    const siblings = allPaths.filter((p) => p !== path && /\.mdx?$/i.test(p) && p.slice(0, p.lastIndexOf("/")) === dir).sort();
    // Newest first, as the publish picks its neighbour.
    for (const sibling of siblings.reverse().slice(0, MAX_SAMPLES)) {
      const sample = parseFrontmatter((await read(sibling)) ?? "");
      const key = sampleCoverKey(sample);
      if (!key) continue;
      const target = coverTargetFor(dir, allPaths, sample.values[key] ?? "", row.slug);
      const image = target ? await fetchCover(row.cover_url) : null;
      if (!target || !image) break;
      const ext = coverExt(image.mimeType);
      const repoPath = target.repoPath.replace(/\.png$/, ext);
      const blob = await gh("POST", `/repos/${repo}/git/blobs`, { content: Buffer.from(image.bytes).toString("base64"), encoding: "base64" });
      if (blob.status !== 201 || !blob.json?.sha) return { ok: false, error: `cover upload: HTTP ${blob.status}` };
      extra.push({ path: repoPath, mode: "100644", type: "blob", sha: String(blob.json.sha) });
      cover = { key, ref: target.ref.replace(/\.png$/, ext) };
      break;
    }
  }

  // THE CREDIT: free plan only, as the publish writes it.
  const credit = (await isFreeProject(project.id)) ? creditLine(creditParts(project, row.id)) : null;
  const fixed = repairedFile(text, { signature: articleSignature(row.id), cover, credit });
  if (!fixed) return { ok: true, nothing: true };
  const added = fixed.added;
  // The picture rides along only with the frontmatter line that names it.
  const files = [{ path, mode: "100644", type: "blob", content: fixed.content }, ...(added.includes("cover") ? extra : [])];

  const ref = await gh("GET", `/repos/${repo}/git/ref/${encodeURIComponent(`heads/${baseBranch}`)}`);
  const headSha = (ref.json?.object as { sha?: string } | undefined)?.sha;
  if (ref.status !== 200 || !headSha) return { ok: false, error: `branch lookup: HTTP ${ref.status}` };
  const headCommit = await gh("GET", `/repos/${repo}/git/commits/${headSha}`);
  const baseTree = (headCommit.json?.tree as { sha?: string } | undefined)?.sha;
  if (headCommit.status !== 200 || !baseTree) return { ok: false, error: `tree lookup: HTTP ${headCommit.status}` };
  const tree = await gh("POST", `/repos/${repo}/git/trees`, {
    base_tree: baseTree,
    tree: files,
  });
  if (tree.status !== 201 || !tree.json?.sha) return { ok: false, error: `tree create: HTTP ${tree.status}` };
  const what = added.includes("cover") ? (added.includes("credit") ? "cover picture and credit line" : "cover picture") : "credit line";
  const commit = await gh("POST", `/repos/${repo}/git/commits`, {
    message: `Add the ${what}: ${row.title}\n\nThe article was published without it; committed by the DispatchSEO app.`,
    tree: String(tree.json.sha),
    parents: [headSha],
  });
  if (commit.status !== 201 || !commit.json?.sha) return { ok: false, error: `commit: HTTP ${commit.status}` };
  const branch = `dispatchseo/repair-${row.slug}-${row.id.replace(/-/g, "").slice(0, 8)}`;
  const created = await gh("POST", `/repos/${repo}/git/refs`, { ref: `refs/heads/${branch}`, sha: String(commit.json.sha) });
  if (created.status === 422) {
    // A leftover branch from an earlier attempt: point it at this commit.
    const reset = await gh("PATCH", `/repos/${repo}/git/refs/${encodeURIComponent(`heads/${branch}`)}`, { sha: String(commit.json.sha), force: true });
    if (reset.status !== 200) return { ok: false, error: `branch reset: HTTP ${reset.status}` };
  } else if (created.status !== 201) {
    return { ok: false, error: `branch create: HTTP ${created.status}` };
  }
  const auto = effectiveAutomations(project).auto_merge;
  const pr = await gh("POST", `/repos/${repo}/pulls`, {
    title: `Add the ${what}: ${row.title}`,
    head: branch,
    base: baseBranch,
    body: `This article went live without its ${what}. This pull request adds ${added.length > 1 ? "them" : "it"} and changes nothing else in the article.${auto ? " It merges on its own once the checks pass." : ""}\n\nOpened by the DispatchSEO app.`,
  });
  if (pr.status === 201 && pr.json) return { ok: true, nothing: false, prNumber: Number(pr.json.number), prUrl: String(pr.json.html_url ?? ""), added };
  if (pr.status === 422) {
    // Already open from an earlier attempt on this branch: it now holds this commit.
    const owner = repo.split("/")[0];
    const open = await gh("GET", `/repos/${repo}/pulls?head=${encodeURIComponent(`${owner}:${branch}`)}&state=open`);
    const first = (Array.isArray(open.json) ? (open.json as unknown as { number?: number; html_url?: string }[]) : [])[0];
    if (first?.number) return { ok: true, nothing: false, prNumber: Number(first.number), prUrl: String(first.html_url ?? ""), added };
  }
  return { ok: false, error: `pull request: HTTP ${pr.status}` };
}
