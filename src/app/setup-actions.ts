"use server";

// The setup path's writes (hosted onboarding, one step at a time).
//
// A "use server" file: EVERY export here is a public endpoint, so every one
// re-validates auth, refuses an empty slug, and checks the project is the
// caller's own (assertProjectOwned) - the same pattern as wizardChatSeen in
// actions.ts. Every action takes the slug EXPLICITLY, never the
// active-project cookie: getActiveProject's fallback is forgiving for
// rendering and wrong for writes (see runPipelineInstall's note in
// actions.ts).
//
// Nothing in actions.ts is newly exported for this (decision 14):
// applyWizardChoices and createProjectCore have no ownership check and stay
// private; site creation goes through the already-public wizardCreateProject.

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { dashboardAuth } from "@/lib/auth-gate";
import { currentUser } from "@/lib/cloud-auth";
import { captureServer } from "@/lib/posthog-server";
import { assertProjectOwned } from "@/lib/tenant-guard";
import { getProjectBySlug, publishTarget, type Project } from "@/lib/projects";
import { cleanDomain } from "@/lib/domain";
import { latestQualifier } from "@/lib/qualifier";
import { aiKind, isWizardAiChoice } from "@/lib/wizard-branch";
import { requestOrigin } from "@/lib/request-origin";
import { reportCronRun } from "@/lib/cron-alerts";
import { dispatchResearch } from "@/lib/github";
import { dispatchSetupNow } from "@/lib/setup-retry";
import { deferStep, getSetupStep, undeferStep, type DeferResult } from "@/lib/setup-path";
import { runPipelineInstall, wizardCreateProject } from "@/app/actions";

async function assertAuthed() {
  if (!(await dashboardAuth())) throw new Error("Unauthorized");
}

/** Auth + non-empty slug + ownership, in that order. Null = refuse. */
async function ownedProject(slug: string): Promise<Project | null> {
  await assertAuthed();
  if (!slug) return null;
  const project = await getProjectBySlug(slug);
  if (!project) return null;
  await assertProjectOwned(project.id);
  return project;
}

async function distinctId(project: Project): Promise<string> {
  return (await currentUser())?.id ?? project.id;
}

// ---- site -------------------------------------------------------------------

export type CreateSiteState = { ok: true; slug: string } | { error: string } | null;

/** "acme.com" -> "Acme", "www.my-shop.co.uk" -> "My-shop". The name is only a
 *  label (renameable on Settings); the domain is what everything keys on. */
function nameFromDomain(domain: string): string {
  const labels = domain.replace(/^www\./, "").split(".").filter(Boolean);
  if (labels.length > 1) labels.pop(); // the TLD
  // A second-level registry label under a country TLD (co.uk, com.au, ...).
  if (labels.length > 1 && /^(co|com|org|net|gov|ac|edu)$/.test(labels[labels.length - 1])) {
    labels.pop();
  }
  const base = labels.join(".") || domain;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/** The `site` step: ONLY the domain is asked (decision 4). Site kind and AI
 *  come from the form when the owner opened "change", else from the latest
 *  signup qualifier row, resolved with exactly the onboarding page's
 *  expression [R25]. Then the already-exported wizardCreateProject does the
 *  rest: auth, both answers validated on cloud, the plan gate, the row, the
 *  dash_project cookie, applyWizardChoices, project_created. */
export async function createSiteFromPath(
  _prev: CreateSiteState,
  formData: FormData,
): Promise<CreateSiteState> {
  await assertAuthed();
  const domain = cleanDomain(String(formData.get("domain") ?? ""));
  if (!domain) return { error: "Type your website's address, like example.com." };

  let publish = String(formData.get("publish_target") ?? "").trim();
  let ai = String(formData.get("ai_choice") ?? "").trim();
  if (!publish || !ai) {
    const auth = await dashboardAuth();
    const qualified = auth?.user ? await latestQualifier(auth.user.id) : null;
    if (!publish) {
      publish =
        qualified?.site_kind === "wordpress" ||
        (!qualified?.site_kind && qualified?.platform === "wordpress")
          ? "wordpress"
          : "github";
    }
    if (!ai) {
      ai = qualified?.ai_choice && isWizardAiChoice(qualified.ai_choice) ? qualified.ai_choice : "";
    }
  }

  const fd = new FormData();
  fd.set("name", nameFromDomain(domain));
  fd.set("domain", domain);
  fd.set("publish_target", publish);
  // Absent (no usable qualifier answer, "change" not opened) makes
  // wizardCreateProject answer "Pick which AI will do the writing." - the
  // site form renders its choices open in exactly that case [R25].
  if (ai) fd.set("ai_choice", ai);
  // mode / content_mode default to semi / detect inside createProjectCore.

  const result = await wizardCreateProject(null, fd);
  if (!result) return { error: "Something went wrong creating the site - try again." };
  if ("error" in result) return { error: result.error };
  revalidatePath("/onboarding");
  return { ok: true, slug: result.slug };
}

// ---- deferral ---------------------------------------------------------------

/** "I'll do this later". Only DEFERRABLE steps; the shared implementation is
 *  the one the defer_setup_step MCP tool calls. */
export async function deferSetupStep(slug: string, stepId: string): Promise<DeferResult> {
  const project = await ownedProject(slug);
  if (!project) return { error: "Unknown project." };
  const result = await deferStep(project.id, stepId);
  // No revalidatePath: a server re-render would hand the card a new
  // `initial` step and play the done beat over a step that was only parked.
  // The card refreshes itself quietly after the "Parked" line.
  if ("ok" in result) {
    await captureServer(await distinctId(project), "setup_step_deferred", { step: stepId });
  }
  return result;
}

export async function undeferSetupStep(slug: string, stepId: string): Promise<DeferResult> {
  const project = await ownedProject(slug);
  if (!project) return { error: "Unknown project." };
  // No revalidatePath, same reason as deferSetupStep.
  return undeferStep(project.id, stepId);
}

// ---- install_progress bookkeeping ------------------------------------------

/** Read-merge-write on install_progress [R-Q7]. `null` removes a key.
 *  Best-effort: a stamp that fails costs the hero its auto-fire cooldown,
 *  never the install itself. */
async function patchInstallProgress(
  projectId: string,
  patch: Record<string, string | null>,
): Promise<void> {
  try {
    const { data } = await db().from("projects").select("install_progress").eq("id", projectId).maybeSingle();
    const next: Record<string, string> = {
      ...(((data as { install_progress?: unknown } | null)?.install_progress as Record<string, string> | null) ?? {}),
    };
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) delete next[k];
      else next[k] = v;
    }
    await db().from("projects").update({ install_progress: next }).eq("id", projectId);
  } catch {
    // see above
  }
}

