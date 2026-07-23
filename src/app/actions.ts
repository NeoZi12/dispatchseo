"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath, updateTag } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { bustInstanceCache } from "@/lib/dashboard-auth";
import { dashboardAuth } from "@/lib/auth-gate";
import { isCloudMode } from "@/lib/cloud";
import {
  assertInstallationClaimable,
  assertProjectOwned,
  assertRowOwned,
  assertRowsOwned,
} from "@/lib/tenant-guard";
import { remainingSites } from "@/lib/billing";
import { bustGhTokenCache, dispatchToolBuild, mergePr } from "@/lib/github";
import { getActiveProject, PROJECT_COOKIE } from "@/lib/active-project";
import {
  AUTO_PRESET,
  SEMI_PRESET,
  DEFAULT_PROJECT_ID,
  effectiveAutomations,
  getProjectById,
  getProjectBySlug,
  modeForFlags,
  type AutomationFlags,
} from "@/lib/projects";
import { markCronFixed } from "@/lib/cron-alerts";
import { saveContentPrefs } from "@/lib/content-prefs-store";
import { encryptSecret } from "@/lib/crypto";
import { validateSerpapiKey } from "@/lib/serp";
import { placeAtFront, writeQueueOrder } from "@/lib/queue";
import { requestTrendExpand, requestTrendScan } from "@/lib/trends";
import { fetchDomainRegistrationDate } from "@/lib/domain-age";
import { bustGscCredCache, gscAccessProbe, type GscAccessProbe } from "@/lib/gsc";

// Every action re-validates auth server-side - the proxy only does presence
// routing, this is the real check. dashboardAuth covers both modes: the
// dash_auth cookie on self-host, the Supabase session in CLOUD_MODE.
async function assertAuthed() {
  if (!(await dashboardAuth())) {
    throw new Error("Unauthorized");
  }
}

