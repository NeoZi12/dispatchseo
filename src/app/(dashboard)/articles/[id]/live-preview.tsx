import { fetchPageMeta } from "@/lib/writer/fetch";
import { pageScreenshot, takeAndStore } from "@/lib/page-screenshot";

// What a live article looks like, for the detail screen's preview, when no
// screenshot is stored yet (the page shows a stored one through /api/preview
// without coming here). Best first: a real screenshot of the page, taken now
// and stored for every view after this one (page-screenshot.ts; before 0071
// is applied, cached a week instead), else a card from the page's own title
// and description (read through the writer's private-address-refusing
// fetch). Always fills its parent; the
// frame around it is the page's.
//
// This first screenshot is inlined as a data URI: it is already in hand, and
// a round trip to /api/preview would only fetch it back.

export type PreviewKind = "screenshot" | "card";

export async function LivePreview({ projectId, url, title, store }: { projectId: string; url: string; title: string; store: boolean }) {
  const shot = store ? await takeAndStore(projectId, url) : await pageScreenshot(url);
  if (shot) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={`data:image/jpeg;base64,${shot}`} alt="" width={1280} height={800} decoding="async" data-preview="screenshot" className="block h-full w-full object-cover object-top" />
    );
  }
  // No screenshot: a plain card from the page's own title and description.
  // Never the site's share image - it looks nothing like the page itself
  // and passed for a broken preview (owner, 2026-11-05).
  const meta = await fetchPageMeta(url);
  let host = url;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    // keep the raw url
  }
  return (
    <div data-preview="card" className="flex h-full w-full flex-col justify-between bg-gradient-to-br from-surface-2 to-surface p-6 sm:p-7">
      <div className="flex items-center gap-2 text-[13px] text-ink-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`} alt="" aria-hidden="true" width={20} height={20} className="h-5 w-5 rounded" />
        <span className="truncate">{meta?.siteName ?? host}</span>
      </div>
      <div className="min-w-0">
        <p className="line-clamp-3 text-balance text-[1.15rem] font-semibold leading-snug tracking-tight text-ink sm:text-[1.3rem]">{meta?.title ?? title}</p>
        {meta?.description ? <p className="mt-2 line-clamp-2 text-[13.5px] leading-relaxed text-ink-muted">{meta.description}</p> : null}
      </div>
      <p className="truncate text-[12.5px] text-ink-faint">{url.replace(/^https?:\/\//, "")}</p>
    </div>
  );
}
