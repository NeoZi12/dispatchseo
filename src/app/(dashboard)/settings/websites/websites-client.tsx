"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { addWebsite, saveSitePaused, saveSitePublishMode, saveSiteShare, type AddWebsiteState, type SiteShareState } from "@/app/site-actions";
import { DeleteProjectForm } from "@/components/delete-project";
import { SiteIcon } from "@/components/ui/site-icon";
import { cx, FOCUS_RING } from "@/components/ui/styles";
import { BTN_PRIMARY, BTN_SECONDARY } from "@/components/setup-stage/primitives";

// The Websites page's moving parts (page.tsx has the data and the why): the
// header with its Add website panel, and ONE card for everything else
// (SitesBoard): the plan's two numbers, then a row per website with its
// icon, its name, and its articles a month. A row opens (animated) to its
// settings: Publishing (Autopilot or Manual review), Articles a month
// (Automatic or Custom), the pause switch and Remove, which asks in a pop-up.
//
// Kept deliberately plain (owner, 2026-11-11, after three richer versions:
// "too much", then "I don't like the graph", "they don't need to be
// different colors", "remove the not assigned thing"): no dispatcher scene
// or speech bubbles, no bar or boxes of any kind, no colour per website, no
// leftover-articles row, no entrance animations. Words are whole phrases
// ("9 articles a month", "5 used this month"), never bare labels.

export type SiteCard = {
  slug: string;
  domain: string;
  /** This site's colour in the split bar; null = not in the split. */
  hue: string | null;
  /** Articles this month; null = no monthly number (the operator's
   *  hand-set pace). */
  share: number | null;
  used: number | null;
  mode: "auto" | "custom";
  status: "writing" | "slower" | "paused" | "uncovered" | "setup";
  outside: boolean;
  /** The dispatcher's sentence about this site, when there is one. */
  line: string | null;
  editable: boolean;
  /** The most a Custom share may be (pool minus the other sites' customs). */
  customMax: number;
  pool: number | null;
  removable: boolean;
  removeNote: string;
  repo: string | null;
  hosted: boolean;
  lastSiteWhileSubscribed: boolean;
  /** How this site's articles go live. */
  publishMode: "auto" | "review";
  /** Paused by the owner (not the automatic slow-downs in `status`). */
  ownerPaused: boolean;
  /** Whether the publishing and pause switches apply to this site. */
  controllable: boolean;
  /** The only site on the account: removing it leaves none. */
  isLastSite: boolean;
};

/** Smaller cut of the setup's purple primary, for buttons inside a card. */
const BTN_PRIMARY_SM = cx(BTN_PRIMARY, "rounded-lg px-4 py-2 text-[14px] shadow-md");
const BTN_SECONDARY_SM = cx(BTN_SECONDARY, "rounded-lg px-4 py-2 text-[14px]");

/* ------------------------------------------------------------------ note */

/** One plain line of explanation or refusal, with at most one action. */
function Note({ tone = "info", children, action }: { tone?: "info" | "warn"; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div
      role={tone === "warn" ? "alert" : "status"}
      className={cx("rounded-lg border px-3.5 py-2.5", tone === "warn" ? "border-warn/30 bg-warn/[0.06]" : "border-line-soft bg-surface-2/60")}
    >
      <p className={cx("text-[13.5px] leading-relaxed", tone === "warn" ? "text-ink" : "text-ink-muted")}>{children}</p>
      {action ? <div className="mt-2.5">{action}</div> : null}
    </div>
  );
}

/* ---------------------------------------------------------------- header */

export function WebsitesHeader({
  canAdd,
  initialOpen,
  action,
  style,
}: {
  canAdd: boolean;
  initialOpen: boolean;
  /** Shown instead of Add website when the plan has no room. */
  action?: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <div className="space-y-5" style={style}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <h1 id="websites-title" className="text-[1.75rem] font-semibold leading-tight tracking-tight text-ink">
            Websites
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">Your websites, and how your plan&apos;s articles are divided between them.</p>
        </div>
        {canAdd ? (
          open ? null : (
            <button type="button" onClick={() => setOpen(true)} className={BTN_PRIMARY_SM}>
              <PlusGlyph />
              Add website
            </button>
          )
        ) : (
          action
        )}
      </div>
      {canAdd && open ? <AddWebsiteForm onCancel={() => setOpen(false)} /> : null}
    </div>
  );
}