export async function decideSuggestion(id: string, decision: "approved" | "rejected") {
  await assertAuthed();
  await assertRowOwned("suggestions", id);
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
    await dispatchToolBuild(project, id);
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

// The Home banner's "Mark fixed" - the dashboard face of the mark_cron_fixed
// MCP tool. An owner judgment call: clears the alert now; if the job is still
// broken the next failed run or missed window re-raises it on its own.
export async function markCronFixedAction(job: string) {
  await assertAuthed();
  await markCronFixed(job);
  revalidatePath("/dashboard");
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
  await assertRowOwned("suggestions", id);
  const { data, error } = await db().from("suggestions").select("*").eq("id", id).single();
  if (error) return { ok: false, message: error.message };
  if (data.type !== "tool" || data.status !== "approved") {
    return { ok: false, message: "Only queued tool ideas can be built." };
  }
  const project = data.project_id ? await getProjectById(data.project_id) : null;
  await dispatchToolBuild(project, id);
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
  await assertRowOwned("backlink_prospects", id);
  const allowed = ["new", "contacted", "acquired", "rejected"];
  if (!allowed.includes(status)) throw new Error("Bad status");
  const { error } = await db().from("backlink_prospects").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}

export async function mergeSeoPr(number: number) {
  await assertAuthed();
  const project = await getActiveProject();
  const result = await mergePr(project, number);
  // openSeoPrs caches the PR list for 60s per repo - mergePr already busts
  // the tag for future requests; updateTag additionally expires it for THIS
  // request (read-your-own-writes), so the merged PR's "Ready to ship" card
  // is gone on the very render this action streams back.
  if (project.github_repo) updateTag(`seo-prs:${project.github_repo}`);
  revalidatePath("/dashboard");
  return result;
}

// Marks the manual "Request Google indexing" step done for a page - the row
// leaves the Get-it-on-Google card. Requires migration 0005
// (pages.index_requested_at); until it runs, the update fails and the card
// carries the migration nudge.
export async function markIndexRequested(id: string) {
  await assertAuthed();
  await assertRowOwned("pages", id);
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
  await assertRowsOwned("pages", ids);
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
// Wizard step 2's "Connect service account" form: the owner pastes the JSON
// key file downloaded from Google Cloud, we validate its shape, encrypt it
// with the instance key, and store it - Search Console connects entirely
// from the browser, no .env edit, no restart. Env GSC_SERVICE_ACCOUNT_JSON
// still wins when set (gsc.ts resolution order).
export type ConnectGscState = { ok: true; email: string } | { error: string } | null;

export async function connectGscServiceAccount(
  _prev: ConnectGscState,
  formData: FormData,
): Promise<ConnectGscState> {
  await assertAuthed();
  // instance_settings is deployment-wide - one tenant must not overwrite the
  // shared credential. Cloud uses the per-project Google OAuth connect.
  if (isCloudMode()) {
    return { error: "On the hosted version, connect Search Console with the one-click Google button instead." };
  }
  const raw = String(formData.get("json") ?? "").trim();
  if (!raw) return { error: "Paste the contents of the downloaded JSON key file." };
  let parsed: { client_email?: string; private_key?: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "That doesn't parse as JSON - paste the whole file, exactly as downloaded." };
  }
  if (!parsed.client_email || !parsed.private_key) {
    return {
      error:
        "That JSON has no client_email/private_key - make sure it's the service account KEY file (Keys → Add key → Create new key → JSON).",
    };
  }
  const enc = await encryptSecret(raw);
  const { data, error } = await db()
    .from("instance_settings")
    .update({ gsc_service_account_json: enc })
    .eq("id", true)
    .select("id");
  if (error) {
    return {
      error: /gsc_service_account_json|column/i.test(error.message)
        ? "The database is missing migration 0029 - re-run setup.sql once, then try again."
        : error.message,
    };
  }
  if (!data || data.length === 0) {
    // Classic env-based install: no instance_settings row to store into.
    return {
      error:
        "This install is configured through environment variables - set GSC_SERVICE_ACCOUNT_JSON in your deployment env instead.",
    };
  }
  bustInstanceCache();
  bustGscCredCache();
  revalidatePath("/", "layout");
  return { ok: true, email: parsed.client_email };
}

// Wizard step 2's "Verify connection" button: probe Search Console access
// for the active project's (guessed) property right now, so the owner knows
// on the spot whether adding the service-account email worked instead of
// finding out from a paused automation next week.
export async function wizardCheckGscAccess(): Promise<GscAccessProbe> {
  await assertAuthed();
  const project = await getActiveProject();
  if (!project.gsc_site_url) {
    return { state: "error", why: "no Search Console property is set on this project yet" };
  }
  const first = await gscAccessProbe(project.gsc_site_url);
  if (first.state !== "pending" || !project.domain) return first;
  // The stored property is onboarding's GUESS (sc-domain:<domain>). If the
  // owner's site is actually verified as a URL-prefix property, that guess
  // can never pass - so on "no access", probe the other property shapes and
  // self-correct the project to whichever one the service account can read.
  const alternates = [
    `sc-domain:${project.domain}`,
    `https://${project.domain}/`,
    `https://www.${project.domain}/`,
    `http://${project.domain}/`,
  ].filter((s) => s !== project.gsc_site_url);
  for (const site of alternates) {
    const probe = await gscAccessProbe(site);
    if (probe.state === "ok") {
      await db().from("projects").update({ gsc_site_url: site }).eq("id", project.id);
      revalidatePath("/", "layout");
      return { state: "ok" };
    }
  }
  return first;
}

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

// Wizard one-tap-merge step: verify the pasted GitHub token against the
// project's OWN repo (which simultaneously proves the token works, has repo
// scope, and the repo name is real - including private repos the public API
// can't see), then store it encrypted like the GSC key. Env GH_MERGE_TOKEN
// still wins at read time (github.ts).
export type ConnectGithubState = { ok: true } | { error: string } | null;

export async function connectGithubToken(
  _prev: ConnectGithubState,
  formData: FormData,
): Promise<ConnectGithubState> {
  await assertAuthed();
  // Same instance-wide concern as the GSC key: the merge token is stored in
  // instance_settings. Cloud merges will go through the GitHub App instead.
  if (isCloudMode()) {
    return { error: "Not available on the hosted version - PR merging is handled per account." };
  }
  const token = String(formData.get("token") ?? "").trim();
  if (!token) return { error: "Paste the token GitHub generated." };
  const project = await getActiveProject();
  if (!project.github_repo) return { error: "Connect a repo in step 1 first." };
  let res: Response;
  try {
    res = await fetch(`https://api.github.com/repos/${project.github_repo}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "dispatchseo-onboarding",
      },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return { error: "Could not reach GitHub - try again." };
  }
  if (res.status === 401) return { error: "GitHub rejected that token - copy it again, in full." };
  if (res.status === 404) {
    return {
      error: `This token can't see ${project.github_repo}. If it's a fine-grained token, make sure that repo is selected; classic tokens need the "repo" scope. (Also double-check the repo name in step 1.)`,
    };
  }
  if (!res.ok) return { error: `GitHub answered HTTP ${res.status} - try again.` };
  const repoInfo = (await res.json()) as { permissions?: { push?: boolean } };
  if (repoInfo.permissions && !repoInfo.permissions.push) {
    return { error: "The token can read the repo but not write to it - it needs push access to merge PRs." };
  }
  // The permissions field above reflects the OWNER's repo access, not what
  // this token was granted - a fine-grained token without Contents access
  // passes it and then the builder can't even clone (2026-07-23 e2e: install
  // sailed through, every background build died on clone). Probe the
  // capability the builder actually uses: reading the repo's commits.
  try {
    const probe = await fetch(
      `https://api.github.com/repos/${project.github_repo}/commits?per_page=1`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "dispatchseo-onboarding",
        },
        signal: AbortSignal.timeout(8000),
      },
    );
    // 409 = empty repo (no commits yet) - contents access proven anyway.
    if (!probe.ok && probe.status !== 409) {
      return {
        error: `The token can see ${project.github_repo} but can't read its code, so builds can't clone it. Fine-grained token? Give it "Contents" repository permission (Read and write) and paste it again.`,
      };
    }
  } catch {
    return { error: "Could not reach GitHub - try again." };
  }
  const enc = await encryptSecret(token);
  const { data, error } = await db()
    .from("instance_settings")
    .update({ gh_merge_token: enc })
    .eq("id", true)
    .select("id");
  if (error) {
    return {
      error: /gh_merge_token|column/i.test(error.message)
        ? "The database is missing migration 0030 - re-run setup.sql once, then try again."
        : error.message,
    };
  }
  if (!data || data.length === 0) {
    return {
      error: "This install is configured through environment variables - set GH_MERGE_TOKEN in your deployment env instead.",
    };
  }
  bustInstanceCache();
  bustGhTokenCache();
  revalidatePath("/", "layout");
  return { ok: true };
}

