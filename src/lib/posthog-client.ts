import type { PostHog } from "posthog-js";

import { analyticsConfigured, readConsent } from "./analytics-consent";

// The single place browser-side PostHog is allowed to start.
//
// init() used to run at module load in instrumentation-client.ts, which meant
// autocapture and session recording began before the visitor had any say. It
// now runs from here, and only after readConsent() === "granted" - either at
// load (returning visitor who already agreed) or the moment they click Accept.
//
// The LIBRARY is loaded here too, and only then. posthog-js is ~73 KB
// gzipped; a static import put it in the main bundle of every page for
// every visitor, consented or not, and on every self-host install that has
// no token at all. The dynamic import below ships it only to a browser that
// is about to init it. Nothing else in the app imports posthog-js: identify
// and reset go through the helpers at the bottom.
//
// Idempotent on purpose: instrumentation-client calls startPostHog on boot
// and the banner calls it again on Accept, and posthog-js does not enjoy
// being init'd twice.
let instance: PostHog | null = null;
let starting: Promise<void> | null = null;

export function startPostHog(): void {
  void ensurePostHog();
}

/** The initialised client, loading and starting it if consent allows; null
 *  when analytics is off or not (yet) consented to. */
export function ensurePostHog(): Promise<PostHog | null> {
  if (instance) return Promise.resolve(instance);
  if (!analyticsConfigured() || readConsent() !== "granted") return Promise.resolve(null);
  starting ??= import("posthog-js")
    .then(({ default: posthog }) => {
      posthog.init(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN as string, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
        defaults: "2026-05-30",
      });
      instance = posthog;
    })
    .catch(() => {
      // A blocked or failed download: analytics simply stays off. The next
      // startPostHog() (a navigation, another Accept) tries again.
      starting = null;
    });
  return starting.then(() => instance);
}

// Whether it is safe to call into posthog-js. Calling an uninitialised
// instance is not a no-op, so every call site goes through the helpers below,
// which check for it - otherwise declining analytics would turn the logout
// link into a thrown error.
export function posthogReady(): boolean {
  return instance != null;
}

/** identify(), once the client is up; nothing when analytics is off. */
export function posthogIdentify(distinctId: string, properties?: Record<string, unknown>): void {
  void ensurePostHog().then((p) => p?.identify(distinctId, properties));
}

/** reset() on the running client - at once when it is up, else as soon as
 *  a load already under way finishes (a logout a moment after boot). A
 *  client that never starts holds no identity to drop. */
export function posthogReset(): void {
  if (instance) instance.reset();
  else void ensurePostHog().then((p) => p?.reset());
}
