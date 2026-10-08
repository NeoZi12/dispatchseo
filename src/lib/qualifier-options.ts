// The AI options the qualifier offers, in its own module and deliberately so:
// the /qualify form is a client component and renders this list, while the
// server action validates against it. Living in qualifier.ts would have pulled
// that file - and through it db.ts and the service-role key - straight into
// the browser bundle. Same reasoning as cancellation-reasons.ts.
//
// Nothing here may import anything server-only, ever.

// What the owner says the site is. Two answers on purpose - these are the two
// places we can publish to. Everything else (Wix, Squarespace, Shopify,
// Webflow, Framer, Ghost) is refused by the domain probe, not offered here.
export type SiteKind = "wordpress" | "code";

export const SITE_KINDS: { value: SiteKind; label: string; hint: string }[] = [
  { value: "wordpress", label: "WordPress", hint: "Self-hosted, any theme or builder" },
  { value: "code", label: "Built with code", hint: "Next.js, Astro, Hugo… in a GitHub repo" },
];

export function isSiteKind(value: string): value is SiteKind {
  return value === "wordpress" || value === "code";
}

// Grouped the way a buyer thinks about it, not the way the backend does:
// "an AI app you chat with" vs "a coding agent". The values are the same
// AiChoice ids the server validates; only the presentation is grouped.
export type AiGroup = "chat" | "coding" | "other";

export type AiChoice =
  | "claude-code"
  | "codex"
  | "cursor"
  | "chatgpt"
  | "claude-web"
  | "gemini"
  | "none";

export const AI_OPTIONS: { value: AiChoice; label: string; hint: string; group: AiGroup; soon?: boolean }[] = [
  { value: "claude-web", label: "Claude", hint: "The claude.ai app - you add DispatchSEO as a connector", group: "chat" },
  { value: "chatgpt", label: "ChatGPT", hint: "The ChatGPT app - not available yet", group: "chat", soon: true },
  { value: "claude-code", label: "Claude Code", hint: "Anthropic's terminal agent - runs in your repo", group: "coding" },
  { value: "codex", label: "Codex", hint: "OpenAI's coding agent - runs in your repo", group: "coding" },
  { value: "cursor", label: "Cursor", hint: "The agent inside the editor - runs in your repo", group: "coding" },
  { value: "gemini", label: "Gemini", hint: "Google's chat app", group: "other" },
  { value: "none", label: "None of these", hint: "I don't use an AI assistant", group: "other" },
];

export const AI_GROUPS: { id: AiGroup; label: string; hint: string }[] = [
  { id: "chat", label: "An AI app you chat with", hint: "You add DispatchSEO as a connector; it writes on your own plan." },
  { id: "coding", label: "A coding agent", hint: "It runs in your repo on a schedule and opens pull requests." },
];

export const AI_VALUES = AI_OPTIONS.map((o) => o.value);

export function isAiChoice(value: string): value is AiChoice {
  return (AI_VALUES as string[]).includes(value);
}
