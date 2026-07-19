// Phase 2 gate: confirm the DataForSEO account has BOTH SERP and Labs access,
// before wiring any cron to depend on them. Run:
//   node --env-file=.env.local scripts/gate-test.mjs
// Costs a fraction of a cent. Prints the DataForSEO-reported `cost` per call.

const BASE = "https://api.dataforseo.com/v3";

const login = process.env.DATAFORSEO_LOGIN;
const password = process.env.DATAFORSEO_PASSWORD;
if (!login || !password) {
  console.error("Missing DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD in .env.local");
  process.exit(1);
}
const auth = "Basic " + Buffer.from(`${login}:${password}`).toString("base64");

async function call(path, tasks) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify(tasks),
  });
  const json = await res.json();
  return { http: res.status, json };
}

let totalCost = 0;
let ok = true;

// 1. SERP live: does clockedcode.com rank for one of its own keywords?
{
  const { http, json } = await call("/serp/google/organic/live/regular", [
    { keyword: "how to use claude code in vs code", location_code: 2840, language_code: "en", depth: 100 },
  ]);
  totalCost += json.cost ?? 0;
  const items = json?.tasks?.[0]?.result?.[0]?.items ?? [];
  const found = items.find((it) => (it.domain ?? "").replace(/^www\./, "").endsWith("clockedcode.com"));
  if (json.status_code === 20000 && json.tasks?.[0]?.status_code === 20000) {
    console.log(`SERP  ✓ ok  (http ${http}, cost $${json.cost}) - organic results: ${items.filter(i=>i.type==="organic").length}, clockedcode.com found at rank: ${found ? found.rank_absolute : "not in top 100"}`);
  } else {
    ok = false;
    console.log(`SERP  ✗ FAIL  status ${json.status_code}/${json.tasks?.[0]?.status_code}: ${json.status_message} / ${json.tasks?.[0]?.status_message}`);
  }
}

// 2. Labs keyword_ideas: can we expand a seed?
{
  const { http, json } = await call("/dataforseo_labs/google/keyword_ideas/live", [
    { keywords: ["claude code"], location_code: 2840, language_code: "en", limit: 5 },
  ]);
  totalCost += json.cost ?? 0;
  const items = json?.tasks?.[0]?.result?.[0]?.items ?? [];
  if (json.status_code === 20000 && json.tasks?.[0]?.status_code === 20000) {
    console.log(`Labs  ✓ ok  (http ${http}, cost $${json.cost}) - returned ${items.length} ideas, sample: ${items.slice(0,3).map(i=>i.keyword).join(" | ")}`);
  } else {
    ok = false;
    console.log(`Labs  ✗ FAIL  status ${json.status_code}/${json.tasks?.[0]?.status_code}: ${json.status_message} / ${json.tasks?.[0]?.status_message}`);
  }
}

console.log(`\nTotal cost this run: $${totalCost.toFixed(4)}`);
console.log(ok ? "GATE PASSED - both APIs work." : "GATE FAILED - see errors above.");
process.exit(ok ? 0 : 1);
