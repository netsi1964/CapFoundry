# CapFoundry.text.editDistance

Levenshtein distance: the minimum number of single-character insertions, deletions or substitutions
needed to turn one string into another.

```json
{ "a": "kitten", "b": "sitting" }
→ { "distance": 3, "similarity": 0.571429, "lengths": { "a": 6, "b": 7 } }
```

## How this one got here

Every other capability in the registry was designed up front. This is the first that came **through
the candidate loop**: a real session asked for edit distance, CFCM found no match, the agent wrote
the code and offered it as a candidate, and a person promoted it.

That makes it the first evidence for MVP §2's eighth question — whether candidates become
capabilities that get reused — rather than an assumption about it.

## Two decisions you cannot infer from the signature

Both produce silently wrong answers if you assume the opposite.

**Code points, not UTF-16 units, not grapheme clusters.** Split with `Array.from`, so an emoji or
`ø` counts as one character. A combining sequence (`e` + U+0301) still counts as two — normalise to
NFC first if that matters, or use `Intl.Segmenter` for true grapheme semantics.

**Plain Levenshtein, not Damerau.** Transposing neighbours (`ab` → `ba`) costs **2**, not 1. For
typo detection — where transposition is among the commonest mistakes — Damerau-Levenshtein is the
right algorithm and a _different_ capability. Changing this one would silently move every threshold
anyone has tuned against it.

## Why `similarity` is returned

Normalising the distance is what callers actually want for fuzzy matching, and it is easy to get
wrong at the edges. `similarity` is `1 - distance / max(len)`, and two empty strings score **1**:
they are identical, not undefined.

## Complexity

O(n·m) time, O(min(n,m)) memory — two rows, swapped rather than copied.
