# SunCalc som CapFoundry-capabilities

**Status:** `CapFoundry.sun.times` er implementeret og indekseret · resten er forslag · **Dato:** 2026-09-12

SunCalc ([mourner/suncalc](https://github.com/mourner/suncalc), BSD-2-Clause) er et usædvanligt
godt match for registret: ren matematik, ingen omverden, ingen afhængigheder. Alt i biblioteket er
`PURE` og kører uændret i nul-rettigheds-sandboxen. Det gør det også til den billigste måde at
afprøve licens- og provenance-historien fra README §"CFP" på rigtig tredjepartskode.

## Status

| Capability | SunCalc-metode | Effekt | Status |
|---|---|---|---|
| `CapFoundry.sun.times` | `getTimes` | `PURE` | **Implementeret**, 11 tests, i indekset |
| `CapFoundry.sun.position` | `getPosition` | `PURE` | Foreslået — lille |
| `CapFoundry.moon.illumination` | `getMoonIllumination` | `PURE` | Foreslået — lille |
| `CapFoundry.moon.position` | `getMoonPosition` | `PURE` | Foreslået |
| `CapFoundry.moon.times` | `getMoonTimes` | `PURE` | Foreslået |
| — | `addTime` | — | **Fravalgt**, se §4 |

## 1. Beslutninger der allerede er truffet i `sun.times`

De gælder for alle fem. De er værd at kopiere frem for at genforhandle:

**Tid er input, aldrig aflæst.** `date` er påkrævet og defaulter ikke til "nu". SunCalc's
`getMoonIllumination(date = new Date())` har en clock-default — den skal fjernes i porten. En
capability der læser væguret er ikke `PURE`: den kan ikke testes, ikke caches, og giver et nyt svar
hver gang. Det er den eneste ændring i upstreams adfærd der er nødvendig.

**Output er ISO 8601, og `timeZone` ændrer kun hvordan et øjeblik læses.** Uden zone: `Z`. Med zone:
zonens offset. Begge parser til samme epoch-millisekund. Intl's tidszonedatabase er verificeret
tilgængelig med nul rettigheder — ingen `--allow-read`, ingen medfølgende datafil.

**`null` betyder "sker ikke", ikke "fejl".** Og når noget er `null`, skal outputtet sige hvorfor.
`sun.times` returnerer `polarDay`/`polarNight`; `moon.times` skal tilsvarende returnere
`alwaysUp`/`alwaysDown`. Et tomt resultat uden forklaring er den samme fælde som et geokodnings-gæt:
plausibelt og forkert.

**Licensen følger med i pakken.** `license/LICENSE` indeholder upstreams BSD-2-Clause-tekst
ordret — redistribution kræver det — og `provenance.json` har `origin: "derived"` med `derivedFrom`,
version og hentedato. `sun.times` er skabelonen.

## 2. `CapFoundry.sun.position` — anbefalet næste skridt

Mindst arbejde, og den deler `sunCoords`, `siderealTime` og `altitude` med den implementerede.

```jsonc
// ind
{ "lat": 56.4602, "lon": 9.4054, "date": "2026-09-12T14:30:00Z" }
// ud
{ "azimuth": 218.4, "altitude": 31.2, "date": "2026-09-12T14:30:00Z", "coordinates": {...} }
```

To ting kontrakten skal sige højt, som upstream kun siger i en kommentar:

- **Azimut er nordbaseret og med uret** (0° = N, 90° = Ø, 180° = S, 270° = V). SunCalc v1 brugte
  sydbaseret azimut i radianer. Enhver der husker v1 vil gætte forkert, så feltet skal have en
  `description` der siger det, ikke bare et tal.
- **`altitude` er refraktionskorrigeret** og i grader, ikke radianer.

Grader frem for radianer overalt er et bevidst brud med upstream. Registret er et API for mennesker
og agenter, ikke et matematikbibliotek.

## 3. Månen

`moon.illumination` er den mest interessante af de tre, fordi den **kun tager en dato** — ingen
position. Det gør den til en usædvanlig ren capability, og "hvilken måne­fase er det" er noget folk
faktisk søger efter.

```jsonc
// ind
{ "date": "2026-09-12" }
// ud
{ "fraction": 0.42, "phase": 0.27, "angle": -1.2, "phaseName": "waxing crescent" }
```

`phaseName` findes ikke i upstream. Den er værd at tilføje, fordi `phase: 0.27` er ubrugelig uden at
slå op hvad tallet betyder, og fordi et navn er det folk søgte efter i første omgang. Otte
standardfaser, afledt deterministisk af `phase`. Det er den slags kontrakt-værdi der retfærdiggør en
capability frem for bare at pege på npm-pakken.

`moon.times` har `alwaysUp`/`alwaysDown` og en ekstra krølle upstream advarer om: månen kan stå op og
gå ned **to gange** i samme kalenderdøgn, fordi månedøgnet er ~24t 50m. Kontrakten skal kunne udtrykke
det frem for at tabe den ene hændelse.

`moon.position` er ligetil, men tilføj `distance` i km og overvej at udelade `parallacticAngle` —
den er kun relevant for teleskopmontering og koster kontraktoverflade.

## 4. Hvorfor `addTime` er fravalgt

`SunCalc.addTime(angle, riseName, setName)` muterer et modul-globalt array. To kald i samme proces
påvirker hinanden, og outputtets form afhænger af kaldshistorik frem for af input. Det er
uforeneligt med en kontrakt hvor `outputSchema` har `additionalProperties: false`.

Hvis brugerdefinerede vinkler skal understøttes, hører de hjemme som **input**, ikke som global
konfiguration:

```jsonc
{ "lat": 56.46, "lon": 9.41, "date": "2026-06-21",
  "customPhases": [{ "angle": -4, "riseName": "myDawn", "setName": "myDusk" }] }
```

Det er en additiv ændring til `sun.times` og kan vente til nogen faktisk beder om den. `YAGNI` er
det rigtige svar indtil videre.

## 5. Rækkefølge

1. `sun.position` — lille, deler kode med den implementerede, lukker sol-halvdelen.
2. `moon.illumination` — kun dato ind, høj søgeværdi, `phaseName` som tilført værdi.
3. `moon.times` — kræver at dobbelt op/nedgang besluttes først.
4. `moon.position` — lavest værdi, tag den når de andre er der.

En fælles `artifact/astro.ts` delt mellem sol-capabilities er fristende, men hver CFP skal være
selvstændig on-disk. Lidt dubleret matematik på tværs af pakker er den rigtige pris for at hver
pakke kan distribueres alene.
