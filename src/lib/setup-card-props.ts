// The server-loaded props <SetupStepCard> needs beyond the step itself.
//
// The step JSON deliberately carries no repo list, Search Console property
// list or WordPress status (the poll returns it every 5 s; those are live
// remote reads or project columns). The server surfaces that render the card
// - /onboarding (mode "screen") and the Home hero (mode "hero") - load them
// here, and ONLY for the step that renders them, so a page render never calls
// GitHub or Google for a step that does not show their answer.
//
// Server-only (db via projects.ts, GitHub, Google). Every remote read fails
// soft to null: the forms render their own "reload" state for an unknown list.

import { fetchProjectToken, type Project } from "@/lib/projects";
import { connectionSummary } from "@/lib/wordpress-connect";
import { projectAgent } from "@/lib/agents";
import type { SetupStep } from "@/lib/setup-path-core";
import type { WordPressStatus } from "@/components/wordpress-connect";

export type SetupCardServerProps = {
  agentId: string;
  token: string | null;
  wp: WordPressStatus | null;
  repos: string[] | null;
  gscSites: string[] | null;
  gscSiteUrl: string | null;
};

/** Does this step render the installation repo pick? */
function needsRepos(step: SetupStep): boolean {
  if (step.primary.kind !== "form" || step.primary.form !== "github_repo") return false;
  return step.id === "github_repo" || step.id === "let_us_publish";
}

export async function loadSetupCardProps(
  project: Project,
  step: SetupStep,
): Promise<SetupCardServerProps> {
  const out: SetupCardServerProps = {
    // Through projectAgent(): a pre-0044 row reads `agent` back undefined.
    agentId: projectAgent(project).id,
    token: null,
    wp: null,
    repos: null,
    gscSites: null,
    gscSiteUrl: project.gsc_site_url ?? null,
  };

  if (step.id === "wordpress") {
    // The same summary Settings renders from, so "connected" means one thing.
    const wp = connectionSummary(project);
    out.wp = {
      connected: wp.connected,
      url: wp.url,
      username: wp.username,
      seoPlugin: wp.seo_plugin,
      canPublish: Boolean(wp.capabilities?.publish_posts),
      canUploadMedia: Boolean(wp.capabilities?.upload_files),
    };
  }

  if (step.id === "agent_connect" || step.id === "chat_connect") {
    // The paste payload IS the key; never fetched for any other step.
    out.token = await fetchProjectToken(project.id);
  }

  if (needsRepos(step) && project.github_installation_id) {
    try {
      const { listInstallationRepos } = await import("@/lib/github-app");
      out.repos = (await listInstallationRepos(project.github_installation_id)).map((r) => r.full_name);
    } catch {
      out.repos = null;
    }
  }

  if (step.id === "gsc_property" && project.gsc_oauth_refresh_token) {
    try {
      const { oauthListSites } = await import("@/lib/gsc-oauth");
      out.gscSites = (await oauthListSites(project.gsc_oauth_refresh_token)).map((s) => s.siteUrl);
    } catch {
      out.gscSites = null;
    }
  }

  return out;
}
