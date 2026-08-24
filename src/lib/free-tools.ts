import type { ComponentType } from "react";
import { InternalLinkingTool } from "@/components/free-tools/internal-linking-tool";
import { FaqSchemaGenerator } from "@/components/free-tools/faq-schema-generator";
import { KeywordCannibalizationChecker } from "@/components/free-tools/keyword-cannibalization-checker";
import { KeywordClusteringTool } from "@/components/free-tools/keyword-clustering-tool";
import { TitleLengthChecker } from "@/components/free-tools/title-length-checker";
import { UrlSlugGenerator } from "@/components/free-tools/url-slug-generator";
import { H1TagChecker } from "@/components/free-tools/h1-tag-checker";

// Registry for the free, public interactive tools at /free-tools/<slug>.
// One entry per tool - everything the index card and the detail page's
// locked funnel (title -> value line -> widget -> CTA -> description -> FAQ)
// need to render. Add a tool by adding an entry here and a widget component
// under src/components/free-tools/; nothing else has to change.

export type ToolFaqItem = {
  question: string;
  answer: string;
};

export type ToolEntry = {
  slug: string;
  /** <title> tag and index-page card heading. */
  title: string;
  /** Large centered hero heading on the detail page - usually == title. */
  h1: string;
  /** One line under the h1 stating what the user walks away with. */
  valueLine: string;
  metaDescription: string;
  /** Description copy below the widget, one paragraph per entry. */
  description: string[];
  faq: ToolFaqItem[];
  Widget: ComponentType;
};

