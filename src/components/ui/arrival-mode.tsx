"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef } from "react";

/**
 * The full arrival (globals.css "Arrival", ~1.5s) plays once, on the
 * session's first page load. From the first in-app navigation on, <html>
 * carries data-nav and every arrival is compressed to under 400ms, so moving
 * between screens feels instant rather than staged. A layout effect: it runs
 * after the new page commits and before the browser paints it, so nothing
 * starts at the slow pace and then jumps.
 */
export function ArrivalMode() {
  const pathname = usePathname();
  const first = useRef(true);
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    document.documentElement.dataset.nav = "1";
  }, [pathname]);
  return null;
}
