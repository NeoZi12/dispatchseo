import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireDashboard } from "@/lib/auth-gate";
import { getActiveProject } from "@/lib/active-project";
import { loadArticleSource } from "@/lib/article-owner";
import { redirectIfAgent } from "../../../mode";
import { ArticleEditor } from "./editor";

export const dynamic = "force-dynamic";

// The owner changes a live article: its title, its description, its body.
// One plain form over the article's own source (src/lib/article-owner.ts),
// with a Preview tab that renders the body exactly as the page does. No
// chrome from the page is in here - not the site's header, not the product
// card, and not the free tier's credit line, which is page furniture and
// never part of the article.

export default async function EditArticlePage({ params }: { params: Promise<{ id: string }> }) {
  await requireDashboard();
  await redirectIfAgent("/drafts");
  const id = decodeURIComponent((await params).id);
  const project = await getActiveProject();
  // Scoped to the active project: another site's id is simply not found.
  // A repo article's body comes from the file in the repository (the
  // source of truth for that route), so this read may take a GitHub call.
  const source = await loadArticleSource(project, id, { repoBody: true });
  if (!source) notFound();
  // Not live (or published outside us): the article page says why.
  if (!source.canEdit) redirect(`/articles/${encodeURIComponent(id)}`);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href={`/articles/${encodeURIComponent(id)}`} className="arrive-up inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-muted hover:text-ink">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Back to the article
      </Link>
      <ArticleEditor
        id={source.id}
        slug={project.slug}
        initial={{ title: source.title, metaDescription: source.metaDescription, body: source.body }}
        updatedAt={source.updatedAt}
        fileSha={source.fileSha}
        url={source.url}
        route={source.route}
        repo={source.repo}
        autoMerge={source.autoMerge}
      />
    </div>
  );
}
