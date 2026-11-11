"use server";

import { revalidatePath } from "next/cache";
import { dashboardAuth } from "@/lib/auth-gate";
import { getActiveProject } from "@/lib/active-project";
import { assertProjectOwned } from "@/lib/tenant-guard";
import type { Project } from "@/lib/projects";
import {
  pauseWriter,
  resumeWriter,
  setAuthor,
  setBlockedTopics,
  setOwnerFacts,
  setBrand,
  setTone,
  suggestTopic,
  TOPIC_LIMITS,
  type ControlResult,
} from "@/lib/autopilot/controls";
import { removeQueuedIdea, restoreQueuedIdea } from "@/lib/autopilot/queue";
import { adoptPage, editArticle, removeArticle } from "@/lib/article-owner";
import { approveArticle, discardReviewArticle, setPublishMode } from "@/lib/article-review";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/ui/action-state";

// The dashboard's door to the autopilot owner controls (decision 7 of the
// pivot spec). Every rule - lengths, the own-domain check on an author URL,
// the judge gate on a suggested topic - lives in src/lib/autopilot/controls.ts
// and is shared with the MCP tools; this file only authenticates, scopes to
// the active project, and turns the result into a sentence for the form.
//
// Every action returns an ActionState instead of throwing: these forms show
// their answer beside the button (ui/action-form), and a refusal that
// reported success would be the exact lie this codebase keeps banning.

/** Owner-suggested topics per project per UTC day. Each one costs a judge
 *  call, and nobody types more than a handful honestly. */
const SUGGEST_DAILY_CAP = 5;

function state(ok: boolean, message: string, field?: string): ActionState {
  return { ok, message, at: Date.now(), field };
}

/**
 * Auth, the active project, ownership - and the stale-tab check: every
 * ActionForm posts the slug it was rendered for, and a tab left open on site
 * A must not save into site B after the owner switched sites elsewhere.
 */
async function ownedProject(fd: FormData): Promise<{ project: Project } | { refused: ActionState }> {
  if (!(await dashboardAuth())) throw new Error("Unauthorized");
  const project = await getActiveProject();
  await assertProjectOwned(project.id);
  const slug = fd.get("slug");
  if (typeof slug === "string" && slug && slug !== project.slug) {
    return { refused: state(false, "You switched sites in another tab. Reload this page, then try again.") };
  }
  return { project };
}

function fromControl(r: ControlResult, success: string): ActionState {
  return r.ok ? state(true, success) : state(false, r.error);
}

function refresh() {
  revalidatePath("/dashboard");
  revalidatePath("/articles");
  revalidatePath("/queue");
  revalidatePath("/settings");
}

