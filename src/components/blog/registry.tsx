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
import { Steps, Step } from "./steps";
import { FreeStackTable } from "./free-stack-table";
import { StackCostFactRow } from "./stack-cost-fact-row";
import { WiredLoopFlow } from "./wired-loop-flow";
import { AlternativesScorecard } from "./alternatives-scorecard";
import { SerpCompositionGrid } from "./serp-composition-grid";
import { BacklinkRealityCard } from "./backlink-reality-card";
import { AiVisibilityLandscapeScorecard } from "./ai-visibility-landscape-scorecard";
import { CitationCheckChecklist } from "./citation-check-checklist";
import { AiVisibilityRealityCard } from "./ai-visibility-reality-card";
import { SubagentShapeCompareTable } from "./subagent-shape-compare-table";
import { ClaimAndBuildFlow } from "./claim-and-build-flow";
import { PipelineClaimFactRow } from "./pipeline-claim-fact-row";
import { MemoryScopeTable } from "./memory-scope-table";
import { MemoryMechanismGrid } from "./memory-mechanism-grid";
import { RepoMemoryFactRow } from "./repo-memory-fact-row";
import { AutomationFitCompareTable } from "./automation-fit-compare-table";
import { HeadlessRunFactRow } from "./headless-run-fact-row";
import { AutomationPricingScorecard } from "./automation-pricing-scorecard";
import { HeadlessFlagGrid } from "./headless-flag-grid";
import { PrintModeEnvelopeFactRow } from "./print-mode-envelope-fact-row";
import { ClassifyOutcomeBranches } from "./classify-outcome-branches";
import { SerpTrackingCostScorecard } from "./serp-tracking-cost-scorecard";
import { SelfHostPipelineFlow } from "./self-host-pipeline-flow";
import { DiyWinsChecklist } from "./diy-wins-checklist";
import { McpCategoryGrid } from "./mcp-category-grid";
import { McpCategoryCompareTable } from "./mcp-category-compare-table";
import { McpToolMixScorecard } from "./mcp-tool-mix-scorecard";
import { McpPickChecklist } from "./mcp-pick-checklist";
import { AiCitationFreshnessFactRow } from "./ai-citation-freshness-fact-row";
import { TrendToGuideTimelineFlow } from "./trend-to-guide-timeline-flow";
import { RefreshVsFrontloadSplit } from "./refresh-vs-frontload-split";
import { FreeToolJobGrid } from "./free-tool-job-grid";
import { FreeToolMemoryCompareTable } from "./free-tool-memory-compare-table";
import { PileVsSystemChecklist } from "./pile-vs-system-checklist";
import { AutomationSerpFieldGrid } from "./automation-serp-field-grid";
import { FreeVsPaidStackTable } from "./free-vs-paid-stack-table";
import { RepoAutomationFactRow } from "./repo-automation-fact-row";
import { SerpBuyingLensRow } from "./serp-buying-lens-row";
import { FounderWorkflowSplit } from "./founder-workflow-split";
import { FounderCostScorecard } from "./founder-cost-scorecard";
import { ShipVsScoreFlow } from "./ship-vs-score-flow";
import { SurferAltCompareTable } from "./surfer-alt-compare-table";
import { NoEditorPipelineFactRow } from "./no-editor-pipeline-fact-row";
import { ClearscopeModuleGrid } from "./clearscope-module-grid";
import { ScoreDraftTrackCompareTable } from "./score-draft-track-compare-table";
import { AiCitationTrackFactRow } from "./ai-citation-track-fact-row";
import { ChatgptRankTacticsChecklist } from "./chatgpt-rank-tactics-checklist";
import { ChecklistFollowedZeroCitedFactRow } from "./checklist-followed-zero-cited-fact-row";
import { ClassicVsAiTacticsSplit } from "./classic-vs-ai-tactics-split";
import { MozModuleCoverageGrid } from "./moz-module-coverage-grid";
import { DomainRankSnapshotCard } from "./domain-rank-snapshot-card";
import { RankTrackingPipelineFlow } from "./rank-tracking-pipeline-flow";
import { MangoolsToolMapTable } from "./mangools-tool-map-table";
import { OwnAccountLiveSnapshotRow } from "./own-account-live-snapshot-row";
import { OpenTabVsCronSplit } from "./open-tab-vs-cron-split";
import { GscMcpFieldGrid } from "./gsc-mcp-field-grid";
import { ReportingVsLoopFlow } from "./reporting-vs-loop-flow";
import { OwnSearchConsoleFeedCard } from "./own-search-console-feed-card";
import { ToolCategorySerpGrid } from "./tool-category-serp-grid";
import { AutomationCoverageTable } from "./automation-coverage-table";
import { LoopTimelineFactRow } from "./loop-timeline-fact-row";
import { MajesticSerpCategoryGrid } from "./majestic-serp-category-grid";
import { BacklinkToPlanFlow } from "./backlink-to-plan-flow";
import { OwnLinkSignalCard } from "./own-link-signal-card";
import { ScaleVsJudgmentCompareTable } from "./scale-vs-judgment-compare-table";
import { JudgmentModelPaceFactRow } from "./judgment-model-pace-fact-row";
import { ScaleVsJudgmentFitSplit } from "./scale-vs-judgment-fit-split";
import { SeedCloudSampleGrid } from "./seed-cloud-sample-grid";
import { AtpJobCoverageChecklist } from "./atp-job-coverage-checklist";
import { OwnPipelineStatCard } from "./own-pipeline-stat-card";
import { SerpstatModuleGrid } from "./serpstat-module-grid";
import { SerpstatDecideShipSplit } from "./serpstat-decide-ship-split";
import { SerpstatLoopStatCard } from "./serpstat-loop-stat-card";
import { AccurankerTierCostTable } from "./accuranker-tier-cost-table";
import { RankCheckForkFlow } from "./rank-check-fork-flow";
import { TrackingCadenceFactRow } from "./tracking-cadence-fact-row";
import { ClusterFieldCompareTable } from "./cluster-field-compare-table";
import { ClusterToPageFlow } from "./cluster-to-page-flow";
import { ClusterRunOutputCard } from "./cluster-run-output-card";
import { LtpSerpFieldGrid } from "./ltp-serp-field-grid";
import { KdWinnabilityScorecard } from "./kd-winnability-scorecard";
import { LtpJobCoverageChecklist } from "./ltp-job-coverage-checklist";
import { UbersuggestSerpFieldTable } from "./ubersuggest-serp-field-table";
import { KdGapFactRow } from "./kd-gap-fact-row";
import { ListVsLoopFlow } from "./list-vs-loop-flow";
import { OutrankPricingTiersTable } from "./outrank-pricing-tiers-table";
import { ContentEngineForkSplit } from "./content-engine-fork-split";
import { OutrankQueuePaceFactRow } from "./outrank-queue-pace-fact-row";
import { FraseTierCapScorecard } from "./frase-tier-cap-scorecard";
import { PostPublishMonitorForkFlow } from "./post-publish-monitor-fork-flow";
import { GuideShipCadenceTimeline } from "./guide-ship-cadence-timeline";
import { MarketmuseTierFeatureTable } from "./marketmuse-tier-feature-table";
import { BriefToBlankPageForkFlow } from "./brief-to-blank-page-fork-flow";
import { MarketmuseCitationGapFactRow } from "./marketmuse-citation-gap-fact-row";
import { WincherModuleContentGrid } from "./wincher-module-content-grid";
import { WincherOwnTrackingFactRow } from "./wincher-own-tracking-fact-row";
import { WincherTierKeywordTable } from "./wincher-tier-keyword-table";
import { HookEventCategoryGrid } from "./hook-event-category-grid";
import { HookDecisionFlow } from "./hook-decision-flow";
import { HookGitTestTable } from "./hook-git-test-table";
import { RateLimitTypeGrid } from "./rate-limit-type-grid";
import { InteractiveVsHeadlessLimitSplit } from "./interactive-vs-headless-limit-split";
import { QuotaBackoffTimeline } from "./quota-backoff-timeline";
import {
  Callout,
  CardGrid,
  Card,
  Fields,
  Field,
  Symptom,
  Meta,
  MetaItem,
  Pill,
} from "@/components/docs/mdx";
import { AgentTabs, AgentTab } from "@/components/docs/agent-tabs";
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
  // Screenshots in guides: light-mode captures on the dark page get a
  // border + padding so they read as a framed figure, not a glare block.
  img: (props) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="my-5 h-auto max-w-full rounded-xl border border-neutral-800 bg-white p-2"
      loading="lazy"
      alt=""
      {...props}
    />
  ),
  Link,
  // Docs building blocks (src/components/docs/mdx.tsx) - callouts, card
  // grids, reference rows. Registered here because /docs renders through this
  // same registry, so a doc page and a blog post never diverge visually.
  Callout,
  CardGrid,
  Card,
  Fields,
  Field,
  Symptom,
  Meta,
  MetaItem,
  Pill,
  AgentTabs,
  AgentTab,
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
  Steps,
  Step,
  FreeStackTable,
  StackCostFactRow,
  WiredLoopFlow,
  AlternativesScorecard,
  SerpCompositionGrid,
  BacklinkRealityCard,
  AiVisibilityLandscapeScorecard,
  CitationCheckChecklist,
  AiVisibilityRealityCard,
  SubagentShapeCompareTable,
  ClaimAndBuildFlow,
  PipelineClaimFactRow,
  MemoryScopeTable,
  MemoryMechanismGrid,
  RepoMemoryFactRow,
  AutomationFitCompareTable,
  HeadlessRunFactRow,
  AutomationPricingScorecard,
  HeadlessFlagGrid,
  PrintModeEnvelopeFactRow,
  ClassifyOutcomeBranches,
  SerpTrackingCostScorecard,
  SelfHostPipelineFlow,
  DiyWinsChecklist,
  McpCategoryGrid,
  McpCategoryCompareTable,
  McpToolMixScorecard,
  McpPickChecklist,
  AiCitationFreshnessFactRow,
  TrendToGuideTimelineFlow,
  RefreshVsFrontloadSplit,
  FreeToolJobGrid,
  FreeToolMemoryCompareTable,
  PileVsSystemChecklist,
  AutomationSerpFieldGrid,
  FreeVsPaidStackTable,
  RepoAutomationFactRow,
  SerpBuyingLensRow,
  FounderWorkflowSplit,
  FounderCostScorecard,
  ShipVsScoreFlow,
  SurferAltCompareTable,
  NoEditorPipelineFactRow,
  ClearscopeModuleGrid,
  ScoreDraftTrackCompareTable,
  AiCitationTrackFactRow,
  ChatgptRankTacticsChecklist,
  ChecklistFollowedZeroCitedFactRow,
  ClassicVsAiTacticsSplit,
  MozModuleCoverageGrid,
  DomainRankSnapshotCard,
  RankTrackingPipelineFlow,
  MangoolsToolMapTable,
  OwnAccountLiveSnapshotRow,
  OpenTabVsCronSplit,
  GscMcpFieldGrid,
  ReportingVsLoopFlow,
  OwnSearchConsoleFeedCard,
  ToolCategorySerpGrid,
  AutomationCoverageTable,
  LoopTimelineFactRow,
  MajesticSerpCategoryGrid,
  BacklinkToPlanFlow,
  OwnLinkSignalCard,
  ScaleVsJudgmentCompareTable,
  JudgmentModelPaceFactRow,
  ScaleVsJudgmentFitSplit,
  SeedCloudSampleGrid,
  AtpJobCoverageChecklist,
  OwnPipelineStatCard,
  SerpstatModuleGrid,
  SerpstatDecideShipSplit,
  SerpstatLoopStatCard,
  AccurankerTierCostTable,
  RankCheckForkFlow,
  TrackingCadenceFactRow,
  ClusterFieldCompareTable,
  ClusterToPageFlow,
  ClusterRunOutputCard,
  LtpSerpFieldGrid,
  KdWinnabilityScorecard,
  LtpJobCoverageChecklist,
  UbersuggestSerpFieldTable,
  KdGapFactRow,
  ListVsLoopFlow,
  OutrankPricingTiersTable,
  ContentEngineForkSplit,
  OutrankQueuePaceFactRow,
  FraseTierCapScorecard,
  PostPublishMonitorForkFlow,
  GuideShipCadenceTimeline,
  MarketmuseTierFeatureTable,
  BriefToBlankPageForkFlow,
  MarketmuseCitationGapFactRow,
  WincherModuleContentGrid,
  WincherOwnTrackingFactRow,
  WincherTierKeywordTable,
  HookEventCategoryGrid,
  HookDecisionFlow,
  HookGitTestTable,
  RateLimitTypeGrid,
  InteractiveVsHeadlessLimitSplit,
  QuotaBackoffTimeline,
};
