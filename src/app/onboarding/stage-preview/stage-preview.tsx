"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SetupStageShell } from "@/components/setup-stage/stage";
import { AccountScene, AddressScene, GithubScene, GoogleScene, type GoogleProgress, type SiteVerdict } from "@/components/setup-stage/scenes";
import { FirstArticleWait, type FirstArticleProgress } from "@/components/setup-stage/wait";
import { railFor, type SceneId } from "@/components/setup-stage/primitives";
import { cx, FOCUS_RING } from "@/components/ui/styles";

// Design preview of the setup stage: a scripted run through every scene
// with fake data and timers, so the whole thing can be watched end to end
// without a database, GitHub or Polar. Autoplay types the address, "signs
// in", "goes to GitHub", switches the blog on, and lands on Home's first
// state while the first article is "written". Click any scene to jump.
// The free plan's path - no checkout step.

type Variant = "ok" | "refused" | "unreadable" | "gsc-missing" | "gsc-stuck";
type View = SceneId | "wait";
const DOMAIN = "leatherandco.com";
const VIEWS: { id: View; label: string }[] = [
  { id: "address", label: "1 · Address" },
  { id: "account", label: "2 · Account" },
  { id: "github", label: "3 · GitHub" },
  { id: "google", label: "4 · Google" },
  { id: "wait", label: "Home · first article" },
];

const WAIT_START: FirstArticleProgress = { blog: "doing", google: null, reading: "todo", topics: "todo", writing: "todo", publishing: "todo" };
const GOOGLE_ASK: GoogleProgress = { kind: "ask" };

