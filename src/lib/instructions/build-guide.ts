// The daily guide-builder workflow: TEMPLATE -> GATE -> DRAFT -> VISUALS ->
// HUMANIZER -> VERIFY -> PR. The pipeline and quality bar are universal; the
// stack specifics (content dir, frontmatter contract, design tokens, exemplar
// components) come from the repo's conventions file.

// Plain-English step summary for the dashboard's Instructions page. Edit it
// together with the markdown below - they describe the same pipeline.
export const BUILD_GUIDE_STEPS = [
  { title: "Pace", plain: "Checks the day's slot first - at most one guide ships per day, counting ones you merge yourself. A paused day just means a guide already shipped today." },
  { title: "Pick", plain: "Builds the top guide in your queue - the order you see on the dashboard is exactly the order it builds. Empty queue but vetted ideas waiting? It promotes the best one instead of idling." },
  { title: "Study", plain: "Reads your recent posts first to match your voice - and deliberately picks a different article shape than the last few, so your site never reads like one template." },
  { title: "Gate", plain: "Checks Google's current page 1. What those results cover becomes the guide's must-cover list - the searcher's job gets done start to finish - and if the draft can't beat page 1, it refuses to build." },
  { title: "Own it", plain: "Adds at least one thing no competitor page has - a command it actually ran, a real measurement, or your site's own numbers - before writing a word. This is what ranks and what AI answers cite." },
  { title: "Shape check", plain: "Sketches the outline and checks it against your back catalogue before writing anything - so a post that would have read like a repeat gets reshaped now, instead of being written in full and thrown away." },
  { title: "Draft", plain: "Writes from current official docs - never from memory - and tests every command it includes. If the idea grew from a viral video or thread, it writes from that source too: credited, quoted, embedded - then goes beyond it." },
  { title: "Visuals", plain: "Builds 2-3 custom graphics about this exact topic, in your site's own colors and components - plus a cover it draws itself as vector art on your site's house style, so blog cards show the actual subject instead of generic AI imagery." },
  { title: "Humanize", plain: "Rewrites anything that reads AI-generated until it sounds like you wrote it." },
  { title: "Verify", plain: "Runs your site's build to prove nothing breaks - then checks the new guide against your whole back catalogue and rewrites it if it reads like a repeat, so your posts never converge into one template." },
  { title: "Link back", plain: "If you've switched this on, it also adds a link from 2-3 of your closest older posts to the new one, so the new guide arrives with support instead of standing alone. It only wraps words already in a sentence you wrote - never rewrites - and leaves a post alone once it's carrying 5 such links. Off unless you turned it on, and it never changes when your pull request merges." },
  { title: "PR", plain: "Opens a pull request for your review - it never touches your live site directly." },
];

