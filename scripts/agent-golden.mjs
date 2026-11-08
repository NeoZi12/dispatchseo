// The Claude regression guard.
//
// Adding a second coding agent means routing every hardcoded Claude string
// through a registry. That refactor is only safe if Claude's rendered output is
// provably unchanged - and "provably" cannot mean "I read the diff", because
// these strings are pasted by owners into terminals where a single wrong flag
// is a dead install. The connect and setup commands in particular carry hard-won
// detail: --transport http, --scope local, argument ORDER (the CLI's parser
// throws on options before the name), the Windows ?key= form that exists because
// the header variant is silently dropped on that platform, and the PowerShell
// twins that exist because `&&`, `test` and `printf` are POSIX-only.
//
// So: snapshot every command this project can hand a user, commit it, and diff
// on every push. A deliberate change means regenerating the snapshot in the same
// commit - which puts the before/after in the review, where it belongs.
//
// Deliberately credential-free and network-free: it imports pure string
// builders and nothing else, so it can run as a REQUIRED check on pull requests
// from forks, where secrets are unavailable.
//
//   node --experimental-strip-types scripts/agent-golden.mjs          # regenerate
//   node --experimental-strip-types scripts/agent-golden.mjs --check  # verify
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { registerTsResolver } from "./agent-ci/resolve-ts.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const GOLDEN = resolve(here, "../test/golden/agent-commands.json");

// Imported by RELATIVE path, not the @/ alias: this runs under plain node with
// type stripping, which has no idea about tsconfig paths. mcp-connect.ts is
// import-free by design (it is client-safe), so it loads standalone.
const mcp = await import("../src/lib/mcp-connect.ts");

// agents/index.ts imports through the @/ alias like the rest of src/, and plain
// node has no idea what that means. Teaching the resolver the one alias this
// repo uses is cheaper than making that module the odd one out - and it keeps
// the registry assertion below possible at all.
registerTsResolver(resolve(here, "../src"));

// The registry's id lookup, asserted here rather than only type-checked,
// because TypeScript cannot see this class of bug at all: REGISTRY is a plain
// object literal, so a bare REGISTRY[id] reads Object.prototype and answers
// "yes, that's an agent" for "constructor", "toString", "__proto__" and the
// rest. That made isSupportedAgent() a validation bypass whose value got
// persisted into projects.agent by the dashboard's setAgent action, after
// which every read of that row returned the Object constructor and threw.
// Own-property check only. If someone reintroduces a bare index, this fails.
const agents = await import("../src/lib/agents/index.ts");
const NOT_AGENTS = ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"];
for (const id of NOT_AGENTS) {
  if (agents.isSupportedAgent(id)) {
    console.error(
      `Registry regression: isSupportedAgent(${JSON.stringify(id)}) returned true.\n` +
        "That is an Object.prototype key, not an agent - the lookup must use Object.hasOwn.",
    );
    process.exit(1);
  }
  if (agents.agentById(id).id !== "claude") {
    console.error(
      `Registry regression: agentById(${JSON.stringify(id)}) did not fall back to Claude.`,
    );
    process.exit(1);
  }
  if (agents.projectAgent({ agent: id }).id !== "claude") {
    console.error(
      `Registry regression: projectAgent({agent:${JSON.stringify(id)}}) did not fall back to Claude.`,
    );
    process.exit(1);
  }
}
for (const id of ["claude", "codex", "cursor"]) {
  if (!agents.isSupportedAgent(id) || agents.agentById(id).id !== id) {
    console.error(`Registry regression: ${id} is no longer resolvable by id.`);
    process.exit(1);
  }
}

// A fixture, never a real project. The values are obviously fake so a snapshot
// diff can never be mistaken for a leaked token.
const SLUG = "goldensite";
const ORIGIN = "https://backend.example.test";
const TOKEN = "fixture-token-do-not-use";

