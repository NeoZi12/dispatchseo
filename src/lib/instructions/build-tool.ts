// The tool-builder workflow: TEMPLATE -> GATE -> THEME -> PLAN -> BUILD ->
// HUMANIZER -> VERIFY -> PR. The invariant page shell, the archetype table,
// and the value bar are universal; the registry wiring and reference
// implementation come from the repo's conventions file.

// Plain-English step summary for the dashboard's Instructions page. Edit it
// together with the markdown below - they describe the same pipeline.
export const BUILD_TOOL_STEPS = [
  { title: "Pick", plain: "Only builds tool ideas you already greenlit on the dashboard." },
  { title: "Study", plain: "Reads your best existing tool end to end as the quality reference." },
  { title: "Gate", plain: "Checks page 1 for competing tools. If ours can't clearly win, it doesn't build." },
  { title: "Theme", plain: "Reads your site's actual design system fresh - your colors, fonts, and spacing only." },
  { title: "Plan", plain: "Designs the tool on paper first: who searches this, what they walk away with, the real logic inside." },
  { title: "Build", plain: "A working, client-side widget - a fake form dressed as a tool fails the bar and gets redesigned." },
  { title: "Humanize", plain: "All the page copy gets rewritten until it reads like you, not a template." },
  { title: "Verify + PR", plain: "Your build must pass and every interaction gets traced, then it opens a PR for review." },
];

