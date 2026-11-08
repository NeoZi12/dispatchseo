"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SetupStageShell } from "@/components/setup-stage/stage";
import { AccountScene, AddressScene, CheckoutScene, GithubScene, GoogleScene, type PlanSummary, type SiteVerdict } from "@/components/setup-stage/scenes";
import { railFor, type SceneId } from "@/components/setup-stage/primitives";
import { cleanDomain, isValidDomain } from "@/lib/domain";
import { cx, FOCUS_RING } from "@/components/ui/styles";
import { checkSite, chooseFreePlan, createSite, overrideSiteCheck, pickSetupRepo, startEmailSignIn, startOAuthSignIn } from "./setup-actions";

// The live setup stage. The server decides which step this is (from
// evidence, lib/setup-flow.ts) and hands it in; this only holds what is
// typed and what is in flight. Address -> account is the one move made here
// without a reload - everything after it is a trip to GitHub, Google, the
// inbox or Polar and back, and the server picks the next step on return.

export type SetupClientStage = "address" | "checkout" | "github" | "google";

/** The plan the checkout step sells, with what its URL needs. */
export type CheckoutPlan = PlanSummary & { tier: string };

function okLine(v: Extract<SiteVerdict, { kind: "ok" }>): string {
  if (v.framework && v.host) return `${v.framework} on ${v.host}. I can work with this.`;
  if (v.host) return `A site on ${v.host}. I can work with this.`;
  if (v.framework) return `${v.framework}. I can work with this.`;
  return "I can work with this.";
}

/** "taken" rides the refused shape from the server (scenes.tsx has no
 *  kind for it); this file words it. */
const isTaken = (v: SiteVerdict) => v.kind === "refused" && v.platform === "taken";

function lineFor(v: SiteVerdict, signedIn: boolean): string {
  if (v.kind === "checking") return "One second…";
  if (isTaken(v)) return "This site already has a DispatchSEO account.";
  if (v.kind === "refused") return "Ah. This one I can't write for, sorry.";
  if (v.kind === "ok") return okLine(v);
  if (v.kind === "unknown") return "I couldn't tell what it's built on. If the code's on GitHub, we're good.";
  return signedIn ? "You're signed in. Which site is it for?" : "Hi. What's your site's address?";
}

