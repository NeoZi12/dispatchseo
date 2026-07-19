// AI visibility (GEO) - Home's answer to "do AI assistants cite this site
// when answering customer questions?". Reads straight from getAiVisibility
// (the same function the get_ai_visibility MCP tool and the full /ai page
// render from - parity rule). This is the compact teaser: engine numbers +
// a small trend + top gap domains, all inside one clickable card that hands
// off to /ai for the full detail - same pattern as the Analytics teaser
// below it on this page.

import Link from "next/link";
import { getAiVisibility } from "@/lib/ai-visibility";
import type { Project } from "@/lib/projects";
import { EmptyState, SectionTitle } from "@/components/ui";
import {
  CitationTrend,
  EngineValue,
  GapDomains,
  shortDate,
  sortEngines,
} from "@/components/ai-visibility-cards";

export default async function AiVisibilitySection({ project }: { project: Project }) {
  const visibility = await getAiVisibility(project.id, project.domain);

  const lastChecked = visibility.engines
    .map((e) => e.last_checked)
    .filter((d): d is string => d != null)
    .sort()
    .at(-1);

  return (
    <section className="space-y-3">
      <SectionTitle
        sub={
          <>
            do AI assistants cite {project.domain} when answering customer questions?
            {lastChecked ? ` · last checked ${shortDate(lastChecked)}` : ""}
          </>
        }
      >
        AI visibility
      </SectionTitle>

      {!visibility.has_data ? (
        <EmptyState>
          Nothing recorded yet. Your next daily rank check starts tracking Google&apos;s AI
          Overviews, and the weekly AI scan asks Claude the questions your customers ask - both
          land here automatically.
        </EmptyState>
      ) : (
        <Link
          href="/ai"
          className="group block rounded-xl bg-neutral-900 p-4 transition-colors hover:bg-neutral-800/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 sm:p-5"
        >
          {/* Engine numbers, flat - no nested card chrome since this whole
              block is already the one clickable card. */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
            {sortEngines(visibility.engines).map((e) => (
              <div key={e.engine}>
                <p className="text-xs text-neutral-400">{e.label}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">
                  <EngineValue e={e} />
                </p>
              </div>
            ))}
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <p className="text-xs text-neutral-400">Citation rate over time</p>
              <div className="mt-2">
                <CitationTrend trend={visibility.trend} />
              </div>
            </div>
            <div className="lg:col-span-2">
              <p className="text-xs text-neutral-400">Cited instead of you</p>
              <div className="mt-2">
                <GapDomains domains={visibility.gap_domains} limit={3} />
              </div>
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <span className="text-sm text-sky-400 group-hover:text-sky-300">
              View full details <span aria-hidden="true">→</span>
            </span>
          </div>
        </Link>
      )}
    </section>
  );
}
