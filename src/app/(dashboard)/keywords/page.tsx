import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { isValidCookie } from "@/lib/dashboard-auth";
import { requireOnboarded } from "@/lib/onboarding-gate";
import { getActiveProject } from "@/lib/active-project";
import { deltas, groupChecks, type Keyword, type RankCheck } from "@/lib/metrics";
import {
  Arrow,
  BigStatTile,
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

export const dynamic = "force-dynamic";

export default async function KeywordsPage() {
  const jar = await cookies();
  if (!(await isValidCookie(jar.get("dash_auth")?.value))) redirect("/login");
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
      .order("checked_at", { ascending: true }),
  ]);

  const keywords = (kwRes.data ?? []) as Keyword[];
  const byKw = groupChecks((rcRes.data ?? []) as RankCheck[]);

  // Headline numbers for the stat row, from the same series the table shows.
  const stats = keywords.map((k) => deltas(byKw.get(k.id) ?? []));
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
          Nothing tracked yet. Run <Mono>/seo-research</Mono> in Claude Code to start tracking keywords.
        </EmptyState>
      ) : (
        <TableShell>
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
            {keywords.map((k) => {
              const series = byKw.get(k.id) ?? [];
              const d = deltas(series);
              return (
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
                  <Td className="font-mono">{d.current ?? ">100"}</Td>
                  <Td>
                    <Arrow delta={d.d7} />
                  </Td>
                  <Td>
                    <Arrow delta={d.d30} />
                  </Td>
                  <Td>
                    <Sparkline positions={series.map((c) => c.position)} />
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </TableShell>
      )}
    </div>
  );
}
