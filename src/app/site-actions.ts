"use server";

// The Websites page's writes (settings/websites): add a website, and set one
// website's share of the plan. A "use server" file - every export is a
// public endpoint, so each one proves who is asking and acts only on the
// caller's own rows. The rules live elsewhere: creating a site is
// setup-flow.ts createHostedProjectForUser (the path the first site takes),
// a share is site-shares.ts setSiteShare (shared with the set_site_share MCP
// tool). Removing a website is the existing deleteProject in actions.ts.
//
// Adding a site has no MCP twin on purpose: an MCP token is one project's,
// and letting it create the owner's other projects is the escalation that
// keeps checkout off MCP (billing.ts header).

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isCloudMode } from "@/lib/cloud";
import { isOperator } from "@/lib/autopilot/operator";
import { rateLimitHit, rateLimitKey } from "@/lib/rate-limit";
import { dashboardAuth } from "@/lib/auth-gate";
import { PROJECT_COOKIE, scopedProjects } from "@/lib/active-project";
import { getProjectBySlug } from "@/lib/projects";
import { assertProjectOwned } from "@/lib/tenant-guard";
import { createHostedProjectForUser, isProjectDomain, normalizeProjectDomain, probeSite } from "@/lib/setup-flow";
import { setSiteShare, type SetSiteShareInput } from "@/lib/site-shares";
import { setPublishMode } from "@/lib/article-review";
import { pauseWriter, resumeWriter } from "@/lib/autopilot/pause";

export type AddWebsiteState = {
  error: string;
  /** The check guessed a platform we can't publish to; the owner may say
   *  "its code is on GitHub" and add it anyway (the address step's own
   *  escape hatch). Never offered for "taken" or "no page". */
  override?: boolean;
  domain?: string;
} | null;

/** Websites one account may add in any 24 hours; see addWebsite. */
const ADD_WEBSITE_DAILY_LIMIT = 4;

/** Add a website to the signed-in owner's plan, then send them through the
 *  setup steps for it (publishing, GitHub, Google). */
