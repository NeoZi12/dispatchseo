// The product changelog - what shipped in DispatchSEO itself, in the owner's
// language. Same serve-content-from-the-backend pattern as the agent
// instructions (src/lib/instructions/) and the backlink playbook: content IS
// state, it lives here, and every surface (the dashboard banner, /changelog,
// the get_changelog MCP tool, the Discord announcement) reads this one list.
//
// WRITING A NOTE IS NOT SHIPPING A RELEASE. Those were the same act until
// versions landed, and it showed: on 2026-07-31 six separate releases went out
// in one day, which is six dashboard banners and six Discord posts for what was
// really one afternoon's work. Announcements are only worth reading if they're
// rare. So:
//
//   1. During the day, a user-visible change appends one line to UNRELEASED
//      below. Costs nothing, gets written while the work is fresh, and is
//      invisible everywhere - no banner, not on /changelog, not in Discord.
//   2. Cutting a release is a separate, deliberate act: the staged lines move
//      into a new entry at the head of CHANGELOG with a version, a title and a
//      summary, and UNRELEASED goes back to empty. THAT is what announces -
//      on /changelog, over get_changelog, and in Discord.
//   3. The dashboard banner is a THIRD, rarer act: a release only interrupts
//      owners' dashboards if it sets `announce: true`. Most releases don't -
//      near-daily banners train people to dismiss them unread. Reserve it for
//      a release the owner should actually stop and look at (a new control on
//      their screen, something they must act on).
//
// What earns a line at all: if the owner wouldn't notice it without being told,
// it doesn't get one. If they'd notice but wouldn't do anything differently,
// it's a bullet inside a release, never a release's title. Write for the owner,
// not the commit log - name the thing they'd notice, not the module that
// changed.
//
// `version` is the anchor id, the value stored in the "seen" cookie, and the
// deep link in every Discord post ever made, so it must be unique and must
// never be reused, renumbered or reordered - not even to tidy up. Those posts
// are permanent and public; an edited version number turns them into dead
// links.

export type ChangeKind = "new" | "improved" | "fixed";

export type ChangelogEntry = {
  /**
   * Unique, never reused: `MAJOR.MINOR.PATCH`.
   *   - patch (`1.0.1`) - fixes and small improvements. Nothing new to try.
   *   - minor (`1.1.0`) - anything new the owner can see or use. Most releases.
   *   - major (`2.0.0`) - an overhaul, or something a self-hoster must ACT on
   *     (a migration to run, a pipeline to reinstall). Reserve it; a 2.0 twice
   *     a month means nothing.
   *
   * Entries below 1.0.0 use the older `YYYY-MM-DD[.N]` scheme from before
   * versioning. They keep those ids forever - see the note above on why.
   */
  version: string;
  /** ISO date the release went out. */
  date: string;
  /** Headline - a few words, sentence case. */
  title: string;
  /** One line for the banner: what changed, in the owner's terms. */
  summary: string;
  /**
   * Opt-in: show the dashboard "DispatchSEO has been updated" banner for this
   * release. Releases ship near-daily, so the banner is reserved for the rare
   * release an owner should actually stop and read about (a new control on
   * their screen, something they must act on). Omitted or false, the release
   * still appears on /changelog, in get_changelog, and in the Discord post -
   * it just doesn't interrupt anyone's dashboard.
   */
  announce?: boolean;
  changes: { kind: ChangeKind; text: string }[];
};

// Shipped, but not yet announced. Append here as the work lands; empty this
// into a new CHANGELOG entry when it's time to cut a release. Nothing reads
// this list - it exists so that writing the note down doesn't ping anyone.
export const UNRELEASED: { kind: ChangeKind; text: string }[] = [
  {
    kind: "new",
    text:
      "Run Coolify on your server? DispatchSEO now deploys straight from its UI: point a " +
      "resource at the repo's new docker/coolify/docker-compose.yml template and Coolify " +
      "generates the secrets and puts the dashboard on your domain with HTTPS - no SSH, no " +
      ".env file. The docs' new \"A Coolify server\" page walks it click by click.",
  },
  {
    kind: "improved",
    text:
      "GitHub stops emailing you \"Run failed\" for the SEO workflows. A failed run still " +
      "shows up on your dashboard and in the run log - that has always been the real alerting " +
      "surface - but the scheduled workflows in your repo now finish green as far as GitHub " +
      "is concerned, so a broken overnight build no longer lands in your inbox once per job " +
      "per day. Rolls out to connected repos with the next pipeline update.",
  },
  {
    kind: "improved",
    text:
      "New prices. Starter is $29 a month, or $20 a month when you pay for the year ($240); " +
      "Growth is $59 / $40 for 3 sites and Scale $99 / $69 for 5 sites. Your coding agent does the writing on your " +
      "own plan, so there is no token bill for us to pass on - which is what lets these sit " +
      "well under every other tool that opens pull requests. The founding offer is retired.",
  },
  {
    kind: "improved",
    text:
      "The dashboard interrupts you a lot less. The red panel and the alert emails now fire " +
      "only for problems that are real: a failure that happened twice in a row, a job that " +
      "missed a whole schedule window, or something urgent like dead credentials or a broken " +
      "deploy. A one-off blip - a GitHub hiccup, a vendor timeout - stays in the run log, " +
      "where your agent can still see it, and usually fixes itself on the next run without " +
      "painting anything red. \"Pipeline update available\" is one quiet line now instead of " +
      "a colored box.",
  },
  {
    kind: "new",
    text:
      "Signing up now checks your site and your AI before you pay, so nobody gets charged for a " +
      "setup that can't finish. It is two quick screens: what kind of site (WordPress, or built " +
      "with code on GitHub), then which AI will write - a chat app or a coding agent - each with " +
      "its own mark so you can pick by sight.",
  },
  {
    kind: "new",
    text:
      "You can now connect a WordPress site and publish straight to it. Connect it once " +
      "from Settings with an application password and finished articles are posted to your " +
      "site on their own: cover image uploaded, links to your existing pages inserted, meta " +
      "description and FAQ markup in place. No plugin, nothing to install, and no repo " +
      "needed. Self-hosted WordPress only for now.",
  },
  {
    kind: "new",
    text:
      "You can connect the ordinary Claude app at claude.ai, not just a coding agent. " +
      "A new Connect your AI screen has the connector address and the exact steps; your " +
      "Claude does the research and the writing on your own subscription, and hands the " +
      "article to us to check, finish and publish.",
  },
  {
    kind: "new",
    text:
      "A new Drafts screen shows every article your AI has handed in and what happened " +
      "to it: what passed, what was sent back and why, what is waiting to publish, and " +
      "what is live. You can publish one early or throw it away from there.",
  },
  {
    kind: "improved",
    text:
      "Setup adapts to you. It asks where finished articles should go (WordPress, a " +
      "GitHub repo, or neither yet) and which AI will write (the Claude app, Claude Code, " +
      "Codex or Cursor), then shows only the steps your answers need: WordPress owners " +
      "connect WordPress instead of GitHub, Claude-app owners paste one connector address " +
      "instead of an agent token, and a green light tells you the moment your Claude has " +
      "reached us.",
  },
  {
    kind: "new",
    text:
      "Articles written with the Claude app can now go to a code-built site too. When " +
      "your site lives in a GitHub repo, we commit the finished article and open the pull " +
      "request ourselves - merged automatically in automatic mode - so a coding agent is " +
      "no longer required on either kind of site. The Drafts screen links each pull " +
      "request and shows when it is merged and live.",
  },
  {
    kind: "improved",
    text:
      "Claude-app sites now get a \"Your next step\" list on Home that ticks itself off: connect, " +
      "let Claude ask its three questions, ask for ideas, approve them on the Queue screen, ask it " +
      "to write, watch Drafts - each step with the exact sentence to paste. Home also stopped " +
      "calling a Claude-app site \"Claude Code - setting up\".",
  },
];