export const BUILD_TOOL = `## Workflow: build-tool (tools ONLY)

The tool pipeline is TEMPLATE -> GATE -> THEME -> PLAN -> BUILD ->
HUMANIZER -> VERIFY -> PR. Tools are approve-idea-first: this workflow only
ever builds a suggestion the user already greenlit on the dashboard. It must
never build guides.

Two ideas govern every step. The PAGE SHELL is invariant: large centered
title, one value line, the tool itself, CTA, description copy, FAQ - every
tool page reads the same way. The TOOL INSIDE is bespoke: designed from this
keyword's search intent with its own execution plan and real domain logic,
styled in the host site's own theme. Copying the reference widget and
swapping words and buttons is a build failure, not a shortcut.

{{OWNER_PREFS_TOOL}}

1. \`get_suggestions(status="approved", type="tool")\` - the list comes back
   in BUILD ORDER (the owner's dashboard queue), so **take the FIRST item**.
   None -> say "queue empty" and stop cleanly (exit without changes in
   headless runs). An idea with source "manual" was typed by the owner and
   may be just a title - derive the search intent and functionality from the
   keyword and the PLAN step as usual; a thin brief is not a reason to skip.
2. \`update_suggestion(id, status="in_progress")\`.
3. **TEMPLATE.** The living template is the reference tool named in the
   conventions file. Before writing anything, read COMPLETELY: its registry
   entry (field by field), its widget component, and the page template that
   renders the shell. The funnel is LOCKED: hero (tool name as a LARGE
   CENTERED title + one value line stating what the user walks away with) ->
   the widget itself (the product, immediately usable, no scroll hunting) ->
   CTA to the paid product -> description copy -> FAQ. The build's job is a
   registry entry and a widget that match the reference's quality bar.
   **The widget's interaction pattern is chosen BY ARCHETYPE - classify
   first, then apply that archetype's locked pattern.** Classify from the
   suggestion's spec (the researcher stamps an \`archetype\` - confirm it, do
   not blindly trust it):
   - **Configurator / wizard** - 3+ decisions that build an artifact.
     Pattern: stepped wizard - ONE decision per screen, single-select
     auto-advances on click, multi-select keeps an explicit Next, Back always
     preserves answers, a thin progress bar as the only chrome, focus moves
     to the new screen's heading on step change, an escape hatch per question
     ("I don't know" / skip still yields a good result), then a results
     screen as the payoff (output + copy/download actions). NEVER a long
     scrolling form of stacked sections.
   - **Calculator / converter** - input(s) -> computed output with no real
     branching. Pattern: one focused card, result computed LIVE as the user
     types - zero steps, no submit button, the output pane always visible.
   - **Analyzer / checker** - paste something in, get findings back.
     Pattern: one large paste box + a single Analyze action -> a findings
     view (issues listed with severity and a fix each); analysis stays
     client-side.
   - **Library / directory** - a browsable collection. Pattern: grid +
     filter chips + search.
   The conventions file names the shipped reference per archetype where one
   exists; once a new archetype's first implementation merges, THAT becomes
   the living reference to read. If a tool genuinely fits no archetype, pick
   the nearest pattern and STATE THE DEVIATION and why in the PR body - a
   mismatch must be visible, never silent.
4. **THIN-CONTENT GATE.** Re-pull the live SERP top 5 for the primary
   keyword. The planned tool must be the definitive INTERACTIVE answer on
   page 1 - if a competitor tool exists, list concretely what ours does
   better (polish, completeness, presets, zero-login). If it cannot clearly
   win, DO NOT BUILD: \`update_suggestion(id, status="pending")\`, state
   why, stop.
5. **THEME (know the host site before styling anything).** The tool must
   look native to the site it ships on, and the site's design system is read
   fresh each build - never assumed from memory or carried over from another
   site:
   - Read the theme-token source the conventions file names: every token
     name, color, font variable, and radius. These are the ONLY colors and
     fonts the widget may use.
   - Read the site's landing page and one live tool page end to end for the
     design language: heading scale, spacing rhythm, card idiom, button
     shapes, microtype patterns, how accents are used sparingly.
   - Skim one existing widget component for the code idiom (state shape,
     button/copy-action patterns, focus handling).
   Write a short THEME BRIEF (5-8 lines: tokens, type scale, card and button
   idiom, label style, anything unusual) and keep every visual decision in
   the widget traceable to it. Nothing from another site's palette or idiom
   ever leaks across sites.
6. **EXECUTION PLAN (mandatory - design the tool, never re-skin the
   template).** The template gives every tool the same shell; this step is
   where the actual tool gets designed, in writing, BEFORE any code:
   - **Search intent.** Who types this keyword, what job they are trying to
     finish, and what the perfect tool hands them at the end. Specific,
     never generic.
   - **Core transformation.** Input -> output in one line. The output must
     be something the user takes away and uses: a file, a number, a verdict
     with fixes, a filtered pick. If the output restates the input or barely
     changes across inputs, the tool is fake - redesign now.
   - **Domain logic inventory.** The real knowledge the widget encodes:
     validation rules, mappings, presets, reference data, edge-case
     handling. Source every factual item from current official docs or the
     product surface (fetch them - never from memory, respecting the
     trusted-sources rule), and test every command or config the tool emits.
     This inventory is what makes the tool worth existing.
   - **Interaction design.** Apply the confirmed archetype's locked pattern
     to THIS tool's actual decisions: the exact steps or inputs, what
     auto-advances, what the results screen shows, the escape hatches.
   - **States and edge cases.** Empty input, invalid input, extreme values,
     copy/download actions, mobile width.
   - **Win statement.** What this tool does that page 1 cannot (ties back to
     the gate verdict).
   Then hold the plan against the VALUE BAR - all four must hold, or do not
   build:
   (a) the widget does real work (computes, generates, validates, analyzes,
   filters) that a paragraph of prose could not replace;
   (b) meaningfully different inputs produce meaningfully different outputs;
   (c) the domain logic inventory has sourced, tested substance;
   (d) the owner would honestly bookmark this if a stranger shipped it.
   Failing the bar means a redesign loop, not a build ticket. If after
   rework the keyword honestly cannot support a real tool, do not fake one:
   \`update_suggestion(id, status="pending")\`, state why, stop.
   Named anti-patterns, all value-bar failures: the reference widget with
   relabeled steps and buttons; a wizard whose every path ends in
   near-identical canned output; a "checker" that trivially pattern-matches
   and calls it analysis; static content wearing an input box as decoration.
7. **BUILD.** Implement the plan per the site's tool-shipping steps in the
   conventions file (registry entry, widget component, wiring). The widget
   must be purely client-side (no backend calls), resilient (no interaction
   may throw), and its primary action obvious. Universal microcopy rule:
   **plain English, meaning first** - every option label leads with what it
   does FOR the user; the exact command or mechanism goes in parentheses or
   the hint. The bar: a beginner understands every option without googling,
   AND a power user still sees exactly what gets written. Analytics only for
   real interactive milestones, following the conventions file's
   event-naming rule.
8. **HUMANIZER (mandatory).** Apply the humanizer pass to ALL registry copy:
   title, h1, meta description, summary, every description paragraph, every
   FAQ answer. The copy is the ranking surface - it must read like the owner
   wrote it. **Information gain:** the description and FAQ must carry at least
   one concrete, tool-specific fact or worked example - a real value the tool
   computes on a named input, a specific supported case, a tested edge - never
   generic "this free tool helps you..." filler that would fit any tool. That
   specificity is what ranks the page and earns AI-answer citations.
   Registry description copy weaves in 2-3 contextual internal
   links (at least one sibling tool, one related guide) with natural
   keyword-bearing anchors, root-relative only - and never inside FAQ
   answers if those mirror into structured data as plain text.
9. **VERIFY.** The site's build command must pass. Trace every widget
   interaction path in the code once more - a broken interaction blocks the
   merge. Then check the composed page against the locked funnel: large
   centered title, value line, widget, CTA, description, FAQ, all present in
   that order, and no class or color in the widget outside the THEME brief.
10. **PR - never main.** Branch \`seo/<slug>\`, commit, push, then
    \`gh pr create --label seo --label seo-tool --title "..." --body "..."\`
    (create missing labels). Body includes: target keyword, volume/KD, the
    conversion rationale, gate verdict, the execution plan (search intent,
    core transformation, domain logic inventory, win statement), and what a
    validator should exercise (the widget's primary flow).
11. \`update_suggestion(id, status="done", result_pr_url=<pr url>)\` and
    \`log_page(url="https://{{DOMAIN}}/<path>", ...)\`.
12. Report: what was built, the PR link, the gate verdict, the one-line core
    transformation, and what to check on the preview.
`;
