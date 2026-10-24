import type { ReactNode } from "react";

// The wrapper every dashboard route skeleton wears. The skeleton holds the
// page's shape so nothing jumps when the real data lands; that alone is the
// loading state. The dispatcher card that used to float over it was retired
// on 2026-10-24 (Neo: "skeleton loading is enough"), so this is now just the
// accessible status announcement around the children.
export function PageLoading({
  label = "Loading",
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  return (
    <div className="relative" role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