function text(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

function list(fd: FormData, key: string): string[] {
  try {
    const parsed = JSON.parse(String(fd.get(key) ?? "[]"));
    return Array.isArray(parsed) ? parsed.map((x) => String(x).trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export async function pauseAutopilot(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const o = await ownedProject(fd);
  if ("refused" in o) return o.refused;
  try {
    await pauseWriter(o.project.id, "Paused by you from the dashboard.");
  } catch {
    return state(false, "We couldn't pause just now. Try again in a moment.");
  }
  refresh();
  return state(true, "Paused. No new articles start until you resume.");
}

export async function resumeAutopilot(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const o = await ownedProject(fd);
  if ("refused" in o) return o.refused;
  try {
    await resumeWriter(o.project.id);
  } catch {
    return state(false, "We couldn't resume just now. Try again in a moment.");
  }
  refresh();
  return state(true, "Resumed. The next article goes on the schedule.");
}

export async function saveBrand(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const o = await ownedProject(fd);
  if ("refused" in o) return o.refused;
  const r = await setBrand(o.project.id, {
    tagline: text(fd, "tagline"),
    short: text(fd, "short"),
    long: text(fd, "long"),
    categories: list(fd, "categories"),
  });
  if (r.ok) refresh();
  return fromControl(r, "Brand saved. New articles use it from the next one.");
}

export async function saveTone(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const o = await ownedProject(fd);
  if ("refused" in o) return o.refused;
  const r = await setTone(o.project.id, text(fd, "tone"));
  if (r.ok) refresh();
  return fromControl(r, "Tone saved.");
}

export async function saveBlockedTopics(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const o = await ownedProject(fd);
  if ("refused" in o) return o.refused;
  const r = await setBlockedTopics(o.project.id, list(fd, "topics"));
  if (r.ok) refresh();
  return fromControl(r, "Saved. We won't write about these.");
}

export async function saveOwnerFacts(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const o = await ownedProject(fd);
  if ("refused" in o) return o.refused;
  // One fact per line in the textarea.
  const r = await setOwnerFacts(o.project.id, text(fd, "facts").split(/\r?\n/));
  if (r.ok) refresh();
  return fromControl(r, "Saved. Every new article works one of these in.");
}

export async function saveAuthor(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const o = await ownedProject(fd);
  if ("refused" in o) return o.refused;
  const r = await setAuthor(o.project.id, {
    name: text(fd, "author_name") || null,
    bio: text(fd, "author_bio") || null,
    url: text(fd, "author_url") || null,
  });
  if (r.ok) refresh();
  return fromControl(r, "Author saved. New articles carry the byline.");
}

export async function suggestTopicAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const o = await ownedProject(fd);
  if ("refused" in o) return o.refused;
  const topic = text(fd, "topic");
  if (topic.length < TOPIC_LIMITS.min) return state(false, "Write a few words about the topic.", "topic");
  if (topic.length > TOPIC_LIMITS.max) return state(false, `Keep it under ${TOPIC_LIMITS.max} characters.`, "topic");

  const { db } = await import("@/lib/db");
  const startOfDay = `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;
  const { count, error } = await db()
    .from("suggestions")
    .select("id", { count: "exact", head: true })
    .eq("project_id", o.project.id)
    .eq("source", "owner")
    .gte("created_at", startOfDay);
  if (error) return state(false, "We couldn't check the queue just now. Try again in a moment.");
  if ((count ?? 0) >= SUGGEST_DAILY_CAP) {
    return state(false, `That's ${SUGGEST_DAILY_CAP} topics today, the daily limit. Add more tomorrow.`, "topic");
  }

  const r = await suggestTopic(o.project.id, topic);
  if ("rejected" in r) return state(false, `Not added: ${r.rejected}`, "topic");
  refresh();
  return state(true, `Added "${r.title}" to the queue.`);
}

/** Set one idea aside from the hosted queue (/queue). Reversible: it parks
 *  the idea, and restoreQueuedTopicAction puts it back. The MCP twin is
 *  update_suggestion with status "parked". */
export async function removeQueuedTopicAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const o = await ownedProject(fd);
  if ("refused" in o) return o.refused;
  const id = text(fd, "id");
  if (!id) return state(false, "Nothing to set aside.");
  let removed: boolean;
  try {
    removed = await removeQueuedIdea(o.project.id, id);
  } catch {
    return state(false, "We couldn't set it aside just now, so it's still in the queue. Try again in a moment.");
  }
  refresh();
  return removed ? state(true, "Set aside. Put it back any time.") : state(false, "That idea isn't in the queue any more. Reload to see the current list.");
}

/** Put a set-aside idea back at the end of the hosted queue (/queue). The
 *  MCP twin is update_suggestion with status "approved" on the parked guide. */
export async function restoreQueuedTopicAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const o = await ownedProject(fd);
  if ("refused" in o) return o.refused;
  const id = text(fd, "id");
  if (!id) return state(false, "Nothing to put back.");
  let restored: boolean;
  try {
    restored = await restoreQueuedIdea(o.project.id, id);
  } catch {
    return state(false, "We couldn't put it back just now, so it's still set aside. Try again in a moment.");
  }
  refresh();
  return restored ? state(true, "Back in the queue.") : state(false, "That idea isn't set aside any more. Reload to see the current list.");
}

// startWriterRun's refusals are written for agents and name MCP tools. Every
// one an owner can meet gets an explicit translation; anything unrecognised
// falls back to a neutral sentence rather than leaking the agent wording.
function ownerRefusal(refused: string): string {
  if (refused.startsWith("This site already has")) {
    return "Articles are already being written for this site. Try again when one finishes.";
  }
  if (refused.includes("daily limit")) return "This site has started all the articles it can today. Try again tomorrow.";
  if (refused.startsWith("An article for that idea is already being written")) return "This article is already being written again.";
  if (refused.startsWith("That idea is") || refused.startsWith("No such idea")) {
    return "The writer set this idea aside, so it won't be retried. Suggest the topic again to have it written.";
  }
  // writerStartGate's quota and spacing sentences are already written for an
  // owner, and they are the common reason a retry is refused - a generic
  // "try again in a moment" here sent people clicking all week (audit, 2026-10-24).
  if (refused.startsWith("This site has used its") || refused.startsWith("Articles for one site start")) return refused;
  // The month gate's two sentences (usage.ts monthGateSentence; "This site
  // has used its N articles for this month" is caught above) and the share
  // of 0, all written for an owner already.
  if (refused.startsWith("Your plan's") || refused.startsWith("This site gets none of your plan's")) return refused;
  if (refused.startsWith("This site's plan could not be read")) return refused;
  // The one-start-at-a-time-per-owner lock (scheduler.ts
  // startHostedRunClaimed): already an owner sentence, and it says when.
  if (refused.startsWith("Another article for this account is starting")) return refused;
  if (refused.startsWith("plan inactive")) return "Your plan isn't active, so no new articles start. Reactivate it on the Billing page.";
  if (refused.startsWith("The hosted writer has no model credentials")) return "The writer isn't available on this server right now. Try again later.";
  return "We couldn't start it just now. Try again in a moment.";
}

