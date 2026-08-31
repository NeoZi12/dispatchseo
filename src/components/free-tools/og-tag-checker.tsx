"use client";

// The Open Graph Tag Checker widget: paste a page's <head> HTML, get back an
// audit of its og: and twitter: tags against ogp.me's required properties
// and Facebook's published image guidance, plus a live preview rendered from
// the actual parsed values - including loading the real og:image (an <img>
// tag isn't subject to the CORS restriction fetch() is, so this works
// without a backend proxy). Everything runs in this component; nothing
// pasted ever leaves the browser except the one GET the browser itself makes
// to load the preview image, exactly like a real unfurl would.

import { useState } from "react";
import {
  analyzeOgTags,
  buildFixSnippet,
  suggestAbsoluteImageUrl,
  type Finding,
  type IssueSeverity,
  type OgCheckResult,
  type ResolvedCard,
} from "@/lib/og-tag-analysis";

const inputClass =
  "w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-violet-400/60";

const HTML_PLACEHOLDER = `<html>
  <head>
    <meta property="og:title" content="Your page title" />
    <meta property="og:type" content="website" />
    <meta property="og:image" content="https://example.com/cover.png" />
    <meta property="og:url" content="https://example.com/your-page" />
  </head>
</html>`;

const SEVERITY_CLASS: Record<IssueSeverity, string> = {
  error: "bg-red-500/10 text-red-400",
  warning: "bg-amber-300/10 text-amber-300",
  info: "bg-neutral-800 text-neutral-400",
};

const SEVERITY_LABEL: Record<IssueSeverity, string> = {
  error: "Issue",
  warning: "Heads up",
  info: "Note",
};

type ImageStatus = "idle" | "loading" | "loaded" | "error";
type ImageDims = { width: number; height: number };
type PreviewMode = "facebook" | "twitter";

