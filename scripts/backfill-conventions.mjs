// One-time backfill: mirror clockedcode's .dispatchseo/conventions.md facts
// into the conventions table via the set_conventions MCP tool, so the
// dashboard's Instructions page shows the personalized section without
// waiting for the next /seo-setup run. Requires migration 0012 applied. Run:
//   node --env-file=.env.local scripts/backfill-conventions.mjs [base-url]

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const base = process.argv[2] ?? "http://localhost:3000";
const token = process.env.MCP_API_KEY;
if (!token) {
  console.error("Missing MCP_API_KEY in .env.local");
  process.exit(1);
}

const transport = new StreamableHTTPClientTransport(new URL(`${base}/api/mcp`), {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
});
const client = new Client({ name: "conventions-backfill", version: "1.0.0" });
await client.connect(transport);

const res = await client.callTool({
  name: "set_conventions",
  arguments: {
    product_summary:
      "ClockedCode - a curated Claude Code setup (vetted tools, subagents, skills, and a tuned CLAUDE.md) compiled into one master prompt developers paste once. One-time $39, lifetime updates.",
    stack: "Next.js App Router + MDX content, TypeScript, Tailwind",
    package_manager: "pnpm",
    build_command: "pnpm build",
    guides_dir: "src/content/blog/<slug>.mdx",
    tools_wiring:
      "FreeTool entry in src/lib/tools.ts + \"use client\" widget in src/components/tools/ registered in TOOL_WIDGETS (build fails without it)",
    theme_tokens: [
      { name: "cream", value: "#f5f3ec" },
      { name: "ink", value: "#131211" },
      { name: "base", value: "#1c1a18" },
      { name: "panel", value: "#252320" },
      { name: "line", value: "#33312d" },
      { name: "muted", value: "#9b958c" },
      { name: "clay", value: "#c96442" },
      { name: "clay-soft", value: "#d77e5c" },
      { name: "iris", value: "#8fa7c9" },
      { name: "amber", value: "#cf9156" },
      { name: "sage", value: "#8a9b6e" },
      { name: "rose", value: "#cf8aa4" },
      { name: "grove", value: "#5cae74" },
    ],
    fonts: ["Geist-style sans (--font-sans)", "mono for microtype labels"],
    voice_rules: [
      "First-person practitioner, plain English",
      "Author: Neo Zino",
      "Never em-dashes or en-dashes - regular hyphens only",
      "Humanizer pass mandatory (in-repo skill)",
      "Widget microcopy: meaning first, mechanism in the hint",
    ],
    exemplar_guides: ["2 recent posts from src/content/blog/ closest in shape to the topic"],
    exemplar_visuals: [
      "WhereEachWins.tsx (comparison split)",
      "BenchmarkScorecard.tsx (data scorecard)",
      "StatCallout.tsx / ContextBudget.tsx (smaller shapes)",
    ],
    tool_reference: "claude-md-generator (wizard archetype); claude-code-templates page (library archetype)",
    analytics: 'track("<feature>_<verb>") snake_case via src/lib/analytics.ts, real milestones only',
    notes:
      "Brand logomarks in src/components/blog/BrandMarks.tsx (extend in style when missing); color key: warm clay = Claude Code, cool iris = the challenger. Full facts: .dispatchseo/conventions.md in the repo.",
  },
});

const payload = JSON.parse(res.content[0].text);
if (res.isError || payload.error) {
  console.error("FAILED:", payload.error ?? payload);
  console.error("(Is migration 0012_conventions.sql applied to Supabase?)");
  process.exit(1);
}
console.log("Saved:", payload);
await client.close();
