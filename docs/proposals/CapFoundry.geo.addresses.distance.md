# Forslag: `CapFoundry.geo.addresses.distance`

**Status:** udkast til diskussion · **Dato:** 2026-09-12 · **Berører:** `PRD-FEAT-001`, `PRD-FEAT-006`, `SEC-1`, `SEC-10`

Afstand mellem to *adresser eller byer* — angivet som tekst, på tværs af landegrænser — i stedet for
mellem to koordinatpar.

---

## 1. Hvorfor det ikke bare er `geo.distance` med en parser foran

`CapFoundry.geo.distance` er `PURE`: samme input giver samme output, for altid, uden omverden. Det er
grunden til at den kan køre i nul-rettigheds-sandboxen.

Adresse → koordinat kan ikke være `PURE`. Det kræver et opslag i en ekstern geokoder, og så flytter
tre ting sig på én gang:

| | `geo.distance` | `geo.addresses.distance` |
|---|---|---|
| Effekt | `PURE` | `NETWORK` |
| Determinisme | Total | Svaret ændrer sig når kortdata opdateres |
| Fejltilstande | Ugyldigt input | Tvetydighed, rate limits, nedetid, ingen træffer |
| Test | Ren enhedstest | Kræver fixtures / optagede svar |
| Licens | Kun vores egen kode | Data-licens følger med (ODbL ved OSM) |

Den vigtigste af dem er ikke netværket. Det er **tvetydigheden**.

## 2. Tvetydighed er hele designproblemet

Fra et faktisk opslag mod Nominatim under udarbejdelsen af dette forslag:

```
"Viborg"      -> Viborg, Danmark (56.447, 9.406)
                 Viborg, South Dakota, USA (43.170, -97.081)
                 Выборг, Leningrad oblast, Rusland (60.709, 28.744)

"Springfield" -> Illinois / Massachusetts / Missouri, USA (og ~30 flere)
```

En capability der stiltiende vælger den første træffer, vil regne rigtigt på et forkert sted og
returnere et tal der ser fuldstændig troværdigt ud. Det er den værste form for fejl et registry kan
distribuere: forkert, plausibel, og genbrugt af alle.