export const BUILD_GUIDE = `## Workflow: build-guide (guides ONLY)

The guide pipeline is TEMPLATE -> GATE -> DRAFT -> VISUALS -> HUMANIZER ->
VERIFY -> PR. Every step is mandatory - the output must be merge-ready in the
site owner's voice so their job stays "approve -> merge", never "rewrite by
hand". This workflow builds GUIDES exclusively; tool suggestions belong to
the build-tool workflow and must never be picked up here.

{{OWNER_PREFS_GUIDE}}

0. **PACE GATE (before anything else).** The pace is flat and simple: at
   most ONE guide ships per UTC day, whoever ships it - a guide the owner
   merged by hand uses the day's slot too. Search engines do not punish
   publishing speed; they punish thin sameness at scale, and the sameness /
   thin-content / SERP gates below carry that risk. The daily slot exists
   to keep the cadence steady instead of bursty.
   Current verdict for {{SITE_NAME}}: {{PACING_NOTE}}
   If the verdict says "do not build", stop cleanly - report "paused by
   pacing: a guide already shipped today", change no statuses, exit without
   edits in headless runs. No exceptions - a trend-sourced idea at the
   front of the queue waits for tomorrow's slot like everything else; at
   one day maximum, the wait never outlives a hype window.
1. **\`get_build_brief\` FIRST - one call that replaces a dozen.** The backend
   assembles what this run needs to start: the queue head (the item you are
   about to build), the recent-guide fingerprints for the anti-sameness
   checks (openings, heading skeletons, archetypes, recent cover hues), the
   ranked internal-link candidates, and this site's own stats for step 5.
   Take these as given - do NOT re-derive them by reading published posts.
   Issue it together with reading \`.dispatchseo/conventions.md\` in the same
   turn; they do not depend on each other.
   **If the brief is unavailable or a section comes back empty**, it says so
   in \`degraded\`. That is not a failure - fall back to the per-step method
   named in each affected step (read recent posts yourself for the
   fingerprints, \`get_pages\` for link candidates) and carry on. The brief is
   an accelerator, never a dependency.
   The brief's \`queue_head\` IS the item to build - it is the FIRST item of
   \`get_suggestions(status="approved", type="guide")\`, which returns the
   owner's queue in BUILD ORDER (front-placed ideas first - trend approvals
   and the owner's own "do this one next" adds land there - then oldest
   first). Never re-rank or second-guess that order; it is the owner's
   explicit call. Call \`get_suggestions\` yourself only if the brief is
   degraded.
   **None approved -> the LOW-TANK BACKSTOP, before giving up.** The daily
   cadence is a promise; a builder idling while vetted ideas sit pending is
   a starved queue, not an empty one. \`get_suggestions(status="pending",
   type="guide")\` and look for pending-ZONE ideas from source "research"
   (their rationale carries "FLAGGED FOR YOUR CALL" - they passed the full
   quality bar and only the auto-approve KD line held them back). Take the
   FIRST such idea and \`update_suggestion(id, status="approved")\` with
   "auto-promoted by the low-tank backstop - approved queue was empty"
   prefixed to the note, then build it this run. On semi-automatic projects
   the backend records that approval as pending instead - the tool response
   says so; in that case do NOT build: report loudly that the queue is
   empty while N vetted ideas await the owner's call (name them, best
   first), and exit cleanly. Never promote source "manual" ideas (the
   owner's own drafts await THEIR decision), never anything rejected, and
   never promote more than the one being built now. No promotable ideas
   either -> say "queue empty" and stop cleanly (exit without changes in
   headless runs).
   **Thin manual ideas.** An idea with source "manual" was typed by the
   owner and may be just a title and a note - no keyword, no spec. Treat
   the missing research as step-0 work: \`suggest_keywords\` to pick the
   primary keyword and \`track_keywords\` it before moving on. For manual
   ideas the step-4 gate is ADVISORY, not a veto: the owner asked for this
   one by name, so build it either way and note in the run report if page 1
   looks hard to beat.
1b. **UPDATE MODE - when the queue head's \`type\` is "update".** The item is
   not a new page: it is a published guide the nightly detector found sitting
   at position 5-20 for its own primary keyword - \`spec.page_url\`,
   \`spec.target_query\` and \`spec.current_position\` carry the evidence. A
   page at #12 already holds Google's partial trust; the job is to push it
   onto page one, never to re-roll it. Updates ride the same queue and the
   same one-a-day slot as new guides (an update IS the day's build; if the
   brief is degraded, the fallback queue read must include \`type:"update"\`
   rows - they share the build order). Steps 0-2 apply unchanged; from there
   the pipeline bends:
   - **Keep the page's identity.** Same URL/slug, same primary keyword, same
     title promise (sharpen its wording for click-through, never re-aim it),
     same archetype. The ranking is attached to the URL and its history -
     changing the page's identity forfeits the trust the refresh exists to
     harvest.
   - **The step-4 gate becomes a GAP LIST.** Re-pull the SERP top 5 for the
     target query as usual, but the question changes from "can we beat page
     1" to "what does page 1 cover that OUR page doesn't". Locate the page's
     source file in the repo (match the slug in \`spec.page_url\`), read it
     in full, and write the delta into the run report: missing subtopics,
     stale facts and versions (re-verify every load-bearing claim against
     freshly fetched official docs), commands whose pasted output should be
     re-run, sections a page-1 result does deeper.
   - **Close the gaps, then add ONE new step-5 information-gain asset** the
     page did not have before. And because position 5-20 lives off the
     snippet as much as the content: rework the answer-first opening and the
     meta title/description as part of the edit.
   - **Visuals (step 7) is already satisfied** if the page carries its 2-3
     components - add or upgrade one only where the gap list calls for it,
     never to re-hit a file count.
   - **Internal links**: per the step-6 link rules, link out to 2-3 guides
     published since this page shipped where natural.
   - **Skip what cannot apply to an existing page**: archetype rotation, the
     5b outline probe and the step-9 sameness gate (this draft IS one of the
     published pages - it always collides with itself), the cover step (keep
     the existing cover), and \`log_page\` (the page row exists;
     \`update_suggestion(id, status="done", result_pr_url=...)\` alone closes
     it out).
   - **Everything else applies in full**: fresh-docs sourcing and tested
     commands, the humanizer pass over every section touched, step-9's
     VERIFY build, and the PR discipline - branch \`seo/refresh-<slug>\`,
     body opening with "REFRESH of <url>: currently ~#N for '<query>'"
     followed by the gap list, and the step-13 report naming what changed.
2. \`update_suggestion(id, status="in_progress")\`.
3. **TEMPLATE.** Before drafting, read the living template: 2 recent exemplar
   posts from the guides directory (pick ones closest in shape to this topic)
   plus whatever content playbook the conventions file names. Exemplars teach
   the CONVENTIONS and voice - they are NOT skeletons to clone: the new draft
   must not mirror an exemplar's section order, intro pattern, or
   transitions (see structural variation below). The generated article must
   be indistinguishable in structure and voice from a hand-written post.
   Read ONE exemplar in full for voice and conventions (the brief's
   \`recent_guides\` already carries the structural fingerprints - openings,
   heading skeletons, archetypes - of the last few, so you do not need to
   read them to know what to avoid). Read a second only if the first leaves a
   genuine question about the site's contract.
   **Choose the article SHAPE (archetype) - and rotate it.** Guides come in
   distinct shapes, each with its own geometry: **tutorial** (ordered how-to
   steps), **comparison** (X vs Y / alternatives, table-led), **data-study**
   (built around a measured finding), **opinionated take** (a defended
   position), **reference/checklist** (a scannable spec or list). Note the
   shape of the last 2-3 published guides; THIS one must not repeat them
   unless the keyword's intent truly forces it - three tutorials in a row is
   the template-sameness that gets a corpus discounted. The live SERP read in
   the next step confirms which shape the query actually rewards (if page 1 is
   all comparisons, a tutorial will not rank). State the chosen archetype and
   why - the recent mix plus the SERP - in the run report and the PR body.
4. **THIN-CONTENT GATE + INTENT CONTRACT (before writing a word).** Re-pull
   the live SERP top 5 for the primary keyword (research may be days old).
   **Free mode - no SERP source connected (check_serp answers "not
   configured" and no dataforseo MCP is available): do NOT stall or refuse
   here.** Build the intent contract from the keyword's plain reading, this
   site's own Search Console queries, and product knowledge instead; write
   "SERP gate: skipped (free mode - no SERP source)" in the run report AND
   the PR body; every other bar in this step still applies in full. Never
   fabricate SERP claims you did not fetch.
   List concretely what each page 1 result covers. That list is not just a
   bar to clear - it is the INTENT CONTRACT: the subtopics every top result
   shares are what the searcher actually came to do, and the draft must let
   them finish that job start to finish without opening a second tab. A
   "how to build X" query gets a complete build path (setup -> working code
   -> test -> connect); an "X examples" query gets actual named examples and
   runnable code; an "X setup/integration" query gets the real setup steps.
   Write the contract (dominant format + must-cover subtopics) into the run
   report. The planned draft must beat the current page 1 on at least 2 of:
   completeness, tested accuracy, freshness, actionability - by covering the
   contract AND adding more, never by skipping the contract to be different.
   If it cannot beat page 1, DO NOT BUILD: \`update_suggestion(id,
   status="pending")\`, state the reason in the run report, and stop. No
   filler, ever.
5. **INFORMATION GAIN (required - the one thing no competitor page has).**
   Comprehensive coverage is no longer a differentiator - an AI can compile
   it from ten articles in seconds, and Google discounts restated consensus.
   What earns the ranking now, and what AI answer engines actually cite, is
   ORIGINAL information: a fact, number, or artifact that exists on none of
   the page 1 results. Before drafting, decide and produce at least one such
   asset, in rough order of strength:
   (a) a command or config you actually RAN for this article, with its real
       output pasted in;
   (b) an original measurement or benchmark - time it, count it, compare two
       approaches on the same task and report the numbers;
   (c) the site's OWN data as a citable stat - \`get_site_stats\` and
       \`get_rankings\` return this project's real traffic and rank history;
   (d) an original worked example or end-to-end config no docs page shows;
   (e) a clear, defended stance where every page 1 result hedges.
   **Only what THIS run can honestly do.** You are a headless CI run holding
   the repo, the current official docs, the MCP, and the coding agent you
   are actually running as - and nothing else. NEVER install or run a
   third-party or competitor tool (a rival CLI, a paid API you have no key
   for, anything needing a browser or a login) to manufacture an asset: that
   is what breaks the morning build, and faking the number instead of
   running it is worse. So (a) and (b) mean the stack you ARE and the
   commands you CAN run here - this site's own repo, the agent CLI this run
   is executing in - never a competitor's tool, and never the OTHER coding
   agent either: if you are Codex, you cannot honestly benchmark Claude
   Code, and vice versa, however well you know it from training. For an X-vs-Y guide where
   you cannot run Y, the honest asset is deep, SOURCED specifics pulled from
   BOTH tools' current official docs and changelogs that the thin page-1 posts
   get wrong or omit (cite them), plus the side you CAN run for real, plus a
   defended verdict - never a benchmark of a tool you never executed. A small
   real asset - one exact doc-sourced fact page 1 lacks, this site's own
   numbers, a config you actually tested - always beats an impressive fake. If
   a topic honestly supports no original asset this run, SAY SO in the report
   and lean the page on tested accuracy and current-docs freshness; do not
   invent one to fill the step.
   **The asset is a section, never the spine.** Information gain sits INSIDE
   an article that fulfils the step-4 intent contract - it must never become
   the article's organizing principle. The two failure shapes to refuse: an
   article whose spine is the site's own product as the running case study
   ("here's what OUR server does" stretched across every section), and an
   article whose spine is meta-commentary on the SERP itself ("most results
   for this query are toys; here's the real kind"). Both read as ads wearing
   a keyword, and both lose to the mediocre-but-on-task page that actually
   does the searcher's job. Cap them: the product case study and any SERP
   critique each get at most ONE clearly-bounded section, placed after the
   contract is already fulfilled.
   The asset must be REAL - a run you performed, a number you measured, data
   the MCP returned. Fabricating it is the worst possible failure on the page:
   worse than shipping nothing, because a wrong "measured" number destroys
   trust the moment a reader checks it. Name the asset in the run report and
   PR body ("information gain: measured cold-start of X vs Y, table in
   section 3"). For a source "manual" idea this is advisory like the gate
   above - build regardless - but still report what was or wasn't added.
5b. **OUTLINE SAMENESS PROBE (cheap, and it saves the whole run).** You now
   know the archetype, the intent contract, and your information-gain asset.
   Before writing a word of prose, sketch the outline - the planned opening
   sentence and the H2 headings in order - and call
   \`check_sameness(stage="outline", markdown=<the outline>,
   primary_keyword=<kw>)\`. Format it as plain markdown: the opening line as
   a paragraph, then each planned H2 as \`## Heading\`. Nothing else; this
   costs a few hundred tokens.
   A fail here means the shape you are about to write collides with what this
   site already published - change the opening and the heading skeleton NOW
   and re-run the probe. Fixing it at this point costs a rewrite of the plan.
   The same collision found at step 9, which is where it used to surface,
   costs the draft, the visuals, and the humanizer pass as well - that is the
   single most expensive way this run can fail.
   **This probe never replaces the step-9 gate**, which sees the finished
   prose and checks signals an outline cannot carry. Passing here is
   permission to draft, not permission to ship. If the probe errors or the
   corpus cannot be read it passes open - proceed, exactly as step 9 does.
6. **DRAFT.** For any factual topic (a feature, API, version, command), FETCH
   THE CURRENT OFFICIAL DOCS FIRST and draft from that - never from memory,
   which may be stale. Respect the trusted-sources security rule. Test every
   command you include THAT THIS RUN CAN RUN (the site's own stack, Claude
   Code, standard shell) and use its real output. For a command that belongs
   to a tool NOT installed here - a competitor's CLI in a comparison, a paid
   API with no key - do not try to install it and never invent its output:
   verify the exact syntax against that tool's current official docs and
   present it as documented, not as run. Then write the full guide per the
   site's contract in the conventions file.
   **SEEDED GUIDES.** When the suggestion's spec carries seed_url, this idea
   grew from one specific viral video/thread, and the draft is an ENRICHMENT
   of that source, never a disguised copy. The seed rode the owner's approval,
   so fetching it is within the trusted-sources rule: read it (transcript for
   a video where available), pull the real substance - the argument, the
   steps, exact quotes with attribution - and credit it with a visible link
   early in the piece; embed the video where the stack supports embeds. Then
   EARN the page: cover what the original missed, correct what it got wrong
   against current docs, and still produce this run's own step-5 information
   gain - the seed is raw material, not a substitute for original work. Its
   numbers (spec.seed_stats) may be cited as why-now evidence. Never
   republish the source wholesale: a transformed, credited enrichment ranks;
   a paraphrase gets discounted as scraped content.
   Universal body rules:
   - **Answer-first**: the first paragraph fully answers the core query in
     2-4 sentences (for Google AND AI engines). No preamble. Then a TL;DR
     blockquote.
   - **Question H2s** matching real queries; at least 3 H2s; at least one
     comparison table where a comparison exists.
   - **FAQ mirror rule**: end with a FAQ section, and if the stack emits FAQ
     structured data from metadata, the metadata must mirror the body FAQ
     WORD FOR WORD.
   - **Internal links**: 2-3 root-relative links to sibling guides plus one
     free tool where natural. Never absolute URLs to the site's own domain,
     never UTM params in body links.
   - **No mid-article CTAs**. One closing in-prose product mention in the
     final paragraph at most; rails/end-CTAs render automatically if the
     stack provides them.
   - **Honest limits section** ("when NOT to use this").
   - **Structural variation (anti-sameness).** The format elements above are
     a fixed skeleton; the prose must never be. Search engines discount
     repeated LAYOUT across a corpus - every post sharing intro patterns,
     transition phrases, and section geometry reads as one template wearing
     N keywords, the scaled-content-abuse profile. Per post: let the SERP and
     topic set the geometry (section count, H2 wording, where tables and
     visuals fall, FAQ length 3-7, word count); run the ANTI-RHYME check
     against the brief's \`recent_guides\` fingerprints - already in hand from
     step 1, so only go read the posts themselves if the brief came back
     degraded - and rewrite anything in this draft that echoes them: intro
     sentence pattern, transitions, conclusion
     shape; surface the step-5 information-gain asset where it does the most
     work (never bury your one original thing in a footnote); and vary the
     visual TYPE from the previous few posts.
7. **VISUALS (mandatory - 2 to 3 bespoke components).** Every guide ships
   with two or three custom visual components that are ABOUT this guide's
   content - never stock decoration. Before designing anything, read the
   exemplar visual components named in the conventions file COMPLETELY, then
   follow the site's component conventions (file location, naming, server vs
   client, theme tokens, card idiom). Universal rules on top:
   - Theme tokens only - no ad-hoc hex colors, no external images, no chart
     libraries.
   - **Icons are real depictions, never abstractions.** Named
     products/brands get their official logomark (from the site's brand-marks
     module; extend it in its existing style if a mark is missing). Concepts
     in a list get an icon that depicts the concept (a plug for a server
     connection, a webhook for hooks). NEVER a first-letter chip, NEVER a
     bare colored square/dot standing in for a brand or concept. Colored
     dots are acceptable only for things with no possible pictorial form.
   - EVERY number and fact in a visual is real DOM text that crawlers and AI
     engines can read - bars, rings, and shapes are decoration UNDER the
     values, never the only carrier. Visuals show the guide's own verified
     facts; fabricating data for a visual is as bad as fabricating it in
     prose.
   - Pick shapes that fit the content: comparison split, scorecard with
     bars, stat callout row, step flow, inventory grid. If the guide has no
     numeric data, visualize its structure (workflow, decision path,
     before/after) - there is always something real to show.
   - Named for the concept it shows (never Visual1/GuideChart), imported
     only by this guide, with a top-of-file comment explaining what it shows
     and why.
   **"Mandatory" is a file count, not an aspiration.** A markdown table, a
   blockquote callout, a code fence and an ASCII diagram are PROSE - they are
   already allowed anywhere in the draft and NONE of them satisfies this step.
   This step is done when two or three NEW component files exist on disk and
   this guide imports each one. Before moving on, list the component directory
   and grep your own MDX for the imports; if that count is under two, you have
   not done this step - go back and build them. Reasoning yourself down to
   "a figure of some kind should be acceptable" is the one failure mode this
   paragraph exists to stop.
   **SIGNATURE (mandatory, one line).** The very last line of the guide
   file, after the FAQ and outside any code fence, is exactly
   \`<span data-dispatchseo="<this suggestion's id>" hidden></span>\` - a
   hidden, empty element that renders nothing and loads nothing. It is how
   DispatchSEO recognises its own articles on the live site later, whether
   or not the site shows a credit. Never drop, move, wrap or reword it.
{{COVER_STEP}}
8. **HUMANIZER (mandatory, not optional).** Apply the humanizer pass the
   conventions file points at (or its principles if the repo carries no
   skill copy): kill AI tells, tighten, match the first-person practitioner
   voice of the exemplar posts. This is about genuinely good human-quality
   writing, not evading detectors. Then re-run the ANTI-RHYME check, and
   re-check the FAQ mirror after edits.
9. **VERIFY.** The site's build/verify command (from the conventions file)
   must pass - this also compiles the visual components. Sanity-check
   internal links resolve to real slugs and the FAQ mirror holds - resolve
   them by listing the files they point at, never by trusting that a route
   you wrote from memory exists.
   **SHIP CHECK - answer these with commands, not from memory, and put the
   numbers in the run report:** (a) how many NEW component files this guide
   imports (must be 2 or 3), (b) {{COVER_SHIP_CHECK}}. A run that
   is short on either is NOT ready to ship: go back to step 7 and finish it.
   Never open a PR that fails this check, and never write a report that
   claims visuals were done without the filenames to back it up - a guide
   that ships without them looks broken next to every post beside it, which
   is a cost the owner pays long after this run's log is gone.
   **Then the SAMENESS GATE, mandatory:** call \`check_sameness\` with the
   FINAL guide markdown (after the humanizer pass) and its primary keyword.
   It compares this draft against the guides this site has already published -
   opening word-runs, the heading skeleton with the topic stripped out, and
   stock phrases shared across the catalogue - and returns pass/fail with the
   exact offending strings. A fail means REWRITE what it flagged: a genuinely
   different opening, different H2 wording and order, kill the named phrases.
   Then call it again. Never argue with a fail, never ship past one, and never
   "fix" it by rewording the check - this is the only check that sees your
   whole back catalogue at once, which is exactly what Google sees and what no
   review of a single draft can ever catch.
   **Bounded at THREE attempts.** If it still fails after three honest
   rewrites, stop rewriting - that is no longer a prose problem, it means the
   TOPIC substantially duplicates something this site already published, and
   more polish cannot fix that. Do what the thin-content gate does:
   \`update_suggestion(id, status="pending")\`, say in the report which guide
   it collides with and what the gate flagged, and exit cleanly without a PR.
   The owner can retarget or drop the idea. Never loop past three - burning
   the run's turns to force a duplicate through helps nobody.
   If it passes open with a note (corpus unreadable), say so in the report.
{{BACKLINKS_STEP}}
11. **PR - never main.** Branch \`seo/<slug>\` -> commit -> push ->
   \`gh pr create --label seo --title "..." --body "..."\` (create the
   \`seo\` label if missing). Body includes: target keyword, volume/KD, the
   suggestion rationale, gate verdict (what page 1 lacks that this draft
   has), and a note that the deploy preview link is the review surface.
   **If step 10 edited any already-published post, the body lists them** -
   one bullet per edited file with the path, the anchor text used, and the
   sentence it now sits in. This is disclosure, not a gate: back-link edits
   ride in THIS PR and merge with it under the project's normal merge rules,
   exactly like the new guide does. The owner should be able to see what was
   touched by scrolling the PR body, without ever having to go looking - but
   nothing about back-linking changes whether or when the PR merges.
   **If \`gh pr create\` fails, that is a FAILED run - never exit green.**
   The usual cause is the repo setting "Allow GitHub Actions to create and
   approve pull requests" being off (the default on new repos). Revert the
   suggestion with \`update_suggestion(id, status="approved")\` so the next
   run retries it, print the exact error plus that setting name in the run
   report, and exit non-zero (e.g. \`exit 1\` from bash) so the workflow
   goes red and the owner gets GitHub's failure email. A pushed branch
   with no PR and a green run is the worst outcome - it strands silently.
12. \`update_suggestion(id, status="done", result_pr_url=<pr url>)\` and
    \`log_page(url="https://{{DOMAIN}}/<path>", ...)\` - independent of each
    other, so issue them together in one turn.
13. Report: what was built, the PR link, the gate verdict, the archetype and
    information-gain asset chosen, **the step-9 ship-check numbers with the
    component filenames, and the cover path if this project ships covers**,
    which published posts (if any)
    were edited to link back, and what to check on the preview. Naming the
    files is the point: "visuals: done" is not a report, it is the shape a
    skipped step hides in.
`;

