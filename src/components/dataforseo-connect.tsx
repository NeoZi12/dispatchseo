"use client";

import { useActionState } from "react";
import { connectDataforseo, type ConnectDataforseoState } from "@/app/actions";

// Inline credentials form for the "Connect DataForSEO" setup card. The server
// action verifies the pair against the live API before saving, so a green
// result here means the nightly rank checks will actually work.

const inputClass =
  "w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400";

export function DataforseoConnectForm() {
  const [state, formAction, pending] = useActionState<ConnectDataforseoState, FormData>(
    connectDataforseo,
    null,
  );

  return (
    <form action={formAction} className="space-y-2.5">
      {state && "error" in state ? (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{state.error}</p>
      ) : null}
      <input
        name="login"
        type="email"
        required
        placeholder="API login (your DataForSEO account email)"
        autoComplete="off"
        className={inputClass}
      />
      <input
        name="password"
        type="password"
        required
        placeholder="API password (from app.dataforseo.com/api-access)"
        autoComplete="new-password"
        className={inputClass}
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-emerald-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 disabled:opacity-50"
      >
        {pending ? "Checking with DataForSEO..." : "Verify and connect"}
      </button>
    </form>
  );
}
