import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { isValidCookie } from "@/lib/dashboard-auth";
import { requireOnboarded } from "@/lib/onboarding-gate";
import { getActiveProject } from "@/lib/active-project";
import { getAnalyticsOverview } from "@/lib/analytics-data";
import { halfDelta } from "@/lib/metrics";
import {
  BigStatTile,
  DeltaPill,
  GscChart,
  PageHeader,
  SectionTitle,
  StatRow,
  TableShell,
  Td,
  Th,
  THead,
  Tr,
} from "@/components/ui";
import {
  DomainRatingCard,
  RankingsTable,
  TrafficByPage,
  TrafficTable,
  fmtInt,
  fmtPct,
  fmtPos,
} from "@/components/seo-cards";
import { NextUpdate } from "@/components/next-update";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const jar = await cookies();
  if (!(await isValidCookie(jar.get("dash_auth")?.value))) redirect("/login");
  await requireOnboarded();

  const project = await getActiveProject();
  const o = await getAnalyticsOverview(project);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Analytics"
        hint={`Everything the SEO manager is driving for ${o.domain}, in one place. Search data is from Google, last 28 days.`}
      />

      {/* ---------- DOMAIN RATING ---------- */}
      <section className="space-y-3">
        <SectionTitle sub="your site's authority - the number to watch climb">Domain Rating</SectionTitle>
        <DomainRatingCard dr={o.dr} />
      </section>

      {/* ---------- SEARCH TRAFFIC ---------- */}
      <section className="space-y-3">
        <SectionTitle sub="visitors from Google search - pick the window on the card">Search traffic</SectionTitle>
        <GscChart rows={o.gscDaily} />
        {/* Same tile grammar as Home's stat row. The delta pill compares the
            second half of the 28-day window to the first half. */}
        <StatRow>
          <BigStatTile
            title="Clicks"
            value={fmtInt(o.totals.clicks)}
            pill={
              <DeltaPill
                delta={halfDelta(o.gsc, "clicks")}
                title="last 14 days vs the 14 before"
              />
            }
            sub={<>last 28 days · <NextUpdate hourly /></>}
          />
          <BigStatTile
            title="Impressions"
            value={fmtInt(o.totals.impressions)}
            pill={
              <DeltaPill
                delta={halfDelta(o.gsc, "impressions")}
                title="last 14 days vs the 14 before"
              />
            }
            sub={<>last 28 days · <NextUpdate hourly /></>}
          />
          <BigStatTile
            title="Average position"
            value={fmtPos(o.totals.avgPosition)}
            sub="lower is better · last 28 days"
          />
          <BigStatTile
            title="Click-through rate"
            value={fmtPct(o.totals.ctr)}
            sub="clicks per impression · last 28 days"
          />
        </StatRow>
      </section>

      {/* ---------- TRAFFIC BY PAGE ---------- */}
      <section className="space-y-3">
        <SectionTitle
          sub={<>where every Google click landed, last 28 days · <NextUpdate hourly /></>}
        >
          Traffic by page
        </SectionTitle>
        <TrafficByPage breakdown={o.breakdown} />
      </section>

      {/* ---------- GUIDES ---------- */}
      <section className="space-y-3">
        <SectionTitle sub={<>search clicks and impressions each built guide has earned · <NextUpdate hourly /></>}>
          Traffic by guide
        </SectionTitle>
        <TrafficTable rows={o.guides} itemLabel="Guide" />
      </section>

      {/* ---------- TOOLS ---------- */}
      <section className="space-y-3">
        <SectionTitle sub={<>search clicks and impressions each built tool has earned · <NextUpdate hourly /></>}>
          Traffic by tool
        </SectionTitle>
        <TrafficTable rows={o.tools} itemLabel="Tool" />
      </section>

      {/* ---------- KEYWORD RANKINGS ---------- */}
      <section className="space-y-3">
        <SectionTitle sub={<>{o.rankingCount} of {o.rankings.length} tracked keywords are in the top 100 · <NextUpdate /></>}>
          Keyword rankings
        </SectionTitle>
        <RankingsTable rankings={o.rankings} limit={20} />
        {o.rankings.length > 0 ? (
          <p className="text-xs text-neutral-500">
            <Link href="/keywords" className="text-sky-400 underline underline-offset-2 hover:text-sky-300">
              Full keyword table with sparklines
            </Link>
          </p>
        ) : null}
      </section>

      {/* ---------- TOP QUERIES ---------- */}
      {o.topQueries.length > 0 ? (
        <section className="space-y-3">
          <SectionTitle sub={<>what people searched to find you, last 28 days · <NextUpdate hourly /></>}>Top search queries</SectionTitle>
          <TableShell>
            <THead>
              <Th>Query</Th>
              <Th className="hidden text-right sm:table-cell">Clicks</Th>
              <Th className="text-right">Impressions</Th>
              <Th className="hidden text-right sm:table-cell">Position</Th>
            </THead>
            <tbody>
              {o.topQueries.map((q) => (
                <Tr key={q.query}>
                  <Td>{q.query}</Td>
                  <Td className="hidden text-right tabular-nums sm:table-cell">
                    {fmtInt(q.clicks)}
                  </Td>
                  <Td className="text-right tabular-nums text-neutral-300">{fmtInt(q.impressions)}</Td>
                  <Td className="hidden text-right tabular-nums text-neutral-300 sm:table-cell">
                    {fmtPos(q.position)}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableShell>
        </section>
      ) : null}
    </div>
  );
}