function PlusGlyph() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
}

/** The address, checked the way setup checks the first site, then off to
 *  the setup steps for it. */
function AddWebsiteForm({ onCancel }: { onCancel: () => void }) {
  const [state, formAction, pending] = useActionState<AddWebsiteState, FormData>(addWebsite, null);
  const [domain, setDomain] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  useEffect(() => input.current?.focus(), []);
  // The refusal is about the address it was given; typing a new one clears it.
  const shown = state && state.domain === normalize(domain) ? state : null;

  return (
    // overflow-clip, not overflow-hidden: the glow below hangs 4rem past the
    // right edge, and a hidden box is still a scroll container, so when the
    // refusal row mounted the browser scrolled the whole form sideways to
    // show it and left the label and the address clipped ("h website?").
    // A clipped box cannot scroll at all.
    <form action={formAction} className="relative isolate overflow-clip rounded-2xl border border-accent/25 bg-surface px-5 py-5 sm:px-7 sm:py-6">
      <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 -z-10 h-56 w-72 rounded-full bg-accent-strong/15 blur-3xl" />
      <label htmlFor={id} className="block text-[15px] font-semibold text-ink">
        Which website?
      </label>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
        <div className="flex min-w-0 flex-1 items-center rounded-xl border border-line bg-surface-2 px-3.5 transition-colors focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/25">
          <span aria-hidden="true" className="select-none text-[15px] text-ink-faint">
            https://
          </span>
          <input
            ref={input}
            id={id}
            name="domain"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="yoursite.com"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            inputMode="url"
            required
            maxLength={300}
            className="min-w-0 flex-1 bg-transparent py-3 pl-0.5 text-[15px] text-ink outline-none placeholder:text-ink-faint"
          />
        </div>
        <button type="submit" disabled={pending || !domain.trim()} className={cx(BTN_PRIMARY, "rounded-xl px-5 py-3 text-[15px]")}>
          {pending ? (
            <>
              <Spinner />
              Checking the site
            </>
          ) : (
            "Add website"
          )}
        </button>
      </div>

      {shown ? (
        <div className="mt-4">
          <Note
            tone="warn"
            action={
              shown.override ? (
                <button type="submit" name="override" value="1" disabled={pending} className={BTN_SECONDARY_SM}>
                  Its code is on GitHub. Add it anyway
                </button>
              ) : undefined
            }
          >
            {shown.error}
          </Note>
        </div>
      ) : null}

      {/* What comes after the click: the same three steps the first site took. */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <ol aria-label="Next, for this website" className="flex flex-wrap items-center gap-x-2 gap-y-2 text-[13px] text-ink-muted">
          {["Publishing", "GitHub", "Google"].map((step, i) => (
            <li key={step} className="flex items-center gap-2">
              {i > 0 ? <span aria-hidden="true" className="h-px w-4 bg-line" /> : null}
              <span aria-hidden="true" className="grid h-5 w-5 place-items-center rounded-full border border-line text-[11px] font-semibold tabular-nums text-ink-faint">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
        <button type="button" onClick={onCancel} className={cx("rounded-md text-[13.5px] font-medium text-ink-faint transition-colors hover:text-ink", FOCUS_RING)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** The action's own normalisation, enough to tell "same address" apart. */
function normalize(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="dispatch-spin h-4 w-4" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/* ------------------------------------------------------------------ rows */

const STATUS: Record<SiteCard["status"], { label: string; dot: string }> = {
  writing: { label: "Writing", dot: "bg-ok" },
  slower: { label: "Starting slower", dot: "bg-info" },
  paused: { label: "Paused", dot: "bg-ink-faint" },
  uncovered: { label: "Not covered by your plan", dot: "bg-warn" },
  setup: { label: "Setting up", dot: "bg-accent" },
};

export function SitesBoard({
  pool,
  poolLabel,
  sitesFigure,
  sitesLabel,
  cards,
  resets,
}: {
  pool: number | null;
  poolLabel: string;
  sitesFigure: string;
  sitesLabel: string;
  cards: SiteCard[];
  /** "December 1": when the month starts over. */
  resets: string;
}) {
  return (
    <div className="overflow-clip rounded-2xl border border-line-soft bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2 px-5 py-6 sm:px-6">
        <p className="flex items-baseline gap-2.5">
          <span className="text-[2.5rem] font-semibold leading-none tracking-tight tabular-nums text-ink">{pool ?? "-"}</span>
          <span className="text-[14.5px] text-ink-muted">{poolLabel}</span>
        </p>
        <p className="flex items-baseline gap-2">
          <span className="text-[1.375rem] font-semibold leading-none tracking-tight tabular-nums text-ink">{sitesFigure}</span>
          <span className="text-[14.5px] text-ink-muted">{sitesLabel}</span>
        </p>
      </div>

      <ul className="divide-y divide-line-soft border-t border-line-soft">
        {cards.map((c) => (
          <SiteRow key={c.slug} card={c} />
        ))}
      </ul>

      <p className="border-t border-line-soft px-5 py-3 text-[12.5px] text-ink-faint sm:px-6">The month starts again on {resets}.</p>
    </div>
  );
}

/** One figure on a website's row: the number, and under it what it counts.
 *  The label is spelled out from sm up and shortened on a phone. */
function RowStat({ value, label, short, strong = false }: { value: number; label: string; short: string; strong?: boolean }) {
  return (
    // min-w, not w: the label is the widest line, so the column grows to it
    // and the number centres over the words. Every row carries the same
    // labels, so the columns still line up down the card.
    <span className="flex min-w-[3.75rem] flex-col items-center text-center sm:min-w-[7.25rem]">
      <span className={cx("block font-semibold leading-7 tracking-tight tabular-nums", strong ? "text-[1.5rem] text-ink" : "text-[1.25rem] text-ink-muted")}>{value}</span>
      <span className="mt-1 block whitespace-nowrap text-[11px] font-medium uppercase tracking-[0.07em] text-ink-faint">
        <span className="hidden sm:inline">{label}</span>
        <span className="sm:hidden">{short}</span>
      </span>
    </span>
  );
}

/** One website: its icon, name and articles a month, and behind a click,
 *  its settings. A site that
 *  needs something from the owner (setup unfinished, not covered) starts
 *  open, so the reason and its button are never hidden. */
function SiteRow({ card: c }: { card: SiteCard }) {
  const [open, setOpen] = useState(c.status === "setup" || c.status === "uncovered");
  const panel = useId();
  const st = STATUS[c.status];
  const muted = c.status === "uncovered";
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panel}
        className={cx("flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-surface-2/60 sm:px-6", open && "bg-surface-2/40", FOCUS_RING)}
      >
        <span className={cx("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line-soft bg-surface-2", muted && "opacity-50 grayscale")}>
          <SiteIcon domain={c.domain} className="h-6 w-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className={cx("block truncate text-[15px] font-medium", muted ? "text-ink-muted" : "text-ink")} title={c.domain}>
            {c.domain}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[13px] text-ink-muted">
            <span aria-hidden="true" className={cx("h-1.5 w-1.5 shrink-0 rounded-full", st.dot)} />
            <span className="truncate">{st.label}</span>
            {/* The publishing mode wears the same icon as its button in
                the Publishing setting below: bolt for Autopilot, eye for
                Manual review. */}
            {c.controllable && c.status !== "paused" ? (
              <>
                <span aria-hidden="true" className="text-ink-faint">
                  ·
                </span>
                <span aria-hidden="true" className={cx("inline-flex shrink-0 [&_svg]:h-3.5 [&_svg]:w-3.5", c.publishMode === "review" ? "text-warn" : "text-ok")}>
                  {c.publishMode === "review" ? EYE : BOLT}
                </span>
                <span className="shrink-0">{c.publishMode === "review" ? "Manual review" : "Autopilot"}</span>
              </>
            ) : null}
            {c.outside ? <span className="truncate">· pace set by DispatchSEO</span> : null}
          </span>
        </span>
        {/* Two fixed columns, the "Your top posts" shape: a number over a
            small label, the same width on every row so the figures line up
            down the card. The site's articles a month is the headline, on
            the right; what it has used sits quieter beside it. */}
        {c.share != null ? (
          <span className="flex shrink-0 items-start gap-5 sm:gap-9">
            {c.used != null ? <RowStat value={c.used} label="Used this month" short="Used" /> : null}
            <RowStat value={c.share} label="Articles a month" short="A month" strong={!muted} />
          </span>
        ) : null}
        <svg aria-hidden="true" viewBox="0 0 16 16" className={cx("h-4 w-4 shrink-0 text-ink-faint transition-transform duration-150", open && "rotate-180")}>
          <path d="m3.5 6 4.5 4.5L12.5 6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Always mounted so opening AND closing animate: the grid row goes
          0fr <-> 1fr and the inner box clips. `inert` keeps a closed panel's
          buttons out of the tab order and away from screen readers. */}
      <div id={panel} className={cx("grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="min-h-0 overflow-hidden" inert={!open}>
        <div className={cx("divide-y divide-line-soft border-t border-line-soft bg-canvas/40 transition-opacity duration-300 motion-reduce:transition-none", open ? "opacity-100" : "opacity-0")}>
          {c.line ? (
            <div className="px-5 py-4 sm:px-6">
              <Note
                tone={c.status === "uncovered" ? "warn" : "info"}
                action={
                  c.status === "setup" ? (
                    <a href="/onboarding" className={BTN_PRIMARY_SM}>
                      Finish setup
                    </a>
                  ) : c.status === "uncovered" ? (
                    <a href="/billing" className={BTN_SECONDARY_SM}>
                      See plans
                    </a>
                  ) : undefined
                }
              >
                {c.line}
              </Note>
            </div>
          ) : null}
          {c.controllable ? <PublishModeRow card={c} /> : null}
          {c.editable ? <ShareControl card={c} /> : null}
          {c.controllable ? <PauseRow card={c} /> : null}
          <RemoveSite card={c} />
        </div>
        </div>
      </div>
    </li>
  );
}

/** One control row inside a site card: the question and one plain line,
 *  then the control - beside it (a switch) or under it (the choices). */
function ControlRow({ title, description, children, below }: { title: string; description?: React.ReactNode; children?: React.ReactNode; below?: React.ReactNode }) {
  return (
    <div className="px-5 py-5 sm:px-6">
      <div className="flex items-center justify-between gap-6">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold tracking-tight text-ink">{title}</p>
          {description ? <p className="mt-1 text-[13.5px] leading-relaxed text-ink-muted">{description}</p> : null}
        </div>
        {children ? <div className="flex shrink-0 items-center gap-3">{children}</div> : null}
      </div>
      {below ? <div className="mt-4">{below}</div> : null}
    </div>
  );
}

/** One of two answers to a row's question: an icon, its name, and what it
 *  means in one sentence. The chosen one is outlined in the accent and
 *  ticked; the icon keeps its own colour (no tile behind it). */
function Choice({
  on,
  icon,
  tone,
  title,
  children,
  ...rest
}: { on: boolean; icon: React.ReactNode; tone: string; title: string; children: React.ReactNode } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "title">) {
  return (
    <button
      {...rest}
      className={cx(
        "flex w-full items-start gap-3 rounded-xl border px-4 py-3.5 text-left transition-colors disabled:cursor-default",
        on ? "border-accent/55 bg-accent/[0.08] shadow-[inset_0_0_0_1px_rgba(167,139,250,0.18)]" : "border-line-soft bg-surface-2/40 hover:border-line hover:bg-surface-2",
        FOCUS_RING,
      )}
    >
      <span aria-hidden="true" className={cx("mt-0.5 shrink-0", on ? tone : "text-ink-faint")}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cx("block text-[14.5px] font-medium", on ? "text-ink" : "text-ink-muted")}>{title}</span>
        <span className="mt-0.5 block text-[13px] leading-relaxed text-ink-muted">{children}</span>
      </span>
      <span aria-hidden="true" className={cx("mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border", on ? "border-accent bg-accent text-canvas" : "border-line")}>
        {on ? (
          <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="m3.5 8.5 3 3 6-7" />
          </svg>
        ) : null}
      </span>
    </button>
  );
}

const ICON = "h-5 w-5";
/** The same bolt and eye as the publishing menu on Overview and Articles. */
const BOLT = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ICON}>
    <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />
  </svg>
);
const EYE = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ICON}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
/** Scales: we share the plan out. */
const SPLIT = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ICON}>
    <path d="M12 3v18M7 21h10M5 7h14" />
    <path d="M5 7l-3 7a3.5 3.5 0 0 0 6 0L5 7zM19 7l-3 7a3.5 3.5 0 0 0 6 0l-3-7z" />
  </svg>
);
/** Sliders: you set the number. */
const DIAL = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ICON}>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
  </svg>
);

