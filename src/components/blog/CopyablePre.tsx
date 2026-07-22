"use client";

import { useRef, useState } from "react";

// Code block with a copy button - used for every ``` fence in blog posts
// and docs via the MDX registry. Reads the rendered text at click time, so
// it copies exactly what the reader sees, whatever MDX nested inside.
export function CopyablePre(props: React.HTMLAttributes<HTMLPreElement>) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  return (
    <div className="relative my-5">
      <pre
        {...props}
        ref={ref}
        className="overflow-x-auto rounded-xl bg-neutral-900 p-4 pr-16 font-mono text-sm leading-relaxed [&>code]:bg-transparent [&>code]:p-0"
      />
      <button
        type="button"
        aria-label="Copy code to clipboard"
        onClick={() => {
          const text = ref.current?.innerText ?? "";
          navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          });
        }}
        className="absolute right-2.5 top-2.5 rounded-md border border-neutral-700/80 bg-neutral-800/90 px-2 py-1 text-xs font-medium text-neutral-400 transition-colors hover:text-white"
      >
        {copied ? "Copied ✓" : "Copy"}
      </button>
    </div>
  );
}
