// Pure, client-safe slug transform behind the URL Slug Generator widget.
// No network calls, no DOM - just normalizing arbitrary title text into a
// clean, URL-safe slug. Kept isolated from the widget component so the
// transform can be reasoned about (and hand-tested) on its own.

export const SLUG_LENGTH_GUIDELINE = 60;

// Words SEO practice commonly drops from a URL slug because they add
// length without changing what a reader or a search engine reads the page
// as being about - a short, unambiguous list, distinct from (and shorter
// than) the internal linking tool's broader STOPWORDS set, which needs to
// filter running body text rather than a single title.
const FILLER_WORDS = new Set(
  "a an the of and or but nor nor for to in on at by with from as is are was were be been being this that these those it its your our".split(
    " ",
  ),
);

// Strips Latin diacritics via Unicode NFD decomposition + combining-mark
// removal ("café" -> "cafe", "Zürich" -> "Zurich") - a standard, verifiable
// normalization behavior every modern browser implements, not a hand-built
// or guessed character map.
function transliterate(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export type LengthVerdict = "safe" | "long";

export function slugLengthVerdict(length: number): LengthVerdict {
  return length <= SLUG_LENGTH_GUIDELINE ? "safe" : "long";
}

export type SlugResult = {
  slug: string;
  /** Filler words dropped from the slug - empty when stripping is off or none matched. */
  removedWords: string[];
  /** False when the input has no Latin letters or digits left after transliteration. */
  hasUsableChars: boolean;
};

export function generateSlug(input: string, stripFillerWords: boolean): SlugResult {
  const words = transliterate(input)
    .toLowerCase()
    .replace(/['\u2019]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

  const hasUsableChars = words.length > 0;

  let kept = words;
  const removedWords: string[] = [];
  if (stripFillerWords) {
    kept = words.filter((w) => {
      const isFiller = FILLER_WORDS.has(w);
      if (isFiller) removedWords.push(w);
      return !isFiller;
    });
    // An all-filler title ("The Of And") still needs a slug - fall back to
    // the untouched word list rather than shipping an empty string.
    if (kept.length === 0) {
      kept = words;
      removedWords.length = 0;
    }
  }

  return { slug: kept.join("-"), removedWords, hasUsableChars };
}
