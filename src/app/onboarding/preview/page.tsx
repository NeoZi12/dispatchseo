import { notFound } from "next/navigation";
import { computeSetupStep, type SetupSnapshot } from "@/lib/setup-path-core";
import { allFixtures, deferral, variants } from "@/components/setup-path/fixtures";
import { PreviewGallery, type PreviewFrame, type PreviewGroup } from "./gallery";

// Dev-only design review of the setup path: every state of every branch,
// rendered from the synthetic fixtures (src/components/setup-path/fixtures.ts)
// through the real engine and the real card. NOTHING here reads or writes the
// database - local dev talks to the LIVE Supabase, so the card runs with
// `preview` on (no actions, no polls, no navigation) and every prop is
// derived from the fixture snapshot.
//
//   /onboarding/preview                    gallery, github x coding
//   /onboarding/preview?branch=wordpress_chat
//   /onboarding/preview?mode=hero          force a mode for every frame
//   /onboarding/preview?step=github_coding.agent_credential   one state alone

export const metadata = { title: "Setup path preview" };

const GROUPS: { id: PreviewGroup; label: string }[] = [
  { id: "github_coding", label: "GitHub · coding agent" },
  { id: "github_chat", label: "GitHub · Claude app" },
  { id: "wordpress_coding", label: "WordPress · coding agent" },
  { id: "wordpress_chat", label: "WordPress · Claude app" },
  { id: "manual_coding", label: "Manual · coding agent" },
  { id: "manual_chat", label: "Manual · Claude app" },
  { id: "variants", label: "Variants" },
  { id: "deferral", label: "Deferral" },
  { id: "legacy", label: "Legacy rows" },
];

const SAMPLE_REPOS = ["acme/site", "acme/marketing-site", "acme/docs"];
const SAMPLE_PROPERTIES = ["https://www.acme.com/", "sc-domain:acme-old.com", "https://blog.acme.com/"];

function agentOf(s: SetupSnapshot): string {
  const p = s.project;
  if (p?.agent) return p.agent;
  const ai = p?.ai_choice ?? s.branch_hint?.ai_choice;
  return ai === "codex" || ai === "cursor" ? ai : "claude";
}

function frameFrom(name: string, snapshot: SetupSnapshot, expect: string | null, note: string | null): PreviewFrame {
  const step = computeSetupStep(snapshot);
  const p = snapshot.project;
  const [group, ...rest] = name.split(".");
  return {
    name,
    group: group as PreviewGroup,
    label: rest.join("."),
    expect,
    note,
    step,
    props: {
      slug: p?.slug ?? null,
      origin: snapshot.origin,
      agentId: agentOf(snapshot),
      token: snapshot.mcpToken,
      wp: {
        connected: Boolean(p?.wp_connected),
        url: p?.wp_connected ? "https://acme.com" : null,
        username: p?.wp_connected ? "editor" : null,
        seoPlugin: null,
        canPublish: true,
        canUploadMedia: true,
      },
      repos: p?.installation_repo_count === 0 ? [] : SAMPLE_REPOS,
      gscSites: p?.gsc_property_count === 0 ? [] : SAMPLE_PROPERTIES,
      gscSiteUrl: p?.gsc_site_url ?? null,
      qualifier: snapshot.branch_hint ?? null,
      serverNow: snapshot.now,
    },
  };
}

export default async function SetupPathPreview({
  searchParams,
}: {
  searchParams: Promise<{ step?: string; branch?: string; mode?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;

  const notes: Record<string, string> = {};
  for (const [k, v] of Object.entries(variants)) notes[`variants.${k}`] = v.note;
  for (const [k, v] of Object.entries(deferral)) notes[`deferral.${k}`] = v.note;

  const frames = allFixtures().map((f) => frameFrom(f.name, f.snapshot, f.expect, notes[f.name] ?? null));
  const mode = params.mode === "screen" || params.mode === "hero" ? params.mode : null;

  if (params.step) {
    // A full fixture name, or a bare step id (its first fixture).
    const one =
      frames.find((f) => f.name === params.step) ??
      frames.find((f) => f.step.id === params.step || f.label === params.step);
    if (!one) notFound();
    return <PreviewGallery groups={GROUPS} group={one.group} frames={[one]} mode={mode} single />;
  }

  const group = (GROUPS.find((g) => g.id === params.branch)?.id ?? "github_coding") as PreviewGroup;
  return (
    <PreviewGallery
      groups={GROUPS}
      group={group}
      frames={frames.filter((f) => f.group === group)}
      mode={mode}
      counts={Object.fromEntries(GROUPS.map((g) => [g.id, frames.filter((f) => f.group === g.id).length]))}
    />
  );
}
