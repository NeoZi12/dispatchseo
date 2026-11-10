import { sitePath } from "@/lib/site-root";
import { db } from "@/lib/db";
import { crawlSite } from "@/lib/site-crawl";
import { getProjectById, writerMode } from "@/lib/projects";
import { loadSiteProfile } from "@/lib/site-profile";
import { generateSiteProfile } from "@/lib/autopilot/profile";
import { enqueue, type Job } from "@/lib/jobs";
import { readSiteTheme } from "@/lib/hosted-theme";

// Reads a customer's site and stores what it learned.
//
// This is the half of the product that makes the "your AI writes it" model
// affordable. A chat app cannot read 150 pages of a site - it would blow the
// context budget of a $20 plan before writing a word, and on the coding-agent
// pipeline that same bulk reading was the measured cost driver. So the server
// crawls once, on a schedule, and the customer's AI reads a small digest.
//
// Two products come out of one crawl, deliberately stored apart:
//   digest          - the compact summary the customer's AI reads
//   link_candidates - the full page list only our finisher reads
// See migration 0057 for why they are not the same column.

export async function runCrawlJob(job: Job): Promise<void> {
  const project = await getProjectById(job.project_id);
  if (!project) throw new Error("project no longer exists");
  if (!project.domain) throw new Error("project has no domain to read");

  // isWordPress is a hint, not an instruction: crawlSite still falls through
  // to the sitemap and then to following links if the fast path is blocked.
  const isWordPress =
    typeof job.payload.isWordPress === "boolean" ? (job.payload.isWordPress as boolean) : undefined;
  const maxPages = typeof job.payload.maxPages === "number" ? (job.payload.maxPages as number) : 150;

  const result = await crawlSite(project.domain, { isWordPress, maxPages, basePath: sitePath(project) });

  // A crawl that read nothing is a failure worth retrying (the site may be
  // briefly down), not a digest worth storing. Storing an empty one would let
  // an article be written against "we know nothing about this site" while the
  // dashboard showed a green tick.
  if (!result.ok || result.pages.length === 0) {
    throw new Error(result.notes[0] ?? "we could not read any pages on this site");
  }

  const linkCandidates = result.pages
    // A page with no title cannot supply anchor text, so it can never become a
    // link - carrying it would only inflate the row.
    .filter((p) => p.title && p.title.trim().length > 2)
    .map((p) => ({
      url: p.url,
      title: (p.title ?? "").trim(),
      // The headings double as extra anchor phrases: an article about pricing
      // should be able to link to the page whose H2 is "Our prices", not only
      // to one whose title happens to contain the word.
      keywords: p.headings.slice(0, 6).map((h) => h.text).filter(Boolean),
    }));

  const { error } = await db()
    .from("site_digests")
    .upsert(
      {
        project_id: project.id,
        digest: result.digest as unknown as Record<string, unknown>,
        link_candidates: linkCandidates,
        notes: result.notes,
        page_count: result.pages.length,
        source: result.stats.source,
        crawled_at: new Date().toISOString(),
      },
      { onConflict: "project_id" },
    );
  if (error) throw new Error(`could not save what we read: ${error.message}`);

  // A hosted project has no agent to write its site profile, so the server
  // writes it from what was just read (src/lib/autopilot/profile.ts) - once,
  // and never over the owner's own edit (the lock is checked inside). After
  // the save on purpose, and never thrown: the crawl's job is done, and a
  // retry here would re-read 150 pages to repair a missing description. The
  // autopilot cron retries the profile itself on its next run.
  if (writerMode(project) === "hosted") {
    // The site's colours, read on the first look and never over a theme the
    // owner set or one already read (Settings re-reads on demand): the hosted
    // blog and every cover are drawn in them (hosted-theme.ts, cover-art.ts).
    if (!project.hosted_theme) {
      try {
        const read = await readSiteTheme(project);
        if (read) await db().from("projects").update({ hosted_theme: read.theme, ...(project.hosted_origin ? {} : { hosted_origin: read.origin }) }).eq("id", project.id).is("hosted_theme", null);
      } catch (e) {
        console.warn(`[crawl] site colours for ${project.slug} not read: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    try {
      const { fromDb, error } = await loadSiteProfile(project);
      if (!fromDb && !error) await generateSiteProfile(project);
    } catch (e) {
      console.warn(`[crawl] site profile for ${project.slug} not written: ${e instanceof Error ? e.message : String(e)}`);
    }
    // A site that has never been researched gets its first autopilot pass
    // now (job-handlers/autopilot.ts), not at tomorrow's cron: research,
    // then the first writer run. Best-effort, and only ever the first time -
    // a re-crawl of a site that already researched changes nothing here.
    if (!project.last_research_at) {
      try {
        await enqueue({ projectId: project.id, kind: "autopilot", payload: { first: true }, idempotencyKey: `autopilot:first:${project.id}` });
      } catch (e) {
        console.warn(`[crawl] first autopilot pass for ${project.slug} not queued: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
}
