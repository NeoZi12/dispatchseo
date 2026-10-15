// The four levers sorted by what they really are: three are classic SEO and
// off-site work under a new name, one is genuinely new. Keeps the reader from
// buying a "GEO" product for work they already know how to do.

const LEVERS = [
  { name: "Publish the page that answers the prompt", kind: "seo", note: "A guide that fulfils the query. Same job as ranking." },
  { name: "Get listed where engines already look", kind: "seo", note: "Roundups, directories, Reddit and YouTube threads. Off-site work." },
  { name: "Keep the entity consistent", kind: "seo", note: "One name, one description, same facts on every profile." },
  { name: "Show a recent date and a fixed fact", kind: "new", note: "Dated numbers and a changelog give an answer something to quote." },
];

export function AiBrandVisibilityLeverSplit() {
  return (
    <div className="not-prose my-6 grid gap-3 sm:grid-cols-2">
      {LEVERS.map((l) => (
        <div key={l.name} className="rounded-xl bg-neutral-900 p-4 sm:p-5">
          <p
            className={`text-xs font-medium uppercase tracking-wide ${
              l.kind === "seo" ? "text-neutral-500" : "text-emerald-400"
            }`}
          >
            {l.kind === "seo" ? "SEO in disguise" : "Genuinely new"}
          </p>
          <h3 className="mt-2 text-[15px] font-semibold text-neutral-100">{l.name}</h3>
          <p className="mt-1 text-sm text-neutral-400">{l.note}</p>
        </div>
      ))}
    </div>
  );
}