/** A stopped article: start a fresh run on the same idea (or keyword). The
 *  same gates the scheduler applies - pause, an active plan, model keys -
 *  apply here, or Retry would be a way around them. */
export async function retryArticle(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const o = await ownedProject(fd);
  if ("refused" in o) return o.refused;
  const project = o.project;
  if (project.writer_paused_at) return state(false, "Autopilot is paused. Resume it first.");

  const [{ projectPlan }, { missingCredentials }] = await Promise.all([import("@/lib/billing"), import("@/lib/writer/models")]);
  const plan = await projectPlan(project.id).catch(() => null);
  if (!plan) return state(false, "We couldn't check your plan just now. Try again in a moment.");
  if (plan.readError) return state(false, "This site's plan could not be read just now, so no article starts until it can; try again in a minute.");
  // A covered site with no share of the pool this month is not a lapsed plan.
  if (plan.poolPerMonth != null && plan.articlesPerMonth === 0) {
    return state(false, `This site gets none of your plan's ${plan.poolPerMonth} articles this month. Change how they're split between your sites in Settings.`);
  }
  if (plan.articlesPerWeek === 0) return state(false, "Your plan isn't active, so no new articles start. Reactivate it on the Billing page.");
  if (missingCredentials().length) return state(false, "The writer isn't available on this server right now. Try again later.");

  const runId = text(fd, "run_id");
  if (!runId) return state(false, "That article can't be retried from here.");
  const { getWriterRun, startWriterRun } = await import("@/lib/writer/runs");
  const run = await getWriterRun(project.id, runId);
  if (!run) return state(false, "That article is no longer on this site.");
  if (run.status !== "failed") return state(false, "That article didn't stop, so there is nothing to retry.");
  // startWriterRun takes only approved ideas, and a run that ended in a park
  // left its idea "parked" - so a retry the owner asked for must un-park it
  // first, or it is refused as "set aside" every time. Only from parked: an
  // idea the owner since rejected or published stays as it is.
  let unparked = false;
  if (run.suggestion_id) {
    const { db } = await import("@/lib/db");
    const { data } = await db()
      .from("suggestions")
      .update({ status: "approved" })
      .eq("id", run.suggestion_id)
      .eq("project_id", project.id)
      .eq("status", "parked")
      .select("id")
      .maybeSingle();
    unparked = Boolean(data);
  }
  // A hosted site's retry claims the same atomic slot as the scheduler and
  // write_article (scheduler.ts startHostedRunClaimed): N parallel Retry
  // posts used to pass the quota, the spacing and the spend ceilings
  // together (security audit 2026-11-08, #3).
  const input = {
    suggestionId: run.suggestion_id,
    keyword: run.suggestion_id ? null : run.keyword,
    titleHint: run.title_hint,
  };
  const { writerMode } = await import("@/lib/projects");
  const started = await (writerMode(project) === "hosted"
    ? import("@/lib/autopilot/scheduler").then((m) => m.startHostedRunClaimed(project, input))
    : startWriterRun({ projectId: project.id, ...input })
  ).catch(() => ({ run: undefined, refused: "" }));
  if (!started.run) {
    // Refused (quota, spacing, plan): put the idea back where it was, so the
    // scheduler does not pick up an idea the writer had set aside.
    if (unparked && run.suggestion_id) {
      const { db } = await import("@/lib/db");
      await db().from("suggestions").update({ status: "parked" }).eq("id", run.suggestion_id).eq("project_id", project.id).eq("status", "approved");
    }
    return state(false, ownerRefusal(started.refused));
  }
  refresh();
  return state(true, "Started again. Follow it on this page.");
}

/** "Let us host your blog": flip a site with nowhere to publish to the
 *  hosted blog (and open the forwarding pull request when there's a repo). */
