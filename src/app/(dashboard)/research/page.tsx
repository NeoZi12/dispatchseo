import { requireDashboard } from "@/lib/auth-gate";
import { db } from "@/lib/db";
import { requireOnboarded } from "@/lib/onboarding-gate";
import { getActiveProject } from "@/lib/active-project";
import { sortQueue, type Suggestion } from "@/lib/metrics";
import { AddIdeaCard, RestoreButton } from "@/components/client";
import { DraggableQueue, type QueueRow } from "@/components/queue-table";
import {
  BigStatTile,
  EmptyState,
  Mono,
  PageHeader,
  SectionTitle,
  StatRow,
  TableShell,
  Td,
  Th,
  THead,
  Tr,
} from "@/components/ui";

export const dynamic = "force-dynamic";

// The research screen shows the ACTIVE queue only: approved guides waiting
// for the daily builder (row order = build order - owner-set positions first,
// then FIFO) and tool ideas waiting for a decision or a Build now. Finished
// work (done/rejected) drops into the compact History section at the bottom -
// it never crowds the queue.

const ACTIVE = new Set(["approved", "pending", "in_progress"]);

// The suggestions table also carries decision/completion stamps used to sort
// History; declared locally so this page builds even before the shared
// Suggestion type gains them.
type SuggestionRow = Suggestion & {
  decided_at?: string | null;
  completed_at?: string | null;
};

// Serializable slice of a suggestion for the client-side draggable queues.
function toQueueRow(s: SuggestionRow): QueueRow {
  return {
    id: s.id,
    title: s.title,
    primary_keyword: s.primary_keyword,
    keyword_volume: s.keyword_volume,
    keyword_difficulty: s.keyword_difficulty,
    status: s.status,
  };
}

function historyStamp(s: SuggestionRow): number {
  const iso = s.completed_at ?? s.decided_at ?? s.created_at;
  return iso ? Date.parse(iso) : 0;
}

// "Jul 15" - published date for shipped rows, decision date for rejections.
function fmtHistoryDate(s: SuggestionRow): string {
  const iso = s.completed_at ?? s.decided_at;
  return iso
    ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "-";
}

export default async function ResearchPage() {
  await requireDashboard();
  await requireOnboarded();

  const project = await getActiveProject();
  const client = db();
  const sugRes = await client
    .from("suggestions")
    .select("*")
    .eq("project_id", project.id)
    .order("created_at", { ascending: true });
  const suggestions = (sugRes.data ?? []) as SuggestionRow[];

  // Displayed in build order (owner-set positions first, then FIFO) - the
  // rows you see here are exactly what the builders will pick, top first.
  const active = sortQueue(suggestions.filter((s) => ACTIVE.has(s.status)));
  // Shipped work leads (that's the trophy shelf), rejections follow; both
  // groups newest-first by their decision/publish stamp.
  const history = suggestions
    .filter((s) => !ACTIVE.has(s.status))
    .sort((a, b) => {
      const group = (s: SuggestionRow) => (s.status === "done" ? 0 : 1);
      if (group(a) !== group(b)) return group(a) - group(b);
      return historyStamp(b) - historyStamp(a);
    });

  const opportunities = active.filter((s) => s.type !== "tool");
  const tools = active.filter((s) => s.type === "tool");

  // Reordering and manual adds need the queue_position column - nudge until
  // migration 0014 runs (the key is absent from every row before it).
  const needsQueueMigration = active.length > 0 && !("queue_position" in active[0]);

  const nextGuide = opportunities.find((s) => s.status === "approved") ?? null;
  const shippedCount = history.filter((s) => s.status === "done").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Content queue"
        hint="Approved ideas waiting for the automated builders, in build order - top row builds next. Drag a row to reorder, or add your own idea."
      />

      {active.length > 0 || shippedCount > 0 ? (
        <StatRow cols={3}>
          <BigStatTile
            title="Guides queued"
            value={opportunities.length}
            sub={
              nextGuide
                ? `next up: ${nextGuide.title}`
                : "the Monday research run refills this"
            }
          />
          <BigStatTile
            title="Tools queued"
            value={tools.length}
            sub="tools build the moment you approve them"
          />
          <BigStatTile
            title="Shipped so far"
            value={shippedCount}
            sub="built, merged, and live on the site"
          />
        </StatRow>
      ) : null}

      <AddIdeaCard />

      {needsQueueMigration ? (
        <p className="text-sm text-amber-300">
          One-time step: paste supabase/migrations/0014_manual_queue.sql into the Supabase SQL
          editor so reordering and manual adds stick.
        </p>
      ) : null}

      <div className="grid gap-8 xl:grid-cols-2">
        <section className="space-y-3">
          <SectionTitle sub="one ships each morning, top row first - drag to reorder">
            Guide queue
          </SectionTitle>
          {opportunities.length === 0 ? (
            <EmptyState>
              Queue is empty - the Monday research run refills it, or run <Mono>/seo-research</Mono>{" "}
              in Claude Code.
            </EmptyState>
          ) : (
            <DraggableQueue kind="guide" rows={opportunities.map(toQueueRow)} />
          )}
        </section>

        <section className="space-y-3">
          <SectionTitle sub="approve a tool to build it now; queued tools wait for the weekly builder">
            Tool queue
          </SectionTitle>
          {tools.length === 0 ? (
            <EmptyState>Queue is empty - the weekly research run adds tool ideas here.</EmptyState>
          ) : (
            <DraggableQueue kind="tool" rows={tools.map(toQueueRow)} />
          )}
        </section>
      </div>

      {history.length > 0 && (
        <section className="space-y-3 pt-4">
          <SectionTitle sub="everything already decided - shipped to the site or rejected">
            History
          </SectionTitle>
          <TableShell>
            <THead>
              <Th>Keyword / idea</Th>
              <Th>Type</Th>
              <Th className="hidden sm:table-cell">Vol/KD</Th>
              <Th className="hidden sm:table-cell">Published</Th>
              <Th>Outcome</Th>
              <Th>
                <span className="sr-only">Restore</span>
              </Th>
            </THead>
            <tbody>
              {history.map((s) => (
                <Tr key={s.id}>
                  <Td>{s.primary_keyword ?? s.title}</Td>
                  <Td className="text-neutral-400">{s.type}</Td>
                  <Td className="hidden tabular-nums text-neutral-300 sm:table-cell">
                    {s.keyword_volume ?? "-"}/{s.keyword_difficulty ?? "-"}
                  </Td>
                  <Td className="hidden tabular-nums text-neutral-400 sm:table-cell">
                    {fmtHistoryDate(s)}
                  </Td>
                  <Td>
                    {s.status === "done" && s.result_pr_url ? (
                      <a
                        href={s.result_pr_url}
                        className="text-emerald-400 underline underline-offset-2 hover:text-emerald-300"
                      >
                        shipped
                      </a>
                    ) : s.status === "done" ? (
                      <span className="text-emerald-400">shipped</span>
                    ) : (
                      <span className="text-neutral-500">rejected</span>
                    )}
                  </Td>
                  <Td className="text-right">
                    {/* Only rejections can change their mind - shipped is shipped. */}
                    {s.status === "rejected" ? <RestoreButton id={s.id} /> : null}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableShell>
        </section>
      )}
    </div>
  );
}
