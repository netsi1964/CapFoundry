# Proposal: `CapFoundry.geo.addresses.distance`

**Status:** draft for discussion · **Date:** 2026-09-12 · **Updated:** 2026-09-12 (§5 after `9a109b5`) · **Touches:** `PRD-FEAT-001`, `PRD-FEAT-006`, `SEC-1`, `SEC-10`

Distance between two *addresses or cities*, given as text, across national borders — rather than
between two coordinate pairs.

---

## 1. Why this is not just `geo.distance` with a parser in front

`CapFoundry.geo.distance` is `PURE`: the same input gives the same output, forever, with no outside
world. That is why it can run in the zero-permission sandbox.

Address → coordinate cannot be `PURE`. It requires a lookup against an external geocoder, and three
things move at once:

| | `geo.distance` | `geo.addresses.distance` |
|---|---|---|
| Effect | `PURE` | `NETWORK` |
| Determinism | Total | The answer changes as map data updates |
| Failure modes | Invalid input | Ambiguity, rate limits, downtime, no hit |
| Testing | Plain unit test | Requires fixtures / recorded responses |
| Licence | Only our own code | A data licence comes along (ODbL for OSM) |

The most important of these is not the network. It is **ambiguity**.

## 2. Ambiguity is the entire design problem

From an actual lookup against Nominatim while preparing this proposal:

```
"Viborg"      -> Viborg, Denmark (56.447, 9.406)
                 Viborg, South Dakota, USA (43.170, -97.081)
                 Выборг, Leningrad oblast, Russia (60.709, 28.744)

"Springfield" -> Illinois / Massachusetts / Missouri, USA (and ~30 more)
```

A capability that silently takes the first hit will compute correctly against the wrong place and
return a number that looks entirely credible. That is the worst kind of error a registry can
distribute: wrong, plausible, and reused by everyone.

**Design principle: the capability must refuse rather than guess.** Ambiguous input returns
`resolved: false` with the candidate list, not a number. The caller disambiguates and asks again
with a `countryCode` or a chosen `placeId`.

That also makes the `country` field more than a convenience — it is the primary way to make an
ambiguous name unambiguous.

## 3. Recommendation: split it in two, not one

I propose *not* building a single capability that both geocodes and measures. Three reasons:
geocoding is valuable on its own (address validation, country lookup, normalisation); the impure
part gets isolated in one place; and `geo.distance` stays `PURE` and untouched.

```
CapFoundry.geo.geocode            NETWORK   "Hamburg"        -> {lat, lon, ...} + candidates
CapFoundry.geo.distance           PURE      two coordinates  -> km            [already exists]
CapFoundry.geo.addresses.distance NETWORK   two text strings -> km + what was looked up
```

The third becomes a thin composition of the first two. It is kept because it is what people actually
search for ("how far between two cities"), and because it can return both geocodings in its output
so the result can be audited.

If we can only afford one: build `geo.geocode`. `addresses.distance` can always be composed later.

## 4. Draft contract

Note that `permissions` is **not** included — that field did not exist in `capability.schema.json`
when this was written. See §5.

```jsonc
{
  "schemaVersion": 1,
  "name": "CapFoundry.geo.addresses.distance",
  "version": "0.1.0",
  "description": "Calculate the distance between two addresses or place names, resolving each to coordinates first",
  "aliases": [
    "distance between two addresses",
    "how far between two cities",
    "km between two towns",
    "distance between two place names",
    "geocode two addresses and measure"
  ],
  "exampleQueries": [
    "how far is it from Copenhagen to Hamburg",
    "distance in km between two street addresses",
    "how many kilometres between two cities in different countries",
    "measure the distance between two places by name",
    "straight line distance between two postal addresses"
  ],
  "tags": ["geo", "geocoding", "distance", "address", "international"],
  "inputSummary": "Two addresses or place names as text, with optional country hints and unit",
  "outputSummary": "Distance plus the resolved location behind each input, or an unresolved result with candidates",
  "runtime": "deno",
  "effect": "NETWORK",

  "inputSchema": {
    "type": "object",
    "additionalProperties": false,
    "required": ["from", "to"],
    "properties": {
      "from": { "$ref": "#/$defs/place" },
      "to":   { "$ref": "#/$defs/place" },
      "unit": { "enum": ["km", "m", "mi", "nmi"] },
      "language": { "type": "string", "pattern": "^[a-z]{2}$" }
    },
    "$defs": {
      "place": {
        "type": "object",
        "additionalProperties": false,
        "required": ["query"],
        "properties": {
          "query":       { "type": "string", "minLength": 1, "maxLength": 300 },
          "countryCode": { "type": "string", "pattern": "^[A-Z]{2}$" },
          "placeId":     { "type": "string", "maxLength": 128 }
        }
      }
    }
  },

  "outputSchema": {
    "type": "object",
    "additionalProperties": false,
    "required": ["resolved"],
    "properties": {
      "resolved": { "type": "boolean" },
      "distance": { "type": "number", "minimum": 0 },
      "unit":     { "enum": ["km", "m", "mi", "nmi"] },
      "method":   { "const": "haversine" },
      "from":     { "$ref": "#/$defs/resolution" },
      "to":       { "$ref": "#/$defs/resolution" },
      "attribution": { "type": "string" }
    },
    "$defs": {
      "resolution": {
        "type": "object",
        "additionalProperties": false,
        "required": ["query", "status"],
        "properties": {
          "query":  { "type": "string" },
          "status": { "enum": ["ok", "ambiguous", "not_found"] },
          "match": {
            "type": ["object", "null"],
            "additionalProperties": false,
            "required": ["displayName", "lat", "lon", "countryCode", "placeId", "placeType"],
            "properties": {
              "displayName": { "type": "string" },
              "lat":         { "type": "number", "minimum": -90,  "maximum": 90 },
              "lon":         { "type": "number", "minimum": -180, "maximum": 180 },
              "countryCode": { "type": "string" },
              "placeId":     { "type": "string" },
              "placeType":   { "type": "string" }
            }
          },
          "candidates": {
            "type": "array",
            "maxItems": 5,
            "items": { "$ref": "#/$defs/resolution/properties/match" }
          }
        }
      }
    }
  },

  "artifact": { "type": "typescript", "entrypoint": "./artifact/index.ts", "sha256": "..." },
  "exposure": { "execution": true, "artifact": true },
  "limits": { "timeoutMs": 15000, "maxOutputBytes": 65536 },
  "tests": "./tests/"
}
```
Three deliberate choices in the contract:

