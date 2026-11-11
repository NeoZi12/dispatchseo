"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { addWebsite, saveSitePaused, saveSitePublishMode, saveSiteShare, type AddWebsiteState, type SiteShareState } from "@/app/site-actions";
import { CardMascot } from "@/components/card-mascot";
import { DeleteProjectForm } from "@/components/delete-project";
import { SiteIcon } from "@/components/ui/site-icon";
import { cx, FOCUS_RING } from "@/components/ui/styles";
import { BTN_PRIMARY, BTN_SECONDARY } from "@/components/setup-stage/primitives";

// The Websites page's moving parts (page.tsx has the data and the why): the
// header with its Add website panel, and one CARD per site. The card's head
// is the "Your top posts" shape - name and a quiet status line on the left,
// fixed right-hand numbers over tiny labels, the share as the one coloured
// figure. Under it, in view rather than behind a click, the site's controls
// as rows (the Settings row shape): how its articles go live, its share of
// the month, pause, and remove. An account holds five sites at most, so
// nothing needs hiding, and the thing an owner came to change is on screen.

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
  safeMax: number | null;
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
};

/** Smaller cut of the setup's purple primary, for buttons inside a card. */
const BTN_PRIMARY_SM = cx(BTN_PRIMARY, "rounded-lg px-4 py-2 text-[14px] shadow-md");
const BTN_SECONDARY_SM = cx(BTN_SECONDARY, "rounded-lg px-4 py-2 text-[14px]");

/* ------------------------------------------------------------ dispatcher */

/** The dispatcher saying one thing, inline: its face and a speech bubble.
 *  The compact sibling of DispatcherNote, for a row or a form. */