**Designprincip: capability'en skal hellere nægte end gætte.** Tvetydigt input giver `resolved:
false` med kandidatlisten, ikke et tal. Kalderen afklarer og spørger igen med `countryCode` eller et
valgt `placeId`.

Det gør også `country`-feltet til mere end bekvemmelighed — det er den primære måde at gøre et
tvetydigt navn entydigt.

## 3. Anbefaling: del den i to, ikke én

Jeg foreslår at *ikke* bygge én capability der både geokoder og regner. Tre grunde: geokodning er
værdifuld alene (adressevalidering, landeopslag, normalisering); den urene del bliver isoleret ét
sted; og `geo.distance` forbliver `PURE` og uændret.

```
CapFoundry.geo.geocode            NETWORK   "Hamburg"        -> {lat, lon, ...} + kandidater
CapFoundry.geo.distance           PURE      to koordinater   -> km            [findes allerede]
CapFoundry.geo.addresses.distance NETWORK   to tekststrenge  -> km + hvad der blev slået op
```

Den tredje bliver en tynd komposition af de to første. Den beholdes fordi den er det folk faktisk
søger efter ("hvor langt er der mellem to byer"), og fordi den kan returnere begge geokodninger i
outputtet, så resultatet kan revideres.

Hvis vi kun har råd til én: byg `geo.geocode`. `addresses.distance` kan altid komponeres bagefter.

## 4. Kontraktudkast

Bemærk at `permissions` **ikke** er med — det felt findes ikke i `capability.schema.json` i dag. Se §5.

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

Tre bevidste valg i kontrakten:

- **`resolved` er påkrævet, `distance` er ikke.** Et svar uden tal er en gyldig, forventet tilstand —
  ikke en fejl. Det tvinger kalderen til at forholde sig til om opslaget lykkedes.
- **`placeId` går ind og ud igen.** Første kald returnerer kandidater; andet kald sender det valgte
  `placeId` og bliver entydigt. Det er afklaringsloopet, udtrykt i selve kontrakten.
- **`attribution` er i outputtet, ikke i dokumentationen.** OSM-data kræver kreditering. Hvis den
  ligger i svaret, kan en kalder ikke komme til at droppe den uden at gøre det med vilje.

### Åbent spørgsmål: hvad *er* afstanden mellem to byer?

`geo.distance` måler punkt til punkt. En by er ikke et punkt. Nominatim returnerer et
repræsentativt punkt, hvis definition varierer efter sted. Viborg→Hamburg giver **324,3 km** med
ovenstående koordinater, men det tal er kun meningsfuldt sammen med `displayName` for begge
endepunkter — hvilket er præcis derfor de er med i outputtet.

Vejafstand er bevidst udeladt. Det er et ruteproblem, ikke et geometriproblem, og det har sine egne
fejltilstande (ingen rute over vand, færger, grænselukninger). Hvis det skal med, bør det være en
selvstændig `CapFoundry.geo.route` med `mode` og `duration` — ikke et flag på denne her.

## 5. Tre ting i platformen der skal flytte sig først

Det her er den egentlige pointe i forslaget. Capability'en er ikke det svære.

**5.1 Sandboxen afviser alt ikke-`PURE`.** `cfcm/runtime/execute.ts:103` kaster
`EFFECT_UNSUPPORTED` før den overhovedet spawner. Så `geo.addresses.distance` kan ikke eksekveres i
dag, uanset hvor rigtig kontrakten er. Der skal træffes et valg: enten udvides sandboxen med scoped
`--allow-net`, eller også udstilles capability'en kun som artefakt (`exposure.execution: false`) så
brugeren selv kører den med egne rettigheder.

Artefakt-vejen er markant billigere og kan leveres nu. Den er værd at overveje som første skridt.

**5.2 Der er ingen måde at deklarere *hvilke* hosts en capability må nå.**
`capability.schema.json` har `additionalProperties: false` og intet permissions-felt.
`cfcm.json` har `permissions.network`, men på *source*-niveau — ikke per capability. Uden en
deklaration bliver scoped netværk til `--allow-net` uden begrænsning, og så er SEC-1 reelt væk for
NETWORK-capabilities.

Forslag til minimal udvidelse, bag `schemaVersion: 2`:

```jsonc
"permissions": {
  "network": ["nominatim.openstreetmap.org"]
}
```

Håndhævet som `--allow-net=nominatim.openstreetmap.org`. Validatoren afviser `effect: NETWORK` uden
et ikke-tomt `permissions.network`. **Bemærk SEC-10 gælder stadig:** `--no-remote` og `--no-npm`
skal blive på, også når netværk åbnes, ellers er module-loaderen en exfiltrationskanal igen.

**5.3 Test- og provenance-modellen antager determinisme.** Tests kan ikke kalde et live-API i CI —
det er flakey, rate-limited og gør en rød build til støj. Der skal bruges optagede fixtures, og så
skal artefaktet have et injicerbart fetch-lag. Det er en lille ændring i artefaktets form, men den
skal besluttes bevidst, for den bliver mønsteret for hver eneste NETWORK-capability efter denne.

## 6. Valg af udbyder

| | Nominatim (OSM) | Photon | Kommerciel (Google/Mapbox/HERE) |
|---|---|---|---|
| Nøgle | Nej | Nej | Ja → secrets-håndtering, som ikke findes endnu |
| Rate limit | 1 req/s, hård | Mild | Efter abonnement |
| Licens | ODbL, kræver kreditering | ODbL | Proprietær, ofte forbud mod caching |
| Egnet til | Prototype, lav volumen | Lav volumen | Produktion |

Nominatim er det rigtige valg *til dette forslag*, fordi det ikke kræver at vi først løser
secrets-håndtering. Men 1 req/s betyder at capability'en ikke kan bruges i en løkke over tusind
adresser, og det bør stå i `description` frem for at blive opdaget af den første der prøver.

En `provider`-parameter i inputtet er fravalgt med vilje: den ville lække udbyderens særheder ind i
kontrakten og gøre outputtet umuligt at holde stabilt.

## 7. Foreslået rækkefølge

1. **Beslut 5.1** — scoped netværk i sandboxen, eller artefakt-kun. Alt andet afhænger af det.
2. `schemaVersion: 2` med `permissions.network` + validatorregel (5.2).
3. Fixture-mønsteret for NETWORK-tests (5.3) — én gang, så det er sat for alle senere.
4. `CapFoundry.geo.geocode` som første NETWORK-capability. Mindre overflade, samme problemer.
5. `CapFoundry.geo.addresses.distance` som komposition ovenpå.

Trin 1–3 er platformarbejde og bør ikke gemme sig inde i en capability-PR.

---

**Ikke i scope:** vejafstand/rutelægning, batch-geokodning, reverse geocoding, adressevalidering,
autocomplete. Hver af dem er sin egen capability.
