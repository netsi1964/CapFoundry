# Capability Packager — design spike

**PRD-FEAT-017 · Status: run complete, no automation built (deliberately) · Date: 2026-09-12**

Vision §39 proposes a Skill that turns existing open-source software into governed capabilities. The
MVP's success condition for it is narrow and worth restating before anything else: **one manual run
on one small permissively-licensed repository, documented.** Not a converter. The question the spike
answers is not "can this be automated" but "what would automation have to be right about".

The run was `CapFoundry.sun.times`, ported from
[SunCalc](https://github.com/mourner/suncalc) v2.0.2 by Volodymyr Agafonkin. It is in the registry,
it passes the validator, it has 11 tests, and its licence and provenance are intact.

**Deviation from the PRD, stated rather than buried:** the PRD says MIT; SunCalc is BSD-2-Clause.
That made the run *more* informative rather than less, because BSD-2-Clause requires the copyright
notice be retained verbatim in redistribution, which MIT-style permissiveness can make easy to
forget. See §4.

---

## 1. What the run actually involved

```
suncalc/index.js  (527 lines, 7 exported functions)
        │
        ├─ read the library and decide what a capability *is* here     ← judgement
        ├─ pick one function of the seven                              ← judgement
        ├─ port the maths unchanged                                    ← mechanical
        ├─ design the contract around it                               ← judgement
        ├─ write tests, cross-check against upstream                   ← mechanical
        └─ retain licence, record provenance                           ← mechanical, and skippable
```

Roughly a third of the work was mechanical. The rest was deciding things a repository does not
contain the answer to.

## 2. Five decisions that could not be automated

The PRD asks for at least three. There were five, and the last two are the ones that would make an
automated packager produce something worse than nothing.

### 2.1 One capability, not seven

SunCalc exports seven things. A converter would reasonably produce seven capabilities, or one with
seven methods. Both are wrong. `getTimes` is what people search for — "when does the sun set" — while
`getMoonPosition` returns a parallactic angle that matters only for telescope mounts. Shipping all
seven fills the index with capabilities nobody queries, which raises the cost of every search that
has to rank past them.

**What a tool cannot know:** demand. The judgement is about who will search for this, and that
information is not in the repository.

### 2.2 `addTime` had to be refused

`SunCalc.addTime(angle, riseName, setName)` mutates a module-global array. Two calls in the same
process affect each other, and the *shape* of the output then depends on call history rather than on
input. That is incompatible with an `outputSchema` that has `additionalProperties: false`.

An automated packager sees an exported function with a clean signature and wraps it. Detecting that a
function's effect is global mutation, and concluding that the right answer is to *not ship it*, is a
design call.

**What a tool cannot know:** that refusing to package something is a valid outcome.

### 2.3 Removing upstream's clock default

`getMoonIllumination(date = new Date())` reads the wall clock when the argument is omitted. That
default is correct for a library and fatal for a capability: it makes the function non-deterministic,
so it cannot be cached, cannot be tested, and returns a different answer on every call. `effect:
PURE` would be a lie.

The port makes `date` required. That is a **deliberate behavioural change to upstream**, in the
direction of a property upstream never promised.

**What a tool cannot know:** which upstream behaviours are load-bearing and which are conveniences
that violate the contract model. It requires understanding what `PURE` means, not what the code does.

### 2.4 `null` needed a reason attached

At high latitudes the sun does not rise. Upstream v2 returns `null` — correct, and insufficient.
`null` for "polar night" and `null` for "polar day" are opposite facts with identical
representations, and a caller who subtracts sunrise from sunset gets nothing either way.

The contract adds `polarDay` and `polarNight`, which exist in no upstream field. This is the packager
*adding* to the contract rather than transcribing it.

**What a tool cannot know:** where an absence is ambiguous to a caller. That comes from imagining the
caller, not from reading the function.

### 2.5 Degrees, ISO 8601, and time zones

Upstream returns `Date` objects and radians. A capability's output is JSON and its audience is agents
and humans, so the port returns ISO 8601 strings and degrees, and accepts an optional IANA
`timeZone` — verified to work under zero permissions, since Intl's database needs no file access.

None of this is in the library. It is a decision about what a registry's API should feel like, and it
is the same decision for every capability ported from every library — which is precisely why a Skill
should *ask* rather than infer.

## 3. What could be automated, and should be

Everything below is mechanical, and all of it is easy to skip by hand — which is the argument for
tooling. The spike is not an argument against automation; it is an argument about where the line sits.

| Step | Automatable | Note |
|---|---|---|
| Detect the licence and copy it into `license/` | Fully | Failing to do this is the most common supply-chain error, and a script never forgets |
| Fill `provenance.json` with repo, version, retrieval date | Fully | Requires no judgement and is tedious enough to skip |
| Scaffold the CFP directory to the frozen layout | Fully | |
| `sha256` sealing and index rebuild | Fully | Already automated: `deno task prepare` |
| Cross-check the port against upstream | Fully | A generated harness running both over shared inputs. This caught nothing here — 78 phase times, zero disagreement — which is the point of running it |
| Flag non-determinism: `Date.now`, `Math.random`, `fetch`, `Deno.env` | Fully | A grep would have found §2.3 and handed it to a human as a question |
| Flag module-global mutation | Partially | Detecting the write is easy; deciding it disqualifies the export is not |
| Propose `aliases` and `exampleQueries` | **No** | These decide whether the capability can be found at all. See §5 |

## 4. Licence and provenance, which is the part that survives

BSD-2-Clause requires the copyright notice be retained in redistribution. So
`license/LICENSE` holds upstream's text verbatim — not a reference, not an SPDX identifier — and
`provenance.json` records:

```json
{
  "origin": "derived",
  "license": "BSD-2-Clause",
  "derivedFrom": [{
    "name": "SunCalc", "version": "2.0.2",
    "author": "Volodymyr Agafonkin",
    "repository": "https://github.com/mourner/suncalc",
    "license": "BSD-2-Clause", "retrievedAt": "2026-09-12"
  }]
}
```

The observation worth keeping: **the CFP format forced this.** The validator rejects a package
without `license/` and `provenance.json`, so the obligation was met because it could not be skipped,
not because the author was diligent. Had the same work been written as a skill or pasted into a
utility file, nothing would have asked.

That is an argument for the packaging discipline independent of any tooling, and it generalises —
see [skills-vs-capabilities](proposals/skills-vs-capabilities.md).

## 5. The finding that surprised me

I expected the hard part to be the code. It was the **aliases**.

A capability nobody can find is worth nothing, and `aliases` and `exampleQueries` are the entire
discovery surface — search is lexical, so a capability is reachable exactly through the words someone
thought to write down. `sun.times` ships eight aliases including "golden hour calculator" and
"midnight sun and polar night". Neither phrase appears anywhere in SunCalc's source, README or
function names. They came from asking who searches for this and in what words.

This also explains a failure already recorded in the PRD. `geo.distance` matched an edit-distance
query at 0.5679 confidence because the word *distance* appeared across five of its fields at once.
Aliases are what make a capability findable and also what make it findable for the wrong thing, and
there is no view of the source code from which either could be derived.

**Consequence for the Skill:** it should refuse to generate aliases silently. Proposing them and
asking is fine. Inventing them from identifiers produces capabilities that are reachable only by
someone who already knows the capability exists — which defeats the point of a registry.

## 6. What the Skill should be

Not a converter. `skills/capability-packager/SKILL.md` is the deliverable, and it is dialogue-shaped
on purpose:

1. **Inspect and report** — exports, licence, dependencies, non-determinism flags. No proposals yet.
2. **Propose boundaries, ask** — "seven exports; I'd ship one; here's why". The user decides.
3. **Surface the contract questions** — units, time zones, what `null` means, what to refuse.
4. **Scaffold mechanically** — layout, licence, provenance, seal, index.
5. **Require the human for aliases** — propose, never assume.

Step 5 is the one most likely to be dropped as friction. It shouldn't be.

## 7. Explicitly not built

No automatic conversion, per MVP §5 and the PRD's acceptance criteria. The spike's output is this
document, one real CFP in the registry, and a Skill that asks questions. Building the converter
before running the process by hand would have produced a tool shaped around the steps that were easy
to imagine rather than the ones that turned out to matter.
