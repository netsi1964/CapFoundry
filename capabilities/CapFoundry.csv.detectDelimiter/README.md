# CapFoundry.csv.detectDelimiter

Infers which character separates fields in CSV-like text.

```json
{ "text": "name;age\nAlice;30\nBob;41" }
→ { "delimiter": ";", "confidence": 0.94, "fieldCount": 2, "reason": null, "evidence": [...] }
```

## Why it returns evidence

This is the first capability in the set that **infers** rather than computes, so the answer alone is
not enough. `evidence` lists every candidate with its consistency, modal field count and score, so a
caller who disagrees can see exactly why the verdict was reached — and a low `confidence` is a
signal to ask the user rather than guess harder.

## The scoring rule

The right delimiter produces the **same field count on every row**. A wrong one produces counts that
wander. So consistency carries 90% of the score and raw frequency only 10%, as a tie-breaker.

Weighting it the other way round would let a paragraph of prose full of commas beat a genuine
pipe-delimited file — which is the classic failure mode of frequency-only delimiter sniffing.

## Quoting

RFC 4180 quoting is honoured throughout: a delimiter inside `"quotes"` does not split, a doubled
`""` is an escaped quote, and a newline inside a quoted field does not start a new row. Naively
splitting on `\n` corrupts exactly the files where detection is hardest.

## Honest limits

- A **single row** caps confidence at half, and sets `reason: "SINGLE_ROW"`. One line cannot
  demonstrate consistency.
- Rows with zero occurrences are ignored when picking the modal count, so a trailing comment line
  does not outvote the data.
- No candidate present at all gives `delimiter: null` and `reason: "NO_CANDIDATE_PRESENT"` rather
  than a coin flip.
