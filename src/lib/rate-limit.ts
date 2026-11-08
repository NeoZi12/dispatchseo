import { db } from "@/lib/db";

/**
 * Atomic fixed-window counter in Postgres (migration 0080, rate_limit_hit()).
 * Returns true when this hit is within `limit` for `key` in the current window,
 * false when the caller should refuse.
 *
 * Failure posture, deliberately asymmetric:
 * - A database error fails CLOSED (refuse) unless the caller passes failOpen -
 *   the limiter guards paid lookups and email sends, where "the ledger is down"
 *   must not mean "free for all".
 * - A MISSING function (the deploy went out ahead of migration 0080) fails OPEN
 *   with a loud log line: a schema lag must never lock every visitor out of
 *   sign-up. deploy-check's schema probe is where that lag gets surfaced.
 */
export async function rateLimitHit(
  key: string,
  limit: number,
  windowSeconds: number,
  opts: { failOpen?: boolean } = {},
): Promise<boolean> {
  try {
    const { data, error } = await db().rpc("rate_limit_hit", {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) {
      const text = `${error.code ?? ""} ${error.message ?? ""}`;
      const missing =
        /PGRST202|42883/.test(text) ||
        (/rate_limit_hit/.test(text) && /could not find|does not exist|schema cache/i.test(text));
      if (missing) {
        console.error("[rate-limit] rate_limit_hit() is missing - apply migration 0080. Allowing this hit.");
        return true;
      }
      console.error(`[rate-limit] ${key}: ${error.message}`);
      return Boolean(opts.failOpen);
    }
    return data === true;
  } catch (e) {
    console.error(`[rate-limit] ${key}:`, e instanceof Error ? e.message : e);
    return Boolean(opts.failOpen);
  }
}

/** Build a limiter key from a scope and parts; every part is bounded so a long
 * attacker-chosen value cannot bloat the key column. */
export function rateLimitKey(scope: string, ...parts: Array<string | null | undefined>): string {
  return [scope, ...parts.map((p) => (p ?? "unknown").trim().toLowerCase().slice(0, 200))].join("|");
}
