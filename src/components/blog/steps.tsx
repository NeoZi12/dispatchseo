import type { ReactNode } from "react";
import { slugify } from "@/lib/slugify";

// Mintlify-style numbered stepper for sequential install instructions: a
// circled number connected to the next one by a thin vertical line, title
// and body indented beside it. Pure layout - no client JS.
//
// The number comes from a CSS counter, not a prop: next-mdx-remote v6
// strips JS expressions from MDX by default (blockJS), so an `n={1}` prop
// silently arrives undefined - and a counter renumbers itself when a step
// is inserted anyway.
//
// <Step> renders its own h2 from the `title` prop (same slugify() the blog
// registry's h2 uses). getDocHeadings (src/lib/docs.ts) reads that `title`
// prop straight out of the raw MDX the same way it reads a literal "## "
// line, so "On this page" anchors keep working unchanged.

export function Steps({ children }: { children: ReactNode }) {
  return <div className="not-prose my-8 [counter-reset:step]">{children}</div>;
}

export function Step({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const id = slugify(title) || undefined;
  return (
    <div className="group relative pb-10 pl-12 last:pb-0 [counter-increment:step]">
      <span
        aria-hidden="true"
        className="absolute left-0 top-0 flex h-8 w-8 items-center justify-center rounded-full border border-violet-500/40 bg-neutral-900 font-mono text-sm font-semibold text-violet-300 before:content-[counter(step)]"
      />
      <span
        aria-hidden="true"
        className="absolute bottom-0 left-4 top-8 w-px bg-neutral-800 group-last:hidden"
      />
      <h2
        id={id}
        className="scroll-mt-8 text-xl font-semibold tracking-tight text-neutral-100"
      >
        {title}
      </h2>
      <div className="mt-3 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
        {children}
      </div>
    </div>
  );
}