/* --------------------------------------------------- publishing and pause */

/** How this site's articles go live: on their own, or after the owner's
 *  Publish. Each choice is a submit, so one click saves it. */
function PublishModeRow({ card: c }: { card: SiteCard }) {
  const [state, formAction, pending] = useActionState<SiteShareState, FormData>(saveSitePublishMode, null);
  const label = useId();
  return (
    <ControlRow
      title="Publishing"
      description="What happens when an article is finished."
      below={
        <>
          <form action={formAction} className={cx("grid gap-3 sm:grid-cols-2", pending && "opacity-60")} role="group" aria-labelledby={label}>
            <span id={label} className="sr-only">
              Publishing for {c.domain}
            </span>
            <input type="hidden" name="slug" value={c.slug} />
            <Choice type="submit" name="mode" value="auto" on={c.publishMode === "auto"} aria-pressed={c.publishMode === "auto"} disabled={pending || c.publishMode === "auto"} icon={BOLT} tone="text-ok" title="Autopilot">
              It goes live on your site by itself. You don&apos;t have to do anything.
            </Choice>
            <Choice type="submit" name="mode" value="review" on={c.publishMode === "review"} aria-pressed={c.publishMode === "review"} disabled={pending || c.publishMode === "review"} icon={EYE} tone="text-warn" title="Manual review">
              It waits for you. We email you, you read it, and you press Publish.
            </Choice>
          </form>
          {state && !state.ok ? (
            <div className="mt-3">
              <Note tone="warn">{state.message}</Note>
            </div>
          ) : null}
        </>
      }
    >
      {/* The save takes a few seconds on a real account; say so, the dimmed
          cards alone read as nothing happening. */}
      {pending ? (
        <span role="status" className="inline-flex items-center gap-2 text-[13px] font-medium text-ink-muted">
          <Spinner />
          Saving
        </span>
      ) : null}
    </ControlRow>
  );
}

