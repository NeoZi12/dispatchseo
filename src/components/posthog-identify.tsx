"use client";

import { useEffect } from "react";

import { CONSENT_EVENT } from "@/lib/analytics-consent";
import { posthogIdentify } from "@/lib/posthog-client";

// Mounted once in the dashboard shell for signed-in CLOUD_MODE users. Links
// whatever anonymous distinct id this browser already has (landing page
// visits, the signup form) to the real Supabase user id - identify() is
// idempotent, so re-firing on every dashboard load is harmless.
//
// Gated on consent: posthog-js is not initialised until the visitor accepts,
// and identify() on an uninitialised instance throws rather than no-ops. The
// consent event covers accepting while already sitting on the dashboard, so
// the identity links without waiting for a navigation.
export function PostHogIdentify({ userId, email }: { userId: string; email: string | null }) {
  useEffect(() => {
    // posthogIdentify loads and starts the client first when consent
    // allows, and does nothing at all when it doesn't.
    const link = () => posthogIdentify(userId, email ? { email } : undefined);
    link();
    window.addEventListener(CONSENT_EVENT, link);
    return () => window.removeEventListener(CONSENT_EVENT, link);
  }, [userId, email]);
  return null;
}
