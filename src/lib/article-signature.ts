// The DispatchSEO signature: one hidden, empty element at the end of every
// article we write, carrying the article's id.
//
//   <span data-dispatchseo="<draft id>" hidden></span>
//
// WHY. The free tier's "Made with DispatchSEO" credit is visible and a paid
// plan drops it, an owner can strip it, and an agent-mode repo never had it.
// The owner still wants to know which pages on the web are ours (owner,
// 2026-11-09: "our own signature, kind of like in the code"). This mark is
// not a credit and not a link: it renders nothing, loads nothing, and
// changes no ranking signal. It is a trace, and the id is the row in
// article_drafts (or the suggestion, for an agent-built guide), so a page
// found in the wild maps back to the customer who published it.
//
// WHY A SPAN AND NOT A COMMENT. The same string has to survive every route:
// our hosted blog and WordPress (HTML), and a repo file that is .md in one
// site and .mdx in the next. MDX rejects `<!-- -->` outright and both accept
// an inline element, so the element is the one form that works everywhere.
// A generator that strips raw HTML (Hugo without `unsafe`) simply drops it;
// the page then truthfully reads as "not found" in the owner's view.
//
// Detection (marksIn) runs on the page as served, in page-marks.ts.

export const SIGNATURE_ATTR = "data-dispatchseo";

/** The line appended to an article's body. The id is kept to id characters
 *  so the attribute can never be broken out of. */
export function articleSignature(id: string): string {
  return `<span ${SIGNATURE_ATTR}="${id.replace(/[^a-z0-9:_-]/gi, "")}" hidden></span>`;
}

const SIGNATURE_RE = /data-dispatchseo=["']([a-z0-9:_-]{1,80})["']/i;
// The free tier's credit as hosted-blog.ts prints it: a link to
// dispatchseo.com carrying our ref. The second form is an owner's own paste
// of the credit (a `credit` class near our name). Every pattern here is
// bounded and linear: this runs over pages other people wrote.
const REF_LINK_RE = /href=["']https?:\/\/(?:www\.)?dispatchseo\.com\/?\?ref=/i;
const CREDIT_CLASS_RE = /class=["'][^"']{0,200}\bcredit\b/i;
const GENERATOR_RE = /<meta\s+name=["']generator["']\s+content=["']DispatchSEO/i;

function hasBadge(html: string): boolean {
  if (REF_LINK_RE.test(html)) return true;
  const m = CREDIT_CLASS_RE.exec(html);
  return m != null && html.slice(m.index, m.index + 600).includes("DispatchSEO");
}

export type ArticleMarks = {
  /** The id the signature carries, or null when no signature is on the page. */
  signature: string | null;
  /** The visible "Made with DispatchSEO" credit is on the page. */
  badge: boolean;
};

/** What a served page carries. The hosted blog also names itself in a
 *  generator meta, which counts as a signature for posts rendered before
 *  the body mark existed. */
export function marksIn(html: string): ArticleMarks {
  const m = SIGNATURE_RE.exec(html);
  return { signature: m ? m[1] : GENERATOR_RE.test(html) ? "hosted" : null, badge: hasBadge(html) };
}

/** How a page's stored marks read in one or two words. `null` columns mean
 *  the page was never scanned. */
export type MarkState = "signed+badge" | "signed" | "badge" | "none" | "unchecked";

export function markState(row: { mark_checked_at?: string | null; signature_seen?: boolean | null; badge_seen?: boolean | null }): MarkState {
  if (!row.mark_checked_at) return "unchecked";
  if (row.signature_seen && row.badge_seen) return "signed+badge";
  if (row.signature_seen) return "signed";
  if (row.badge_seen) return "badge";
  return "none";
}
