"use client";

import { useState } from "react";
import { DispatchMark } from "@/components/logo";
import { cx } from "./styles";

/** The site's own favicon (via Google's favicon service, which answers for
 *  any public domain), falling back to the DispatchSEO radio when it can't
 *  load. Decorative: the site name always sits right next to it. */
export function SiteIcon({ domain, className = "" }: { domain: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const host = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (failed || !host) return <DispatchMark className={cx("h-8 w-8", className)} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`}
      alt=""
      aria-hidden="true"
      width={32}
      height={32}
      onError={() => setFailed(true)}
      className={cx("h-8 w-8 rounded-lg bg-surface-2 object-contain p-1 ring-1 ring-line", className)}
    />
  );
}
