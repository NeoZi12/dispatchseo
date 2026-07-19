// The weekly keyword-research workflow: product-knowledge-first candidate
// derivation, validation against the quality bar, and topping the queue up to
// the weekly quota. Generalized from the original clockedcode skill - the
// product surface to read comes from the repo's conventions file.

// Plain-English step summary for the dashboard's Instructions page. Edit it
// together with the markdown below - they describe the same pipeline.
export const RESEARCH_STEPS = [
  { title: "Learn", plain: "Re-reads what your product actually is, from your repo, every single run." },
  { title: "Derive", plain: "Asks: what would someone google right before your product is the answer? 20-40 candidates, hunting buying-intent first (comparisons, 'best X', alternatives) rather than 'what is X' traffic that never converts - but the quality bar still decides what makes it in." },
  { title: "Validate", plain: "Checks real search volume and difficulty - keywords outside your site's league get dropped." },
  { title: "Inspect", plain: "Eyeballs page 1 for each survivor: is it actually winnable?" },
  { title: "Queue", plain: "Fills the week's tank to your site's own pace - and guarantees it: if easy keywords run out, it promotes its own harder-but-vetted finds and widens the hunt before ever coming back short. Never filler to hit the number." },
];

export const RESEARCH = `## Workflow: research <topic?>

### Method - product knowledge FIRST (the moat)

Never start from a generic seed list. Start from what {{SITE_NAME}} IS, read
fresh from the repo at research time, so the research evolves with the
product:

1. **Read the product surface** (skim, do not deep-read): the product-surface
   files listed in the conventions file, plus the existing content
   inventory - published slugs in the guides directory and the tools
   registry, cross-checked against \`get_pages\` (never propose duplicates).
2. **Derive candidate queries** from that knowledge: what would someone
   google right before {{SITE_NAME}} is the answer? Setup pains,
   feature-by-feature questions, comparisons, error messages, "best X for Y",
   generator/checker intents. Aim for 20-40 candidates across both content
   types. If a topic argument was given, scope this step to that topic;
   otherwise cover the whole product.
   **Intent - hunt buying-adjacent FIRST.** Traffic that never converts is
   the #1 way an SEO program wastes a month: easy informational queries
   ("what is X", "X meaning") pile up impressions and zero revenue. So
   commercial and comparison intent is where you look first and what breaks a
   tie: "X vs Y", "best X for <use case>", "X alternatives", "X pricing",
   "how to <job the product does>", "X for <audience>". Roughly half the
   run's ideas landing there is a healthy week.
   **That is a direction, never a quota, and it NEVER outranks the quality
   bar.** The bar decides what MAY be queued - intent only decides what you
   hunt for and which of two passing candidates wins. So: never stretch the
   KD ceiling, never soften the volume floor, and never talk yourself into a
   me-too page because the keyword smells commercial. Equally, never pad the
   queue with informational filler to hit a number. If this week's niche and
   your current KD ceiling honestly yield two commercial keywords, queue the
   two and say so in the report.
   **It rises on its own.** The KD ceiling scales with the site's DR, and DR
   is exactly what puts the harder commercial terms in range - so the mix
   should climb over months with nobody touching this rule. If it is NOT
   climbing while DR grows, that means hunt WIDER (autocomplete phrasings,
   comparison framings, use-case and audience angles, long-tails of pages
   already ranking) - the same instinct as the quota rule below: expand the
   search, never the bar.
   Tag each candidate with its intent class (commercial | comparison |
   informational | transactional) - the tag rides into the rationale at
   step 5 and into the run report, so the real mix is always visible.
3. **Validate with the research source** (see the data-tools section):
   volume + KD for the candidates where available (batch where possible).
   Apply the quality bar.
4. **Eyeball the SERP** for the survivors: is page 1 winnable? Note weak
   spots (forums, thin listicles, outdated posts) in serp_notes.
5. **Persist**: \`track_keywords\` the winners, then \`propose_suggestion\`
   for the best ones with a real rationale and a spec brief, following the
   queue policies (guides build-first, tools approve-idea-first). Every
   rationale NAMES the query's intent class, and an informational idea says
   in one clause what it is doing for the site - feeding a commercial cluster
   through internal links, or claiming a term in AI answers. (Both are real
   jobs. This is labelling, not a tribunal: a strong informational keyword
   that passes the bar is a good week's work.) Tool ideas
   include a conversion rationale in \`rationale\`, the intended widget
   functionality in \`spec\`, and an \`archetype\` field in \`spec\`
   (wizard | calculator | analyzer | library - see the build-tool workflow's
   archetype table) so the builder knows the intended interaction pattern up
   front.

### Weekly quota - the queue guarantee

The consumers run at the site's own pace: the guide builder ships at most
ONE guide per day - up to **7 guides per week** - and the tool builder ONE
approved tool per week. That cadence is a PROMISE to the owner, and this
run is the only thing that fills the tank - so the run may not end short
while ladder rungs remain. Target: end the run with **7 approved guides**
and **1-2 pending tool ideas** in the queue. Count what is already queued
first (\`get_suggestions\` for approved and pending) and top up the
DIFFERENCE - never overfill past ~9 approved guides.

Short of quota? Work down this ladder IN ORDER - each rung costs more than
the one above it, so exhaust a rung before descending:

1. **Hunt wider (the candidate floor is a rule, not advice).** Mine more
   angles - autocomplete/question phrasings, "X vs Y" comparisons, error
   messages, long-tails of pages already ranking, feature-by-feature setup
   queries, product surface shipped since last week - and validate the new
   candidates (batch the volume/KD lookups; validation is the cheap part).
   You may NOT conclude the niche is exhausted before at least **20
   candidates** carry real volume/KD numbers in this run.
2. **Promote pending-zone survivors (costs nothing).** Ideas in the pending
   zone from source "research" - this run's or ones still sitting from
   earlier runs - passed the FULL quality bar; only the auto-approve KD
   line kept them out of the tank. \`update_suggestion(id,
   status="approved")\` the best of them - audience fit first, then lowest
   KD - until the target is met, prefixing the rationale with
   "AUTO-PROMOTED to keep the daily cadence". Never promote source
   "manual" ideas (the owner's own drafts await THEIR decision) or
   anything the owner rejected. On semi-automatic projects the backend
   records these approvals as pending - correct behavior; instead list in
   the run report exactly which ideas the owner should approve, in order.
3. **Soften the volume floor for dead-on ICP keywords only.** Candidates
   with volume 200-500 qualify WHEN the searcher is unmistakably the
   product's buyer (the audience-fit test leaves no doubt). KD zones never
   move. Low-volume + perfect fit beats high-volume + tangential - never
   the reverse.
4. **Mine the radar.** Trend topics already on the project's radar
   (\`get_trend_topics\`) are candidate sources too - derive guide angles
   from them and validate normally.
5. **Only now report a miss.** Queue what passed and state it plainly:
   "quota missed - N of 7 guides queued; ladder
   exhausted at rung X". With four rungs above, a miss should be RARE -
   and a miss reported with fewer than 20 validated candidates is a failed
   run, not an honest one.

The quality bar itself NEVER bends - not for the quota, not for the intent
mix, not for a keyword you like (KD zones and the best-page-1-answer test
hold at every rung; rung 3's volume softening is the bar's own written
exception, not a bend). One precedence, no exceptions: **the bar decides
what may be queued; the quota decides how many; intent decides which ones
you chase and which of two passers wins.** The daily builder idling beats
filler shipping - but a builder idling while vetted pending-zone ideas sit
unpromoted is a research failure, not honesty.

### Output

Two markdown tables: (a) keyword opportunities - keyword, volume, KD, intent,
type, angle; (b) recommended tools/interactive pages - idea, target keyword,
why it converts, status. Then a one-line summary of what was queued, the
quota status, and the HONEST intent mix - never a forced one - e.g. "queue
now holds 7 approved guides, 1 pending tool; 3 of 7 commercial, the rest were
the only keywords under the KD ceiling this week".
`;