export function SetupClient(props: {
  stage: SetupClientStage;
  slug: string | null;
  domain: string | null;
  prefill: string;
  initialVerdict: SiteVerdict;
  signedIn: boolean;
  /** Null = no checkout in this setup (the free plan). */
  checkoutPlan: CheckoutPlan | null;
  /** Offer "start free instead" on the checkout step. */
  freeOpen: boolean;
  freePerMonth: number;
  sentTo: string | null;
  repos: string[] | null;
  ghError: string | null;
  googleError: string | null;
  notice: string | null;
}) {
  const router = useRouter();
  const [scene, setScene] = useState<SceneId>(props.sentTo && props.stage === "address" && !props.signedIn ? "account" : props.stage);
  const [accept, setAccept] = useState(false);
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(props.sentTo);
  const steps = railFor(Boolean(props.checkoutPlan));
  const [address, setAddress] = useState(props.prefill);
  const [verdict, setVerdict] = useState<SiteVerdict>(props.initialVerdict);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hop, setHop] = useState(false);
  const [say, setSay] = useState<string>(() => props.notice ?? (props.stage === "address" ? lineFor(props.initialVerdict, props.signedIn) : ""));
  const asked = useRef(0);
  const checked = useRef<string | null>(props.initialVerdict.kind === "idle" ? null : cleanDomain(props.prefill));

  const cheer = useCallback((text: string) => {
    setSay(text);
    setHop(true);
    setTimeout(() => setHop(false), 700);
  }, []);

  // Check the address once typing pauses. Every request is numbered, so an
  // answer for something already retyped is dropped.
  const check = useCallback(
    async (raw: string) => {
      const domain = cleanDomain(raw);
      if (!isValidDomain(domain)) return;
      const mine = ++asked.current;
      checked.current = domain;
      setVerdict({ kind: "checking" });
      setSay("One second…");
      let v: SiteVerdict;
      try {
        v = await checkSite(domain);
      } catch {
        v = { kind: "unknown" };
      }
      if (asked.current !== mine) return;
      setVerdict(v);
      if (v.kind === "ok") cheer(okLine(v));
      else setSay(lineFor(v, props.signedIn));
    },
    [cheer, props.signedIn],
  );

  // An address that arrived with the page (typed on the landing hero) is
  // checked at once - the person already finished typing it. Usually the
  // hero's own pre-check has answered by now and the verdict came in with the
  // page, so this never runs. Typing here waits for a pause instead.
  const typed = useRef(false);
  useEffect(() => {
    if (scene !== "address") return;
    const domain = cleanDomain(address);
    if (!isValidDomain(domain) || checked.current === domain) return;
    const t = setTimeout(() => void check(address), typed.current ? 700 : 0);
    return () => clearTimeout(t);
  }, [address, scene, check]);

  async function overrideCheck() {
    const mine = ++asked.current;
    setBusy(true);
    let v: SiteVerdict;
    try {
      v = await overrideSiteCheck(cleanDomain(address));
    } catch {
      v = { kind: "unknown" };
    }
    setBusy(false);
    if (asked.current !== mine) return;
    setVerdict(v);
    cheer("Fair enough - GitHub will tell us for sure.");
  }

  // Back from Polar/GitHub/Google with the browser's back button: the page
  // comes out of the bfcache with its buttons still "busy".
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) setBusy(false);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  // Scene-entry lines for the steps the server lands on.
  // The server's notice belongs to the scene it landed on, not the next one.
  useEffect(() => {
    const notice = scene === props.stage ? props.notice : null;
    if (scene === "account") setSay(notice ?? (sentTo ? "Open the link and I'll take it from there." : "One click and you're in."));
    if (scene === "checkout") setSay(notice ?? "Pay here, then I take it from there.");
    if (scene === "github") setSay(notice ?? (props.ghError ? "GitHub didn't finish. Let's try that again." : props.repos && props.repos.length > 1 ? "Which of these is your site?" : "Three clicks. I'll show you each one."));
    if (scene === "google") setSay(notice ?? (props.googleError ? "Google didn't finish. One more try?" : "Last step. Two clicks."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);

  const domain = props.domain ?? cleanDomain(address);

  async function addressContinue() {
    if (!props.signedIn) {
      setError(null);
      setScene("account");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await createSite();
    if ("error" in res) {
      setBusy(false);
      setError(res.error);
      setSay("Hm. That didn't take.");
      return;
    }
    router.refresh();
  }

  const pickInput = () => ({ accept, tier: props.checkoutPlan?.tier ?? null, interval: props.checkoutPlan?.interval ?? null });

  async function signIn(provider: "github" | "google") {
    if (!accept) {
      setError("Tick the box to accept the Terms first.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await startOAuthSignIn(provider, pickInput());
    if ("error" in res) {
      setBusy(false);
      setError(res.error);
      return;
    }
    window.location.href = res.url;
  }

  async function emailSignIn() {
    if (!accept) {
      setError("Tick the box to accept the Terms first.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await startEmailSignIn(email, pickInput());
    setBusy(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    setSentTo(res.to);
    setSay("Open the link and I'll take it from there.");
  }

  async function startFree() {
    setBusy(true);
    setError(null);
    const res = await chooseFreePlan();
    if ("error" in res) {
      setBusy(false);
      setError(res.error);
      return;
    }
    window.location.href = "/onboarding";
  }

  async function pick(repo: string) {
    if (!props.slug) return;
    setBusy(true);
    setError(null);
    const res = await pickSetupRepo(props.slug, repo);
    if ("error" in res) {
      setBusy(false);
      setError(res.error);
      return;
    }
    router.refresh();
  }

  const showRepos = scene === "github" && props.repos && props.repos.length > 1;

  return (
    <SetupStageShell scene={scene} done={Math.max(0, steps.findIndex((x) => x.id === scene))} say={say} hop={hop} steps={steps}>
      {scene === "address" ? (
        <>
          <AddressScene
            value={address}
            onChange={(v) => {
              typed.current = true;
              asked.current += 1;
              checked.current = null;
              setAddress(v);
              setVerdict({ kind: "idle" });
              setSay(lineFor({ kind: "idle" }, props.signedIn));
            }}
            onSubmit={() => void addressContinue()}
            onOverride={() => void overrideCheck()}
            verdict={isTaken(verdict) ? { kind: "idle" } : verdict}
            busy={busy}
          />
          {isTaken(verdict) ? (
            <p className="mt-4 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-[14.5px] text-ink">
              This site already has a DispatchSEO account.{" "}
              <a href="/login" className="font-medium underline underline-offset-4">
                Sign in to continue.
              </a>
            </p>
          ) : null}
          {error ? <p className="mt-4 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-[14px] text-ink">{error}</p> : null}
        </>
      ) : null}

      {scene === "account" ? (
        <AccountScene
          domain={domain}
          accept={accept}
          onAccept={(v) => {
            setAccept(v);
            if (v) setError(null);
          }}
          onProvider={(p) => void signIn(p)}
          email={email}
          onEmail={setEmail}
          onEmailSubmit={() => void emailSignIn()}
          sentTo={sentTo}
          onOtherWay={() => {
            setError(null);
            setSentTo(null);
            setSay("One click and you're in.");
          }}
          onChangeAddress={() => {
            setError(null);
            setScene("address");
          }}
          busy={busy}
          error={error}
        />
      ) : null}

      {scene === "checkout" && props.checkoutPlan ? (
        <CheckoutScene
          plan={props.checkoutPlan}
          domain={domain}
          busy={busy}
          error={error}
          freePerMonth={props.freePerMonth}
          onFree={props.freeOpen ? () => void startFree() : undefined}
          onPay={() => {
            setBusy(true);
            const q = new URLSearchParams({ tier: props.checkoutPlan!.tier, interval: props.checkoutPlan!.interval, flow: "setup" });
            window.location.href = `/api/polar/checkout?${q.toString()}`;
          }}
        />
      ) : null}

      {scene === "github" && !showRepos ? (
        <GithubScene
          busy={busy}
          error={props.ghError ?? error}
          onContinue={() => {
            if (!props.slug) return;
            setBusy(true);
            window.location.href = `/api/github/install/start?slug=${encodeURIComponent(props.slug)}`;
          }}
        />
      ) : null}

      {showRepos ? (
        <section className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
          <h2 className="text-[22px] font-semibold tracking-tight text-ink">Which one is your site?</h2>
          <p className="mt-1 text-[15px] text-ink-muted">GitHub gave us access to more than one repository. Pick the one {domain} is built from.</p>
          <ul className="mt-5 grid gap-2">
            {props.repos!.map((r) => (
              <li key={r}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void pick(r)}
                  className={cx("w-full rounded-xl border border-line bg-surface-2 px-4 py-3 text-left font-mono text-[14px] text-ink transition hover:border-accent disabled:opacity-50", FOCUS_RING)}
                >
                  {r}
                </button>
              </li>
            ))}
          </ul>
          {error ? <p className="mt-4 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-[14px] text-ink">{error}</p> : null}
        </section>
      ) : null}

      {scene === "google" ? (
        <GoogleScene
          p={{ kind: "ask" }}
          domain={domain}
          busy={busy}
          error={props.googleError}
          onContinueWithGoogle={() => {
            if (!props.slug) return;
            setBusy(true);
            window.location.href = `/api/oauth/google/start?slug=${encodeURIComponent(props.slug)}&returnTo=onboarding`;
          }}
          onContinue={() => router.refresh()}
        />
      ) : null}
    </SetupStageShell>
  );
}