/** Pause or resume this site's articles. The switch is the submit. */
function PauseRow({ card: c }: { card: SiteCard }) {
  const [state, formAction, pending] = useActionState<SiteShareState, FormData>(saveSitePaused, null);
  const on = !c.ownerPaused;
  return (
    <ControlRow
      title="Keep writing for this website"
      description={on ? "Switch off to pause it. Nothing already published is touched." : "Paused. No new articles for this website until you switch it back on."}
      below={state && !state.ok ? <Note tone="warn">{state.message}</Note> : undefined}
    >
      <form action={formAction} className="flex items-center gap-3">
        <input type="hidden" name="slug" value={c.slug} />
        <input type="hidden" name="paused" value={on ? "1" : "0"} />
        <span className={cx("text-[13.5px] font-medium", on ? "text-ink" : "text-ink-muted")}>{pending ? "Saving" : on ? "On" : "Paused"}</span>
        <button
          type="submit"
          role="switch"
          aria-checked={on}
          aria-label={`Writing for ${c.domain}`}
          disabled={pending}
          className={cx(
            "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors disabled:opacity-60",
            on ? "border-accent-strong bg-accent-strong" : "border-line bg-surface-3",
            FOCUS_RING,
          )}
        >
          <span aria-hidden="true" className={cx("inline-block h-[18px] w-[18px] rounded-full bg-white shadow transition-transform", on ? "translate-x-[22px]" : "translate-x-[3px]")} />
        </button>
      </form>
    </ControlRow>
  );
}

