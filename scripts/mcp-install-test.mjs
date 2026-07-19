// Smoke-test for the new install workflow + get_pipeline_pack tool.
// Run: node --env-file=.env.local <this file> [base-url]
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const base = process.argv[2] ?? "http://localhost:3000";
const token = process.env.MCP_API_KEY;
if (!token) {
  console.error("Missing MCP_API_KEY");
  process.exit(1);
}

const transport = new StreamableHTTPClientTransport(new URL(`${base}/api/mcp`), {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
});
const client = new Client({ name: "install-smoke-test", version: "1.0.0" });
await client.connect(transport);

let ok = true;
function check(label, cond, detail = "") {
  console.log(`${cond ? "✓" : "✗"} ${label}${detail ? ` - ${detail}` : ""}`);
  if (!cond) ok = false;
}

const { tools } = await client.listTools();
check("get_pipeline_pack listed", tools.some((t) => t.name === "get_pipeline_pack"), `${tools.length} tools total`);

const inst = await client.callTool({ name: "get_instructions", arguments: { workflow: "install" } });
const ip = JSON.parse(inst.content[0].text);
check("install workflow served", ip.workflow === "install", ip.version);
check("install markdown substantial", (ip.markdown ?? "").length > 3000, `${ip.markdown.length} chars`);
check("install has no leftover placeholders", !ip.markdown.includes("{{"));
check("install references get_pipeline_pack", ip.markdown.includes("get_pipeline_pack"));
check("install chains into setup", ip.markdown.includes("workflow=setup"));

const pack = await client.callTool({ name: "get_pipeline_pack", arguments: {} });
const pp = JSON.parse(pack.content[0].text);
check("pack returns files", Array.isArray(pp.files) && pp.files.length === 15, `${pp.files?.length} files`);
const daily = pp.files.find((f) => f.path === ".github/workflows/seo-daily.yml");
check("seo-daily present", Boolean(daily));
check("pack has no leftover placeholders", pp.files.every((f) => !f.content.includes("{{SITE_NAME}}") && !f.content.includes("{{DOMAIN}}") && !f.content.includes("{{BACKEND_URL}}")));
check("project domain interpolated", daily.content.includes("clockedcode.com"));
check("backend url interpolated", daily.content.includes("dispatchseo.com/api/project-mode"));
const cmd = pp.files.find((f) => f.path === ".claude/commands/seo-setup.md");
check("slash commands included", Boolean(cmd) && cmd.content.includes("get_instructions"));
const mcpCi = pp.files.find((f) => f.path === ".github/mcp-ci.json");
check("mcp-ci.json keeps secret placeholders", mcpCi.content.includes("${SEO_MCP_API_KEY}"));

await client.close();
process.exit(ok ? 0 : 1);
