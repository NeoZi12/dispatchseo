"use client";

import { useState, type ReactNode } from "react";

// Monthly / yearly switch for the landing's pricing section. The cards are
// server-rendered with BOTH prices inside them (.pr-month / .pr-year); this
// component only flips a data attribute on the wrapper and CSS shows one set.
// Yearly is the default: it is the better deal, and annual billing is the
// strongest retention lever in this category. The tag shows the saving as a
// percentage computed from the price table, never typed by hand.
export function PricingSwitch({
  savingsPct,
  enabled,
  children,
}: {
  savingsPct: number;
  /** False when the yearly Polar products are not configured: the cards then
   *  carry only the monthly price, so there is nothing to switch - render the
   *  children alone rather than a toggle that does nothing. */
  enabled: boolean;
  children: ReactNode;
}) {
  const [interval, setInterval] = useState<"month" | "year">("year");
  if (!enabled) return <>{children}</>;
  return (
    <div data-interval={interval}>
      <div className="pt-switch" role="group" aria-label="Billing period">
        <button
          type="button"
          className={`pt-opt${interval === "month" ? " on" : ""}`}
          aria-pressed={interval === "month"}
          onClick={() => setInterval("month")}
        >
          Monthly
        </button>
        <button
          type="button"
          className={`pt-opt${interval === "year" ? " on" : ""}`}
          aria-pressed={interval === "year"}
          onClick={() => setInterval("year")}
        >
          Yearly
          {/* "up to": the yearly saving differs per tier (see TIER_LIMITS),
              so the caller passes the largest and the tag says so. */}
          <span className="pt-tag">save up to {savingsPct}%</span>
        </button>
      </div>
      {children}
    </div>
  );
}
