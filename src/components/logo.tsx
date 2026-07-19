// Flat "dispatch radio" brand mark for DispatchSEO. The speaker grille slots
// are filled with the page background color (neutral-950), so keep this on
// dark surfaces.
export function DispatchMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="114 76 260 364"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect x="180" y="88" width="30" height="106" rx="15" fill="#a78bfa" />
      <rect x="286" y="134" width="46" height="52" rx="14" fill="#a78bfa" />
      <rect x="126" y="248" width="24" height="78" rx="12" fill="#a78bfa" />
      <rect x="150" y="176" width="212" height="252" rx="44" fill="#8b5cf6" />
      <rect x="192" y="220" width="128" height="18" rx="9" fill="#0a0a0a" />
      <rect x="192" y="256" width="128" height="18" rx="9" fill="#0a0a0a" />
      <rect x="192" y="292" width="128" height="18" rx="9" fill="#0a0a0a" />
    </svg>
  );
}
