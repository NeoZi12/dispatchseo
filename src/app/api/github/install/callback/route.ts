import { healReposForInstallation } from "@/lib/repo-site-check";
import { redirect, unstable_rethrow } from "next/navigation";
import { NextResponse } from "next/server";
import { requireDashboard } from "@/lib/auth-gate";
import { verifyState } from "@/lib/gsc-oauth";
import { getProjectBySlug } from "@/lib/projects";
import { assertInstallationClaimable, assertProjectOwned, installationAlreadyMine, ownedProjectIds } from "@/lib/tenant-guard";
import { inheritGithubInstallation, pendingSetupProject } from "@/lib/setup-flow";
import {
  callerControlsInstallation,
  GH_WANT_COOKIE,
  getInstallation,
  installationsControlledBy,
  installUrl,
  installationClaimable,
  listInstallationRepos,
  makeInstallNonce,
  requireInstallProof,
  userAuthConfigured,
} from "@/lib/github-app";
import { db } from "@/lib/db";
import { scopedProjects } from "@/lib/active-project";
import { isCloudMode } from "@/lib/cloud";
import { cookies } from "next/headers";

// GitHub redirects here after the App install/update flow. With "Request user
// authorization (OAuth) during installation" enabled, this URL is the App's
// "User authorization callback URL"; it is also set as the Setup URL, which
// only matters for the update redirect. (GitHub's docs say the Setup URL field
// is not even enterable once OAuth-on-install is ticked - an acknowledged gap
// in their own documentation. Pointing both at this route sidesteps it.)
//
// Three arrivals, and they do NOT resolve the same way:
//   setup_action=install  fresh install. Carries an OAuth `code`, plus our
//                         signed `state` when the flow began at our own
//                         /api/github/install/start. This is the only path
//                         that binds an installation to a project.
//   setup_action=update   repos added/removed from GitHub's settings UI.
//                         Carries NEITHER state NOR code - GitHub does not run
//                         the authorization step for an update - and needs no
//                         write. Handled first, below.
//   setup_action=request  org member asked an owner to approve. Nothing is
//                         installed yet and no code exists.
//
// state only comes back when the flow started at our own
// /api/github/install/start (the wizard's "Connect GitHub" button, which
// signs the originating project's slug into it) - a bare "Install" click
// from github.com/apps/... arrives with no state at all, so that path is
// handled separately below.
//
// getInstallation() is not optional plumbing: installation_id is a caller-
// supplied, unauthenticated query param at this point. Without checking it
// against the App's own installations list, anyone could point this route at
// an installation_id belonging to a completely different app/org and get it
// wired into their project.