// Wizard resume: remember which screen the wizard stands on, so a closed
// tab or stuck terminal never loses progress. Tolerant of the 0030 column
// not existing yet - resume is a nicety, never a blocker.
export async function setWizardScreen(screenId: string) {
  await assertAuthed();
  if (!/^[a-z0-9_]{1,20}$/.test(screenId)) return;
  const project = await getActiveProject();
  await db().from("projects").update({ onboarding_screen: screenId }).eq("id", project.id);
}

// Skip a single wizard step (merge token / backlink playbook) - appends to
// powerups_skipped so the matching Home card stays hidden: a conscious skip
// in the wizard is a decision, not a leftover.
export async function skipPowerup(key: string) {
  await assertAuthed();
  if (!(POWERUPS as readonly string[]).includes(key)) return;
  const project = await getActiveProject();
  const next = Array.from(new Set([...project.powerups_skipped, key]));
  const { error } = await db()
    .from("projects")
    .update({ powerups_skipped: next })
    .eq("id", project.id);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

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
  await assertProjectOwned(project.id);
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
  // Cloud: deleting is for the project's OWNER alone - the scariest of the
  // id-swapping (IDOR) targets, since 0006 cascades the delete everywhere.
  try {
    await assertProjectOwned(project.id);
  } catch {
    return { error: "Unknown project." };
  }
  if (project.id === DEFAULT_PROJECT_ID) {
    return { error: "The home project can't be deleted." };
  }
  if (confirm !== project.domain) {
    return { error: `Type ${project.domain} exactly to confirm.` };
  }

  const { error } = await db().from("projects").delete().eq("id", project.id);
  if (error) return { error: error.message };

  // Drop the cookie instead of pinning a slug: the default project's slug
  // is user-defined since the wizard claims that row, and getActiveProject
  // falls back to the fixed-id project on a missing cookie anyway.
  const jar = await cookies();
  jar.delete(PROJECT_COOKIE);
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
  // Cloud connects the repo via the GitHub App AFTER creation (wizard c1), so
  // an empty repo is the normal cloud case, not an error.
  if (!repo) {
    if (!isCloudMode()) {
      return { error: "Add your GitHub repo - Claude publishes content there as pull requests." };
    }
  } else if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    return {
      error:
        "Could not read that repo - paste the GitHub URL (https://github.com/owner/repo) or just owner/repo.",
    };
  }
  if (mode !== "semi" && mode !== "auto") return { error: "Pick a mode." };

  if (!(await domainAnswers(domain))) {
    return {
      error: `We could not reach ${domain}. Check the spelling - it should be your live website's address.`,
    };
  }

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
  // Cloud accounts own their projects (0031); the whole dashboard scopes by
  // this column in CLOUD_MODE, so a row without it would be orphaned.
  if (isCloudMode()) {
    const auth = await dashboardAuth();
    if (!auth?.user) return { error: "Sign in again to create a project." };
    const remaining = await remainingSites(auth.user.id);
    if (remaining !== null && remaining <= 0) {
      return {
        error:
          "Your plan doesn't have room for another site - pick or upgrade a plan on the Billing page.",
      };
    }
    row.owner_user_id = auth.user.id;
    // Bundled DataForSEO is the paid-tier default - the cloud wizard has no
    // keyword-source step (budget caps degrade to GSC-only under the hood).
    row.keyword_source = "dataforseo";
  }
  // A fresh instance's fixed-id default project (setup.sql seeds it NEUTRAL,
  // no domain/repo) is claimed in place by the first real site: same row,
  // same id - the project_id column defaults keep pointing at a real project
  // and no ghost "Your site" lingers in the switcher.
  const { data: defRow } = await db()
    .from("projects")
    .select("id, domain, github_repo")
    .eq("id", DEFAULT_PROJECT_ID)
    .maybeSingle();
  // Claiming the fixed-id seed row in place is a SELF-HOST first-boot mechanic.
  // On cloud it must never happen: the seed row is shared, so if it were ever
  // transiently neutral (re-seed, migration replay) two racing signups could
  // both "claim" it and annex the default project id + its legacy MCP_API_KEY /
  // DataForSEO fallbacks. Cloud signups always INSERT a fresh row.
  const claimDefault = !isCloudMode() && Boolean(defRow && !defRow.github_repo && !defRow.domain);
  const write = (r: Record<string, unknown>) =>
    claimDefault
      ? db().from("projects").update(r).eq("id", DEFAULT_PROJECT_ID)
      : db().from("projects").insert(r);

  let { error } = await write(row);
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
    // 0031 pending on a self-host DB - harmless to drop there (ownership is a
    // cloud concept); CLOUD_MODE deployments must have 0031 applied.
    if (error.message.includes("owner_user_id") && !isCloudMode()) {
      delete retry.owner_user_id;
      dropped = true;
    }
    if (dropped) ({ error } = await write(retry));
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

