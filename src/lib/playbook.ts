// The backlink playbook: curated foundational-backlink opportunities (free)
// and ROI-ranked legit paid placements, each with prefilled submission copy,
// plain-English steps, and a paste-ready Claude for Chrome command. The
// curated lists live in playbook-data.ts (researched + URL-verified 2026-07-13);
// this file holds the shapes and the personalization layer.
//
// Personalization: field values reference the site profile (site-profile.ts)
// instead of hardcoding product copy, so the same registry serves any product
// once its profile row exists - the multi-tenant path is "new profile row",
// not "rewrite the registry".

import type { SiteProfile } from "./site-profile";

// A profile-driven field either pulls a profile key directly (`from`) or is a
// literal template (`value`) that may embed {name} {url} {tagline} {short}
// {long} placeholders.
export type PlaybookField = {
  label: string; // the form field on the target site, e.g. "Tagline (60 chars)"
  from?: "name" | "url" | "tagline" | "short" | "long" | "categories" | "tags";
  value?: string;
};

export type PlaybookItem = {
  slug: string; // stable id, used as playbook_status primary key
  name: string;
  kind: "free" | "paid";
  price: string | null; // paid items: "$39 one-time" etc; free items: null
  url: string; // homepage
  submitUrl: string; // where the submission actually starts (verified live)
  linkType: "dofollow" | "nofollow" | "mixed" | "unverified";
  worth: string; // one honest line: why this is (or isn't) worth the effort
  effortMins: number; // realistic hands-on time
  requiresAccount: boolean;
  fields: PlaybookField[]; // prefilled copy to paste into the form
  steps: string[]; // plain-English, numbered in the UI
  notes: string | null; // gotchas: approval time, reciprocal-link conditions
};

export function resolveField(profile: SiteProfile, field: PlaybookField): string {
  if (field.from) {
    const v = profile[field.from];
    return Array.isArray(v) ? v.join(", ") : v;
  }
  return (field.value ?? "")
    .replaceAll("{name}", profile.name)
    .replaceAll("{url}", profile.url)
    .replaceAll("{tagline}", profile.tagline)
    .replaceAll("{short}", profile.short)
    .replaceAll("{long}", profile.long);
}

// ---------- Claude for Chrome command ----------
// One paste in the VS Code extension prompt box (@browser ...) has Claude fill
// the whole form. Deliberately stops before the final submit so the user
// reviews before anything goes live, and assumes the user logged in themselves
// (automated sign-ins trip bot detection).

export function browserCommand(profile: SiteProfile, item: PlaybookItem): string {
  const fieldList = item.fields
    .map((f) => `${f.label}: ${JSON.stringify(resolveField(profile, f))}`)
    .join("; ");
  return (
    `@browser open ${item.submitUrl} and fill the submission form for my product ${profile.name} (${profile.url}). ` +
    `Use these values - ${fieldList}. ` +
    `If a field I listed is missing on the page, skip it; fill any other required field sensibly from the same info. ` +
    `Do NOT log in or create an account (I am already signed in). ` +
    `STOP before the final submit/publish button and let me review.`
  );
}
