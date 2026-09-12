# Skills og capabilities: hvad CF kan erstatte, og hvad det ikke kan

**Status:** analyse med ét konkret forslag i §4 · **Dato:** 2026-09-12 · **Berører:** Vision §28, §39, `PRD-FEAT-017`

Opstået af et spørgsmål der er værd at stille højt: *kan CapFoundry, sådan som det er bygget, være
et alternativ til skills?*

Kort svar: **nej til eksekveringen, muligvis ja til distributionen.** Den anden halvdel er den
interessante, og den er ikke dækket af visionen i dag.

## 1. Visionen har allerede en position

Vision §28 skiller dem ad:

```
SKILL                    "Hvad skal jeg gøre?"
MCP / API / SDK          "Hvordan interagerer jeg?"
CAPFOUNDRY + CFCM        "Hvilken capability findes, hvordan resolver jeg den?"
```

Dette repo er selv beviset. `capability-awareness` er en **skill** hvis eneste opgave er at lære
agenten hvornår den skal spørge registret — hvornår en søgning er værd at betale for, hvordan et
`PARTIAL_MATCH` skal bedømmes, hvornår noget nyskrevet er værd at indlevere. Den kan ikke laves om
til en capability, for den har intet `inputSchema`. Den er dømmekraft, ikke beregning.

Forholdet er altså **lag, ikke konkurrenter**: skill som politik, capability som mekanisme.

## 2. Hvorfor CF ikke kan erstatte skills

**En skill ændrer adfærd; en capability producerer en værdi.** En skill siger "når du gør X, så gør
det sådan her" — modellen udfører stadig arbejdet. En capability siger "giv mig dette input, få
dette output" — modellen udfører intet.

**Skills er stærkest præcis hvor determinisme er en fejl.** "Hvordan strukturerer jeg en PRD" skal
give forskellige svar i forskellige situationer. En capability der gjorde det, ville være i stykker.

**Prosa er outputtet, ikke et biprodukt.** Der findes intet `outputSchema` der kan fange "god
formidling". Alt hvor leverancen er tekst til et menneske, ligger uden for kontraktmodellen.

**Dialog kan ikke kontraktbindes.** En skill der interviewer brugeren gennem femten spørgsmål har
ingen enkelt input-til-output-relation at forsegle.

## 3. Hvor CF er strukturelt stærkere

| | Skill | CFP |
|---|---|---|
| Kontekstomkostning | Permanent, når loadet | Ét kald; kun svaret returneres |
| Determinisme | Går gennem modellen | Forseglet `sha256`, samme bytes hver gang |
| Tillid | Prosa modellen læser og *lover* at følge | `effect` håndhævet af runtime |
| Afvisning | Loadet eller ej | `NO_MATCH` + `matchedOn` som inspicerbar evidens |
| Versionering | Ingen | `version` + forsegling + provenance |

**Kontekst.** SunCalc-porten i `CapFoundry.sun.times` er ~330 linjer. Et kald returnerer
`{"sunrise": "2026-09-12T06:47:24+02:00", ...}`. Koden kommer aldrig ind i konteksten. Et registry
med 10.000 capabilities koster nul indtil ét kald; 10.000 skills er fysisk umuligt. Det er ikke en
gradsforskel, det er forskellen på om et katalog kan skalere.

**Tillid — det stærkeste punkt.** En skill der siger "jeg rører ikke netværket" afgiver et **løfte**.
En capability der erklærer `effect: PURE` er underlagt en **begrænsning**: subprocessen får ikke ét
eneste `--allow-*`-flag, plus `--no-remote` og `--no-npm` fordi nul rettigheder alene ikke er nok
(SEC-10). For `NETWORK` er tildelingen en *skæring* mellem capability'ens `permissions.network` og
den lokale politik i `cfcm.json` — en capability kan ikke give sig selv adgang ved at bede om den.
Den garanti kan en skill strukturelt ikke give, uanset hvor omhyggeligt den er skrevet.

**Evidens.** Observeret i en rigtig session: forespørgslen "compute edit distance between two
strings" gav `PARTIAL_MATCH` med konfidens 0,508 mod `CapFoundry.geo.distance`, fordi ordet
*distance* optrådte i navn, aliases, beskrivelse, summaries **og** exampleQueries. Agenten kunne
læse `matchedOn`, se at det var ét generisk ord to fremmede domæner deler, afvise matchet og skrive
koden selv. En skill bliver loadet eller ej — der er intet at inspicere, og derfor heller ingen måde
at tage fejl på en synlig måde.

## 4. Forslag: CFP som pakkeformat for skills

Her er der noget CF har, som skills mangler. En skill er i dag en fil uden:

- `sha256` — du kan ikke verificere at den skill der kører er den du reviewede
- provenance — en skill afledt af andres arbejde har ingen `derivedFrom`
- licens i pakken
- version og forsegling
- maskinlæsbar test-suite

Forskellen er mærkbar i praksis. Under arbejdet med `CapFoundry.sun.times` tvang CFP-formatet en
gennem licenstekst ordret, `derivedFrom` med version og hentedato, og en validator der afviser
pakken uden dem. Var det samme arbejde skrevet som en skill, havde intet spurgt om nogen af delene.

**Forslaget er derfor ikke at afskaffe skills, men at pakke dem som CFP'er:**

```jsonc
{
  "name": "CapFoundry.skill.capabilityAwareness",
  "effect": "PURE",
  "artifact": { "type": "instructions", "entrypoint": "./artifact/SKILL.md", "sha256": "..." },
  "exposure": { "execution": false, "artifact": true }
}
```

Samme kontrakt, samme forsegling, samme provenance-krav — men `type: "instructions"` frem for
`type: "typescript"`, og `execution: false`, fordi en skill ikke eksekveres i en sandbox. Den
**loades i kontekst**. `exposure.artifact: true` er præcis den rigtige mekanik: at hente en skill
*er* at hente dens artefakt.

Det følger sporet visionen allerede er på. §39 beskriver en Skill der forvandler eksisterende
software til governed capabilities. Dette er samme idé anvendt på instruktioner frem for på kode.

### Hvad forslaget ikke løser

`outputSchema` giver ikke mening for instruktioner, og validatoren kræver det. Enten skal feltet
gøres betinget af `artifact.type`, eller `type: "instructions"` skal have sin egen validatorgren.
Det er en reel skema-ændring bag en `schemaVersion`-bump, ikke en tilføjelse — og derfor er dette
et forslag frem for en opgave.

Der er heller intet der måler om en skill *virker*. En capability har tests; en skill har
formulering. A/B-harnessen i `PRD-FEAT-015` er faktisk den nærmeste ting til en test for en skill,
og scenariet `search-should-be-skipped` er allerede mærket "Skill-kvalitet" i PRD'en. Det er værd at
bemærke inden nogen antager at forsegling alene giver kvalitetssikring.

## 5. Konklusion

CF's **eksekveringsmodel** kan ikke bære skills — determinisme, sandbox og kontrakter er forkerte
værktøjer til dømmekraft og prosa.

CF's **pakkedisciplin** kunne bære dem, og det er nok den mest oversete del af arkitekturen: CFP'en
er ikke først og fremmest en måde at køre kode på, men en måde at gøre noget ansvarligt for sin
oprindelse, sin licens og sin identitet.
