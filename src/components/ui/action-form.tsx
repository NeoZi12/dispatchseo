"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import type { ActionState } from "./action-state";
import { Button, type ButtonSize, type ButtonVariant } from "./button";
import { Toast } from "./toast";
import { cx } from "./styles";

export type FormAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/** A form bound to one server action, with its submit button and the
 *  action's answer beside it. Fields go in as children; the button label
 *  says exactly what happens ("Save tone", not "Submit").
 *
 *  Submitted through onSubmit + startTransition rather than <form action>:
 *  React 19 resets a form after an action submit, which would wipe what the
 *  owner typed exactly when the server refused it and they need to fix it.
 *  `resetOnSuccess` clears it only when the action says it worked.
 *
 *  `slug` names the project this form was rendered for; the action refuses
 *  when the active project has since changed in another tab.
 *
 *  `inline` lays the button on the same row as a single field.
 *
 *  `successLabel` swaps the button's own label for a moment after it worked
 *  ("Dispatched"), so the confirmation lands where the owner is looking. */
export function ActionForm({
  action,
  slug,
  submitLabel,
  children,
  variant = "primary",
  size = "md",
  inline = false,
  resetOnSuccess = false,
  successLabel,
  className = "",
  hidden,
}: {
  action: FormAction;
  slug: string;
  submitLabel: string;
  children?: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  inline?: boolean;
  resetOnSuccess?: boolean;
  successLabel?: string;
  className?: string;
  /** Hidden name/value pairs (an id the action needs). */
  hidden?: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (resetOnSuccess && state?.ok) formRef.current?.reset();
  }, [state, resetOnSuccess]);

  const [sentAt, setSentAt] = useState<number | null>(null);
  useEffect(() => {
    if (!successLabel || !state?.ok) return;
    setSentAt(state.at);
    const t = setTimeout(() => setSentAt(null), 2200);
    return () => clearTimeout(t);
  }, [state, successLabel]);
  const sent = successLabel != null && sentAt != null && sentAt === state?.at && !pending;
  const label = sent ? (
    <span key={sentAt} className="dispatch-fade-in inline-flex items-center gap-1.5">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-ok" aria-hidden="true">
        <path d="M5 12.5l4.5 4.5L19 7.5" pathLength={1} className="dispatch-draw" />
      </svg>
      {successLabel}
    </span>
  ) : (
    submitLabel
  );

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => formAction(fd));
  }

  const hiddenInputs = (
    <>
      <input type="hidden" name="slug" value={slug} />
      {hidden ? Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />) : null}
    </>
  );

  if (inline) {
    return (
      <form ref={formRef} onSubmit={onSubmit} className={className}>
        {hiddenInputs}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">{children}</div>
          {/* Lines up with the input, below its label row. */}
          <Button type="submit" variant={variant} size={size} pending={pending} className="sm:mt-[26px] sm:h-10">
            {label}
          </Button>
        </div>
        <Toast state={state} className="mt-2" />
      </form>
    );
  }
  return (
    <form ref={formRef} onSubmit={onSubmit} className={cx("space-y-5", className)}>
      {hiddenInputs}
      {children}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button type="submit" variant={variant} size={size} pending={pending}>
          {label}
        </Button>
        <Toast state={state} />
      </div>
    </form>
  );
}