export async function hostBlogHere(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const o = await ownedProject(fd);
  if ("refused" in o) return o.refused;
  const { publishTarget } = await import("@/lib/projects");
  if (publishTarget(o.project) === "hosted") return state(true, "Your blog is already hosted by us.");
  // Cloud: the same plan check as set_publish_target's `hosted` (the MCP
  // twin) - switching mints the key that serves pages from our domain, so an
  // unlaunched or lapsed site must not get it through the dashboard either.
  const { isCloudMode } = await import("@/lib/cloud");
  if (isCloudMode()) {
    const { writerGate } = await import("@/lib/billing");
    const gate = await writerGate(o.project.id);
    if (!gate.allowed) return state(false, "The hosted blog needs a live plan on this site. Pick a plan, then switch to it.");
  }
  const { switchToHostedBlog } = await import("@/lib/hosted-rewrite");
  // secondPath: a site whose /blog is already a real blog is hosted at
  // /articles instead, and told so. /blog itself is never offered back while
  // something occupies it (owner, 2026-11-10).
  const updated = await switchToHostedBlog(o.project, { secondPath: true }).catch(() => null);
  if (!updated) {
    return state(
      false,
      "We can't publish to /blog because your site already has something there, and /articles and /guides are taken too. Email support@dispatchseo.com and we'll find a free path with you.",
    );
  }
  refresh();
  const { hostedPath } = await import("@/lib/hosted-blog");
  const path = hostedPath(updated);
  return state(
    true,
    path === "blog"
      ? "Done. Your blog is hosted by us; the steps to point /blog at it are below."
      : `Done. We can't publish to /blog because your site already has something there, so your articles go to /${path} instead. Your own /blog stays exactly as it is; the steps to point /${path} at us are below.`,
  );
}

/** The hosted blog's look and button, through the same validation as the
 *  Settings action in repo-actions.ts (which throws), said inline instead. */
export async function saveHostedBlog(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const o = await ownedProject(fd);
  if ("refused" in o) return o.refused;
  const { setHostedBlog } = await import("@/app/repo-actions");
  try {
    await setHostedBlog(fd);
  } catch (e) {
    return state(false, e instanceof Error && e.message !== "Unauthorized" ? e.message : "We couldn't save that just now.");
  }
  revalidatePath("/settings");
  return state(true, "Blog look saved.");
}

/** The repo's blog folder, with the same rules as setContentPathHint
 *  (repo-actions.ts, the agent Settings page) and the set_content_path_hint
 *  MCP tool - answered beside the button instead of thrown: a refused path
 *  used to land in the route's error boundary and take the whole Settings
 *  page down (audit, 2026-10-24). */
export async function saveFolder(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const o = await ownedProject(fd);
  if ("refused" in o) return o.refused;
  const raw = text(fd, "content_path_hint");
  const { normalizeContentPathHint } = await import("@/lib/repo-publish");
  const path = raw ? normalizeContentPathHint(raw) : null;
  if (raw && path === null) return state(false, 'Use a plain folder path, like content/blog - letters, dots, dashes and slashes, no "..".', "content_path_hint");
  // Naming a folder on a hosted-blog project is the way back to the repo
  // route: the owner is saying "there IS a blog here after all".
  const { publishTarget } = await import("@/lib/projects");
  const backToRepo = Boolean(path) && publishTarget(o.project) === "hosted";
  const { db } = await import("@/lib/db");
  const { error } = await db()
    .from("projects")
    .update({ content_path_hint: path, ...(backToRepo ? { publish_target: "github" } : {}) })
    .eq("id", o.project.id);
  if (error) return state(false, "We couldn't save that just now. Try again in a moment.");
  refresh();
  if (!path) return state(true, "Saved. We'll work out the folder from your repo.");
  return state(true, backToRepo ? `Saved. Articles go to ${path} in your repo, as pull requests.` : `Saved. Articles go to ${path}.`);
}

// ---- the owner's levers over a live article (src/lib/article-owner.ts) ----

/** Save the edited title, description and body of a live article. */
export async function saveArticleEdit(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const o = await ownedProject(fd);
  if ("refused" in o) return o.refused;
  const id = text(fd, "id");
  if (!id) return state(false, "That article can't be edited from here.");
  const r = await editArticle(o.project, id, {
    title: text(fd, "title"),
    metaDescription: text(fd, "meta_description"),
    body: String(fd.get("body") ?? ""),
    expectedUpdatedAt: text(fd, "updated_at") || undefined,
    expectedFileSha: text(fd, "file_sha") || undefined,
  }).catch(() => ({ ok: false as const, error: "We couldn't save it just now. Try again in a moment." }));
  if (!r.ok) return state(false, r.error);
  refresh();
  revalidatePath(`/articles/${id}`);
  revalidatePath(`/articles/${id}/edit`);
  return state(true, r.message);
}

