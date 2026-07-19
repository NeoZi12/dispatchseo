import { db } from "@/lib/db";

// Shared core for the cloud waitlist - the landing-page form and the MCP
// join_waitlist tool both land here (the parity rule). Duplicate emails are
// a success, not an error: signing up twice means "yes, still interested",
// and telling a stranger "already registered" leaks who is on the list.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && EMAIL_RE.test(email);
}

// Owner notification through the same Resend channel the cron alerts use.
// Optional (no RESEND_API_KEY + ALERT_EMAIL = silently skipped) and
// best-effort: a mail failure must never fail the signup.
async function notifyOwner(email: string, source: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ALERT_EMAIL;
  if (!apiKey || !to) return;
  const from = process.env.ALERT_EMAIL_FROM ?? "DispatchSEO <onboarding@resend.dev>";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to,
        subject: `DispatchSEO waitlist: ${email}`,
        text:
          `New waitlist signup.\n\n` +
          `Email: ${email}\n` +
          `Source: ${source}\n\n` +
          `Full list: Supabase -> Table Editor -> waitlist_signups.`,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.error(`[waitlist] notify email failed: HTTP ${res.status}`);
    }
  } catch (e) {
    console.error("[waitlist] notify email failed:", e);
  }
}

// Per-IP rate limit (migration 0024): 5 attempts per hour. Only the public
// landing form calls this - the MCP join_waitlist tool is already behind a
// bearer token. Fails OPEN (allowed) if the migration has not run, matching
// the login-lockout posture.
export async function waitlistAttemptAllowed(ip: string): Promise<boolean> {
  const { data, error } = await db().rpc("record_waitlist_attempt", { attempt_ip: ip });
  if (error) {
    console.error("[waitlist] record_waitlist_attempt failed:", error.message);
    return true;
  }
  return data !== false;
}

export async function joinWaitlist(
  email: string,
  source: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const normalized = email.trim().toLowerCase();
  if (!isValidEmail(normalized)) {
    return { ok: false, error: "invalid email" };
  }
  // .select() reveals whether the upsert actually inserted: fresh rows come
  // back, ignored duplicates return an empty array - so re-signups never
  // re-notify.
  const { data, error } = await db()
    .from("waitlist_signups")
    .upsert(
      { email: normalized, source },
      { onConflict: "email", ignoreDuplicates: true },
    )
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (data && data.length > 0) await notifyOwner(normalized, source);
  return { ok: true };
}
