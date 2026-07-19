// The full AI visibility (GEO) detail view - Home's compact card, uncapped.
// Same data source as the Home teaser and the get_ai_visibility MCP tool
// (parity rule): getAiVisibility(project.id, project.domain) is the single
// source of truth all three render from.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isValidCookie } from "@/lib/dashboard-auth";
import { getActiveProject } from "@/lib/active-project";
import { ENGINE_LABELS, getAiVisibility, type AiVisibility } from "@/lib/ai-visibility";
import { BigStatTile, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import {
  AnswerStatus,
  CitationTrend,
  EngineValue,
  engineSub,
  GapDomains,
  plural,
  shortDate,
  sortEngines,
} from "@/components/ai-visibility-cards";

export const dynamic = "force-dynamic";

// The full query-by-query log - every recent_answers row, most recent first,
// each expandable to the verbatim excerpt and cited domains behind the
// status. This is the page's main body.
function AnswerLog({ answers }: { answers: AiVisibility["recent_answers"] }) {
  if (answers.length === 0) return null;
  return (
    <div className="divide-y divide-neutral-800/70 rounded-xl bg-neutral-900 px-4 sm:px-5">
      {answers.map((a, i) => (
        <details key={`${a.engine}-${a.query}-${a.checked_at}-${i}`} className="py-3.5">
          <summary className="cursor-pointer select-none list-none">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="w-36 shrink-0 text-xs font-medium text-neutral-500">
                {ENGINE_LABELS[a.engine] ?? a.engine}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-100">
                {a.query}
              </span>
              <AnswerStatus a={a} />
              <span className="w-16 shrink-0 text-right text-xs tabular-nums text-neutral-600">
                {shortDate(a.checked_at)}
              </span>
            </div>
          </summary>
          <div className="mt-2 space-y-1.5 pl-0 sm:pl-40">
            {a.answer_excerpt ? (
              <p className="text-sm text-neutral-400">&ldquo;{a.answer_excerpt}&rdquo;</p>
            ) : (
              <p className="text-sm text-neutral-600">No answer text captured for this check.</p>
            )}
            {a.citations.length > 0 ? (
              <p className="text-xs text-neutral-500">
                Cited: {a.citations.map((c) => c.domain).join(", ")}
              </p>
            ) : null}
          </div>
        </details>
      ))}
    </div>
  );
}

export default async function AiVisibilityPage() {
  const jar = await cookies();
  if (!isValidCookie(jar.get("dash_auth")?.value)) redirect("/login");

  const project = await getActiveProject();
  const visibility = await getAiVisibility(project.id, project.domain, { maxAnswers: 50 });

  const lastChecked = visibility.engines
    .map((e) => e.last_checked)
    .filter((d): d is string => d != null)
    .sort()
    .at(-1);

  return (
    <div className="space-y-8">
      <PageHeader
        title="AI visibility"
        hint={`Do AI assistants cite ${project.domain} when answering customer questions?${
          lastChecked ? ` Last checked ${shortDate(lastChecked)}.` : ""
        }`}
      />

      {!visibility.has_data ? (
        <>
          <EmptyState>
            Nothing recorded yet. Your next daily rank check starts tracking Google&apos;s AI
            Overviews, and the weekly AI scan asks Claude the questions your customers ask - both
            land here automatically.
          </EmptyState>
          <p className="border-t border-neutral-800/80 pt-4 text-xs text-neutral-500">
            Google AI Overview data records nightly with the regular rank check. The Claude,
            ChatGPT, Perplexity, and Gemini numbers come from a separate scan that runs weekly,
            every Wednesday, on your own Claude subscription.
          </p>
        </>
      ) : (
        <>
          <section className="space-y-3">
            <SectionTitle sub="cited in AI answers, per engine">By engine</SectionTitle>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
              {sortEngines(visibility.engines).map((e) => (
                <BigStatTile
                  key={e.engine}
                  title={e.label}
                  value={<EngineValue e={e} />}
                  sub={engineSub(e)}
                />
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <SectionTitle sub="share of AI answers that cite you, by day">
              Citation rate over time
            </SectionTitle>
            <div className="rounded-xl bg-neutral-900 p-5 sm:p-6">
              <CitationTrend trend={visibility.trend} variant="full" />
            </div>
          </section>

          <section className="space-y-3">
            <SectionTitle sub="every domain AI named on a question where you weren't mentioned, most-cited first">
              Cited instead of you
            </SectionTitle>
            <div className="rounded-xl bg-neutral-900 p-5 sm:p-6">
              <GapDomains domains={visibility.gap_domains} />
            </div>
          </section>

          <section className="space-y-3">
            <SectionTitle sub={`${plural(visibility.recent_answers.length, "question")} checked, most recent first - expand any row for the verbatim answer`}>
              Query log
            </SectionTitle>
            <AnswerLog answers={visibility.recent_answers} />
          </section>

          <p className="border-t border-neutral-800/80 pt-4 text-xs text-neutral-500">
            Google AI Overview data records nightly with the regular rank check. The Claude,
            ChatGPT, Perplexity, and Gemini numbers come from a separate scan that runs weekly,
            every Wednesday, on your own Claude subscription.
          </p>
        </>
      )}
    </div>
  );
}
