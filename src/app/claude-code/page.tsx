import type { Metadata } from "next";
import { AgentLandingPage } from "../agent-landing";

// Agent-hub page for Claude Code - Postiz's postiz.com/claude pattern. The
// shared shell (nav, hero, setup block, FAQ, footer) lives in
// ../agent-landing.tsx; this file only owns the route and its metadata.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "DispatchSEO for Claude Code — SEO on Autopilot for Your Site | DispatchSEO",
  description:
    "Connect Claude Code to DispatchSEO over MCP: keyword research, guide writing, and pull requests on autopilot, running on your Claude subscription.",
  alternates: { canonical: "/claude-code" },
  // Out of the index since 2026-11-08: one template repeated per agent, about
  // the pre-hosted product, on a site Google's spam systems demoted. The page
  // still serves for anyone linked here.
  robots: { index: false, follow: true },
};

export default function ClaudeCodeLandingPage() {
  return <AgentLandingPage agentId="claude" />;
}
