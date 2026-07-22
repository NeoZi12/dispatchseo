import type { MDXComponents } from "mdx/types";
import Link from "next/link";
import { isValidElement, type ReactNode } from "react";
import { CopyablePre } from "./CopyablePre";
import { McpAnatomyGrid } from "./mcp-anatomy-grid";
import { TransportScorecard } from "./transport-scorecard";
import { McpRequestFlow } from "./mcp-request-flow";
import { ExamplePatternTable } from "./example-pattern-table";
import { McpFactRow } from "./mcp-fact-row";
import { ProductionReadinessChecklist } from "./production-readiness-checklist";
import { TriggerModeTable } from "./trigger-mode-table";
import { AutonomousPipelineFlow } from "./autonomous-pipeline-flow";
import { GuardrailGrid } from "./guardrail-grid";
import { ScopeCompareTable } from "./scope-compare-table";
import { ConnectionFactRow } from "./connection-fact-row";
import { ConnectionChecklist } from "./connection-checklist";
import { SelfHostPatternTable } from "./self-host-pattern-table";
import { AgentStackFactRow } from "./agent-stack-fact-row";
import { OpenCoreChecklist } from "./open-core-checklist";
import { AgentModelCompareTable } from "./agent-model-compare-table";
import { SeoAgentCapabilityGrid } from "./seo-agent-capability-grid";
import { SeoAgentRealityFactRow } from "./seo-agent-reality-fact-row";
import { slugify } from "@/lib/slugify";

// The components every blog MDX file renders with: typographic defaults that
// match the app's dark look (no @tailwindcss/typography dependency), plus
// any bespoke visual components guides ship. Builders: put a new guide's
// visual component in its own file in this directory and add it to the map
// below - posts reference it by name in MDX, nothing else to wire.

// Flattens a heading's rendered children (which may contain <code>, links,
// emphasis, etc.) to plain text so slugify sees the same string that
// getPostHeadings (src/lib/blog.ts) extracts from the raw markdown - the two
// MUST produce identical ids for the "On this page" ToC anchors to work.
function textOf(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return textOf(node.props.children);
  }
  return "";
}

export const mdxComponents: MDXComponents = {
  // Carries a slugified id so the "On this page" ToC can anchor to it.
  // scroll-mt gives the jump some breathing room above the heading.
  h2: ({ children, ...props }) => (
    <h2
      id={slugify(textOf(children)) || undefined}
      className="mt-10 mb-3 scroll-mt-8 text-xl font-semibold tracking-tight text-neutral-100"
      {...props}
    >
      {children}
    </h2>
  ),
  h3: (props) => (
    <h3 className="mt-8 mb-2 text-lg font-semibold tracking-tight text-neutral-100" {...props} />
  ),
  p: (props) => <p className="my-4 leading-relaxed text-neutral-300" {...props} />,
  a: (props) => (
    <a className="text-violet-400 underline underline-offset-2 hover:text-violet-300" {...props} />
  ),
  ul: (props) => <ul className="my-4 list-disc space-y-1.5 pl-6 text-neutral-300" {...props} />,
  ol: (props) => <ol className="my-4 list-decimal space-y-1.5 pl-6 text-neutral-300" {...props} />,
  li: (props) => <li className="leading-relaxed" {...props} />,
  strong: (props) => <strong className="font-semibold text-neutral-100" {...props} />,
  blockquote: (props) => (
    <blockquote className="my-5 border-l-2 border-violet-500/50 pl-4 text-neutral-400" {...props} />
  ),
  code: (props) => (
    <code
      className="rounded bg-neutral-900 px-1.5 py-0.5 font-mono text-[0.9em] text-neutral-200"
      {...props}
    />
  ),
  pre: (props) => <CopyablePre {...props} />,
  table: (props) => (
    <div className="my-5 overflow-x-auto">
      <table className="w-full border-collapse text-sm" {...props} />
    </div>
  ),
  th: (props) => (
    <th
      className="border-b border-neutral-700 px-3 py-2 text-left font-medium text-neutral-200"
      {...props}
    />
  ),
  td: (props) => <td className="border-b border-neutral-800 px-3 py-2 text-neutral-300" {...props} />,
  hr: () => <hr className="my-8 border-neutral-800" />,
  Link,
  McpAnatomyGrid,
  TransportScorecard,
  McpRequestFlow,
  ExamplePatternTable,
  McpFactRow,
  ProductionReadinessChecklist,
  TriggerModeTable,
  AutonomousPipelineFlow,
  GuardrailGrid,
  ScopeCompareTable,
  ConnectionFactRow,
  ConnectionChecklist,
  SelfHostPatternTable,
  AgentStackFactRow,
  OpenCoreChecklist,
  AgentModelCompareTable,
  SeoAgentCapabilityGrid,
  SeoAgentRealityFactRow,
};
