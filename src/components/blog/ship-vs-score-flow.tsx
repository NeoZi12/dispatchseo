// The actual step difference between a content-scoring editor (Surfer,
// NeuronWriter, Clearscope, MarketMuse - and Frase below Scale tier) and this
// project's own pipeline: both start from a keyword, but one hands you a
// score and a blank cursor, the other hands you a pull request.

const SCORE_STEPS = [
  { label: "Paste a draft into the editor", detail: "you already wrote it, or an AI-writing add-on drafted it for you" },
  { label: "Read the term-coverage score", detail: "a number against the top-ranking pages for the keyword" },
  { label: "Rewrite until the score clears the target", detail: "back and forth between the score and the draft" },
  { label: "Publish it yourself", detail: "export or copy-paste into your CMS - no review step in the tool" },
] as const;

const SHIP_STEPS = [
  { label: "Agent researches the keyword", detail: "against this project's own DataForSEO account, not the vendor's index" },
  { label: "Agent drafts the full page", detail: "prose, bespoke visuals, and a cover - no separate design step" },
  { label: "Opens it as a pull request", detail: "you review the diff, not a score" },
  { label: "Ships, then keeps tracking it", detail: "rank and Search Console pulled on their own schedule after merge" },
] as const;

function StepList({ steps, accent }: { steps: readonly { label: string; detail: string }[]; accent: boolean }) {
  return (
    <ol>
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        return (
          <li key={s.label} className="flex gap-3">
            <div className="flex w-6 flex-col items-center">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium tabular-nums ${
                  accent ? "bg-violet-500/15 text-violet-300" : "bg-neutral-800 text-neutral-400"
                }`}
              >
                {i + 1}
              </span>
              {!last ? <div className="w-0.5 flex-1 rounded-full bg-neutral-800" /> : null}
            </div>
            <div className={last ? "pb-0.5" : "pb-4"}>
              <p className="text-sm font-medium text-neutral-100">{s.label}</p>
              <p className="mt-0.5 text-sm leading-relaxed text-neutral-400">{s.detail}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function ShipVsScoreFlow() {
  return (
    <div className="not-prose my-6 grid gap-4 sm:grid-cols-2">
      <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
        <h3 className="mb-3 text-sm font-semibold text-neutral-200">
          The editor tools - score it, then do the rest yourself
        </h3>
        <StepList steps={SCORE_STEPS} accent={false} />
      </div>
      <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
        <h3 className="mb-3 text-sm font-semibold text-violet-400">DispatchSEO - no editor step</h3>
        <StepList steps={SHIP_STEPS} accent={true} />
      </div>
    </div>
  );
}
