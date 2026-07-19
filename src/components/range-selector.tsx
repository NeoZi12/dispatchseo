"use client";

// The segmented date-range pill group every windowable stat row shares -
// extracted from glance-stats so Home and future screens use one control.
// Same quiet grammar as the rest of the dashboard: a neutral-900 track with
// the active pill lifted to neutral-800.

export type RangeOption = { key: string; label: string };

export function RangeSelector({
  options,
  active,
  onChange,
  label = "Date range",
  className = "bg-neutral-900",
}: {
  options: readonly RangeOption[];
  active: string;
  onChange: (key: string) => void;
  label?: string;
  className?: string; // track background - darker when the selector sits on a card
}) {
  return (
    <div className={`flex rounded-lg p-0.5 text-xs ${className}`} role="group" aria-label={label}>
      {options.map((r) => (
        <button
          key={r.key}
          onClick={() => onChange(r.key)}
          aria-pressed={active === r.key}
          className={`rounded-md px-2.5 py-1 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 ${
            active === r.key
              ? "bg-neutral-800 text-neutral-100"
              : "text-neutral-400 hover:text-neutral-200"
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
