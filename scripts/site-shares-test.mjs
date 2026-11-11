// Tests the multi-site plan arithmetic (src/lib/site-shares-core.ts): the
// pace a monthly share runs at, how stored shares resolve against a pool,
// the automatic split, the ramp's monthly cap and the month gate's
// comparison.
//
//   node --experimental-strip-types scripts/site-shares-test.mjs
//
// No env, no network, no database: the module under test has no imports.
import {
  autoShares,
  customShareLimit,
  monthGateVerdict,
  paceFor,
  resolveShares,
  safeMaxFor,
} from "../src/lib/site-shares-core.ts";

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
  const r = autoShares({ pool: 30, sites: [site("a", { safeMax: 4 })] });
  eq({ ...asObj(r.shares), held: r.held }, { a: 4, held: 26 }, "(c) pool 30, one site capped 4 -> 4, held 26");
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

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