// Newest first. The head of this list is what the banner announces.
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.5.0",
    date: "2026-08-18",
    title: "Your site's own Google, its real launch date - and self-host stops getting stuck",
    summary:
      "Rank checks and keyword research now run in your site's own country and language " +
      "instead of always asking American Google, DispatchSEO works out when your site really " +
      "launched instead of assuming it was born at signup, and self-host can finally change " +
      "which repo a project publishes to. Plus a Cursor audit, honest dashboard states while " +
      "you're still setting up, and a plan that ends now really ends.",
    announce: true,
    changes: [
      {
        kind: "new",
        text:
          "DispatchSEO now works out when your site actually launched instead of assuming " +
          "it was born the day you signed up. It checks Search Console's history and the " +
          "Wayback Machine's first capture of your domain - automatically once Search " +
          "Console data starts flowing, or on demand with the new Detect button next to " +
          "the launch date in Settings (and the detect_site_launch tool). The date only " +
          "ever moves backward, and your own corrections always win. This matters because " +
          "the launch date drives the Journey timeline, the publishing pace, and how " +
          "ambitious keyword research is allowed to be.",
      },
      {
        kind: "new",
        text:
          "Your site can now tell DispatchSEO which Google it lives in. A new Search market " +
          "setting (Settings > Project, or the set_market tool) points rank checks and keyword " +
          "research at your real country and language - 14 markets from Israel to Brazil - so a " +
          "fully Hebrew site researches Hebrew keywords in Israeli results instead of American " +
          "English ones. Keyword research used to query the US market no matter what; that's " +
          "fixed as part of this.",
      },
      {
        kind: "improved",
        text:
          "The GitHub-repo requirement now greets you before a card does. The landing hero " +
          "says it under the domain box, a new FAQ answers the WordPress question head-on, " +
          "and the signup notice starts open instead of waiting behind a click - so a " +
          "WordPress site owner learns the answer on the way in, not at the Connect GitHub " +
          "screen with a trial already ticking.",
      },
      {
        kind: "improved",
        text:
          "The dashboard now tells you when it's waiting on YOU. While the install pull " +
          "request sits unmerged, a banner names it and links straight to it - nothing can " +
          "build until that PR lands on the default branch, and the dashboard used to look " +
          "finished anyway. And the queue's \"building now\" badge stopped being an " +
          "unconditional claim: it shows how long the build has been running, and past the " +
          "point where the automatic recovery will re-queue it, it says \"build stalled - " +
          "will retry\" instead of asserting live work it can't prove.",
      },
      {
        kind: "improved",
        text:
          "Adding a second site on self-host no longer ends in a silent dashboard. The " +
          "\"setting up\" banner - previously cloud-only - now shows on self-host too, with " +
          "honest wording: it tells you the pipeline isn't installed, points at the install " +
          "command, follows the install live, and clears itself once the first data lands.",
      },
      {
        kind: "improved",
        text:
          "The pixel dispatcher now wears lavender when Cursor runs your project, instead " +
          "of the old steel blue. Claude keeps its clay, Codex its off-white.",
      },
      {
        kind: "improved",
        text:
          "When a Claude account itself is the problem (a usage limit, or Anthropic blocking " +
          "subscription access), the weekly scans now say so on the banner - naming the fix, " +
          "including switching agent or moving to API billing - instead of a bare link to a " +
          "workflow log.",
      },
      {
        kind: "improved",
        text:
          "One broken credential no longer emails you once per workflow it takes down - after " +
          "the first heads-up, the same cause waits three days before reminding you.",
      },
      {
        kind: "fixed",
        text:
          "A plan that ends now really ends. Rank tracking and the builders already stopped " +
          "when a plan lapsed, but the site's own GitHub workflows kept running on their own " +
          "schedule - so a finished trial could still build and merge a guide every day, and " +
          "kept sending failure alerts about a pipeline nobody was paying for. Those " +
          "workflows now stand down on their next run, and the alerts stop with them. " +
          "Re-subscribe and everything picks up again by itself.",
      },
      {
        kind: "fixed",
        text:
          "Self-host can finally change which GitHub repo a project publishes to. The repo " +
          "used to be settable exactly once, at creation - connect the wrong one (or disconnect " +
          "to fix it) and the project was stranded. Settings now has an editable repo field, " +
          "set_github_repo works on self-host too, and the install playbook walks your agent " +
          "through reconnecting instead of stopping at a dead end.",
      },
      {
        kind: "fixed",
        text:
          "On free (GSC-only) projects, the purple \"Running your first ranking checks\" banner " +
          "used to stay up forever - it was waiting for a rank check that only projects with " +
          "DataForSEO credentials ever get. It now closes once your first ideas are queued, and " +
          "no longer promises rankings that aren't configured.",
      },
      {
        kind: "fixed",
        text:
          "A full engineering audit of Cursor support caught and fixed two builder bugs " +
          "before any customer hit them: the step that writes Cursor's MCP credentials " +
          "was silently doing nothing (runs only worked because Cursor happens to resolve " +
          "env placeholders itself), and a quoting slip would have crashed the failure " +
          "classifier on Cursor daily and tool builds. Every shipped workflow script is " +
          "now parsed by bash as a release gate, Cursor gets the same generous timeouts " +
          "on every workflow, the self-host builder learned the two measured plan-limit " +
          "messages, and a dozen docs pages that still described two agents now describe " +
          "three.",
      },
    ],
  },
  {
    version: "1.2.0",
    date: "2026-08-05",
    title: "Cursor joins the lineup - and your pages get maintained, not just published",
    summary:
      "Cursor is now a full coding agent here, overnight builds included, alongside Claude " +
      "Code and Codex. Published guides sitting just off page 1 get refreshed automatically, " +
      "the dispatcher watches your backlinks and names the one link move worth today, every " +
      "guide ships with its own cover art, and Claude Code projects can build on an Anthropic " +
      "API key when a subscription won't do.",
    changes: [
      {
        kind: "new",
        text:
          "Cursor is now a supported agent, end to end. Pick it on Settings and it does everything " +
          "Claude Code and Codex do here: connect in one paste and get all 61 tools in both the " +
          "editor and the CLI, or let it run the overnight builds and wake up to a pull request. " +
          "The connect paste merges into any MCP servers you already have rather than replacing " +
          "them. One thing worth knowing before you switch: the overnight builds run on a server " +
          "that can't open a browser to log you in, so they need a Cursor API key - any plan mints " +
          "one at cursor.com/dashboard/api, and builds draw on your plan's included usage. " +
          "Full walkthrough at /docs/install-cursor.",
      },
      {
        kind: "new",
        text:
          "Your pages get maintained now, not just published. Every night the backend looks for " +
          "published guides sitting at position 5-20 for their own keyword - close enough that a " +
          "refresh beats writing something new - and queues an 'Update existing page' idea (auto-" +
          "approved on Auto projects, your call on Semi). The builder then refreshes that page in " +
          "its normal daily slot: closes the gaps against the current page 1, re-verifies stale " +
          "facts against fresh docs, sharpens the title for clicks - same URL, same PR review flow. " +
          "At most two refreshes in flight, and a refreshed page rests 45 days before it can be " +
          "flagged again.",
      },
      {
        kind: "new",
        text:
          "The dispatcher now watches your backlinks, not just your pages. Referring domains get a " +
          "history (weekly snapshots), so the briefing can tell you the one link move worth ten " +
          "minutes today - a specific free listing from the playbook, raised only while the profile " +
          "is thin or stalled, silent while it's healthy. The weekly strip counts new referring " +
          "domains, the journey gains a 'First 5 referring domains' milestone, and every first-ever " +
          "moment now comes with its real base rate - a first top-10 ranking tells you fewer than 2 " +
          "in 100 pages get there in a year, so you know it's a win, not a checkbox. Agents get the " +
          "same read over MCP: get_briefing carries the day's move, get_next_actions a backlink_move.",
      },
      {
        kind: "new",
        text:
          "Claude Code projects can now build on an Anthropic API key: add an ANTHROPIC_API_KEY " +
          "secret to your site repo and the builders use it whenever no subscription token is set. " +
          "This is the way out when Anthropic refuses your subscription for Claude Code outright " +
          "(their oauth_org_not_allowed flag) - a state a freshly minted token cannot clear, which " +
          "is also why the health-check alerts now say what actually fixes it instead of telling " +
          "you to mint a new token. While they were at it, the alerts stopped going red over a " +
          "usage limit - a limited account is a working account, and builds already wait it out.",
      },
      {
        kind: "new",
        text:
          "Every guide now ships with its own cover image, drawn by your agent as line art about that " +
          "post's actual subject - so your blog index stops looking like a wall of identical cards. " +
          "No image model, no extra bill. It's on by default; the cover block on the Instructions " +
          "page turns it off for good if you'd rather your own cards.",
      },
      {
        kind: "new",
        text:
          "Once your first page is live, Home shows one quiet line asking for a GitHub star. It only " +
          "appears after the pipeline has actually published something, and starring or dismissing it " +
          "makes it gone for good - it never asks twice.",
      },
      {
        kind: "new",
        text:
          "Analytics now ask before they run. On your first visit one quiet bar offers to accept or " +
          "decline product analytics and session recording - decline and none of it loads, and " +
          "nothing else about the product changes.",
      },
      {
        kind: "improved",
        text:
          "The privacy policy and terms of service have been rewritten, and there is now a " +
          "subprocessor list and a data processing agreement you can hand to a procurement team. " +
          "The privacy policy names every vendor that touches your data, says how long each thing is " +
          "kept, and describes the delete-account button that was already in Settings.",
      },
      {
        kind: "improved",
        text:
          "A security pass tightened a handful of things across the product. Password reset links " +
          "now have to be the thing that opens the reset form - being signed in is no longer enough " +
          "to change your password. The checks that fetch your own published pages refuse to follow " +
          "a redirect off your domain, and the domain you type when adding a site can no longer " +
          "point at an internal address. Search Console verification stops guessing on hosted " +
          "accounts, where your own Google connection is the only thing that answers it.",
      },
      {
        kind: "fixed",
        text:
          "The Search Console refresh stopped keeping up on sites with a few pages waiting to be " +
          "indexed: it checked them one at a time and eventually ran out of time mid-run, which took " +
          "your fresh Search Console numbers down with it - silently, because the run died before it " +
          "could report itself broken. It now checks several pages at once and has far more room to " +
          "finish, and if it ever does run long you'll hear about it.",
      },
      {
        kind: "fixed",
        text:
          "A few dashboard messages assumed Claude Code even when your project runs Codex - the " +
          "in-stack builder alert now names the agent you actually chose, and the daily secrets " +
          "check now validates an OpenAI key's shape the same way it always validated Claude's, so " +
          "a line-wrapped Codex key is flagged before it kills an overnight build.",
      },
      {
        kind: "fixed",
        text:
          "Your coding agent running out of hours no longer looks like a broken build. Claude says " +
          "\"you've hit your session limit\" when a subscription is spent, and DispatchSEO didn't " +
          "recognise that particular wording - so a pause that clears by itself arrived as a failed " +
          "build, a red warning and an alert email, and the build sat stuck until a sweep freed it " +
          "hours later. It's now treated as what it is: the build stays in the queue and is retried " +
          "once your limit resets.",
      },
    ],
  },
  {
    version: "1.1.0",
    date: "2026-08-02",
    title: "Home is a briefing from your agent now - and the warnings on it are true",
    summary:
      "Home opens with your agent saying hello and reporting on the day in its own words; the " +
      "status pill and the stack of coloured banners are gone. Your coding agent moved to the " +
      "top bar, where you can add one or switch which one runs your builds. And a long pass " +
      "over every warning DispatchSEO shows you: an empty queue, a paused run and a site still " +
      "being set up stopped being reported as faults, while builds that really had died " +
      "stopped hiding.",
    announce: true,
    changes: [
      {
        kind: "new",
        text:
          "Your agent now greets you at the top of Home and reports on the day in its own words. " +
          "It says hello, gives you one sentence, and that's it unless you open the full report. " +
          "The status pill and the stack of coloured banners are gone; the agent tells you if " +
          "something broke or if it's still setting up, the same way it tells you anything else. " +
          "Open the report and you get quick wins: SEO shows nothing for the first couple of " +
          "months, so it reads your Search Console data for the good news that IS there that " +
          "early. Searches you sit at #12 for and could take with one push. Pages that rank but " +
          "nobody clicks, where the title is the whole problem. Searches Google has only just " +
          "started showing you for. It never invents one to fill the space; a quiet week says so. " +
          "The agent wears your agent's colour, orange on Claude Code and white on Codex, and " +
          "your coding agent can read the same briefing over MCP with get_briefing.",
      },
      {
        kind: "new",
        text:
          "Self-hosted installs now send one anonymous ping a day so we can tell how many people " +
          "actually run DispatchSEO - downloads only ever showed how many people tried. It carries " +
          "two things: a random id made on your own machine, and your version. No domain, no email, " +
          "no keywords, no site data, no tokens. Set DISPATCHSEO_TELEMETRY=off in your .env to stop " +
          "it; nothing else changes if you do.",
      },
      {
        kind: "new",
        text:
          "Your coding agent now lives in the top bar, next to the Semi/Auto switch. Click its " +
          "icon to see the agents you've set up and swap which one runs your scheduled builds. " +
          "Agents you haven't set up aren't listed as if you should be using them - an \"Add " +
          "agent\" button opens a picker, you paste the key, it's verified and stored, and only " +
          "then does the agent join the list, ready to switch to whenever you choose. Settings' " +
          "agent section was folded into one place to match - the switch cards and a per-agent " +
          "key box together, with a green check on every agent whose key is already in. The " +
          "little dispatcher plays along too: he wears white when your builds run on Codex.",
      },
      {
        kind: "new",
        text:
          "Your plan is now on screen. The sidebar's Billing row carries a badge saying Starter, " +
          "Growth or Scale - or Free trial while you're still in your first seven days - so you " +
          "can see what you're on from any page instead of going to look it up.",
      },
      {
        kind: "new",
        text:
          "Adding a third site now asks about GitHub first. Your automations run as GitHub " +
          "Actions on your own account, and GitHub's free minutes cover about two sites - past " +
          "that, if your spending limit is still the default $0, GitHub doesn't bill you, it " +
          "quietly pauses your workflows. That looked exactly like DispatchSEO breaking. The " +
          "step explains it in plain terms, points you at the setting, and takes about thirty " +
          "seconds. If your repos are public it doesn't apply and you'll never see it.",
      },
      {
        kind: "new",
        text:
          "The site grew a landing page per agent: dispatchseo.com/claude-code and " +
          "dispatchseo.com/codex. Each one covers that agent specifically - what it runs on, " +
          "the exact connect command, and the questions people actually ask about it - and " +
          "the Codex page's dispatcher wears white. Both are linked from the homepage footer.",
      },
      {
        kind: "new",
        text:
          "dispatchseo.com/free-tools is open - small SEO tools that are free and need no " +
          "account. The first one takes two or more of your pages and tells you which should " +
          "link to which, with the anchor text to use, taken word-for-word from the page doing " +
          "the linking. It all runs in your browser; nothing you paste is sent anywhere.",
      },
      {
        kind: "improved",
        text:
          "Every dashboard screen now says \"Loading\" while it loads, with the dispatcher at his " +
          "desk on top of the grey placeholder boxes - the same one the setup wizard shows. He " +
          "wears your site's agent colours: clay for Claude Code, white for Codex.",
      },
      {
        kind: "improved",
        text:
          "The self-host boot message no longer tells VPS installers to open localhost. It now " +
          "prints two clearly separate next steps - own computer vs VPS/cloud server - and when " +
          "you're installing over SSH it leads with the VPS instructions.",
      },
      {
        kind: "improved",
        text:
          "The self-host setup wizard now asks which coding agent you use - Claude Code or Codex " +
          "- and every command it hands you comes pre-adapted to your pick. Codex is a first-class " +
          "path through setup, not a footnote behind a fold-out.",
      },
      {
        kind: "improved",
        text:
          "Wherever a Claude Code credential is asked for, `claude setup-token` is now a copyable " +
          "box instead of a link to the from-scratch install guide.",
      },
      {
        kind: "improved",
        text:
          "start.sh got three guard rails: it checks Docker and the Compose v2 plugin up front " +
          "(with the real fix named, instead of a cryptic CLI error), it says so when it falls " +
          "back from downloading prebuilt images to compiling from source (and what that needs), " +
          "and removing DOMAIN from .env now points the dashboard back at localhost on the next " +
          "start instead of leaving it aimed at a dead https address.",
      },
      {
        kind: "improved",
        text:
          "The wizard now says the agent install typically takes 30-40 minutes, which is what it " +
          "actually takes - the old 10-20 estimate made normal installs feel stuck.",
      },
      {
        kind: "improved",
        text:
          "The sweep that merges finished guides used to run on every status your CI reported - " +
          "including the ones saying a check had only just started. Vercel alone posts several " +
          "of those per preview, and each one cost a whole billed minute to wake up and discover " +
          "there was nothing to do yet. It now sits out anything that can't possibly be ready. " +
          "A green guide still merges within a minute of its last check, exactly as before.",
      },
      {
        kind: "improved",
        text:
          "The safety sweep behind it dropped from hourly to every six hours. It exists for the " +
          "rare case where GitHub loses an event, and it was spending about 300 minutes a month " +
          "per site confirming there was nothing to merge - 15% of the free GitHub allowance on " +
          "a check that almost never finds anything. Public repos have always had unlimited " +
          "minutes and were never affected.",
      },
      {
        kind: "improved",
        text:
          "DispatchSEO stopped describing itself as a Claude Code product. Codex does everything " +
          "Claude Code does here, so the site now says \"AI agents\", the docs and dashboard say " +
          "\"your coding agent\", and both are named wherever the difference matters - no change " +
          "to how anything works.",
      },
      {
        kind: "improved",
        text:
          "Adding a site when your plan is full now says so up front. The project switcher shows " +
          "\"Upgrade to add more sites\" instead of \"+ Add project\", and if you reach the form " +
          "another way it explains the limit rather than handing you fields to fill in. It also " +
          "answers immediately - it used to check that your domain was live and look up its " +
          "registration date first, then refuse for a reason that had nothing to do with either.",
      },
      {
        kind: "improved",
        text:
          "Plans no longer cap how many keywords you track. The cap never actually bound - your " +
          "DataForSEO budget hits its ceiling first, and that one slows rank checks instead of " +
          "refusing new keywords - so it's gone from the pricing pages and from the code. Plans " +
          "are sold on sites now, nothing else.",
      },
      {
        kind: "improved",
        text:
          "When a pipeline run fails before the writing agent even starts, the alert now names " +
          "the exact step that died instead of just \"workflow failed\" - so the email tells you " +
          "(and us) what to look at without opening the Actions log.",
      },
      {
        kind: "fixed",
        text:
          "A red \"something failed\" notice on Home no longer turns itself green when the next run " +
          "is merely handed out. Being picked up is not the same as succeeding, and the banner - and " +
          "the answer your agent gets - now say so until something actually finishes.",
      },
      {
        kind: "fixed",
        text:
          "Being signed out at random is fixed. Your session is refreshed as you browse; before, the " +
          "refreshed sign-in was never saved, so sooner or later a normal click landed you back on " +
          "the login page having done nothing wrong.",
      },
      {
        kind: "fixed",
        text:
          "A brief database hiccup no longer looks like \"you have no account\". It now retries and " +
          "says so plainly if it still can't reach us, instead of showing you an empty product.",
      },
      {
        kind: "fixed",
        text:
          "Hitting your coding agent's usage limit no longer looks like a broken product. It's a " +
          "normal, temporary pause - Home now names it as one and tells you when building resumes.",
      },
      {
        kind: "fixed",
        text:
          "A build that failed no longer holds the next attempt for the whole cadence window - it " +
          "backs off and retries instead of waiting a full day to try again.",
      },
      {
        kind: "fixed",
        text:
          "Rankings that had quietly stopped updating, and builds that had died without a trace, now " +
          "surface on Home instead of looking like everything is fine.",
      },
      {
        kind: "fixed",
        text:
          "On the hosted plans, a trial no longer reads as a paid plan, and cancelling now actually " +
          "takes effect on your account.",
      },
      {
        kind: "fixed",
        text:
          "Builds now follow your repo's own Node version - an `.nvmrc` if you have one, otherwise " +
          "the `engines.node` floor in package.json, otherwise 22. Nothing to edit in the workflow, " +
          "and because it's decided when the build runs, a pipeline update can't undo it.",
      },
      {
        kind: "fixed",
        text:
          "A run that was skipped on purpose - queue empty, a pull request already open, builds " +
          "paused - no longer reports itself as a finished build. It used to hold off the next one " +
          "for up to 20 hours, so a guide approved in the morning could sit until the evening.",
      },
      {
        kind: "fixed",
        text:
          "An empty queue no longer turns into a \"your builds stopped running\" warning. If there " +
          "is nothing approved to build, the builder being quiet is the correct behaviour, not a " +
          "fault - the warning is now reserved for work that really is waiting and not happening.",
      },
      {
        kind: "fixed",
        text:
          "Your public sitemap now uses your own domain - self-hosted installs were publishing " +
          "dispatchseo.com URLs in their sitemap.xml.",
      },
      {
        kind: "fixed",
        text:
          "Pasting an agent key now tells you if it couldn't also be stored on your GitHub repo, " +
          "and which permission is missing. Before, it said \"saved\" either way and your scheduled " +
          "builds kept failing on a secret that was never written.",
      },
      {
        kind: "fixed",
        text:
          "A one-off crashed build no longer leaves a red warning on Home forever. The build is " +
          "already re-queued and retried automatically, so the notice now clears itself once that " +
          "has happened.",
      },
      {
        kind: "fixed",
        text:
          "An update worth announcing no longer gets buried by the next small release, Search " +
          "Console stats for a whole window no longer save only partway when one date fails, and a " +
          "pipeline update can no longer open a surprise second install pull request on your repo.",
      },
      {
        kind: "fixed",
        text:
          "The \"researching in the background - running your first rank check\" strip no longer sits " +
          "there indefinitely. On a free (Search-Console-only) site there was never a rank check " +
          "coming, so it spun forever; it now finishes once your queue fills. And if you DO have " +
          "DataForSEO but no rank check has landed a full day after keywords were tracked, it says " +
          "that plainly instead of claiming it's still working.",
      },
      {
        kind: "fixed",
        text:
          "A guide pull request that fell behind your main branch now fixes itself. Every guide edits " +
          "the same couple of registry files, so a pull request left open while anything else merges " +
          "used to come back conflicted and sit there red until you rebased it by hand. The merge " +
          "sweep now updates the branch from main and merges it on the next pass.",
      },
      {
        kind: "fixed",
        text:
          "When a pull request genuinely can't be merged, Home now tells you why - conflicts, a " +
          "branch protection rule, or a branch that's out of date - instead of \"workflow failed\" " +
          "with a link into the GitHub Actions log, or blaming branch protection for a conflict.",
      },
      {
        kind: "fixed",
        text:
          "One unmergeable guide no longer stops the rest of the merge sweep. It used to abort the " +
          "whole run, so later pull requests and the stuck-tool-check never ran at all.",
      },
      {
        kind: "fixed",
        text:
          "Home no longer shows a red \"your builder has never run - check its token\" warning when " +
          "the truth is simply that you haven't approved anything yet. It only warns when there is " +
          "genuinely something approved and waiting that the builder hasn't picked up.",
      },
      {
        kind: "fixed",
        text:
          "Installs running on a home network or a private address (192.168.x, a Tailscale address, " +
          "your own machine's name) no longer get a permanent warning telling them to re-run setup " +
          "because their pipeline \"never reported\". Those installs are unreachable from GitHub by " +
          "design, which was never a fault to report.",
      },
      {
        kind: "fixed",
        text:
          "On a server install with your own domain, research could run twice on the same day - once " +
          "in the built-in builder and once on GitHub - which meant duplicate ideas and double the " +
          "DataForSEO spend. Whichever one is actually running now owns the job.",
      },
      {
        kind: "fixed",
        text:
          "Tool pull requests now validate on sites that aren't Next.js. The checker used to assume " +
          "`start` on port 3000, so a Vite, Hugo, Astro or plain-static site failed every tool PR. " +
          "Put your own command and port in `.dispatchseo/serve` and it uses those - and that file " +
          "survives pipeline updates.",
      },
      {
        kind: "fixed",
        text:
          "Adding an agent from the topbar switcher no longer risks blanking the whole dashboard if " +
          "the save fails - it shows the reason in the panel. The key you paste there is now also " +
          "copied to your repo, so scheduled builds on GitHub stop failing seconds in on a missing " +
          "credential. And if the agent check can't load, the panel says so and offers a retry " +
          "instead of spinning forever.",
      },
      {
        kind: "fixed",
        text:
          "Saving a credential on an install whose password comes from your .env now tells you to " +
          "set it in .env, instead of failing with a blank error screen.",
      },
      {
        kind: "fixed",
        text:
          "Tool PRs no longer get stuck unreviewed on sites whose home page redirects - an app " +
          "behind a login, a country/language bounce, anything that doesn't answer with a plain " +
          "page at the root. The check that waits for your site to start was insisting on a " +
          "specific answer from the home page, gave up on anything else, and left the tool sitting " +
          "in a pull request nobody was told about. It now just waits for your site to respond.",
      },
      {
        kind: "fixed",
        text:
          "A site pointed at a coding agent nobody gave a key to now shows up as a failed build " +
          "on Home within its normal schedule, instead of silently never researching or building " +
          "again. And with GitHub not yet connected, the bundled builder no longer \"claims\" work " +
          "it can't start - the work just waits, ready the moment you connect.",
      },
      {
        kind: "fixed",
        text:
          "The dashboard's \"turn on automatic builds\" reminder comes back if the bundled builder " +
          "stops checking in for two weeks - it used to switch off forever after the first " +
          "successful check-in.",
      },
      {
        kind: "fixed",
        text:
          "On self-host, the agent credential you paste on the dashboard now also lands on your " +
          "connected repo as the Actions secret its scheduled workflows read - one paste feeds " +
          "both build paths, in either order (token first or GitHub first). Before, workflows " +
          "died in seconds with \"the token is missing\" over a token you had genuinely pasted, " +
          "because it was sitting in the other pocket and nothing copied it across without the " +
          "GitHub App. The scheduler also checks the repo secret before waking a workflow, so a " +
          "half-finished setup waits quietly instead of emailing you failures from GitHub.",
      },
      {
        kind: "fixed",
        text:
          "Cloud setup no longer gets stuck one step from done. The background setup run could " +
          "finish all its work without flipping the final \"installed\" switch, which quietly kept " +
          "research and daily builds from ever starting. The backend now verifies your repo on its " +
          "own and flips the switch the moment everything checks out - and when one GitHub setting " +
          "genuinely needs your click (\"Allow GitHub Actions to create and approve pull requests\"), " +
          "the setup checklist now says so with a direct link, then re-checks automatically after " +
          "you flip it.",
      },
      {
        kind: "fixed",
        text:
          "Everywhere we told you to set a GitHub \"spending limit\" now says what GitHub " +
          "actually calls it today: a budget, under Budgets and alerts. The old wording sent " +
          "people looking for a control that isn't there any more. The instructions also lead " +
          "with the step that's easiest to miss - GitHub needs a payment method on file before " +
          "any budget takes effect at all.",
      },
      {
        kind: "fixed",
        text:
          "On cloud, pipeline fixes now reach your repo within minutes of shipping instead of " +
          "at the next daily check. Every deploy sweeps the connected repos and updates any " +
          "that run an older pipeline - so a workflow bug we fix stops failing your builds the " +
          "same hour, not the next day.",
      },
    ],
  },
  {
    version: "1.0.0",
    date: "2026-07-31",
    title: "Full Codex support, much cheaper builds, and a lot less GitHub time",
    summary:
      "Codex is a fully audited alternative to Claude Code now, a guide build costs about a " +
      "third of the agent plan usage it did yesterday, and your automations use far less of " +
      "your monthly GitHub allowance. You can also stop DispatchSEO on a site without " +
      "deleting it, and every guide ships with its custom graphics again.",
    changes: [
      {
        kind: "new",
        text:
          "A Disconnect repo button in Settings. It switches off the workflows we put in your " +
          "repo, deletes them along with the .dispatchseo folder and the key we stored there, " +
          "and forgets the connection. Everything scheduled stops, which means it stops " +
          "spending your GitHub Actions minutes. Your guides, tools and pages are left exactly " +
          "as they are, this dashboard keeps every keyword and ranking it has tracked, and you " +
          "can connect the repo again whenever you want. On the self-hosted version there was " +
          "previously no way to do this at all: your first site can't be deleted, so a site you " +
          "had only been trying out kept running builds in your repo with no button anywhere " +
          "that stopped it. The button is on that first site too - it is the one that needed it " +
          "most. Your agent can do it as well, through the disconnect_repo tool.",
      },
      {
        kind: "new",
        text:
          "A shape check before writing. The builder now sketches the guide's opening and " +
          "headings and checks those against everything you've published BEFORE it writes " +
          "the article, the graphics, or the cover. A post that would have read like a " +
          "repeat gets reshaped in seconds now, instead of being written in full, caught at " +
          "the end, and rewritten. The final check on the finished guide is unchanged and " +
          "still has to pass before anything opens as a pull request.",
      },
      {
        kind: "new",
        text:
          "A plain-English alert when GitHub pauses your builds. Running out of monthly " +
          "Actions minutes does not produce a bill or an email from GitHub - it just quietly " +
          "stops running your workflows. When it looks like that happened, the dashboard now " +
          "says so and links straight to the setting that fixes it.",
      },
      {
        kind: "new",
        text:
          "Up-front numbers on what a third site costs, wherever you'd decide to buy one. Your " +
          "first two sites fit inside GitHub's free tier; past that GitHub charges you a few " +
          "dollars a month directly, and we never touch or mark up that money. The landing " +
          "page's pricing section, the plan picker, the upgrade cards on Billing, the FAQ and " +
          "the docs all say so now - above the button rather than below the fold - and a cost " +
          "table covers every site count from one to ten so you can check your own number " +
          "instead of working it out from a sentence.",
      },
      {
        kind: "improved",
        text:
          "Every build used to open by making a dozen separate requests and then reading two " +
          "or three of your published posts start to finish, just to work out what their " +
          "openings and headings looked like so the new one wouldn't read like them. All of " +
          "that now arrives in a single response the moment a build starts - and it comes " +
          "from the same comparison the sameness check already runs, so what the builder " +
          "avoids and what the check flags can't drift apart.",
      },
      {
        kind: "improved",
        text:
          "The builder also stopped carrying instructions it can't act on. It was being " +
          "handed the full keyword-vetting rulebook on every single step, on a job where the " +
          "keyword was already decided and picked by you - plus the whole back-linking " +
          "policy even on sites that have back-linking switched off. Both are now sent only " +
          "where they apply.",
      },
      {
        kind: "improved",
        text:
          "Weekly tool builds got the same treatment. Every quality gate is exactly where it " +
          "was - the page-1 check, the original-research requirement, the humanizer pass, " +
          "the sameness check, your site's own build, and your review of the pull request. " +
          "This changed how the work gets done, never the bar it has to clear.",
      },
      {
        kind: "improved",
        text:
          "Your site's automations used to run on their own timers, three attempts a day, " +
          "because GitHub sometimes drops a scheduled run. Two of those three woke up only " +
          "to find nothing to do - and GitHub charges your account a full minute every time " +
          "one starts. The dashboard now decides when there is something to build and wakes " +
          "the workflow itself, so that check costs nothing. Nothing about what gets " +
          "published changes.",
      },
      {
        kind: "improved",
        text:
          "If a wake-up call goes out and nothing runs, you hear about it. GitHub accepts " +
          "those calls even when a repo has Actions switched off or has run out of minutes, " +
          "so the dashboard now tracks each one until the workflow reports back, and flags " +
          "the ones that never do.",
      },
      {
        kind: "improved",
        text:
          "The docs now tell the whole truth about Codex: the landing page no longer says " +
          "agent support is 'coming', the FAQ no longer says a Claude subscription is " +
          "required, and the self-host guide, security page, and troubleshooting page all " +
          "cover the Codex path - including which model builds use and how to change it.",
      },
      {
        kind: "improved",
        text:
          "The dashboard opens faster. Home shows its quick sections straight away and fills " +
          "the slower ones in as they arrive, instead of holding the whole page back for the " +
          "slowest thing on it. The Guides page stopped reaching out to your live site before " +
          "it would render at all, and Billing stopped asking your payment provider the same " +
          "three questions twice on every visit.",
      },
      {
        kind: "improved",
        text:
          "Tables in the docs render as tables. Every one of them was shipping as the literal " +
          "pipe characters the author typed, across 17 pages - including the cloud-versus-" +
          "self-hosted comparison people read specifically to make that decision.",
      },
      {
        kind: "fixed",
        text:
          "Scheduled Codex builds on cloud were being turned away at the door: the tool that " +
          "runs Codex on GitHub refuses runs started by automation unless told otherwise, and " +
          "we only ever told it for manual runs - which is why manual tests passed while every " +
          "scheduled run died. All eight workflows now allow it.",
      },
      {
        kind: "fixed",
        text:
          "Keyword lookups inside Codex builds were silently broken for anyone with their own " +
          "DataForSEO account: the credentials were handed over in a format only Claude Code " +
          "understands, so Codex logged in with a placeholder instead of your login. Both " +
          "runners now hand Codex the real values.",
      },
      {
        kind: "fixed",
        text:
          "A builder run could finish, report success and have built nothing at all - costing " +
          "you a day's post with a green tick beside it. If the builder got stuck it could stop " +
          "and ask a question, and on a scheduled run there is nobody there to answer, so it " +
          "ended quietly and the day's post never happened. Runs now have to point at the pull " +
          "request they opened; one that opened none is put back in the queue and picked up on " +
          "the next pass, and you get told if it keeps happening.",
      },
      {
        kind: "fixed",
        text:
          "The underlying cause was a rule of ours that was too strict about how Codex is " +
          "allowed to write files - it ruled out the one method that reliably works, so the " +
          "builder painted itself into a corner on anything with code samples in it. Codex " +
          "builds should now get through the same work Claude Code does.",
      },
      {
        kind: "fixed",
        text:
          "Every guide ships with its own custom graphics again. Your guides are supposed to " +
          "ship with two or three custom graphics drawn for that exact topic, plus a cover. " +
          "Codex was reading that requirement and talking itself down to a plain table and a " +
          "quote box - so a post would arrive looking noticeably thinner than the ones beside " +
          "it on your blog. The builder now counts the files it actually created before it " +
          "opens the pull request, and won't ship the guide until they are there. Guides built " +
          "by Claude Code were never affected.",
      },
      {
        kind: "fixed",
        text:
          "A tool build that produced nothing could report success and quietly stop the tool " +
          "queue; a transient OpenAI rate limit could ring the alarm bell and cost a full " +
          "cadence window. Every scheduled workflow now tells those apart the same way the " +
          "daily guide build does: retries stay quiet and automatic, dead accounts stay loud.",
      },
      {
        kind: "fixed",
        text:
          "Hitting your agent's usage limit no longer costs you the day. A build that " +
          "stopped that way was being recorded as a finished run, which held the next " +
          "attempt back until the following day while the dashboard showed green. It is now " +
          "recorded as what it is - ran, built nothing - and retried within hours.",
      },
      {
        kind: "fixed",
        text:
          "Self-hosted stacks had no place left to paste a Codex key once the builder was " +
          "running - the one card that took it disappears after first setup. Settings now " +
          "always has a credential box for the builder, the setup wizard's paste step takes " +
          "both agents, and a build that keeps getting deferred now goes stale and alarms " +
          "instead of looking green forever.",
      },
    ],
  },
  {
    version: "2026-07-30.9",
    date: "2026-07-30",
    title: "Cancelling is a button now",
    summary:
      "Billing has a Cancel subscription button. It takes effect at the end of the period " +
      "you've already paid for, and you can undo it from the same place.",
    changes: [
      {
        kind: "new",
        text:
          "A Cancel subscription button on Billing. Two clicks, no email, no hunting through " +
          "the payment provider's site. Cancelling during your trial means you're never " +
          "charged at all.",
      },
      {
        kind: "new",
        text:
          "One optional question on the way out. The cancel screen asks what made you leave " +
          "and whether anything needs fixing - both skippable, and the cancel button works " +
          "with the whole thing left blank. Whatever you write goes straight to the person " +
          "who builds this.",
      },
      {
        kind: "new",
        text:
          "Cancel now, keep what you paid for. Your plan runs to the end of the current " +
          "period - sites keep being tracked and built the whole time - and Billing shows " +
          "the exact date it ends. Nothing is deleted when it does, so coming back later " +
          "picks up where you left off.",
      },
      {
        kind: "new",
        text:
          "Changed your mind? A Keep my plan button appears while a cancellation is pending, " +
          "so you can call it off without going through checkout again.",
      },
      {
        kind: "fixed",
        text:
          "A paused account now says so. If your plan ends or a payment fails, every dashboard " +
          "screen carries a banner explaining that tracking and building have stopped, that " +
          "nothing has been deleted, and how to start again. Until now the dashboard looked " +
          "completely normal and just quietly stopped updating.",
      },
    ],
  },
  {
    version: "2026-07-30.8",
    date: "2026-07-30",
    title: "DispatchSEO runs on Codex too",
    summary:
      "Codex now does everything Claude Code does here, including the overnight builder. " +
      "Pick one when you set a site up, or switch any time on Settings; nothing about an " +
      "existing Claude setup changes.",
    changes: [
      {
        kind: "new",
        text:
          "Codex is a full alternative to Claude Code. Setting up a new site now asks which " +
          "one you want, and Settings -> Project key has a tab per agent for sites you already " +
          "have. Either way it drives everything: research, the queue, approvals, backlinks, " +
          "reports, building a guide on request - and the scheduled builders that run " +
          "overnight without you.",
      },
      {
        kind: "new",
        text:
          "A Coding agent setting. Switch a site between Claude Code and Codex and it takes " +
          "effect on the next scheduled build - nothing to reinstall, no pull request, no repo " +
          "edit, because your workflow files already carry both and ask which to use when they " +
          "run. If the new agent's key isn't in place yet, the switch tells you right then " +
          "instead of letting you find out at 5am.",
      },
      {
        kind: "new",
        text:
          "An \"Other MCP client\" tab, for Cursor, Gemini CLI, Copilot, or anything else that " +
          "speaks MCP. It hands you the URL, the header, and a header-free URL for clients that " +
          "can't set one. Those connect and drive DispatchSEO by hand; the overnight builder " +
          "needs Claude Code or Codex.",
      },
      {
        kind: "improved",
        text:
          "The honest difference between the two is billing, and it is stated wherever you " +
          "pick: Claude Code runs on the subscription you already pay for, Codex is metered by " +
          "OpenAI per run. Either way the credential is yours and stays yours - DispatchSEO " +
          "never proxies or pools it.",
      },
      {
        kind: "fixed",
        text:
          "A Codex build that stops because your OpenAI account is out of credit now says so, " +
          "loudly, with the link to fix it. Codex reports that identically to a momentary rate " +
          "limit, so taking its word for it would have meant a green run every night that built " +
          "nothing - the builders ask OpenAI directly instead of guessing from the message.",
      },
    ],
  },
  {
    version: "2026-07-30.7",
    date: "2026-07-30",
    title: "Ask for what's missing",
    summary:
      "A Feedback board in the sidebar: ask for a feature in one line, and vote on what " +
      "everyone else asked for. The most wanted things get built first.",
    changes: [
      {
        kind: "new",
        text:
          "Feedback, at the bottom of the sidebar. Type what you're missing and hit enter - " +
          "that's the whole thing. Add detail if you want, or don't.",
      },
      {
        kind: "new",
        text:
          "Vote on anyone else's request. One vote each, click again to take it back, and " +
          "the board sorts by what people actually want. Requests get a status as they " +
          "move - planned, in progress, shipped - so you can see where yours went.",
      },
      {
        kind: "new",
        text:
          "Your agent can use the board too: get_feedback, submit_feedback and " +
          "vote_feedback over MCP, so you can ask for something without leaving the terminal.",
      },
    ],
  },
  {
    version: "2026-07-30.5",
    date: "2026-07-30",
    title: "Fewer ways to get stuck, and alerts that actually arrive",
    summary:
      "A pass over the paths that only break for someone who isn't us: the setup wizard, the " +
      "confirmation email, the failure alerts, and the jobs running in your repo.",
    changes: [
      {
        kind: "fixed",
        text:
          "Failure alert emails now send on Docker installs. They never had: the sender address " +
          "arrived empty rather than missing, so every alert was rejected on the way out and the " +
          "error only landed in the container log - while the docs told you no email meant " +
          "nothing was wrong. If you self-host and wired up Resend, you'll start hearing from it.",
      },
      {
        kind: "fixed",
        text:
          "Confirming your email works from a different device than you signed up on. The link " +
          "only worked in the browser that started the signup; anywhere else it confirmed your " +
          "address and then told you your password was wrong.",
      },
      {
        kind: "fixed",
        text:
          "A job in your repo that hangs and hits its time limit now reports that it failed. " +
          "A cancelled run is neither a success nor a failure to GitHub, so those runs told us " +
          "nothing at all - the one situation the time limit exists to catch was the one that " +
          "stayed invisible.",
      },
      {
        kind: "fixed",
        text:
          "Rank tracking waits quietly while your DataForSEO account is still unfunded instead " +
          "of reporting a broken job every night. Connecting the credentials and wiring the " +
          "deposit are two separate steps, and the gap between them is normal.",
      },
      {
        kind: "fixed",
        text:
          "The setup wizard says so when a step fails instead of leaving the button dead, the " +
          "repo picker always offers a way forward even when GitHub returns nothing, and " +
          "self-hosted installs get the pipeline install card on their first site.",
      },
    ],
  },
  {
    version: "2026-07-30.4",
    date: "2026-07-30",
    title: "Someone to ask, from wherever you're stuck",
    summary:
      "The Discord is now one click away from the setup wizard and from every page of the docs, instead of only from your settings page.",
    changes: [
      {
        kind: "new",
        text:
          "Setup has a link to the Discord in its header, next to the quick guide. Some of setup " +
          "depends on things no guide can check for you, like whether Google has verified your " +
          "property yet, and being stalled on step three is when you want a person rather than " +
          "another page to read.",
      },
      {
        kind: "new",
        text:
          "The docs carry the same link in their header and in the Help section of the sidebar, " +
          "so it's reachable from any page rather than only from the one that happens to mention " +
          "it. Troubleshooting and Common questions now point there first, with GitHub " +
          "Discussions kept for anything worth leaving behind for the next person.",
      },
    ],
  },
  {
    version: "2026-07-30.3",
    date: "2026-07-30",
    title: "Better keywords, and automatic mode stops asking you things",
    summary:
      "Your site now competes in whichever description of your product it can actually win, instead of the most obvious and most crowded one - and on automatic mode you're never asked to approve anything again.",
    changes: [
      {
        kind: "new",
        text:
          "Your product can be described honestly in several ways, and they are not equally " +
          "winnable. A tool for SEO sits in a market Ahrefs and Semrush have published into since " +
          "2011; the same tool described as \"an agent that does the work unattended\" sits in a " +
          "market two years old. Research now measures each description against your site's " +
          "current strength every week, spends the week on the one you can actually win, and " +
          "prints the numbers so you can see why it chose. Setup writes those descriptions down " +
          "for your site - re-run it from your dashboard to get them.",
      },
      {
        kind: "improved",
        text:
          "It sticks with one subject rather than hopping between them. Twenty guides spread over " +
          "five subjects makes you an authority on none; twenty inside one build a cluster where " +
          "every page lifts the others. It moves on only when a subject is genuinely used up.",
      },
      {
        kind: "improved",
        text:
          "On automatic mode you are never asked to approve anything, and nothing sits in limbo " +
          "either. Ideas are decided when they're researched - approved or dropped, with the reason " +
          "recorded - rather than parked \"until your site is stronger\", which on a new site means " +
          "months away and possibly never. The decision uses the page-1 check it already paid for: " +
          "if nobody established was ranking there, it goes ahead, even when the data provider " +
          "returned no difficulty score at all. A missing score is a missing guess about a page " +
          "we already looked at.",
      },
      {
        kind: "improved",
        text:
          "Some weeks that means 4 guides instead of 7. It won't pad your queue with keywords it " +
          "doesn't believe in, and it won't hand you the difference to sort out either.",
      },
      {
        kind: "improved",
        text:
          "A difficulty score is now only the first pass. If it checks page 1 for a keyword and " +
          "finds nobody established sitting there, it goes ahead even when the score called the " +
          "keyword too hard for your site - because what it actually saw beats what the score " +
          "guessed. Scores are calculated from links, and they read far too high on exactly the " +
          "searches a new site can still win. This is how bigger keywords reach your queue " +
          "without lowering the bar, and it costs nothing extra: it already looks at page 1.",
      },
      {
        kind: "fixed",
        text:
          "Keyword suggestions were coming back wrong for anyone on our hosted plan - we were " +
          "asking our data provider for keywords in the same shopping CATEGORY as yours rather " +
          "than keywords that actually mean the same thing, and asking for English never filtered " +
          "out other languages. A search about SEO automation could return French ad agencies. " +
          "Now it asks the two right ways, merges them, and throws out anything non-English or " +
          "with no search traffic - with a test that fails if that ever regresses.",
      },
    ],
  },
  {
    version: "2026-07-30",
    date: "2026-07-30",
    title: "Fixed: the daily builder could die before it started",
    summary:
      "If your package.json pins a pnpm version, your builder was failing in 13 seconds on every run - and failing too early to tell anyone. Re-run the setup command from your dashboard to pick up the fix.",
    changes: [
      {
        kind: "fixed",
        text:
          "The workflows DispatchSEO installs in your repo set up pnpm before building. That step " +
          "passed a pnpm version, and if your package.json also pins one (a \"packageManager\" " +
          "field), the setup action refuses to run at all - so the builder died at step two of " +
          "every run, before it wrote a line. Nothing was lost and nothing was published wrong; " +
          "the builds simply never happened. The workflow now reads your pin and matches it, and " +
          "only picks a version itself when you have not pinned one.",
      },
      {
        kind: "fixed",
        text:
          "It also failed BEFORE the step that reports problems to your dashboard, so the banner " +
          "and the alert email stayed quiet - you would only have seen it in GitHub's own emails. " +
          "The stale-run check would have caught the silence within 36 hours, which is the backstop " +
          "working but slower than it should be.",
      },
      {
        kind: "improved",
        text:
          "The cause was a workflow comment asking whoever ran your install to delete a line by " +
          "hand when your repo pinned a version - so getting it right depended on that being " +
          "noticed. Nothing we install in your repo is allowed to work that way any more: the " +
          "workflows decide for themselves when they run, and two new checks on our side refuse " +
          "to ship a workflow that needs hand-editing or that has never been proved to start.",
      },
      {
        kind: "fixed",
        text:
          "To pick this up, re-run the setup command from your dashboard - your repo keeps the " +
          "version of the pipeline it installed, and the daily health check will also tell you an " +
          "update is waiting.",
      },
    ],
  },
  {
    version: "2026-07-29.6",
    date: "2026-07-29",
    title: "The queue tells you why an idea is waiting",
    summary:
      "An idea research didn't approve now says \"pending\" and shows the number behind it, instead of \"optional\" - because on a young site nothing else will ever pick it up.",
    changes: [
      {
        kind: "improved",
        text:
          "On Auto, an idea research proposed but didn't approve used to read \"optional\", with an " +
          "\"Add\" button - as if it were a bonus you could ignore. It isn't: research now refuses " +
          "to promote borderline keywords just to hit the weekly count on a site with no backlinks " +
          "yet, so approving is the only thing that ever builds them. The row says \"pending\" and " +
          "names the reason - \"KD 17, over your ceiling of 10\" - and the button says Approve.",
      },
    ],
  },
  {
    version: "2026-07-29.5",
    date: "2026-07-29",
    title: "Your posts stay about what you sell",
    summary:
      "Research now throws out keywords your product isn't actually an answer to - the ones your buyers search about the other tools they use, which read as a perfect fit and bring in people who never needed you.",
    changes: [
      {
        kind: "improved",
        text:
          "A keyword now has to pass one question before anything else: written well, would this " +
          "post end with \"and that's what your product does\"? If the product can only show up as " +
          "a footnote or a \"here's how we built ours\" aside, the keyword is dropped - no matter " +
          "how good the search volume, the difficulty score, or the fit with your audience.",
      },
      {
        kind: "improved",
        text:
          "The rule this replaces asked whether your audience would search the keyword, and your " +
          "audience searches a hundred things a week you're not the answer to - their editor, " +
          "their cloud, their framework, the agent they run you with. Those all passed, and each " +
          "one is a post that ranks for someone else's question. Every idea now has to name the " +
          "problem the searcher has, not who the searcher is.",
      },
      {
        kind: "improved",
        text:
          "Setup now writes down your marketing surface - your landing page, your README - " +
          "alongside your code, because that's where the research reads what your site is " +
          "actually about. If your site facts file was written before today it probably lists " +
          "code only, which is exactly how a run drifts into writing about your plumbing. " +
          "Re-run setup from the dashboard to refresh it.",
      },
    ],
  },
  {
    version: "2026-07-29.4",
    date: "2026-07-29",
    title: "Your posts can start linking to each other",
    summary:
      "Turn it on and every new guide also adds a link from 2-3 of your closest older posts, so the whole set pulls together instead of each post standing alone.",
    changes: [
      {
        kind: "new",
        text:
          "New guides have always linked out to your older ones, but nothing ever linked back - " +
          "so your oldest posts, usually your best, collected no internal links at all. There's " +
          "now a switch on the Automations page: when it's on, the same pull request that adds a " +
          "guide also edits 2-3 of your closest existing posts so they link to it. It only ever " +
          "wraps words that are already in a sentence you wrote - strip the link out and the text " +
          "reads exactly as before - so your writing is never reworded, extended, or tidied.",
      },
      {
        kind: "new",
        text:
          "It's off until you turn it on, and it stays that way if you never do. This is the only " +
          "thing DispatchSEO does that changes pages you already published, so it doesn't ride " +
          "along with Semi or Auto - it's a separate yes. Once it's on it stays out of your way: " +
          "the links ride in the same pull request as the new guide, which merges under whatever " +
          "rules you already had. No extra pull requests, nothing new to approve.",
      },
      {
        kind: "new",
        text:
          "A post that's already carrying 5 links to other guides gets left alone from then on. " +
          "Without that, your most on-topic post would get picked build after build and slowly " +
          "fill with links - which is the thing that makes automatic linking backfire.",
      },
    ],
  },
  {
    version: "2026-07-29.3",
    date: "2026-07-29",
    title: "The setup banner stops nagging sites that are already running",
    summary:
      "A live site no longer claims it's still setting up, and every setting your agent can pass now explains what it's for.",
    changes: [
      {
        kind: "fixed",
        text:
          "The \"Setting up your site in the background\" banner no longer appears on a site " +
          "that's clearly already running. It was keyed on a marker that older projects never " +
          "got, and reconnecting your GitHub App reset the timer that was supposed to hide it - " +
          "so a site publishing guides every day could be told it was still being set up. It now " +
          "goes by whether your site has real data, which settles it regardless of any marker.",
      },
      {
        kind: "improved",
        text:
          "Every setting your agent can pass now explains what it's for. Previously the agent had " +
          "to infer what belonged in each field from the surrounding description, which Claude " +
          "handles well and other agents handle less well. All 111 of them are now spelled out.",
      },
    ],
  },
  {
    version: "2026-07-29.2",
    date: "2026-07-29",
    title: "No more duplicate ideas, and reconnecting GitHub actually sticks",
    summary:
      "The same keyword can't get queued twice any more, and the \"Reconnect the GitHub App\" card now clears when you reconnect.",
    changes: [
      {
        kind: "fixed",
        text:
          "A keyword that's already in your queue can't be added again - not by a research " +
          "run, not by the Add idea form. Before this, a run that re-proposed a keyword you " +
          "had already approved put the same guide in the queue twice, and two builders would " +
          "write two competing pages for one search. You now get a plain \"already in the " +
          "queue\" answer instead, naming the idea that's already there.",
      },
      {
        kind: "fixed",
        text:
          "Reconnecting the GitHub App from the Home card now saves. If the app was already " +
          "installed on your GitHub account, GitHub sent you back through a path that bounced " +
          "you to the dashboard without recording anything - so the card kept nagging no " +
          "matter how many times you reconnected. Connecting a second site on the same GitHub " +
          "account works now too.",
      },
    ],
  },
  {
    version: "2026-07-29.1",
    date: "2026-07-29",
    title: "Keyword picking now learns from your own results",
    summary:
      "Research reads how your published pages are actually doing in Google and lets that steer the next round - and it stopped queueing keywords a young site can't win.",
    changes: [
      {
        kind: "new",
        text:
          "Every research run now starts by looking at the pages it already published - " +
          "what ranked, what stalled past position 50, what got impressions but no clicks - " +
          "and carries that into which keywords it picks next. It writes the conclusion into " +
          "the run report, so you can see what it learned. Previously each run started from " +
          "scratch and had no idea whether its last twenty picks worked.",
      },
      {
        kind: "fixed",
        text:
          "Difficulty scores read far too low on commercial searches like " +
          "\"<competitor> alternative\" or \"best X\", where page 1 is five established brands " +
          "winning on reputation rather than links - so those keywords looked easy, got " +
          "queued, and the pages landed on page 8. Research now counts the established " +
          "players on page 1 and drops the keyword at four or more, whatever the difficulty " +
          "score claimed.",
      },
      {
        kind: "fixed",
        text:
          "Hitting the weekly target of 7 guides was allowed to push borderline keywords " +
          "through on a site with no authority yet. You still get one guide a day - that " +
          "hasn't changed - but research now gets there by hunting wider instead of settling: " +
          "it mines the queries you already show up for in Search Console, error messages, " +
          "new releases in your space, and your trend radar, and screens twice as many " +
          "candidates before it will call a week short.",
      },
      {
        kind: "improved",
        text:
          "Search volume now has an upper limit that grows with your site, not just a floor - " +
          "but a big keyword whose page 1 is still thin no longer gets thrown out for being " +
          "big. In a fast-moving topic, a query can have thousands of searches while nobody " +
          "has published the real answer yet; those are the best openings a new site gets, " +
          "so what's already on page 1 decides, not the volume number.",
      },
      {
        kind: "improved",
        text:
          "Research won't invent a pattern from two lucky posts. It now waits until at least " +
          "10 of your pages have had three weeks to settle before drawing any conclusion from " +
          "how they're doing, and says \"not enough data yet\" until then.",
      },
      {
        kind: "improved",
        text:
          "Page-1 checks are capped at 25 per research run, spent on the strongest candidates " +
          "first. They're the priciest thing a run does, so a hard week now costs a known " +
          "amount instead of running up your bill.",
      },
    ],
  },
  {
    version: "2026-07-29",
    date: "2026-07-29",
    title: "The tool queue fills itself",
    summary:
      "Every weekly research run now queues tool ideas, not just guides - and if your site has no public tools section yet, the first tool build creates one.",
    changes: [
      {
        kind: "fixed",
        text:
          "Sites that finished setup without a public tools section got tool ideas skipped " +
          "week after week, so the tool queue stayed empty and the weekly tool builder had " +
          "nothing to ship - quietly, with no warning anywhere. The research run now queues " +
          "1-2 tool ideas every week regardless, and reports it when none clears the bar.",
      },
      {
        kind: "new",
        text:
          "The tool builder creates your tools section itself the first time it runs - " +
          "registry, tools index, and the page template - in the same PR as the first tool. " +
          "If /tools is already your app's own screen, it publishes at /free-tools instead " +
          "and leaves your routes alone.",
      },
      {
        kind: "improved",
        text:
          "Setup now looks for (or scaffolds) a tools home the same way it does your blog, " +
          "so new projects start able to publish tools on day one.",
      },
      {
        kind: "fixed",
        text:
          "Tool validation used to assume every tool lives at /tools/<slug>; it now reads " +
          "the real path from the PR, so tools published anywhere else get tested instead " +
          "of failing on a 404.",
      },
    ],
  },
  {
    version: "2026-07-28.2",
    date: "2026-07-28",
    title: "The launch-day audit sweep",
    summary:
      "A full audit of the self-host path: Windows connect is now immune to a known Claude Code header bug, free mode builds without a SERP source, and a dozen edge cases got hardened.",
    changes: [
      {
        kind: "new",
        text:
          "Your project key can now ride in the connect URL itself (?key=...) - the Windows " +
          "connect command uses this, sidestepping a long-standing Claude Code bug where a " +
          "configured auth header is silently dropped on Windows.",
      },
      {
        kind: "fixed",
        text:
          "Free mode (no DataForSEO, no SerpApi) no longer stalls the builder at the SERP " +
          "gate - guides and tools build from Search Console data and product knowledge, and " +
          "say so in the PR.",
      },
      {
        kind: "fixed",
        text:
          "On plain-HTTP installs (localhost, LAN, VPS before HTTPS), Settings and the " +
          "dashboard no longer hand out https:// connect commands that can't connect.",
      },
      {
        kind: "fixed",
        text:
          "Trend radar on a localhost install now says plainly that it needs a public " +
          "address instead of reporting a scan that could never arrive.",
      },
      {
        kind: "improved",
        text:
          "Self-host hardening: schedules survive Windows checkouts (line-ending pin), " +
          "hand-edited .env files are CRLF-normalized on boot, a rotated Claude token " +
          "reaches the builder without a restart, and hung GitHub calls can no longer " +
          "wedge the build loop.",
      },
    ],
  },
  {
    version: "2026-07-28",
    date: "2026-07-28",
    title: "Windows works out of the box",
    summary:
      "Every command DispatchSEO asks you to paste now has a Windows (PowerShell) version, and the connect prompt names your project's server exactly.",
    changes: [
      {
        kind: "new",
        text:
          "Install and restart from plain PowerShell: the quickstart has a Windows paste, and " +
          "start.cmd in the install folder boots the stack from any Windows terminal (or a " +
          "double-click) - no Git Bash needed.",
      },
      {
        kind: "improved",
        text:
          "Commands the wizard and dashboard ask you to paste on your own computer now show " +
          "Mac/Linux and Windows (PowerShell) tabs, defaulting to your system, and the final " +
          "wizard step spells out where each paste goes.",
      },
      {
        kind: "fixed",
        text:
          "The 'paste into Claude Code' prompt named a server (seo-manager) that doesn't match " +
          "what the connect command registers (dispatchseo-<your site>), so a fresh agent " +
          "session could refuse to start. Every prompt now uses your project's exact server name.",
      },
    ],
  },
  {
    version: "2026-07-27.3",
    date: "2026-07-27",
    title: "Your queue refills itself, and setup tells the truth",
    summary:
      "The builder no longer sits idle when the idea queue empties, and the jobs that used to fail quietly now say so.",
    changes: [
      {
        kind: "new",
        text:
          "If your guide queue ever runs empty, research now starts on its own instead of " +
          "waiting for the next weekly run - so a delayed or dropped schedule can't cost you " +
          "a day's post. Still at most one research run a day.",
      },
      {
        kind: "fixed",
        text:
          "Approving a tool, or connecting a brand-new site, could silently do nothing for the " +
          "rest of the day if that day's scheduled run had already happened. Both start " +
          "immediately now.",
      },
      {
        kind: "fixed",
        text:
          "If the GitHub app loses access to your repo, the dashboard now tells you and links " +
          "the fix. Before, merges and approvals just stopped working with nothing to see.",
      },
      {
        kind: "fixed",
        text:
          "Setup could drop you on the final screen having skipped Search Console, your keyword " +
          "source and publish mode. It now resumes exactly where you left off.",
      },
      {
        kind: "improved",
        text:
          "Self-hosted installs: the dashboard is now reachable only from the machine running " +
          "Docker unless you deliberately open it up, matching what the VPS guide always said.",
      },
    ],
  },
  {
    version: "2026-07-27.2",
    date: "2026-07-27",
    title: "Rank tracking that never runs out of budget",
    summary:
      "Smarter, much cheaper SERP checks - and if spend ever runs hot, tracking slows down instead of stopping.",
    changes: [
      {
        kind: "improved",
        text:
          "Rank checks moved to a smarter schedule: keywords ranking in the top 30 are still " +
          "checked every day, and everything gets a full-depth sweep (including Google AI " +
          "Overview citations) every Monday. Same charts, a fraction of the DataForSEO cost.",
      },
      {
        kind: "new",
        text:
          "Budget pacing: if a project's DataForSEO spend is on track to hit its monthly " +
          "budget, checks automatically thin to every-other-day (then weekly) instead of " +
          "cutting out mid-month. The Billing page shows when pacing is active.",
      },
      {
        kind: "improved",
        text:
          "Domain Rating now refreshes weekly - it moves on a monthly scale, and the daily " +
          "re-check was paid money for a number that almost never changed overnight.",
      },
    ],
  },
  {
    version: "2026-07-27",
    date: "2026-07-27",
    title: "A nudge to install Claude for Chrome",
    summary:
      "The \"Get it on Google\" card now points new users at the Chrome extension it needs.",
    changes: [
      {
        kind: "improved",
        text:
          "The indexing card links straight to the Claude for Chrome install page the first " +
          "time it shows up, so the paste-and-go step actually works on the first try.",
      },
    ],
  },
  {
    version: "2026-07-26.4",
    date: "2026-07-26",
    title: "Setup can't touch the wrong site",
    summary:
      "Opening the setup page no longer starts installing into a site you didn't pick.",
    changes: [
      {
        kind: "fixed",
        text:
          "Opening the setup page could start installing the pipeline into whichever site DispatchSEO happened to think was active - committing files and writing a secret to that site's repo without anyone pressing a button. It happened because a site with no saved setup progress landed straight on the final screen, which starts the install by itself. Setup now opens on the Connect GitHub step instead, and only reaches the finish line if you actually walked there.",
      },
      {
        kind: "fixed",
        text:
          "Choosing a repo, saving your Claude token, and installing the pipeline now each name the site they're for. Before, they used whichever site was active, so a stale browser session could have pointed your token or your repo at the wrong one.",
      },
    ],
  },
  {
    version: "2026-07-26.3",
    date: "2026-07-26",
    title: "Deleting a site now actually ends it",
    summary:
      "Deleting a project takes DispatchSEO back out of the connected repo instead of leaving its workflows running.",
    changes: [
      {
        kind: "fixed",
        text:
          "Deleting a project only ever deleted our side of it. The workflows we committed to your repo kept running on schedule, failing against a project that no longer existed, and emailing you about it - with an error blaming DispatchSEO rather than the delete you asked for. Deleting now disables and removes those workflows, the .dispatchseo files, and the SEO_MCP_API_KEY secret.",
      },
      {
        kind: "improved",
        text:
          "Your content is never part of that cleanup. Published guides and tools, the page templates the setup run built, and your sitemap wiring all stay exactly where they are - only our machinery is removed.",
      },
      {
        kind: "new",
        text:
          "Moving a site to another DispatchSEO install? Tick \"leave the repo alone\" when you delete, and the pipeline keeps working while the old project goes away.",
      },
      {
        kind: "improved",
        text:
          "Closing your account cleans out every connected repo the same way, and tells you on the way out if any repo could not be reached.",
      },
    ],
  },
  {
    version: "2026-07-26.2",
    date: "2026-07-26",
    title: "Getting in, and getting out",
    summary:
      "Sign-up and confirmation links actually work now, Settings says which account you're in, and you can close the account yourself.",
    changes: [
      {
        kind: "fixed",
        text:
          "Signing up with an address that already had an account showed \"check your inbox\" for an email that was never sent. It now says the account exists and points you at signing in.",
      },
      {
        kind: "fixed",
        text:
          "The confirmation link in that email dropped you on the homepage instead of signing you in. It now takes you straight into your dashboard.",
      },
      {
        kind: "fixed",
        text:
          "\"Continue with Google\" quietly reused whichever Google account you last signed in with, so a second account could land you in the first one. It asks which account now.",
      },
      {
        kind: "new",
        text: "Settings shows which account you're signed in as.",
      },
      {
        kind: "new",
        text:
          "You can close your account from Settings. It cancels your plan first and removes your sites, and if the cancellation doesn't go through, nothing is deleted.",
      },
      {
        kind: "improved",
        text:
          "Deleting your only site now warns you that it doesn't cancel your plan, and with no sites left the sidebar stops offering links that bounce you back to the wizard.",
      },
    ],
  },
  {
    version: "2026-07-26",
    date: "2026-07-26",
    title: "A shorter, clearer setup",
    summary: "One less screen to click through, and the GitHub step now says what it actually does.",
    changes: [
      {
        kind: "improved",
        text:
          "Setup no longer stops to show you the keys it generated - you go straight into the wizard. Both keys are on Settings whenever you want them.",
      },
      {
        kind: "improved",
        text:
          "The GitHub step is called Connect GitHub, and it's honest about skipping: on a Docker install the bundled builder needs that token to reach your repo at all.",
      },
      {
        kind: "fixed",
        text:
          "Reinstalling on a site whose repo was already set up used to leave setup waiting forever. It now finishes on its own.",
      },
      {
        kind: "fixed",
        text:
          "Self-hosted auto-merge now holds back any pull request that touches files outside your publishing folders, matching what the hosted version has always done.",
      },
    ],
  },
  {
    version: "2026-07-25",
    date: "2026-07-25",
    title: "Updates apply themselves",
    summary:
      "Pipeline updates now install in the background instead of asking you to do anything.",
    changes: [
      {
        kind: "improved",
        text:
          "When your site repo's SEO workflows fall behind, we push the new version through the DispatchSEO GitHub App automatically - no prompt to paste, no banner to read.",
      },
      {
        kind: "new",
        text: "This changelog, plus a heads-up on the dashboard whenever something ships.",
      },
      {
        kind: "improved",
        text: "Signed in already? The landing page sends you straight to your dashboard.",
      },
    ],
  },
  {
    version: "2026-07-24",
    date: "2026-07-24",
    title: "A calmer dashboard",
    summary: "Quieter onboarding, a new look, and failure emails that actually reach you.",
    changes: [
      { kind: "new", text: "New pixel-art walkie mark across the app, favicon, and share images." },
      {
        kind: "new",
        text: "One background-work banner during first run, replacing the pile of setup cards - and Log out is finally in the sidebar.",
      },
      {
        kind: "improved",
        text: "Switching projects shows a loading state instead of appearing to freeze.",
      },
      {
        kind: "fixed",
        text: "When a background job fails on a hosted project, the email goes to you, not just to us.",
      },
      {
        kind: "fixed",
        text: "No more false \"your secrets are wrong\" alerts while setup is still running.",
      },
    ],
  },
  {
    version: "2026-07-23",
    date: "2026-07-23",
    title: "Get in while setup runs",
    summary: "The dashboard opens as soon as your repo is connected, mid-setup.",
    changes: [
      {
        kind: "new",
        text: "Connect the repo and start exploring - a top banner tracks the setup run instead of locking you out until it finishes.",
      },
      {
        kind: "fixed",
        text: "Search Console on hosted projects syncs through your own Google connection, so your data lands even without granting us service-account access.",
      },
      {
        kind: "fixed",
        text: "Email confirmation links land on the right page instead of a 404.",
      },
    ],
  },
];

