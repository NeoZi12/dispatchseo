import { notFound, redirect } from "next/navigation";
import { requireDashboard } from "@/lib/auth-gate";
import { getActiveProject } from "@/lib/active-project";
import { loadArticleSource } from "@/lib/article-owner";
import { editorStyles, siteOrigin } from "@/lib/hosted-blog";
import { redirectIfAgent } from "../../../mode";
import { longDate } from "../../../article-status";
import { InplaceEditor } from "./inplace-editor";

export const dynamic = "force-dynamic";

// The owner changes a live article in place: the article rendered as the
// blog renders it, every heading and paragraph editable where it stands,
// one Save. The editor itself is inplace-editor.tsx; this page only loads
// the source (src/lib/article-owner.ts) and the blog's own styles so the
// preview is the page, not a picture of it. No chrome from the page is in
// here - not the site's header, not the product card, and not the free
// tier's credit line, which is page furniture and never part of the article.

const RTL = new Set(["he", "ar", "fa", "ur"]);

export default async function EditArticlePage({ params }: { params: Promise<{ id: string }> }) {
  await requireDashboard();
  await redirectIfAgent("/drafts");
  const id = decodeURIComponent((await params).id);
  const project = await getActiveProject();
  // A repo article's body comes from the file in the repository (the
  // source of truth for that route), so this read may take a GitHub call.
  const source = await loadArticleSource(project, id, { repoBody: true });
  if (!source) notFound();
  // Not live (or published outside us): the article page says why.
  if (!source.canEdit) redirect(`/articles/${encodeURIComponent(id)}`);

  const lang = (project.language_code || "en").slice(0, 2);
  const words = source.body.split(/\s+/).filter(Boolean).length;
  const metaLine = [project.author_name?.trim() || null, source.publishedAt ? longDate(source.publishedAt) : null, `${Math.max(1, Math.round(words / 200))} min read`].filter(Boolean).join("  ·  ");

  return (
    <div className="-mt-4">
      <InplaceEditor
        id={source.id}
        slug={project.slug}
        initial={{ title: source.title, metaDescription: source.metaDescription, body: source.body }}
        updatedAt={source.updatedAt}
        fileSha={source.fileSha}
        url={source.url}
        route={source.route}
        repo={source.repo}
        autoMerge={source.autoMerge}
        styles={editorStyles(project)}
        lang={lang}
        dir={RTL.has(lang) ? "rtl" : "ltr"}
        metaLine={metaLine}
        siteUrl={source.route === "hosted" ? siteOrigin(project) : (project.wp_url ?? `https://${project.domain}`)}
      />
    </div>
  );
}
