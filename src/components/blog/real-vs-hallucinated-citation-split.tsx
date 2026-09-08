// The failure mode none of the checklist-style page-1 posts name: a model
// can describe your brand accurately, or attribute a stat to you, with no
// actual citation element attached anywhere in the response. That reads
// like a hit if you only scan for your name - it isn't one.

function LinkIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 shrink-0"
      aria-hidden="true"
    >
      <path d="M9 15l6-6" />
      <path d="M11 6l1-1a3.5 3.5 0 0 1 5 5l-1 1" />
      <path d="M13 18l-1 1a3.5 3.5 0 0 1-5-5l1-1" />
    </svg>
  );
}

function GhostIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 shrink-0"
      aria-hidden="true"
    >
      <path d="M5 20V11a7 7 0 0 1 14 0v9l-2.5-2-2 2-2-2-2 2-2-2z" />
      <path d="M9.5 11h.01M14.5 11h.01" />
    </svg>
  );
}

const REAL = [
  {
    title: "There's a URL underneath it, not just a name",
    detail: "click the card, the bracket, or the chip and it opens your domain. If nothing on the page is clickable back to you, nothing is confirmed yet.",
  },
  {
    title: "It sits next to the specific claim it backs",
    detail: "engines attach a source to the sentence it came from, not to the answer in general - a citation two paragraphs from where you're mentioned is probably backing someone else's claim.",
  },
  {
    title: "It survived a second, independent ask",
    detail: "re-run the same query in a new session. A citation that was really pulled from a live search tends to hold up; a one-off name-drop is more likely to vanish on the next answer.",
  },
];

const HALLUCINATED = [
  {
    title: "Your brand named from training data, not a lookup",
    detail: "a well-known product gets described accurately from memory - no search indicator, no source card, nothing fetched, just recall.",
  },
  {
    title: "A stat or quote attributed to you with nothing behind it",
    detail: "the model can write \"according to [you]\" and generate a plausible-sounding number with no citation element carrying it - the attribution is prose, not a source.",
  },
  {
    title: "Confident wording, no matching UI element",
    detail: "no browsing indicator on ChatGPT, no bracket on Perplexity, no card in the AI Overview's source strip - the engine-specific signal from the section above is simply absent.",
  },
];

export function RealVsHallucinatedCitationSplit() {
  return (
    <div className="not-prose my-6 grid gap-4 sm:grid-cols-2">
      <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
        <div className="flex items-center gap-2 text-emerald-400">
          <LinkIcon />
          <h3 className="text-sm font-semibold">A real citation</h3>
        </div>
        <ul className="mt-3 divide-y divide-neutral-800/70">
          {REAL.map((item) => (
            <li key={item.title} className="py-3 first:pt-0 last:pb-0">
              <p className="text-sm font-medium text-neutral-100">{item.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-neutral-400">{item.detail}</p>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
        <div className="flex items-center gap-2 text-neutral-400">
          <GhostIcon />
          <h3 className="text-sm font-semibold">A hallucinated mention</h3>
        </div>
        <ul className="mt-3 divide-y divide-neutral-800/70">
          {HALLUCINATED.map((item) => (
            <li key={item.title} className="py-3 first:pt-0 last:pb-0">
              <p className="text-sm font-medium text-neutral-100">{item.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-neutral-400">{item.detail}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
