// A one-minute, in-process memo for the owner reports (owner, 2026-11-09:
// "the owner dashboard is a bit slow"). Every /owner tab rebuilt the same
// customers report - six database reads plus a Polar call per subscription -
// on every click, about a second each. The reports are analytics, a minute
// stale is invisible, so the second tab within a minute reuses the first
// one's answer on a warm instance. In flight requests are shared too: two
// tabs opened together run the report once. Server-only.

const TTL_MS = 60_000;

type Entry<T> = { at: number; value: Promise<T> };

export function memoMinute<A extends unknown[], T>(keyOf: (...args: A) => string, fn: (...args: A) => Promise<T>): (...args: A) => Promise<T> {
  const cache = new Map<string, Entry<T>>();
  return (...args: A) => {
    const key = keyOf(...args);
    const hit = cache.get(key);
    const now = Date.now();
    if (hit && now - hit.at < TTL_MS) return hit.value;
    const value = fn(...args);
    cache.set(key, { at: now, value });
    // A failed read is not kept: the next request tries again.
    value.catch(() => {
      if (cache.get(key)?.value === value) cache.delete(key);
    });
    return value;
  };
}
