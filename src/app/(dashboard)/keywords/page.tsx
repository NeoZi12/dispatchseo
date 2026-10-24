import { requireDashboard } from "@/lib/auth-gate";
import { redirectIfHosted } from "../mode";
import { db } from "@/lib/db";
import { requireOnboarded } from "@/lib/onboarding-gate";
import { getActiveProject } from "@/lib/active-project";
import {
  deltas,
  groupChecks,
  sortByBestPosition,
  type Keyword,
  type RankCheck,
} from "@/lib/metrics";
import {
  Arrow,
  BigStatTile,
  CardList,
  DataCard,
  EmptyState,
  Mono,
  PageHeader,
  Sparkline,
  StatRow,
  TableShell,
  Td,
  Th,
  THead,
  Tr,
} from "@/components/ui";

// current: null is ambiguous by itself - it means either "confirmed outside
// the top 100" (a rank_checks row exists with position: null) or "no check
// has ever run" (broken creds, cron never reached this keyword). Both used to
// render as the identical ">100" with no way to tell them apart (2026-07-27
// audit) - deltas().checked distinguishes them.
function positionLabel(d: { current: number | null; checked: boolean; lastCheckedAt: string | null }) {
  if (!d.checked) {
    return (
      <span title="No rank check has run for this keyword yet">not checked</span>
    );
  }
  if (d.current == null) {
    const checkedDate = d.lastCheckedAt
      ? new Date(d.lastCheckedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : null;
    return (
      <span title={checkedDate ? `Confirmed outside the top 100 as of ${checkedDate}` : undefined}>
        &gt;100
      </span>
    );
  }
  return d.current;
}

export const dynamic = "force-dynamic";

export default async function KeywordsPage() {
  await requireDashboard();
  // Hosted writer: this screen belongs to the agent workflow; the hosted
  // dashboard covers it on /results.
  await redirectIfHosted("/results");
  await requireOnboarded();

  const project = await getActiveProject();
  const client = db();
  const [kwRes, rcRes] = await Promise.all([
    client
      .from("keywords")
      .select("id, keyword, search_volume, keyword_difficulty")
      .eq("project_id", project.id)
      .eq("status", "tracking"),
    client
      .from("rank_checks")
      .select("keyword_id, position, checked_at")
      .eq("project_id", project.id)
      .gte("checked_at", new Date(Date.now() - 30 * 86400000).toISOString())
      // Newest-first + explicit cap so a read past PostgREST's row limit loses
      // the OLDEST rows rather than the newest (see analytics-data.ts). Sorted
      // back to ascending below, because deltas() reads the last element as the
      // current position.
      .order("checked_at", { ascending: false })
      .range(0, 19999),
  ]);

  const keywords = (kwRes.data ?? []) as Keyword[];
  const byKw = groupChecks(
    ((rcRes.data ?? []) as RankCheck[])
      .slice()
      .sort((a, b) => a.checked_at.localeCompare(b.checked_at)),
  );

  // One row per keyword with its series and deltas resolved once, ordered best
  // position first. Both views below render from this - computing deltas twice
  // (once per view) let the card list and the table drift apart in principle.
  const rows = sortByBestPosition(
    keywords.map((k) => {
      const series = byKw.get(k.id) ?? [];
      const d = deltas(series);
      return { ...k, series, d, position: d.current };
    }),
  );

  // Headline numbers for the stat row, from the same series the table shows.
  const stats = rows.map((r) => r.d);
  const positions = stats
    .map((s) => s.current)
    .filter((p): p is number => p != null);
  const inTop10 = positions.filter((p) => p <= 10).length;
  const avgPosition = positions.length
    ? positions.reduce((a, p) => a + p, 0) / positions.length
    : null;
  const improved7 = stats.filter((s) => (s.d7 ?? 0) > 0).length;
  const declined7 = stats.filter((s) => (s.d7 ?? 0) < 0).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Keyword rankings"
        hint="Where this site places on Google for each tracked keyword, checked daily. Green arrows mean the position improved."
      />

      {keywords.length > 0 ? (
        <StatRow>
          <BigStatTile
            title="Keywords tracked"
            value={keywords.length}
            sub="checked against Google every day"
          />
          <BigStatTile
            title="In the top 10"
            value={inTop10}
            sub={`of ${positions.length} ranking in the top 100`}
          />
          <BigStatTile
            title="Average position"
            value={avgPosition != null ? avgPosition.toFixed(1) : "-"}
            sub="across ranking keywords - lower is better"
          />
          <BigStatTile
            title="Moved up this week"
            value={improved7}
            sub={declined7 > 0 ? `${declined7} moved down` : "none moved down"}
          />
        </StatRow>
      ) : null}

      {keywords.length === 0 ? (
        <EmptyState>
          Nothing tracked yet. Ask your connected agent for the research workflow (
          <Mono>/seo-research</Mono> in Claude Code) to start tracking keywords.
        </EmptyState>
      ) : (
        <>
          {/* Below sm: stacked cards, no sparkline (a 112px chart reads as
              noise at card width) - the 7d/30d arrows already carry the trend. */}
          <CardList>
            {rows.map((k) => (
              <DataCard
                key={k.id}
                title={k.keyword}
                meta={`${k.search_volume ?? "?"}/mo · difficulty ${k.keyword_difficulty ?? "?"}`}
                stats={[
                  { label: "Position", value: positionLabel(k.d) },
                  { label: "7d", value: <Arrow delta={k.d.d7} /> },
                  { label: "30d", value: <Arrow delta={k.d.d30} /> },
                ]}
              />
            ))}
          </CardList>
          <TableShell className="hidden sm:block">
            <THead>
              <Th>Keyword</Th>
              <Th className="hidden sm:table-cell">Volume</Th>
              <Th className="hidden sm:table-cell">
                <span title="How hard it is to rank for this keyword, 0-100">Difficulty</span>
              </Th>
              <Th>Position</Th>
              <Th>7d</Th>
              <Th>30d</Th>
              <Th>Trend (30d)</Th>
            </THead>
            <tbody>
              {rows.map((k) => (
                <Tr key={k.id}>
                  <Td>
                    {k.keyword}
                    <span className="ml-2 text-xs text-neutral-500 sm:hidden">
                      {k.search_volume ?? "?"}/mo · difficulty {k.keyword_difficulty ?? "?"}
                    </span>
                  </Td>
                  <Td className="hidden tabular-nums text-neutral-300 sm:table-cell">
                    {k.search_volume ?? "-"}
                  </Td>
                  <Td className="hidden tabular-nums text-neutral-300 sm:table-cell">
                    {k.keyword_difficulty ?? "-"}
                  </Td>
                  <Td className="font-mono">{positionLabel(k.d)}</Td>
                  <Td>
                    <Arrow delta={k.d.d7} />
                  </Td>
                  <Td>
                    <Arrow delta={k.d.d30} />
                  </Td>
                  <Td>
                    <Sparkline positions={k.series.map((c) => c.position)} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableShell>
        </>
      )}
    </div>
  );
}
