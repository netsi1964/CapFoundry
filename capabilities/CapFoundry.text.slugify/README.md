# CapFoundry.text.slugify

Turns arbitrary text into a stable, URL- and filename-safe slug.

```json
{ "text": "Rødgrød med fløde!", "locale": "da" }
→ { "slug": "roedgroed-med-floede", "truncated": false }
```

## Why locale is an input

The correct transliteration genuinely differs by language. Danish `ø` is `oe`; generic diacritic
stripping gives `o`. Both are defensible, only one is right for a given text, and picking silently
produces colliding slugs. So the locale is passed in rather than read from the environment — which
also keeps the capability deterministic across machines.

Locale-specific maps: `da`, `nb`, `no`, `sv`, `de`. Everything else falls back to the universal map
plus NFKD diacritic stripping.

## Stability

Slugs outlive the code that made them: they end up in URLs and filenames. Every rule here is
explicit rather than delegated to a locale-sensitive runtime API, so the same input gives the same
slug on every machine and in every version. **Changing a mapping is a breaking change, not a
patch.**

Characters with no ASCII reading (CJK, emoji) are dropped rather than guessed at. `maxLength` never
leaves a trailing separator.
