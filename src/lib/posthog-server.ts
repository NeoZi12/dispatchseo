import { PostHog } from "posthog-node";

import { db } from "./db";

// Server-side PostHog for Next.js App Router server actions/route handlers:
// short-lived functions need flushAt/flushInterval at their minimum and an
// explicit _shutdown() per call so a queued event isn't lost when the
// function exits before the batched flush would have fired (the plain
// `shutdown()` on this SDK version is a sync, fire-and-forget compat shim -
// `_shutdown()` is the one that actually returns the flush promise). Returns
// null when no token is configured (self-host installs that haven't opted
// into their own PostHog project), so every export below silently no-ops.
function client(): PostHog | null {
  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  if (!token) return null;
  return new PostHog(token, {
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    flushAt: 1,
    flushInterval: 0,
  });
}

// Analytics must never be able to fail the thing it is only watching. Every
// call below runs AFTER the real work has committed - a subscription written,
// a session created, a checkout opened - and each is awaited by its caller, so
// a rejection here surfaces as that operation failing.
//
// The SDK's _shutdown() is a Promise.race that REJECTS on its own timeout
// (plain network errors it swallows, but a slow PostHog rejects, after burning
// 30 seconds of function budget first). That put a third party's bad minute in
// front of the Polar webhook - which answers non-2xx, gets retried, and after
// ten of those Polar disables the webhook for every customer - and in front of
// the auth callback, where it would bounce a correctly-signed-in user to
// /login?error=1. One wrapper closes all 20 call sites.
async function flush(ph: PostHog): Promise<void> {
  try {
    await ph._shutdown(2000);
  } catch {
    // An unsent analytics event is not worth a word to the user.
  }
}

// The same event, kept in our own app_events table (migration 0073) so the
// owner's funnel (/owner) reads without PostHog - and on installs that never
// configured it. Same contract as the PostHog path: after the real work, and
// a failed insert is worth nothing to the caller.
async function keep(distinctId: string, event: string, properties?: Record<string, unknown>): Promise<void> {
  try {
    await db().from("app_events").insert({ distinct_id: distinctId, event, props: properties ?? {} });
  } catch {
    return;
  }
}

export async function captureServer(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>,
): Promise<void> {
  await keep(distinctId, event, properties);
  const ph = client();
  if (!ph) return;
  try {
    ph.capture({ distinctId, event, properties });
  } catch {
    return;
  }
  await flush(ph);
}

export async function identifyServer(
  distinctId: string,
  properties?: Record<string, unknown>,
): Promise<void> {
  const ph = client();
  if (!ph) return;
  try {
    ph.identify({ distinctId, properties });
  } catch {
    return;
  }
  await flush(ph);
}

export async function captureServerException(
  distinctId: string,
  error: unknown,
  properties?: Record<string, unknown>,
): Promise<void> {
  const ph = client();
  if (!ph || !(error instanceof Error)) return;
  try {
    await ph.captureExceptionImmediate(error, distinctId, properties);
  } catch {
    return;
  }
  await flush(ph);
}