/** The keys a finished install attempt leaves behind (T3 / R10). */
function installOutcomePatch(
  result:
    | { ok: true; mode?: string; pr_url?: string; actions_pr_permission?: "set" | "manual-needed" }
    | { ok: false; error: string },
): Record<string, string | null> {
  const now = new Date().toISOString();
  if (!result.ok) return { install_error: result.error.slice(0, 500) };
  return {
    install_fired: now,
    install_error: null,
    ...(result.mode === "pr" && result.pr_url ? { install_pr_url: result.pr_url } : {}),
    ...(result.actions_pr_permission === "manual-needed" ? { actions_toggle_needed: now } : {}),
  };
}

// ---- connect phase ------------------------------------------------------------

export type ConnectCompleteResult =
  | { ok: true }
  // `connected: true` = the phase IS stamped (the owner goes on to Home,
  // where the hero shows the failed install with its Retry); only the
  // pipeline install inside it failed. Without it, nothing was written.
  | { error: string; connected?: true };

/** The "You're connected." screen's button. Refuses unless the live step
 *  really is `connected`; stamps setup_connected_at + onboarding_screen "c5"
 *  (the legacy gate / setup-retry still read it); for github x coding fires
 *  the idempotent pipeline install once. Idempotent: a second click (or a
 *  second tab) after the stamp is ok and installs nothing. */
export async function completeConnectPhase(slug: string): Promise<ConnectCompleteResult> {
  const project = await ownedProject(slug);
  if (!project) return { error: "Unknown project." };
  if (project.setup_connected_at) return { ok: true };

  const origin = requestOrigin(await headers());
  const step = await getSetupStep(project, origin, { live: true, mcpToken: null });
  if (step.id !== "connected") {
    return { error: `One step is still open: ${step.title}` };
  }

  const at = new Date().toISOString();
  const publish = publishTarget(project);
  const kind = aiKind(project.ai_choice);
  const installs =
    publish === "github" && kind === "coding" && Boolean(project.github_repo) && !project.pipeline_installed_at;

  // ONE conditional write claims the phase AND the install attempt: only the
  // request whose update matched the still-null row goes on to install, so
  // two tabs (or a double click) can never fire two installs. The attempt
  // stamp rides in the same row update - stamping it separately left a
  // window where both requests saw no attempt.
  const progress: Record<string, string> = {
    ...((project.install_progress as Record<string, string> | null) ?? {}),
  };
  if (installs) {
    progress.install_attempted_at = at;
    delete progress.install_error;
  }
  const { data: stamped, error } = await db()
    .from("projects")
    .update({
      setup_connected_at: at,
      onboarding_screen: "c5",
      ...(installs ? { install_progress: progress } : {}),
    })
    .eq("id", project.id)
    .is("setup_connected_at", null)
    .select("id");
  if (error) {
    // Never the raw Supabase message (S4).
    return {
      error: /setup_connected_at|column/i.test(error.message)
        ? "This database hasn't run migration 0062 yet. Apply supabase/migrations/0062_setup_path.sql and try again."
        : "Couldn't save that - reload and try again.",
    };
  }
  if (!stamped || stamped.length === 0) return { ok: true }; // another click won

  const user = await distinctId(project);
  await captureServer(user, "setup_connect_complete", {
    publish_target: publish,
    ai_kind: kind,
    deferred: step.deferred,
  });

  let installError: string | null = null;
  if (installs) {
    const { installPipelineToRepo } = await import("@/lib/pipeline-install");
    // installPipelineToRepo returns {ok:false} for handled failures but can
    // still THROW (App key, pack fetch, network) - same guard as
    // runPipelineInstall, so the owner sees an error, not an empty screen.
    try {
      const result = await installPipelineToRepo(project);
      if (result.ok) {
        await patchInstallProgress(
          project.id,
          installOutcomePatch({
            ok: true,
            mode: result.mode,
            pr_url: result.pr_url,
            actions_pr_permission: result.actions_pr_permission,
          }),
        );
        await captureServer(user, "pipeline_installed", { mode: result.mode ?? "direct" });
      } else {
        installError = result.error ?? "install failed";
      }
    } catch (e) {
      installError = e instanceof Error ? e.message : String(e);
    }
    if (installError) {
      await patchInstallProgress(project.id, installOutcomePatch({ ok: false, error: installError }));
    }
  }

  revalidatePath("/", "layout");
  return installError ? { error: installError, connected: true } : { ok: true };
}

