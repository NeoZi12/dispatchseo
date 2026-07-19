// One-time (rerunnable) tools backfill: registers the clockedcode free tools
// that shipped BEFORE the DispatchSEO pipeline existed, so the Tools page and
// the Traffic by tool tables show the whole catalog, not just pipeline-built
// tools. Deliberately excludes the usagecut tool (separate product surface).
//
// Upserts on (project_id, url) semantics by checking for an existing row
// first, so rerunning is harmless and pipeline-logged rows are never touched.
//
// Dates are the tools' real ship dates from clockedcode's src/lib/tools.ts
// registry (addedOn), so the Published column is honest and the
// Get-it-on-Google queue window applies to them exactly as it would have.
//
// Run from the repo root:  node --env-file=.env.local scripts/backfill-tools.mjs

import { createClient } from "@supabase/supabase-js";

const PROJECT_SLUG = "clockedcode";

// slug, title, keyword, shipped - mirrored from clockedcode src/lib/tools.ts
const TOOLS = [
  {
    url: "https://clockedcode.com/tools/claude-md-generator",
    title: "Claude MD Generator - Free CLAUDE.md in 30 Seconds",
    primary_keyword: "claude md generator",
    shipped: "2026-07-12",
  },
  {
    url: "https://clockedcode.com/tools/claude-code-templates",
    title: "Claude Code Templates - 14 Copy-Paste Configs",
    primary_keyword: "claude code templates",
    shipped: "2026-07-09",
  },
];

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

const db = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

const { data: project, error: projErr } = await db
  .from("projects")
  .select("id")
  .eq("slug", PROJECT_SLUG)
  .single();
if (projErr) throw new Error(`project lookup: ${projErr.message}`);

for (const t of TOOLS) {
  const { data: existing, error: selErr } = await db
    .from("pages")
    .select("id")
    .eq("project_id", project.id)
    .eq("url", t.url)
    .maybeSingle();
  if (selErr) throw new Error(`${t.url}: ${selErr.message}`);
  if (existing) {
    console.log(`skip (already registered): ${t.url}`);
    continue;
  }

  const ts = `${t.shipped}T08:00:00Z`;
  const { error: insErr } = await db.from("pages").insert({
    project_id: project.id,
    url: t.url,
    title: t.title,
    primary_keyword: t.primary_keyword,
    type: "tool",
    created_at: ts,
    published_at: ts,
  });
  if (insErr) throw new Error(`${t.url}: ${insErr.message}`);
  console.log(`registered: ${t.url} (shipped ${t.shipped})`);
}

console.log("done");
