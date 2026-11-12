import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { CardMascot } from "@/components/card-mascot";

// The building blocks of a comparison page ("A vs B", "X alternatives",
// "best X tools"). Written for two readers at once: a person deciding, and an
// AI answer engine that lifts a self-contained sentence, a row or a list into
// its answer. So every block is plain server HTML (no client JS, nothing
// hidden behind a tab), each one carries its own heading or label, and the
// words do the work: icons only decorate text that is already there.
//
// The page shape they add up to, taken from the comparison pages that do
// this well (PostHog, Plausible, Supabase, Zapier, eesel; 2026-11-12):
//   short answer + "choose X if" picks -> one table early -> a section per
//   criterion -> where the other side is better -> FAQ -> how we checked.
//
// MDX here runs with JS expressions blocked (next-mdx-remote default), so
// every prop is a plain string and lists come in as markdown children.

// ---- small icons (bare, beside their text; never inside a tinted box) ----

function Tick({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M4 10.5 8 14.5 16 5.5" />
    </svg>
  );
}

function Minus({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className={className} aria-hidden="true">
      <path d="M5 10h10" />
    </svg>
  );
}

// Markdown lists inside these blocks lose their bullets and get an icon per
// item instead. Selector classes are static strings so Tailwind sees them.
const TICK_LIST =
  "[&_ul]:my-0 [&_ul]:list-none [&_ul]:space-y-2 [&_ul]:pl-0 [&_li]:relative [&_li]:pl-6 [&_li]:text-[15px] [&_li]:before:absolute [&_li]:before:left-0 [&_li]:before:top-[0.05em] [&_li]:before:font-bold [&_li]:before:content-['✓'] [&_p]:my-0";

// ---- Short answer -------------------------------------------------------

// The first thing on the page: the verdict in two or three sentences that
// still make sense when quoted alone (name both products, no "it"). The
// dispatcher sits on the card's edge, same as on the landing's plan card.
export function Verdict({ children }: { children: ReactNode }) {
  return (
    <section
      aria-labelledby="short-answer"
      className="relative mt-14 mb-8 rounded-2xl border border-violet-500/30 bg-gradient-to-b from-violet-500/[0.10] to-neutral-900/60 p-6 sm:p-7"
    >
      <CardMascot className="dash-mascot pointer-events-none absolute -top-[46px] right-6 h-12 w-12 drop-shadow-[0_6px_10px_rgba(0,0,0,0.45)]" />
      <h2 id="short-answer" className="text-sm font-semibold text-violet-300">
        The short answer
      </h2>
      <div className="mt-2 text-[17px] leading-relaxed text-neutral-100 [&_p]:my-2 [&_p]:text-neutral-100 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0">
        {children}
      </div>
    </section>
  );
}

// ---- Choose X if --------------------------------------------------------

// Side-by-side "Choose A if / Choose B if" cards. Stacks on phones.
export function ChooseIf({ children }: { children: ReactNode }) {
  return <div className="my-8 grid gap-3 sm:grid-cols-2">{children}</div>;
}

