// Home's top surface: the agent reporting in. Replaces the old stack of
// disconnected banners (status pill, violet "researching", red "jobs need
// attention", sky "pipeline update") with ONE panel in which the agent speaks
// to the owner in the first person.
//
// The design idea, and everything below follows from it: the agent is a
// character, so it gets to stand there and be one. Big, unframed, headset on,
// blinking. It says hello and gives a single sentence, and that is the whole
// card until someone asks for more. The report itself lives behind a
// disclosure, because a home page that opens with a wall of numbers is a page
// people stop reading after week one - and the recap has already told them
// whether today is worth opening.
//
// Inside the report, the machine furniture (status, micro labels, counters) is
// set in the mono face; everything the agent SAYS is set in the sans.
// Instruments read as instruments, speech reads as speech.
//
// Why it matters emotionally: SEO returns nothing for the first couple of
// months, and a flat line reads as "broken" long before it reads as "month
// two". The panel's job is to make the wait feel staffed - somebody is there,
// and they have something true to say every day. Which is why the honesty
// rules from briefing.ts are enforced visually too: an empty wins list renders
// `patience` instead of padding, and a down-tick is never painted red (see
// Delta).
//
// Server component on purpose - the disclosure is a native <details>, so the
// report opens with no JavaScript and no state. The only client thing inside
// is PixelDesk, which is already marked "use client" and nests fine.

import Link from "next/link";
import type { ReactNode } from "react";
import { PixelDesk } from "./pixel-dispatcher";
import { ChangelogBanner } from "./changelog-banner";
import type { Briefing, BriefingNumbers, BriefingTone, QuickWin, QuickWinKind } from "@/lib/briefing";

// ---------------------------------------------------------------------------
// Agent tint
// ---------------------------------------------------------------------------

// Every agent-tinted surface in here reads the SAME variable the mascot's own
// palette reads (see paletteFor in pixel-dispatcher.tsx), stamped once by the
// dashboard layout from the active project's agent. Nothing hardcodes clay or
// white, so switching agents retints the character, its screen glow and the
// speech rule together instead of leaving two of the three behind.
const AGENT_TINT = "var(--dispatcher-body, #d97757)";
const tinted = (percent: number) => `color-mix(in srgb, ${AGENT_TINT} ${percent}%, transparent)`;

// ---------------------------------------------------------------------------
// Win taxonomy
// ---------------------------------------------------------------------------

// Nine kinds is too many visual tokens for a four-row list - it would land as
// emoji soup, where every row shouts and none of them mean anything. So the
// kinds collapse into the four things they actually ARE to the owner, and the
// row's own headline carries the specificity. The families come straight from
// briefing.ts's own grouping.
type WinFamily =
  | "first" // milestone: happened once, will not happen again
  | "opportunity" // something to go take: a near-miss or a fixable gap
  | "momentum" // it is moving in the right direction
  | "logged"; // housekeeping: real, quiet, already handled

const FAMILY: Record<QuickWinKind, WinFamily> = {
  milestone: "first",
  striking: "opportunity",
  ctr_gap: "opportunity",
  zero_click: "opportunity",
  climber: "momentum",
  trending: "momentum",
  new_query: "momentum",
  indexed: "logged",
  shipped: "logged",
};

// The tokens are drawn on a 5x5 pixel grid and rendered as crisp SVG rects -
// the same technique as mascot-face.tsx - so the icon system belongs to this
// character rather than being a stroke-icon set that could come from any
// dashboard. Silhouettes are deliberately unlike each other at 14px: a spark,
// a ring, an arrow, a check.
const GLYPHS: Record<WinFamily, string[]> = {
  first: ["..X..", "X.X.X", ".XXX.", "X.X.X", "..X.."],
  opportunity: [".XXX.", "X...X", "X.X.X", "X...X", ".XXX."],
  momentum: ["..X..", ".XXX.", "XX.XX", "..X..", "..X.."],
  logged: ["....X", "...X.", "X.X..", "XX...", "....."],
};

// Colour as meaning, the house rule: amber is the singular moment, sky is
// "go look at this", emerald is upward movement, neutral is bookkeeping. Four
// meanings across at most four rows, and the label above the list says which
// register the group is in.
const FAMILY_COLOR: Record<WinFamily, string> = {
  first: "text-amber-300",
  opportunity: "text-sky-300",
  momentum: "text-emerald-400",
  logged: "text-neutral-500",
};