/* ----------------------------------------------------------------- share */

function ShareControl({ card: c }: { card: SiteCard }) {
  const [state, formAction, pending] = useActionState<SiteShareState, FormData>(saveSiteShare, null);
  const [mode, setMode] = useState<"auto" | "custom">(c.mode);
  const max = Math.max(0, c.customMax);
  const start = Math.min(Math.max(1, c.share ?? 1), Math.max(1, max));
  const [n, setN] = useState(start);
  const dirty = mode !== c.mode || (mode === "custom" && n !== (c.share ?? 0));
  const group = useId();
  const full = mode === "custom" && max < 1;

  const stepper =
    mode !== "custom" ? null : full ? (
      <Note tone="warn">
        Your other websites already have all {c.pool} of your plan&apos;s articles set by hand. Set one of them back to Auto first.
      </Note>
    ) : (
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex items-center rounded-xl border border-line bg-surface-2">
          <StepButton label="One fewer" disabled={n <= 1} onClick={() => setN((v) => Math.max(1, v - 1))} glyph="M4 8h8" />
          <output aria-live="polite" className="w-12 text-center text-[1.375rem] font-semibold tabular-nums text-ink">
            {n}
          </output>
          <StepButton label="One more" disabled={n >= max} onClick={() => setN((v) => Math.min(max, v + 1))} glyph="M8 4v8M4 8h8" />
        </div>
        <p className="min-w-0 flex-1 text-[13.5px] leading-relaxed text-ink-muted">
          <span className="font-medium text-ink">{n === 1 ? "article a month" : "articles a month"}</span> for this website. You can pick from 1 to {max}.
        </p>
      </div>
    );

  return (
    <form action={formAction}>
      <input type="hidden" name="slug" value={c.slug} />
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="share" value={n} />
      <ControlRow
        title="Articles a month"
        description={
          <>
            How many articles we write for this website every month{c.pool != null ? <>, out of the {c.pool} on your plan</> : null}.
          </>
        }
        below={
          <div className="space-y-4">
            <div role="radiogroup" aria-labelledby={group} className="grid gap-3 sm:grid-cols-2">
              <span id={group} className="sr-only">
                Articles a month for {c.domain}
              </span>
              <Choice type="button" role="radio" aria-checked={mode === "auto"} on={mode === "auto"} onClick={() => setMode("auto")} icon={SPLIT} tone="text-accent" title="Automatic">
                We share your plan&apos;s articles between your websites for you.
                {c.mode === "auto" && c.share != null ? (
                  <>
                    {" "}
                    Right now this one gets <span className="font-medium tabular-nums text-ink">{c.share}</span>.
                  </>
                ) : null}
              </Choice>
              <Choice type="button" role="radio" aria-checked={mode === "custom"} on={mode === "custom"} onClick={() => setMode("custom")} icon={DIAL} tone="text-accent" title="Custom">
                You choose the number for this website yourself.
              </Choice>
            </div>
            {stepper}
            {dirty ? (
              <button type="submit" disabled={pending || full} className={BTN_PRIMARY_SM}>
                {pending ? <Spinner /> : null}
                {pending ? "Saving" : "Save"}
              </button>
            ) : null}
            {state && !state.ok ? <Note tone="warn">{state.message}</Note> : null}
          </div>
        }
      >
        {state?.ok && !dirty ? (
          <span role="status" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ok">
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m3.5 8.5 3 3 6-7" />
            </svg>
            Saved
          </span>
        ) : null}
      </ControlRow>
    </form>
  );
}

