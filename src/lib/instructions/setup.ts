// The one-time setup workflow: finds (or scaffolds) the site's content home,
// writes the repo's .dispatchseo/conventions.md (the site facts every other
// workflow reads), and personalizes the site profile the backlink playbook
// prefills from. Runs once when a project first connects, and again whenever
// the stack or positioning changes.

// Plain-English step summary for the dashboard's Instructions page.
export const SETUP_STEPS = [
  { title: "Inspect", plain: "Your Claude Code reads your repo: stack, build command, design tokens, existing content." },
  { title: "Content home", plain: "Finds where published content should live - or scaffolds a minimal blog as its own PR if the site has none. Never duplicates an existing one, and always public - never behind your login." },
  { title: "Record", plain: "Writes the site-facts file every other workflow adapts from - discovered, never assumed." },
  { title: "Mirror", plain: "Sends the same facts here, so this dashboard can show you what it found." },
  { title: "Profile", plain: "Describes your product in directory-ready copy and saves it for the backlink playbook." },
];

export const SETUP = `## Workflow: setup (one-time - find the content home, write the site facts, personalize the playbook)

Three jobs, in order. Do all three.

### Part 1 - find or create the content home

Published guides need somewhere to live. The owner answered onboarding's
"does the site have a blog or content section?" with: {{CONTENT_HINT}}

Treat that answer as a hint, not truth - owners misremember their own repos.

1. **Detect.** Inspect the repo for ANY existing content surface, whatever
   its name: markdown/MDX content directories, CMS configs, route folders
   matching /blog, /articles, /guides, /resources, /learn, /news, /posts,
   sitemap entries, RSS feeds.
2. **Reconcile - the repo wins:**
   - You found a content surface (even if the owner said there is none):
     use it. Say what you found and where you will publish.
   - The owner named a path but nothing is there: check the rest of the
     repo before concluding; if the repo genuinely has no content surface,
     say so and fall through to scaffolding.
   - Nothing found: scaffold a minimal content section in the site's OWN
     stack, as its own PR, separate from any other change: a content
     directory, a list page, a detail template, and sitemap coverage -
     reusing the site's existing layout, design tokens, and metadata
     patterns. Minimal and native: a folder and two templates, not a themed
     blog that fights the site's design.
     The detail template MUST include the reading rail the guide builder
     counts on (build-guide forbids in-article CTAs precisely because
     "rails/end-CTAs render automatically" from the template): a desktop
     sidebar - sticky, hidden on mobile - with an "On this page" ToC built
     from the article's H2s, plus a small product promo card (one-line
     pitch + link) beneath it, all in the site's own tokens. Without the
     rail, published guides under-deliver what the dashboard's template
     preview shows. Scroll-test the built page before opening the PR:
     the rail must stay pinned while the article scrolls past it - a rail
     that scrolls away with the page is a broken implementation, not a
     style choice (classic cause: an items-start grid collapsing the
     aside to content height, leaving its sticky child no room to pin).
     The list page must be presentable, not a bare link list: post cards
     with title, description, date, and reading time, a clear hover
     state, and a header that ties back to the product - it will carry
     20+ posts within months and is many visitors' first page.
     On an EXISTING content surface, leave its chrome alone - the owner's
     design wins; just record in conventions.md whether a ToC/CTA surface
     exists.
3. **HARD RULE - never create a second content system.** If any content
   surface exists under any name, extend it. Scaffold only when the repo
   genuinely has none, and state in the PR description which case applied
   ("found /resources, publishing there" or "no content surface found,
   scaffolded /blog").
4. **HARD RULE - the content home must be PUBLIC, never behind a login.**
   Many apps guard every route with an auth gate (a middleware.ts that
   redirects to /login, route-group guards, host rules). A blog inside
   that wall fails silently: the build passes, guides publish, and every
   page bounces visitors AND Googlebot to the login screen - zero
   indexing, zero traffic, and nobody notices until Search Console shows
   nothing weeks later. So, whether you found the content home or
   scaffolded it:
   - If the repo has any auth gate, explicitly exclude the content routes
     from it (middleware matcher, public route list - whatever the repo's
     mechanism is).
   - Verify like a logged-out stranger: build and serve the site, request
     a content page with NO cookies (curl is enough) - it must answer 200
     with the article, not a redirect - and confirm the sitemap lists it.
   - A product that is entirely a login-walled dashboard is fine: the
     content home simply becomes the site's first public surface. Say so
     in the PR description.
5. If you scaffolded, downstream workflows can only publish once that PR
   merges - tell the owner merging it is what makes the site publishable.
6. Call \`mark_install_step\` with step=\`content_home\` (best-effort - a
   missing tool or an error never stops setup; it only feeds the owner's
   progress checklist).

### Part 2 - write \`.dispatchseo/conventions.md\`

Inspect THIS repo and write the site facts file every other workflow depends
on. Discover, never assume: read the actual files, run the actual build
command once to confirm it. The file must contain these sections:

1. **Product** - what {{SITE_NAME}} is, who it serves, and the product-surface
   files a researcher should read fresh each run (the docs/config/content
   files that describe what the product does). List concrete paths.
2. **Stack & build** - framework and content system (e.g. Next.js + MDX,
   Astro, Hugo), package manager, the exact build/verify command, and any
   CI validators that gate merges.
3. **Guides** - where article files live, the metadata/frontmatter contract
   (required + optional fields, length limits), slug conventions, what the
   platform renders automatically (sitemap, RSS, OG images, related posts,
   JSON-LD), which structured data the stack emits (e.g. FAQPage from
   frontmatter), internal-link style, and 2-3 exemplar posts to read before
   drafting.
4. **Tools** - where interactive tool pages live, the registry/wiring steps
   to ship one, the reference implementation to read completely, and what the
   page template renders automatically.
5. **Design system** - where the theme tokens live (e.g. the globals.css
   @theme block), the token names, card/button/label idioms, the icon
   language, where brand logomarks live, and 2-3 exemplar visual components.
6. **Voice & writing rules** - author attribution, first-person or not,
   punctuation rules (e.g. dash bans), the humanizer skill path if the repo
   carries one, and anything else that makes copy read like the owner wrote
   it.
7. **Analytics** - the tracking helper and event-naming convention, if any.

Keep it factual and terse - it is a reference card, not prose. Every claim
must come from a file you actually read (cite the path inline).

Then mirror the same facts to the backend so the dashboard can show them:
call \`set_conventions\` with the complete structured facts -
\`product_summary\`, \`stack\`, \`package_manager\`, \`build_command\`,
\`guides_dir\`, \`tools_wiring\`, \`theme_tokens\` (name + resolved color
value where the token is a color, so the dashboard renders real swatches),
\`fonts\`, \`voice_rules\`, \`exemplar_guides\`, \`exemplar_visuals\`,
\`tool_reference\`, \`analytics\`, \`notes\`. Full replace: send everything
each time. Re-run this mirror whenever the conventions file changes.

Then call \`mark_install_step\` with step=\`site_facts\` (best-effort, same
rule as the content_home stamp).

### Part 3 - personalize the site profile

Fills the profile the dashboard's Playbook tab personalizes from - every
directory submission's prefilled copy and every browser command uses it.

1. Read the product surface fresh (the files you just listed in Part 1).
   Enough to describe the product accurately - do not draft from memory.
2. Write the profile, respecting the length contracts (directories enforce
   them): \`name\`; \`url\`; \`tagline\` <= 60 chars; \`short_description\`
   <= 160 chars; \`long_description\` 300-600 chars; \`categories\` (1-5 real
   directory categories, e.g. "Developer Tools", "AI", "Productivity");
   \`tags\` (1-10, lowercase-kebab).
3. Copy quality bar: plain English, first-person-free, concrete (what the
   buyer gets), zero hype words ("revolutionary", "game-changing" get
   listings rejected). Follow the writing rules from Part 1.
4. Call \`set_site_profile\` with the values. Show the saved profile back as
   a table.
5. Tell the user: the Playbook tab is now personalized; open it and work top
   to bottom - each item has the copy prefilled and a browser command that
   fills the form.
`;
