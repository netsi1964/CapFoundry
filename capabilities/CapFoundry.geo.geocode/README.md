# CapFoundry.geo.geocode

Resolves an address or place name to coordinates. The first `NETWORK` capability in the registry.

```json
{ "query": "Prinsens Alle 5, 8800 Viborg" }
```

```json
{
  "resolved": true,
  "status": "ok",
  "query": "Prinsens Alle 5, 8800 Viborg",
  "match": {
    "displayName": "Prinsens Alle 5, 8800 Viborg, Denmark",
    "lat": 56.46019902,
    "lon": 9.40540319,
    "countryCode": "DK",
    "placeId": "...",
    "placeType": "house"
  },
  "candidates": ["..."],
  "attribution": "Data © OpenStreetMap contributors, ODbL 1.0. Geocoding by Nominatim."
}
```

## It refuses rather than guesses

This is the contract's one real opinion. A query whose candidates span more than one country returns
`status: "ambiguous"` and **no match at all**:

```json
{ "query": "Viborg" }
```

```json
{
  "resolved": false,
  "status": "ambiguous",
  "match": null,
  "candidates": ["Viborg, Denmark", "Viborg, South Dakota", "Выборг, Russia"]
}
```

Silently taking the first hit would compute correctly against the wrong place and return something
entirely credible. That is the worst failure a registry can distribute: wrong, plausible, and reused
by everyone. Pass `countryCode` to resolve it:

```json
{ "query": "Viborg", "countryCode": "DK" }   →   status "ok"
```

Ambiguity is judged **by country, not by ranking**. Nominatim's own `importance` score would be
easier to lean on, but it would couple this contract to one provider's quirks. Crossing a border is
the ambiguity that actually produces wrong answers, and `countryCode` is the input that fixes it.

`status: "not_found"` is likewise an answer, not an error.

## Shape

The artifact is two pure functions and a default export with no logic left in it:

| Export                  | Pure | Covers                                                          |
| ----------------------- | ---- | --------------------------------------------------------------- |
| `buildRequest(input)`   | yes  | URL-encoding, country filter, language, the required User-Agent |
| `parse(payload, input)` | yes  | Candidate extraction and the ambiguity verdict                  |
| `default`               | no   | `fetch`, four lines                                             |

Splitting only at `parse` would leave request construction untestable — and that is where
URL-encoding bugs live. `Rådhuspladsen` must encode to `R%C3%A5dhuspladsen`; a hand-built query string gets
that wrong in a way that looks like it works. The test suite runs with **no network permission at
all**, against recorded responses in `tests/fixtures/`.

## Limits you should know before using it

**Nominatim allows one request per second, hard.** Do not call this in a loop over a thousand
addresses; you will be blocked, and rightly. It is suited to interactive and low-volume use.

**An identifying `User-Agent` is required.** Nominatim answers an anonymous caller with 403. The
artifact always sends one.

**Results change as OpenStreetMap changes.** This capability is `NETWORK`, so it is not
deterministic across time the way the `PURE` capabilities are. Fixtures pin the _shape_, not the
world.

## Permissions

```json
"effect": "NETWORK",
"permissions": { "network": ["nominatim.openstreetmap.org"] }
```

The declaration is a **request, not a grant**. CFCM intersects it with `execution.network.allow` in
your `cfcm.json`, which is off by default — so this capability cannot reach the network until you
say it may, and it can never reach a host it did not declare.

## Licence and attribution

The code is Apache-2.0 and original. The _data_ is not: Nominatim responses are ODbL 1.0, ©
OpenStreetMap contributors. That credit is in the `attribution` field of every response, including
failures, because the obligation flows to whoever calls the capability — not only to this
repository. Recorded fixtures are third-party data and are accounted for in
`tests/fixtures/provenance.json`.

## Keeping the fixtures honest

Recordings go stale when the upstream API changes shape, and CI cannot detect that without calling
the live service — which would make the build depend on someone else's uptime.

```
deno task contract-check
```

Refetches the recorded queries and diffs the live response shape against the fixtures. Run it when
you touch this capability. It is deliberately **outside CI**: it should go red because the API
changed, never because the network blinked.
