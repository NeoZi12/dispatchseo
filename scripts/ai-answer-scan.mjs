// Weekly ChatGPT answer scan: asks OpenAI's model, with live web search, the
// questions in ai-answer-panel.json and records for each one whether the
// answer named dispatchseo.com - as a cited source or in the answer text -
// plus every source it cited (the gap list). Results land in ai_snapshots
// through the record_ai_citations MCP tool, engine "chatgpt", so the /owner
// AI visibility panel's "Named us" column fills for ChatGPT the same way the
// weekly Claude scan fills it for Claude.
//
// The API model with web search is a proxy for what a person sees in the
// ChatGPT app, not the app itself - same trade every AI-visibility tracker
// makes. gpt-5-mini keeps a 16-question run around $0.25.
//
// Run by .github/workflows/seo-chatgpt-scan.yml. By hand:
//   OPENAI_SCAN_KEY=sk-... MCP_API_KEY=<project token> node scripts/ai-answer-scan.mjs [--dry-run]
// --dry-run asks the questions and prints the verdicts without recording.

import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const OPENAI_KEY = process.env.OPENAI_SCAN_KEY;
const MCP_KEY = process.env.MCP_API_KEY;
const BASE = (process.env.MCP_BASE ?? "https://dispatchseo.com").replace(/\/$/, "");
const MODEL = process.env.OPENAI_SCAN_MODEL ?? "gpt-5-mini";
const DOMAIN = (process.env.SCAN_DOMAIN ?? "dispatchseo.com").toLowerCase();
const BRAND = process.env.SCAN_BRAND ?? "dispatchseo";
const DRY = process.argv.includes("--dry-run");
const CONCURRENCY = 3;

if (!OPENAI_KEY) {
  console.error("Missing OPENAI_SCAN_KEY");
  process.exit(1);
}
if (!MCP_KEY && !DRY) {
  console.error("Missing MCP_API_KEY (pass --dry-run to skip recording)");
  process.exit(1);
}

const panel = JSON.parse(readFileSync(new URL("./ai-answer-panel.json", import.meta.url), "utf8"));
const questions = (panel.questions ?? []).filter((q) => typeof q === "string" && q.trim()).slice(0, 40);
if (!questions.length) {
  console.error("ai-answer-panel.json has no questions");
  process.exit(1);
}

const host = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};
const isOurs = (h) => h === DOMAIN || h.endsWith(`.${DOMAIN}`);

async function askOnce(question) {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      tools: [{ type: "web_search" }],
      include: ["web_search_call.action.sources"],
      instructions:
        "Answer as you would answer a user in chat. Name the specific products, tools or sites you recommend, and cite your sources inline.",
      input: question,
    }),
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    const err = new Error(`OpenAI ${res.status}: ${body}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function ask(question) {
  let data;
  try {
    data = await askOnce(question);
  } catch (e) {
    // One retry on rate limit / server error; anything else is a real failure.
    if (e.status === 429 || e.status >= 500) {
      await new Promise((r) => setTimeout(r, 4000));
      data = await askOnce(question);
    } else throw e;
  }
  const output = Array.isArray(data.output) ? data.output : [];
  const message = output.find((o) => o.type === "message");
  const part = message?.content?.find((c) => c.type === "output_text");
  const text = typeof part?.text === "string" ? part.text : "";
  const annotations = (part?.annotations ?? []).filter((a) => a.type === "url_citation" && a.url);
  const searched = output.filter((o) => o.type === "web_search_call").flatMap((o) => o.action?.sources ?? []);

  // Cited sources in the order shown, one entry per URL.
  const seen = new Set();
  const citations = [];
  for (const a of annotations) {
    if (seen.has(a.url)) continue;
    seen.add(a.url);
    const h = host(a.url);
    if (h) citations.push({ domain: h, url: a.url.slice(0, 600), title: (a.title ?? "").slice(0, 300) || undefined });
  }
  const ours = citations.find((c) => isOurs(c.domain));
  const mentioned = text.toLowerCase().includes(BRAND);
  return {
    engine: "chatgpt",
    query: question.slice(0, 300),
    has_ai_answer: text.trim().length > 40,
    // "Named us" means either: among the cited sources, or named in the answer itself.
    cited: Boolean(ours) || mentioned,
    cited_url: ours?.url ?? (mentioned ? `https://${DOMAIN}` : undefined),
    answer_excerpt: text.slice(0, 1400),
    citations: citations.slice(0, 30),
    // Not recorded; printed so a dry run shows what the model read.
    _searched: searched.map((s) => host(s.url ?? s)).filter(Boolean),
  };
}

const results = [];
const failures = [];
let next = 0;
await Promise.all(
  Array.from({ length: Math.min(CONCURRENCY, questions.length) }, async () => {
    while (next < questions.length) {
      const q = questions[next++];
      try {
        results.push(await ask(q));
      } catch (e) {
        failures.push({ q, error: String(e.message ?? e) });
      }
    }
  }),
);

// Keep the panel's order so the log reads the same every week.
results.sort((a, b) => questions.indexOf(a.query) - questions.indexOf(b.query));
for (const r of results) {
  const mark = r.cited ? "NAMED" : r.has_ai_answer ? "  -  " : " n/a ";
  console.log(`${mark}  ${r.query}`);
  console.log(`       cited: ${r.citations.map((c) => c.domain).join(", ") || "(none)"}`);
}
for (const f of failures) console.log(`FAIL   ${f.q}\n       ${f.error}`);
const named = results.filter((r) => r.cited).length;
console.log(`\n${named} of ${results.length} answers named ${DOMAIN}${failures.length ? `, ${failures.length} question(s) failed` : ""}`);

if (DRY) {
  console.log("(dry run - nothing recorded)");
} else if (results.length) {
  const transport = new StreamableHTTPClientTransport(new URL(`${BASE}/api/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${MCP_KEY}` } },
  });
  const client = new Client({ name: "chatgpt-answer-scan", version: "1.0.0" });
  await client.connect(transport);
  const res = await client.callTool({
    name: "record_ai_citations",
    arguments: { results: results.map(({ _searched, ...r }) => r) },
  });
  await client.close();
  const payload = res.content?.[0]?.text ? JSON.parse(res.content[0].text) : res;
  if (res.isError) {
    console.error("record_ai_citations failed:", payload);
    process.exit(1);
  }
  console.log("recorded:", JSON.stringify(payload));
}

// Every question failing is a broken run (bad key, model gone), not a quiet week.
if (!results.length) process.exit(1);
