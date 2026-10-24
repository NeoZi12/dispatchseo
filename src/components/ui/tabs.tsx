import Link from "next/link";
import { cx, FOCUS_RING } from "./styles";

export type TabItem = { href: string; label: string; count?: number; active: boolean };

/** Link-based tabs: each tab is a URL (?status=held), so a filtered view is
 *  shareable, survives reload and needs no client JS. Underline marks the
 *  current one; scrolls sideways on a narrow screen instead of wrapping. */
export function Tabs({ items, label, className = "" }: { items: TabItem[]; label: string; className?: string }) {
  return (
    // The hairline lives on the outer nav and the scrolling happens one level
    // in, with vertical overflow clipped: a box that scrolls sideways also
    // scrolls vertically, so a tab hanging 1px below it (the old -mb-px
    // border overlap) drew a vertical scrollbar on Macs with scrollbars set
    // to always show. The scroll box is a wrapper, NOT the list itself: the
    // list is min-w-max so the tabs never wrap, and an element that cannot
    // shrink cannot scroll either - it just made the whole page pan sideways
    // on a phone (audit, 2026-10-24).
    <nav aria-label={label} className={cx("border-b border-line", className)}>
      <div className="-mx-1 overflow-x-auto overflow-y-hidden px-1">
      <ul className="flex min-w-max gap-1">
        {items.map((t) => (
          <li key={t.href}>
            <Link
              href={t.href}
              scroll={false}
              aria-current={t.active ? "page" : undefined}
              className={cx(
                "relative inline-flex h-10 items-center gap-2 rounded-t-md px-3 text-sm transition-colors",
                t.active
                  ? "font-medium text-ink after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-accent"
                  : "text-ink-muted hover:text-ink",
                FOCUS_RING,
              )}
            >
              {t.label}
              {t.count != null ? (
                <span className={cx("text-[12px] tabular-nums", t.active ? "text-ink-muted" : "text-ink-faint")}>{t.count}</span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
      </div>
    </nav>
  );
}