export function OgTagChecker() {
  const [html, setHtml] = useState("");
  const [result, setResult] = useState<OgCheckResult | null>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("facebook");
  const [imageStatus, setImageStatus] = useState<ImageStatus>("idle");
  const [imageDims, setImageDims] = useState<ImageDims | null>(null);
  const [copied, setCopied] = useState(false);

  const canAnalyze = html.trim().length > 0;
  const card = result ? (previewMode === "facebook" ? result.facebook : result.twitter) : null;

  function analyze() {
    const r = analyzeOgTags(html);
    setResult(r);
    setCopied(false);
    const image = r.facebook.image;
    if (image && /^https?:\/\//i.test(image)) {
      setImageStatus("loading");
      setImageDims(null);
    } else {
      setImageStatus("idle");
      setImageDims(null);
    }
  }

  function copyFixSnippet() {
    if (!result) return;
    navigator.clipboard.writeText(buildFixSnippet(result.tags)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  }

  const dimFindings = result && imageStatus !== "idle" ? imageDimFindings(imageStatus, imageDims) : [];
  const findings = result ? [...result.findings, ...dimFindings] : [];
  const hasErrors = findings.some((f) => f.severity === "error");
  const missingCount = result ? countMissingForFix(result) : 0;

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
        <label className="text-xs font-medium uppercase tracking-wide text-neutral-500" htmlFor="ogc-html">
          Page HTML (head section or full page source)
        </label>
        <textarea
          id="ogc-html"
          placeholder={HTML_PLACEHOLDER}
          value={html}
          onChange={(e) => {
            setHtml(e.target.value);
            setResult(null);
          }}
          rows={10}
          className={`${inputClass} mt-2 resize-y font-mono text-xs`}
        />
        <p className="mt-1.5 text-xs text-neutral-500">
          Right-click your page and choose &quot;View Page Source&quot; (or copy the &lt;head&gt; markup from dev tools),
          then paste the whole thing here. No URL fetch - this only sees what you paste, so it works on localhost,
          staging, or anything behind a login.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!canAnalyze}
          onClick={analyze}
          className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-violet-400 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
        >
          Check Open Graph tags
        </button>
        {!canAnalyze ? (
          <span className="text-sm text-neutral-500">Paste your page&apos;s HTML to check its tags.</span>
        ) : null}
      </div>

      {result ? (
        <div className="space-y-5">
          <div className="space-y-2.5">
            {findings.length === 0 ? (
              <div className="rounded-xl bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-400">
                Looks good - all required tags present, image resolves, nothing flagged.
              </div>
            ) : (
              findings.map((f, i) => <FindingCard key={i} finding={f} />)
            )}
          </div>

          {hasErrors && missingCount > 0 ? (
            <button
              type="button"
              onClick={copyFixSnippet}
              className="rounded-lg border border-neutral-700 px-3.5 py-2 text-sm font-medium text-neutral-300 transition-colors hover:border-neutral-600 hover:text-neutral-100"
            >
              {copied ? "Copied ✓" : "Copy missing tags as HTML"}
            </button>
          ) : null}

          {result.tags.image && !/^https?:\/\//i.test(result.tags.image) && result.origin ? (
            <p className="text-xs text-neutral-500">
              Fixed absolute URL, using your og:url&apos;s origin:{" "}
              <code className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-neutral-200">
                {suggestAbsoluteImageUrl(result.tags.image, result.origin)}
              </code>
            </p>
          ) : null}

          {card ? (
            <PreviewSection
              mode={previewMode}
              onModeChange={setPreviewMode}
              card={card}
              cardType={result.tags.twitterCard}
              imageStatus={imageStatus}
              onImageLoad={(dims) => {
                setImageStatus("loaded");
                setImageDims(dims);
              }}
              onImageError={() => setImageStatus("error")}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function countMissingForFix(result: OgCheckResult): number {
  const t = result.tags;
  return [t.title, t.type, t.url, t.image, t.description, t.siteName, t.twitterCard].filter((v) => !v).length;
}

function imageDimFindings(status: ImageStatus, dims: ImageDims | null): Finding[] {
  if (status === "error") {
    return [
      {
        severity: "error",
        title: "og:image failed to load",
        detail: "The browser couldn't load this URL as an image. Check that it's publicly reachable (not behind auth or a firewall) and points at an actual image file.",
      },
    ];
  }
  if (status === "loaded" && dims) {
    if (dims.width < 200 || dims.height < 200) {
      return [
        {
          severity: "warning",
          title: `Image actually loads at ${dims.width}x${dims.height} - below Facebook's 200x200 minimum`,
          detail: "This is the real, measured size of the file at that URL, not just what's declared. Some platforms won't render an image this small at all.",
        },
      ];
    }
    if (dims.width < 600 || dims.height < 315) {
      return [
        {
          severity: "info",
          title: `Image loads at ${dims.width}x${dims.height} - below Facebook's 600x315 "displays small" threshold`,
          detail: "It'll render, but noticeably smaller than a full-width preview. Facebook recommends 1200x630 for a crisp, full-size card.",
        },
      ];
    }
    return [
      {
        severity: "info",
        title: `og:image loads correctly at ${dims.width}x${dims.height}`,
        detail: "Confirmed by actually loading the file, not just trusting the tag.",
      },
    ];
  }
  return [];
}

function FindingCard({ finding }: { finding: Finding }) {
  return (
    <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-neutral-100">{finding.title}</p>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_CLASS[finding.severity]}`}>
          {SEVERITY_LABEL[finding.severity]}
        </span>
      </div>
      <p className="mt-2 text-sm text-neutral-400">{finding.detail}</p>
    </div>
  );
}

function PreviewSection({
  mode,
  onModeChange,
  card,
  cardType,
  imageStatus,
  onImageLoad,
  onImageError,
}: {
  mode: PreviewMode;
  onModeChange: (m: PreviewMode) => void;
  card: ResolvedCard;
  cardType: string | null;
  imageStatus: ImageStatus;
  onImageLoad: (dims: ImageDims) => void;
  onImageError: () => void;
}) {
  const domain = domainFromCard(card);
  const smallThumb = mode === "twitter" && cardType === "summary";

  return (
    <div>
      <div className="flex items-center gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Preview</p>
        <div className="ml-auto flex gap-1.5">
          <ToggleButton active={mode === "facebook"} onClick={() => onModeChange("facebook")}>
            Facebook / Slack
          </ToggleButton>
          <ToggleButton active={mode === "twitter"} onClick={() => onModeChange("twitter")}>
            X (Twitter)
          </ToggleButton>
        </div>
      </div>

      <div className="mt-2.5 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900">
        <div className={smallThumb ? "flex gap-3 p-3" : ""}>
          {card.image ? (
            <div className={smallThumb ? "h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-neutral-800" : "aspect-[1.91/1] w-full bg-neutral-800"}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={card.image}
                alt=""
                className="h-full w-full object-cover"
                onLoad={(e) => {
                  const img = e.currentTarget;
                  onImageLoad({ width: img.naturalWidth, height: img.naturalHeight });
                }}
                onError={onImageError}
              />
            </div>
          ) : (
            <div className={smallThumb ? "h-16 w-16 shrink-0 rounded-lg bg-neutral-800" : "flex aspect-[1.91/1] w-full items-center justify-center bg-neutral-800 text-xs text-neutral-600"}>
              {smallThumb ? null : "No image"}
            </div>
          )}
          <div className={smallThumb ? "min-w-0 flex-1" : "p-3"}>
            <p className="truncate text-xs uppercase tracking-wide text-neutral-500">{domain}</p>
            <p className="mt-0.5 truncate text-sm font-semibold text-neutral-100">
              {card.title || "(no title)"}
            </p>
            <p className={smallThumb ? "mt-0.5 truncate text-xs text-neutral-400" : "mt-0.5 line-clamp-2 text-xs text-neutral-400"}>
              {card.description || "(no description)"}
            </p>
          </div>
        </div>
      </div>
      {imageStatus === "loading" ? <p className="mt-1.5 text-xs text-neutral-500">Loading image to verify it resolves...</p> : null}
    </div>
  );
}

function ToggleButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
        active ? "bg-violet-500 text-neutral-950" : "border border-neutral-700 text-neutral-400 hover:text-neutral-100"
      }`}
    >
      {children}
    </button>
  );
}

function domainFromCard(card: ResolvedCard): string {
  if (card.url) {
    try {
      return new URL(card.url).hostname.toUpperCase();
    } catch {
      // fall through
    }
  }
  if (card.siteName) return card.siteName.toUpperCase();
  return "EXAMPLE.COM";
}
