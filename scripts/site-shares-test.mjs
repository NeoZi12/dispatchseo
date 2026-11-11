// Tests the multi-site plan arithmetic (src/lib/site-shares-core.ts): the
// pace a monthly share runs at, how stored shares resolve against a pool,
// the automatic split, the ramp's monthly cap and the month gate's
// comparison.
//
//   node --experimental-strip-types scripts/site-shares-test.mjs
//
// No env, no network, no database. site-shares-core.ts has no imports;
// autopilot/math.ts imports its neighbours without a file extension (the
// bundler resolves them), so a small resolve hook adds ".ts" for relative
// imports that name an existing .ts file.
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  autoShares,
  catchUpPace,
  customShareLimit,
  monthGateVerdict,
  paceFor,
  resolveShares,
  safeMaxFor,
  safeMaxForSite,
  sharesForPool,
} from "../src/lib/site-shares-core.ts";

registerHooks({
  resolve(spec, ctx, next) {
    if ((spec.startsWith("./") || spec.startsWith("../")) && !/\.[cm]?[jt]sx?$/.test(spec) && ctx.parentURL) {
      const url = new URL(spec + ".ts", ctx.parentURL);
      if (existsSync(fileURLToPath(url))) return next(url.href, ctx);
    }
    return next(spec, ctx);
  },
});
const { cadence, weekStartUtc, researchComingBackEmpty, researchEveryMs, RESEARCH_EVERY_MS, SLOW_RESEARCH_EVERY_MS } = await import("../src/lib/autopilot/math.ts");

