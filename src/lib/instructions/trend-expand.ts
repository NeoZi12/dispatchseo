// Stage 2 of the two-stage trend radar: the owner picked a subject on the
// Trends page (Get takes), and this run turns that ONE subject into 3-5
// concrete guide angles - validated against autocomplete and the live SERP -
// which land as pending suggestions linked to the topic. The owner then
// queues or builds the takes they like. This is where the SERP spend lives,
// so it only ever runs on subjects the owner chose.

export const TREND_EXPAND_STEPS = [
  { title: "Fire", plain: "Runs when you hit Get takes on a radar subject - one run per subject." },
  { title: "Read up", plain: "Reads the subject's evidence - including the viral video or thread that seeded it - plus what the site already covers and what's already queued." },
  { title: "Angle", plain: "Drafts 3-5 distinct takes on the subject - comparisons, how-tos, opinionated analyses." },
  { title: "Validate", plain: "Keeps only takes with real search demand, a beatable page 1, and a genuine fit with your site." },
  { title: "Your call", plain: "Survivors land under the subject for your approval - add to queue or skip each one; approved takes ship at your site's publishing pace." },
];

export const TREND_EXPAND = `## Workflow: trend-expand (on demand - turn a picked subject into takes)

The owner picked a trending subject off the radar; the dispatch payload
carries its topic_id and title. This run's whole job is that one subject:
find the 3-5 strongest takes on it, validate them, and queue the survivors
as PENDING suggestions for the owner's call. Never approve anything - the
owner is the taste gate, and the backend coerces trend approvals back to
pending anyway. When the owner approves a take it jumps to the front of the
build queue and ships on the next build the site's publishing pace allows -
never sooner: the pace exists so a young site doesn't read as scaled-content
spam to Google.

1. **Read the topic.** \`get_trend_topics\` and find the row matching the
   dispatched topic_id. If it is missing or dismissed, fail loudly and exit
   without changes - never expand a subject the owner didn't pick. Its
   evidence (why_now, signals, sources, and - when the scan found one -
   seed_url/seed_stats, the viral video/thread driving the subject) is your
   starting context.
2. **Know the ground.** Read the conventions file (or \`get_conventions\`)
   for what {{SITE_NAME}} is and who it serves; \`get_pages\` plus
   \`get_suggestions\` across statuses for what is already covered or queued
   - never re-propose either. If the site already covers the subject's
   underlying topic, an update to that page beats a new one: propose type
   "update" for it.
3. **Draft 3-5 candidate takes** on the subject, each a distinct search
   intent - not five rewordings. The proven shapes:
   - **Comparison** ("X vs Y", "is X better than Y for Z") - highest intent,
     chronically underserved in a fresh news cycle. Always try at least one.
   - **How-to / setup** ("how to use X", "X with Y tutorial") for launches.
   - **Analysis / answer** to the exact question the threads are asking.
   - **Update** to an existing page when the news lands on covered ground.
4. **Validate each candidate** (survivors can be fewer than drafted - three
   strong beats five thin):
   - **Demand**: \`suggest_keywords\` on the take's query - autocomplete
     reflects real queries within days, far faster than volume data. Rising
     trend data or visible discussion volume also counts. Never invent
     numbers - for brand-new terms say "too new for volume data" and cite
     the hype signals instead.
   - **Beatable page 1**: \`check_serp\` - news posts, Reddit threads, and
     bare vendor docs are beatable; an established in-depth guide from a
     big site is not. If \`check_serp\` says the project has no SERP
     provider (GSC-only mode), that is a configuration, not a failure:
     proceed WITHOUT the page-1 check, validate on demand and fit alone,
     and note "no SERP check (GSC-only project)" in each take's spec so
     the owner knows what was and wasn't verified. Never drop takes just
     because SERP data is unavailable.
   - **Fit**: {{SITE_NAME}}'s audience must be the one searching this.
5. **Queue the survivors as PENDING**: \`track_keywords\` the queries, then
   one \`propose_suggestion\` per take with \`source: "trend-scan"\` AND the
   dispatched \`trend_topic_id\` (that link is what groups the takes under
   their subject on the Trends page), a rationale that leads with WHY NOW,
   and a spec carrying the evidence: why_now, the hype signals seen (with
   dates), serp_notes, the chosen angle, and suggested internal links.
   **Seed pass-through**: when a take genuinely builds on the subject's
   seed content (reacts to it, expands it, answers it), copy the topic's
   seed_url and seed_stats into that take's spec - the guide builder writes
   FROM a seeded source: credits it, pulls real quotes, embeds a video,
   then covers what the original missed. Only pass the seed to takes that
   actually draw on it; a generic angle wearing a pasted seed link reads as
   fake attribution.
   Maximum 5 takes per subject. Do NOT call \`update_suggestion\` to approve
   anything.
6. **Close the loop**: \`update_trend_topic(topic_id, status="expanded")\` -
   the radar card flips from "working on takes" to showing them.
7. **Report**: takes drafted, survivors queued (one evidence line each),
   what was dropped and why. If nothing survives validation, say so
   honestly, still mark the topic expanded, and report "no viable takes" -
   a subject can be hype without being winnable.
`;
