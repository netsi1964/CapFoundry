# Prompt for Claude Design — CapFoundry feature deck

Paste everything below the line into Claude Design. It is self-contained: every capability name,
command and example in it is taken from the working repository, so nothing needs inventing.

---

Build me a slide deck about **CapFoundry**, a capability registry for AI agents. English throughout.
Around 16 artboards, 16:9.

**Purpose of the deck:** show what CapFoundry can do, how you use it, and why it was built. Someone
should finish it knowing what they would type and what they would get back.

**Audience:** software developers and engineering leads bringing AI into their development workflow.
Technical. They want to see the thing work, not hear it described.

**Tone:** plain and confident. No superlatives, no "revolutionary", no rocket emoji. Let the examples
do the persuading — every command in this deck is real and produces the output shown.

**Visual direction:** restrained and technical. One accent colour, otherwise near-monochrome. Real
monospace for every command, JSON key and capability name — the code is the content, so give it room.
Generous whitespace, one idea per slide. Diagrams as clean line work. Dark or light, pick one and
commit. No stock imagery, gradients or glow.

---

## The deck

### 1. Title
**CapFoundry** — "Don't generate what you already know."
Subtitle: a capability registry your AI agent searches before it writes code.

### 2. Why it exists
Models reinvent the wheel. The same haversine formula, the same CSV delimiter sniffer, the same slug
function, written fresh in every session, with no memory that any of it was ever solved. Each version
is correct, slightly different, and has to be read by someone.
**The line to land:** the problem isn't that AI writes bad code — it's that it writes good code
cheaply enough that nothing ever accumulates.

### 3. The idea
Before an agent solves a task, it asks its local manager (**CFCM**): *do we already have this?*
If yes, it runs a sealed, tested implementation. If no, it writes the code as usual — and can offer
what it wrote back to the registry.
Shorthand: **centralize knowledge, decentralize execution.**

### 4. The flow — diagram
`agent question → search → resolve artifact → verify sha256 → sandboxed execution → result`
with a branch from "no match" to `write it normally → offer as a candidate`.
Everything runs on the developer's own machine. No central execution service.

### 5. What you get back
Real search output, monospace:
```
$ cfcm search "coordinates for an address"
MATCH  confidence 0.867  (5.5 ms)
  CapFoundry.geo.geocode  1.0.0  [public]
    Resolve an address or place name to coordinates
    matched on: aliases · description · exampleQueries · summaries · tags
```
The point of the slide: it tells you **why** it matched, not just how confident it is.

### 6. Calling one
```
$ cfcm invoke CapFoundry.geo.geocode Aarhus
{ "resolved": true, "status": "ok",
  "match": { "displayName": "Aarhus, Aarhus Kommune, 8000, Danmark",
             "lat": 56.1496278, "lon": 10.2134046, "countryCode": "DK" },
  "attribution": "Data © OpenStreetMap contributors, ODbL 1.0." }
```
You rarely write JSON: arguments come from the capability's own `inputSchema`. A positional fills the
next required field, `--name value` a named one, `--a.b value` a nested one.

### 7. They compose
Results go to stdout and diagnostics to stderr, so capabilities pipe together:
```
cfcm invoke CapFoundry.geo.geocode Aarhus   →  lat/lon
        ↓
cfcm invoke CapFoundry.geo.distance         →  289.4 km to Hamburg
```
Two capabilities, neither of which knew the other existed, composed by a caller who read two
contracts.

### 8. The ten capabilities
A clean table — name, effect, one line each:
`csv.detectDelimiter` PURE — infer which character separates CSV fields, with its evidence
`date.businessDaysBetween` PURE — working days between two dates
`geo.distance` PURE — great-circle distance between two coordinates
`geo.geocode` **NETWORK** — address or place name to coordinates
`json.schema.infer` PURE — JSON Schema from an example document
`sun.times` PURE — sunrise, sunset, twilight, golden hour
`text.editDistance` PURE — Levenshtein distance and similarity
`text.slugify` PURE — text to a URL-safe slug
`ui.dataTable` PURE — a framework-free sortable table as a custom element
`validation.iban` PURE — IBAN validation to ISO 13616

### 9. Two ways to get an answer
`return: "result"` runs it and hands you the answer.
`return: "artifact"` hands you the **source**, to put in your own project and ship.
One registry serves both "answer my question" and "give me the code", and each capability decides
which it allows.

### 10. Contracts, not documentation
Every capability ships a `capability.json`: `inputSchema`, `outputSchema`, `effect`, `exposure`,
`permissions`, a sealed `sha256`, plus tests, licence and provenance. Show a trimmed real example.
A capability is a package you can verify, not a snippet you have to trust.

### 11. Effects the runtime enforces
`PURE` means no network, no filesystem, no clock, no randomness — and it is **enforced, not
promised**: the artifact runs in its own subprocess with no permission flags, plus `--no-remote` and
`--no-npm` so nothing can be loaded from outside. A capability cannot quietly reach the network
because the runtime never gives it the chance.

### 12. Network access is granted, never taken
`geo.geocode` *declares* what it needs:
```json
"effect": "NETWORK",
"permissions": { "network": ["nominatim.openstreetmap.org"] }
```
That is a request. CFCM intersects it with your own policy in `cfcm.json`, off by default — so it
reaches exactly one host, only if you allow it, and no other.

### 13. It refuses rather than guesses
`cfcm invoke CapFoundry.geo.geocode Viborg` returns `status: "ambiguous"` with candidates in
**Denmark, the United States and Russia** — and no answer. Add `--countryCode DK` and it resolves.
Silently picking the first would compute correctly against the wrong place and return something
entirely credible. A registry that is embarrassed to say "I'm not sure" is worse than one that says
nothing.

### 14. Your capabilities, your machine
Three namespaces, one search:
`CapFoundry.*` public · `Netsi.*` private, registered in your own `cfcm.json` so no central service
knows your organisation exists · `Local.*` machine-only, for trying something before publishing it.
A private capability can execute while refusing to hand back its source.

### 15. The registry grows from use
When an agent writes something deterministic and generally useful that the registry lacked, it can
offer it as a candidate. Nothing is published automatically — a person reviews and promotes it.
`CapFoundry.text.editDistance` joined the registry exactly this way: someone asked, there was no
match, the agent wrote it and offered it.
Alongside that, a local **Explore** page shows what is used most and what is repeatedly asked for and
missing — which is a list of what to build next.

### 16. Try it
```
git clone https://github.com/netsi1964/CapFoundry
deno task cfcm search "distance between two coordinates"
deno task cfcm invoke CapFoundry.text.slugify "Rødgrød med fløde"
```
Apache-2.0. Runs on Deno. Works as an MCP server for coding agents and as a CLI for people.
Ten capabilities, 397 tests.

---

## Rules for the whole deck

- Every command, name and number above is real. Do not invent capabilities, flags or metrics.
- Show output wherever there is output to show. This deck persuades by demonstration.
- Code and JSON in monospace and syntax-correct, trimmed to what the slide needs.
- One sentence a reader remembers beats three they skim.
- No slide should need a presenter to make sense.
