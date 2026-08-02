import type { ComponentType } from "react";
import { InternalLinkingTool } from "@/components/free-tools/internal-linking-tool";
import { FaqSchemaGenerator } from "@/components/free-tools/faq-schema-generator";

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
];

export function getAllTools(): ToolEntry[] {
  return FREE_TOOLS;
}

export function getTool(slug: string): ToolEntry | null {
  return FREE_TOOLS.find((t) => t.slug === slug) ?? null;
}
