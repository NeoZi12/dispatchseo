import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAllTools, getTool } from "@/lib/free-tools";

// Public tool detail page - the locked funnel every /free-tools/<slug> page
// renders in the same order: hero (title + value line) -> widget -> CTA ->
// description -> FAQ. The widget itself is bespoke per tool (see the
// registry); this template never changes shape.

export function generateStaticParams() {
  return getAllTools().map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const tool = getTool(slug);
  if (!tool) return {};
  return {
    title: `${tool.title} - DispatchSEO`,
    description: tool.metaDescription,
    alternates: { canonical: `/free-tools/${tool.slug}` },
    ...(tool.noindex ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title: tool.title,
      description: tool.metaDescription,
      type: "website",
    },
  };
}

export default async function ToolDetail({ params }: { params: Promise<{ slug: string }> }) {
  // Cloud-only funnel, same guard as the /free-tools index and the agent hubs.
  if (process.env.LANDING_ENABLED !== "true") redirect("/dashboard");
  const { slug } = await params;
  const tool = getTool(slug);
  if (!tool) notFound();

  const { Widget } = tool;

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <Link
        href="/free-tools"
        className="mb-8 inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-neutral-400 outline-none transition-colors hover:text-neutral-200 focus-visible:ring-2 focus-visible:ring-violet-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
      >
        <span aria-hidden="true">←</span>
        All free tools
      </Link>

      {/* Hero: large centered title + one value line. */}
      <header className="mb-10 text-center">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{tool.h1}</h1>
        <p className="mx-auto mt-3 max-w-xl text-neutral-400">{tool.valueLine}</p>
      </header>

      {/* The widget itself - immediately usable, no scroll hunting. */}
      <Widget />

      {/* CTA to the paid product. */}
      <div className="mt-10 rounded-xl border border-violet-500/20 bg-violet-500/[0.06] p-5 text-center sm:p-6">
        <p className="text-base font-medium text-neutral-100">
          DispatchSEO does this automatically, for every article it writes
        </p>
        <p className="mx-auto mt-1.5 max-w-md text-sm text-neutral-400">
          It picks keywords from real search data, writes articles for your site every week, and wires
          the internal links between them.
        </p>
        <Link
          href="/signup"
          className="mt-4 inline-flex items-center justify-center rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-violet-400"
        >
          Start for free
        </Link>
      </div>

      {/* Description copy. */}
      <div className="mt-12 space-y-4 text-neutral-300">
        {tool.description.map((para, i) => (
          <DescriptionParagraph key={i} text={para} />
        ))}
      </div>

      {/* FAQ. */}
      <div className="mt-12">
        <h2 className="text-lg font-semibold tracking-tight text-neutral-100">FAQ</h2>
        <div className="mt-4 divide-y divide-neutral-800">
          {tool.faq.map((item) => (
            <details key={item.question} className="group py-4">
              <summary className="cursor-pointer list-none text-base font-medium text-neutral-100 marker:content-none">
                {item.question}
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-neutral-400">{item.answer}</p>
            </details>
          ))}
        </div>
      </div>

      <div className="mt-12 border-t border-neutral-800 pt-6">
        <Link
          href="/free-tools"
          className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-neutral-400 outline-none transition-colors hover:text-neutral-200 focus-visible:ring-2 focus-visible:ring-violet-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
        >
          <span aria-hidden="true">←</span>
          All free tools
        </Link>
      </div>
    </main>
  );
}

// Minimal markdown-link support ([text](/href)) for description copy, which
// carries the registry's internal links - not full MDX, just enough for the
// one pattern the registry actually uses.
function DescriptionParagraph({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\))/g);
  return (
    <p>
      {parts.map((part, i) => {
        const match = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
        if (!match) return <span key={i}>{part}</span>;
        return (
          <Link key={i} href={match[2]} className="text-violet-400 hover:text-violet-300">
            {match[1]}
          </Link>
        );
      })}
    </p>
  );
}