/** An article from before the writer (a `pages` row): find its file in the
 *  repo, record it as an article, and open the editor on it. */
export async function adoptAndEditAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const o = await ownedProject(fd);
  if ("refused" in o) return o.refused;
  const pageId = text(fd, "page_id");
  if (!pageId) return state(false, "That article can't be edited from here.");
  const r = await adoptPage(o.project, pageId).catch(() => ({ ok: false as const, error: "We couldn't read this article's file just now. Try again in a moment." }));
  if (!r.ok) return state(false, r.error);
  refresh();
  redirect(`/articles/${encodeURIComponent(r.draftId)}/edit`);
}

/** Take a live article off the site. Lands on the list: the article's own
 *  page has nothing left to show. */
export async function removeArticleAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const o = await ownedProject(fd);
  if ("refused" in o) return o.refused;
  let id = text(fd, "id");
  // An article from before the writer: becomes a draft first (article-owner.ts adoptPage).
  const pageId = text(fd, "page_id");
  if (pageId) {
    const adopted = await adoptPage(o.project, pageId).catch(() => ({ ok: false as const, error: "We couldn't read this article's file just now. Try again in a moment." }));
    if (!adopted.ok) return state(false, adopted.error);
    id = adopted.draftId;
  }
  if (!id) return state(false, "That article can't be removed from here.");
  const r = await removeArticle(o.project, id).catch(() => ({ ok: false as const, error: "We couldn't remove it just now. Try again in a moment." }));
  if (!r.ok) return state(false, r.error);
  refresh();
  // A repo removal is pending on its pull request: the article stays listed
  // (still live), so land on its own page, which shows the PR. Otherwise
  // the article is gone from the list, which says so once.
  if (r.pending) redirect(`/articles/${encodeURIComponent(id)}`);
  redirect("/articles?removed=1");
}

// ---- review before publishing (src/lib/article-review.ts) ----

/** The green Publish on an article waiting for review. `updated_at` is the
 *  version the page showed: a newer edit (another tab) is read first. */
export async function approveArticleAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const o = await ownedProject(fd);
  if ("refused" in o) return o.refused;
  const id = text(fd, "id");
  if (!id) return state(false, "That article can't be published from here.");
  const r = await approveArticle(o.project, id, { expectedUpdatedAt: text(fd, "updated_at") || undefined }).catch(() => ({
    ok: false as const,
    error: "We couldn't publish it just now. Try again in a moment.",
  }));
  if (!r.ok) return state(false, r.error);
  refresh();
  revalidatePath(`/articles/${id}`);
  return state(true, r.message);
}

/** "Don't publish": the article is set aside and the owner lands on the
 *  list, where the next one waiting (if any) is on top. */
export async function discardArticleAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const o = await ownedProject(fd);
  if ("refused" in o) return o.refused;
  const id = text(fd, "id");
  if (!id) return state(false, "That article can't be dropped from here.");
  const r = await discardReviewArticle(o.project, id).catch(() => ({ ok: false as const, error: "We couldn't drop it just now. Try again in a moment." }));
  if (!r.ok) return state(false, r.error);
  refresh();
  redirect("/articles?dropped=1");
}

/** Settings: publish automatically, or wait for my review. Articles already
 *  waiting stay waiting either way - switching to automatic never publishes
 *  something the owner hasn't seen. */
export async function savePublishMode(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const o = await ownedProject(fd);
  if ("refused" in o) return o.refused;
  const mode = text(fd, "mode");
  if (mode !== "auto" && mode !== "review") return state(false, "Pick automatic or review.");
  const r = await setPublishMode(o.project, mode);
  if (!r.ok) return state(false, r.error);
  refresh();
  return state(
    true,
    mode === "review"
      ? "Saved. Each article finished from now on waits for you, and we email you when one is ready."
      : "Saved. New articles go live on their own. Any already waiting for you still wait for your Publish.",
  );
}

/** The one-click switch (components/publish-mode-switch.tsx, on Articles and
 *  in Settings): same rules as savePublishMode, called without a form. */
export async function switchPublishMode(slug: string, mode: "auto" | "review"): Promise<ActionState> {
  const fd = new FormData();
  fd.set("slug", slug);
  fd.set("mode", mode);
  return savePublishMode(null, fd);
}
