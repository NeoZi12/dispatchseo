"use client";

import { VerdictCard } from "../verdict-card";

const CASES = [
  {
    name: "ok",
    detected: "Next.js, version 16",
    verdict: {
      ok: true,
      building: false,
      headline: "You're set up to use this",
      detail:
        "A code-built site it is - articles arrive as pull requests in your GitHub repo, and nothing ships until you merge.",
    },
  },
  {
    name: "soon",
    verdict: {
      ok: false,
      building: true,
      headline: "We can't connect the ChatGPT app yet",
      detail:
        "Right now the work runs through the Claude app or a coding agent (Claude Code, Codex or Cursor). Connecting ChatGPT is being built. If you also have one of those, pick it above and you're good to go.",
    },
  },
  {
    name: "no",
    detected: "Wix",
    verdict: {
      ok: false,
      building: false,
      headline: "We don't support Wix sites",
      detail:
        "There's no way for us to publish pages to one. Rather than take your money for a setup that can't finish, we'd rather say so now.",
    },
  },
];

export function VerdictPreview() {
  return (
    <main className="min-h-screen bg-neutral-950 px-5 py-10">
      <div className="mx-auto max-w-xl space-y-12">
        {CASES.map((c) => (
          <section key={c.name}>
            <p className="font-mono text-xs text-neutral-500">{c.name}</p>
            <VerdictCard verdict={c.verdict} detected={c.detected} onChange={() => {}} />
          </section>
        ))}
      </div>
    </main>
  );
}
