"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FirstArticleWait, type FirstArticleProgress } from "@/components/setup-stage/wait";

// The first-article card, in place of every dashboard page's content until
// the site's first article is live (the layout decides when). Re-reads the
// server every 20 seconds, so the steps tick by themselves and the normal
// dashboard appears on its own once the article is out.
//
// A few pages stay reachable: billing and settings (the owner may need to
// cancel, or fix what a stuck step links to) and Google (the stuck Google
// step sends the owner there to pick the property).
const EXEMPT = ["/billing", "/settings", "/google"];

const POLL_MS = 20_000;

export function FirstArticleCard({
  siteName,
  progress,
  estimate,
  children,
}: {
  siteName: string;
  progress: FirstArticleProgress;
  estimate?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const exempt = EXEMPT.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  useEffect(() => {
    if (exempt) return;
    const t = setInterval(() => {
      // A hidden tab has no one reading it; refresh when it is looked at.
      if (document.visibilityState === "visible") router.refresh();
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
