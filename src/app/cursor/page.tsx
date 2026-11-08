import type { Metadata } from "next";
import { AgentLandingPage } from "../agent-landing";

// Agent-hub page for Cursor - same pattern as /claude-code and /codex. The
// shared shell (nav, hero, setup block, FAQ, footer) lives in
// ../agent-landing.tsx; this file only owns the route and its metadata.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "DispatchSEO for Cursor — SEO on Autopilot for Your Site | DispatchSEO",
  description:
    "Connect Cursor to DispatchSEO over MCP: keyword research, guide writing, and pull requests, running on the Cursor plan you already have.",
  alternates: { canonical: "/cursor" },
  // Out of the index since 2026-11-08: one template repeated per agent, about
  // the pre-hosted product, on a site Google's spam systems demoted. The page
  // still serves for anyone linked here.
  robots: { index: false, follow: true },
};

export default function CursorLandingPage() {
  return <AgentLandingPage agentId="cursor" />;
}