export function StagePreview() {
  const [view, setView] = useState<View>("address");
  const [variant, setVariant] = useState<Variant>("ok");
  const [auto, setAuto] = useState(true);
  const [address, setAddress] = useState("");
  const [verdict, setVerdict] = useState<SiteVerdict>({ kind: "idle" });
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState<FirstArticleProgress>(WAIT_START);
  const [google, setGoogle] = useState<GoogleProgress>(GOOGLE_ASK);
  const [say, setSay] = useState<string>("Hi. What's your site's address?");
  const [hop, setHop] = useState(false);
  const run = useRef(0);

  // Every timer belongs to a run; a jump or a replay bumps the run and the
  // old timers find themselves stale and do nothing.
  const after = useCallback((ms: number, fn: () => void) => {
    const mine = run.current;
    const id = setTimeout(() => {
      if (run.current === mine) fn();
      else console.debug(`[preview] stale timer: scheduled under run ${mine}, now ${run.current}`);
    }, ms);
    return id;
  }, []);
  const cheer = useCallback((text: string) => {
    setSay(text);
    setHop(true);
    setTimeout(() => setHop(false), 700);
  }, []);

  // ---- the script, one scene at a time -----------------------------------
  const playAddress = useCallback(() => {
    run.current += 1;
    setView("address");
    setAddress("");
    setVerdict({ kind: "idle" });
    setBusy(false);
    setSay("Hi. What's your site's address?");
    if (!auto) return;
    let i = 0;
    const type = () => {
      i += 1;
      setAddress(DOMAIN.slice(0, i));
      if (i < DOMAIN.length) after(70 + Math.random() * 60, type);
      else {
        setVerdict({ kind: "checking" });
        setSay("One second…");
        after(1100, () => {
          if (variant === "refused") {
            setVerdict({ kind: "refused", platform: "Wix" });
            setSay("Ah. This one I can't write for, sorry.");
          } else {
            setVerdict({ kind: "ok", framework: "Next.js", host: "Vercel", hasBlog: false });
            cheer("Next.js on Vercel. I can work with this.");
            after(1600, () => playStart());
          }
        });
      }
    };
    after(500, type);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, variant]);

  const playGithub = useCallback(() => {
    run.current += 1;
    setView("github");
    setBusy(false);
    setSay("Three clicks. I'll show you each one.");
    if (auto) after(3200, () => goGithub());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  const goGithub = useCallback(() => {
    setBusy(true);
    setSay("Off to GitHub… and back.");
    after(1300, () => playGoogle());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const playGoogle = useCallback(() => {
    run.current += 1;
    setView("google");
    setBusy(false);
    setGoogle(GOOGLE_ASK);
    setSay("Last step. Two clicks.");
    if (auto) after(3000, () => goGoogle());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  const goGoogle = useCallback(() => {
    setBusy(true);
    setSay("Off to Google… and back.");
    after(1300, () => {
      setBusy(false);
      setGoogle({ kind: "checking" });
      setSay("Looking for your site in there.");
      const missing = variant === "gsc-missing" || variant === "gsc-stuck";
      after(1400, () => {
        if (missing) {
          setGoogle({ kind: "missing" });
          setSay("Not in there yet. I'll add it myself in the next step.");
        } else {
          setGoogle({ kind: "found", property: `https://${DOMAIN}/` });
          cheer("Found it. Google's connected.");
        }
        if (auto) after(1800, () => playWait());
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, variant]);

  const playStart = useCallback(() => {
    run.current += 1;
    setView("account");
    setBusy(false);
    setSay("One click and you're in.");
    if (auto) after(2600, () => goStart());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  const goStart = useCallback(() => {
    setBusy(true);
    after(1100, () => playGithub());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const playWait = useCallback(() => {
    run.current += 1;
    setView("wait");
    setBusy(false);
    const missing = variant === "gsc-missing" || variant === "gsc-stuck";
    setWait({ ...WAIT_START, google: missing ? "todo" : null });
    after(2200, () => setWait((w) => ({ ...w, blog: "done", google: w.google ? "doing" : null, reading: w.google ? "todo" : "doing" })));
    after(4200, () => setWait((w) => ({ ...w, google: w.google ? "done" : null, reading: "doing" })));
    after(5800, () => setWait((w) => ({ ...w, reading: "done", topics: "doing" })));
    after(8400, () => setWait((w) => ({ ...w, topics: "done", keywordsFound: 38, writing: "doing", topic: "best leather bag for a daily commute" })));
    after(13400, () => setWait((w) => ({ ...w, writing: "done", publishing: "doing" })));
    after(16000, () => setWait((w) => ({ ...w, publishing: "done", liveUrl: `https://${DOMAIN}/blog/best-leather-bag-daily-commute` })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Jump to a scene in its settled state (manual mode) or play it (auto).
  const jump = useCallback(
    (v: View) => {
      run.current += 1;
      setBusy(false);
      if (v === "address") return playAddress();
      if (v === "github") return playGithub();
      if (v === "google") return playGoogle();
      if (v === "account") return playStart();
      return playWait();
    },
    [playAddress, playGithub, playGoogle, playStart, playWait],
  );

  useEffect(() => {
    playAddress();
    return () => {
      run.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const steps = railFor(false);
  const done = Math.max(0, steps.findIndex((x) => x.id === view));

  return (
    <div className="min-h-screen bg-canvas pb-24 text-ink">
      {view === "wait" ? (
        <div className="px-4 py-8 sm:px-6">
          <FirstArticleWait siteName="Leather & Co" progress={wait} />
        </div>
      ) : (
        <SetupStageShell scene={view} done={done} say={say} hop={hop} steps={steps}>
          {view === "address" ? (
            <AddressScene
              value={address}
              onChange={(v) => {
                run.current += 1;
                setAddress(v);
                setVerdict(v.length > 3 ? { kind: "ok", framework: "Next.js", host: "Vercel", hasBlog: false } : { kind: "idle" });
              }}
              onSubmit={playStart}
              verdict={verdict}
              busy={busy}
            />
          ) : null}
          {view === "github" ? <GithubScene onContinue={goGithub} busy={busy} handoffHref="#handoff" /> : null}
          {view === "google" ? <GoogleScene p={google} domain={DOMAIN} onContinueWithGoogle={goGoogle} onContinue={playWait} busy={busy} /> : null}
          {view === "account" ? (
            <AccountScene domain={DOMAIN} accept onAccept={() => {}} onProvider={() => goStart()} email="" onEmail={() => {}} onEmailSubmit={goStart} sentTo={null} busy={busy} />
          ) : null}
        </SetupStageShell>
      )}

      {/* Preview controls - not part of the design. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 text-[13px]">
          <span className="mr-2 font-medium text-ink-faint">Preview</span>
          {VIEWS.map((v) => (
            <button key={v.id} type="button" onClick={() => jump(v.id)} className={cx("rounded-md border px-2.5 py-1", view === v.id ? "border-accent bg-accent-soft text-ink" : "border-line text-ink-muted hover:text-ink", FOCUS_RING)}>
              {v.label}
            </button>
          ))}
          <span className="mx-2 h-4 w-px bg-line" aria-hidden="true" />
          <label className="flex items-center gap-1.5 text-ink-muted">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> autoplay
          </label>
          <select value={variant} onChange={(e) => setVariant(e.target.value as Variant)} className="rounded-md border border-line bg-surface-2 px-2 py-1 text-ink-muted">
            <option value="ok">site: OK</option>
            <option value="refused">site: Wix (refused)</option>
            <option value="unreadable">site: unreadable</option>
            <option value="gsc-missing">Google: site not in Search Console</option>
            <option value="gsc-stuck">Google: won&apos;t confirm</option>
          </select>
          <button type="button" onClick={() => jump("address")} className={cx("ml-auto rounded-md border border-line px-2.5 py-1 text-ink-muted hover:text-ink", FOCUS_RING)}>
            Replay
          </button>
        </div>
      </div>
    </div>
  );
}
