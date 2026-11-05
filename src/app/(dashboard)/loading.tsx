import { PageLoading } from "@/components/page-loading";
import { GhostCard, Line } from "@/components/ui/skeleton";

// Instant route-transition feedback for every dashboard screen without a
// loading.tsx of its own. Renders inside the group layout (sidebar + topbar
// stay put) the moment a nav link is clicked, while the force-dynamic page
// fetches its data. Generic on purpose: a heading, three figures, two cards,
// in the same surface, hairline and radii the real pages use.
export default function DashboardLoading() {
  return (
    <PageLoading>
      <div className="mx-auto max-w-5xl space-y-8">
        <div>
          <Line className="h-8 w-40" />
          <Line className="mt-3 h-4 w-80 max-w-full" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <GhostCard key={i} className="p-5 sm:p-6">
              <Line className="h-4 w-28" />
              <Line className="mt-3 h-8 w-20" />
              <Line className="mt-3 h-3 w-36" />
            </GhostCard>
          ))}
        </div>
        <GhostCard className="h-64" />
        <GhostCard className="h-40" />
      </div>
    </PageLoading>
  );
}
