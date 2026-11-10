import { tokenForRef } from "@/lib/github";
import { githubApi, scoreContentDirs } from "@/lib/repo-publish";
import type { Project } from "@/lib/projects";

// What we can see in a site's connected repo: its shape, where its articles
// look like they live, and (on request) one folder's listing or the top of one
// file. Read-only, and the only way to answer "why did this site's first
// article go where it did" for a private repo - the publisher makes its
// choices from exactly this tree (repo-publish.ts, hosted-rewrite.ts), so a
// site that lands on the wrong route is diagnosed by looking at what the
// publisher looked at. dfmsolutions.de (2026-11-10) ran a real /blog whose
// posts were not markdown, and nothing short of the tree could say what they
// were instead.

/** Config files that say what a site is built with. */
const MARKERS = /(^|\/)(package\.json|next\.config\.[cm]?[jt]s|astro\.config\.[cm]?[jt]s|svelte\.config\.[cm]?[jt]s|nuxt\.config\.[cm]?[jt]s|vite\.config\.[cm]?[jt]s|gatsby-config\.[cm]?[jt]s|docusaurus\.config\.[cm]?[jt]s|payload\.config\.[cm]?[jt]s|sanity\.config\.[cm]?[jt]s|contentlayer\.config\.[cm]?[jt]s|velite\.config\.[cm]?[jt]s|keystatic\.config\.[cm]?[jt]sx?|schema\.prisma|drizzle\.config\.[cm]?[jt]s|vercel\.json|netlify\.toml|Dockerfile|Caddyfile|hugo\.(toml|yaml|json)|_config\.yml|mkdocs\.yml|angular\.json|wrangler\.(toml|jsonc?))$/i;

/** Paths that plausibly have to do with a blog, whatever it is stored as. */
const BLOGISH = /(blog|post|article|news|guide|journal|insight|devlog|notes?)(s|es)?([/._-]|$)/i;

const SKIP = /(^|\/)(node_modules|vendor|\.git|\.next|dist|build|out|coverage)\//;

/** Never returned, whoever asks: secrets and key material. */
const SECRET_FILE = /(^|\/)(\.env[^/]*|[^/]*\.(pem|key|p12|pfx|keystore)|id_rsa[^/]*|credentials[^/]*|secrets?[^/]*)$/i;

const MAX_LIST = 400;
const MAX_FILE_CHARS = 8000;
const MAX_FILE_BYTES = 1_000_000;

export type RepoLayout = {
  repo: string;
  branch: string;
  files: number;
  truncated: boolean;
  top: { dir: string; files: number }[];
  markers: string[];
  articleFolders: { dir: string; files: number; named: boolean }[];
  blogPaths: string[];
  under?: { dir: string; paths: string[]; more: number };
  file?: { path: string; bytes: number; text: string; cut: boolean };
};

export async function readRepoLayout(
  project: Project,
  opts: { under?: string | null; file?: string | null } = {},
): Promise<{ ok: true; layout: RepoLayout } | { ok: false; message: string }> {
  const repo = project.github_repo;
  if (!repo) return { ok: false, message: "No GitHub repo is connected to this site." };
  const token = await tokenForRef(project);
  if (!token) return { ok: false, message: "No GitHub credential resolves for this site's repo." };
  const info = await githubApi(token, "GET", `/repos/${repo}`);
  if (info.status !== 200) return { ok: false, message: `GitHub would not show the repo (HTTP ${info.status}).` };
  const branch = String(info.json?.default_branch ?? "main");
  const treeRes = await githubApi(token, "GET", `/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
  if (treeRes.status !== 200) return { ok: false, message: `GitHub would not list the repo's files (HTTP ${treeRes.status}).` };
  const entries = (treeRes.json?.tree as { path?: string; type?: string; size?: number }[] | undefined) ?? [];
  const blobs = entries.filter((e) => e.type === "blob" && e.path).map((e) => ({ path: String(e.path), size: Number(e.size ?? 0) }));
  const paths = blobs.map((b) => b.path).filter((p) => !SKIP.test(p));

  const counts = new Map<string, number>();
  for (const p of paths) {
    const cut = p.indexOf("/");
    const dir = cut === -1 ? "(root)" : p.slice(0, cut);
    counts.set(dir, (counts.get(dir) ?? 0) + 1);
  }

  const layout: RepoLayout = {
    repo,
    branch,
    files: paths.length,
    truncated: treeRes.json?.truncated === true,
    top: [...counts].map(([dir, files]) => ({ dir, files })).sort((a, b) => b.files - a.files).slice(0, 40),
    markers: paths.filter((p) => MARKERS.test(p)).slice(0, 60),
    articleFolders: scoreContentDirs(paths).slice(0, 6).map((c) => ({ dir: c.dir, files: c.files.length, named: c.named })),
    blogPaths: paths.filter((p) => BLOGISH.test(p)).slice(0, MAX_LIST),
  };

  const under = (opts.under ?? "").trim().replace(/^\/+|\/+$/g, "");
  if (under) {
    const inside = paths.filter((p) => p.startsWith(`${under}/`));
    layout.under = { dir: under, paths: inside.slice(0, MAX_LIST), more: Math.max(0, inside.length - MAX_LIST) };
  }

  const file = (opts.file ?? "").trim().replace(/^\/+/, "");
  if (file) {
    if (SECRET_FILE.test(file)) return { ok: false, message: "That file can hold secrets, so it is never read back." };
    const blob = blobs.find((b) => b.path === file);
    if (!blob) return { ok: false, message: `No file at ${file} on ${branch}.` };
    if (blob.size > MAX_FILE_BYTES) return { ok: false, message: `${file} is too large to read back (${blob.size} bytes).` };
    const res = await githubApi(token, "GET", `/repos/${repo}/contents/${encodeURI(file)}?ref=${encodeURIComponent(branch)}`);
    if (res.status !== 200 || typeof res.json?.content !== "string") {
      return { ok: false, message: `GitHub would not return ${file} (HTTP ${res.status}).` };
    }
    const text = Buffer.from(res.json.content as string, "base64").toString("utf8");
    if (text.slice(0, 2000).includes("\u0000")) return { ok: false, message: `${file} is not a text file.` };
    layout.file = { path: file, bytes: blob.size, text: text.slice(0, MAX_FILE_CHARS), cut: text.length > MAX_FILE_CHARS };
  }

  return { ok: true, layout };
}
