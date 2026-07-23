import { requireDashboard } from "@/lib/auth-gate";
import { db } from "@/lib/db";
import { requireOnboarded } from "@/lib/onboarding-gate";
import { getActiveProject } from "@/lib/active-project";
import {
  aggregatePageTraffic,
  normalizePageUrl,
  type GscFullRow,
  type PublishedPage,
  type Suggestion,
} from "@/lib/metrics";
import { isLive, refreshPageLiveness } from "@/lib/page-liveness";
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

// PublishedPage plus the "Request Google indexing" done-stamp from the Home
// card (migration 0005), the URL Inspection verification stamp (migration
// 0010), and the liveness stamps (migration 0033). Optional because rows
// predate the columns existing.
type PageRow = PublishedPage & {
  index_requested_at?: string | null;
  indexed_at?: string | null;
  live_at?: string | null;
  live_checked_at?: string | null;
  pr_url?: string | null;
};

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function PagesPage() {
  await requireDashboard();
  await requireOnboarded();

  const project = await getActiveProject();
  const client = db();
  // Guides only - tools and landing pages live on the Tools screen (same
  // type split the analytics overview uses).
  const [pagesRes, doneRes, gscRes] = await Promise.all([
    client
      .from("pages")
      .select("*")
      .eq("project_id", project.id)
      .eq("type", "guide")
      .order("created_at", { ascending: false }),
    client
      .from("suggestions")
      .select("*")
      .eq("project_id", project.id)
      .eq("status", "done")
      .neq("type", "tool")
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
  const traffic = aggregatePageTraffic((gscRes.data ?? []) as GscFullRow[]);

  // Verify any not-yet-live pages right now (bounded, best-effort): a guide
  // whose PR just merged flips to live on this very render, and a guide whose
  // PR is still parked stays honestly "awaiting publish" instead of counting
  // as shipped (migration 0033 / the 2026-07-23 stranded-PR lesson).
  await refreshPageLiveness(project, pages);

  // Live = verified serving 200, OR proven by Google itself (impressions /
  // URL-Inspection pass) for sites whose WAF blocks our probe.
  const isRowLive = (p: PageRow) =>
    isLive(p) ||
    (traffic.get(normalizePageUrl(p.url))?.impressions ?? 0) > 0 ||
    p.indexed_at != null;
  const liveCount = pages.filter(isRowLive).length;
  const pendingCount = pages.length - liveCount;

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
        title="Guides"
        hint={`Every guide shipped to ${project.domain}, newest first. Clicks and impressions are Google search, last 28 days.`}
      />

      {pages.length > 0 ? (
        <StatRow cols={3}>
          <BigStatTile
            title="Guides published"
            value={liveCount}
            sub={
              pendingCount > 0
                ? `live on the site · ${pendingCount} awaiting publish`
                : "live on the site"
            }
          />
          <BigStatTile
            title="Indexed by Google"
            value={indexedCount}
            sub={`of ${liveCount} published`}
          />
          <BigStatTile
            title="Clicks"
            value={clicks28.toLocaleString("en-US")}
            sub="last 28 days from Google search"
          />
        </StatRow>
      ) : null}

      {pages.length === 0 ? (
        <EmptyState>
          No guides published yet. Approve a guide idea on Home, then run <Mono>/seo-build</Mono> - the
          merged page lands here automatically.
        </EmptyState>
      ) : (
        <TableShell>
          <THead>
            <Th>Guide</Th>
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
              const live = isRowLive(p);
              return (
                <Tr key={p.id}>
                  <Td>
                    {/* A pending page's URL doesn't serve yet - send the
                        owner to the PR (the thing that actually exists). */}
                    <a
                      href={live ? p.url : (p.pr_url ?? p.url)}
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
                    {!live ? (
                      <span
                        className="text-amber-300"
                        title="The PR hasn't merged (or the deploy hasn't finished) - this URL doesn't serve yet. It flips to live automatically once it does."
                      >
                        Awaiting publish
                      </span>
                    ) : impressions > 0 || p.indexed_at ? (
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
                    {live ? (
                      <span
                        className="text-neutral-400"
                        title="IndexNow pinged Bing and Yandex automatically when this page merged"
                      >
                        Pinged (auto)
                      </span>
                    ) : (
                      <span className="text-neutral-500">—</span>
                    )}
                  </Td>
                  <Td className="hidden whitespace-nowrap text-right tabular-nums md:table-cell">
                    {clicks.toLocaleString()}
                  </Td>
                  <Td className="hidden whitespace-nowrap text-right tabular-nums text-neutral-300 md:table-cell">
                    {impressions.toLocaleString()}
                  </Td>
                  <Td className="whitespace-nowrap text-neutral-400">
                    {live ? (
                      shortDate(p.created_at)
                    ) : (
                      <span className="text-amber-300/80" title="Logged when its PR opened - publishes when the PR merges">
                        PR open
                      </span>
                    )}
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </TableShell>
      )}

      {done.length > 0 ? (
        <section className="space-y-3">
          <SectionTitle>Recently shipped guide builds</SectionTitle>
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
