---
name: capability-packager
description: Turn existing open-source code into a governed CapFoundry package through dialogue. Use when someone wants to package a library, a repository or their own utility as a capability — and to decide whether it should be packaged at all. Not a converter; it asks before it decides.
---

# Capability packager

Turning a library into a capability is mostly not a code problem. The code ports mechanically; what
takes judgement is deciding **which** parts deserve to exist as capabilities, what their contracts
should say, and what to refuse. This skill is dialogue-shaped because those answers are not in the
repository.

Read `docs/packager-spike.md` for the worked example this is derived from.

## The rule that shapes everything else

**Propose, then ask. Never infer and proceed.** A packager that runs to completion without a
question produces capabilities nobody searched for, with contracts nobody chose. If the user wants
speed, they can approve quickly — but they must approve.

## 1. Inspect and report. No proposals yet.

Read the source. Report, without recommending:

- every export, with its signature
- the licence, verbatim, and whether it requires notice retention
- dependencies, and whether the code runs without them
- **non-determinism flags**: `Date.now`, `new Date()` defaults, `Math.random`, `fetch`, `Deno.env`,
  file access, module-global mutation

The flags are the valuable half. Each one is a question for the user, not a verdict.

## 2. Propose boundaries. Then stop.

Most libraries should become fewer capabilities than they have exports. Say how many you would ship
and why, in terms of **who would search for it and in what words** — not in terms of code structure.

Ask directly:

> "This exports seven functions. I'd ship one — `getTimes`, because 'when does the sun set' is a
> thing people search for, while `getMoonPosition` returns a parallactic angle that matters for
> telescope mounts. Shipping all seven fills the index with capabilities nobody queries. Do you want
> the others?"

**Refusing to package something is a valid outcome.** A function whose effect is global mutation
cannot have a stable `outputSchema`. Say so and recommend leaving it out.

## 3. Surface the contract questions

These recur for every port. Ask them; do not pick.

| Question                                       | Why it cannot be inferred                                                                                           |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Units — degrees or radians, ms or seconds?     | The library chose for its own audience, not for a registry's                                                        |
| Time representation — ISO 8601, epoch, `Date`? | Output is JSON; the library's choice may not survive it                                                             |
| Does any input default to the clock?           | A clock default makes it non-`PURE`: untestable, uncacheable, different every call. It must become a required input |
| What does an absent result mean?               | `null` for two opposite facts is ambiguous to a caller. It may need a reason field the library has no equivalent of |
| `effect` — is it really `PURE`?                | The runtime enforces it. A wrong declaration fails at execution, not at review                                      |

## 4. Scaffold mechanically

This part is safe to do without asking, and easy to skip by hand — which is why it belongs here:

- the CFP layout: `capability.json`, `artifact/`, `tests/`, `license/`, `provenance.json`,
  `README.md`
- **the licence, copied verbatim** into `license/` — not an SPDX identifier, not a link.
  BSD-2-Clause and similar require the notice be retained in redistribution
- `provenance.json` with `origin: "derived"` and a `derivedFrom` entry naming the upstream project,
  version, author, repository and retrieval date
- a cross-check harness running the port and the original over shared inputs, so "unchanged
  numerics" is a measurement rather than a claim
- `deno task prepare` to seal hashes and rebuild the index

## 5. Aliases require the human. Do not skip this.

`aliases` and `exampleQueries` are the entire discovery surface. Search is lexical: a capability is
reachable exactly through the words someone thought to write down, and none of those words are
reliably in the source.

Propose them and ask. Generating them from identifiers produces a capability findable only by
someone who already knows it exists.

Warn about the other direction too. A word that appears across name, aliases, description, summaries
and example queries at once will pull in queries from unrelated domains — that is how a geographic
distance capability came to match an edit-distance query at 0.57 confidence. Aliases that are too
broad are as expensive as aliases that are too narrow.

## 6. Add the queries it should _not_ answer

A capability's aliases decide what finds it. The near-miss set decides what should not, and it is
the only thing standing between a well-meant description and a wrong match —
`deno task
check-precision` can only check queries somebody wrote down.

So when you package something, propose two or three queries from adjacent domains that this
capability must **not** claim, with a reason each, for `eval/near-misses.json`. A geocoder should
not answer a routing question. A sorting table should not answer a React virtualisation question.
Adding them costs a minute and is the only way the guard covers your capability at all.

**What the guard cannot see.** `check-precision` fires when a capability _loses_ its own example
query to another. It stays quiet while one merely grows into another's territory. Measured on this
registry: `geo.geocode` wins its own example query at a margin of 0.729; after another capability
took that query as an alias, geocode still won, but the margin fell to 0.225. A factor of three, and
neither check reads it. So a passing guard means "nothing was taken outright", not "this description
is well-scoped" — and the difference is exactly the case that has already broken OBJ-2 once.

## 7. Never write what it does _not_ do into a searchable field

Measured, not theorised. `geo.geocode` was matching a reverse-geocoding query at 0.7388, so the
description gained the clause _"Does not reverse coordinates back into an address"_ — an honest,
accurate sentence.

The score went **up**, to 0.8862.

Lexical search has no negation. "Does not reverse coordinates back into an address" and "reverses
coordinates back into an address" are the same bag of words, so the disclaimer handed the query
every token it was looking for. **Stating a limit in an indexed field makes the capability match the
thing it disclaims.**

Limits belong in the README, which a human reads and the index does not. `description`, `aliases`,
`exampleQueries`, `inputSummary`, `outputSummary` and `tags` are search surface — write only what
the capability _is_ there.

The same trap in miniature: `sun.times` matched "what phase is the moon in tonight" because its
output summary said "solar phase" and an example query ended "tonight". Two ordinary words, neither
about the moon.

## What this skill does not do

No automatic conversion, and no unattended runs. If the process has not been done by hand for the
code in question, the questions above are the value; skipping them to save time produces a package
that passes the validator and fails the point.
