// The two small marks the article list and the overview chart share, in a
// module of their own so the list's chunk never has to carry the chart.

export function SearchIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className={className}>
      <circle cx="8.5" cy="8.5" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="m12.3 12.3 4.2 4.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** A pointer mid-click: the Clicks column's mark. */
export function ClickIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className={className}>
      <path d="M8 7.5 15.5 10l-3.2 1.3 2.6 3.4-1.6 1.2-2.6-3.4-1.9 2.8Z" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M6 2.5v2.2M2.5 6h2.2M3.4 3.4l1.5 1.5M9.6 3.4 8.1 4.9M3.4 9.6l1.5-1.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