const snapshot = {
  _readme:
    "Golden snapshot of every command DispatchSEO hands an owner. Regenerate with " +
    "`node --experimental-strip-types scripts/agent-golden.mjs` and commit the diff " +
    "alongside the change that caused it. Never edit by hand.",
  fixture: { slug: SLUG, origin: ORIGIN, token: TOKEN },
  claude: {
    serverName: mcp.mcpServerName(SLUG),
    mcpAdd: mcp.mcpAddCommand(SLUG, ORIGIN, TOKEN),
    mcpAddPowershell: mcp.mcpAddCommandPS(SLUG, ORIGIN, TOKEN),
    ghPermission: mcp.ghPermissionCommand(),
    connect: mcp.connectCommand(SLUG, ORIGIN, TOKEN),
    connectPowershell: mcp.connectCommandPS(SLUG, ORIGIN, TOKEN),
    setup: mcp.setupCommand(SLUG, ORIGIN, TOKEN),
    setupBundled: mcp.setupCommand(SLUG, ORIGIN, TOKEN, true),
    setupPowershell: mcp.setupCommandPS(SLUG, ORIGIN, TOKEN),
    setupPowershellBundled: mcp.setupCommandPS(SLUG, ORIGIN, TOKEN, true),
  },
  // Codex earns the same treatment for the same reason: these are pastes, and a
  // paste is either exactly right or it is a dead install. The bash and
  // PowerShell entries being identical is not a copy-paste slip - it is the
  // property the URL-key form was chosen for, and the snapshot is where that
  // stays true.
  codex: {
    serverName: mcp.mcpServerName(SLUG),
    mcpAdd: mcp.codexMcpAddCommand(SLUG, ORIGIN, TOKEN),
    connect: mcp.codexConnectCommand(SLUG, ORIGIN, TOKEN),
    connectPowershell: mcp.codexConnectCommandPS(SLUG, ORIGIN, TOKEN),
    setup: mcp.setupCommand(SLUG, ORIGIN, TOKEN, false, "codex"),
    setupBundled: mcp.setupCommand(SLUG, ORIGIN, TOKEN, true, "codex"),
    setupPowershell: mcp.setupCommandPS(SLUG, ORIGIN, TOKEN, false, "codex"),
    setupPowershellBundled: mcp.setupCommandPS(SLUG, ORIGIN, TOKEN, true, "codex"),
  },
  // Cursor's pastes are the longest and most fragile of the three: the bash
  // form embeds a node one-liner that must merge .cursor/mcp.json rather than
  // clobber it, and the PowerShell form rebuilds the same merge in
  // ConvertFrom/To-Json. A refactor that "simplifies" either into a blind
  // write is silent data loss on an owner's config - exactly the class of
  // change this snapshot exists to surface.
  cursor: {
    serverName: mcp.mcpServerName(SLUG),
    mcpAdd: mcp.cursorMcpAddCommand(SLUG, ORIGIN, TOKEN),
    mcpAddPowershell: mcp.cursorMcpAddCommandPS(SLUG, ORIGIN, TOKEN),
    connect: mcp.cursorConnectCommand(SLUG, ORIGIN, TOKEN),
    connectPowershell: mcp.cursorConnectCommandPS(SLUG, ORIGIN, TOKEN),
    setup: mcp.setupCommand(SLUG, ORIGIN, TOKEN, false, "cursor"),
    setupBundled: mcp.setupCommand(SLUG, ORIGIN, TOKEN, true, "cursor"),
    setupPowershell: mcp.setupCommandPS(SLUG, ORIGIN, TOKEN, false, "cursor"),
    setupPowershellBundled: mcp.setupCommandPS(SLUG, ORIGIN, TOKEN, true, "cursor"),
  },
  // The raw details handed to any other MCP client. No command to get wrong,
  // but the URL shape and the header spelling are still things a client will
  // reject character-for-character.
  generic: mcp.genericMcpConfig(SLUG, ORIGIN, TOKEN),
  // The REGISTRY WIRING, not just the string builders above. Every user-facing
  // surface (the wizards, Settings, pipeline-install, agent-settings) reads
  // the registry - so a swap the string builders can't see, like pointing
  // codex.credential.repoSecretName at Claude's, would silently store an
  // OpenAI key in CLAUDE_CODE_OAUTH_TOKEN and pass every other gate in the
  // repo. Snapshotting the credential metadata and capability flags makes
  // that a visible diff.
  registry: Object.fromEntries(
    agents.availableAgents().map((a) => [
      a.id,
      {
        displayName: a.displayName,
        credential: {
          repoSecretName: a.credential.repoSecretName,
          envVar: a.credential.envVar,
          instanceSettingsColumn: a.credential.instanceSettingsColumn,
          placeholder: a.credential.placeholder,
          mintUrl: a.credential.mintUrl,
        },
        capabilities: a.capabilities,
        connectServerName: a.connect.serverName(SLUG),
        connectBash: a.connect.bash(SLUG, ORIGIN, TOKEN),
        mcpAddBash: a.connect.mcpAddBash(SLUG, ORIGIN, TOKEN),
      },
    ]),
  ),
};

const rendered = JSON.stringify(snapshot, null, 2) + "\n";
const check = process.argv.includes("--check");

if (!check) {
  mkdirSync(dirname(GOLDEN), { recursive: true });
  writeFileSync(GOLDEN, rendered);
  console.log(`Wrote ${GOLDEN}`);
  process.exit(0);
}

let current = "";
try {
  current = readFileSync(GOLDEN, "utf8");
} catch {
  console.error(
    "No golden snapshot exists yet. Create it with:\n" +
      "  node --experimental-strip-types scripts/agent-golden.mjs",
  );
  process.exit(1);
}

if (current === rendered) {
  console.log("Agent commands match the golden snapshot - Claude's output is unchanged.");
  process.exit(0);
}

// Show WHICH command changed, not a whole-file diff: these strings are long and
// a "one of these ten lines differs" report is what a reviewer actually needs.
const before = JSON.parse(current);
const after = snapshot;
console.error("Agent command output CHANGED versus the golden snapshot:\n");
for (const agent of new Set([...Object.keys(before), ...Object.keys(after)])) {
  if (agent === "_readme" || agent === "fixture") continue;
  const b = before[agent] ?? {};
  const a = after[agent] ?? {};
  for (const key of new Set([...Object.keys(b), ...Object.keys(a)])) {
    if (b[key] === a[key]) continue;
    console.error(`  ${agent}.${key}`);
    console.error(`    before: ${b[key] ?? "(absent)"}`);
    console.error(`    after:  ${a[key] ?? "(absent)"}\n`);
  }
}
console.error(
  "If this change is intended, regenerate and commit the snapshot in the SAME commit:\n" +
    "  node --experimental-strip-types scripts/agent-golden.mjs",
);
process.exit(1);