// On-the-spot liveness check for wizard step 1: a typo'd domain surfaces
// weeks later as a mystery cron failure, so the wizard refuses one it can
// prove wrong right now. The repo deliberately gets NO such check - private
// repos are the common case and answer 404 publicly, indistinguishable from
// a typo, and blocking the majority to catch the rarity read as a bug.
async function domainAnswers(domain: string): Promise<boolean> {
  for (const proto of ["https", "http"] as const) {
    try {
      await fetch(`${proto}://${domain}`, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(6000),
      });
      return true; // any HTTP answer counts - even an error page proves DNS + a server
    } catch {
      // try the next protocol
    }
  }
  return false;
}

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
// agent approvals to pending when the type's approval flag is off
// (auto_approve for guides, auto_approve_tools for tools), and the project
// repo's CI asks /api/project-mode before building or merging.
export async function setProjectMode(mode: "semi" | "auto") {
  await assertAuthed();
  if (mode !== "semi" && mode !== "auto") throw new Error("Bad mode");
  const project = await getActiveProject();
  const preset = mode === "auto" ? AUTO_PRESET : SEMI_PRESET;
  let { error } = await db()
    .from("projects")
    .update({ mode, ...preset })
    .eq("id", project.id);
  if (error && error.message.includes("auto_approve_tools")) {
    // 0028 not applied yet: drop the new flag and retry so the mode switch
    // still works in that window (effectiveAutomations defaults it to true).
    const retry: Record<string, unknown> = { mode, ...preset };
    delete retry.auto_approve_tools;
    ({ error } = await db().from("projects").update(retry).eq("id", project.id));
  }
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
    "auto_approve_tools",
    "auto_build_guides",
    "auto_build_tools",
    "auto_merge",
  ];
  if (!allowed.includes(flag)) throw new Error("Bad automation flag");
  const project = await getActiveProject();
  const next = { ...effectiveAutomations(project), [flag]: Boolean(enabled) };
  let { error } = await db()
    .from("projects")
    .update({ mode: modeForFlags(next), ...next })
    .eq("id", project.id);
  if (error && error.message.includes("auto_approve_tools")) {
    // 0028 not applied yet: drop the new flag and retry (the read side already
    // defaults it to true via effectiveAutomations).
    const retry: Record<string, unknown> = { mode: modeForFlags(next), ...next };
    delete retry.auto_approve_tools;
    ({ error } = await db().from("projects").update(retry).eq("id", project.id));
  }
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

