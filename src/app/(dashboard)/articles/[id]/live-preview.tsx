import { fetchPageMeta } from "@/lib/writer/fetch";
import { pageScreenshot } from "@/lib/page-screenshot";

// What a live article looks like, for the detail screen's preview, best
// first: a real screenshot of the page (Cloudflare Browser Rendering, cached
// a week - page-screenshot.ts), else the page's own share image (og:image,
// read through the writer's private-address-refusing fetch), else a card
// from the page's own title and description. Always fills its parent; the
// frame around it is the page's.
//
// The screenshot is inlined as a data URI rather than served by a route: no
// new endpoint, no auth surface, and the operator's ?site= view works as is.

export type PreviewKind = "screenshot" | "share-image" | "card";

export async function LivePreview({ url, title }: { url: string; title: string }) {
  const shot = await pageScreenshot(url);
  if (shot) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={`data:image/jpeg;base64,${shot}`} alt="" width={1280} height={800} decoding="async" data-preview="screenshot" className="block h-full w-full object-cover object-top" />
    );
  }
  const meta = await fetchPageMeta(url);
  if (meta?.image) {
    return (
      // The site's own share image, loaded by the browser from the site.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={meta.image} alt="" width={1200} height={630} decoding="async" referrerPolicy="no-referrer" data-preview="share-image" className="block h-full w-full object-cover object-top" />
    );
  }
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
