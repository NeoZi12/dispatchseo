// The backlink-prospecting workflow - needs the DataForSEO backlinks module.

// Plain-English step summary for the dashboard's Instructions page.
export const BACKLINKS_STEPS = [
  { title: "Trace", plain: "Finds who links to the pages currently ranking for your target keyword." },
  { title: "Filter", plain: "Keeps realistic prospects - niche blogs, directories, newsletters - drops spam and unreachable giants." },
  { title: "Queue", plain: "Saves each prospect with a concrete reason and a suggested outreach angle." },
];

export const BACKLINKS = `## Workflow: backlinks <keyword or competitor domain>

1. Via the DataForSEO MCP backlinks endpoints: find domains linking to the
   top pages ranking for the keyword (or to the competitor domain). Projects
   without DataForSEO credentials cannot run this workflow - say so and stop.
2. Filter to relevant, plausibly-reachable prospects (niche blogs, tool
   directories, newsletters; skip spam and giants that will never respond).
3. \`add_backlink_prospect\` each with a concrete reason ("links to X's
   guide, we have the better/newer page on Y").
4. Output the prospect table with a suggested outreach angle per row.

Also remember the curated playbook: \`get_playbook\` lists researched
directories and communities with per-item status - the setup profile
personalizes its prefilled copy.
`;