function PixelGlyph({ family }: { family: WinFamily }) {
  const grid = GLYPHS[family];
  const rects: ReactNode[] = [];
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (grid[r][c] === ".") continue;
      rects.push(<rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill="currentColor" />);
    }
  }
  return (
    <svg viewBox="0 0 5 5" className="h-3.5 w-3.5" aria-hidden="true" shapeRendering="crispEdges">
      {rects}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Tone
// ---------------------------------------------------------------------------

// The card only lights up when there is a state worth lighting: `active` is a
// plain neutral-900 rectangle like every other card on the page, and the ring
// appears only for setup and alert. A panel that glows every day teaches the
// owner to stop seeing the glow.
const TONE: Record<
  BriefingTone,
  { state: string; dot: string; ring: string; label: string; card: string; panel: string }
> = {
  active: {
    state: "dispatching",
    dot: "bg-emerald-400",
    ring: "ring-4 ring-emerald-400/15",
    label: "text-emerald-300/90",
    card: "",
    panel: "border-neutral-800 bg-neutral-950/40",
  },
  setup: {
    state: "setting up",
    dot: "bg-violet-400",
    ring: "ring-4 ring-violet-400/15",
    label: "text-violet-300/90",
    card: "ring-1 ring-inset ring-violet-500/20",
    panel: "border-violet-500/25 bg-violet-500/[0.05]",
  },
  alert: {
    state: "needs you",
    dot: "bg-red-400",
    ring: "ring-4 ring-red-400/15",
    label: "text-red-300/90",
    card: "ring-1 ring-inset ring-red-500/25",
    panel: "border-red-500/25 bg-red-500/[0.05]",
  },
};

// Dot + plain text, no pill: the existing AgentStatus heartbeat reads exactly
// this way, and a stadium badge would be a second, louder grammar for the same
// idea. The state is spelled out in words, so colour is reinforcement rather
// than the only carrier. The ping is one slow beat (2.6s, not Tailwind's
// default 1s) so it reads as a heartbeat instead of a notification, and it is
// dropped entirely under prefers-reduced-motion - the static ring keeps the
// glow either way.
function StatusChip({
  tone,
  agentName,
  onDuty,
  stateLabel,
}: {
  tone: BriefingTone;
  agentName: string;
  onDuty: boolean;
  /** A caller-supplied state for the active tone - the Claude-app project
   *  says "connected" / "not connected yet", because it is never dispatching
   *  or standing by in the builder sense. */
  stateLabel?: string;
}) {
  const t = TONE[tone];
  if (tone === "active" && stateLabel) {
    const live = stateLabel === "connected";
    return (
      <p className="flex items-start gap-2.5 text-sm">
        <span className="relative mt-1.5 flex h-2 w-2 shrink-0" aria-hidden="true">
          <span
            className={`relative inline-flex h-2 w-2 rounded-full ${
              live ? "bg-emerald-400 ring-4 ring-emerald-400/15" : "bg-neutral-500 ring-4 ring-neutral-500/15"
            }`}
          />
        </span>
        <span className="min-w-0 break-words">
          <span className="font-medium text-neutral-200">{agentName}</span>
          <span className={live ? "text-emerald-300/90" : "text-neutral-500"}> · {stateLabel}</span>
        </span>
      </p>
    );
  }
  // "On the desk" has to be earned. With automatic building switched off the
  // agent is not working a shift - it is waiting to be told - and the chip
  // says so rather than dressing a hand-driven project as an autonomous one.
  // Trouble and setup still outrank this: both are true whatever the
  // automation toggles say.
  const state = tone === "active" && !onDuty ? "standing by" : t.state;
  const label = tone === "active" && !onDuty ? "text-neutral-500" : t.label;
  const dot = tone === "active" && !onDuty ? "bg-neutral-500" : t.dot;
  const ring = tone === "active" && !onDuty ? "ring-4 ring-neutral-500/15" : t.ring;
  return (
    <p className="flex items-start gap-2.5 text-sm">
      <span className="relative mt-1.5 flex h-2 w-2 shrink-0" aria-hidden="true">
        {/* A standing-by agent gets no heartbeat - a pulse is the signal that
            something is running, and nothing is. */}
        {onDuty || tone !== "active" ? (
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-50 [animation-duration:2.6s] motion-reduce:hidden ${dot}`}
          />
        ) : null}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${dot} ${ring}`} />
      </span>
      <span className="min-w-0 break-words">
        <span className="font-medium text-neutral-200">{agentName}</span>
        <span className={label}> · {state}</span>
      </span>
    </p>
  );
}

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

const nf = (n: number) => n.toLocaleString("en-US");

// Deliberately NOT ui.tsx's DeltaPill, which paints negatives red. On a young
// site a one-click dip is noise, and colouring it like a failure manufactures
// alarm the product's honesty rules ban. Up is emerald because it earned it;
// down and flat are quiet neutral, stated plainly and left alone.
function Delta({ value, since }: { value: number | null; since: string }) {
  if (value == null) return null;
  const up = value > 0;
  return (
    <span
      title={`vs ${since}`}
      className={`text-xs tabular-nums ${up ? "text-emerald-400" : "text-neutral-500"}`}
    >
      {up ? `+${nf(value)}` : value < 0 ? `−${nf(Math.abs(value))}` : "±0"}
    </span>
  );
}

function Metric({
  label,
  value,
  delta,
  since,
}: {
  label: string;
  value: number;
  delta: number | null;
  since: string;
}) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-600">{label}</p>
      <p className="mt-1 flex items-baseline gap-2">
        <span className="font-mono text-xl font-semibold tabular-nums text-neutral-100">
          {nf(value)}
        </span>
        <Delta value={delta} since={since} />
      </p>
    </div>
  );
}

