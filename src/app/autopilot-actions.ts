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
  setBrand,
  setTone,
  suggestTopic,
  TOPIC_LIMITS,
  type ControlResult,
} from "@/lib/autopilot/controls";
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

/** A held article: send it on to publish. Holds are the site's first
 *  article (when the deploy holds it for a read) or a daily publish cap. */
export async function releaseArticle(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const o = await ownedProject(fd);
  if ("refused" in o) return o.refused;
  const runId = text(fd, "run_id");
  if (!runId) return state(false, "That article can't be published from here.");
  const [{ getWriterRun }, { releaseWriterRun }] = await Promise.all([
    import("@/lib/writer/runs"),
    import("@/lib/writer/stages"),
  ]);
  const run = await getWriterRun(o.project.id, runId);
  if (!run) return state(false, "That article is no longer on this site.");
  if (run.status !== "held") return state(false, "That article is already on its way.");
  try {
    await releaseWriterRun(run);
  } catch {
    return state(false, "We couldn't release it just now. Try again in a moment.");
  }
  refresh();
  return state(true, "Publishing. It goes live in the next few minutes.");
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
  if (plan.articlesPerWeek === 0) return state(false, "Your plan isn't active, so no new articles start. Reactivate it on the Billing page.");
  if (missingCredentials().length) return state(false, "The writer isn't available on this server right now. Try again later.");

  const runId = text(fd, "run_id");
  if (!runId) return state(false, "That article can't be retried from here.");
  const { getWriterRun, startWriterRun } = await import("@/lib/writer/runs");
  const run = await getWriterRun(project.id, runId);
  if (!run) return state(false, "That article is no longer on this site.");
  if (run.status !== "failed") return state(false, "That article didn't stop, so there is nothing to retry.");
  const started = await startWriterRun({
    projectId: project.id,
    suggestionId: run.suggestion_id,
    keyword: run.suggestion_id ? null : run.keyword,
    titleHint: run.title_hint,
  }).catch(() => ({ run: undefined, refused: "" }));
  if (!started.run) return state(false, ownerRefusal(started.refused));
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
  const { switchToHostedBlog } = await import("@/lib/hosted-rewrite");
  const updated = await switchToHostedBlog(o.project).catch(() => null);
  if (!updated) {
    return state(
      false,
      "Your site already serves a /blog, so we won't take it over. Connect the repo or WordPress behind it instead.",
    );
  }
  refresh();
  return state(true, "Done. Your blog is hosted by us; the steps to point /blog at it are below.");
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