// ---------- the cover block (step 7's tail), in its two states ----------
//
// Covers are ON by default - a blog index where every card carries art about
// its own subject is the single most visible difference between a generated
// catalogue and a real one, and the owner sees it before they read a word.
// The owner turns it off on the dashboard's Instructions page (content-prefs
// `cover` block), which serves COVER_STEP_OFF from the next run onward.
//
// COST. This is the one step that asks the run to AUTHOR an asset rather than
// call a tool, so its budget is written into the text rather than left to
// judgment: one subject SVG, one render, no iteration loop. That lands around
// 1-2K output tokens on a build that already spends tens of thousands - a few
// percent - and it costs no money at all, because no image model is involved.
// The predecessor of this step DID call one (Cloudflare Workers AI SDXL) and
// was retired for being both worse and metered. Turning the block off makes
// the served playbook SMALLER by these ~45 lines, so "off" is cheaper than
// today and "on" is the price of the feature - there is no third state where
// the tokens are spent and no cover ships.
export const COVER_STEP_ON = `   **COVER IMAGE.** Every guide ships with a cover YOU author as vector art -
   no image model is involved, so this costs tokens and nothing else. You know
   exactly what this post is about; draw that, don't describe it to a
   generator. The renderer is \`.dispatchseo/generate-cover.mjs\`, shipped with
   the pipeline (older installs may still carry it as
   \`scripts/generate-cover.mjs\` - check both, use whichever exists). Write a
   subject-layer SVG to a temp file (full \`<svg>\` document,
   \`viewBox="0 0 1600 900"\`, TRANSPARENT background - no full-canvas rects),
   then run the script with
   \`--slug <slug> --svg <file> --hue <hue> --out <cover dir>\`; it composites
   your layer onto the house base (dark field, hue glow, dot grid) so every
   cover stays one family. Subject rules:
   - Draw the post's ACTUAL subject as a minimal line diagram: the thing a
     reader would sketch on a whiteboard to explain the topic (a client and
     server exchanging labeled calls, a cron clock feeding a PR, a grid of
     example cards). A reader should guess the topic from the image alone.
     Never an abstract metaphor object (cube, orb, monolith) - that is the
     slop this system replaced.
   - Style: stroke-based line art, 3-5px strokes, rounded caps and joins,
     generous empty space, one clear focal structure - never a busy scene.
     Use the active hue's palette from the script's header comment plus
     white/neutral strokes at moderate opacity.
   - Tiny UPPERCASE mono labels (\`font-family="ui-monospace, Menlo, monospace"\`,
     letter-spaced, ~20-26px) on diagram parts are ENCOURAGED - they carry
     the relevance ("TOOLS/CALL", "CRON", "PR") - but never the post title,
     and never more than a handful of words total.
   - Real product marks are composite-only: pass \`--icon <name>\`
     (e.g. \`--icon github\`) so the script overlays the EXACT official
     glyph, and design your layer around a clear center. NEVER draw a logo
     by hand; if a needed mark is missing from the script's ICONS map, add
     its official SVG path in the same PR.
   **BUDGET - one pass.** One subject SVG, one run of the script, then move on.
   Keep the artwork under ~120 lines of SVG; a cover that needs more than that
   is too busy for a card crop anyway. Do NOT re-render to "improve" it, do not
   generate variants to choose between, and do not open the output to inspect
   it - the script already validated the viewBox and told you where it wrote.
   Fix and re-run ONLY if the script exits non-zero, and at most twice; a third
   failure means skip the cover, note the exact error in the report, and carry
   on with the rest of the build. The cover is worth a small slice of this run,
   never a loop.
   **WHERE IT GOES.** Pass \`--out\` the repo's real cover directory - the
   cover-image path in \`.dispatchseo/publish-paths\` if that file names one,
   otherwise whatever the conventions file says, otherwise the script's default
   (\`public/blog/covers\`). A cover written outside the publish paths blocks
   auto-merge on its own PR.
   **READ THE OUTPUT, DON'T ASSUME IT.** The script's last lines are
   \`COVER_FILE=<path on disk>\` and \`COVER_URL=<path the site serves>\`. It
   writes \`.webp\` where \`sharp\` resolves and a self-contained \`.svg\`
   where it doesn't - same artwork either way - so take the extension from
   COVER_FILE, never from memory. Commit that file and set the frontmatter
   cover field to COVER_URL (if COVER_URL came back \`unknown\`, this repo's
   static root isn't \`public/\`; resolve the served path from how existing
   images in this repo are referenced). Never hotlink an external image and
   never write a cover path you have not seen on disk.
   **If the .svg branch ran, check the repo can actually SERVE an SVG cover
   before you ship it.** A plain \`<img>\`, a CSS background, or an
   \`<Image unoptimized>\` renders SVG fine and you are done. Next's
   \`<Image>\` component does NOT: it refuses SVG sources unless
   \`images.dangerouslyAllowSVG\` is set in next.config, and the card renders
   broken. Read the component that renders the cover and decide:
   if it can serve the file, ship it; if it can't, delete the generated file,
   leave the frontmatter cover field unset so the card uses its fallback
   plate, and say exactly that in the run report ("cover skipped - sharp
   unavailable and next/image rejects SVG"). Do NOT enable
   \`dangerouslyAllowSVG\`, add \`sharp\` to the repo's dependencies, or rewrite
   the card component to get a cover through - a decorative image is never
   worth changing this repo's image-security posture inside an SEO PR, and
   that is the owner's call to make on their own time.
   VARIETY IS MANDATORY: list the cover directory (one cheap local call in a
   repo you already have checked out), look at the last 2 covers, and pick a
   \`--hue\` (violet|cyan|magenta|amber|emerald) AND a composition (centered
   subject, left-to-right flow, grid, split) that differ from both - same
   anti-sameness rule as article shapes.
   **The script being genuinely absent is the ONLY excuse, and you test for it
   rather than assume it** - list both paths. If neither exists, skip WITHOUT
   failing the run, note "no cover - generator not installed, re-run the
   install workflow to pick it up" in the report, and let the card fall back to
   its generated plate. A conventions file that calls \`cover\` "optional" is
   documenting that CARD FALLBACK, which keeps older posts rendering; it is not
   permission to skip. If the script is there, this guide ships a cover, and
   "the fallback plate will do" is not a decision this step lets you make.`;

