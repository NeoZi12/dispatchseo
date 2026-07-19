import { db } from "./db";
import { DEFAULT_PROJECT_SLUG, type Project } from "./projects";

// The product identity the playbook personalizes from. One row per project in
// the site_profile table (written by the /seo-setup agent command through the
// set_site_profile MCP tool). ClockedCode falls back to its baked-in profile
// when the row doesn't exist yet; any other project falls back to a skeleton
// built from its project row, and the dashboard shows the "run /seo-setup"
// card until the real profile lands (fromDb=false).

export type SiteProfile = {
  name: string;
  url: string;
  tagline: string; // <= 60 chars
  short: string; // <= 160 chars
  long: string; // 300-600 chars
  categories: string[];
  tags: string[];
};

export const FALLBACK_PROFILE: SiteProfile = {
  name: "ClockedCode",
  url: "https://clockedcode.com",
  tagline: "Upgrade your Claude Code setup in one paste",
  short:
    "A curated Claude Code setup: vetted tools, subagents, and a tuned CLAUDE.md, compiled into one master prompt you paste once. One-time $39, lifetime access.",
  long:
    "ClockedCode upgrades a developer's Claude Code setup in one paste. You get a curated, continuously updated set of vetted tools, subagents, and CLAUDE.md instructions - the stuff power users assemble by hand over months - compiled into a single master prompt. Check off what you want, paste once, and your Claude Code works like a senior engineer's. One-time $39 purchase, lifetime updates, and a free tips library at clockedcode.com/free.",
  categories: ["Developer Tools", "AI", "Productivity"],
  tags: ["claude-code", "ai-coding", "developer-tools", "cli", "anthropic"],
};

// What a project looks like before /seo-setup has researched it: real name
// and url from the project row, everything else empty so the playbook copy
// never invents product claims.
function skeletonProfile(project: Project): SiteProfile {
  return {
    name: project.name,
    url: `https://${project.domain}`,
    tagline: "",
    short: "",
    long: "",
    categories: [],
    tags: [],
  };
}

export async function loadSiteProfile(
  project: Project,
): Promise<{ profile: SiteProfile; fromDb: boolean }> {
  const { data, error } = await db()
    .from("site_profile")
    .select("name, url, tagline, short_description, long_description, categories, tags")
    .eq("project_id", project.id)
    .maybeSingle();
  if (error || !data) {
    return {
      profile:
        project.slug === DEFAULT_PROJECT_SLUG ? FALLBACK_PROFILE : skeletonProfile(project),
      fromDb: false,
    };
  }
  return {
    fromDb: true,
    profile: {
      name: data.name,
      url: data.url,
      tagline: data.tagline,
      short: data.short_description,
      long: data.long_description,
      categories: data.categories ?? [],
      tags: data.tags ?? [],
    },
  };
}