// ---- cloud onboarding: GitHub App + Claude token + zero-touch install ------

export type ChooseRepoState = { ok: true; repo: string } | { error: string } | null;

// The cloud wizard's repo picker (c1): the App is installed, several repos
// are in scope, the owner picks one. Re-validated against the LIVE
// installation repo list - a stale or tampered client payload can only ever
// select a repo the installation really covers. Same logic backs the
// set_github_repo MCP tool.
export async function chooseGithubRepo(
  _prev: ChooseRepoState,
  formData: FormData,
): Promise<ChooseRepoState> {
  await assertAuthed();
  if (!isCloudMode()) return { error: "Self-host connects the repo in step 1 instead." };
  const repo = String(formData.get("repo") ?? "").trim();
  if (!repo) return { error: "Pick a repository." };
  const project = await getActiveProject();
  await assertProjectOwned(project.id);
  if (!project.github_installation_id) {
    return { error: "Install the DispatchSEO GitHub App first." };
  }
  const { listInstallationRepos } = await import("@/lib/github-app");
  let repos: Array<{ full_name: string }>;
  try {
    repos = await listInstallationRepos(project.github_installation_id);
  } catch {
    return { error: "Could not reach GitHub - try again." };
  }
  if (!repos.some((r) => r.full_name === repo)) {
    return { error: "That repository is not part of your DispatchSEO installation." };
  }
  const { error } = await db().from("projects").update({ github_repo: repo }).eq("id", project.id);
  if (error) return { error: error.message };
  revalidatePath("/onboarding");
  return { ok: true, repo };
}

export type ConnectClaudeState = { ok: true } | { error: string } | null;

// The cloud wizard's one unavoidable paste: the owner's `claude setup-token`
// output, written straight into their repo as the CLAUDE_CODE_OAUTH_TOKEN
// Actions secret via the App. Shape-checked only (no local Claude session
// exists here to live-verify against) - the pack's seo-token-check workflow
// verifies it for real right after the setup dispatch. Nothing is persisted
// on our side: the plaintext lives for this request alone.
export async function connectClaudeToken(
  _prev: ConnectClaudeState,
  formData: FormData,
): Promise<ConnectClaudeState> {
  await assertAuthed();
  if (!isCloudMode()) return { error: "Self-host stores the token during the terminal setup instead." };
  // Strip ALL whitespace, not just trim: terminals line-wrap long tokens and
  // the copied text carries a real newline mid-token (the known VS Code
  // terminal gotcha).
  const token = String(formData.get("token") ?? "").replace(/\s+/g, "");
  if (!token) return { error: "Paste the token that `claude setup-token` printed." };
  if (!token.startsWith("sk-ant-oat") || token.length < 60) {
    return {
      error:
        "That doesn't look like a Claude Code token (they start with sk-ant-oat). Run `claude setup-token` and copy its whole output.",
    };
  }
  const project = await getActiveProject();
  await assertProjectOwned(project.id);
  const { setRepoSecret } = await import("@/lib/github-app-secrets");
  const res = await setRepoSecret(project, "CLAUDE_CODE_OAUTH_TOKEN", token);
  if (!res.ok) return { error: `Could not store the token on your repo: ${res.error}` };
  revalidatePath("/onboarding");
  return { ok: true };
}