// One side. `name` is the product; `ours="true"` marks DispatchSEO (violet).
export function Pick({ name, ours, children }: { name: string; ours?: string; children: ReactNode }) {
  const isOurs = ours === "true";
  return (
    <div
      className={`rounded-xl border p-5 ${
        isOurs ? "border-violet-500/30 bg-violet-500/[0.06]" : "border-neutral-800 bg-neutral-900/60"
      }`}
    >
      <h3 className="text-[15px] font-semibold text-neutral-100">
        Choose <span className={isOurs ? "text-violet-300" : "text-sky-300"}>{name}</span> if
      </h3>
      <div
        className={`mt-3 text-neutral-300 ${TICK_LIST} ${
          isOurs ? "[&_li]:before:text-violet-400" : "[&_li]:before:text-sky-400"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

// ---- The table ------------------------------------------------------------

// Frames a markdown table: a card around it, and a caption saying where the
// numbers come from and when they were read. The cell semantics (row
// headers, our column/row, Yes/No markers) come from rehype-compare-tables.
export function CompareTable({ caption, children }: { caption?: string; children: ReactNode }) {
  return (
    <figure className="my-8 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/40 [&>div]:my-0">
      {children}
      {caption && (
        <figcaption className="border-t border-neutral-800 px-4 py-2.5 text-xs text-neutral-500">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

// ---- One tool, same template for every tool (ours included) --------------

export function ToolCard({
  best,
  price,
  source,
  verdict,
  ours,
  children,
}: {
  best: string;
  price: string;
  source?: string;
  verdict: string;
  ours?: string;
  children: ReactNode;
}) {
  const isOurs = ours === "true";
  return (
    <div
      className={`my-5 rounded-2xl border p-5 sm:p-6 ${
        isOurs ? "border-violet-500/30 bg-violet-500/[0.05]" : "border-neutral-800 bg-neutral-900/50"
      }`}
    >
      <dl className="grid gap-x-6 gap-y-3 text-[14px] sm:grid-cols-[auto_1fr]">
        <dt className="font-medium text-neutral-500">Best for</dt>
        <dd className="text-neutral-100">{best}</dd>
        <dt className="font-medium text-neutral-500">Price</dt>
        <dd className="text-neutral-100">
          {price}
          {source && (
            <>
              {" "}
              <a href={source} className="text-neutral-500 underline underline-offset-2 hover:text-neutral-300" rel="nofollow noopener">
                source
              </a>
            </>
          )}
        </dd>
      </dl>
      <div className="mt-5 grid gap-5 sm:grid-cols-2">{children}</div>
      <p className="mt-5 border-t border-neutral-800 pt-4 text-[15px] leading-relaxed text-neutral-200">
        <span className="font-semibold text-neutral-100">Verdict: </span>
        {verdict}
      </p>
      {isOurs && <p className="mt-2 text-xs text-neutral-500">We make DispatchSEO. Its limits are listed the same way as everyone else&apos;s.</p>}
    </div>
  );
}

export function Strengths({ children }: { children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-emerald-400">
        <Tick className="h-4 w-4" /> Strengths
      </p>
      <div className={`text-neutral-300 ${TICK_LIST} [&_li]:before:text-emerald-400`}>{children}</div>
    </div>
  );
}

export function Limits({ children }: { children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-amber-400">
        <Minus className="h-4 w-4" /> Limits
      </p>
      <div
        className={`text-neutral-300 ${TICK_LIST} [&_li]:before:content-['–'] [&_li]:before:text-amber-400`}
      >
        {children}
      </div>
    </div>
  );
}

// ---- FAQ, with its FAQPage structured data built from the same words ------

function plainText(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(plainText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return plainText(node.props.children);
  return "";
}

export function Q({ q, children }: { q: string; children: ReactNode }) {
  return (
    <div className="py-5 first:pt-1 last:pb-1">
      <h3 className="text-[16px] font-semibold text-neutral-100">{q}</h3>
      <div className="mt-1.5 [&_p]:my-1.5">{children}</div>
    </div>
  );
}

// Google stopped showing FAQ rich results in 2026, so the markup is for the
// machines that read the page, not for a search feature. It is generated
// from the visible questions so the two can never drift apart.
export function Faq({ children }: { children: ReactNode }) {
  const items = Children.toArray(children)
    .filter((c) => isValidElement<{ q?: string; children?: ReactNode }>(c) && typeof c.props.q === "string")
    .map((c) => {
      const el = c as ReactElement<{ q: string; children?: ReactNode }>;
      return { q: el.props.q, a: plainText(el.props.children).replace(/\s+/g, " ").trim() };
    });
  const ld = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };
  return (
    <div className="my-4 divide-y divide-neutral-800">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }}
      />
      {children}
    </div>
  );
}

// ---- How we checked ------------------------------------------------------

export function Sources({ checked, children }: { checked: string; children: ReactNode }) {
  const when = new Date(`${checked}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  return (
    <section aria-labelledby="how-we-checked" className="my-10 rounded-xl border border-neutral-800 p-5 text-sm">
      <h2 id="how-we-checked" className="text-[15px] font-semibold text-neutral-100">
        How we checked
      </h2>
      <p className="mt-1.5 text-neutral-400">
        Every price and feature above was read from the vendor&apos;s own page on{" "}
        <time dateTime={checked} className="text-neutral-200">{when}</time>. We make DispatchSEO. If a vendor has changed
        something, tell us and we will fix the page.
      </p>
      <div className="mt-3 text-neutral-400 [&_li]:text-sm [&_ul]:my-0 [&_ul]:space-y-1">{children}</div>
    </section>
  );
}

// ---- Closing call to action ------------------------------------------------

export function TryCta() {
  return (
    <aside
      aria-label="Try DispatchSEO"
      className="relative mt-16 mb-4 flex flex-col items-start gap-4 rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-600/[0.16] via-neutral-900 to-neutral-900 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7"
    >
      <CardMascot className="dash-mascot pointer-events-none absolute -top-[42px] left-7 h-11 w-11 drop-shadow-[0_6px_10px_rgba(0,0,0,0.45)]" />
      <div>
        <p className="text-lg font-semibold text-neutral-100">Judge it on your own topics</p>
        <p className="mt-1 text-[15px] text-neutral-400">
          Two fact-checked articles a month, published to your site. Free, no card.
        </p>
      </div>
      <a
        href="https://dispatchseo.com/"
        className="shrink-0 rounded-lg bg-gradient-to-r from-[#6d28d9] to-[#9333ea] px-5 py-2.5 text-sm font-semibold whitespace-nowrap text-white shadow-lg shadow-violet-900/30 outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
      >
        Start for free
      </a>
    </aside>
  );
}