export async function GET(req: Request): Promise<Response> {
  await requireDashboard();
  // GitHub App install is cloud-only (self-host uses the merge token). 404 out
  // like the other cloud-only API routes - defense in depth.
  if (!isCloudMode()) return NextResponse.json({ error: "not found" }, { status: 404 });

  const url = new URL(req.url);
  const installationIdRaw = url.searchParams.get("installation_id");
  const state = url.searchParams.get("state");
  // "install" | "update" | "request". Undocumented on docs.github.com (GitHub
  // Support confirms it only in support threads), so it is treated as a hint
  // and never as the sole basis for a decision.
  const setupAction = url.searchParams.get("setup_action");

  let installationId = installationIdRaw ? Number(installationIdRaw) : NaN;

  try {
    // Resolved once, up front: which project started this flow (if any), and
    // whether the OAuth code proves this human administers the installation.
    // The proof is a ONE-TIME code, so it is exchanged lazily and memoized -
    // both the claim path and the freshness gate below read the same answer.
    const slug = state ? await verifyState(state) : null;
    const proofCode = url.searchParams.get("code") ?? "";
    let provenPromise: Promise<boolean> | null = null;

    // A FOURTH arrival: GitHub's sign-in alone (install/start?check=1), for an
    // owner whose GitHub account already has the App. It carries our signed
    // state and a code, and NO installation_id - which installation is read
    // from GitHub with the code, as the list of installations this person
    // can push through. So the id below is never a caller-supplied number on
    // this path, and the proof is already in hand.
    //   none      they have not installed it after all: on to the install link
    //   one       that one
    //   several   the one they asked for (a cookie, checked against the
    //             list), else the first; the others ride along for the
    //             repository screen's "use another account" links
    let viaSignIn = false;
    let otherAccounts: Array<{ id: number; login: string }> = [];
    let chosenLogin = "";
    const back = (msg: string) => `/onboarding?gh=error${slug ? `&site=${encodeURIComponent(slug)}` : ""}&msg=${encodeURIComponent(msg)}`;
    // Said no on GitHub's sign-in screen: no code and no installation, and
    // "bad-installation-id" would be our word for their choice.
    if (!Number.isFinite(installationId) && !proofCode && url.searchParams.get("error")) {
      redirect(back("GitHub sign-in wasn't finished. Nothing was changed - try again when you're ready."));
    }
    if (!Number.isFinite(installationId) && slug && proofCode && !setupAction) {
      const jar = await cookies();
      const wantRaw = Number(jar.get(GH_WANT_COOKIE)?.value);
      const want = Number.isSafeInteger(wantRaw) && wantRaw > 0 ? wantRaw : null;
      // One use: it was for this trip.
      jar.delete({ name: GH_WANT_COOKIE, path: "/api/github/install" });
      const listed = await installationsControlledBy(proofCode, want ?? undefined);
      if (listed === null) redirect(back("GitHub didn't answer just now. Try that again."));
      const mine = listed.mine;
      if (mine.length === 0) {
        // Only suspended ones: the install link would show them the same
        // settings page with nothing to press.
        if (listed.suspended > 0) {
          redirect(back("DispatchSEO is suspended on your GitHub account. Open GitHub > Settings > Applications > DispatchSEO, press Unsuspend, then try again."));
        }
        redirect(await installUrl(slug));
      }
      // The account they clicked, or nothing: never a different one quietly.
      if (want !== null && !mine.some((i) => i.id === want)) {
        redirect(back("We couldn't use that GitHub account for this site. Pick it again, or choose another."));
      }
      const chosen = mine.find((i) => i.id === want) ?? mine[0];
      installationId = chosen.id;
      chosenLogin = chosen.login;
      otherAccounts = mine.filter((i) => i.id !== chosen.id);
      viaSignIn = true;
      provenPromise = Promise.resolve(true);
    }

    if (!Number.isFinite(installationId)) {
      // A sign-in that came back after its ten minutes (the state no longer
      // verifies), or an address with no installation in it.
      redirect(proofCode ? back("That took too long, so nothing was changed. Try again from this page.") : "/onboarding?gh=error&msg=bad-installation-id");
    }

    const provenCaller = () =>
      (provenPromise ??= proofCode
        ? callerControlsInstallation(proofCode, installationId)
        : Promise.resolve(false));

    // UPDATE redirects are handled before either branch below, because they
    // satisfy neither one's assumptions. When someone adds or removes a repo
    // from an existing installation via GitHub's own settings UI, "Redirect on
    // update" sends them here with installation_id + setup_action=update and
    // NOTHING ELSE - no signed state (they never came from our link) and no
    // OAuth code (GitHub does not run the authorization step for an update;
    // its docs promise `code` only for the install flow). Falling through
    // would demand the proof code and answer "install-not-yours" for what is a
    // completely routine permission change (2026-07-27).
    //
    // Usually nothing needs writing on this path: the installation is already
    // bound to whichever project claimed it, and repo membership is read live
    // from GitHub every time we use it. So it resolves to a plain redirect -
    // but ONLY when the caller genuinely has nothing left to bind.
    //
    // The original version redirected whenever ANY project held the id, which
    // is how the reconnect card became unclearable (2026-07-29): clicking
    // "Reinstall" on a project whose pointer was null sent the owner to
    // GitHub, GitHub answered setup_action=update because the App was already
    // installed on that account, and this branch bounced them to /dashboard
    // without ever reading the signed state that named the project asking to
    // be connected. It looked like success and wrote nothing.
    //
    // So: a signed state means a specific project asked to be connected - let
    // the claim path below decide for THAT project. Without state, only skip
    // out when a project the CALLER owns already holds this installation;
    // otherwise fall through and let them claim it.
    //
    // Safe against a forged setup_action=update carrying a victim's id: the
    // fall-through lands on the same proof + claimable + freshness gates as
    // any other install, so no binding is created that those would refuse.
    if (setupAction === "update" && !slug) {
      const { data: bound } = await db()
        .from("projects")
        .select("id")
        .eq("github_installation_id", installationId);
      const owned = await ownedProjectIds();
      const rows = (bound ?? []) as Array<{ id: string }>;
      if (rows.length > 0 && (owned === null || rows.some((r) => owned.has(r.id)))) {
        // The owner just changed which repos we can see - often to add the
        // site's real repo after the dashboard said the connected one is
        // empty or wrong. Connect it and release the held article now.
        await healReposForInstallation(installationId).catch(() => 0);
        // A site of theirs still in setup: this trip to GitHub was its
        // "add my repository" step (GitHub sends no state back from its
        // settings page). Give it the installation if it has none, and go
        // back to its setup, where the repository list is read fresh -
        // /dashboard would show that site's empty Home and the step undone.
        const pending = await pendingSetupProject().catch(() => null);
        // Only a site that is waiting on exactly this: no repository yet,
        // and no installation or this same one. A change made for another
        // site (the wrong-repo card of a finished one) goes to the dashboard
        // as before, not into an old unfinished site's setup.
        if (pending && !pending.github_repo && (!pending.github_installation_id || pending.github_installation_id === installationId)) {
          // This installation, not "the newest": it is the one GitHub just
          // sent them back from, and it is already theirs (checked above).
          if (!pending.github_installation_id) await inheritGithubInstallation(pending, installationId);
          redirect(`/onboarding?gh=pick_repo&site=${encodeURIComponent(pending.slug)}`);
        }
        redirect("/dashboard");
      }
      // Nothing of the caller's is bound to it - fall through and let the
      // normal claim path decide, proof code and all.
    }

    // An org member requesting an install they cannot approve themselves gets
    // setup_action=request: nothing is installed yet and GitHub issues no code,
    // so there is genuinely nothing to claim. Say that plainly instead of
    // failing the proof check with a misleading "not yours".
    if (setupAction === "request") {
      redirect(`/onboarding?gh=error&msg=${encodeURIComponent("Your organization still has to approve the DispatchSEO app. Once an owner approves it, come back and click Install again.")}`);
    }

    if (slug) {
      const project = await getProjectBySlug(slug);
      if (!project) redirect("/onboarding?gh=error&msg=unknown-project");
      await assertProjectOwned(project.id);
      // The sign-in path is for a site with no repository yet. A connected
      // site never starts it (install/start), and one that got its
      // repository in another tab meanwhile has nothing left to do here.
      if (viaSignIn && project.github_repo) redirect(`/onboarding?gh=installed&site=${encodeURIComponent(project.slug)}`);

      // Proof that the human who just clicked Install controls THIS installation.
      // GitHub's setup redirect is unsigned, so without this the only checks were
      // "do you own the project you are writing into" and "is this installation
      // fresh" - neither of which says the installation is yours. With user
      // authorization enabled on the App, GitHub sends a one-time `code`; it
      // exchanges for a token belonging to the installer, whose
      // GET /user/installations lists what they can actually administer.
      //
      // No code at all means GITHUB's redirect did not carry one - an App
      // CONFIGURATION fact about us, not evidence about the caller. Failing
      // closed on it blocked every legitimate install the moment the client
      // credentials were set (2026-07-28, launch morning), so absence became an
      // opt-in refusal for a while. The default is strict again: with the
      // client credentials configured a missing code is refused, unless the
      // operator sets GITHUB_APP_REQUIRE_INSTALL_PROOF=0 to fall back to the
      // freshness/suspension gate (see requireInstallProof). A code that IS
      // present and does not verify is real evidence, and always fails closed.
      if (!proofCode && userAuthConfigured()) {
        console.error(
          `[github-install] no ?code on the callback for installation ${installationId} ` +
            `(setup_action=${setupAction ?? "none"}, state=${state ? "present" : "none"}). ` +
            `Check that "Request user authorization (OAuth) during installation" is enabled on ` +
            `the App and that its Callback URL points here. ` +
            `${requireInstallProof() ? "REFUSING (install proof required; set GITHUB_APP_REQUIRE_INSTALL_PROOF=0 to fall back to the freshness gate)." : "Falling back to the freshness gate."}`,
        );
      }
      // On the sign-in path the code was already spent on the list this
      // installation was read from: that list IS the proof.
      const proven = viaSignIn ? true : await provenCaller();
      // No code, but the installation is already attached to a site this
      // caller owns: the owner is adding a repository for their NEXT site,
      // and GitHub sends no sign-in code for a change to an app that is
      // already installed. Their ownership of it was established when the
      // first site was bound, and the signed state proves they own this
      // one, so nothing new is granted. A code that is present and fails
      // still refuses.
      const alreadyMine = !proofCode && (await installationAlreadyMine(installationId));
      if (alreadyMine ? false : !proofCode ? requireInstallProof() : !proven) {
        redirect(`/onboarding?gh=error&msg=${encodeURIComponent("We could not confirm that this GitHub installation belongs to you. Install the app from this page's button so we can verify it, rather than from github.com directly.")}`);
      }
      // installation_id is an enumerable integer from the query string; state
      // proves the caller owns the PROJECT, not the installation. Refuse one
      // already bound to another tenant, or a signed-in attacker could wire a
      // victim's installation into their own project and write to the
      // victim's repo through our App. A verified proof code answers that
      // question directly, so it lifts the exclusivity rule.
      await assertInstallationClaimable(installationId, { provenCaller: proven });

      const installation = await getInstallation(installationId);
      // One generic message for BOTH "not our App's installation" and "not
      // claimable right now". Distinct replies made this endpoint an oracle:
      // probe an id, read which error came back, learn whether it belongs to
      // DispatchSEO - free reconnaissance for picking a hijack target.
      //
      // Freshness is a proxy for "the caller just did this install"; a
      // verified proof code establishes the same thing directly and outranks
      // it, so a proven caller reconnecting an installation GitHub last
      // touched days ago is not turned away. Suspension still blocks either
      // way - a suspended installation cannot act on the repo at all.
      if (!installation || installation.suspended) {
        redirect("/onboarding?gh=error&msg=install-not-found");
      }
      if (!proven && !alreadyMine && !installationClaimable(installation)) {
        redirect("/onboarding?gh=error&msg=install-not-found");
      }

      const repos = await listInstallationRepos(installationId);
      const patch: Record<string, unknown> = {
        github_installation_id: installationId,
        github_app_installed_at: new Date().toISOString(),
      };
      // Exactly one repo -> auto-attach it; anything else (owner picked
      // "all repos", multiple, or somehow zero) needs the owner to choose.
      // Never overwrite a repo already chosen: a later App reinstall/update
      // (e.g. granting a different single repo) must not silently repoint an
      // already-connected project - same guard as attachGithubInstallation.
      // And never a repo that is already another of this owner's sites: on
      // a shared installation the one repository listed can be the FIRST
      // site's, and the second site must pick its own.
      const takenBySibling = new Set(
        (await scopedProjects()).filter((p) => p.id !== project.id && p.github_repo).map((p) => p.github_repo as string),
      );
      // Never on the sign-in path either: there the owner did not just pick
      // this repository for this site on GitHub, so a lone repository is only
      // "what the installation happens to cover" - they choose.
      const attach = !viaSignIn && repos.length === 1 && !project.github_repo && !takenBySibling.has(repos[0].full_name);
      if (attach) patch.github_repo = repos[0].full_name;

      const { error } = await db().from("projects").update(patch).eq("id", project.id);
      if (error) redirect("/onboarding?gh=error&msg=save-failed");
      // Same as the update path: a project whose connected repo was the wrong
      // one picks up the right one now that it is shared.
      if (project.github_repo) await healReposForInstallation(installationId).catch(() => 0);

      const site = `&site=${encodeURIComponent(project.slug)}`;
      // Display only: the repository screen names the account it is showing
      // and links the others. Each link goes back through GitHub's sign-in,
      // so a made-up id in this address proves nothing and binds nothing.
      const accounts = viaSignIn && otherAccounts.length
        ? `&accounts=${encodeURIComponent([{ id: installationId, login: chosenLogin }, ...otherAccounts].map((a) => `${a.id}:${a.login}`).join(","))}`
        : "";
      redirect(attach || project.github_repo ? `/onboarding?gh=installed${site}` : `/onboarding?gh=pick_repo${site}${accounts}`);
    }

    // No usable state: installed straight from github.com (or the signed
    // state expired). Confirm the installation is genuinely ours, then hand
    // off to the wizard's interrupt screen to ask which project it's for -
    // nothing is written yet, so an install can't get silently attached to
    // the wrong tenant.
    // Proof that the human who just clicked Install controls THIS installation.
    // GitHub's setup redirect is unsigned, so without this the only checks were
    // "do you own the project you are writing into" and "is this installation
    // fresh" - neither of which says the installation is yours. With user
    // authorization enabled on the App, GitHub sends a one-time `code`; it
    // exchanges for a token belonging to the installer, whose
    // GET /user/installations lists what they can actually administer.
    //
    // Enforced only when the App is configured for it, so self-host and any
    // deployment without the client credentials keeps working on the freshness
    // gate alone. When it IS configured the code is REQUIRED - accepting a
    // missing code would hand every attacker a one-parameter downgrade back to
    // the weaker path.
    // Same reasoning as the state path above: a missing code is our
    // configuration, a failing code is the caller's problem.
    if (!proofCode && userAuthConfigured()) {
      console.error(
        `[github-install] no ?code on the stateless callback for installation ${installationId} ` +
          `(setup_action=${setupAction ?? "none"}). ` +
          `${requireInstallProof() ? "REFUSING (install proof required; set GITHUB_APP_REQUIRE_INSTALL_PROOF=0 to fall back to the freshness gate)." : "Falling back to the freshness gate."}`,
      );
    }
    // Freshness is NOT relaxed for a proven caller here, unlike the state path
    // above: this branch only hands off to the pick-a-project screen, and
    // attachGithubInstallation re-applies the same gate when it finally
    // writes. Relaxing one side would just move the refusal one screen later.
    if (!proofCode ? requireInstallProof() : !(await provenCaller())) {
      redirect(`/onboarding?gh=error&msg=${encodeURIComponent("We could not confirm that this GitHub installation belongs to you. Install the app from this page's button so we can verify it, rather than from github.com directly.")}`);
    }

    const installation = await getInstallation(installationId);
    if (!installation || !installationClaimable(installation)) {
      redirect("/onboarding?gh=error&msg=install-not-found");
    }
    // No signed state proves WHO installed this. Drop an httpOnly HMAC nonce
    // tying THIS browser to THIS installation_id; attachGithubInstallation
    // requires it back, so a signed-in attacker guessing the (enumerable) id
    // can't bind a victim's fresh install to their own project.
    const res = NextResponse.redirect(
      new URL(`/onboarding?gh=pick_project&installation_id=${installationId}`, req.url),
    );
    res.cookies.set("gh_install_nonce", await makeInstallNonce(installationId), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: Math.floor((15 * 60 * 1000) / 1000),
    });
    return res;
  } catch (e) {
    unstable_rethrow(e); // let the redirect()s above pass through untouched
    console.error(
      `[github-app] install callback failed: ${e instanceof Error ? e.message : String(e)}`,
    );
    redirect("/onboarding?gh=error&msg=callback-failed");
  }
}