export function DispatcherLine({ tone = "info", children, action }: { tone?: "info" | "warn"; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div role={tone === "warn" ? "alert" : "status"} className="flex items-start gap-3">
      {/* With his headset on (owner, 2026-11-11); the blink is .dash-mascot. */}
      <CardMascot className="dash-mascot mt-0.5 h-8 w-8 shrink-0" />
      <div className={cx("relative min-w-0 rounded-xl border bg-surface-2/80 px-3.5 py-2.5", tone === "warn" ? "border-warn/30" : "border-line")}>
        <span
          aria-hidden="true"
          className={cx("absolute -left-[6px] top-3.5 h-2.5 w-2.5 -rotate-45 border-l border-t bg-surface-2", tone === "warn" ? "border-warn/30" : "border-line")}
        />
        <p className="text-[13.5px] leading-relaxed text-ink">{children}</p>
        {action ? <div className="mt-2.5">{action}</div> : null}
      </div>
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
    <div className="arrive-up space-y-5" style={style}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <h1 id="websites-title" className="text-[1.75rem] font-semibold leading-tight tracking-tight text-ink">
            Websites
          </h1>
          <p className="mt-2 max-w-[52ch] text-sm leading-relaxed text-ink-muted">Every site on your plan, and how this month&apos;s articles are split between them.</p>
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
    <form action={formAction} className="relative isolate overflow-hidden rounded-2xl border border-accent/25 bg-surface px-5 py-5 sm:px-7 sm:py-6">
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
          <DispatcherLine
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
          </DispatcherLine>
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

export function SiteList({ cards, style }: { cards: SiteCard[]; style?: React.CSSProperties }) {
  return (
    <ol className="space-y-4" style={style}>
      {cards.map((c, i) => (
        <SiteCardView key={c.slug} card={c} index={i} />
      ))}
    </ol>
  );
}

function SiteCardView({ card: c, index }: { card: SiteCard; index: number }) {
  const st = STATUS[c.status];
  const muted = c.status === "uncovered";
  const used = c.used ?? null;
  return (
    <li
      className={cx("arrive-up overflow-hidden rounded-2xl border bg-surface", muted ? "border-line-soft/70" : "border-line-soft")}
      style={{ "--at": "200ms", "--i": index, "--step": "70ms" } as React.CSSProperties}
    >
      {/* Head: who it is, how it's doing, and its number. */}
      <div className="flex items-center gap-4 px-5 py-5 sm:gap-5 sm:px-6">
        <span className={cx("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-line-soft bg-surface-2", muted && "opacity-50 grayscale")}>
          <SiteIcon domain={c.domain} className="h-7 w-7" />
        </span>
        <div className="min-w-0 flex-1">
          <p className={cx("truncate text-[16px] font-semibold tracking-tight", muted ? "text-ink-muted" : "text-ink")} title={c.domain}>
            {c.domain}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-[13px] text-ink-muted">
            <span aria-hidden="true" className={cx("h-1.5 w-1.5 shrink-0 rounded-full", st.dot)} />
            <span className="truncate">
              {st.label}
              {c.outside ? ", pace set by DispatchSEO" : null}
            </span>
          </p>
        </div>
        {/* Started this month: its own fixed column, the same two-line shape
            as the share beside it so the labels share a baseline. */}
        <div className="hidden w-20 shrink-0 text-center sm:block">
          <p className="text-[1.25rem] font-semibold leading-8 tabular-nums text-ink-muted">{used ?? "-"}</p>
          <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-ink-faint">Started</p>
        </div>
        <div className="w-[6.5rem] shrink-0 text-right">
          <p className={cx("text-[2rem] font-semibold leading-8 tracking-tight tabular-nums", c.hue ? "" : "text-ink-muted")} style={c.hue ? { color: c.hue } : undefined}>
            {c.share ?? "-"}
          </p>
          <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-ink-faint">This month</p>
          <p className="text-[11px] font-medium uppercase tracking-wider text-ink-faint sm:hidden">{used ?? "-"} started</p>
        </div>
      </div>

      {c.line ? (
        <div className="px-5 pb-5 sm:px-6">
          <DispatcherLine
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
          </DispatcherLine>
        </div>
      ) : null}

      {/* Controls, as rows: the setting and one line on the left, its
          control on the right. */}
      <div className="divide-y divide-line-soft border-t border-line-soft">
        {c.controllable ? <PublishModeRow card={c} /> : null}
        {c.editable ? <ShareControl card={c} /> : null}
        {c.controllable ? <PauseRow card={c} /> : null}
        {c.removable ? <RemoveSite card={c} /> : null}
      </div>
    </li>
  );
}

/** One control row inside a site card. */
function ControlRow({ title, description, children, below }: { title: string; description?: React.ReactNode; children?: React.ReactNode; below?: React.ReactNode }) {
  return (
    <div className="px-5 py-4 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <p className="text-[14.5px] font-medium text-ink">{title}</p>
          {description ? <p className="mt-0.5 text-[13px] leading-relaxed text-ink-muted">{description}</p> : null}
        </div>
        {children ? <div className="flex shrink-0 items-center gap-3">{children}</div> : null}
      </div>
      {below ? <div className="mt-3.5">{below}</div> : null}
    </div>
  );
}

/** Two or three choices in one track; the chosen one is the raised chip. */
const SEG_TRACK = "flex rounded-lg bg-canvas/70 p-0.5 ring-1 ring-line-soft";
function segClass(on: boolean): string {
  return cx(
    "rounded-md px-3.5 py-1.5 text-[13px] font-medium transition-colors disabled:cursor-default",
    on ? "bg-surface-3 text-ink shadow-sm shadow-black/30" : "text-ink-faint hover:text-ink",
    FOCUS_RING,
  );
}

/* --------------------------------------------------- publishing and pause */

/** How this site's articles go live: on their own, or after the owner's
 *  Publish. Each choice is a submit, so one click saves it. */
function PublishModeRow({ card: c }: { card: SiteCard }) {
  const [state, formAction, pending] = useActionState<SiteShareState, FormData>(saveSitePublishMode, null);
  const label = useId();
  return (
    <ControlRow
      title="How articles go live"
      description={c.publishMode === "review" ? "Each article waits for you to press Publish." : "Each article goes live as soon as it's ready."}
      below={state && !state.ok ? <DispatcherLine tone="warn">{state.message}</DispatcherLine> : undefined}
    >
      <form action={formAction} className={cx(SEG_TRACK, pending && "opacity-60")} role="group" aria-labelledby={label}>
        <span id={label} className="sr-only">
          How articles go live for {c.domain}
        </span>
        <input type="hidden" name="slug" value={c.slug} />
        {(
          [
            ["auto", "Autopilot"],
            ["review", "Manual review"],
          ] as const
        ).map(([value, text]) => (
          <button key={value} type="submit" name="mode" value={value} aria-pressed={c.publishMode === value} disabled={pending || c.publishMode === value} className={segClass(c.publishMode === value)}>
            {text}
          </button>
        ))}
      </form>
    </ControlRow>
  );
}

/** Pause or resume this site's articles. The switch is the submit. */
function PauseRow({ card: c }: { card: SiteCard }) {
  const [state, formAction, pending] = useActionState<SiteShareState, FormData>(saveSitePaused, null);
  const on = !c.ownerPaused;
  return (
    <ControlRow
      title="Writing"
      description={on ? "Turn off to stop new articles for this site. Nothing is deleted." : "Off. No new articles until you turn it back on."}
      below={state && !state.ok ? <DispatcherLine tone="warn">{state.message}</DispatcherLine> : undefined}
    >
      <form action={formAction} className="flex items-center gap-3">
        <input type="hidden" name="slug" value={c.slug} />
        <input type="hidden" name="paused" value={on ? "1" : "0"} />
        <span className="text-[13px] font-medium tabular-nums text-ink-muted">{pending ? "Saving" : on ? "On" : "Off"}</span>
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
      <DispatcherLine tone="warn">
        Your other websites already have all {c.pool} of your plan&apos;s articles set by hand. Set one of them back to Auto first.
      </DispatcherLine>
    ) : (
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex items-center rounded-xl border border-line bg-surface-2">
          <StepButton label="One fewer" disabled={n <= 1} onClick={() => setN((v) => Math.max(1, v - 1))} glyph="M4 8h8" />
          <output aria-live="polite" className="w-12 text-center text-[1.375rem] font-semibold tabular-nums text-ink">
            {n}
          </output>
          <StepButton label="One more" disabled={n >= max} onClick={() => setN((v) => Math.min(max, v + 1))} glyph="M8 4v8M4 8h8" />
        </div>
        <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-ink-muted">
          From 1 to {max}.
          {c.safeMax != null ? (
            <>
              {" "}
              Safe for this site right now: <span className="font-medium tabular-nums text-ink">{c.safeMax}</span>. Set more and the rest waits for it.
            </>
          ) : null}
        </p>
      </div>
    );

  return (
    <form action={formAction}>
      <input type="hidden" name="slug" value={c.slug} />
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="share" value={n} />
      <ControlRow
        title="Articles this month"
        description={mode === "auto" ? "Split for you across your websites. New ones get fewer until Google trusts them." : "Set by you. The rest of your plan is split across your other websites."}
        below={
          stepper || dirty || (state && !state.ok) ? (
            <div className="space-y-3">
              {stepper}
              {dirty ? (
                <button type="submit" disabled={pending || full} className={BTN_PRIMARY_SM}>
                  {pending ? <Spinner /> : null}
                  {pending ? "Saving" : "Save"}
                </button>
              ) : null}
              {state && !state.ok ? <DispatcherLine tone="warn">{state.message}</DispatcherLine> : null}
            </div>
          ) : undefined
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
        <div role="radiogroup" aria-labelledby={group} className={SEG_TRACK}>
          <span id={group} className="sr-only">
            Articles this month for {c.domain}
          </span>
          {(["auto", "custom"] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={segClass(mode === m)}>
              {m === "auto" ? "Auto" : "Custom"}
            </button>
          ))}
        </div>
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

function RemoveSite({ card: c }: { card: SiteCard }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <div className="flex items-center justify-between gap-4 px-5 py-3.5 sm:px-6">
        <p className="text-[13px] text-ink-faint">Done with this site?</p>
        <button type="button" onClick={() => setOpen(true)} className={cx("rounded-md text-[13.5px] font-medium text-danger/90 transition-colors hover:text-danger", FOCUS_RING)}>
          Remove website
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-3 bg-danger/[0.04] px-5 py-5 sm:px-6">
      <p className="text-[14.5px] font-medium text-ink">Remove {c.domain}</p>
      <p className="text-[13px] leading-relaxed text-ink-muted">{c.removeNote}</p>
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
      <button type="button" onClick={() => setOpen(false)} className={cx("rounded-md text-[13px] font-medium text-ink-faint hover:text-ink", FOCUS_RING)}>
        Keep it
      </button>
    </div>
  );
}