export async function addWebsite(_prev: AddWebsiteState, fd: FormData): Promise<AddWebsiteState> {
  if (!isCloudMode()) return { error: "Adding websites here is for the hosted version." };
  const auth = await dashboardAuth();
  const user = auth?.user;
  if (!user) return { error: "Sign in again to add a website." };

  const domain = normalizeProjectDomain(String(fd.get("domain") ?? "").slice(0, 300));
  if (!isProjectDomain(domain)) return { error: "That address doesn't look right. Try it like yoursite.com.", domain };
  const mine = await scopedProjects();
  if (mine.some((p) => p.domain === domain)) return { error: "That website is already connected.", domain };

  // The address step's check, so a site we can't serve is refused here
  // rather than halfway through setup.
  const { verdict, site } = await probeSite(domain);
  if (site?.taken) return { error: `${domain} is already set up on another DispatchSEO account. If it's yours, ask on Discord and we'll release it.`, domain };
  if (site?.noPage) return { error: `There's no page at ${domain} yet. Check the spelling, or add it once the site is live.`, domain };
  if (verdict.kind === "refused" && fd.get("override") !== "1") {
    return {
      error: `${domain} looks like a ${verdict.platform} site. Articles go out through the site's GitHub repo, so a site built on ${verdict.platform} can't take them.`,
      override: true,
      domain,
    };
  }

  // A quiet ceiling on how many websites one account can add in a day
  // (owner, 2026-11-11). Removing a site and adding it again earns no extra
  // articles (owner_month_carry, free_article_starts), but every add still
  // costs us a site read and a profile call, so a loop is worth stopping.
  // Counted here, after every refusal above, so a typo or a site we can't
  // serve never uses one up; in the rate_limits ledger, which is keyed by
  // the owner and so survives the site being removed. Not shown anywhere:
  // nobody adding real sites gets near it (the largest plan covers 5, and
  // the first comes through setup). The operator is exempt, and a ledger
  // outage lets the add through rather than blocking a paying customer.
  if (!isOperator(user.id) && !(await rateLimitHit(rateLimitKey("add-website", user.id), ADD_WEBSITE_DAILY_LIMIT, 86_400, { failOpen: true }))) {
    return { error: "That's a lot of websites for one day. You can add another one tomorrow.", domain };
  }

  const made = await createHostedProjectForUser(user.id, domain);
  if (!("ok" in made)) return { error: made.error, domain };
  if (!made.created) return { error: "That website is already connected.", domain };

  // Setup reads the newest unfinished site (resolveSetupStage); the cookie
  // makes it the active one on the dashboard as well.
  (await cookies()).set(PROJECT_COOKIE, made.project.slug, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
  redirect("/onboarding");
}

export type SiteShareState = { ok: boolean; message: string; at: number } | null;

/** One website's share of the plan: Auto, or a fixed number a month. */
export async function saveSiteShare(_prev: SiteShareState, fd: FormData): Promise<SiteShareState> {
  const at = Date.now();
  if (!(await dashboardAuth())) return { ok: false, message: "Sign in again to change this.", at };
  const project = await getProjectBySlug(String(fd.get("slug") ?? ""));
  if (!project) return { ok: false, message: "That website isn't on this account.", at };
  try {
    await assertProjectOwned(project.id);
  } catch {
    return { ok: false, message: "That website isn't on this account.", at };
  }
  const mode = String(fd.get("mode") ?? "");
  // An unknown mode reaches setSiteShare as is, which refuses it in words.
  const input = (mode === "custom" ? { mode, share: Number(fd.get("share")) } : { mode }) as SetSiteShareInput;
  const result = await setSiteShare(project, input);
  if ("error" in result) return { ok: false, message: result.error, at };
  revalidatePath("/settings/websites");
  revalidatePath("/dashboard");
  return { ok: true, message: "Saved", at };
}

/** The signed-in owner's website by slug, whichever site is active on the
 *  dashboard: the Websites page lists every site on the account, so its
 *  controls act on the row they sit in, not on the dash_project cookie
 *  (autopilot-actions.ts ownedProject refuses anything but the active site,
 *  which is right for a page about ONE site and wrong for this one). */
async function ownedSite(fd: FormData) {
  if (!(await dashboardAuth())) return null;
  const project = await getProjectBySlug(String(fd.get("slug") ?? ""));
  if (!project) return null;
  try {
    await assertProjectOwned(project.id);
  } catch {
    return null;
  }
  return project;
}

/** One website's publishing mode: "auto" (articles go live on their own) or
 *  "review" (each waits for the owner's Publish). Same rule as Settings and
 *  the set_publish_mode path (article-review.ts setPublishMode). */
export async function saveSitePublishMode(_prev: SiteShareState, fd: FormData): Promise<SiteShareState> {
  const at = Date.now();
  const project = await ownedSite(fd);
  if (!project) return { ok: false, message: "That website isn't on this account.", at };
  const mode = String(fd.get("mode") ?? "");
  if (mode !== "auto" && mode !== "review") return { ok: false, message: "Pick automatic or review.", at };
  const r = await setPublishMode(project, mode);
  if (!r.ok) return { ok: false, message: r.error, at };
  revalidatePath("/settings/websites");
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved", at };
}

/** Pause or resume one website's articles (pause.ts, the same calls the
 *  dashboard's own Pause and the pause_writer / resume_writer MCP tools make). */
export async function saveSitePaused(_prev: SiteShareState, fd: FormData): Promise<SiteShareState> {
  const at = Date.now();
  const project = await ownedSite(fd);
  if (!project) return { ok: false, message: "That website isn't on this account.", at };
  const paused = String(fd.get("paused") ?? "") === "1";
  try {
    if (paused) await pauseWriter(project.id, "Paused by you from the dashboard.");
    else await resumeWriter(project.id);
  } catch {
    return { ok: false, message: "We couldn't save that just now. Try again in a moment.", at };
  }
  revalidatePath("/settings/websites");
  revalidatePath("/", "layout");
  return { ok: true, message: paused ? "Paused" : "Resumed", at };
}
