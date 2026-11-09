"use client";

import { useEffect, useState } from "react";
import { cx, CONTROL, FOCUS_RING } from "@/components/ui/styles";
import { BTN_PRIMARY, BTN_QUIET, Check, SceneCard, StepRow, type StepState } from "./primitives";
import { FrameStrip } from "./strip";
import { SHOTS } from "./shot";
import s from "./stage.module.css";

// The scenes of the setup stage. Each is pure: it renders the state it
// is given and reports clicks; the stage (or the preview) owns the state.
// The things only the customer can do - the address, an account, a plan
// (and the card for a paid one), GitHub, Google -
// and everything between them is ours and shows itself happening.

// ---------------------------------------------------------------- address

export type SiteVerdict =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "ok"; framework: string | null; host: string | null; hasBlog: boolean }
  | { kind: "refused"; platform: string }
  | { kind: "unknown" };

// The host in whatever the customer has typed so far, once it looks like a
// domain ("neozino.dev", "https://neozino.dev/blog"), else null.
function faviconHost(value: string): string | null {
  const host = value
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .split(/[/?#\s]/)[0]
    .replace(/:\d+$/, "");
  return /^([a-z0-9-]+\.)+[a-z]{2,}$/.test(host) ? host : null;
}

// The site's icon inside the address field, fetched from Google's favicon
// service as soon as the text looks like a domain - so the customer sees
// "yes, that site" while still typing. Invisible until it has loaded, so a
// slow or missing icon never shows a broken image.
function SiteFavicon({ value }: { value: string }) {
  const host = faviconHost(value);
  const [src, setSrc] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!host) {
      setSrc(null);
      setLoaded(false);
      return;
    }
    const t = setTimeout(() => {
      setLoaded(false);
      setSrc(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`);
    }, 200);
    return () => clearTimeout(t);
  }, [host]);
  if (!src) return null;
  return (
    <img
      key={src}
      src={src}
      alt=""
      aria-hidden="true"
      width={28}
      height={28}
      onLoad={() => setLoaded(true)}
      onError={() => setLoaded(false)}
      className={cx("pointer-events-none absolute left-5 top-1/2 h-7 w-7 -translate-y-1/2 rounded-md transition-opacity duration-200", loaded ? "opacity-100" : "opacity-0")}
    />
  );
}

export function AddressScene({ value, onChange, onSubmit, onOverride, verdict, busy }: { value: string; onChange: (v: string) => void; onSubmit: () => void; onOverride?: () => void; verdict: SiteVerdict; busy?: boolean }) {
  const canGo = verdict.kind === "ok" || verdict.kind === "unknown";
  return (
    <SceneCard id="address" title="Enter your website" lead="We will check if it fits.">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canGo) onSubmit();
        }}
      >
        <label htmlFor="site-address" className="sr-only">
          Website address
        </label>
        <div className="relative">
          <SiteFavicon value={value} />
          <input
            id="site-address"
            type="text"
            inputMode="url"
            autoComplete="url"
            spellCheck={false}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="yoursite.com"
            className={cx(CONTROL, "h-16 rounded-2xl pr-5 text-[22px] tracking-tight transition-[padding] duration-200", faviconHost(value) ? "pl-14" : "pl-5")}
          />
          {verdict.kind === "checking" ? (
            <span aria-hidden="true" className="pointer-events-none absolute inset-x-5 bottom-2 h-[3px] overflow-hidden rounded-full">
              <span className={cx("block h-full w-full", s.shimmer)} />
            </span>
          ) : null}
        </div>

        <div className="mt-4 min-h-[4.5rem]" aria-live="polite">
          {verdict.kind === "checking" ? <p className="text-[14px] text-ink-faint">Taking a look…</p> : null}
          {verdict.kind === "ok" ? (
            <div className={cx("flex flex-wrap items-center gap-2 rounded-2xl border border-ok/30 bg-ok-soft px-4 py-3", s.pop)}>
              <span className="grid h-6 w-6 place-items-center rounded-full bg-ok text-canvas">
                <Check className="h-4 w-4" />
              </span>
              <span className="text-[15px] font-medium text-ink">We can work with this.</span>
              <span className="ml-auto flex flex-wrap gap-1.5">
                {verdict.framework ? <Chip>{verdict.framework}</Chip> : null}
                {verdict.host ? <Chip>on {verdict.host}</Chip> : null}
                <Chip>{verdict.hasBlog ? "has a blog" : "no blog yet"}</Chip>
              </span>
              <span className="basis-full text-[13.5px] text-ink-muted">You&apos;ll connect the GitHub repo its code lives in.</span>
            </div>
          ) : null}
          {verdict.kind === "refused" ? (
            <div className={cx("rounded-2xl border border-warn/30 bg-warn-soft px-4 py-3 text-[14.5px] leading-relaxed text-ink", s.pop)}>
              <p className="font-medium">This looks like a {verdict.platform} site.</p>
              <p className="mt-1 text-ink-muted">We write for sites built from code on GitHub, so we can&apos;t add articles to {verdict.platform} yet. Sorry - we&apos;d rather tell you now than after you&apos;ve paid.</p>
              {onOverride ? (
                <button
                  type="button"
                  onClick={onOverride}
                  disabled={busy}
                  className={cx("mt-2 cursor-pointer text-[13.5px] text-ink-muted underline decoration-line underline-offset-4 hover:text-ink disabled:opacity-50", FOCUS_RING)}
                >
                  Wrong guess? My site&apos;s code is on GitHub - continue anyway
                </button>
              ) : null}
            </div>
          ) : null}
          {verdict.kind === "unknown" ? (
            <p className={cx("text-[14px] text-ink-muted", s.pop)}>We couldn&apos;t tell what it&apos;s built on. If its code is in a GitHub repo, you&apos;re good to go.</p>
          ) : null}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="submit" className={BTN_PRIMARY} disabled={!canGo || busy}>
            Continue
            <Arrow />
          </button>
        </div>
      </form>
    </SceneCard>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-line bg-surface px-2.5 py-1 text-[12.5px] text-ink-muted">{children}</span>;
}

// ----------------------------------------------------------------- github

export function GithubScene({ onContinue, handoffHref, busy, error }: { onContinue: () => void; handoffHref?: string; busy?: boolean; error?: string | null }) {
  return (
    <SceneCard
      id="github"
      actionFirst
      title="Connect GitHub"
      lead="GitHub opens in a new tab. Three clicks there, then come back to this one."
      action={
        <>
          <button type="button" className={BTN_PRIMARY} onClick={onContinue} disabled={busy}>
            <GithubMark />
            Open GitHub
          </button>
          {handoffHref ? (
            <p className="basis-full text-center">
              <a href={handoffHref} className="text-[14px] text-ink-muted underline decoration-line underline-offset-4 hover:text-ink">
                Not the person with the code? Send this link to whoever is.
              </a>
            </p>
          ) : null}
        </>
      }
    >
      <FrameStrip
        frames={[
          { caption: "If asked where to install: pick the account that owns your site.", ...SHOTS.githubWhere },
          { caption: "Click \u201cOnly select repositories\u201d, then pick your site.", ...SHOTS.githubPickRepo },
          { caption: "Click \u201cInstall & Authorize\u201d.", ...SHOTS.githubInstall },
        ]}
      />
      {error ? <p className="mt-5 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-[14px] text-ink">{error}</p> : null}
    </SceneCard>
  );
}

function GithubMark() {
  return (
    <svg viewBox="0 0 16 16" className="h-[18px] w-[18px]" aria-hidden="true" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

// ------------------------------------------------------------------ setup

/** The one automatic step, after both human trips (GitHub, then Google):
 *  read the site, find where articles live, switch on /blog when there is
 *  no blog, and - when the Google step found the site missing from Search
 *  Console - place Google's verification file in the SAME change, so one
 *  deploy carries both; then check the blog answers and ask Google to
 *  confirm. Nothing to click. The work runs on our side, so closing the tab
 *  changes nothing: coming back lands on this scene at its current state.
 *  Only when Google will not confirm do we show the short by-hand guide,
 *  and Continue is available from the moment the blog answers. */
export type BlogProgress = {
  reading: StepState;
  locating: StepState;
  switching: StepState;
  live: StepState;
  /** 'existing' = the repo has a blog, articles go there; 'hosted' = we host
   *  it at /blog and switched the route on. */
  mode: "existing" | "hosted" | null;
  domain: string;
  /** The crawl could not read the site: ask one sentence, right here. */
  needsSentence?: boolean;
  /** Google's side of the same deploy. null = the site was already in
   *  Search Console, nothing to add. */
  google: null | { file: StepState; confirm: StepState; stuck?: boolean; consoleHref?: string };
};

export function BlogScene({ p, sentence, onSentence, onContinue }: { p: BlogProgress; sentence?: string; onSentence?: (v: string) => void; onContinue: () => void }) {
  const url = `${p.domain.replace(/^https?:\/\//, "")}/blog`;
  const blogLive = p.live === "done";
  const googleDone = !p.google || p.google.confirm === "done" || p.google.stuck;
  const allDone = blogLive && googleDone;
  const title = !blogLive ? "Setting up your site" : p.google?.stuck ? "Your blog is live. One thing Google wouldn’t confirm yet" : allDone ? "Your site is ready." : "Your blog is live. Waiting for Google";
  const lead = !blogLive
    ? "Nothing to do - watch it happen. You can close this tab; it carries on without you."
    : p.google?.stuck
      ? "We added your site to Search Console and the verification file is on your site, but Google hasn’t confirmed it yet. Your articles don’t wait on this. If you’d rather not wait either, the two-minute version by hand is below."
      : allDone
        ? `Articles will appear at ${url}${p.google ? ", and Google has confirmed the site is yours" : ""}. Nothing for you to do here.`
        : `Articles will appear at ${url}. Google usually confirms within a minute.`;
  return (
    <SceneCard
      id="blog"
      title={title}
      lead={lead}
      action={
        blogLive ? (
          <button type="button" className={BTN_PRIMARY} onClick={onContinue}>
            Continue
            <Arrow />
          </button>
        ) : undefined
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <ol className="m-0 list-none p-0">
          <StepRow index={0} state={p.reading} label="Reading your site" detail={p.reading === "done" ? "What you sell, and to whom." : undefined} />
          <StepRow
            index={1}
            state={p.locating}
            label="Finding where articles will live"
            detail={p.locating === "done" ? (p.mode === "existing" ? "You already have a blog. New articles go next to your posts." : "No blog yet. We’ll host one for you at /blog.") : undefined}
          />
          <StepRow
            index={2}
            state={p.switching}
            label={p.google ? (p.mode === "existing" ? "Adding Google’s verification file" : "Switching on /blog and adding Google’s verification file") : p.mode === "existing" ? "Checking we can publish" : "Switching on /blog"}
            detail={p.switching === "done" ? "One small change to your site, made by us. Nothing visible changes." : undefined}
          />
          <StepRow index={3} state={p.live} label="Live check" detail={p.live === "done" ? `${url} answers.` : undefined} />
          {p.google ? <StepRow index={4} state={p.google.stuck ? "doing" : p.google.confirm} label="Google confirms the site is yours" detail={p.google.confirm === "done" ? "It’s in your Search Console now." : undefined} /> : null}
        </ol>
        <MiniBrowser domain={p.domain} stage={p.live === "done" ? "live" : p.switching !== "todo" ? "loading" : p.reading !== "todo" ? "home" : "blank"} />
      </div>
      {p.needsSentence ? (
        <div className={cx("mt-6 rounded-2xl border border-accent/30 bg-accent-soft p-4", s.pop)}>
          <p className="text-[15px] font-medium text-ink">We couldn&apos;t read your site, so tell us in one sentence:</p>
          <p className="mt-0.5 text-[13.5px] text-ink-muted">What does it sell, and to whom?</p>
          <input value={sentence ?? ""} onChange={(e) => onSentence?.(e.target.value)} placeholder="Handmade leather bags for people who hate plastic" className={cx(CONTROL, "mt-3 h-12")} />
        </div>
      ) : null}
      {p.google?.stuck ? (
        <div className="mt-7">
          <FrameStrip
            frames={[
              { caption: "Type your address under \u201cURL prefix\u201d, click \u201cContinue\u201d.", ...SHOTS.gscPropertyType },
              { caption: "Click \u201cVerify\u201d. The file is already on your site.", ...SHOTS.gscVerify },
            ]}
          />
          <div className="mt-5 text-center">
            <a href={p.google.consoleHref ?? "https://search.google.com/search-console"} target="_blank" rel="noreferrer" className={BTN_QUIET}>
              Open Search Console
            </a>
            <p className="mt-4 text-[13.5px] text-ink-faint">We keep checking in the background and connect it the moment Google confirms.</p>
          </div>
        </div>
      ) : null}
    </SceneCard>
  );
}

/** A tiny browser showing the customer's domain, then /blog arriving. */
function MiniBrowser({ domain, stage }: { domain: string; stage: "blank" | "home" | "loading" | "live" }) {
  const host = domain.replace(/^https?:\/\//, "");
  return (
    <div className="overflow-hidden rounded-2xl border border-line-soft bg-surface-2" aria-hidden="true">
      <div className="flex items-center gap-2 border-b border-line-soft px-3 py-2">
        <span className="flex gap-1">
          <i className="h-2 w-2 rounded-full bg-line" />
          <i className="h-2 w-2 rounded-full bg-line" />
          <i className="h-2 w-2 rounded-full bg-line" />
        </span>
        <span className="ml-1 flex h-6 flex-1 items-center rounded-md bg-surface px-2 font-mono text-[11.5px] text-ink-muted">
          {stage === "blank" ? "" : host}
          {stage === "loading" || stage === "live" ? <span className="text-accent">/blog</span> : null}
          {stage === "loading" ? <span className={cx("ml-px inline-block h-3 w-px bg-ink", s.caret)} /> : null}
        </span>
      </div>
      <div className="min-h-[9.5rem] p-4">
        {stage === "home" ? (
          <div className={cx("space-y-2", s.riseIn)}>
            <span className="block h-3 w-2/3 rounded bg-surface-3" />
            <span className="block h-2 w-1/2 rounded bg-surface-3" />
            <span className="mt-4 block h-16 w-full rounded-lg bg-surface-3" />
          </div>
        ) : null}
        {stage === "loading" ? (
          <div className={cx("space-y-2", s.pageSkeleton)}>
            <span style={{ width: "60%" }} />
            <span style={{ width: "40%" }} />
            <span style={{ width: "90%" }} />
            <span style={{ width: "75%" }} />
          </div>
        ) : null}
        {stage === "live" ? (
          <div className={s.pop}>
            <p className="text-[15px] font-semibold text-ink">Blog</p>
            <p className="mt-1 text-[12.5px] text-ink-muted">Your first article is on its way.</p>
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-ok-soft px-2.5 py-1.5 text-[12px] font-medium text-ok">
              <Check className="h-3.5 w-3.5" /> live at {host}/blog
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- google

/** Google is a setup step, done once (owner, 2026-11-05: "everything in the
 *  setup, then you never do anything again"). One trip: the account chooser
 *  and the consent screen, both shown as real screenshots first. Back here
 *  we look for the domain in that account's Search Console and say what we
 *  found; when it isn't there, the next (automatic) step adds and verifies
 *  it, so the person never opens Search Console. */
export type GoogleProgress = { kind: "ask" } | { kind: "checking" } | { kind: "found"; property: string } | { kind: "missing" };

export function GoogleScene({ p, domain, onContinueWithGoogle, onContinue, busy, error }: { p: GoogleProgress; domain: string; onContinueWithGoogle: () => void; onContinue: () => void; busy?: boolean; error?: string | null }) {
  const host = domain.replace(/^https?:\/\//, "");
  const settled = p.kind === "found" || p.kind === "missing";
  const title = p.kind === "ask" || p.kind === "checking" ? "Connect Google" : "Google is connected.";
  const lead =
    p.kind === "ask"
      ? "Two clicks on Google, so you can see your visitors."
      : p.kind === "checking"
        ? "Back from Google. One moment."
        : p.kind === "found"
          ? `Clicks and impressions for ${host} will show on your Home as Google starts showing your pages.`
          : `${host} isn’t in your Search Console yet. We add it for you in the next step - nothing to do.`;
  return (
    <SceneCard
      id="google"
      title={title}
      lead={lead}
      action={
        p.kind === "ask" ? (
          <button type="button" className={BTN_PRIMARY} onClick={onContinueWithGoogle} disabled={busy}>
            <GoogleG />
            Open Google
          </button>
        ) : settled ? (
          <button type="button" className={BTN_PRIMARY} onClick={onContinue}>
            Continue
            <Arrow />
          </button>
        ) : undefined
      }
    >
      {p.kind === "ask" ? (
        <FrameStrip
          frames={[
            { caption: "Pick your Google account.", ...SHOTS.googleAccounts },
            { caption: "Click \u201cContinue\u201d.", ...SHOTS.googleConsent },
          ]}
        />
      ) : null}
      {p.kind === "checking" ? (
        <ol className="mx-auto m-0 max-w-md list-none p-0">
          <StepRow index={0} state="doing" label={`Looking for ${host} in your Search Console`} />
        </ol>
      ) : null}
      {settled ? (
        <div className={cx("mx-auto flex max-w-lg items-center gap-3 rounded-2xl border border-ok/30 bg-ok-soft px-4 py-3", s.pop)}>
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ok text-canvas">
            <Check className="h-4 w-4" />
          </span>
          <span className="text-[15px] text-ink">
            {p.kind === "found" ? (
              <>
                Found <span className="font-medium">{p.property}</span> in your Search Console.
              </>
            ) : (
              <>Google access granted. We&apos;ll add {host} to your Search Console next.</>
            )}
          </span>
        </div>
      ) : null}
      {error ? <p className="mt-5 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-[14px] text-ink">{error}</p> : null}
    </SceneCard>
  );
}

function GoogleG() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden="true">
      <path fill="#fff" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4c-.2 1.2-.9 2.3-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.4z" opacity="0.95" />
      <path fill="#fff" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6C4.8 19.8 8.1 22 12 22z" opacity="0.8" />
      <path fill="#fff" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1C2.4 8.8 2 10.4 2 12s.4 3.2 1.1 4.6L6.4 14z" opacity="0.65" />
      <path fill="#fff" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.8-2.8C17 3 14.7 2 12 2 8.1 2 4.8 4.2 3.1 7.4L6.4 10c.8-2.3 3-4.1 5.6-4.1z" opacity="0.9" />
    </svg>
  );
}

// ---------------------------------------------------------------- account

/** Step 2: an account. Three ways in, one screen: GitHub (the one most
 *  people pick, since the site's code is there anyway), Google, or a link by
 *  email. The terms box is the clickwrap /signup has. */
export function AccountScene({
  domain,
  accept,
  onAccept,
  onProvider,
  email,
  onEmail,
  onEmailSubmit,
  sentTo,
  onOtherWay,
  onChangeAddress,
  busy,
  error,
}: {
  domain: string;
  accept: boolean;
  onAccept: (v: boolean) => void;
  onProvider: (p: "github" | "google") => void;
  email: string;
  onEmail: (v: string) => void;
  onEmailSubmit: () => void;
  sentTo: string | null;
  /** Leaves the "check your inbox" screen for the sign-in buttons again. */
  onOtherWay?: () => void;
  onChangeAddress?: () => void;
  busy?: boolean;
  error?: string | null;
}) {
  if (sentTo) {
    return (
      <SceneCard id="account" title="Check your inbox" lead={`We sent a sign-in link to ${sentTo}. Open it on this device and setup carries on from here.`}>
        <p className="text-[14px] text-ink-muted">
          Nothing there after a minute? Check spam, or{" "}
          {onOtherWay ? (
            <button type="button" onClick={onOtherWay} className="rounded underline decoration-line underline-offset-4 hover:text-ink">
              use a different email or sign in another way
            </button>
          ) : (
            "send another"
          )}
          .
        </p>
      </SceneCard>
    );
  }
  return (
    <SceneCard id="account" title="Create your account" lead={`${domain} fits. Next, an account so your articles have a home.`}>
      <label className="flex cursor-pointer items-start gap-3 text-[14px] text-ink-muted">
        <input type="checkbox" checked={accept} onChange={(e) => onAccept(e.target.checked)} className="mt-0.5 h-4 w-4 accent-accent" />
        <span>
          I agree to the{" "}
          <a href="/terms" target="_blank" className="text-ink underline decoration-line underline-offset-4">
            Terms
          </a>{" "}
          and{" "}
          <a href="/privacy" target="_blank" className="text-ink underline decoration-line underline-offset-4">
            Privacy Policy
          </a>
          .
        </span>
      </label>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <button type="button" className={cx(BTN_PRIMARY, "w-full")} onClick={() => onProvider("github")} disabled={busy}>
          <GithubMark />
          Continue with GitHub
        </button>
        <button type="button" className={cx(BTN_QUIET, "w-full py-3.5 text-[15px] text-ink")} onClick={() => onProvider("google")} disabled={busy}>
          <GoogleG />
          Continue with Google
        </button>
      </div>
      <form
        className="mt-4 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          onEmailSubmit();
        }}
      >
        <input
          type="email"
          value={email}
          onChange={(e) => onEmail(e.target.value)}
          placeholder="Or your email"
          autoComplete="email"
          className={cx(CONTROL, "h-12 flex-1 rounded-xl text-[15px]")}
        />
        <button
          type="submit"
          className={cx(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim()) ? BTN_PRIMARY : BTN_QUIET, "h-12 whitespace-nowrap px-5 py-0 text-[15px] transition-all duration-300")}
          disabled={busy}
        >
          Email me a link
        </button>
      </form>
      {error ? <p className="mt-4 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-[14px] text-ink">{error}</p> : null}
      {onChangeAddress ? (
        <button type="button" onClick={onChangeAddress} className="mt-4 rounded text-[13px] text-ink-faint underline decoration-line underline-offset-4 hover:text-ink">
          Use a different address
        </button>
      ) : null}
    </SceneCard>
  );
}

// ------------------------------------------------------------------- plan

export type PaidTier = "starter" | "growth" | "scale";
export type PlanTier = "free" | PaidTier;
export type PlanInterval = "month" | "year";
export type PlanChoice = { tier: PlanTier; interval: PlanInterval };

/** One paid plan as the plan step shows it. Every number comes from
 *  billing.ts on the server (TIER_LIMITS, annualCharge, annualSavingsPct,
 *  ARTICLES_PER_WEEK) - none is typed here. */
export type PlanOffer = {
  tier: PaidTier;
  name: string;
  perWeek: number;
  /** Per month, billed monthly. */
  monthly: number;
  /** Null = no yearly product on this deployment. */
  yearly: { perMonth: number; charge: number; savePct: number } | null;
};
export type PlanMenu = {
  /** Null = the free plan is closed: no Free card. */
  free: { perMonth: number } | null;
  paid: PlanOffer[];
  /** Every paid plan can be bought yearly, so the toggle shows. */
  yearly: boolean;
};

// The same rule as billing.ts priceLabel (server-only, so not importable
// here): whole dollars plain, half-dollars with cents, never rounded.
const money = (n: number) => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`);

/** Who each plan is for, in one sentence (owner, 2026-11-09): the same
 *  lines as the landing's pricing cards and /plans. */
const WHO: Record<PlanTier, string> = {
  free: "For a side project, or a first look before you pay anything.",
  starter: "For a new or small site that wants steady articles without the work.",
  growth: "For a site with some traffic already that wants to grow it faster.",
  scale: "For a site where content is the main growth channel and speed matters.",
};

const perWeekLine = (n: number) => (n === 1 ? "1 article a week" : `${n} articles a week`);
const PAID_ROWS = ["Weekly keyword research", "Fact-checked articles", "Keyword rankings", "Advanced analytics", "No DispatchSEO badge"];
const FREE_ROWS = ["Topics people search for", "Fact-checked articles", "Published for you", "Your Google stats"];

function PlanCard({
  tier,
  name,
  price,
  billing,
  who,
  lead,
  rows,
  note,
  popular,
  on,
  busy,
  onPick,
}: {
  tier: PlanTier;
  name: string;
  price: string;
  billing: string;
  who: string;
  lead: string;
  rows: string[];
  note?: string;
  popular?: boolean;
  on: boolean;
  busy?: boolean;
  onPick: (tier: PlanTier) => void;
}) {
  return (
    <label
      className={cx(
        "relative flex cursor-pointer flex-col rounded-2xl border p-4 transition duration-200 motion-reduce:transition-none sm:p-5",
        on
          ? "-translate-y-0.5 border-accent/70 bg-surface-2 shadow-lg shadow-accent/10 ring-1 ring-accent/40 motion-reduce:translate-y-0"
          : "border-line-soft bg-surface-2/50 hover:border-line hover:bg-surface-2",
        "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/70 has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-surface",
        busy ? "pointer-events-none opacity-60" : "",
      )}
    >
      <input type="radio" name="plan" value={tier} checked={on} onChange={() => onPick(tier)} disabled={busy} className="sr-only" />
      <span className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className={cx("grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border-2 transition-colors", on ? "border-accent bg-accent" : "border-line")}
        >
          {on ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
        </span>
        <span className="text-[16px] font-semibold text-ink">{name}</span>
        {popular ? <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[11.5px] font-medium text-accent">Most popular</span> : null}
      </span>

      <span className="mt-4 flex flex-col">
        <span className="flex items-baseline gap-1">
          <span className="text-[30px] font-semibold leading-none tracking-tight text-ink tabular-nums">{price}</span>
          <span className="text-[13.5px] text-ink-muted">/month</span>
        </span>
        <span className="mt-1.5 text-[12.5px] text-ink-faint">{billing}</span>
      </span>

      <span className="mt-3 text-[14px] leading-snug text-ink-muted">{who}</span>

      {/* Phones: only the selected card lists its features, so four plans
          fit on a screen; from sm up every card shows its list. */}
      <ul className={cx("mt-4 space-y-2 border-t border-line-soft pt-4 text-[13.5px]", on ? "block" : "hidden sm:block")}>
        {[lead, ...rows].map((r, i) => (
          <li key={r} className={cx("flex items-start gap-2", i === 0 ? "font-medium text-ink" : "text-ink-muted")}>
            <Check className={cx("mt-px h-4 w-4 shrink-0", on ? "text-accent" : "text-ink-faint")} delay={i * 40} />
            <span>{r}</span>
          </li>
        ))}
        {note ? (
          <li className="flex items-start gap-2 text-ink-faint">
            <span aria-hidden="true" className="mt-[7px] ml-[5px] mr-[3px] h-1.5 w-1.5 shrink-0 rounded-full bg-line" />
            <span>{note}</span>
          </li>
        ) : null}
      </ul>
    </label>
  );
}

/** Step 3: every new site picks a plan here. Free goes straight on to
 *  GitHub; a paid plan goes through Polar first. */
export function PlanScene({
  menu,
  choice,
  onChoice,
  onContinue,
  domain,
  busy,
  error,
}: {
  menu: PlanMenu;
  choice: PlanChoice;
  onChoice: (c: PlanChoice) => void;
  onContinue: () => void;
  domain: string;
  busy?: boolean;
  error?: string | null;
}) {
  const yearly = menu.yearly && choice.interval === "year";
  const picked = choice.tier === "free" ? null : (menu.paid.find((o) => o.tier === choice.tier) ?? null);
  const pick = (tier: PlanTier) => onChoice({ ...choice, tier });
  const bestSave = Math.max(0, ...menu.paid.map((o) => o.yearly?.savePct ?? 0));
  const cards = (menu.free ? 1 : 0) + menu.paid.length;

  const cta = picked
    ? yearly && picked.yearly
      ? `Continue to payment · ${money(picked.yearly.charge)}/year`
      : `Continue to payment · ${money(picked.monthly)}/month`
    : "Start free";

  return (
    // The plan cards need more room than one column of text: from lg up
    // this scene reaches past the stage's column, still centred under it.
    <div className="lg:-mx-28 xl:-mx-36">
      <SceneCard
        id="checkout"
        title="Pick your plan"
        lead={`How often should we publish on ${domain}? You can switch plans any time.`}
        action={
          <>
            <button type="button" className={BTN_PRIMARY} onClick={onContinue} disabled={busy}>
              {cta}
              <Arrow />
            </button>
            <span className="text-[13px] text-ink-faint">{picked ? "Cancel any time." : "No card needed."}</span>
          </>
        }
      >
        {menu.yearly ? (
          <div role="radiogroup" aria-label="Billing period" className="mx-auto mb-6 flex w-fit items-center gap-1 rounded-xl border border-line-soft bg-surface-2 p-1">
            {(["month", "year"] as const).map((iv) => {
              const on = choice.interval === iv;
              return (
                <label
                  key={iv}
                  className={cx(
                    "cursor-pointer rounded-lg px-4 py-2 text-[13.5px] font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/70",
                    on ? "bg-surface-3 text-ink shadow-sm" : "text-ink-muted hover:text-ink",
                  )}
                >
                  <input type="radio" name="interval" value={iv} checked={on} onChange={() => onChoice({ ...choice, interval: iv })} disabled={busy} className="sr-only" />
                  {iv === "month" ? "Monthly" : "Yearly"}
                  {iv === "year" && bestSave > 0 ? <span className="ml-1.5 text-ok">save up to {bestSave}%</span> : null}
                </label>
              );
            })}
          </div>
        ) : null}

        <fieldset className="min-w-0">
          <legend className="sr-only">Plan</legend>
          <div className={cx("grid gap-3", cards >= 4 ? "sm:grid-cols-2 lg:grid-cols-4" : cards === 3 ? "md:grid-cols-3" : "sm:grid-cols-2")}>
            {menu.free ? (
              <PlanCard
                tier="free"
                name="Free"
                price="$0"
                billing="Free forever"
                who={WHO.free}
                lead={menu.free.perMonth === 1 ? "1 article a month" : `${menu.free.perMonth} articles a month`}
                rows={FREE_ROWS}
                note="Articles carry a small Made with DispatchSEO badge"
                on={choice.tier === "free"}
                busy={busy}
                onPick={pick}
              />
            ) : null}
            {menu.paid.map((o) => {
              const y = yearly && o.yearly ? o.yearly : null;
              return (
                <PlanCard
                  key={o.tier}
                  tier={o.tier}
                  name={o.name}
                  price={money(y ? y.perMonth : o.monthly)}
                  billing={y ? `Billed ${money(y.charge)} a year, save ${y.savePct}%` : "Billed monthly"}
                  who={WHO[o.tier]}
                  lead={perWeekLine(o.perWeek)}
                  rows={o.tier === "scale" ? [...PAID_ROWS, "Priority support"] : PAID_ROWS}
                  popular={o.tier === "growth"}
                  on={choice.tier === o.tier}
                  busy={busy}
                  onPick={pick}
                />
              );
            })}
          </div>
        </fieldset>

        {error ? <p className="mt-5 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-[14px] text-ink">{error}</p> : null}
        {/* The point of purchase, so the express-consent line /plans carries
            (EU/UK 14-day withdrawal waiver - see app/plans/page.tsx). Shown
            whenever a paid plan is selected; the free plan buys nothing. */}
        {picked ? (
          <p className="mx-auto mt-6 max-w-[44rem] text-center text-[12.5px] leading-relaxed text-ink-faint">
            Your subscription renews automatically until you cancel. By subscribing you agree to the{" "}
            <a className="underline underline-offset-2 hover:text-ink-muted" href="/terms" target="_blank">
              terms of service
            </a>
            , and you ask us to start the service straight away - which means that once it has been fully performed you lose the 14-day right of
            withdrawal you would otherwise have as a consumer. Cancel any time from your billing page.
          </p>
        ) : null}
      </SceneCard>
    </div>
  );
}

export function Arrow() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 10h11M11 5l5 5-5 5" />
    </svg>
  );
}

export { BTN_QUIET };
