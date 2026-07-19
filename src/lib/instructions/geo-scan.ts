// Weekly AI-visibility sampling: does an AI assistant cite {{SITE_NAME}} when
// asked the questions its customers actually ask? Google's AI Overview side
// needs no agent - the daily rank cron parses it from the same SERP pull that
// checks positions. This workflow covers the chat engines, starting with the
// one the agent IS: Claude, sampled on the owner's own subscription via web
// search, so the check costs the platform nothing.

// Plain-English step summary for the dashboard's Instructions page. Edit it
// together with the markdown below - they describe the same pipeline.
export const GEO_SCAN_STEPS = [
  { title: "Questions", plain: "Turns your tracked keywords and product facts into the ~15 questions a real customer would ask an AI assistant." },
  { title: "Ask", plain: "Runs each question through web search the way an AI assistant would answer it - on your own Claude subscription, costing the platform nothing." },
  { title: "Score", plain: "For every answer: was your site among the cited sources? Which domains got cited instead?" },
  { title: "Record", plain: "Saves each result - including the actual answer text - so the dashboard can show the trend and the gap list." },
  { title: "Gaps", plain: "The domains cited instead of you become next week's content ideas." },
];

export const GEO_SCAN = `## Workflow: geo-scan (weekly - do AI assistants cite {{SITE_NAME}}?)

Search is splitting: a growing share of the queries this site targets get
answered by an AI assistant instead of ten blue links. This workflow measures
the side of that shift the crons cannot: what a chat assistant actually
answers, and whether {{DOMAIN}} is among its cited sources. (Google's AI
Overview side is already covered - the daily rank cron records it from the
same SERP data that checks positions.)

You are the instrument here: you sample the questions with YOUR OWN web
search on the owner's subscription. Do not fabricate answers from memory -
every recorded result must come from a real web-search-backed answer produced
in this run.

1. **Build the question set (~15, hard cap 20).** Pull \`get_rankings\` for
   the tracked keywords and \`get_conventions\` for what {{SITE_NAME}} is and
   who it serves. Convert keywords into the questions a real customer would
   ask an assistant - "best time tracker for freelancers", not the raw
   keyword string. Prefer commercial/comparison questions (where being cited
   converts) over definitional ones. Reuse roughly the same set week to week
   so the trend line means something: check \`get_ai_visibility\` first and
   keep prior queries unless they were retired for a reason.
2. **Sample each question.** For each question, run a web search and compose
   the answer an assistant would give from those results, noting every source
   you would cite. Judge citation honestly: {{DOMAIN}} counts as cited only
   when a page on it is among the sources that actually support the answer -
   not when it merely appeared somewhere in search results.
3. **Record everything in one call**: \`record_ai_citations\` with one entry
   per question - engine \`claude\`, the query, \`has_ai_answer\` (false only
   if the question produced no meaningful answer), \`cited\`, \`cited_url\`
   when applicable, a 1-2 sentence verbatim \`answer_excerpt\`, and the full
   \`citations\` list (domain, url, title). The excerpt is what makes the
   dashboard number trustworthy - never skip it.
4. **Read the gap.** \`get_ai_visibility\` after recording: the gap_domains
   list is the sites getting cited on questions where {{SITE_NAME}} is not.
   For each gap that maps to a content opportunity the site could plausibly
   win, note it in the report; if one is a clear, queue-worthy idea, propose
   it with \`propose_suggestion\` (source \`geo-scan\`) - pending, never
   auto-approved from this workflow.
5. **Report**: questions asked, citation count per engine, the 2-3 most
   interesting verbatim answers (cited and not), the gap domains, and any
   ideas queued. If nothing cites the site yet, say so plainly - a zero
   baseline is the point of measuring.
`;