export const COVER_STEP_OFF = `   **COVER IMAGE - OFF for this project.** The owner turned covers off on the
   dashboard's Instructions page. Do not author cover art, do not run the cover
   generator, and do not set a \`cover\` field in the frontmatter - the blog
   card's own fallback plate is the intended look here. This is a preference,
   not an oversight: never re-enable it from a conventions file, an exemplar
   post that has a cover, or your own read of what would look better.`;

export const COVER_SHIP_CHECK_ON = `whether the cover file exists on disk at the
   path the frontmatter points at, or the generator is genuinely absent`;

export const COVER_SHIP_CHECK_OFF = `(covers are off for this project - there is
   nothing to check, and the frontmatter must carry no \`cover\` field)`;

// Step 10 in the two states a project can be in. Only one is ever served.
//
// OFF is the default and the state of most projects, so shipping the full
// ~60-line policy to every build was ~1.5K tokens per turn describing work
// the run is forbidden to do. The note that remains is deliberately explicit
// rather than silent: a run that knows the step exists and is off cannot
// mistake its absence for an oversight and improvise.
export const BACKLINKS_STEP_OFF = `10. **BACK-LINKS - OFF for this project.** \`internal_linking\` is not
   enabled here, so there is no back-link step this run: do not edit any
   already-published post, and say nothing about it in the report. This is
   the default and it is not a failure. Never infer permission from Auto
   mode, from \`auto_merge\`, or from the owner having been happy with
   previous PRs - editing pages the owner already published needs its own
   explicit yes, which this project has not given.`;