// ---- launch-phase actions ---------------------------------------------------

export type PipelineInstallFromPathResult = Awaited<ReturnType<typeof runPipelineInstall>>;

/** The hero's `run_pipeline_install` (auto-fired once when no attempt was
 *  ever stamped, and its Retry button) [R10]. Wraps the
 *  existing runPipelineInstall - which does its own auth, ownership, "c5" and
 *  PostHog - with the install_progress writes the engine reads: every attempt
 *  stamps install_attempted_at; success stamps install_fired (+ the PR link
 *  hint and the Actions-toggle flag); failure records install_error. */
export async function runPipelineInstallFromPath(slug: string): Promise<PipelineInstallFromPathResult> {
  const project = await ownedProject(slug);
  if (!project) return { error: "Unknown project." };
  if (!project.github_repo) return { error: "Connect your repo first." };
  // Every attempt starts clean: the engine reads install_error as "failed"
  // [#7], so a retry must clear the last one or it shows failed while it runs.
  await patchInstallProgress(project.id, { install_attempted_at: new Date().toISOString(), install_error: null });
  let result: PipelineInstallFromPathResult;
  try {
    result = await runPipelineInstall(slug);
  } catch (e) {
    result = { error: e instanceof Error ? e.message : String(e) };
  }
  await patchInstallProgress(
    project.id,
    "error" in result
      ? installOutcomePatch({ ok: false, error: result.error })
      : installOutcomePatch({
          ok: true,
          mode: result.mode,
          pr_url: result.pr_url,
          actions_pr_permission: result.actions_pr_permission,
        }),
  );
  revalidatePath("/", "layout");
  return result;
}

export type RetryResult = { ok: true; message: string } | { ok: false; reason: string };

/** `retry_setup`: "Start setup again" after 45 minutes with no setup run at
 *  all. Calls dispatchSetupNow directly (not the scheduler's
 *  retrySetupIfNeverStarted, whose 30-minute age gate and 6-hour throttle
 *  would refuse a button for hours) [R11]. A skip returns its reason. */
export async function retrySetupFromPath(slug: string): Promise<RetryResult> {
  const project = await ownedProject(slug);
  if (!project) return { ok: false, reason: "Unknown project." };
  const r = await dispatchSetupNow(project);
  if (r.state === "dispatched") {
    revalidatePath("/", "layout");
    return { ok: true, message: "Setup started again. It usually takes 5-15 minutes." };
  }
  if (r.state === "skipped") return { ok: false, reason: r.reason };
  return {
    ok: false,
    reason: "Setup has already started (or we couldn't check just now) - it reports here on its own.",
  };
}

const RESEARCH_MARKER = (slug: string) => `first-run-research--${slug}`;
const RESEARCH_DEBOUNCE_MS = 10 * 60_000;

/** `retry_research`: "Run research now" when the first research run is
 *  overdue. Same marker rule as /api/onboarding/status's first-run trigger
 *  (first-run-research--<slug>, 10 minutes), so the button and the legacy
 *  poller never stack two runs - and their DataForSEO spend - on each other. */
export async function retryResearchFromPath(slug: string): Promise<RetryResult> {
  const project = await ownedProject(slug);
  if (!project) return { ok: false, reason: "Unknown project." };
  if (!project.github_repo) return { ok: false, reason: "Connect your repo first." };
  try {
    const { data } = await db()
      .from("cron_runs")
      .select("created_at")
      .eq("job", RESEARCH_MARKER(project.slug))
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const last = (data as { created_at?: string } | null)?.created_at;
    if (last && Date.now() - new Date(last).getTime() < RESEARCH_DEBOUNCE_MS) {
      return { ok: false, reason: "Research was started a few minutes ago - give it a moment to report." };
    }
  } catch {
    // A failed read proves nothing; the dispatch below is idempotent enough
    // (one research batch) that a rare double is cheaper than a dead button.
  }
  await reportCronRun(RESEARCH_MARKER(project.slug), { triggered: "seo-research" }, false);
  const res = await dispatchResearch(project);
  if (!res.ok) return { ok: false, reason: res.message };
  revalidatePath("/", "layout");
  return { ok: true, message: res.message };
}
