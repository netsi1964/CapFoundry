/**
 * CapFoundry.text.editDistance
 *
 * Levenshtein distance: the minimum number of single-character insertions,
 * deletions or substitutions needed to turn one string into another.
 *
 * Two contract decisions a caller cannot infer from the signature, and which
 * silently produce wrong answers if assumed the other way:
 *
 *  - **Code points, not UTF-16 units and not grapheme clusters.** The string is
 *    split with Array.from, so an emoji or an "ø" counts as one character
 *    rather than two. A combining sequence (e + U+0301) still counts as two:
 *    normalise with NFC first if that matters, or reach for Intl.Segmenter if
 *    you need true grapheme semantics.
 *  - **Plain Levenshtein, not Damerau.** Transposing neighbours ("ab" to "ba")
 *    costs 2, not 1. For typo detection, where transposition is one of the
 *    commonest mistakes, Damerau-Levenshtein is the right algorithm and a
 *    different capability — changing this one would silently alter every
 *    threshold anyone has tuned against it.
 *
 * `similarity` is returned alongside because normalising the distance is what
 * callers actually want for fuzzy matching, and it is easy to get wrong at the
 * edges: two empty strings are identical, not undefined.
 *
 * O(n*m) time, O(min(n,m)) memory.
 *
 * PURE: no network, no filesystem, no clock, no randomness.
 */

export interface EditDistanceInput {
  a: string;
  b: string;
}

export interface EditDistanceOutput {
  distance: number;
  /** 1 when identical, 0 when nothing is shared. distance normalised by the longer string. */
  similarity: number;
  /** Code point lengths, so a caller can see what was actually compared. */
  lengths: { a: number; b: number };
}

export default function editDistance(input: EditDistanceInput): EditDistanceOutput {
  if (!input || typeof input !== "object") {
    throw new TypeError("input must be an object with strings a and b");
  }
  if (typeof input.a !== "string" || typeof input.b !== "string") {
    throw new TypeError("both a and b must be strings");
  }

  // Array.from splits on code points; a.length would count an emoji as two.
  let s = Array.from(input.a);
  let t = Array.from(input.b);
  const lengths = { a: s.length, b: t.length };

  // Keep the shorter string on the row axis so memory is O(min(n,m)).
  if (s.length > t.length) [s, t] = [t, s];

  let previous = Array.from({ length: s.length + 1 }, (_, i) => i);
  let current = new Array<number>(s.length + 1);

  for (let j = 1; j <= t.length; j++) {
    current[0] = j;
    for (let i = 1; i <= s.length; i++) {
      const substitutionCost = s[i - 1] === t[j - 1] ? 0 : 1;
      current[i] = Math.min(
        current[i - 1] + 1, // insertion
        previous[i] + 1, // deletion
        previous[i - 1] + substitutionCost, // substitution
      );
    }
    // Swap the buffers rather than copying: the previous row is dead once the
    // current one is complete.
    [previous, current] = [current, previous];
  }

  const distance = previous[s.length];
  const longest = Math.max(lengths.a, lengths.b);

  return {
    // Two empty strings are identical, so similarity is 1 rather than a
    // division by zero.
    distance,
    similarity: longest === 0 ? 1 : Number((1 - distance / longest).toFixed(6)),
    lengths,
  };
}