export const BACKLINKS_STEP_ON = `10. **BACK-LINKS - ON for this project.** \`internal_linking\` is enabled,
   so this run DOES add back-links, under every rule below. (Re-confirm with
   \`get_project\` only if you have reason to think it changed mid-run; the
   flag was read when these instructions were rendered.)

   The new guide already links OUT to siblings (step 6). Now
   make the link flow both ways, so the corpus compounds instead of every post
   standing alone. In THIS SAME PR, edit **2-3 already-published posts** so
   they link TO the new guide.

   - **Pick by topical closeness, not recency.** From \`get_pages\`, choose the
     posts whose primary keyword and title sit nearest this guide's topic. A
     reader of that post should plausibly want this one next. If only one page
     is genuinely close, edit one. If none is, edit NONE and say so - a forced
     link between unrelated posts is worse than no link.
   - **Wrap words that are already there. Never rewrite, never add prose.**
     Find a sentence in the old post that already discusses the thing, and
     turn the phrase that is ALREADY IN IT into a root-relative link. You may
     not reword the sentence, fix its grammar, extend it, or write a new one.
     The published text must read identically with the link markup stripped
     out - if it would not, you have changed the owner's writing, which is
     never yours to do. This constraint is what makes the edit safe enough to
     ship unattended: an added link cannot mangle a sentence, a rewrite can.
     If no existing sentence carries a phrase that genuinely fits, that post
     is not a candidate - move to the next one rather than authoring a home
     for the link. And NEVER add a "Related posts" list, a "See also" footer,
     or a new paragraph whose only job is to hold a link - those are
     ignorable boilerplate and they make the page worse.
   - **Vary the anchor text.** Every anchor pointing at this guide across the
     corpus must read differently, and none may be the bare primary keyword
     repeated. Repetition of one exact-match anchor across many pages is a
     recognised spam signal, and it is the single most likely way this step
     does harm.
   - **Saturation cap - skip any post already carrying 5 links to sibling
     guides.** This is the rule that stops the whole scheme rotting over
     time. A genuinely hub-ish post is topically close to everything, so
     without a ceiling it gets picked build after build and slowly fills with
     internal links until it reads like a link farm - the exact
     over-optimisation that makes automated interlinking backfire. Count the
     existing root-relative links to other guides in each candidate file
     BEFORE choosing it; at 5 or more the post is full, and full is a
     permanent state, not a queue. Move to the next-closest post, and if
     every close post is full, edit fewer than 3 or none at all and say so.
     Fewer links into a corpus that reads naturally beats more links into one
     that does not.
   - **Never double-link.** Skip any post that already links to this guide.
     One link per post per target, ever.
   - **Hard cap: 3 files, one link each.** Not "at least" - at most. A run
     that wants to edit a fourth is wrong about relevance.
   - **Touch nothing else in those files.** No typo fixes, no reformatting,
     no frontmatter edits, no reordering. The diff for each edited post must
     be one line changed. Anything else makes the PR unreviewable and puts
     content the owner wrote at risk.
   - **Concurrency: rebase before you edit.** Another guide build may have a
     PR open against the same posts. Before editing, \`git fetch origin\` and
     rebase onto the latest default branch, then re-read each file you are
     about to touch from that state. If a file you want is already modified
     on an open \`seo/\` PR, skip it and pick the next-closest post - a merge
     conflict in someone's published content is a far worse outcome than one
     fewer back-link.
   - **Verify again after editing.** Re-run the site's build/verify command:
     the edited posts must still build and every link must resolve.`;
