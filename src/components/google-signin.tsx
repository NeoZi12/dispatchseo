import { googleSignIn } from "@/app/auth/google-action";

// The standard four-color G, inline so the page stays asset-free.
function GoogleG() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.81Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3c-1.08.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.72-4.95H1.27v3.1A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.29a7.2 7.2 0 0 1 0-4.58v-3.1H1.27a12 12 0 0 0 0 10.78l4.01-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.6 4.59 1.79l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.27 6.61l4.01 3.1C6.22 6.87 8.87 4.77 12 4.77Z"
      />
    </svg>
  );
}

// One form, one button - used by both /login and /signup in CLOUD_MODE.
// domain: the landing hero's typed domain, riding along as a hidden field so
// the action can stash it in the pending_domain cookie before the OAuth
// round-trip (the cookie survives the redirect to Google and back).
export function GoogleSignInButton({ label, domain }: { label: string; domain?: string | null }) {
  return (
    <form action={googleSignIn}>
      {domain ? <input type="hidden" name="domain" value={domain} /> : null}
      <button
        type="submit"
        className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 font-medium text-white transition-colors hover:border-neutral-500"
      >
        <GoogleG />
        {label}
      </button>
    </form>
  );
}

// The "or" line between Google and the email/password fields.
export function AuthDivider() {
  return (
    <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-neutral-600">
      <span className="h-px flex-1 bg-neutral-800" />
      or
      <span className="h-px flex-1 bg-neutral-800" />
    </div>
  );
}
