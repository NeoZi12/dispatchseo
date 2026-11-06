// What a hosted article really costs, read from the ledger. READ-ONLY: it
// selects from writer_runs, model_calls and projects and writes nothing, so
// it is safe against production.
//
//   node --env-file=.env.local scripts/writer-bakeoff.mjs [--since 2026-11-06] [--project <slug>] [--watch]
//
//   --since    window start (ISO date or datetime). Default: the last 7 days.
//   --project  one site's slug. Default: every site.
//   --watch    re-print every 60 s (Ctrl-C to stop).
//
// Per run: site, writer model, status, stage, run cost, ledger cost by slot,
// patches, verify passes, judge calls, failure class. Then the headline:
// runs, published, failed by class, cost per PUBLISHED article (every
// failure's spend included - the number the $0.15 target is about), and the
// p50/p95 run cost. "Published" = the run handed off a draft (status done).
// A bake-off is two windows: run with WRITER_WRITER=opus, note the time,
// switch back, and compare --since before and after.

import { createClient } from "@supabase/supabase-js";

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const since = arg("since") ? new Date(arg("since")) : new Date(Date.now() - 7 * 86_400_000);
if (Number.isNaN(since.getTime())) {
  console.error(`--since ${arg("since")} is not a date`);
  process.exit(1);
}
const projectSlug = arg("project");
const watch = process.argv.includes("--watch");

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SECRET_KEY (run with --env-file=.env.local)");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