- **`resolved` is required, `distance` is not.** An answer without a number is a valid, expected
  state — not an error. It forces the caller to confront whether the lookup succeeded.
- **`placeId` goes in and comes back out.** The first call returns candidates; the second sends the
  chosen `placeId` and becomes unambiguous. That is the disambiguation loop, expressed in the
  contract itself.
- **`attribution` is in the output, not in the documentation.** OSM data requires credit. If it sits
  in the response, a caller cannot drop it without doing so deliberately.

### Open question: what *is* the distance between two cities?

`geo.distance` measures point to point. A city is not a point. Nominatim returns a representative
point whose definition varies by place. Viborg→Hamburg gives **324.3 km** with the coordinates
above, but that number is only meaningful alongside `displayName` for both endpoints — which is
exactly why they are in the output.

Road distance is deliberately omitted. That is a routing problem, not a geometry problem, and it has
its own failure modes (no route across water, ferries, border closures). If it is wanted, it should
be a separate `CapFoundry.geo.route` with `mode` and `duration` — not a flag on this one.

## 5. Platform status — two of three blockers are gone

*Updated 2026-09-12 after `9a109b5`. All three were open when this was written.*

**5.1 The sandbox now runs NETWORK.** ~~Rejects everything non-`PURE`.~~ `cfcm/runtime/execute.ts:117`
permits `PURE` and `NETWORK`; `READ` and `WRITE` are explicitly rejected. A NETWORK artifact with no
granted hosts fails with `NETWORK_NOT_PERMITTED` rather than running without network.

**5.2 `permissions.network` exists.** ~~No way to declare hosts.~~ The field is in
`capability.schema.json`, required when `effect` is `NETWORK`, and enforced as
`--allow-net=<hosts>`. The design is an **intersection**: the declaration is a request, not a grant,
and `cfcm.json`'s `execution.network.allow` decides what is actually given — off by default. That is
stricter than what I proposed, and better: a capability cannot grant itself access by asking.

`--no-remote` and `--no-npm` are retained, so SEC-10 remains closed.

**5.3 The test and provenance model still assumes determinism.** The only one left. NETWORK tests
cannot call a live API in CI — it is flakey, rate-limited, and turns a red build into noise.
Recorded fixtures are needed, and the artifact needs a separable pure transform. A small change in
artifact shape, but it becomes the pattern for every NETWORK capability after the first, so it
should be decided deliberately rather than allowed to emerge.

## 6. Choosing a provider

| | Nominatim (OSM) | Photon | Commercial (Google/Mapbox/HERE) |
|---|---|---|---|
| Key | No | No | Yes → secrets handling, which does not exist yet |
| Rate limit | 1 req/s, hard | Mild | Per subscription |
| Licence | ODbL, credit required | ODbL | Proprietary, often forbids caching |
| Suited to | Prototype, low volume | Low volume | Production |

Nominatim is the right choice *for this proposal*, because it does not require solving secrets
handling first. But 1 req/s means the capability cannot be used in a loop over a thousand addresses,
and that belongs in `description` rather than being discovered by the first person who tries.

A `provider` parameter in the input is deliberately rejected: it would leak the provider's quirks
into the contract and make the output impossible to keep stable.

## 7. Proposed order

1. ~~Scoped network in the sandbox~~ — done in `9a109b5`.
2. ~~`permissions.network` plus validator rule~~ — done, as an intersection with local policy.
3. **The fixture pattern for NETWORK tests** (5.3) — once, so it is set for everything after.
4. `CapFoundry.geo.geocode` as the first NETWORK capability. Smaller surface, same problems.
5. `CapFoundry.geo.addresses.distance` as a composition on top.

Step 3 is platform work and should not hide inside a capability PR. The path is clear from step 4.

---

**Not in scope:** road distance/routing, batch geocoding, reverse geocoding, address validation,
autocomplete. Each is its own capability.
