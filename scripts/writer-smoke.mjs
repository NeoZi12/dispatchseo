// Smoke-test for the hosted writer (src/lib/writer/): starts a run through the
// write_article MCP tool, then drives the jobs cron until the run reaches a
// terminal state, printing each stage as it lands. Run:
//   WRITER_DRY_RUN=1 node --env-file=.env.local scripts/writer-smoke.mjs [base-url] [keyword]
// The third argument may also be a suggestion id (uuid) to write a queued idea.
// base-url defaults to http://localhost:3000 (needs `pnpm dev` running with the
// same WRITER_DRY_RUN in its environment - the flag is read server-side).
// Needs MCP_API_KEY and CRON_SECRET in .env.local, and migration 0064 applied.

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
    console.log(run.status === "failed" ? `✗ failed: ${run.error}` : `✓ ${run.status}; draft ${run.draft_id ?? "(none)"}`);
    const v = run.stage_outputs?.verify;
    if (v?.ledger) console.log(`  ledger: ${v.ledger.length} claim(s) judged`);
    if (v?.gate) console.log(`  gate score: ${v.gate.score}; issues on last pass: ${(v.issues ?? []).length}`);
    if (run.stage_outputs?.plan?.gain) console.log(`  gain: ${run.stage_outputs.plan.gain.type} in "${run.stage_outputs.plan.gain.where}"`);
    await client.close();
    process.exit(run.status === "failed" ? 1 : 0);
  }
  // Each stage re-queues the next with run_after = now; the drain claims
  // what is due, so no sleep is needed between ticks beyond politeness.
  await new Promise((r) => setTimeout(r, 1500));
}
console.error("✗ run did not finish within 40 ticks");
await client.close();
process.exit(1);
