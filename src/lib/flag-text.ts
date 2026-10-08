// Callback flag text off the URL (?gh=error&msg=…, ?error=…), cleaned before
// a setup card renders it.
//
// Anyone can craft a link to /onboarding or /dashboard with any `msg`, and
// the card shows it in an error line under our own heading - a phishing
// surface ("GitHub connection failed: re-enter your password at evil.example").
// So links are stripped, whitespace collapsed and the length capped; what is
// left is at most a short plain sentence.

const MAX = 160;

/** The generic line for a GitHub callback whose message didn't survive
 *  cleaning (the step card renders exactly this when it gets `null`). */
export const GENERIC_GITHUB_FLAG = "GitHub connection failed. Try again.";

/** `null` when absent or nothing survives cleaning - the card then falls
 *  back to its generic line (GENERIC_GITHUB_FLAG for GitHub). */
export function cleanFlagText(raw: string | string[] | null | undefined): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (typeof v !== "string") return null;
  const text = v
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/www\.\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX)
    .trim();
  return text || null;
}

/** The Google callback flag: "connected" passes through; an error code is
 *  cleaned, and one that cleans to nothing still reads as a failure. */
export function cleanGscFlag(connected: string | string[] | null | undefined, error: string | string[] | null | undefined): string | null {
  const c = Array.isArray(connected) ? connected[0] : connected;
  if (c === "1") return "connected";
  const e = Array.isArray(error) ? error[0] : error;
  if (e == null) return null;
  return cleanFlagText(e) ?? "try again";
}
