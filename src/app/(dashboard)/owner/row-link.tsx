"use client";

import { useRouter } from "next/navigation";

import { cx, FOCUS_RING } from "@/components/ui/styles";

// A table row that is a link: the whole row opens the customer (owner,
// 2026-11-09: "make the whole row clickable, not just the email"). A soft
// navigation, so the @modal intercept catches it and the customer opens in
// the pop-up over the list. Enter does the same from the keyboard; a real
// link or button inside the row keeps its own click.
export function ClickRow({ href, className = "", children }: { href: string; className?: string; children: React.ReactNode }) {
  const router = useRouter();
  const go = () => router.push(href, { scroll: false });
  return (
    <tr
      role="link"
      tabIndex={0}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a, button")) return;
        go();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) go();
      }}
      onMouseEnter={() => router.prefetch(href)}
      className={cx("cursor-pointer", FOCUS_RING, className)}
    >
      {children}
    </tr>
  );
}
