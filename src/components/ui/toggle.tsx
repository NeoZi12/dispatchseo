"use client";

import { useState } from "react";
import { cx, FOCUS_RING } from "./styles";

/** An on/off switch (role="switch"). Works inside a plain <form>: with a
 *  `name`, it posts "on" or "off" through a hidden input. */
export function Toggle({
  label,
  name,
  defaultChecked = false,
  checked: controlled,
  onChange,
  disabled = false,
  className = "",
}: {
  label: string;
  name?: string;
  defaultChecked?: boolean;
  checked?: boolean;
  onChange?: (next: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [inner, setInner] = useState(defaultChecked);
  const on = controlled ?? inner;
  return (
    <span className={cx("inline-flex items-center gap-3", className)}>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={disabled}
        onClick={() => {
          const next = !on;
          if (controlled === undefined) setInner(next);
          onChange?.(next);
        }}
        className={cx(
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50",
          on ? "border-accent-strong bg-accent-strong" : "border-line bg-surface-3",
          FOCUS_RING,
        )}
      >
        <span
          aria-hidden="true"
          className={cx(
            "inline-block h-3.5 w-3.5 rounded-full bg-ink shadow transition-transform motion-reduce:transition-none",
            on ? "translate-x-[18px]" : "translate-x-[2px]",
          )}
        />
      </button>
      {name ? <input type="hidden" name={name} value={on ? "on" : "off"} /> : null}
    </span>
  );
}
