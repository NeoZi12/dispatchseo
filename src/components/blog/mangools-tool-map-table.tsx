// Mangools' current seven-tool lineup (pulled live from mangools.com while
// writing this guide - the AI Search Watcher and browser extension are recent
// additions most "alternative" roundups still miss) mapped against the actual
// MCP tool or cron that runs the same job in this project. The browser
// extension has no honest DispatchSEO equivalent, and the table says so
// rather than stretching a row to cover it.

import { TableShell, THead, Th, Tr, Td } from "@/components/ui";

function ToolIcon({ name }: { name: (typeof TOOLS)[number]["name"] }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "h-4 w-4",
    "aria-hidden": true,
  };
  switch (name) {
    case "KWFinder":
      return (
        <svg {...common}>
          <circle cx="10" cy="10" r="6" />
          <path d="m20 20-5.5-5.5M7 10h6" />
        </svg>
      );
    case "SERPChecker":
      return (
        <svg {...common}>
          <path d="M12 21s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12Z" />
          <circle cx="12" cy="9" r="2" />
        </svg>
      );
    case "SERPWatcher":
      return (
        <svg {...common}>
          <path d="M4 18V10M10 18V6M16 18v-5M21 3l-5.5 5.5L12 5 4 13" />
        </svg>
      );
    case "LinkMiner":
      return (
        <svg {...common}>
          <rect x="3" y="9" width="8" height="6" rx="3" />
          <rect x="13" y="9" width="8" height="6" rx="3" />
          <path d="M11 12h2" />
        </svg>
      );
    case "SiteProfiler":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M7 15v-4M12 15V8M17 15v-6" />
        </svg>
      );
    case "AI Search Watcher":
      return (
        <svg {...common}>
          <rect x="4" y="7" width="16" height="12" rx="2" />
          <path d="M9 7V5a3 3 0 0 1 6 0v2M9 13h.01M15 13h.01" />
        </svg>
      );
    case "Browser extension":
      return (
        <svg {...common}>
          <path d="M4 8h16M4 16h10" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      );
  }
}

const TOOLS = [
  {
    name: "KWFinder",
    job: "Keyword ideas, volume, and difficulty",
    trigger: "type a seed word in, read the list",
    equivalent: "keyword_ideas / suggest_keywords, run by the weekly research pass",
  },
  {
    name: "SERPChecker",
    job: "Localized SERP with 49 metrics per result",
    trigger: "paste a keyword, screenshot page 1",
    equivalent: "check_serp, called automatically inside the build's thin-content gate",
  },
  {
    name: "SERPWatcher",
    job: "Rank tracking, weekly by default",
    trigger: "add a keyword, open the dashboard to check it",
    equivalent: "track_keywords + a nightly cron + get_rankings",
  },
  {
    name: "LinkMiner",
    job: "Backlink opportunities for a domain",
    trigger: "search a domain, review the link list",
    equivalent: "get_backlink_prospects, queued by the weekly backlinks workflow",
  },
  {
    name: "SiteProfiler",
    job: "SEO metrics overview of a site",
    trigger: "paste a URL, read the summary",
    equivalent: "get_domain_rank, refreshed by a weekly cron",
  },
  {
    name: "AI Search Watcher",
    job: "Brand visibility inside ChatGPT and AI search",
    trigger: "open the dashboard, read a report",
    equivalent: "get_ai_visibility, filled in by the weekly sweep and geo-scan workflow",
  },
  {
    name: "Browser extension",
    job: "Quick metrics for whatever page you're on",
    trigger: "click the extension icon per page",
    equivalent: "none - no browser companion, and this guide isn't pretending otherwise",
  },
] as const;

export function MangoolsToolMapTable() {
  return (
    <TableShell className="my-6">
      <THead>
        <Th>Mangools tool</Th>
        <Th>Job</Th>
        <Th>You trigger it by</Th>
        <Th>DispatchSEO equivalent</Th>
      </THead>
      <tbody>
        {TOOLS.map((t) => (
          <Tr key={t.name}>
            <Td className="font-medium text-neutral-100">
              <span className="flex items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-300">
                  <ToolIcon name={t.name} />
                </span>
                {t.name}
              </span>
            </Td>
            <Td className="text-neutral-300">{t.job}</Td>
            <Td className="text-neutral-400">{t.trigger}</Td>
            <Td className={t.equivalent.startsWith("none") ? "text-neutral-500" : "text-emerald-400"}>
              {t.equivalent}
            </Td>
          </Tr>
        ))}
      </tbody>
    </TableShell>
  );
}
