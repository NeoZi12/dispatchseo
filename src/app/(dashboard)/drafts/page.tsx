import { requireDashboard } from "@/lib/auth-gate";
import { redirectIfHosted } from "../mode";
import { db } from "@/lib/db";
import { getActiveProjectOrNull } from "@/lib/active-project";
import { blockedReason, publishRoute } from "@/lib/job-handlers/draft-status";
import { EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { DraftsList, type DraftRow } from "./drafts-client";

export const dynamic = "force-dynamic";

// Articles their AI wrote, on their way to their site.
//
// Deliberately NOT behind requireOnboarded, same as Settings: the first
// article can arrive before the owner has finished connecting anywhere to
// publish it, and the whole point of the blocked_setup status is to have
// somewhere to show that. Bouncing them to the wizard would hide the one
// screen that explains what is waiting on them.

// How many to show. A busy site publishes one a day, so this is months of
// history; past that, older rows are noise on a review screen.
const LIMIT = 60;

// The order the sections read in: what needs the owner, then what is moving,
// then what is done. Newest-first inside each.
const GROUPS: {
  key: string;
  title: string;
  sub: string;
  statuses: string[];
  manualTitle?: string;
  manualSub?: string;
  repoSub?: string;
}[] = [
  {
    key: "attention",
    title: "Needs you",
    sub: "sent back to the writer, or waiting on your setup",
    statuses: ["rejected", "blocked_setup"],
  },
  {
    key: "moving",
    title: "On the way",
    sub: "being checked, prepared, or posted",
    statuses: ["submitted", "accepted", "finished"],
    // On the manual route "accepted" means finished-and-yours, so the section
    // it sits in has to stop promising that something else will happen next.
    manualTitle: "Ready for you",
    manualSub: "finished and waiting to be copied onto your site",
    // On the repo route the last step is a pull request, not a post - saying
    // "posted" would have the owner looking at their site for something that
    // is waiting in GitHub.
    repoSub: "being checked, prepared, or opened as a pull request",
  },
  { key: "live", title: "Live", sub: "confirmed on your site", statuses: ["published"] },
  { key: "gone", title: "Discarded", sub: "kept as history", statuses: ["discarded"] },
];

type Raw = {
  id: string;
  title: string;
  slug: string;
  status: string;
  validation: { score?: number; blocking?: { id: string; title: string; fix: string; passed?: boolean }[] } | null;
  published_url: string | null;
  cover_url: string | null;
  rendered_html: string | null;
  pr_url: string | null;
  pr_merged_at: string | null;
  created_at: string;
};

export default async function DraftsPage() {
  await requireDashboard();
  // Hosted writer: this screen belongs to the agent workflow; the hosted
  // dashboard covers it on /articles.
  await redirectIfHosted("/articles");
  const project = await getActiveProjectOrNull();

  if (!project) {
    return (
      <div className="mx-auto max-w-3xl space-y-8">
        <PageHeader title="Drafts" hint="Add a site and its articles show up here." />
        <EmptyState>No site yet.</EmptyState>
      </div>
    );
  }

  const { data } = await db()
    .from("article_drafts")
    .select(
      "id, title, slug, status, validation, published_url, cover_url, rendered_html, pr_url, pr_merged_at, created_at",
    )
    .eq("project_id", project.id)
    .order("created_at", { ascending: false })
    .limit(LIMIT);

  const drafts: DraftRow[] = ((data ?? []) as Raw[]).map((r) => ({
    id: r.id,
    title: r.title,
    slug: r.slug,
    status: r.status,
    score: typeof r.validation?.score === "number" ? r.validation.score : null,
    published_url: r.published_url,
    cover_url: r.cover_url,
    rendered_html: r.rendered_html,
    pr_url: r.pr_url,
    pr_merged_at: r.pr_merged_at,
    created_at: r.created_at,
    // Only the checks that actually failed, and only for an article that was
    // sent back: a passed check's `fix` is an empty string, and listing the
    // other twenty-odd would bury the two that matter.
    problems:
      r.status === "rejected"
        ? (r.validation?.blocking ?? [])
            .filter((c) => c.passed === false)
            .map((c) => ({ id: c.id, title: c.title, fix: c.fix }))
        : [],
  }));

  const route = publishRoute(project);
  // Both routes that actually publish. The repo route reached this screen as a
  // dead end until our server started opening the pull requests itself.
  const canPublish = route === "wordpress" || route === "repo" || route === "hosted";
  // The owner asked us to finish articles and hand them over rather than post
  // them anywhere. Nothing publishes a manual draft, so the screen has to say
  // that instead of showing it queued behind a publisher that will never run.
  const manual = route === "manual";
  const blockedNote = blockedReason(project);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader
        title="Drafts"
        hint="Everything your AI has handed in. We check it, format it, and put it on your site."
      />

      {drafts.length === 0 ? (
        <EmptyState>
          Nothing yet. Ask your AI to write your next approved idea and it lands here.
        </EmptyState>
      ) : (
        GROUPS.map((g) => {
          const rows = drafts.filter((d) => g.statuses.includes(d.status));
          if (rows.length === 0) return null;
          return (
            <section key={g.key} className="space-y-3">
              <SectionTitle sub={(manual && g.manualSub) || (route === "repo" && g.repoSub) || g.sub}>
                {(manual && g.manualTitle) || g.title}
              </SectionTitle>
              <DraftsList
                drafts={rows}
                canPublish={canPublish}
                manual={manual}
                route={route}
                blockedNote={blockedNote}
              />
            </section>
          );
        })
      )}
    </div>
  );
}
