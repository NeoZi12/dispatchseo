// Smoke-test for the get_instructions MCP tool: connects to the MCP endpoint
// as a real streamable-HTTP client, lists tools, fetches two workflows, and
// asserts the responses are well-formed and project-interpolated. Run:
//   node --env-file=.env.local scripts/mcp-instructions-test.mjs [base-url]
// base-url defaults to http://localhost:3000 (needs `pnpm dev` running);
// pass https://dispatchseo.com to smoke-test production after a deploy.

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
const client = new Client({ name: "instructions-smoke-test", version: "1.0.0" });
await client.connect(transport);

let ok = true;
function check(label, cond, detail = "") {
  console.log(`${cond ? "✓" : "✗"} ${label}${detail ? ` - ${detail}` : ""}`);
  if (!cond) ok = false;
}

// 1. The tool is registered.
const { tools } = await client.listTools();
const tool = tools.find((t) => t.name === "get_instructions");
check("get_instructions listed", Boolean(tool), `${tools.length} tools total`);

// 2. Fetch build-guide: version + interpolation + the rules that must be there.
const res = await client.callTool({
  name: "get_instructions",
  arguments: { workflow: "build-guide" },
});
const payload = JSON.parse(res.content[0].text);
check("returns version", typeof payload.version === "string", payload.version);
check("returns workflow", payload.workflow === "build-guide");
check("markdown is substantial", (payload.markdown ?? "").length > 4000, `${payload.markdown.length} chars`);
check("no leftover {{placeholders}}", !payload.markdown.includes("{{"));
check("project domain interpolated", payload.markdown.includes("clockedcode.com"));
check("pipeline present", payload.markdown.includes("THIN-CONTENT GATE"));
check("icon rule present", payload.markdown.includes("NEVER a first-letter chip"));
check("conventions file referenced", payload.markdown.includes(".dispatchseo/conventions.md"));

// 3. The conventions tools exist and read gracefully (null before the
//    migration/setup has run - never a crash).
const conv = tools.find((t) => t.name === "get_conventions");
check("set_conventions listed", tools.some((t) => t.name === "set_conventions"));
check("get_conventions listed", Boolean(conv));
const convRes = await client.callTool({ name: "get_conventions", arguments: {} });
const convPayload = JSON.parse(convRes.content[0].text);
check("get_conventions responds", "data" in convPayload, convPayload.data === null ? "no row yet" : "row present");

// 4. A second workflow renders too, and unknown workflows are rejected.
const res2 = await client.callTool({
  name: "get_instructions",
  arguments: { workflow: "research" },
});
const p2 = JSON.parse(res2.content[0].text);
check("research workflow renders", p2.workflow === "research" && p2.markdown.includes("Weekly quota"));

const bad = await client
  .callTool({ name: "get_instructions", arguments: { workflow: "nope" } })
  .then((r) => r.isError === true)
  .catch(() => true);
check("invalid workflow rejected", bad);

await client.close();
console.log(ok ? "\nAll checks passed." : "\nFAILED.");
process.exit(ok ? 0 : 1);