// The cloud finale's install trigger (c5): commits the pipeline pack into
// the connected repo through the App and fires the seo-setup workflow.
// Idempotent - c5 re-fires it on every mount/resume and each step tolerates
// having already happened (an up-to-date repo skips straight to the setup
// dispatch).
export async function runPipelineInstall(): Promise<
  { ok: true; mode: string; pr_url?: string; setup_dispatched: boolean } | { error: string }
> {
  await assertAuthed();
  if (!isCloudMode()) return { error: "Self-host installs via the terminal setup command." };
  const project = await getActiveProject();
  await assertProjectOwned(project.id);
  if (project.pipeline_installed_at) {
    return { ok: true, mode: "already-installed", setup_dispatched: false };
  }
  const { installPipelineToRepo } = await import("@/lib/pipeline-install");
  const result = await installPipelineToRepo(project);
  if (!result.ok) return { error: result.error ?? "install failed" };
  return {
    ok: true,
    mode: result.mode ?? "direct",
    pr_url: result.pr_url,
    setup_dispatched: result.setup_dispatched,
  };
}

export type WizardGscPropertyState = { ok: true } | { error: string } | null;

// The cloud wizard's inline property picker (c3): corrects onboarding's
// `sc-domain:` guess to the property the connected Google account really
// has. Validated against the live property list, same as /google's button;
// setTrackedProperty is also the set_gsc_property MCP tool's backing call.
export async function wizardSetGscProperty(
  _prev: WizardGscPropertyState,
  formData: FormData,
): Promise<WizardGscPropertyState> {
  await assertAuthed();
  const siteUrl = String(formData.get("site_url") ?? "").trim();
  if (!siteUrl) return { error: "Pick a property." };
  const project = await getActiveProject();
  if (isCloudMode()) await assertProjectOwned(project.id);
  if (!project.gsc_oauth_refresh_token) {
    return { error: "Connect Google first - then pick the property." };
  }
  const { oauthListSites, setTrackedProperty } = await import("@/lib/gsc-oauth");
  let sites: Array<{ siteUrl: string }>;
  try {
    sites = await oauthListSites(project.gsc_oauth_refresh_token);
  } catch {
    return { error: "Could not read your Search Console properties - try again." };
  }
  if (!sites.some((s) => s.siteUrl === siteUrl)) {
    return { error: "That property is not on the connected Google account." };
  }
  const err = await setTrackedProperty(project.id, siteUrl);
  if (err) return { error: err };
  revalidatePath("/onboarding");
  revalidatePath("/google");
  return { ok: true };
}

// The no-state install path: someone added the App from github.com directly
// (Marketplace, org settings), so the callback couldn't tie the installation
// to a project. The onboarding page renders a chooser; this attaches the
// verified installation to the picked project - and connects the repo too
// when the installation covers exactly one.
export async function attachGithubInstallation(projectSlug: string, installationId: number) {
  await assertAuthed();
  if (!isCloudMode()) throw new Error("Cloud only");
  const project = await getProjectBySlug(projectSlug);
  if (!project) throw new Error("Unknown project");
  await assertProjectOwned(project.id);
  // Installation ids are enumerable integers - refuse one already bound to
  // another tenant (see assertInstallationClaimable).
  await assertInstallationClaimable(installationId);
  const { getInstallation, listInstallationRepos } = await import("@/lib/github-app");
  if (!(await getInstallation(installationId))) {
    throw new Error("That installation does not belong to the DispatchSEO app");
  }
  const row: Record<string, unknown> = {
    github_installation_id: installationId,
    github_app_installed_at: new Date().toISOString(),
  };
  try {
    const repos = await listInstallationRepos(installationId);
    if (repos.length === 1 && !project.github_repo) row.github_repo = repos[0].full_name;
  } catch {
    // repo list is a nicety here - the wizard's picker covers it
  }
  const { error } = await db().from("projects").update(row).eq("id", project.id);
  if (error) throw new Error(error.message);
  revalidatePath("/onboarding");
  redirect("/onboarding");
}
