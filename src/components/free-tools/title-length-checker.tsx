"use client";

// The SEO Title Length Checker widget: type a title and meta description,
// see a live pixel width + character verdict for each and a truncated
// Google-style snippet preview - computed live, no submit button, same
// calculator shape as the FAQ schema generator. Everything runs in this
// component - no fetch, no backend, nothing typed ever leaves the browser.
// See src/lib/serp-snippet.ts for the sourced thresholds and truncation
// logic; this file is just state + the input/preview UI around it.

import { useMemo, useState } from "react";
import {
  buildBreadcrumb,
  descriptionVerdict,
  titleVerdict,
  truncateAtChars,
  truncateAtPixelWidth,
  DESC_DESKTOP_AVG_CHARS,
  DESC_MOBILE_AVG_CHARS,
  DESC_SAFE_CHARS,
  TITLE_CHAR_MAX,
  TITLE_CHAR_MIN,
  TITLE_MAX_PX,
  VERDICT_LABEL,
  type Device,
  type Verdict,
} from "@/lib/serp-snippet";

const inputClass =
  "w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-violet-400/60";

const VERDICT_CLASS: Record<Verdict, string> = {
  safe: "bg-emerald-500/10 text-emerald-400",
  close: "bg-amber-300/10 text-amber-300",
  truncated: "bg-red-500/10 text-red-400",
};

// Measures rendered pixel width the same way every real SERP-preview tool
// does: a canvas 2D context's measureText, in a sans-serif close to what
// Google actually renders titles in. This catches what character counting
// alone can't - "WWWWW" and "iiiii" are the same length but very different
// widths.
let canvasCtx: CanvasRenderingContext2D | null = null;
function measureTitlePx(text: string): number {
  if (!canvasCtx) {
    const canvas = document.createElement("canvas");
    canvasCtx = canvas.getContext("2d");
  }
  if (!canvasCtx) return text.length * 9; // non-canvas environment fallback
  canvasCtx.font = "20px Arial, sans-serif";
  return canvasCtx.measureText(text).width;
}

export function TitleLengthChecker() {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [device, setDevice] = useState<Device>("desktop");

  const titlePx = useMemo(() => (title ? measureTitlePx(title) : 0), [title]);
  const tVerdict = titleVerdict(titlePx);
  const dVerdict = descriptionVerdict(description.length, device);
  const descAvgChars = device === "desktop" ? DESC_DESKTOP_AVG_CHARS : DESC_MOBILE_AVG_CHARS;

  const breadcrumb = buildBreadcrumb(url);
  const previewTitle = title.trim()
    ? truncateAtPixelWidth(title.trim(), TITLE_MAX_PX, measureTitlePx)
    : "Your page title will show up here";
  const previewDescription = description.trim()
    ? truncateAtChars(description.trim(), descAvgChars)
    : "Your meta description will show up here, the way Google would likely trim it.";

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
        <label className="text-xs font-medium uppercase tracking-wide text-neutral-500" htmlFor="stc-url">
          Page URL <span className="normal-case text-neutral-600">(optional, just for the preview)</span>
        </label>
        <input
          id="stc-url"
          type="url"
          inputMode="url"
          placeholder="https://yoursite.com/some-page"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className={`${inputClass} mt-2`}
        />

        <div className="mt-4 flex items-start justify-between gap-3">
          <label className="text-xs font-medium uppercase tracking-wide text-neutral-500" htmlFor="stc-title">
            Title tag
          </label>
          <FieldStat verdict={tVerdict} detail={`${Math.round(titlePx)}px / ${TITLE_MAX_PX}px · ${title.length} chars`} />
        </div>
        <input
          id="stc-title"
          type="text"
          placeholder="e.g. SEO Title Length Checker - Free, No Signup"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={`${inputClass} mt-2`}
        />
        <p className="mt-1.5 text-xs text-neutral-500">
          Google says titles are truncated "as needed" to fit the device width, with no fixed cutoff - but in
          practice, titles over {TITLE_MAX_PX}px (typically {TITLE_CHAR_MIN}-{TITLE_CHAR_MAX} characters) start
          getting cut.
        </p>

        <div className="mt-4 flex items-start justify-between gap-3">
          <label className="text-xs font-medium uppercase tracking-wide text-neutral-500" htmlFor="stc-desc">
            Meta description
          </label>
          <FieldStat verdict={dVerdict} detail={`${description.length} / ${descAvgChars} chars (${device})`} />
        </div>
        <textarea
          id="stc-desc"
          placeholder="e.g. Check your title and meta description against Google's real truncation behavior - live pixel width, no signup, nothing leaves your browser."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className={`${inputClass} mt-2 resize-y`}
        />
        <p className="mt-1.5 text-xs text-neutral-500">
          {DESC_SAFE_CHARS} characters is a safe target; Semrush's own research puts the average snippet Google
          shows before truncating at {DESC_DESKTOP_AVG_CHARS} characters on desktop and {DESC_MOBILE_AVG_CHARS} on
          mobile.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <DeviceTab label="Desktop" active={device === "desktop"} onClick={() => setDevice("desktop")} />
        <DeviceTab label="Mobile" active={device === "mobile"} onClick={() => setDevice("mobile")} />
      </div>

      <SnippetPreview
        domain={breadcrumb.domain}
        segments={breadcrumb.segments}
        title={previewTitle}
        description={previewDescription}
        device={device}
      />
    </div>
  );
}

function FieldStat({ verdict, detail }: { verdict: Verdict; detail: string }) {
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${VERDICT_CLASS[verdict]}`}>
        {VERDICT_LABEL[verdict]}
      </span>
      <span className="text-xs text-neutral-500">{detail}</span>
    </div>
  );
}

function DeviceTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-violet-500 text-neutral-950"
          : "border border-neutral-700 text-neutral-300 hover:border-neutral-600 hover:text-neutral-100"
      }`}
    >
      {label}
    </button>
  );
}

// Deliberately breaks from the site's dark theme for this one element: the
// point is to show what Google's own (light) result card looks like, so it
// renders in Google's actual result styling rather than DispatchSEO's.
function SnippetPreview({
  domain,
  segments,
  title,
  description,
  device,
}: {
  domain: string;
  segments: string[];
  title: string;
  description: string;
  device: Device;
}) {
  const widthClass = device === "desktop" ? "max-w-xl" : "max-w-[320px]";
  return (
    <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-neutral-500">
        Google preview ({device})
      </p>
      <div className={`${widthClass} rounded-lg bg-white p-4 font-sans shadow-sm`}>
        <div className="flex items-center gap-2 text-sm text-neutral-700">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-200 text-[10px]">
            {domain.charAt(0).toUpperCase()}
          </span>
          <span className="truncate">
            {domain}
            {segments.map((s) => (
              <span key={s}>
                <span className="mx-1 text-neutral-400" aria-hidden="true">
                  ›
                </span>
                {s}
              </span>
            ))}
          </span>
        </div>
        <p className="mt-1 truncate text-lg text-[#1a0dab] hover:underline">{title}</p>
        <p className="mt-1 text-sm leading-snug text-neutral-600">{description}</p>
      </div>
    </div>
  );
}
