"use client";

import { useFormStatus } from "react-dom";
import { PixelDispatcher } from "@/components/pixel-dispatcher";

// The house loading state: the pixel agent already at its desk, working, with
// a "Dispatching..." label whose dots type in on a loop. Used anywhere a wait
// would otherwise freeze the screen silently.
export function Dispatching({
  label = "Dispatching",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center ${className ?? ""}`}>
      <PixelDispatcher working className="w-[168px]" />
      <p className="mt-1 flex items-baseline text-sm font-medium text-neutral-400">
        {label}
        <span aria-hidden className="ml-0.5 inline-flex">
          <span className="dispatch-dot">.</span>
          <span className="dispatch-dot" style={{ animationDelay: "0.2s" }}>
            .
          </span>
          <span className="dispatch-dot" style={{ animationDelay: "0.4s" }}>
            .
          </span>
        </span>
      </p>
    </div>
  );
}

// Drop inside any <form> whose submit runs a server action: while the action
// is in flight it covers the screen with the dispatcher instead of leaving a
// frozen, unresponsive page. useFormStatus only reports for its parent form,
// so this must live inside the form element.
export function FormPending({ label = "Dispatching" }: { label?: string }) {
  const { pending } = useFormStatus();
  if (!pending) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/85 backdrop-blur-sm">
      <Dispatching label={label} />
    </div>
  );
}