export const FREE_TOOLS: ToolEntry[] = [
  {
    slug: "internal-linking-tool",
    title: "Internal linking tool",
    h1: "Internal linking tool",
    valueLine:
      "Paste in a few pages and get back concrete internal-link suggestions - which page should link to which, and the exact anchor text to use, pulled straight from your own words.",
    metaDescription:
      "Free internal linking tool: paste in your pages and get link suggestions with ready-to-use anchor text, computed entirely in your browser. No signup, no crawling.",
    description: [
      "Paste in the title and body text of two or more pages from your site and this tool looks for real topical overlap between them: shared phrases that are a big part of what one page is about and that already show up, word for word, somewhere in the other page's text. When it finds one, it tells you which page should link to which and hands you the exact anchor text to use - never a made-up phrase, always something pulled straight from what you pasted.",
      "It weighs two-word phrases over single keywords (\"internal linking\" beats \"linking\" on its own) and gives extra weight to anything that also shows up in a page's title, since that's usually the strongest signal of what a page is actually about. Paste your homepage and a blog post that happens to reference the same feature, for example, and it will surface that exact sentence as the link opportunity rather than a generic \"these seem related\" guess.",
      "Nothing you paste is uploaded anywhere - the whole analysis runs in your browser tab. That also means it works on any site, in any CMS, not just ones a crawler can reach.",
      "This is the same kind of linking decision DispatchSEO's own pipeline makes automatically for every guide it publishes - see how that fits into a fully " +
        "[automated SEO agent](/blog/ai-seo-agent) if you'd rather not paste pages in by hand every time your site grows.",
    ],
    faq: [
      {
        question: "How does it decide which pages should link to which?",
        answer:
          "It tokenizes the text you paste into single words and two-word phrases, drops common filler words, and boosts anything that also appears in a page's title. Then for each pair of pages it checks whether one page's most important phrase literally appears in the other page's text. If it does, that's the suggestion - the anchor text is always a verbatim quote from your own paste, never invented.",
      },
      {
        question: "Do I need to give it my website URL?",
        answer:
          "No. You paste in page content directly instead of pointing it at a URL. That's deliberate: a tool running in your browser can't reliably fetch other websites' pages (browsers block that for almost any site that isn't the one you're on), so pasting is what actually works reliably, on any site, without needing account access to anything.",
      },
      {
        question: "Why didn't it suggest anything for some of my pages?",
        answer:
          "It only surfaces a suggestion when there's a real, meaningful phrase shared between two pages - not a coincidental single word. If two pages genuinely don't overlap, or you've only pasted a short excerpt, it says so honestly instead of forcing a weak match.",
      },
      {
        question: "Is this the same linking logic DispatchSEO uses for its own content?",
        answer:
          "It's a taste of it. DispatchSEO's pipeline wires new guides into your existing content automatically, on every build, as part of running your SEO end to end - this free tool does the same kind of matching by hand, one paste at a time.",
      },
      {
        question: "How many pages can I paste in at once?",
        answer:
          "There's no hard limit, but results stay easiest to act on with somewhere around 5-15 pages at a time. Each page caps out at 5 outgoing suggestions so the results don't push you toward over-linking.",
      },
      {
        question: "Does it work for sites that aren't on WordPress?",
        answer:
          "Yes - since you paste content in rather than pointing it at a crawler, it works the same way regardless of what the site is built on.",
      },
    ],
    Widget: InternalLinkingTool,
  },
  {
    slug: "faq-schema-generator",
    title: "FAQ schema generator",
    h1: "FAQ schema generator",
    valueLine:
      "Type your questions and answers, get back valid FAQPage JSON-LD as you go - plus an honest read on what it will and won't do for you in Google right now.",
    metaDescription:
      "Free FAQ schema generator: type Q&A pairs and get spec-correct FAQPage JSON-LD, validated for duplicates and stray HTML, with a straight answer on Google's 2026 rich-result eligibility rules.",
    description: [
      "Type a question and its answer into a row and this tool builds the matching FAQPage JSON-LD as you go - no submit button, the script tag at the bottom just stays current. Add as many rows as you need; each one is checked on its own for the things that actually break FAQ markup - an empty field, a question repeated word-for-word further up the list, stray HTML tags left in from a copy-paste, or an answer so short it isn't really answering anything. A row with a problem stays out of the generated JSON-LD until you fix it, but it never blocks the rows that are fine.",
      "One thing most FAQ generators still won't tell you: Google restricted the FAQ rich result to \"well-known, authoritative government and health websites\" in August 2023, then pulled it from Search entirely for everyone else on May 7, 2026. If your site isn't in one of those two categories, this markup isn't going to grow your listing in Google the way it used to. It's still legitimate structured data - FAQPage JSON-LD is a standard way to hand any crawler (Bing, an AI answer engine, your own site's tooling) a clean question-and-answer pairing instead of loose HTML - it just isn't a Google rich-snippet play anymore, and this tool says so up front instead of quietly assuming otherwise.",
      "Nothing you type is uploaded anywhere - the whole thing runs in your browser tab, the same as this site's " +
        "[internal linking tool](/free-tools/internal-linking-tool). Copy the finished script tag into your page's head and you're done.",
      "This is one small, hand-run piece of what a full " +
        "[automated SEO agent](/blog/ai-seo-agent) does on a schedule - deciding what markup a page needs and shipping it as part of the build, not as a separate manual step.",
    ],
    faq: [
      {
        question: "Does FAQ schema still help me rank in Google?",
        answer:
          "Not the way it used to. Google restricted the FAQ rich result to well-known government and health sites in August 2023, then removed the feature from Search entirely for everyone else starting May 7, 2026. Adding this markup today won't grow your listing with an expandable Q&A block in Google - that visual result is gone for almost everyone. It can still help other places that read structured data, like Bing or an AI answer engine summarizing your page.",
      },
      {
        question: "Then why generate it at all?",
        answer:
          "Because FAQPage JSON-LD is still a standard, machine-readable way to say \"this text is a question, this text is its answer\" - useful for any crawler that isn't Google's rich-result system, and for keeping your own FAQ content in one clean structured block instead of scattered across ad hoc headings and paragraphs. Just don't build it expecting a Google rich snippet.",
      },
      {
        question: "Why did it exclude one of my questions?",
        answer:
          "Each row is checked for the things that break FAQ markup: an empty question or answer, an answer under 10 characters (too thin to be a real answer), HTML tags left over from a paste, or a question that's a word-for-word repeat of one already in your list. A flagged row is listed with the specific problem and left out of the generated JSON-LD until you fix it - it never blocks the rows that are already fine.",
      },
      {
        question: "Does the marked-up text need to match what's visible on my page?",
        answer:
          "Yes - that's one of Google's general structured data rules, not specific to FAQs: don't mark up content that isn't actually shown to readers. Paste the same question and answer text you display on the page, not a rewritten or padded version, and you'll be fine regardless of which rich-result policy is in effect at the time.",
      },
      {
        question: "Can I use this for more than one FAQ block on a site?",
        answer:
          "Yes - run it again for each page's set of questions and paste the resulting script tag into that page's head. There's no limit on how many questions one script tag can hold, but keeping each block scoped to the FAQ actually visible on that page is what the content-matching rule above is asking for.",
      },
    ],
    Widget: FaqSchemaGenerator,
  },
  {
    slug: "keyword-cannibalization-checker",
    title: "Keyword cannibalization checker",
    h1: "Keyword cannibalization checker",
    valueLine:
      "Paste in the title and target keyword for a few pages and see exactly which pairs are fighting for the same search - plus which one to keep as the canonical page.",
    metaDescription:
      "Free keyword cannibalization checker: paste in each page's title and target keyword and see which pairs compete for the same search, with a canonical pick - no Search Console connection required, computed entirely in your browser.",
    description: [
      "Paste in the title and target keyword for two or more pages and this tool checks each pair for two different kinds of conflict: an exact match, where two pages are literally targeting the same keyword word for word, and a partial one, where the titles and keywords share enough of the same terms that they're probably still fighting for the same search. \"Best running shoes for flat feet\" and \"top running shoes for flat feet\" would flag as a direct conflict once filler words are stripped - both reduce to the same core terms - while that page and \"running shoe buying guide for beginners\" would only flag if the shared terms clear a real overlap threshold, not just because both happen to mention running shoes.",
      "When it finds a conflict, it also tells you which page to keep. That call comes from a real, computed signal - how much of each page's own target keyword already shows up in its own title - not a guess at which one ranks better, since this tool has no access to your rankings or Search Console data. The page whose title is more tightly written for its keyword gets recommended as canonical; the other gets a merge-or-redirect suggestion, with the exact overlapping terms shown so you can see why.",
      "That's a deliberate scope limit, not a missing feature: Sitechecker's version needs your Search Console connected, and the Rows and Ivanhoe templates need you to wire up your own spreadsheet first. This one works from the page facts you already have, which means it works before a page is even published - Search Console can't show a conflict for a URL that doesn't exist yet. Once you've cleared out the conflicts, [DispatchSEO's internal linking tool](/free-tools/internal-linking-tool) is the natural next step for wiring the pages that are left into each other properly.",
      "Nothing you paste is uploaded anywhere - the whole comparison runs in your browser tab. This is the same check DispatchSEO's own pipeline runs before it ever proposes a new page: the suggestion queue is checked against everything already published, so it can't queue two guides for the same keyword in the first place. See how that fits into a fully " +
        "[automated SEO agent](/blog/ai-seo-agent) if you'd rather this run itself on a schedule instead of pasting pages in by hand.",
    ],
    faq: [
      {
        question: "How does it decide two pages are competing for the same keyword?",
        answer:
          "It strips filler words from each page's title and target keyword, then compares the two sets of remaining terms. If a pair reduces to the exact same terms, that's flagged as direct cannibalization. If they only partially overlap, it's scored against a threshold and flagged as a possible overlap only when the shared terms make up a large enough share of what's left - a single shared word like \"guide\" or \"seo\" isn't enough on its own.",
      },
      {
        question: "Do I need to connect Google Search Console?",
        answer:
          "No. Search Console-based cannibalization checkers compare which URLs actually get impressions for the same query, which means they can only see a conflict after both pages are live and indexed. This tool compares what you tell it you're targeting, so it works before a page is even published - useful for catching the problem during planning instead of after Google has already split the ranking signal between two URLs.",
      },
      {
        question: "Which page does it tell me to keep?",
        answer:
          "Whichever page's title already matches more of its own target keyword's words - a real, computed comparison, not a guess at which one ranks better, since it has no access to your rankings. If neither title is closely aligned with its keyword, it says so honestly instead of picking one arbitrarily, and suggests keeping whichever page currently ranks or has more backlinks.",
      },
      {
        question: "What's the difference between \"direct cannibalization\" and \"possible overlap\"?",
        answer:
          "Direct cannibalization means two pages reduce to the exact same target keyword once filler words are stripped - they're built to answer the identical search. Possible overlap means the titles and keywords share enough terms to likely compete without being identical - two pages that both target something about \"email deliverability\" but with different modifiers, for example. Both are worth fixing; direct conflicts are worth fixing first.",
      },
      {
        question: "Is my data uploaded anywhere?",
        answer: "No. Nothing you paste in leaves your browser tab - there's no server call involved in the comparison.",
      },
      {
        question: "Can I use this for pages that aren't published yet?",
        answer:
          "Yes - that's actually the main use case. Paste in the title and target keyword you're planning for a new page alongside your existing pages, and you'll catch a conflict before you publish instead of after Search Console shows you two URLs splitting the same query's traffic.",
      },
    ],
    Widget: KeywordCannibalizationChecker,
  },
  {
    slug: "keyword-clustering-tool",
    title: "Keyword clustering tool",
    h1: "Keyword clustering tool",
    valueLine:
      "Paste in a keyword list and see which ones should share one page, which need their own sections, and which are safe to build standalone - grouped by real word overlap, not a guess.",
    metaDescription:
      "Free keyword clustering tool: paste in your keyword list and get grouped clusters with a one-page-or-many verdict for each, computed entirely in your browser. No signup, no API calls.",
    description: [
      "Paste in a list of keywords, one per line, and this tool groups the ones that share real overlap - not just a common word, but enough shared terms that they're probably fighting for the same search. \"Best running shoes for flat feet\" and \"top running shoes for flat feet\" cluster as a same-page match: strip the filler words and they reduce to the identical set of terms, so building two pages for them just splits your own ranking signal. Paste those two lines in and that's exactly the verdict you'll get.",
      "Some clusters are a softer call. \"Email deliverability tips\" and \"improve email deliverability rate\" share enough terms to belong on one page, but they're distinct enough to earn their own section rather than getting merged into one sentence - the tool labels that case \"one page, multiple sections\" instead of forcing it into the same bucket as a near-duplicate pair. A keyword with no real overlap to anything else you pasted comes back standalone: safe to build its own page.",
      "This is the same judgment call DispatchSEO's own research workflow makes before it ever queues a page suggestion - it won't propose two guides for keywords that should really be one. Once you've grouped your list, [the keyword cannibalization checker](/free-tools/keyword-cannibalization-checker) is the natural next step if you've already got titles drafted and want to confirm two pages that already exist aren't competing. See how both fit into a fully " +
        "[automated SEO agent](/blog/ai-seo-agent) if you'd rather this run itself against your whole keyword list on a schedule.",
      "Nothing you paste is uploaded anywhere - the grouping runs entirely in your browser tab, so it works on any keyword list from any source, not just ones a connected tool can see.",
    ],
    faq: [
      {
        question: "How does it decide which keywords belong together?",
        answer:
          "It strips filler words from each keyword, then compares what's left as single words and two-word phrases. Two keywords join the same cluster once they share enough of those terms - a single coincidental word like \"seo\" or \"best\" isn't enough on its own, but a real chunk of shared vocabulary is.",
      },
      {
        question: "Why does it say \"one page, multiple sections\" instead of just merging or splitting?",
        answer:
          "Because not every cluster is a near-duplicate. When the shared overlap is high, the keywords are close enough to be the same search asked two ways, and one page should answer both. When the overlap is real but partial, they're related enough to live on the same page while still being distinct enough to deserve their own heading rather than getting flattened into one sentence.",
      },
      {
        question: "Do I need to give it a URL or connect Search Console?",
        answer:
          "No. You paste in the keywords themselves - there's no crawling and no account to connect. That also means it works on keyword ideas you haven't built pages for yet, which a tool that reads live rankings can't do.",
      },
      {
        question: "Is my keyword list uploaded anywhere?",
        answer: "No. Nothing you paste in leaves your browser tab - there's no server call involved in the clustering.",
      },
      {
        question: "How many keywords can I paste in at once?",
        answer:
          "Up to 300 unique keywords in one pass. Paste more than that and the tool clusters the first 300 and tells you plainly that the rest were left out, rather than silently dropping them.",
      },
      {
        question: "Does this replace the keyword cannibalization checker?",
        answer:
          "They answer different moments of the same question. This tool groups a raw keyword list before you've written anything, so you know how many pages to actually build. The cannibalization checker compares titles and target keywords for pages you've already planned or published, to catch a conflict that slipped through.",
      },
    ],
    Widget: KeywordClusteringTool,
  },
  {
    slug: "seo-title-length-checker",
    title: "SEO title length checker",
    h1: "SEO title length checker",
    valueLine:
      "Type your title and meta description and see, in real pixels, exactly where Google is likely to cut them off - plus a live preview of the result.",
    metaDescription:
      "Free SEO title length checker: live pixel width and character count for your title and meta description, with a Google-style snippet preview, computed entirely in your browser.",
    description: [
      "Type a page title and this tool measures its actual rendered pixel width, not just the character count - the same way a browser would draw it. That distinction matters more than most title checkers let on: a title full of narrow letters like \"i\" and \"l\" can run well past 60 characters and still fit fine, while one full of wide capitals can get cut off at 50. Google's own documentation is upfront that it doesn't publish a fixed cutoff - titles and descriptions are \"truncated as needed, typically to fit the device width\" - so a flat character limit was always an approximation. This tool uses the practical numbers the SEO industry has actually measured instead: titles tend to hold up to about 550 pixels (roughly 50-60 characters), and Google's observed average snippet length before truncation kicks in is about 146 characters on desktop and 136 on mobile.",
      "As you type, the title and description each get a live verdict - safe, cutting it close, or likely to get cut off - and the preview below truncates the same way Google would, with a real ellipsis at the real cutoff point, not just a warning label. Switch between the desktop and mobile tabs and the preview card actually changes width, so you can see how the same title wraps differently depending on where someone's reading it.",
      "Nothing you type is uploaded anywhere - the whole thing runs in your browser tab, the same as this site's " +
        "[FAQ schema generator](/free-tools/faq-schema-generator). Once your title and description both come back safe, [the keyword cannibalization checker](/free-tools/keyword-cannibalization-checker) is a good next stop if you're publishing more than one page around the same topic.",
      "This is the same check DispatchSEO's own pipeline runs on every title and description before it proposes a new page - a page that gets truncated in the search result is a page that loses clicks it already earned by ranking. See how that fits into a fully " +
        "[automated SEO agent](/blog/ai-seo-agent) if you'd rather this run itself on every page your site publishes.",
    ],
    faq: [
      {
        question: "Does Google actually have a fixed title length limit?",
        answer:
          "No - and this tool doesn't pretend otherwise. Google's own documentation says titles and descriptions are truncated \"as needed, typically to fit the device width,\" with no published character or pixel number. What this tool checks you against instead is the practical figures the SEO industry has measured over time: titles tend to hold up to around 550 pixels before truncation starts, which usually works out to 50-60 characters depending on which letters you use.",
      },
      {
        question: "Why does it measure pixels instead of just counting characters?",
        answer:
          "Because Google renders your title, it doesn't count it. \"Slim Fit Jeans\" and \"Wide Winter Coats\" are both 15 characters, but the second one is noticeably wider on screen - wide capital letters and \"W\"s and \"M\"s take up more room than narrow ones like \"i\" and \"l\". This tool measures the actual rendered width in your browser, the same way a character-count-only checker can't.",
      },
      {
        question: "Why do desktop and mobile show different description limits?",
        answer:
          "Because they behave differently in practice, even though Google doesn't publish separate numbers for each. The 146-character and 136-character figures this tool checks against are Semrush's own observed averages for snippet length before truncation on desktop versus mobile - directional, not guaranteed, which is why the preview card itself also changes width when you switch tabs so you can see the actual wrapping.",
      },
      {
        question: "Is my title or description uploaded anywhere?",
        answer: "No. Nothing you type leaves your browser tab - the pixel measurement and the preview are both computed locally.",
      },
      {
        question: "My title looks fine here but got cut off in an actual Google search - why?",
        answer:
          "Because this tool checks you against practical, measured averages, not a guarantee - Google's own stance is that truncation depends on the specific device width someone is searching from, which varies. Treat a \"safe\" verdict here as a strong likelihood, not a promise, and lean toward the shorter end of the range if a title is genuinely borderline.",
      },
    ],
    Widget: TitleLengthChecker,
  },
  {
    slug: "url-slug-generator",
    title: "URL slug generator",
    h1: "URL slug generator",
    valueLine:
      "Type a page title and get a clean, hyphenated slug back as you type - accented letters handled, filler words optionally dropped, checked against a length guideline so it never gets awkward in a search result.",
    metaDescription:
      "Free URL slug generator: type a title and get a clean, SEO-friendly slug live as you type, with accented-character handling, optional filler-word stripping, and a length check - computed entirely in your browser.",
    description: [
      "Type a title and this tool turns it into a slug as you go: lowercased, spaces and punctuation collapsed into single hyphens, and accented letters converted to their plain equivalents so \"Café Marketing Guide\" becomes \"cafe-marketing-guide\" instead of breaking or getting silently dropped. Turn on the filler-word toggle and it also drops short connector words like \"a\", \"the\", \"of\", and \"and\" - \"The Guide to SEO Automation\" becomes \"guide-seo-automation\" instead of carrying three words that don't change what the page is about.",
      "Every slug is checked against a 60-character guideline as you type, with a running character count next to a plain safe-or-long verdict. That number isn't arbitrary: a long slug makes the full URL harder to read in a search result or a shared link, and it's the same rough ceiling this site's own title length checker uses for the visible part of a listing. If your title runs long, the count tells you before you've committed a filename to it.",
      "Nothing you type is uploaded anywhere - the whole transform runs in your browser tab, the same as this site's " +
        "[SEO title length checker](/free-tools/seo-title-length-checker). Once your slug and title both check out, that's the other half of what shows up in a search result for a new page.",
      "This is the exact naming decision DispatchSEO's own pipeline makes for every guide it publishes - the slug it picks becomes the file name and the URL in one step, without a human typing it by hand. See how that fits into a fully " +
        "[automated SEO agent](/blog/ai-seo-agent) if you'd rather this run itself for every page your site ships.",
    ],
    faq: [
      {
        question: "How does it handle accented or non-English letters?",
        answer:
          "It converts accented Latin letters to their plain equivalents - \"café\" becomes \"cafe\", \"Zürich\" becomes \"zurich\" - using the same Unicode normalization every modern browser supports, not a hand-picked list of substitutions. Scripts that don't reduce to Latin letters or digits at all (Chinese, Arabic, Cyrillic) can leave nothing usable behind; the tool says so plainly instead of quietly outputting an empty slug.",
      },
      {
        question: "What counts as a \"filler word\" it strips?",
        answer:
          "A short, fixed list of connector words - articles like \"a\" and \"the\", conjunctions like \"and\" and \"or\", and a handful of prepositions like \"of\" and \"for\" - that add length to a URL without changing what a reader thinks the page is about. It's a narrower list than what a full-text tool like the internal linking tool filters, because a slug only has a handful of words to work with in the first place. If stripping them would empty the slug entirely - a title that's only filler words - it keeps the original words instead.",
      },
      {
        question: "Why 60 characters specifically?",
        answer:
          "It's a practical target, not a hard platform limit - no search engine publishes an official slug-length cutoff. 60 characters is roughly where a URL starts crowding a search result or looking unwieldy pasted into a link, the same rough ceiling this site's title length checker uses for the visible part of a listing. Go over it and the slug still works; it's a nudge to trim, not a wall.",
      },
      {
        question: "Is my title uploaded anywhere?",
        answer: "No. Nothing you type leaves your browser tab - the whole transform is computed locally.",
      },
      {
        question: "Does it collapse repeated hyphens or trim stray punctuation?",
        answer:
          "Yes. Any run of spaces, punctuation, or symbols - including a title that already has hyphens in it - collapses into a single hyphen, and nothing but lowercase letters, digits, and hyphens survives into the final slug.",
      },
    ],
    Widget: UrlSlugGenerator,
  },
  {
    slug: "h1-tag-checker",
    title: "H1 tag checker",
    h1: "H1 tag checker",
    valueLine:
      "Paste your page's HTML and see exactly what's wrong with its H1 tags - missing, doubled up, or not matching what you're trying to rank for - with a fix for each, not just a red X.",
    metaDescription:
      "Free H1 tag checker: paste your page's HTML and get an honest audit of its H1s - count, length, and how well they match your target keyword - computed entirely in your browser.",
    description: [
      "Paste your page's HTML in and this tool parses out every <h1> tag on it - not by guessing from plain text, but by actually parsing the markup, so a stray H1 tucked inside a hidden menu or a component you forgot about still gets caught. Paste a page with zero H1s and it says so plainly with a fix; paste one with three and it tells you exactly how many, quotes each one back to you, and explains what to do about it - rather than just a red X.",
      "That second case is where most H1 checkers get it wrong: they treat more than one H1 as an automatic error. Google's own SEO starter guide says the opposite - heading order and count don't affect ranking, and there's \"no magical, ideal amount of headings a given page should have.\" This tool still flags multiple H1s, because one clear heading is genuinely easier for a reader (or a screen reader) to follow, but it says so as a heads-up, not a fabricated penalty.",
      "Give it a target keyword and it also checks how well each H1 matches - not a simple exact-string test, but the same kind of stopword-filtered term-overlap scoring [the keyword cannibalization checker](/free-tools/keyword-cannibalization-checker) uses: it strips filler words from your keyword, then checks which of the remaining words actually show up in the H1. Target \"best running shoes for flat feet\" against an H1 of \"Our Running Shoe Guide\" and it'll tell you \"running\" matched but \"shoes,\" \"flat,\" and \"feet\" didn't - specific enough to act on, not just a pass or fail.",
      "Nothing you paste is uploaded anywhere - the whole thing runs in your browser tab, the same as this site's [SEO title length checker](/free-tools/seo-title-length-checker), the natural next stop for auditing the other half of what shows up in a search result. This is the same on-page check DispatchSEO's own pipeline runs before it ever proposes a new page - see how that fits into a fully " +
        "[automated SEO agent](/blog/ai-seo-agent) if you'd rather this run itself on a schedule instead of pasting HTML in by hand.",
    ],
    faq: [
      {
        question: "Does having more than one H1 actually hurt my SEO?",
        answer:
          "No, not directly - Google's own SEO starter guide is explicit that heading order and count don't affect ranking, and that there's no ideal number of headings a page should have. This tool still flags multiple H1s as a heads-up, not an error, because one clear heading is still easier for a reader or a screen reader to follow - not because Google penalizes the extra tags.",
      },
      {
        question: "How does it decide whether my H1 matches my target keyword?",
        answer:
          "It strips filler words like \"the\" and \"for\" from your keyword, then checks which of the remaining significant words show up verbatim in the H1 text - the same kind of term-overlap scoring the site's other analyzers use, not a simple exact-string comparison. A partial match still counts for something; it tells you exactly which words are missing so you know what to add.",
      },
      {
        question: "Why did it say my HTML \"doesn't look like HTML\"?",
        answer:
          "Because parsing it turned up zero actual elements, which usually means plain text got pasted instead of markup. Paste your page's real HTML source - right-click and choose View Page Source, or copy the markup from your browser's dev tools - rather than just the visible heading text, and it'll parse correctly.",
      },
      {
        question: "Is my HTML uploaded anywhere?",
        answer:
          "No. Parsing the HTML and scoring the keyword match both run in your browser tab using the browser's own HTML parser. Nothing you paste is sent to a server.",
      },
      {
        question: "Why 15-70 characters for H1 length?",
        answer:
          "It's a practical convention, not a platform rule - Google doesn't publish an H1 length limit any more than it publishes one for title tags. Under about 15 characters an H1 usually reads as too generic to say what the page is about; over about 70 it gets hard to scan at a glance. Go outside that range and the tool still works - it's a nudge, not a wall.",
      },
      {
        question: "Can I check a page that isn't live yet?",
        answer:
          "Yes - that's actually the main use case. Since you paste in the HTML directly instead of giving it a URL to crawl, it works on a draft, a staged build, or anything still behind a login, which a URL-based checker can't reach.",
      },
    ],
    Widget: H1TagChecker,
  },
];

export function getAllTools(): ToolEntry[] {
  return FREE_TOOLS;
}

export function getTool(slug: string): ToolEntry | null {
  return FREE_TOOLS.find((t) => t.slug === slug) ?? null;
}