/** Every row of a query, past PostgREST's 1,000-row page. */
async function all(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

/** One word for why a run ended without an article. */
function failureClass(r) {
  const e = `${r.error ?? ""} ${r.park_reason ?? ""}`.toLowerCase();
  if (r.unreadable === "true" || /could (?:not )?be read|could not read any/.test(e)) return "serp-unreadable";
  if (r.failure_kind === "infra") return "infra";
  if (/spend cap/.test(e)) return "spend-cap";
  if (/no time left|not enough time left/.test(e)) return "time";
  if (/no source supports|contradicts its source|is not stated by|no source passage states|figure/.test(e)) return "fact-gate";
  if (/\bwords?\b|too long|word count/.test(e)) return "length";
  if (/same topic|already in flight|another run is already/.test(e)) return "duplicate";
  if (/off-topic|blocked/.test(e)) return "off-topic";
  if (/gain|beat page one/.test(e)) return "no-gain";
  if (/facts|source/.test(e)) return "thin-research";
  return r.failure_kind === "content" ? "content-other" : "other";
}

const pct = (xs, p) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const usd = (n) => `$${n.toFixed(3)}`;
const pad = (v, n) => String(v).padEnd(n).slice(0, n);
const SLOTS = ["writer", "planner", "patcher", "judge", "extractor", "illustrator"];

async function report() {
  let projectId = null;
  const projects = await all(() => db.from("projects").select("id, slug"));
  const slugOf = new Map(projects.map((p) => [p.id, p.slug]));
  if (projectSlug) {
    projectId = projects.find((p) => p.slug === projectSlug)?.id ?? null;
    if (!projectId) throw new Error(`no project with slug "${projectSlug}"`);
  }
  // Only the stage_outputs keys this report reads: the whole bag carries the
  // fact sheet and every draft, megabytes for a week of runs.
  const runs = await all(() => {
    let q = db
      .from("writer_runs")
      .select(
        "id, project_id, status, stage, cost_usd, error, created_at, patches:stage_outputs->>patch_attempts, passes:stage_outputs->>verify_passes, failure_kind:stage_outputs->>failure_kind, park_reason:stage_outputs->>park_reason, unreadable:stage_outputs->>unreadable_serp, waiting:stage_outputs->waiting_on_agent",
      )
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: true });
    if (projectId) q = q.eq("project_id", projectId);
    return q;
  });
  const bySlot = new Map(runs.map((r) => [r.id, { judgeCalls: 0, writerModel: null, slots: Object.fromEntries(SLOTS.map((s) => [s, 0])) }]));
  const ids = runs.map((r) => r.id);
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const calls = await all(() => db.from("model_calls").select("run_id, slot, provider, model, cost_microusd, ok").in("run_id", chunk).order("created_at", { ascending: true }));
    for (const c of calls) {
      const b = bySlot.get(c.run_id);
      if (!b) continue;
      b.slots[c.slot] = (b.slots[c.slot] ?? 0) + (c.cost_microusd ?? 0) / 1e6;
      if (c.slot === "judge") b.judgeCalls++;
      if (c.slot === "writer" && c.ok) b.writerModel = c.provider === "subscription" ? "subscription" : c.model;
    }
  }

  const lines = [];
  lines.push(`Writer runs since ${since.toISOString().slice(0, 16)}Z${projectSlug ? ` for ${projectSlug}` : ""} (read at ${new Date().toISOString().slice(11, 19)}Z)`);
  lines.push("");
  lines.push(
    [pad("started", 11), pad("site", 14), pad("writer", 18), pad("status", 8), pad("stage", 8), pad("run $", 7), ...SLOTS.map((s) => pad(s.slice(0, 7), 7)), pad("ptch", 4), pad("pass", 4), pad("jdg", 4), "class"].join(" "),
  );
  const costs = [];
  const failed = {};
  let published = 0;
  let running = 0;
  let spent = 0;
  for (const r of runs) {
    const b = bySlot.get(r.id);
    const cost = Number(r.cost_usd ?? 0);
    const cls = r.status === "failed" ? failureClass(r) : r.status === "running" ? (r.waiting ? "waiting-agent" : "running") : "";
    if (r.status === "done") published++;
    if (r.status === "running") running++;
    if (r.status === "failed") failed[cls] = (failed[cls] ?? 0) + 1;
    if (r.status !== "running") {
      costs.push(cost);
      spent += cost;
    }
    lines.push(
      [
        pad(r.created_at.slice(5, 16).replace("T", " "), 11),
        pad(slugOf.get(r.project_id) ?? r.project_id.slice(0, 8), 14),
        pad((b.writerModel ?? "-").replace(/^claude-/, ""), 18),
        pad(r.status, 8),
        pad(r.stage, 8),
        pad(cost.toFixed(3), 7),
        ...SLOTS.map((s) => pad(b.slots[s] ? b.slots[s].toFixed(3) : "-", 7)),
        pad(r.patches ?? "-", 4),
        pad(r.passes ?? "-", 4),
        pad(b.judgeCalls || "-", 4),
        cls,
      ].join(" "),
    );
  }
  const finished = runs.length - running;
  lines.push("");
  lines.push(`runs ${runs.length} (finished ${finished}, running ${running}) · published ${published} · failed ${finished - published}`);
  lines.push(`failed by class: ${Object.entries(failed).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}`);
  lines.push(`spent on finished runs ${usd(spent)} · cost per PUBLISHED article ${published ? usd(spent / published) : "n/a (nothing published)"} · failure rate ${finished ? Math.round(((finished - published) / finished) * 100) : 0}%`);
  lines.push(`run cost p50 ${usd(pct(costs, 50))} · p95 ${usd(pct(costs, 95))}`);
  const slotTotals = SLOTS.map((s) => [s, runs.reduce((a, r) => a + (bySlot.get(r.id).slots[s] ?? 0), 0)]);
  lines.push(`ledger by slot: ${slotTotals.map(([s, v]) => `${s} ${usd(v)}`).join(" · ")}`);
  return lines.join("\n");
}

if (watch) {
  for (;;) {
    try {
      const out = await report();
      process.stdout.write("\x1b[2J\x1b[H" + out + "\n");
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
    }
    await new Promise((r) => setTimeout(r, 60_000));
  }
} else {
  console.log(await report());
}
