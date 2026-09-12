# Falsification scoreboard

CapFoundry is an experiment, and it is allowed to fail. MVP §27 lists seven conditions that would
mean the idea does not work. They were written down before anything was measured, and this file
tracks them against evidence as it arrives.

The point of publishing it is that moving a goalpost is visible once the goalpost is dated. Three of
the seven verdicts below are **not yet measured**, and one measured number has already been
corrected downward in public. Both of those facts are the file doing its job.

**Last updated:** 2026-09-12 · **Phases 0–3 delivered, Phase 4 is the real measurement**

---

## The seven conditions

> Reconsider the concept if:

| # | Condition (§27) | Measured by | Current | Verdict |
|---|---|---|---|---|
| 1 | Agents rarely find useful matches | OBJ-1 hit rate ≥ 0.80 | **0.941** (16/17) | ⚠️ Provisional — see caveat |
| 2 | Local search creates more overhead than value | OBJ-3 ≤ 250 ms p95 | **40.5 ms** p95 | ✅ Met |
| 3 | Wrong matches degrade task quality | OBJ-2 wrong-match ≤ 0.05 | **0.000** (0/19) | ⚠️ Provisional — was 0.105 |
| 4 | Artifact distribution is cumbersome | OBJ-7 binary | — | ⬜ Not yet measured |
| 5 | Candidate submission creates mostly noise | OBJ-5 ≥ 0.50 | n = 1 | ⬜ Not yet measured |
| 6 | Approved candidates are rarely reused | OBJ-8 | — | ⛔ Out of scope — see below |
| 7 | Direct generation stays cheaper and equally reliable | A/B harness, OBJ-4 | — | ⬜ Not yet measured |

Condition 7 is the one that matters most, and it is the one with no evidence at all yet. Everything
above it could pass while it fails.

---

## Why two verdicts say "provisional"

**The queries were written by the person who wrote the capabilities' aliases.** OBJ-1 and OBJ-2 as
measured today show internal consistency, not independent recall. A registry whose search is tested
against phrasings by its own author will flatter itself. The honest measurement is the A/B harness
in Phase 4, whose scenarios are task-shaped rather than query-shaped. The numbers above are a
regression guard, not proof.

**OBJ-2 was reported as 0.000 when it was actually 0.105** — more than twice the ceiling. The cause
is recorded as F5 in the PRD: a single-candidate query received the full margin weight for free, so
being the only capability sharing one word counted as evidence of being the right one. On a
nine-capability index most queries reach exactly one candidate, so nearly everything got the bonus.

It was not the test suite that caught it. An agent in an ordinary session asked for edit distance
between two strings, CFCM answered `MATCH` at confidence 0.571 for a *geographic* distance
capability, and the agent rejected it on its own judgement. The test suite had missed it because the
near-miss set used the word "levenshtein" — unknown to the index, weighted at maximum, and just
heavy enough to push confidence under the threshold. A test had been written that confirmed the
answer its author hoped for.

Both are fixed and covered. They are recorded here rather than quietly repaired because a
falsification commitment that only publishes good numbers is not a commitment.

## Condition 6 is out of scope, not passed

OBJ-8 — whether approved candidates get reused enough to compound — **cannot be measured inside the
MVP's time horizon.** It needs longitudinal data this project has not existed long enough to
produce. It is marked deferred rather than met, and no verdict should be inferred from its absence.

## What happens next

Phase 4 runs the A/B harness: ten scenarios, both conditions, deterministic scoring with no model as
judge. Phase 5 produces `docs/mvp/RESULTS-v0.2.md` and a documented decision — **continue, pivot, or
falsify.**

None of the three is a failure. That sentence is in the PRD, and this file exists so it stays true
after the numbers arrive.
