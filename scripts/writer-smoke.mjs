// Smoke-test for the hosted writer (src/lib/writer/): starts a run through the
// write_article MCP tool, then drives the jobs cron until the run reaches a
// terminal state, printing each stage as it lands. Run:
//   WRITER_DRY_RUN=1 node --env-file=.env.local scripts/writer-smoke.mjs [base-url] [keyword]
// The third argument may also be a suggestion id (uuid) to write a queued idea.
// base-url defaults to http://localhost:3000 (needs `pnpm dev` running with the
// same WRITER_DRY_RUN in its environment - the flag is read server-side; the
// script checks get_writer_runs' dry_run flag and refuses to start a paid
// run when the two disagree).
// Needs MCP_API_KEY and CRON_SECRET in .env.local, and migrations 0064 + 0067
// applied. It writes a real writer_runs row (and, in dry run, a draft the
// dry-guard keeps off every site) to whatever database the server uses.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const base = process.argv[2] ?? "http://localhost:3000";
const keyword = process.argv[3] ?? "writer smoke test keyword";
const token = process.env.MCP_API_KEY;
const cronSecret = process.env.CRON_SECRET;
if (!token || !cronSecret) {
  console.error("Missing MCP_API_KEY or CRON_SECRET in .env.local");
  process.exit(1);
}

const transport = new StreamableHTTPClientTransport(new URL(`${base}/api/mcp`), {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
});
const client = new Client({ name: "writer-smoke-test", version: "1.0.0" });
await client.connect(transport);

const call = async (name, args) => {
  const res = await client.callTool({ name, arguments: args });
  const payload = JSON.parse(res.content[0].text);
  if (res.isError) throw new Error(`${name}: ${JSON.stringify(payload)}`);
  return payload;
};

// A dry-run smoke against a live server would spend real money (and the
// reverse would test nothing): both sides must agree before anything starts.
const wantDry = process.env.WRITER_DRY_RUN === "1";
const listed = await call("get_writer_runs", { limit: 1 });
if (Boolean(listed.dry_run) !== wantDry) {
  console.error(`✗ the server's WRITER_DRY_RUN is ${listed.dry_run ? "on" : "off"} but this script's is ${wantDry ? "on" : "off"}; start both the same way`);
  await client.close();
  process.exit(1);
}

const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(keyword);
const started = await call("write_article", isUuid ? { suggestion_id: keyword } : { keyword });
console.log(`✓ run ${started.run_id} started (stage ${started.stage})`);

const drain = async () => {
  const res = await fetch(`${base}/api/cron/jobs`, { headers: { Authorization: `Bearer ${cronSecret}` } });
  return res.json();
};

let last = "";
for (let tick = 0; tick < 40; tick++) {
  const drained = await drain();
  const run = await call("get_writer_runs", { run_id: started.run_id });
  const line = `${run.stage}/${run.status} rewrites=${run.rewrites} cost=$${Number(run.cost_usd).toFixed(4)}`;
  if (line !== last) {
    console.log(`  tick ${tick}: ${line}${drained.by_kind ? " " + JSON.stringify(drained.by_kind) : ""}`);
    last = line;
  }
  if (run.status !== "running") {
    const so = run.stage_outputs ?? {};
    console.log(run.status === "failed" ? `✗ failed (${so.failure_kind ?? "unclassified"}): ${run.error}` : `✓ ${run.status}; draft ${run.draft_id ?? "(none)"}`);
    const unread = so.research?.unread ?? so.unread ?? [];
    if (unread.length) console.log(`  unread: ${unread.map((u) => `${u.reason} ${u.url}`).join("; ")}`);
    if (so.research?.sheet) console.log(`  sheet: ${so.research.sheet.sources?.length ?? 0} source(s), ${so.research.sheet.facts?.length ?? 0} fact(s)`);
    const v = so.verify;
    if (v?.ledger) {
      const by = v.ledger.reduce((m, l) => ({ ...m, [l.verdict]: (m[l.verdict] ?? 0) + 1 }), {});
      console.log(`  ledger: ${v.ledger.length} claim(s) judged ${JSON.stringify(by)}${v.claims_unchecked ? `, ${v.claims_unchecked} unchecked` : ""}`);
    }
    if (v?.gate) console.log(`  gate score: ${v.gate.score} (${v.gate.ok ? "pass" : "FAIL"}); issues on last pass: ${(v.issues ?? []).length} (${(v.issues ?? []).filter((i) => i.blocking).length} blocking)`);
    if (v?.not_judged?.length) console.log(`  not judged: ${v.not_judged.join("; ")}`);
    const rec = v ?? so;
    console.log(`  patches: ${rec.patch_attempts ?? so.patch_attempts ?? 0}; citation fixes: ${(rec.marker_fixes ?? []).length}; FAQ items dropped: ${(rec.dropped_faq ?? []).length}; passes: ${rec.passes ?? (so.last_issues ?? []).length}`);
    if (so.plan?.gain) console.log(`  gain: ${so.plan.gain.type} in "${so.plan.gain.where}"`);
    await client.close();
    // A dry run must reach the gate and pass it: a park or a failure there is
    // a broken fixture, not a content verdict.
    const passed = run.status !== "failed" && (!wantDry || Boolean(v?.gate?.ok));
    process.exit(passed ? 0 : 1);
  }
  // Each stage re-queues the next with run_after = now; the drain claims
  // what is due, so no sleep is needed between ticks beyond politeness.
  await new Promise((r) => setTimeout(r, 1500));
}
console.error("✗ run did not finish within 40 ticks");
await client.close();
process.exit(1);