// The counters are the evidence under the lead, so they sit directly beneath
// it rather than in the instrument column. The window line is not decoration:
// GSC's stored days run 2-3 days behind, and a dashboard that lets an owner
// read a stale day as "today" is the exact quiet lie this product cannot tell.
function Numbers({ numbers }: { numbers: BriefingNumbers }) {
  const live = numbers.window === "live24h";
  const since = live ? "the 24 hours before" : "the week before";
  return (
    <div className="mt-5">
      <div className="flex flex-wrap gap-x-10 gap-y-3">
        <Metric label="Clicks" value={numbers.clicks} delta={numbers.clicksDelta} since={since} />
        <Metric
          label="Impressions"
          value={numbers.impressions}
          delta={numbers.impressionsDelta}
          since={since}
        />
      </div>
      <p className="mt-2.5 text-xs text-neutral-500">
        {live
          ? "Live from Google, covering the last 24 hours."
          : "The last 7 days of Google's data. Its own numbers run 2-3 days behind."}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wins
// ---------------------------------------------------------------------------

function WinBody({ win }: { win: QuickWin }) {
  const family = FAMILY[win.kind];
  return (
    <>
      {/* mt-1 lines the 14px glyph up with the cap height of the headline
          rather than its box, which sits it visually on the text baseline. */}
      <span className={`mt-1 shrink-0 ${FAMILY_COLOR[family]}`}>
        <PixelGlyph family={family} />
      </span>
      <span className="min-w-0">
        <span className="block break-words text-[15px] font-medium leading-snug text-neutral-100">
          {win.headline}
        </span>
        {win.detail ? (
          <span className="mt-1 block break-words text-sm leading-relaxed text-neutral-400">
            {win.detail}
          </span>
        ) : null}
      </span>
    </>
  );
}

// Every win is falsifiable - the owner can open the screen it came from and
// see the same row - so when there is an href the WHOLE row is the target, not
// a "view" link hiding at the end of the sentence. The negative margin lets
// the hover wash bleed past the text into the card's own padding so the row
// reads as a row.
function WinRow({ win }: { win: QuickWin }) {
  if (!win.href) {
    return (
      <li className="flex gap-3 py-2.5">
        <WinBody win={win} />
      </li>
    );
  }
  return (
    <li>
      <Link
        href={win.href}
        className="group -mx-2 flex gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-neutral-800/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
      >
        <WinBody win={win} />
      </Link>
    </li>
  );
}

// ---------------------------------------------------------------------------
// The card
// ---------------------------------------------------------------------------

export function DispatcherBriefing({
  briefing,
  agentName,
  stateLabel,
  children,
  duty,
}: {
  briefing: Briefing;
  agentName: string;
  stateLabel?: string;
  // The interactive block - fix prompts, "mark applied", copy buttons. It
  // carries real controls, so it gets its own bordered sub-panel with room
  // rather than being threaded into the prose.
  children?: ReactNode;
  // One extra item for the duty strip, for anything the server can't render:
  // in practice the "next build in 3h 20m" countdown, which depends on the
  // reader's clock and so has to arrive as a mounted client component.
  duty?: ReactNode;
}) {
  const t = TONE[briefing.tone];
  return (
    <section
      aria-label={`Briefing from ${agentName}`}
      className={`rounded-xl bg-neutral-900 p-4 sm:p-6 ${t.card}`}
    >
      {/* Native <details>: it opens with no JavaScript, keeps the card a server
          component, and gets keyboard and screen-reader behaviour for free.
          Closed by default - the recap has already done the day's work, and
          this is for the mornings someone wants the detail.
          The WHOLE greeting row is the <summary>, so the toggle sits directly
          under the agent's message (where the eye already is) and the entire
          row is the hit target rather than a 150px line of text. */}
      {/* Open by default when something is broken. The recap says "I need a
          hand with it", and the hand it needs - the failing job's name, its
          error, the Copy fix prompt button, mark fixed - lives inside this
          disclosure. Announcing a problem and then filing the fix behind a
          click is how an alert becomes decoration. Every other tone stays
          closed, because every other tone is news, not work. */}
      <details className="group" open={briefing.tone === "alert"}>
        <summary className="cursor-pointer list-none rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-400 [&::-webkit-details-marker]:hidden">
          {/* The greeting row is the whole card most days. The agent sits at
              the left at a size where you can see its face, says hello, and
              gives one sentence. */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
            {/* Big and unframed. A bezel or an avatar circle turns the scene
                into an icon of itself; sitting loose on the card at this size,
                it reads as somebody actually working over there. Sizing is a
                fixed ratio, not a free choice: the crop is 50 units wide and
                the agent is 11 of its 25 rows, so the scene renders at roughly
                4.5x whatever height you want the character to be, and its own
                height is half its width. At 224px that is a 112px scene with a
                ~49px agent, which is the floor - below about 40px the eyes stop
                reading as a face and it turns back into a logo. Below sm the
                scene stacks ABOVE the text instead of sitting beside it: at
                390px a scene wide enough to see would leave the recap about
                140px to live in. */}
            <div className="relative shrink-0">
              {/* `circle closest-side` matters. A plain `circle` defaults to
                  farthest-corner, which in a box this wide puts the transparent
                  stop way outside the element - so the tint is still at full
                  strength when it hits the edges and the glow ends on a visible
                  straight cut. closest-side pins the radius to half the box
                  HEIGHT, so the gradient is fully transparent before any edge,
                  vertically and (since the box is far wider than it is tall)
                  horizontally too. The box is 160% tall for the same reason:
                  the fade needs somewhere to land that isn't the canvas. */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute left-1/2 top-1/2 h-[160%] w-full -translate-x-1/2 -translate-y-1/2"
                style={{
                  background: `radial-gradient(circle closest-side, ${tinted(7)} 0%, transparent 100%)`,
                }}
              />
              <PixelDesk className="relative w-full max-w-[196px] sm:w-[176px] sm:max-w-none lg:w-[224px]" />
            </div>

            <div className="min-w-0 flex-1">
              <StatusChip tone={briefing.tone} agentName={agentName} onDuty={briefing.onDuty} stateLabel={stateLabel} />
              {/* Greeting and recap are one sentence apart on purpose: the
                  hello is small and constant, the recap is the line that has to
                  be worth reading on its own. */}
              <p className="mt-2.5 text-sm text-neutral-500">{briefing.greeting}</p>
              <p className="mt-0.5 text-lg font-semibold leading-snug tracking-tight text-neutral-100 sm:text-xl">
                {briefing.recap}
              </p>
              <span className="mt-3 inline-flex items-center gap-1.5 text-sm text-neutral-400 transition-colors group-hover:text-neutral-200">
                <svg
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="h-3.5 w-3.5 transition-transform group-open:rotate-180 motion-reduce:transition-none"
                >
                  <path d="M4 6l4 4 4-4" />
                </svg>
                <span className="group-open:hidden">Read the full report</span>
                <span className="hidden group-open:inline">Close the report</span>
              </span>
            </div>
          </div>
        </summary>

        <div className="mt-5 border-t border-neutral-800/70 pt-5">
          {/* The lead is speech, not a heading, so it stays a <p> - but it is
              the largest type inside the report, and the rule on its left, in
              the agent's tint, marks it as the agent still talking. */}
          <p
            className="border-l-[3px] pl-4 text-[17px] font-medium leading-snug text-neutral-100"
            style={{ borderColor: tinted(70) }}
          >
            {briefing.lead}
          </p>

          {/* Directly under the sentence that raised it, ABOVE the traffic
              numbers. When the agent has just said something is broken, the
              next thing on screen has to be the thing that fixes it - not a
              click count the owner did not ask about at that moment. */}
          {children ? (
            <div className={`mt-5 rounded-lg border p-4 text-sm ${t.panel}`}>{children}</div>
          ) : null}

          {briefing.numbers ? <Numbers numbers={briefing.numbers} /> : null}

          {briefing.wins.length > 0 ? (
            // Unlabelled, and no arrow per row. The lines are the agent still
            // talking, straight on from the sentence above them - a heading
            // would break that into a section, and a chevron on every row would
            // turn a report into a task list. Each row is still a link to the
            // screen it came from, because every claim here has to be
            // checkable; the hover wash is enough to say so.
            <div className="mt-5 border-t border-neutral-800/70 pt-2">
              <ul className="divide-y divide-neutral-800/60">
                {briefing.wins.map((w) => (
                  <WinRow key={w.key} win={w} />
                ))}
              </ul>
            </div>
          ) : briefing.patience ? (
            // Only ever set when the wins list is genuinely empty. It gets no
            // label, no icon and no amber - it is not a warning and not an
            // apology, it is the dispatcher saying what is actually happening.
            <p className="mt-5 max-w-2xl border-t border-neutral-800/70 pt-4 text-[15px] leading-relaxed text-neutral-400">
              {briefing.patience}
            </p>
          ) : null}

          {/* Today's one hands-on move - almost always the links nudge, since
              links are the half of the job the agent can't do alone. A panel,
              not a warning: no amber, no urgency theatre, and most days it
              isn't here at all (a healthy profile renders nothing). The whole
              block is the link, because the ask ends on a page where the copy
              is already prefilled. */}
          {briefing.action ? (
            <Link
              href={briefing.action.href}
              className="group/action mt-6 block rounded-lg border border-neutral-800 bg-neutral-900/60 p-4 transition-colors hover:border-neutral-700"
            >
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-600">
                Your move today
              </p>
              <p className="mt-1.5 text-[15px] font-medium leading-snug text-neutral-100">
                {briefing.action.headline}
              </p>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-neutral-400">
                {briefing.action.detail}
              </p>
              <span className="mt-2 inline-flex items-center gap-1 text-sm text-neutral-300 transition-colors group-hover/action:text-neutral-100">
                Open the playbook
                <span aria-hidden="true">&rarr;</span>
              </span>
            </Link>
          ) : null}

          {/* Product news, delivered by the same voice as everything else on
              this card. It used to arrive as a separate grey bar under the
              topbar on every screen - retired, this is the one place a release
              is announced now, and dismissing here still records "seen". */}
          {briefing.release ? (
            <div className="mt-6 space-y-1.5 border-t border-neutral-800/70 pt-4">
              <p className="text-sm text-neutral-300">{briefing.release.line}</p>
              <ChangelogBanner
                version={briefing.release.version}
                summary={briefing.release.summary}
              />
            </div>
          ) : null}

          {/* The quietest region: what is in flight needs no decision from
              anyone, so it sits at the foot like a duty strip. Skipped
              entirely when empty - an empty label is worse than no label. */}
          {briefing.doing.length > 0 || duty ? (
            <div className="mt-6 flex flex-col gap-2 border-t border-neutral-800/70 pt-4 sm:flex-row sm:items-baseline sm:gap-5">
              <p className="shrink-0 font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-600">
                Right now
              </p>
              <ul className="flex min-w-0 flex-1 flex-wrap gap-x-6 gap-y-1">
                {briefing.doing.map((d) => (
                  <li
                    key={d}
                    className="flex min-w-0 items-baseline gap-2 text-[13px] text-neutral-500"
                  >
                    <span
                      aria-hidden="true"
                      className="h-1 w-1 shrink-0 rounded-[1px] bg-neutral-700"
                    />
                    <span className="min-w-0 break-words">{d}</span>
                  </li>
                ))}
                {duty ? (
                  <li className="flex min-w-0 items-baseline gap-2 text-[13px] text-neutral-500">
                    <span
                      aria-hidden="true"
                      className="h-1 w-1 shrink-0 rounded-[1px] bg-neutral-700"
                    />
                    <span className="min-w-0 break-words">{duty}</span>
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}
        </div>
      </details>
    </section>
  );
}
