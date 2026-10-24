import { requireDashboard } from "@/lib/auth-gate";
import { writerMode } from "../mode";
import { getActiveProjectOrNull } from "@/lib/active-project";
import { HostedTools } from "./hosted-tools";
import { db } from "@/lib/db";
import { requireOnboarded } from "@/lib/onboarding-gate";
import { getActiveProject } from "@/lib/active-project";
import {
  aggregatePageTraffic,
  gscFreshnessNote,
  normalizePageUrl,
  type GscFullRow,
  type PublishedPage,
  type Suggestion,
} from "@/lib/metrics";
import {
  BigStatTile,
  CardList,
  DataCard,
  EmptyState,
  PageHeader,
  SectionTitle,
  StatRow,
  TableShell,
  Td,
  Th,
  THead,
  Tr,
} from "@/components/ui";
import { AddIdeaCard } from "@/components/client";

export const dynamic = "force-dynamic";

// The tools-only sibling of /pages: every published page that is not a guide
// ("tool" and "landing" types - same split the analytics overview uses for its
// Traffic by tool table). Row shape mirrors /pages exactly.
type PageRow = PublishedPage & {
  index_requested_at?: string | null;
  indexed_at?: string | null;
};

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Same Google status ladder the desktop table renders inline (kept there
// untouched) - pulled out here only so the mobile card's `right` slot isn't a
// three-way conditional inlined in JSX.
function googleStatusBadge(p: PageRow, impressions: number) {
  if (impressions > 0 || p.indexed_at) {
    return (
      <span
        className="text-emerald-400"
        title={
          impressions > 0
            ? "Showing in Google search results"
            : `Confirmed indexed by the URL Inspection API ${shortDate(p.indexed_at!)}`
        }
      >
        Indexed
      </span>
    );
  }
  if (p.index_requested_at) {
    return (
      <span
        className="text-sky-400"
        title={`Indexing requested in Search Console ${shortDate(p.index_requested_at)} - Google usually follows within a day or two`}
      >
        Requested
      </span>
    );
  }
  return (
    <span className="text-amber-300" title="Run the Get-it-on-Google card on Home to request indexing">
      Not requested
    </span>
  );
}

export default async function ToolsPage() {
  await requireDashboard();
  // A hosted project gets its own Tools screen on this route (plan-gated:
  // Growth and Scale have tools; Starter sees what they are).
  if (writerMode(await getActiveProjectOrNull()) === "hosted") {
    await requireOnboarded();
    return <HostedTools />;
  }
  await requireOnboarded();

  const project = await getActiveProject();
  const client = db();
  const [pagesRes, doneRes, gscRes] = await Promise.all([
    client
      .from("pages")
      .select("*")
      .eq("project_id", project.id)
      .neq("type", "guide")
      .order("created_at", { ascending: false }),
    client
      .from("suggestions")
      .select("*")
      .eq("project_id", project.id)
      .eq("status", "done")
      .eq("type", "tool")
      .order("created_at", { ascending: false })
      .limit(5),
    // Last 28 daily GSC snapshots - the per-page roll-up feeds the Clicks /
    // Impressions columns and the "Indexed" verdict (impressions on Google =
    // Google has it indexed, no inspection needed).
    client
      .from("gsc_stats")
      .select("date, clicks, impressions, ctr, avg_position, top_queries, top_pages")
      .eq("project_id", project.id)
      .order("date", { ascending: false })
      .limit(28),
  ]);
  const pages = (pagesRes.data ?? []) as PageRow[];
  const done = (doneRes.data ?? []) as Suggestion[];
  const gscRows = (gscRes.data ?? []) as GscFullRow[];
  const traffic = aggregatePageTraffic(gscRows);
  // gscRows is ordered newest-first (see the query above), so [0] is the
  // latest snapshot date, or undefined if nothing has synced.
  const gscNote = gscFreshnessNote(project.gsc_site_url, gscRows[0]?.date ?? null);

  // Headline numbers, from the same traffic roll-up the table uses.
  const indexedCount = pages.filter((p) => {
    const t = traffic.get(normalizePageUrl(p.url));
    return (t?.impressions ?? 0) > 0 || p.indexed_at != null;
  }).length;
  const clicks28 = pages.reduce(
    (a, p) => a + (traffic.get(normalizePageUrl(p.url))?.clicks ?? 0),
    0,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tools"
        hint={`Every interactive tool shipped to ${project.domain}, newest first. Clicks and impressions are Google search, last 28 days.`}
      />

      {gscNote ? (
        <div className="rounded-xl bg-neutral-900 p-4 text-sm text-amber-300">{gscNote}</div>
      ) : null}

      {pages.length > 0 ? (
        <StatRow cols={3}>
          <BigStatTile
            title="Tools published"
            value={pages.length}
            sub="live on the site"
          />
          <BigStatTile
            title="Indexed by Google"
            value={indexedCount}
            sub={`of ${pages.length} published`}
          />
          <BigStatTile
            title="Clicks"
            value={clicks28.toLocaleString("en-US")}
            sub="last 28 days from Google search"
          />
        </StatRow>
      ) : null}

      <AddIdeaCard defaultType="tool" />

      {pages.length === 0 ? (
        <EmptyState>
          No tools published yet. Approve a tool idea on Home - the tool builder ships it as a PR
          and the merged page lands here automatically.
        </EmptyState>
      ) : (
        <>
          {/* Below sm: stacked cards. Bing gets no column here - every merged
              page is auto-pinged via IndexNow, so it's a constant, not a
              per-page signal worth the card space. */}
          <CardList>
            {pages.map((p) => {
              const t = traffic.get(normalizePageUrl(p.url));
              const impressions = t?.impressions ?? 0;
              const clicks = t?.clicks ?? 0;
              return (
                <DataCard
                  key={p.id}
                  title={
                    <a
                      href={p.url}
                      target="_blank"
                      className="text-sky-400 underline underline-offset-2 hover:text-sky-300"
                    >
                      {p.title ?? p.url}
                    </a>
                  }
                  meta={`${p.primary_keyword} · ${shortDate(p.created_at)}`}
                  right={googleStatusBadge(p, impressions)}
                  stats={[
                    { label: "Clicks", value: clicks.toLocaleString() },
                    { label: "Impressions", value: impressions.toLocaleString() },
                  ]}
                />
              );
            })}
          </CardList>
          <TableShell className="hidden sm:block">
            <THead>
              <Th>Tool</Th>
              <Th className="hidden lg:table-cell">Target keyword</Th>
              <Th>Google</Th>
              <Th className="hidden sm:table-cell">Bing</Th>
              <Th className="hidden text-right md:table-cell">Clicks</Th>
              <Th className="hidden text-right md:table-cell">Impressions</Th>
              <Th>Published</Th>
            </THead>
            <tbody>
              {pages.map((p) => {
                const t = traffic.get(normalizePageUrl(p.url));
                const impressions = t?.impressions ?? 0;
                const clicks = t?.clicks ?? 0;
                return (
                  <Tr key={p.id}>
                    <Td>
                      <a
                        href={p.url}
                        target="_blank"
                        className="text-sky-400 underline underline-offset-2 hover:text-sky-300"
                      >
                        {p.title ?? p.url}
                      </a>
                      <span className="ml-2 text-xs text-neutral-500 lg:hidden">{p.primary_keyword}</span>
                    </Td>
                    <Td className="hidden text-neutral-300 lg:table-cell">{p.primary_keyword}</Td>
                    {/* Google: impressions prove indexing, and so does a URL
                        Inspection PASS (indexed_at, stamped by the hourly cron);
                        otherwise all we know is whether indexing was requested. */}
                    <Td className="whitespace-nowrap">
                      {impressions > 0 || p.indexed_at ? (
                        <span
                          className="text-emerald-400"
                          title={
                            impressions > 0
                              ? "Showing in Google search results"
                              : `Confirmed indexed by the URL Inspection API ${shortDate(p.indexed_at!)}`
                          }
                        >
                          Indexed
                        </span>
                      ) : p.index_requested_at ? (
                        <span
                          className="text-sky-400"
                          title={`Indexing requested in Search Console ${shortDate(p.index_requested_at)} - Google usually follows within a day or two`}
                        >
                          Requested
                        </span>
                      ) : (
                        <span
                          className="text-amber-300"
                          title="Run the Get-it-on-Google card on Home to request indexing"
                        >
                          Not requested
                        </span>
                      )}
                    </Td>
                    {/* Bing: every merged page is pinged via IndexNow automatically,
                        so "requested" is a given; Bing shares no per-page metrics. */}
                    <Td className="hidden whitespace-nowrap sm:table-cell">
                      <span
                        className="text-neutral-400"
                        title="IndexNow pinged Bing and Yandex automatically when this page merged"
                      >
                        Pinged (auto)
                      </span>
                    </Td>
                    <Td className="hidden whitespace-nowrap text-right tabular-nums md:table-cell">
                      {clicks.toLocaleString()}
                    </Td>
                    <Td className="hidden whitespace-nowrap text-right tabular-nums text-neutral-300 md:table-cell">
                      {impressions.toLocaleString()}
                    </Td>
                    <Td className="whitespace-nowrap text-neutral-400">{shortDate(p.created_at)}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </TableShell>
        </>
      )}

      {done.length > 0 ? (
        <section className="space-y-3">
          <SectionTitle>Recently shipped tool builds</SectionTitle>
          <ul className="space-y-1.5 text-sm">
            {done.map((s) => (
              <li key={s.id} className="flex items-baseline gap-2">
                <span className="text-emerald-400">✓</span>
                <span>
                  {s.title}{" "}
                  {s.result_pr_url ? (
                    <a
                      href={s.result_pr_url}
                      className="text-sky-400 underline underline-offset-2 hover:text-sky-300"
                    >
                      PR
                    </a>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
