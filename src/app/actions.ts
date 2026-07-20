"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { isValidCookie } from "@/lib/dashboard-auth";
import { dispatchToolBuild, mergePr } from "@/lib/github";
import { getActiveProject, PROJECT_COOKIE } from "@/lib/active-project";
import {
  AUTO_PRESET,
  SEMI_PRESET,
  DEFAULT_PROJECT_SLUG,
  effectiveAutomations,
  getProjectById,
  getProjectBySlug,
  modeForFlags,
  type AutomationFlags,
} from "@/lib/projects";
import { saveContentPrefs } from "@/lib/content-prefs-store";
import { encryptSecret } from "@/lib/crypto";
import { validateSerpapiKey } from "@/lib/serp";
import { placeAtFront, writeQueueOrder } from "@/lib/queue";
import { requestTrendExpand, requestTrendScan } from "@/lib/trends";
import { fetchDomainRegistrationDate } from "@/lib/domain-age";

// Every action re-validates the auth cookie server-side - the proxy only does
// presence routing, this is the real check.
async function assertAuthed() {
  const jar = await cookies();
  if (!(await isValidCookie(jar.get("dash_auth")?.value))) {
    throw new Error("Unauthorized");
  }
}

export async function decideSuggestion(id: string, decision: "approved" | "rejected") {
  await assertAuthed();
  // select("*") tolerates rows from before migrations 0013/0014 - the source
  // and queue_position keys just come back undefined.
  const { data, error } = await db()
    .from("suggestions")
    .update({ status: decision, decided_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  // Approving a TOOL idea starts its build immediately (repository_dispatch
  // to the suggestion's project repo). Guides need no dispatch - the daily
  // builder picks them up on schedule.
  if (decision === "approved" && data?.type === "tool") {
    const project = data.project_id ? await getProjectById(data.project_id) : null;
    await dispatchToolBuild(project?.github_repo, id);
  }
  // Approving a trend find puts it at the front of the queue - that's the
  // whole point of the radar: it ships next morning, while the hype window
  // is open. Visible on the dashboard, so it can be dragged back down.
  if (decision === "approved" && data?.source === "trend-scan" && data.project_id) {
    await placeAtFront(data.project_id, id, data.type);
  }
  revalidatePath("/dashboard");
  revalidatePath("/trends");
  revalidatePath("/research");
}

// ---- the owner's queue (manual ideas + explicit build order) ----------------

export type AddIdeaState = { error: string } | { ok: true; message: string } | null;

// The dashboard's Add-idea form: the owner types a guide or tool idea and it
// lands in the build queue already approved - they wrote it, there is nothing
// to gate. A sparse idea (just a title) is fine: the build instructions tell
// the builder to do the keyword/SERP validation itself when the spec is thin.
export async function addManualSuggestion(
  _prev: AddIdeaState,
  formData: FormData,
): Promise<AddIdeaState> {
  await assertAuthed();

  const type = String(formData.get("type") ?? "guide");
  if (type !== "guide" && type !== "tool") return { error: "Pick guide or tool." };
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "Give the idea a title." };
  const keyword = String(formData.get("keyword") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const placement = String(formData.get("placement") ?? "back");

  const project = await getActiveProject();
  const row = {
    project_id: project.id,
    type,
    title,
    primary_keyword: keyword || null,
    rationale: notes || null,
    status: "approved",
    decided_at: new Date().toISOString(),
  };
  // Same pre-0014 tolerance as the MCP's propose: retry without source so
  // manual adds keep working before the migration (losing only the label).
  let { data, error } = await db()
    .from("suggestions")
    .insert({ ...row, source: "manual" })
    .select()
    .single();
  if (error) {
    ({ data, error } = await db().from("suggestions").insert(row).select().single());
  }
  if (error) return { error: error.message };

  if (placement === "front") {
    await placeAtFront(project.id, data.id, type);
  }

  revalidatePath("/dashboard");
  revalidatePath("/research");
  revalidatePath("/tools");
  const message =
    type === "tool"
      ? placement === "front"
        ? "Queued next for the tool builder - Build now on Research fires it immediately."
        : "Added to the tool queue."
      : placement === "front"
        ? "Queued next - it's tomorrow morning's build."
        : "Added to the end of the guide queue.";
  return { ok: true, message };
}

// Persist a drag-reorder of one build queue (guides and tools are separate
// lists). The dashboard has already reordered on screen - this writes dense
// queue_position 1..n behind the scenes so what you see is what builds.
// Returns { ok } instead of throwing: the client reverts the optimistic order
// on failure and shows the message inline.
export async function reorderQueue(
  group: "guide" | "tool",
  orderedIds: string[],
): Promise<{ ok: true } | { ok: false; message: string }> {
  await assertAuthed();
  if (group !== "guide" && group !== "tool") return { ok: false, message: "Bad group." };

  const project = await getActiveProject();
  const result = await writeQueueOrder(project.id, group, orderedIds);
  if (!result.ok) return result;
  revalidatePath("/dashboard");
  revalidatePath("/research");
  return result;
}

// Second thoughts on a rejection: put a History item back into its build
// queue as approved. It re-enters unpositioned (FIFO by its original date) -
// the queue is drag-sortable now, so where it builds is one drag away.
export async function restoreSuggestion(id: string) {
  await assertAuthed();
  // Scoped to the active project like the trend-topic actions - single-owner
  // app, so this is hygiene (a History id can only touch its own project's
  // rows), not a cross-tenant gate.
  const project = await getActiveProject();
  const { error } = await db()
    .from("suggestions")
    .update({ status: "approved", decided_at: new Date().toISOString(), queue_position: null })
    .eq("id", id)
    .eq("project_id", project.id)
    .eq("status", "rejected");
  if (error) {
    // Pre-0014 tolerance: retry without queue_position so restore still works.
    const { error: retryError } = await db()
      .from("suggestions")
      .update({ status: "approved", decided_at: new Date().toISOString() })
      .eq("id", id)
      .eq("project_id", project.id)
      .eq("status", "rejected");
    if (retryError) throw new Error(retryError.message);
  }
  revalidatePath("/dashboard");
  revalidatePath("/research");
  revalidatePath("/trends");
}

// Fires the builder for a tool that is sitting approved in the queue (manual
// adds choose "queue it"; this is the later "actually, build it now").
export async function buildToolNow(id: string): Promise<{ ok: boolean; message: string }> {
  await assertAuthed();
  const { data, error } = await db().from("suggestions").select("*").eq("id", id).single();
  if (error) return { ok: false, message: error.message };
  if (data.type !== "tool" || data.status !== "approved") {
    return { ok: false, message: "Only queued tool ideas can be built." };
  }
  const project = data.project_id ? await getProjectById(data.project_id) : null;
  await dispatchToolBuild(project?.github_repo, id);
  revalidatePath("/dashboard");
  revalidatePath("/research");
  return { ok: true, message: "Build requested - the PR lands in a few minutes." };
}

// ---- the trend radar (two-stage: subjects, then takes) ----------------------
// The cooldown + dispatch logic lives in lib/trends.ts, shared with the MCP's
// trigger_trend_scan / expand_trend_topic tools - one code path, two doors.

// The Trend radar's Scan now button: wakes the project repo's trend-scan
// workflow (stage 1 - trending subjects only). The scan runs in the repo's
// CI and reports back through the MCP - subjects appear on the radar a few
// minutes later.
export async function triggerTrendScan(): Promise<{ ok: boolean; message: string }> {
  await assertAuthed();
  const project = await getActiveProject();
  const result = await requestTrendScan(project);
  if (result.ok) revalidatePath("/trends");
  return result;
}

// Get takes on a radar subject: wakes the trend-expand workflow for that ONE
// topic. The card flips to "working on takes"; the run's suggestions land
// under it linked by trend_topic_id.
export async function expandTrendTopic(id: string): Promise<{ ok: boolean; message: string }> {
  await assertAuthed();
  const project = await getActiveProject();
  const result = await requestTrendExpand(project, id);
  if (result.ok) {
    revalidatePath("/trends");
    revalidatePath("/dashboard");
  }
  return result;
}

// Pass on a radar subject. Dismissed subjects stay dismissed - the scan's
// dedupe reads all statuses, so it won't re-propose them.
export async function dismissTrendTopic(id: string) {
  await assertAuthed();
  const project = await getActiveProject();
  const { error } = await db()
    .from("trend_topics")
    .update({ status: "dismissed" })
    .eq("id", id)
    .eq("project_id", project.id);
  if (error) throw new Error(error.message);
  revalidatePath("/trends");
  revalidatePath("/dashboard");
}

// There is deliberately NO build-now for trend takes (owner decision,
// 2026-07-15): guides ship at most one per day so the cadence stays steady
// instead of bursty. Approving a take already puts it at the front of the
// queue - the next daily build picks it up first, tomorrow at the latest.

export async function setProspectStatus(id: string, status: string) {
  await assertAuthed();
  const allowed = ["new", "contacted", "acquired", "rejected"];
  if (!allowed.includes(status)) throw new Error("Bad status");
  const { error } = await db().from("backlink_prospects").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}

export async function mergeSeoPr(number: number) {
  await assertAuthed();
  const project = await getActiveProject();
  const result = await mergePr(project.github_repo, number);
  revalidatePath("/dashboard");
  return result;
}

// Marks the manual "Request Google indexing" step done for a page - the row
// leaves the Get-it-on-Google card. Requires migration 0005
// (pages.index_requested_at); until it runs, the update fails and the card
// carries the migration nudge.
export async function markIndexRequested(id: string) {
  await assertAuthed();
  const { error } = await db()
    .from("pages")
    .update({ index_requested_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}

// The batch variant: one browser session requests indexing for every pending
// page, so one button clears the whole card.
export async function markIndexRequestedBulk(ids: string[]) {
  await assertAuthed();
  if (ids.length === 0) return;
  const { error } = await db()
    .from("pages")
    .update({ index_requested_at: new Date().toISOString() })
    .in("id", ids);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}

export async function setPlaybookStatus(slug: string, status: "todo" | "done" | "skipped") {
  await assertAuthed();
  const project = await getActiveProject();
  const { error } = await db()
    .from("playbook_status")
    .upsert({
      project_id: project.id,
      slug,
      status,
      done_at: status === "done" ? new Date().toISOString() : null,
    });
  if (error) throw new Error(error.message);
  revalidatePath("/backlinks");
}

export type ConnectDataforseoState = { error: string } | { ok: true } | null;

// The "Connect DataForSEO" setup card (free-tier DIY: every project brings its
// own account). Credentials are verified with a live user_data call BEFORE
// saving, so a typo'd API password can never sit silently in the DB while the
// nightly cron fails.
export async function connectDataforseo(
  _prev: ConnectDataforseoState,
  formData: FormData,
): Promise<ConnectDataforseoState> {
  await assertAuthed();

  const login = String(formData.get("login") ?? "").trim();
  const password = String(formData.get("password") ?? "").trim();
  if (!login || !password) return { error: "Both fields are needed." };

  // Live check against the free user_data endpoint.
  try {
    const res = await fetch("https://api.dataforseo.com/v3/appendix/user_data", {
      headers: {
        Authorization: "Basic " + Buffer.from(`${login}:${password}`).toString("base64"),
      },
      cache: "no-store",
    });
    if (res.status === 401) {
      return {
        error:
          "DataForSEO rejected these credentials. Login is your account email; the password is the API password from app.dataforseo.com/api-access, not your dashboard password.",
      };
    }
    if (!res.ok) return { error: `DataForSEO answered HTTP ${res.status} - try again.` };
  } catch {
    return { error: "Could not reach DataForSEO - try again." };
  }

  // Encrypt the API password at rest (the login is a plain email, kept as-is
  // so the settings page can show which account is connected). A missing key is
  // a server misconfig, not a user error, but surface it so the owner can fix.
  let storedPassword: string;
  try {
    storedPassword = await encryptSecret(password);
  } catch {
    return {
      error: "Could not securely save the credentials - the server is missing its encryption key.",
    };
  }

  const project = await getActiveProject();
  // Connecting DataForSEO also makes it the keyword source - it's the most
  // accurate option, and this is the only gesture that means "use it".
  const { error } = await db()
    .from("projects")
    .update({
      dataforseo_login: login,
      dataforseo_password: storedPassword,
      keyword_source: "dataforseo",
    })
    .eq("id", project.id);
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { ok: true };
}

// ---- keyword data source (the onboarding wizard's step 3) ------------------

export type ConnectSerpapiState = { error: string } | { ok: true } | null;

// Free mode with a BYO SerpApi key: the key is checked live against the
// account endpoint (burns no search credits) before being saved encrypted,
// and the project flips to keyword_source 'serpapi'.
export async function connectSerpapi(
  _prev: ConnectSerpapiState,
  formData: FormData,
): Promise<ConnectSerpapiState> {
  await assertAuthed();

  const key = String(formData.get("key") ?? "").trim();
  if (!key) return { error: "Paste your SerpApi key." };

  const check = await validateSerpapiKey(key);
  if (!check.ok) return { error: check.error };

  let storedKey: string;
  try {
    storedKey = await encryptSecret(key);
  } catch {
    return {
      error: "Could not securely save the key - the server is missing its encryption key.",
    };
  }

  const project = await getActiveProject();
  const { error } = await db()
    .from("projects")
    .update({ serpapi_key: storedKey, keyword_source: "serpapi" })
    .eq("id", project.id);
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { ok: true };
}

// Settings: switch back to DataForSEO as the keyword source. Only valid when
// credentials are already saved - otherwise the connect form is the way in.
export async function chooseDataforseoSource() {
  await assertAuthed();
  const project = await getActiveProject();
  if (!project.dataforseo_login || !project.dataforseo_password) {
    throw new Error("Connect DataForSEO credentials first.");
  }
  const { error } = await db()
    .from("projects")
    .update({ keyword_source: "dataforseo" })
    .eq("id", project.id);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

// Pure free mode: Search Console positions + autocomplete research, no SERP
// provider. Also the wizard's "Not interested, let's continue" path.
export async function chooseGscOnly() {
  await assertAuthed();
  const project = await getActiveProject();
  const { error } = await db()
    .from("projects")
    .update({ keyword_source: "gsc" })
    .eq("id", project.id);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

// The wizard's power-ups step: remember which optional setup cards the user
// unchecked so Home stops offering them (re-enable by clearing in Settings).
const POWERUPS = ["merge", "pipeline", "playbook"] as const;

export async function setPowerupsSkipped(skipped: string[]) {
  await assertAuthed();
  const clean = skipped.filter((s): s is (typeof POWERUPS)[number] =>
    (POWERUPS as readonly string[]).includes(s),
  );
  const project = await getActiveProject();
  const { error } = await db()
    .from("projects")
    .update({ powerups_skipped: clean })
    .eq("id", project.id);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

// ---- multi-project ---------------------------------------------------------

// The header switcher: remember the chosen project and re-render everything.
export async function switchProject(slug: string) {
  await assertAuthed();
  const project = await getProjectBySlug(slug);
  if (!project) throw new Error("Unknown project");
  const jar = await cookies();
  jar.set(PROJECT_COOKIE, project.slug, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}

export type DeleteProjectState = { error: string } | null;

// The Settings danger zone. Deleting cascades through every table (migration
// 0006), so keywords, rank history, suggestions, pages, GSC snapshots,
// playbook progress, and the profile all go with the project row. The live
// site itself is untouched - this only forgets the project. The default
// project can't be deleted: it anchors the schema's column defaults and the
// legacy MCP_API_KEY mapping.
export async function deleteProject(
  _prev: DeleteProjectState,
  formData: FormData,
): Promise<DeleteProjectState> {
  await assertAuthed();

  const slug = String(formData.get("slug") ?? "");
  const confirm = String(formData.get("confirm") ?? "").trim().toLowerCase();

  const project = await getProjectBySlug(slug);
  if (!project) return { error: "Unknown project." };
  if (project.slug === DEFAULT_PROJECT_SLUG) {
    return { error: "The home project can't be deleted." };
  }
  if (confirm !== project.domain) {
    return { error: `Type ${project.domain} exactly to confirm.` };
  }

  const { error } = await db().from("projects").delete().eq("id", project.id);
  if (error) return { error: error.message };

  const jar = await cookies();
  jar.set(PROJECT_COOKIE, DEFAULT_PROJECT_SLUG, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

// Shared core of project creation: validates the form, inserts the row with a
// fresh MCP token, and switches the dashboard cookie to it. Only the wizard
// consumes it today (/new redirects there), but the split keeps creation
// reusable if a non-wizard entry point ever returns.
async function createProjectCore(
  formData: FormData,
): Promise<{ error: string } | { slug: string; name: string; domain: string; mcpToken: string }> {
  const name = String(formData.get("name") ?? "").trim();
  const rawDomain = String(formData.get("domain") ?? "").trim();
  const mode = String(formData.get("mode") ?? "semi");

  // Accept the repo in any shape people actually paste: bare owner/repo, the
  // full GitHub URL (with or without .git, deep links like /tree/main), or
  // the SSH form - all normalize down to owner/repo.
  let repo = String(formData.get("repo") ?? "").trim();
  if (repo) {
    repo = repo
      .replace(/^git@github\.com:/i, "")
      .replace(/^https?:\/\/(www\.)?github\.com\//i, "")
      .replace(/^github\.com\//i, "")
      .replace(/\.git$/i, "")
      .replace(/^\/+|\/+$/g, "");
    const parts = repo.split("/").filter(Boolean);
    if (parts.length >= 2) repo = `${parts[0]}/${parts[1]}`;
  }

  const domain = rawDomain
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");

  if (!name) return { error: "Give the project a name." };
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) {
    return { error: "That domain does not look right - use something like usagecut.com." };
  }
  if (!repo) {
    return { error: "Add your GitHub repo - Claude publishes content there as pull requests." };
  }
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    return {
      error:
        "Could not read that repo - paste the GitHub URL (https://github.com/owner/repo) or just owner/repo.",
    };
  }
  if (mode !== "semi" && mode !== "auto") return { error: "Pick a mode." };

  // The "does the site have a blog?" answer - a hint the setup workflow
  // reconciles against the actual repo (0017). The path hint only means
  // something alongside "existing".
  const contentMode = String(formData.get("content_mode") ?? "detect");
  if (!["existing", "create", "detect"].includes(contentMode)) {
    return { error: "Pick a content option." };
  }
  const contentPathHint = String(formData.get("content_path_hint") ?? "")
    .trim()
    .slice(0, 120);

  // Slug: the first domain label, falling back to the full dashed domain if
  // another project already claimed it (sub.example.com vs example.com).
  const firstLabel = domain.split(".")[0];
  const taken = await getProjectBySlug(firstLabel);
  const slug = taken ? domain.replace(/\./g, "-") : firstLabel;

  // Seed the site's age from the domain's public registration date (RDAP) -
  // a signup's domain almost never went live the day it joined DispatchSEO,
  // and the publishing pace would wrongly throttle an established site as
  // brand new. Null (lookup failed) leaves the column default (today);
  // Settings has the correction field either way.
  const siteLaunchedAt = await fetchDomainRegistrationDate(domain);

  const mcpToken = randomBytes(24).toString("hex");
  const row: Record<string, unknown> = {
    slug,
    name,
    domain,
    // Domain properties are the common case; if the site is verified as a
    // URL-prefix property instead, the value can be corrected later.
    gsc_site_url: `sc-domain:${domain}`,
    github_repo: repo || null,
    mcp_token: mcpToken,
    mode,
    content_mode: contentMode,
  };
  if (contentPathHint && contentMode === "existing") row.content_path_hint = contentPathHint;
  if (siteLaunchedAt) row.site_launched_at = siteLaunchedAt;
  let { error } = await db().from("projects").insert(row);
  if (error) {
    // Same pre-migration tolerance as manual suggestions: drop the columns
    // the error names (0015 and/or 0017 not applied yet) and retry once so
    // project creation keeps working in that window.
    const retry = { ...row };
    let dropped = false;
    if (error.message.includes("content_")) {
      delete retry.content_mode;
      delete retry.content_path_hint;
      dropped = true;
    }
    if (error.message.includes("site_launched_at")) {
      delete retry.site_launched_at;
      dropped = true;
    }
    if (dropped) ({ error } = await db().from("projects").insert(retry));
  }
  if (error) {
    if (error.code === "23505") return { error: "A project for that domain already exists." };
    if (error.code === "42P01") {
      return { error: "The projects migration has not been applied yet - run 0004_projects.sql first." };
    }
    return { error: error.message };
  }

  const jar = await cookies();
  jar.set(PROJECT_COOKIE, slug, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
  return { slug, name, domain, mcpToken };
}

export type WizardCreateState =
  | { error: string }
  | { ok: true; slug: string; name: string; domain: string; mcpToken: string }
  | null;

// The onboarding wizard's step 1. Same creation, but no redirect - the wizard
// advances client-side and shows the MCP token in its Claude Code step.
export async function wizardCreateProject(
  _prev: WizardCreateState,
  formData: FormData,
): Promise<WizardCreateState> {
  await assertAuthed();
  const result = await createProjectCore(formData);
  if ("error" in result) return result;
  return { ok: true, ...result };
}

// Header mode switch: flips the active project between semi-automatic (the
// owner approves ideas and merges PRs) and automatic (fully hands-off
// publishing). Picking a preset also writes its flag values so the row always
// reads coherently. Enforcement lives with the consumers: the MCP converts
// agent approvals to pending when auto_approve is off, and the project repo's
// CI asks /api/project-mode before building or merging.
export async function setProjectMode(mode: "semi" | "auto") {
  await assertAuthed();
  if (mode !== "semi" && mode !== "auto") throw new Error("Bad mode");
  const project = await getActiveProject();
  const preset = mode === "auto" ? AUTO_PRESET : SEMI_PRESET;
  const { error } = await db()
    .from("projects")
    .update({ mode, ...preset })
    .eq("id", project.id);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

// Corrects the site's launch date (Settings). It feeds the site-age readout
// (Journey, pacing.ts's siteAgeDays; the pace itself is flat one-guide-a-day
// and no longer age-based) - migration 0015 backfills it from created_at,
// which is only right for sites that went live the day they joined.
export async function setSiteLaunchedAt(date: string) {
  await assertAuthed();
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime()) || parsed.getTime() > Date.now()) {
    throw new Error("Launch date must be a valid date in the past");
  }
  const project = await getActiveProject();
  const { error } = await db()
    .from("projects")
    .update({ site_launched_at: parsed.toISOString() })
    .eq("id", project.id);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

// Per-automation toggle on the Automations page. The mode label is derived:
// a flag set matching a preset IS that preset ("check everything from semi
// and you're simply auto"), anything else shows as "custom" in the topbar.
export async function setAutomationToggle(flag: keyof AutomationFlags, enabled: boolean) {
  await assertAuthed();
  const allowed: (keyof AutomationFlags)[] = [
    "auto_approve",
    "auto_build_guides",
    "auto_build_tools",
    "auto_merge",
  ];
  if (!allowed.includes(flag)) throw new Error("Bad automation flag");
  const project = await getActiveProject();
  const next = { ...effectiveAutomations(project), [flag]: Boolean(enabled) };
  const { error } = await db()
    .from("projects")
    .update({ mode: modeForFlags(next), ...next })
    .eq("id", project.id);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

// The Instructions page's template controls (block toggles, shape rotation,
// house rules). saveContentPrefs normalizes and validates; the same lib call
// backs the set_content_prefs MCP tool.
export async function setContentPrefs(prefs: unknown) {
  await assertAuthed();
  const project = await getActiveProject();
  const { error } = await saveContentPrefs(project, prefs);
  if (error) throw new Error(error);
  revalidatePath("/instructions");
}