let failed = 0;
let passed = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`);
  }
}
const asObj = (m) => Object.fromEntries(m);
const sum = (m) => [...m.values()].reduce((a, b) => a + b, 0);

// --- paceFor: the table in the build plan, section 1 ---
for (const [m, perWeek, spacing] of [
  [5, 2, 6],
  [15, 4, 2],
  [30, 7, 1],
  [9, 3, 3],
  [4, 1, 7],
  [2, 1, 15],
  [1, 1, 30],
]) {
  eq(paceFor(m), { articlesPerWeek: perWeek, spacingDays: spacing }, `paceFor(${m})`);
}
eq(paceFor(0), { articlesPerWeek: 0 }, "paceFor(0) writes nothing");
eq(paceFor(-3), { articlesPerWeek: 0 }, "paceFor(negative) writes nothing");

// --- resolveShares ---
eq(asObj(resolveShares(15, [{ id: "a", monthly_share: null }])), { a: 15 }, "one site with no share gets the whole pool");
eq(
  asObj(resolveShares(15, [{ id: "a", monthly_share: null }, { id: "b", monthly_share: null }, { id: "c", monthly_share: null }])),
  { a: 5, b: 5, c: 5 },
  "null shares split the pool evenly",
);
eq(
  asObj(resolveShares(16, [{ id: "a", monthly_share: null }, { id: "b", monthly_share: null }, { id: "c", monthly_share: null }])),
  { a: 6, b: 5, c: 5 },
  "the remainder of an even split goes to the oldest",
);
eq(
  asObj(resolveShares(15, [{ id: "a", monthly_share: 4 }, { id: "b", monthly_share: null }, { id: "c", monthly_share: null }])),
  { a: 4, b: 6, c: 5 },
  "null shares split what stored shares leave",
);
{
  // A Scale owner (30) with 12/10/8 stored, downgraded to Starter (5) before
  // the rebalance: the stored numbers must clamp, oldest first.
  const r = resolveShares(5, [{ id: "a", monthly_share: 12 }, { id: "b", monthly_share: 10 }, { id: "c", monthly_share: 8 }]);
  eq(asObj(r), { a: 5, b: 0, c: 0 }, "a downgrade clamps stored shares oldest first");
  eq(sum(r) <= 5, true, "sum never exceeds the pool after a downgrade");
}
eq(asObj(resolveShares(0, [{ id: "a", monthly_share: null }])), { a: 0 }, "a pool of 0 gives nothing");
eq(asObj(resolveShares(10, [{ id: "a", monthly_share: -2 }])), { a: 0 }, "a negative stored share reads as 0");

// --- autoShares: cases (a) to (f) of the build plan, section B9 ---
const site = (id, extra = {}) => ({ id, share_mode: "auto", monthly_share: null, safeMax: Infinity, dry: false, ...extra });
{
  const r = autoShares({ pool: 15, sites: [site("a"), site("b"), site("c")] });
  eq({ ...asObj(r.shares), held: r.held }, { a: 5, b: 5, c: 5, held: 0 }, "(a) pool 15, three full-speed sites -> 5/5/5");
}
{
  const r = autoShares({
    pool: 15,
    sites: [site("a", { safeMax: 9 }), site("b", { share_mode: "custom", monthly_share: 4 }), site("c", { dry: true })],
  });
  eq({ ...asObj(r.shares), held: r.held }, { b: 4, a: 9, c: 2, held: 0 }, "(b) pool 15, capped 9 / custom 4 / dry -> 9/4/2, held 0");
}
{
  // Changed 2026-11-11 (owner: "give me 30 articles"): the ramp only
  // weights the split, so one new site capped 4 still gets the pool.
  const r = autoShares({ pool: 30, sites: [site("a", { safeMax: 4 })] });
  eq({ ...asObj(r.shares), held: r.held }, { a: 30, held: 0 }, "(c) pool 30, one new site capped 4 -> 30, held 0");
}
{
  const r = autoShares({ pool: 5, sites: [site("a"), site("b"), site("c")] });
  eq({ ...asObj(r.shares), held: r.held }, { a: 2, b: 2, c: 1, held: 0 }, "(d) pool 5, three sites -> 2/2/1 oldest first");
}
{
  const r = autoShares({ pool: 15, sites: [site("a", { safeMax: 0 }), site("b")] });
  eq({ ...asObj(r.shares), held: r.held }, { a: 0, b: 15, held: 0 }, "(e) a paused site (cap 0) gets 0");
}
{
  const r = autoShares({
    pool: 15,
    sites: [site("a", { share_mode: "custom", monthly_share: 10 }), site("b", { share_mode: "custom", monthly_share: 10 }), site("c")],
  });
  eq({ ...asObj(r.shares), held: r.held }, { a: 10, b: 5, c: 0, held: 0 }, "(f) customs over the pool are clamped oldest first");
}
{
  const r = autoShares({ pool: 2, sites: [site("a"), site("b"), site("c")] });
  eq({ ...asObj(r.shares), held: r.held }, { a: 1, b: 1, c: 0, held: 0 }, "a pool smaller than the site count runs out oldest first");
}
{
  const r = autoShares({ pool: 15, sites: [site("a", { share_mode: "custom", monthly_share: null }), site("b")] });
  eq({ ...asObj(r.shares), held: r.held }, { a: 8, b: 7, held: 0 }, "a custom site with no number counts as auto");
}
{
  // Every result keeps the two guarantees: nothing negative, sum + held = pool.
  for (const pool of [0, 1, 5, 15, 30]) {
    const r = autoShares({ pool, sites: [site("a", { safeMax: 4 }), site("b", { dry: true }), site("c", { share_mode: "custom", monthly_share: 7 })] });
    eq([...r.shares.values()].every((v) => v >= 0) && sum(r.shares) + r.held === pool, true, `autoShares accounts for the whole pool of ${pool}`);
  }
}

// --- the used floor (fix 1d): a share never drops below this month's use ---
{
  const r = autoShares({ pool: 15, sites: [site("a", { safeMax: 4, used: 6 }), site("b"), site("c")] });
  eq(r.shares.get("a"), 6, "1d: a site that used 6 keeps 6 even when its ramp now caps it at 4");
  eq(sum(r.shares) + r.held, 15, "1d: the floor still accounts for the whole pool");
}
{
  const r = autoShares({ pool: 5, sites: [site("c1", { share_mode: "custom", monthly_share: 4 }), site("a", { used: 3 })] });
  eq({ ...asObj(r.shares), held: r.held }, { c1: 4, a: 1, held: 0 }, "1d: the floor is limited by what the pool allows");
}
{
  const r = autoShares({ pool: 15, sites: [site("a", { safeMax: 0, used: 2 }), site("b")] });
  eq({ ...asObj(r.shares), held: r.held }, { a: 2, b: 13, held: 0 }, "1d: a paused site keeps what it already used, nothing more");
}

// --- the whole pool is always handed out (owner, 2026-11-11) ---
{
  const r = autoShares({ pool: 30, sites: [site("a", { safeMax: 9 }), site("b", { safeMax: 9 }), site("c", { share_mode: "custom", monthly_share: 4 })] });
  eq({ ...asObj(r.shares), held: r.held }, { c: 4, a: 13, b: 13, held: 0 }, "pool 30, ramp caps 9 / 9 and a custom 4 -> 13 / 13 / 4, held 0");
}
{
  const r = autoShares({ pool: 30, sites: [site("a"), site("b", { safeMax: 9 }), site("c", { safeMax: 4 })] });
  const [a, b, c] = ["a", "b", "c"].map((k) => r.shares.get(k));
  eq(sum(r.shares) === 30 && r.held === 0, true, "pool 30, caps Infinity / 9 / 4 -> all 30 handed out");
  eq(a > b && b > c, true, `caps Infinity / 9 / 4 -> the oldest gets the most, the newest the least (${a} / ${b} / ${c})`);
}
{
  const r = autoShares({ pool: 30, sites: [site("a", { safeMax: 4 }), site("b", { dry: true })] });
  eq({ ...asObj(r.shares), held: r.held }, { a: 28, b: 2, held: 0 }, "a dry site takes leftovers only after the non-dry sites");
}
{
  const r = autoShares({ pool: 15, sites: [site("a", { dry: true }), site("b", { dry: true }), site("c", { safeMax: 4 })] });
  eq({ ...asObj(r.shares), held: r.held }, { a: 2, b: 2, c: 11, held: 0 }, "leftovers go to the site that is not dry");
}
{
  const r = autoShares({ pool: 15, sites: [site("a", { dry: true }), site("b", { dry: true, safeMax: 4 })] });
  eq({ ...asObj(r.shares), held: r.held }, { a: 8, b: 7, held: 0 }, "with only dry sites, they take the leftovers round-robin, oldest first");
}
{
  const r = autoShares({ pool: 15, sites: [site("a", { safeMax: 0 }), site("b", { safeMax: 0 }), site("c", { share_mode: "custom", monthly_share: 4 })] });
  eq({ ...asObj(r.shares), held: r.held }, { c: 4, a: 0, b: 0, held: 11 }, "every auto site paused -> held is what the customs leave");
}
{
  const r = autoShares({ pool: 15, sites: [site("a", { share_mode: "custom", monthly_share: 6 })] });
  eq({ ...asObj(r.shares), held: r.held }, { a: 6, held: 9 }, "customs with no auto site to take the rest -> held");
}
{
  const r = autoShares({ pool: 15, sites: [site("a", { safeMax: 4, canWrite: false }), site("b", { safeMax: 4 })] });
  eq({ ...asObj(r.shares), held: r.held }, { a: 4, b: 11, held: 0 }, "a site that cannot write gets no leftovers past its cap");
}

// --- one pooled site always gets the whole pool (fix 1b) ---
eq(asObj(sharesForPool(15, [{ id: "a", monthly_share: 4 }])), { a: 15 }, "1b: a single site's stored 4 never cuts its month below the pool");
eq(asObj(sharesForPool(15, [{ id: "a", monthly_share: 4 }, { id: "b", monthly_share: null }])), { a: 4, b: 11 }, "1b: two sites resolve as stored");

// --- paused or unfinished sites take nothing from the pool (fix 2) ---
eq(safeMaxForSite({ paused: true, setupDone: true }, Infinity), 0, "a paused site's safe maximum is 0");
eq(safeMaxForSite({ paused: false, setupDone: false }, 9), 0, "a site whose setup isn't finished has a safe maximum of 0");
eq(safeMaxForSite({ paused: false, setupDone: true }, 9), 9, "a running, set-up site keeps its ramp's maximum");

// --- research slows to four-weekly only when the last two runs kept nothing (fix 4) ---
eq(researchComingBackEmpty({ recent_added: [0, 0], research_backoff_until: null }), true, "two empty runs: coming back empty");
eq(researchComingBackEmpty({ recent_added: [1, 0], research_backoff_until: null }), false, "a run that kept one idea is still finding things");
eq(researchComingBackEmpty({ recent_added: [0], research_backoff_until: null }), false, "one run is not a history");
eq(researchComingBackEmpty({ recent_added: [], research_backoff_until: null }), false, "never researched is not empty");
eq(researchEveryMs({ recent_added: [0, 0], research_backoff_until: null }), SLOW_RESEARCH_EVERY_MS, "two empty runs: every four weeks");
eq(researchEveryMs({ recent_added: [1, 1], research_backoff_until: null }), RESEARCH_EVERY_MS, "one idea a run: weekly as before");

// --- safeMaxFor: the ramp's weekly ceiling as a monthly cap ---
eq(safeMaxFor({ quota: 1, stage: "ramp-1" }), 4, "ramp quota 1 -> 4 a month");
eq(safeMaxFor({ quota: 2, stage: "ramp-2" }), 9, "ramp quota 2 -> 9 a month");
eq(safeMaxFor({ quota: 99, stage: "full" }), Infinity, "full speed -> no cap");
eq(safeMaxFor({ quota: 0, stage: "pause" }), 0, "pause -> 0");

// --- the month gate's comparison ---
eq(monthGateVerdict({ share: 5, pool: 15, siteCount: 5, ownerCount: 9 }), "share used", "month gate: this site's share is used");
eq(monthGateVerdict({ share: 5, pool: 15, siteCount: 3, ownerCount: 15 }), "plan used", "month gate: the pool is used across the sites");
eq(monthGateVerdict({ share: 5, pool: 15, siteCount: 4, ownerCount: 14 }), null, "month gate: allowed");
eq(monthGateVerdict({ share: 0, pool: 15, siteCount: 0, ownerCount: 3 }), null, "month gate: a share of 0 is left to cadence()");

// --- the Custom stepper's upper bound ---
eq(customShareLimit(15, 4), 11, "custom limit = pool minus other customs");
eq(customShareLimit(5, 9), 0, "custom limit never goes negative");

// --- an idle site (paused, setup unfinished) holds nothing ---
eq(asObj(resolveShares(15, [{ id: "a", monthly_share: null }, { id: "b", monthly_share: null, idle: true }])), { b: 0, a: 15 }, "idle: a site in setup takes none of an unset split");
eq(asObj(resolveShares(15, [{ id: "a", monthly_share: 5 }, { id: "b", monthly_share: null, idle: true }])), { a: 5, b: 0 }, "idle: it does not take what an older stored share left either");
eq(asObj(resolveShares(15, [{ id: "a", monthly_share: 10, share_mode: "custom", idle: true }, { id: "b", monthly_share: 12 }])), { a: 0, b: 12 }, "idle: a paused Custom site holds 0, so its sibling's share is not clamped");
eq(asObj(sharesForPool(15, [{ id: "a", monthly_share: 3, idle: true }])), { a: 15 }, "idle: one site alone still reads the whole pool");
eq(safeMaxForSite({ paused: false, setupDone: true, canPublish: false }, Infinity), 0, "a site with nowhere to publish takes nothing");
eq(safeMaxForSite({ paused: false, setupDone: true }, 9), 9, "canPublish absent = it can");

// --- catching up on the month ---
eq(catchUpPace({ share: 15, used: 0, dayOfMonth: 1, daysInMonth: 30, spacingDays: 2, quota: 4 }), { spacingDays: 2, quota: 4 }, "catch-up: on schedule, the plan's own pace");
eq(catchUpPace({ share: 15, used: 1, dayOfMonth: 4, daysInMonth: 30, spacingDays: 2, quota: 4 }), { spacingDays: 1, quota: 7 }, "catch-up: a skipped day shortens the wait");
eq(catchUpPace({ share: 15, used: 0, dayOfMonth: 1, daysInMonth: 28, spacingDays: 2, quota: 4 }), { spacingDays: 1, quota: 7 }, "catch-up: February starts closer together");
eq(catchUpPace({ share: 30, used: 3, dayOfMonth: 9, daysInMonth: 30, spacingDays: 1, quota: 7 }), { spacingDays: 1, quota: 7 }, "catch-up: never closer than a day apart");
eq(catchUpPace({ share: 5, used: 5, dayOfMonth: 20, daysInMonth: 30, spacingDays: 6, quota: 2 }), { spacingDays: 6, quota: 2 }, "catch-up: a used-up share is left alone");
eq(catchUpPace({ share: 15, used: 2, dayOfMonth: 20, daysInMonth: 30, spacingDays: 2, quota: 0 }), { spacingDays: 2, quota: 0 }, "catch-up: the index brake's 0 stays 0");
eq(catchUpPace({ share: 9, used: 8, dayOfMonth: 5, daysInMonth: 30, spacingDays: 3, quota: 3 }), { spacingDays: 3, quota: 3 }, "catch-up: ahead of schedule never slows below the plan's spacing");

// A whole month through cadence(), the way the scheduler runs it: one pass a
// day, and the listed days skipped (no idea ready, a research day).
function monthRun({ share, year, month, skip = [], catchUp = true }) {
  const base = paceFor(share);
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  let used = 0;
  let last = null;
  const starts = [];
  for (let d = 1; d <= days; d++) {
    if (used >= share) break;
    const now = new Date(Date.UTC(year, month, d, 5, 30));
    if (skip.includes(d)) continue;
    const weekStart = weekStartUtc(now).getTime();
    const countThisWeek = starts.filter((t) => t >= weekStart).length;
    const pace = catchUp
      ? catchUpPace({ share, used, dayOfMonth: d, daysInMonth: days, spacingDays: base.spacingDays, quota: base.articlesPerWeek })
      : { spacingDays: base.spacingDays, quota: base.articlesPerWeek };
    const v = cadence({ now, quota: pace.quota, spacingDays: pace.spacingDays, countThisWeek, lastStartedAt: last });
    if (v.write) {
      used++;
      last = now.toISOString();
      starts.push(now.getTime());
    }
  }
  return used;
}
eq(monthRun({ share: 15, year: 2027, month: 1, catchUp: false }), 14, "before: Growth on one site got 14 of 15 in a 28-day February");
eq(monthRun({ share: 15, year: 2027, month: 3, skip: [5, 6, 7, 20], catchUp: false }) < 15, true, "before: skipped days cost Growth on one site an article");
eq(monthRun({ share: 15, year: 2027, month: 3, skip: [5] }), 15, "Growth on one site: a skipped day is made up");
eq(monthRun({ share: 15, year: 2027, month: 3, skip: [5, 6, 7, 20] }), 15, "Growth on one site: four skipped days are made up");
eq(monthRun({ share: 15, year: 2027, month: 1 }), 15, "Growth on one site: all 15 in a 28-day February");
eq(monthRun({ share: 5, year: 2027, month: 3, skip: [1, 2, 13] }), 5, "Starter: skipped days are made up");
eq(monthRun({ share: 9, year: 2027, month: 3, skip: [4, 10, 11] }), 9, "a share of 9: skipped days are made up");
eq(monthRun({ share: 30, year: 2027, month: 3 }), 30, "Scale on one site: 30 in a 30-day month with no skipped day");
eq(monthRun({ share: 30, year: 2027, month: 3, skip: [5] }), 29, "Scale on one site: one start a day is the ceiling, so a skipped day is not made up");

// --- the queue order: a topic the owner asked for comes before research ideas ---
const { sortIdeas } = await import("../src/lib/autopilot/idea-order.ts");
const order = (rows) => sortIdeas(rows).map((r) => r.id);
eq(
  order([
    { id: "big", keyword_volume: 1300, keyword_difficulty: 0, created_at: "2026-11-01" },
    { id: "owner-unmeasured", keyword_volume: null, keyword_difficulty: null, source: "owner", created_at: "2026-11-05" },
    { id: "owner-small", keyword_volume: 40, keyword_difficulty: 10, source: "owner", created_at: "2026-11-03" },
    { id: "pinned", keyword_volume: 10, keyword_difficulty: 80, queue_position: 0, created_at: "2026-11-06" },
  ]),
  ["pinned", "owner-small", "owner-unmeasured", "big"],
  "queue order: pinned first, then the owner's topics oldest first, then research by score",
);
eq(order([{ id: "a", keyword_volume: 590, keyword_difficulty: 0 }, { id: "b", keyword_volume: 720, keyword_difficulty: 9 }]), ["a", "b"], "queue order: research ideas still go by score");

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
