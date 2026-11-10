"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FirstArticleWait, type FirstArticleProgress } from "@/components/setup-stage/wait";

// The first-article card, in place of every dashboard page's content until
// the site's first article is live (the layout decides when). Every 20
// seconds it asks a small route (api/first-article/status) whether the
// answer moved, and re-reads the page only then - so the steps tick by
// themselves and the normal dashboard appears on its own once the article
// is out, without re-rendering the hidden page under it on every tick.
//
// A few pages stay reachable: billing and settings (the owner may need to
// cancel, or fix what a stuck step links to) and Google (the stuck Google
// step sends the owner there to pick the property).
//
// And one article's own page (/articles/<id>, its editor included): with
// review before publishing on, the first article waits there for the
// owner's Publish, so it has to open while the card still holds every other
// page. The list (/articles) stays behind the card.
const EXEMPT = ["/billing", "/settings", "/google"];
const ARTICLE_PAGE = /^\/articles\/[^/]+(\/edit)?$/;

const POLL_MS = 20_000;

export function FirstArticleCard({
  siteName,
  progress,
  estimate,
  stateKey,
  children,
}: {
  siteName: string;
  progress: FirstArticleProgress;
  estimate?: string;
  /** firstArticleKey() of what this card shows; a different key from the
   *  status route means the server has news. */
  stateKey: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const exempt = EXEMPT.some((p) => pathname === p || pathname.startsWith(`${p}/`)) || ARTICLE_PAGE.test(pathname);
  const lastKey = useRef(stateKey);
  lastKey.current = stateKey;

  useEffect(() => {
    if (exempt) return;
    let busy = false;
    const t = setInterval(async () => {
      // A hidden tab has no one reading it; check when it is looked at.
      if (document.visibilityState !== "visible" || busy) return;
      busy = true;
      try {
        const res = await fetch("/api/first-article/status", { cache: "no-store" });
        // Signed out meanwhile: a full refresh runs the page's auth gate,
        // which sends the owner to /login as it always did.
        if (res.status === 401) {
          router.refresh();
          return;
        }
        if (!res.ok) return;
        const { key } = (await res.json()) as { key: string | null };
        if (key && key !== lastKey.current) {
          lastKey.current = key;
          router.refresh();
        }
      } catch {
        // Network blip: the next tick asks again.
      } finally {
        busy = false;
      }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [exempt, router]);

  if (exempt) return <>{children}</>;
  return (
    <>
      <FirstArticleWait siteName={siteName} progress={progress} estimate={estimate} />
      <p className="mx-auto mt-6 w-full max-w-3xl text-center text-[13px] text-ink-faint">
        <Link href="/settings" className="hover:text-ink-muted">
          Settings
        </Link>
        <span aria-hidden="true"> · </span>
        <Link href="/billing" className="hover:text-ink-muted">
          Billing
        </Link>
      </p>
    </>
  );
}