function StepButton({ label, disabled, onClick, glyph }: { label: string; disabled: boolean; onClick: () => void; glyph: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cx("grid h-10 w-10 place-items-center rounded-xl text-ink-muted transition-colors hover:text-ink disabled:opacity-30", FOCUS_RING)}
    >
      <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <path d={glyph} />
      </svg>
    </button>
  );
}

/* ---------------------------------------------------------------- remove */

/** Remove asks in a pop-up, so the question can't be missed or half-read
 *  in a busy card - above all for the last website, where the answer leaves
 *  the account with none (owner, 2026-11-11). */
function RemoveSite({ card: c }: { card: SiteCard }) {
  const [open, setOpen] = useState(false);
  if (!c.removable) {
    // Only the install's home project (projects.ts DEFAULT_PROJECT_ID): the
    // database's own default row, which deleteProject refuses. No customer
    // site is ever this one.
    return (
      <div className="px-5 py-3.5 sm:px-6">
        <p className="text-[13px] text-ink-faint">This is DispatchSEO&apos;s home site on this install, so it can&apos;t be removed.</p>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3.5 sm:px-6">
      <p className="text-[13px] text-ink-faint">Done with this website?</p>
      <button type="button" onClick={() => setOpen(true)} className={cx("rounded-md text-[13.5px] font-medium text-danger/90 transition-colors hover:text-danger", FOCUS_RING)}>
        Remove website
      </button>
      {open ? <RemoveDialog card={c} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

function RemoveDialog({ card: c, onClose }: { card: SiteCard; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const title = useId();
  // A real modal <dialog>: the browser traps focus, Escape closes it, and
  // the rest of the page is inert behind the backdrop.
  // No close() on cleanup: closing fires the dialog's own close event, which
  // is onClose, so a development double-run of this effect would shut the
  // pop-up the instant it opened. Unmounting takes it off the screen anyway.
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={title}
      onClose={onClose}
      // A click on the backdrop lands on the dialog element itself.
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-0 text-ink shadow-2xl shadow-black/70 backdrop:bg-black/70 backdrop:backdrop-blur-[2px]"
    >
      <div className="space-y-4 p-6">
        <div className="flex items-start gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line-soft bg-surface-2">
            <SiteIcon domain={c.domain} className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <h2 id={title} className="text-[17px] font-semibold tracking-tight text-ink">
              Remove {c.domain}?
            </h2>
            <p className="mt-1 text-[13.5px] leading-relaxed text-ink-muted">{c.removeNote}</p>
          </div>
        </div>
        {c.isLastSite ? (
          <Note tone="warn">
            This is your last website. Once you remove it, you&apos;ll have no websites on DispatchSEO, and nothing gets written until you add one.
          </Note>
        ) : null}
        <p className="text-[13px] leading-relaxed text-ink-muted">The articles it already used this month still count toward your plan, so removing a website and adding it again doesn&apos;t give you more.</p>
        <DeleteProjectForm
          slug={c.slug}
          domain={c.domain}
          repo={c.repo}
          hosted={c.hosted}
          lastSiteWhileSubscribed={c.lastSiteWhileSubscribed}
          submitLabel="Remove website"
          pendingLabel="Removing..."
          returnTo="/settings/websites"
        />
        <button type="button" onClick={onClose} className={cx("rounded-md text-[13.5px] font-medium text-ink-muted transition-colors hover:text-ink", FOCUS_RING)}>
          Keep this website
        </button>
      </div>
    </dialog>
  );
}