export const LATEST = CHANGELOG[0];

/**
 * Versions that were announced under their own id and have since been folded
 * into a later release: `{ absorbed: the release that now tells its story }`.
 *
 * 1.0.0 exists because 2026-07-31 shipped six separate releases in one day -
 * the spam that versioning is here to stop - so it absorbs all six. But those
 * six were already posted to Discord, and a Discord post is permanent, public
 * and deep-links to `#v-<version>`. Folding an entry without leaving its anchor
 * behind would turn six real posts into six links to nothing.
 *
 * So /changelog keeps an anchor for every absorbed version on the release that
 * absorbed it. Rows are never removed - the post a row rescues never expires -
 * and folding should stay rare enough that this map stays short. The everyday
 * answer is to cut fewer releases in the first place.
 */
export const FOLDED_INTO: Record<string, string> = {
  "2026-07-31.7": "1.0.0",
  "2026-07-31.6": "1.0.0",
  "2026-07-31.5": "1.0.0",
  "2026-07-31.4": "1.0.0",
  "2026-07-31.3": "1.0.0",
  "2026-07-31.2": "1.0.0",
};

/** The absorbed versions a release has to answer for, as extra page anchors. */
export function foldedInto(version: string): string[] {
  return Object.keys(FOLDED_INTO).filter((absorbed) => FOLDED_INTO[absorbed] === version);
}

