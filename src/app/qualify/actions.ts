"use server";

import { requireDashboard } from "@/lib/auth-gate";
import { isCloudMode } from "@/lib/cloud";
import { isAiChoice, isSiteKind } from "@/lib/qualifier-options";
import { runQualifier, type QualifierVerdict } from "@/lib/qualifier";
import { labelFor } from "@/lib/site-platform";

export type QualifyState = {
  siteKind?: string;
  domain?: string;
  ai?: string;
  verdict?: QualifierVerdict;
  /** One line naming what we detected, shown small under the verdict. */
  detected?: string;
  error?: string;
} | null;

// Deliberately does NOT redirect on success. The owner reads what we found
// about their own site and clicks through themselves - being bounced straight
// to a pricing table would throw away the one moment where we tell them
// something true about their setup.

export async function submitQualifier(_prev: QualifyState, formData: FormData): Promise<QualifyState> {
  const auth = await requireDashboard();
  if (!isCloudMode() || !auth.user) return { error: "Not available on this install." };

  const siteKind = String(formData.get("site_kind") ?? "").trim();
  const domain = String(formData.get("domain") ?? "").trim();
  // Cloud is the hosted writer since 2026-10-23: the owner brings no AI, so
  // the form no longer asks and every answer is recorded as "hosted".
  const ai = "hosted";

  if (!isSiteKind(siteKind)) return { siteKind, domain, ai, error: "Pick what kind of site it is." };
  if (!isAiChoice(ai)) return { siteKind, domain, ai, error: "Something went wrong - reload and try again." };
  // The domain is optional. When given, a cheap shape check before we spend a
  // fetch on it. Deliberately loose: an exotic but real TLD must not be
  // refused by a regex, so anything with a dot and no spaces gets through to
  // the real probe.
  const host = domain ? domain.replace(/^https?:\/\//i, "").replace(/\/.*$/, "") : "";
  if (host && !/^[^\s/]+\.[^\s/]+$/.test(host)) {
    return {
      siteKind,
      domain,
      ai,
      error: "That doesn't look like a website address. Try something like yoursite.com, or leave it empty.",
    };
  }

  try {
    const { platform, verdict } = await runQualifier(auth.user.id, host || null, ai, siteKind);
    const bits: string[] = [];
    if (host) {
      bits.push(labelFor(platform.platform));
      if (platform.wordpress?.version) bits.push(`version ${platform.wordpress.version}`);
      if (platform.wordpress?.elementor) bits.push("Elementor");
      if (platform.wordpress?.seoPlugin) bits.push(platform.wordpress.seoPlugin);
    }
    return { siteKind, domain: host, ai, verdict, detected: bits.length ? bits.join(", ") : undefined };
  } catch {
    // A probe failure must never strand someone mid-signup. Let them through
    // rather than blocking on our own outage - the gate exists to prevent a
    // doomed signup, and it must not become one.
    return {
      siteKind,
      domain: host,
      ai,
      verdict: {
        ok: true,
        building: false,
        headline: "We couldn't check your site just now",
        detail:
          "Our check didn't run, which is on us, not your site. You can carry on, and setup will tell you if anything is missing.",
      },
    };
  }
}
