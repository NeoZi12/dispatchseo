"use client";

import { useActionState, useEffect } from "react";
import { connectWordPressSite, disconnectWordPressSite, type ConnectWordPressState } from "@/app/actions";

// The screen where a WordPress owner connects their site.
//
// The whole design constraint: the person reading this has probably never
// opened a terminal, may not have built their own site, and is being asked to
// paste a password. So every instruction names a real thing they can see on
// their own screen ("Users", "Profile", "Application Passwords"), in the order
// they will see it, and nothing here uses a word they would have to look up.
// No "REST", no "endpoint", no "credentials".
//
// The live check behind the button is the other half. Getting "that user is a
// Subscriber, change them to Editor" while you are still standing in WordPress
// is a two-minute fix; getting it three days later as a failed publish is a
// support ticket.

export type WordPressStatus = {
  connected: boolean;
  url: string | null;
  username: string | null;
  seoPlugin: string | null;
  canPublish: boolean;
  canUploadMedia: boolean;
};

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-[11px] font-semibold text-neutral-300">
        {n}
      </span>
      <span className="text-sm leading-relaxed text-neutral-400">{children}</span>
    </li>
  );
}

export function WordPressConnect({
  status,
  slug,
  onConnected,
  buttonClassName,
}: {
  status: WordPressStatus;
  // Optional, and only the wizard passes it: names the project this password
  // belongs to, so the action cannot be steered by a dash_project cookie that
  // another tab moved. Settings omits it - there the active project is the
  // screen.
  slug?: string;
  // Optional, and only the wizard passes it: on Settings this form is the
  // whole screen and its own success line is the answer, but inside c1w a
  // Continue button has to become enabled without a page reload. The prop
  // reports the event; it does not change what this component renders.
  onConnected?: () => void;
  // Optional, and only the setup path passes it: there the submit is the
  // step's one primary, so it takes the path's full-width violet style and
  // sits centred like every other primary on it. Settings omits it and keeps
  // the small left-aligned button.
  buttonClassName?: string;
}) {
  const [state, action, pending] = useActionState<ConnectWordPressState, FormData>(
    connectWordPressSite,
    null,
  );

  // Above the early return on purpose - hooks cannot be conditional, and the
  // connected branch below returns before any of the form markup exists.
  useEffect(() => {
    if (state?.ok) onConnected?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (status.connected) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3">
          <p className="text-sm font-medium text-emerald-200">
            Connected to {status.url?.replace(/^https?:\/\//, "")}
          </p>
          <p className="mt-1 text-[13px] text-neutral-300">
            Posting as <b className="text-neutral-100">{status.username}</b>
            {status.seoPlugin ? ` - meta descriptions go to ${status.seoPlugin}` : null}
          </p>
          {!status.canPublish ? (
            <p className="mt-2 text-[13px] text-amber-200">
              This user can write drafts but not publish them, so finished articles will wait for
              you inside WordPress. Give them the Editor role to have us publish directly.
            </p>
          ) : null}
          {!status.canUploadMedia ? (
            <p className="mt-2 text-[13px] text-amber-200">
              This user cannot upload images, so posts will go out without a cover image.
            </p>
          ) : null}
        </div>
        <form action={disconnectWordPressSite}>
          <button
            type="submit"
            className="cursor-pointer text-[13px] text-neutral-500 underline underline-offset-2 transition-colors hover:text-neutral-300"
          >
            Disconnect this site
          </button>
        </form>
        <p className="text-[12px] leading-relaxed text-neutral-600">
          Disconnecting forgets the password on our side. It stays valid on your site until you
          delete it there, under Users, then Profile, then Application Passwords.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ol className="space-y-2">
        <Step n={1}>
          In WordPress, go to <b className="text-neutral-200">Users</b> and add a new user called
          DispatchSEO with the role <b className="text-neutral-200">Editor</b>. You can use your own
          account instead, but a separate one is easier to switch off later.
        </Step>
        <Step n={2}>
          Open that user, scroll to <b className="text-neutral-200">Application Passwords</b>, type
          the name DispatchSEO, and click Add.
        </Step>
        <Step n={3}>
          Copy the password it shows you. WordPress only shows it once, and the spaces in it are
          fine to include.
        </Step>
      </ol>

      <form action={action} className="space-y-3">
        {slug ? <input type="hidden" name="slug" value={slug} /> : null}
        <div>
          <label htmlFor="wp_url" className="block text-[13px] font-medium text-neutral-300">
            Your WordPress address
          </label>
          <input
            id="wp_url"
            name="wp_url"
            type="text"
            required
            spellCheck={false}
            placeholder="https://yoursite.com"
            className="mt-1.5 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-violet-500/60 focus:outline-none"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="wp_username" className="block text-[13px] font-medium text-neutral-300">
              WordPress username
            </label>
            <input
              id="wp_username"
              name="wp_username"
              type="text"
              required
              autoComplete="off"
              spellCheck={false}
              className="mt-1.5 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-violet-500/60 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="wp_app_password" className="block text-[13px] font-medium text-neutral-300">
              Application password
            </label>
            <input
              id="wp_app_password"
              name="wp_app_password"
              type="password"
              required
              autoComplete="off"
              spellCheck={false}
              placeholder="xxxx xxxx xxxx xxxx"
              className="mt-1.5 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-violet-500/60 focus:outline-none"
            />
          </div>
        </div>

        {buttonClassName ? (
          <div className="flex justify-center pt-1">
            <button type="submit" disabled={pending} className={buttonClassName}>
              {pending ? "Checking your site..." : "Connect WordPress"}
            </button>
          </div>
        ) : (
          <button
            type="submit"
            disabled={pending}
            className="cursor-pointer rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Checking your site..." : "Connect WordPress"}
          </button>
        )}
      </form>

      {state?.error ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-3 text-sm leading-relaxed text-red-200">
          {state.error}
        </p>
      ) : null}
      {state?.ok ? (
        <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-3 text-sm leading-relaxed text-emerald-200">
          {state.ok}
        </p>
      ) : null}

      <p className="text-[12px] leading-relaxed text-neutral-600">
        Your password is encrypted before it is stored, is never shown again, and is only ever sent
        to your own site. Your site needs to be on https, which nearly all are.
      </p>
    </div>
  );
}
