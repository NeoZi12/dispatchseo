// LEGACY (SETUP_PATH_LEGACY=1 only): the old cloud wizard's server-side
// resume, moved out of /onboarding/page.tsx when the setup path replaced the
// wizard mount [R23]. It is the only reader of `onboarding_screen` for the
// cloud wizard; the setup path never reads it. Deleted together with
// cloud-onboarding-wizard.tsx in the legacy-cleanup session.

import { db } from "@/lib/db";
import { getActiveProjectOrNull } from "@/lib/active-project";
import { fetchProjectToken, publishTarget } from "@/lib/projects";
import { connectionSummary } from "@/lib/wordpress-connect";
import { aiKind, aiStep, firstStepAfterCreate, siteStep } from "@/lib/wizard-branch";
import { projectAgent } from "@/lib/agents";
import type { CloudWizardResume } from "@/components/cloud-onboarding-wizard";
import { CLOUD_WIZARD_SCREENS } from "@/lib/wizard-screens";

// The cloud wizard's resume: everything c0-c5 needs to re-render mid-flow
// after a reload or an external roundtrip (App install, Google OAuth). Live
// GitHub/Google lists are fetched only in the states that render a picker,
// and every remote read fails soft - resume is a nicety, never a blocker.
export async function buildCloudResume(): Promise<CloudWizardResume | null> {
  const project = await getActiveProjectOrNull();
  if (!project) return null;
  let savedScreen: string | null = null;
  try {
    const { data } = await db()
      .from("projects")
      .select("onboarding_screen")
      .eq("id", project.id)
      .maybeSingle();
    savedScreen = (data as { onboarding_screen?: string | null } | null)?.onboarding_screen ?? null;
  } catch {
    savedScreen = null;
  }
  // Default to c1, NOT c5. The finale auto-fires runPipelineInstall on mount
  // (cloud-onboarding-wizard.tsx), which commits the pipeline pack into the
  // project's repo, writes the SEO_MCP_API_KEY secret, and dispatches a
  // workflow - so "we don't know which screen this project was on" used to
  // resolve to the single most destructive one. Any project that never went
  // through THIS wizard has a null onboarding_screen: every self-host-era
  // project, every row created before screen persistence, every project added
  // outside the wizard. Loading /onboarding then wrote into its repo without
  // anyone pressing a button - it tried to commit into a live clockedcode.com
  // repo and was saved only by that project having no GitHub App installed
  // (2026-07-26). c5 is now reachable only when it was EXPLICITLY saved, i.e.
  // when someone actually walked the wizard to the end.
  // Which of the three setups this project is on. Everything below - the
  // default screen, which stale screens get corrected, whether a missing repo
  // is a problem at all - follows from these two.
  const target = publishTarget(project);
  const kind = aiKind(project.ai_choice);
  const branchDefault = firstStepAfterCreate(target, kind);
  const saved =
    savedScreen && (CLOUD_WIZARD_SCREENS as readonly string[]).includes(savedScreen)
      ? (savedScreen as CloudWizardResume["screen"])
      : branchDefault;
  // Never resume INTO c0 - the project exists. For a GitHub project this is
  // the same "c1" it always was; for the others it is their own first step.
  let screen = saved === "c0" ? branchDefault : saved;

  // A screen saved from the WRONG branch, corrected to this branch's
  // equivalent. It happens for one mundane reason: createProjectCore stamps
  // "c1" on every cloud row at creation, before the wizard's own write records
  // which route the owner picked - so a reload in that window would land a
  // WordPress owner on "Connect GitHub", the screen this whole flow exists to
  // keep them off. Same correction covers a route changed later from Settings.
  const mySite = siteStep(target);
  const myAi = aiStep(target, kind);
  if ((screen === "c1" || screen === "c1w") && screen !== mySite) screen = mySite ?? myAi;
  if ((screen === "c2" || screen === "c2a" || screen === "c2c") && screen !== myAi) screen = myAi;

  // Same reasoning from the other direction, kept as a second gate: c5 requires
  // a connected repo and c2-c4 are only reachable after one is chosen, so with
  // no github_repo the only honest resume is c1. Originally the safety net for
  // lost screen persistence - the "Install the App" link is a full-page
  // navigation that can cancel the in-flight setWizardScreen("c1") POST,
  // leaving onboarding_screen null -> a finale that instantly errored "no repo
  // connected" (2026-07-23). The default above now covers that case too; this
  // stays because a saved c2-c5 on a repo-less project must still land at c1.
  //
  // GITHUB PROJECTS ONLY. WordPress and manual sites have no repo by design,
  // and their site step is skippable on purpose (a WordPress password nobody
  // has to hand must not trap a paying owner on step 1), so forcing them back
  // would be a loop with no exit.
  if (target === "github" && !project.github_repo) screen = "c1";

  let installationRepos: string[] | null = null;
  if (project.github_installation_id && !project.github_repo) {
    try {
      const { listInstallationRepos } = await import("@/lib/github-app");
      installationRepos = (await listInstallationRepos(project.github_installation_id)).map(
        (r) => r.full_name,
      );
    } catch {
      installationRepos = null;
    }
  }

  let gscSites: string[] | null = null;
  if (project.gsc_oauth_refresh_token) {
    try {
      const { oauthListSites } = await import("@/lib/gsc-oauth");
      gscSites = (await oauthListSites(project.gsc_oauth_refresh_token)).map((s) => s.siteUrl);
    } catch {
      gscSites = null;
    }
  }

  // The same summary Settings renders from, so "connected" means exactly one
  // thing across the product (a url AND a stored password) and the wizard can
  // never disagree with the screen the owner is sent to next.
  const wp = connectionSummary(project);

  return {
    screen,
    created: { slug: project.slug, name: project.name, domain: project.domain },
    githubRepo: project.github_repo,
    installationId: project.github_installation_id,
    installationRepos,
    gscConnected: Boolean(project.gsc_oauth_refresh_token),
    gscSites,
    gscSiteUrl: project.gsc_site_url,
    mode: project.mode,
    // Through projectAgent() rather than project.agent directly: a database
    // that has not run 0044 reads the column back as undefined, and the picker
    // needs a real id to check a radio against.
    agent: projectAgent(project).id,
    publishTarget: target,
    aiChoice: project.ai_choice,
    wpConnected: wp.connected,
    wp: {
      url: wp.url,
      username: wp.username,
      seoPlugin: wp.seo_plugin,
      canPublish: Boolean(wp.capabilities?.publish_posts),
      canUploadMedia: Boolean(wp.capabilities?.upload_files),
    },
    // Fetched here rather than on the two screens that need it because they
    // are client components with no way to read it. Never rendered outside
    // c2a/c2c - the connect command and the connector URL both ARE the key.
    mcpToken: await fetchProjectToken(project.id),
    chatSeen: Boolean(project.chat_last_seen_at),
  };
}
