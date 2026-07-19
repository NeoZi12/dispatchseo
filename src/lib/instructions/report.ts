// The rank/traffic reporting workflow - short and universal.

// Plain-English step summary for the dashboard's Instructions page.
export const REPORT_STEPS = [
  { title: "Pull", plain: "Gathers 30 days of rankings and 28 days of Search Console traffic." },
  { title: "Summarize", plain: "What moved up, what moved down, and the 2-3 highest-leverage next actions." },
];

export const REPORT = `## Workflow: report

1. \`get_rankings(days=30)\` + \`get_site_stats(days=28)\`.
2. Summarize: what moved up, what moved down, what entered/left the top 100,
   clicks/impressions trend, and the 2-3 highest-leverage next actions
   (e.g. "X sits at position 8 - refresh it", "approve the pending tool
   idea"). Plain English, numbers included, no fluff.
`;
