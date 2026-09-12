/**
 * Tokenizer for capability search (PRD-FEAT-004.1).
 *
 * Lowercase, strip diacritics, split camelCase and dot segments, split on
 * non-alphanumerics, drop stopwords. No stemming in v1: it costs recall
 * predictability, and the whole point of AD-2 is to measure the lexical
 * ceiling honestly before adding machinery.
 */

/**
 * Words that carry almost no discriminating signal in a capability query.
 * Kept short on purpose: an over-eager stoplist quietly destroys recall, and
 * with a seven-capability index we cannot afford to lose real tokens.
 */
const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "any",
  "are",
  "as",
  "at",
  "be",
  "between",
  "both",
  "but",
  "by",
  "can",
  "do",
  "does",
  "for",
  "from",
  "get",
  "give",
  "how",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "me",
  "my",
  "need",
  "of",
  "on",
  "or",
  "please",
  "same",
  "should",
  "so",
  "some",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "to",
  "two",
  "up",
  "use",
  "using",
  "want",
  "was",
  "we",
  "what",
  "when",
  "which",
  "will",
  "with",
  "would",
  "you",
  "your",
]);

/** Insert a boundary between a lowercase/digit and a following uppercase run. */
function splitCamelCase(input: string): string {
  return input
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
}

function stripDiacritics(input: string): string {
  return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function tokenize(text: string): string[] {
  if (!text) return [];
  const spaced = splitCamelCase(text);
  const normalized = stripDiacritics(spaced).toLowerCase();
  return normalized
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));
}

/** Tokenizes every string in a field, preserving duplicates for term frequency. */
export function tokenizeAll(values: string[]): string[] {
  return values.flatMap(tokenize);
}

export function isStopword(token: string): boolean {
  return STOPWORDS.has(token);
}
