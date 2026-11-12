import { db } from "@/lib/db";
import { repoPermissionFor } from "@/lib/github-app";

// Who attached a site's GitHub installation, and what that lets the site use.
//
// Proving "this person controls the installation" (github-app.ts) is asked of
// the installation as a whole: one repository they can push to is enough. But
// an installation on an organization covers repositories that person may only
// be able to READ - and a site pointed at one of those gets pull requests
// opened (and on Auto, merged) there by our App, which they could not have
// pushed themselves (security review, 2026-11-12). So the person's GitHub
// login is kept with the site (projects.github_installer_login, 0092), and a
// repository is only ever attached to the site - by the owner's pick, by an
// agent over MCP, or by any of the automatic "this must be the one" paths -
// when that person can push to it.
//
// A site with no login on record (attached before 0092) keeps the rule it
// always had: any repository the installation covers. A NEW attachment
// always has one: where a sign-in code proved the installation and GitHub
// then would not name the person, nothing is attached and the owner tries
// again (install/callback, attachGithubInstallation).

/** Who is on record for a site: a login, null (nobody: attached before 0092,
 *  or a database without the column), or "unreadable" - the read itself
 *  failed. That last one is kept apart on purpose: "we could not look" must
 *  never read as "nobody is on record", which is the permissive answer. */
export async function readInstaller(projectId: string): Promise<string | null | "unreadable"> {
  try {
    const { data, error } = await db().from("projects").select("github_installer_login").eq("id", projectId).maybeSingle();
    if (error) return /github_installer_login|column .* does not exist|could not find the .* column/i.test(error.message) ? null : "unreadable";
    const login = (data as { github_installer_login?: string | null } | null)?.github_installer_login;
    return typeof login === "string" && /^[A-Za-z0-9_-]{1,60}$/.test(login) ? login : null;
  } catch {
    return "unreadable";
  }
}

/** readInstaller for callers that only copy the login along (a failed read
 *  copies nothing; the callers that DECIDE on it use readInstaller). */
export async function installerLoginOf(projectId: string): Promise<string | null> {
  const who = await readInstaller(projectId);
  return who === "unreadable" ? null : who;
}

/** May this site be pointed at this repository?
 *    ok      yes (or nobody is on record: the pre-0092 rule)
 *    denied  the installer cannot push there
 *    retry   GitHub could not be asked. NOT a yes: the answer can be made to
 *            fail on purpose (an installation's request budget is shared by
 *            everyone on it), so a pick waits for a real one. Every caller
 *            can: the picker and MCP say "try again", and the automatic
 *            attaches simply leave the choice to the owner. */
export async function installerRepoVerdict(project: { id: string; github_installation_id: number | null }, repo: string): Promise<"ok" | "denied" | "retry"> {
  if (!project.github_installation_id) return "ok";
  const login = await readInstaller(project.id);
  if (login === "unreadable") return "retry";
  if (!login) return "ok";
  return verdictFor(project.github_installation_id, repo, login, project.id);
}

/** The same question when the installer is already in hand (the install
 *  callback, before anything is written). */
export async function verdictFor(installationId: number, repo: string, login: string, projectId = ""): Promise<"ok" | "denied" | "retry"> {
  const verdict = await repoPermissionFor(installationId, repo, login);
  if (verdict === "unknown") console.error(`[github-installer] ${projectId}: could not check ${login}'s access to ${repo}; not attached`);
  if (verdict === "none") console.error(`[github-installer] ${projectId}: ${login} cannot push to ${repo}; refused`);
  return verdict === "write" ? "ok" : verdict === "none" ? "denied" : "retry";
}

export async function installerMayUseRepo(project: { id: string; github_installation_id: number | null }, repo: string): Promise<boolean> {
  return (await installerRepoVerdict(project, repo)) === "ok";
}

export const REPO_NOT_YOURS = "Your GitHub account can't push to that repository, so we can't publish there for you. Pick one you can push to, or ask its owner for write access.";
export const REPO_CHECK_RETRY = "We couldn't check that repository with GitHub just now. Try again in a minute.";

/** The repositories of a list this site may use. `verified` says the rule
 *  was applied (a login is on record and the list was short enough to ask
 *  about each one); otherwise the list comes back as it was, and the pick
 *  itself is still checked. */
export async function reposSiteMayUse(project: { id: string; github_installation_id: number | null }, repos: string[]): Promise<{ repos: string[]; verified: boolean }> {
  if (!project.github_installation_id || repos.length === 0 || repos.length > 100) return { repos, verified: false };
  const login = await readInstaller(project.id);
  if (!login || login === "unreadable") return { repos, verified: false };
  // Ten at a time: a hundred at once trips GitHub's limit on concurrent
  // requests, and an answer lost to that is an answer we have to show.
  const verdicts: Array<"write" | "none" | "unknown"> = [];
  for (let at = 0; at < repos.length; at += 10) {
    verdicts.push(...(await Promise.all(repos.slice(at, at + 10).map((r) => repoPermissionFor(project.github_installation_id!, r, login)))));
  }
  // The LIST shows what could not be asked about (a new customer must still
  // see their repositories on a bad GitHub minute); the pick itself waits.
  return { repos: repos.filter((_, i) => verdicts[i] !== "none"), verified: verdicts.every((v) => v !== "unknown") };
}
