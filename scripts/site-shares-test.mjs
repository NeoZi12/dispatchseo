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
const { researchComingBackEmpty, researchEveryMs, RESEARCH_EVERY_MS, SLOW_RESEARCH_EVERY_MS } = await import("../src/lib/autopilot/math.ts");

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

// --- the dry remainder (fix 1e): held only when no site may safely take it ---
{
  const r = autoShares({ pool: 15, sites: [site("a", { safeMax: 4 }), site("b", { dry: true })] });
  eq({ ...asObj(r.shares), held: r.held }, { a: 4, b: 11, held: 0 }, "1e: articles the dry cap held back go to the dry site");
}
{
  const r = autoShares({ pool: 15, sites: [site("a", { safeMax: 4 }), site("b", { dry: true, safeMax: 4 })] });
  eq({ ...asObj(r.shares), held: r.held }, { a: 4, b: 4, held: 7 }, "1e: the dry remainder still respects the safe maximum");
}
{
  const r = autoShares({ pool: 15, sites: [site("a", { dry: true }), site("b", { dry: true }), site("c", { safeMax: 4 })] });
  eq({ ...asObj(r.shares), held: r.held }, { a: 6, b: 5, c: 4, held: 0 }, "1e: the dry remainder goes round-robin, oldest first");
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

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
