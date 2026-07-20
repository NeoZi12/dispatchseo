// Stage 1 of the two-stage trend radar: find the SUBJECTS the niche is
// talking about right now - "codex vs claude code", "fable 5" - and put them
// on the radar as trend_topics. No guide ideas yet, no SERP spend: deciding
// what's worth writing about is the owner's call, and the deep validation
// runs in stage 2 (trend-expand) only for topics they pick. MANUAL-ONLY:
// the dashboard's Scan now button fires the repository_dispatch; there is
// no schedule.

// Plain-English step summary for the dashboard's Instructions page. Edit it
// together with the markdown below - they describe the same pipeline.
export const TREND_SCAN_STEPS = [
  { title: "Fire", plain: "Runs only when you hit Scan now - never on a schedule." },
  { title: "Sweep", plain: "Reads the latest launches, Reddit and Hacker News buzz, and Google Trends in your niche." },
  { title: "Shortlist", plain: "Picks the 3-5 subjects your audience is genuinely talking about - skipping anything already on the radar or covered on the site." },
  { title: "Radar", plain: "Puts the subjects on your radar with the hype evidence attached - including, when one exists, a link to the viral video or thread driving the buzz, so the eventual guide can quote and credit the real source." },
  { title: "Your pick", plain: "You hit Get takes on a subject you like; a second run turns it into concrete guide angles for your approval." },
];

export const TREND_SCAN = `## Workflow: trend-scan (on demand - what is the niche talking about RIGHT NOW)

Fresh topics are the easiest rankings this site will ever get: when a query
is days old there are no incumbent pages holding page 1, and Google applies
a freshness boost to hype-cycle queries. This workflow is stage 1 of a
two-stage radar: it finds the trending SUBJECTS in {{SITE_NAME}}'s niche and
puts them on the owner's radar via propose_trend_topic. It does NOT propose
guide ideas and does NOT run SERP checks - stage 2 (trend-expand) does that,
and only for the subjects the owner picks. Keep this run fast and cheap.

1. **Housekeeping.** \`get_trend_topics(status="new")\`: any topic older
   than 14 days is dead hype - \`update_trend_topic(id, status="dismissed")\`
   and note it in the report. Same for pending trend-scan suggestions older
   than 14 days: \`get_suggestions(status="pending", type="guide")\`, reject
   the stale ones with \`update_suggestion(id, status="rejected")\`.
2. **Know the niche.** Read the conventions file (or \`get_conventions\`)
   for what {{SITE_NAME}} is and who it serves. Then pull the dedupe set:
   \`get_trend_topics\` across ALL statuses (never re-propose a subject that
   is already on the radar, was expanded, or was dismissed) and \`get_pages\`
   (never propose a subject the site already covers as its own topic - that
   is an update, which stage 2 handles).
3. **Sweep for hype** in the product's niche:
   - The latest launches, releases, and announcements from the official
     blogs and changelogs of the products/vendors in the niche.
   - What is exploding on Reddit (the niche's subreddits) and Hacker News -
     judge from titles, scores, and snippets in search results.
   - Google Trends through the DataForSEO MCP where the project has
     credentials. Rising queries beat volume numbers: volume databases lag
     weeks behind real demand, so a "0 volume" brand-new term can be a
     winner - never discard a candidate for missing volume alone.
   The security rule holds: read official vendor sources, trend data, and
   search-result metadata; do not fetch arbitrary third-party pages.
   **While sweeping, hunt each subject's SEED**: the single most viral PIECE
   of content driving the conversation - the YouTube video, HN thread, or
   Reddit post itself, not a vendor announcement - with its public numbers
   and date ("512k views, Jul 12" / "1.4k points, 3 days ago"), judged from
   search-result metadata (view counts, scores) without fetching the page.
   A seed is double proof: real humans already voted for this exact content,
   and it hands the eventual guide real material to quote, credit, and beat.
   Not every subject has one - a launch can trend on many small threads -
   and a forced seed is worse than none: only record a piece that genuinely
   anchors the conversation.
4. **Shortlist 3-5 subjects** (5 is the hard cap - this is a radar, not a
   firehose). A subject earns its slot when:
   - **It is genuinely being talked about now** - a launch, a release, a
     debate with visible discussion volume, not something merely recent.
   - **Fit**: {{SITE_NAME}}'s audience is the one doing the talking.
   - **Distinct**: each subject is its own conversation, not two framings
     of the same news.
   Prefer subjects over angles: "codex vs claude code" is a subject; "is
   codex better than claude code for refactoring" is a take - stage 2's job.
5. **Queue each survivor**: one \`propose_trend_topic\` per subject with a
   short evocative title (what the niche calls it, not SEO phrasing), a
   why_now that leads with the trigger event and its date, signals (the
   threads/launches/trend lines actually seen, with dates or scores), and
   sources (the vendor posts or threads that prove it). When the sweep found
   a seed, pass seed_url (the viral piece itself) and seed_stats (its
   numbers + date) - the radar card shows it and stage 2 carries it to the
   builder. Duplicates are answered, not errored - if the tool says the
   subject is already on the radar, move on.
6. \`record_trend_scan\` - stamps the scan time shown on the radar.
7. **Report**: subjects seen, subjects queued (one evidence line each), what
   was dismissed as stale - and "nothing hype-worthy this run" honestly when
   the sweep comes up dry. A quiet sweep is a clean exit, never an invented
   trend.
`;