/** Anchor id for an entry - `/changelog#v-1.0.0`. */
export function anchorFor(version: string): string {
  return `v-${version}`;
}

export const CHANGELOG_COOKIE = "ds_whats_new";

const SEMVER = /^\d+\.\d+\.\d+$/;
const DATED = /^\d{4}-\d{2}-\d{2}(\.\d+)?$/;

// Versions are echoed back from the client (the dismiss action) and used as
// cookie values, so they get the same shape check both ways. The dated shape
// stays accepted forever: browsers still hold cookies naming a pre-1.0.0
// release, and rejecting one would re-announce that release to its owner.
export function isVersionString(v: string): boolean {
  return SEMVER.test(v) || DATED.test(v);
}

/**
 * How a release calls itself in the UI - `v1.2.0`, or null for the dated
 * entries that predate versioning. Those already show their date on the rail,
 * so a `v2026-07-31.4` badge beside it would just say the same thing twice.
 */
export function releaseLabel(version: string): string | null {
  return SEMVER.test(version) ? `v${version}` : null;
}

// Whether to announce a release to this visitor. Three ways to stay quiet:
//   - the release didn't opt into the banner (`announce` unset - the default;
//     releases ship near-daily, so only the ones the owner should stop and
//     read about get to interrupt the dashboard),
//   - they've already acknowledged this version (the cookie), or
//   - the release predates their project, so it isn't news to them - a brand
//     new signup should not be greeted with "DispatchSEO has been updated!".
// The cookie is per-browser, not per-account: a returning owner on a new
// device may see one release announced twice. That's the cheap tradeoff for
// not putting a per-user row behind this.
//
// "Already acknowledged" is a POSITION in this list, not a string comparison.
// Dated versions happened to sort correctly as strings; semver does not -
// "1.10.0" sorts below "1.9.0", so a `>=` test would go permanently silent at
// the tenth minor release, and the same bug was already latent in the dated
// scheme ("2026-07-31.10" < "2026-07-31.9"). The list is append-only and
// newest-first, so the cookie's index says it exactly: index 0 is the newest.
// A version that isn't in the list at all - a hand-edited cookie, or one
// naming an entry that somehow left - counts as unseen, because announcing
// once too often is the harmless direction to be wrong in.
//
// It looks at every unseen release, not only the newest one. Only checking
// CHANGELOG[0] meant a quiet release BURIED the announcement before it: cut
// 1.4.0 with announce, cut a 1.4.1 typo fix the next morning, and the banner
// the owner was meant to stop and read never appeared for anyone who hadn't
// opened the dashboard in that one day. Opting in is rare and deliberate, so a
// patch shipped on top of it must not silently cancel it.
export function unseenRelease(
  seenVersion: string | undefined,
  projectCreatedAt: string | null | undefined,
): ChangelogEntry | null {
  // Everything newer than what they acknowledged. Position, not string
  // comparison, for the reason above - and an unrecognised cookie means "seen
  // nothing", so the whole list is in play.
  const seenIndex = seenVersion ? CHANGELOG.findIndex((e) => e.version === seenVersion) : -1;
  const unseen = CHANGELOG.slice(0, seenIndex === -1 ? CHANGELOG.length : seenIndex);
  // Newest-first, so the first opted-in release in that slice is the newest one
  // they haven't seen. Dismissing it stores ITS version, which moves the
  // boundary past it, so this converges instead of re-announcing.
  const release = unseen.find((e) => e.announce);
  if (!release) return null;
  if (projectCreatedAt) {
    const created = new Date(projectCreatedAt).getTime();
    // Compare against the end of the release day: an entry dated the same day
    // the project was created still counts as pre-existing. No point looking
    // further down the list either - older entries are older still.
    const released = new Date(`${release.date}T23:59:59Z`).getTime();
    if (Number.isFinite(created) && created > released) return null;
  }
  return release;
}
