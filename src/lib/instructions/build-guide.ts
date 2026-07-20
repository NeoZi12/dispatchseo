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
  { title: "Draft", plain: "Writes from current official docs - never from memory - and tests every command it includes." },
  { title: "Visuals", plain: "Builds 2-3 custom graphics about this exact topic, in your site's own colors and components - plus an AI-generated cover image for the blog card, when the image generator is connected." },
  { title: "Humanize", plain: "Rewrites anything that reads AI-generated until it sounds like you wrote it." },
  { title: "Verify", plain: "Runs your site's build to prove nothing breaks - then checks the new guide against your whole back catalogue and rewrites it if it reads like a repeat, so your posts never converge into one template." },
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
1. \`get_suggestions(status="approved", type="guide")\` - the list comes
   back in BUILD ORDER: the owner's queue exactly as their dashboard shows
   it (front-placed ideas first - trend approvals and the owner's own
   "do this one next" adds land there - then oldest first). **Take the
   FIRST item.** Never re-rank or second-guess the order; it is the owner's
   explicit call.
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
2. \`update_suggestion(id, status="in_progress")\`.
3. **TEMPLATE.** Before drafting, read the living template: 2 recent exemplar
   posts from the guides directory (pick ones closest in shape to this topic)
   plus whatever content playbook the conventions file names. Exemplars teach
   the CONVENTIONS and voice - they are NOT skeletons to clone: the new draft
   must not mirror an exemplar's section order, intro pattern, or
   transitions (see structural variation below). The generated article must
   be indistinguishable in structure and voice from a hand-written post.
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
   the repo, the current official docs, the MCP, and Claude Code itself - and
   nothing else. NEVER install or run a third-party or competitor tool (a
   rival CLI, a paid API you have no key for, anything needing a browser or a
   login) to manufacture an asset: that is what breaks the morning build, and
   faking the number instead of running it is worse. So (a) and (b) mean the
   stack you ARE and the commands you CAN run here - this site's own repo,
   Claude Code itself - never a competitor's tool. For an X-vs-Y guide where
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
6. **DRAFT.** For any factual topic (a feature, API, version, command), FETCH
   THE CURRENT OFFICIAL DOCS FIRST and draft from that - never from memory,
   which may be stale. Respect the trusted-sources security rule. Test every
   command you include THAT THIS RUN CAN RUN (the site's own stack, Claude
   Code, standard shell) and use its real output. For a command that belongs
   to a tool NOT installed here - a competitor's CLI in a comparison, a paid
   API with no key - do not try to install it and never invent its output:
   verify the exact syntax against that tool's current official docs and
   present it as documented, not as run. Then write the full guide per the
   site's contract in the conventions file. Universal body rules:
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
     (read the 2-3 newest published guides and rewrite anything in this
     draft that echoes them - intro sentence pattern, transitions, conclusion
     shape); surface the step-5 information-gain asset where it does the most
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
   **COVER IMAGE (when the repo supports it).** If the repo has
   \`scripts/generate-cover.mjs\` AND the \`CLOUDFLARE_ACCOUNT_ID\` /
   \`CLOUDFLARE_API_TOKEN\` env vars are set, every guide also ships with an
   AI-generated cover: run the script with the guide's slug and a --subject
   describing the topic as a VISUAL SCENE (concrete objects and actions, not
   the keyword - "a glowing server rack exchanging labeled message packets
   with a small robot" beats "mcp server"). Keep it MINIMAL and CLEAN -
   one simple subject, calm space around it, never mascots, characters, or
   busy scenes (the script's negative prompt enforces this; do not fight
   it). Make it relevant: for a topic tied to a recognizable product, pass
   \`--icon <name>\` (e.g. \`--icon github\`) so the script composites the
   EXACT official mark onto a minimal generated backdrop - never ask the
   model to draw a logo, it mangles them. If the needed mark is missing
   from the script's ICONS map, add its official SVG path in the same PR.
   For concept topics, one simple object does it: a glass cube assembling
   for "build", a row of small cubes for "examples", a gauge for rankings.
   A reader should guess the post's topic from the image alone. The script
   owns the base art direction (dark, minimal, no text) so covers stay one
   family - put the scene in the subject, never restate style there.
   VARIETY IS MANDATORY:
   the script takes \`--style hero|spread|flow|burst\` and
   \`--hue violet|cyan|magenta|amber\` - look at the last 2 published posts'
   covers (\`public/blog/covers/\`, newest by the posts' dates) and pass a
   style AND hue that differ from both, same anti-sameness rule as article
   shapes. Commit the generated file under \`public/blog/covers/\` and set
   frontmatter
   \`cover: /blog/covers/<slug>.webp\`. If the script or env vars are
   absent, skip WITHOUT failing the run and note "no cover - generator not
   configured" in the report; the card falls back to its generated plate.
   Never hotlink an external image or fabricate a cover path.
8. **HUMANIZER (mandatory, not optional).** Apply the humanizer pass the
   conventions file points at (or its principles if the repo carries no
   skill copy): kill AI tells, tighten, match the first-person practitioner
   voice of the exemplar posts. This is about genuinely good human-quality
   writing, not evading detectors. Then re-run the ANTI-RHYME check, and
   re-check the FAQ mirror after edits.
9. **VERIFY.** The site's build/verify command (from the conventions file)
   must pass - this also compiles the visual components. Sanity-check
   internal links resolve to real slugs and the FAQ mirror holds.
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
10. **PR - never main.** Branch \`seo/<slug>\` -> commit -> push ->
   \`gh pr create --label seo --title "..." --body "..."\` (create the
   \`seo\` label if missing). Body includes: target keyword, volume/KD, the
   suggestion rationale, gate verdict (what page 1 lacks that this draft
   has), and a note that the deploy preview link is the review surface.
   **If \`gh pr create\` fails, that is a FAILED run - never exit green.**
   The usual cause is the repo setting "Allow GitHub Actions to create and
   approve pull requests" being off (the default on new repos). Revert the
   suggestion with \`update_suggestion(id, status="approved")\` so the next
   run retries it, print the exact error plus that setting name in the run
   report, and exit non-zero (e.g. \`exit 1\` from bash) so the workflow
   goes red and the owner gets GitHub's failure email. A pushed branch
   with no PR and a green run is the worst outcome - it strands silently.
11. \`update_suggestion(id, status="done", result_pr_url=<pr url>)\` and
    \`log_page(url="https://{{DOMAIN}}/<path>", ...)\`.
12. Report: what was built, the PR link, the gate verdict, the archetype and
    information-gain asset chosen, and what to check on the preview.
`;
