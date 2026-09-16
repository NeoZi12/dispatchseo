// The technical-basics half of the checklist, run for real against
// dispatchseo.com while writing this guide (curl on robots.txt, sitemap.xml,
// the homepage response, and its <title>/meta tags) instead of asserted in
// prose - the same four checks section 2 tells the reader to run on their
// own site.

import { StatRow, BigStatTile } from "@/components/ui";

export function OwnSiteTechnicalAuditRow() {
  return (
    <div className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        dispatchseo.com, checked live with curl while writing this guide
      </h3>
      <div className="mt-3">
        <StatRow cols={4}>
          <BigStatTile title="robots.txt" value="200 OK" sub="allows all, links the sitemap" />
          <BigStatTile title="sitemap.xml" value="200 OK" sub="lists every real URL" />
          <BigStatTile title="Viewport tag" value="present" sub="mobile-friendly by default" />
          <BigStatTile title="Title tag" value="58 chars" sub="unique, under Google's display cap" />
        </StatRow>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-neutral-500">
        Four commands, no dashboard: <code className="rounded bg-neutral-800 px-1 py-0.5 font-mono">
          curl -s yoursite.com/robots.txt
        </code>,{" "}
        <code className="rounded bg-neutral-800 px-1 py-0.5 font-mono">curl -s yoursite.com/sitemap.xml</code>, and
        grepping the homepage HTML for its <code className="rounded bg-neutral-800 px-1 py-0.5 font-mono">
          &lt;title&gt;
        </code>{" "}
        and <code className="rounded bg-neutral-800 px-1 py-0.5 font-mono">viewport</code> meta tag. All four are
        free, take under a minute, and catch the failures a checklist can only remind you to check.
      </p>
    </div>
  );
}
