# CapFoundry.json.schema.infer

Infers a JSON Schema (draft 2020-12) from an example JSON value.

```json
{ "data": { "name": "Alice", "status": "active", "age": 42 } }
```

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "age": { "type": "integer" },
    "name": { "type": "string" },
    "status": { "type": "string" }
  },
  "required": ["age", "name", "status"]
}
```

## Why the rules are written down

This is the benchmark capability (MVP §37): it exists to be compared against asking a model to do
the same job. That comparison only means something if the rules are pinned down. An LLM produces a
_plausible_ schema; this produces the _same_ schema every time, and you can read why.

|              | Rule                                                                                                                                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Types**    | `integer` when every observation is whole, else `number`. Mixed types become a sorted array; `integer`+`number` collapses to `number`.                                                                                    |
| **Required** | Single object: every key. Array of objects: only keys present in **every** element. A key in 9 of 10 samples is optional — the tenth is evidence it can be absent.                                                        |
| **Arrays**   | `items` merges **all** elements, so a heterogeneous array yields a union, not the first element's shape. An always-empty array gets no `items`: there is no evidence to write one from.                                   |
| **Enums**    | Strings only, and only with evidence of a closed set: ≥ `enumMinSamples` (3) observations, ≤ `enumMaxValues` (5) distinct, **and at least one repeat**. Three samples of three distinct values is free text, not an enum. |
| **Formats**  | Only when every observed string matches, and never alongside an enum.                                                                                                                                                     |
| **Ordering** | Keys, enum values and type arrays are sorted, so output is byte-stable.                                                                                                                                                   |

## The repeat requirement

The rule most schema inferrers get wrong. Without demanding a repeat, `["draft", "sent", "paid"]`
becomes an enum — and then the first `"cancelled"` in production fails validation against a schema
that was only ever guessing. A repeat is the cheapest available evidence that the set is actually
closed.

## Design

Two passes. First a walk builds an _observation tree_ recording what was seen — types, keys,
frequencies, string values. Then observations become a schema. Merging schemas directly would handle
types fine but would throw away the frequency information that both enum and required inference
depend on.

Formats detected: `date-time`, `date`, `time`, `uuid`, `email`, `uri`.
