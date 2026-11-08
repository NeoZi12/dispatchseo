"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// Lives apart from add-site-dialog.tsx on purpose: the switcher needs this
// hook on every page but the dialog only when it opens, and a static import
// of the dialog's module (31 KB of source, the whole wizard form) rode along
// with the hook. The dialog itself is loaded on demand (project-switcher).
// Opens the dialog from ?add=1 so anything outside the switcher can point at
// it with a plain link - /new redirects here rather than to the wizard, and a
// bookmarked URL keeps working. The param is stripped on open so a refresh
// (or Back) doesn't reopen a dialog the owner already dismissed.
export function useAddSiteParam(onOpen: () => void) {
  const params = useSearchParams();
  const router = useRouter();
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current || params.get("add") !== "1") return;
    fired.current = true;
    onOpen();
    const next = new URLSearchParams(params.toString());
    next.delete("add");
    const qs = next.toString();
    router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false });
  }, [params, router, onOpen]);
}
