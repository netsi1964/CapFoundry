---
name: capability-awareness
description: Decide when to ask CapFoundry before writing code, how to judge what it answers, and when something you wrote is worth keeping. Use when implementing a deterministic, general-purpose piece of logic — parsing, validation, format conversion, geometry, date arithmetic, text normalisation — or after writing one.
---

# Capability awareness

CapFoundry answers one question: **do we already have this?** Your job is to ask it when it is worth
asking, and to judge the answer rather than obey it.

## When to search

Search when the task is **deterministic, general-purpose, and would help someone on a different
project**. All three, not any one.

Search: parsing, validation, format conversion, geometry, date arithmetic, text normalisation,
checksum algorithms, schema inference.

Do not search: business logic, project-specific glue, anything touching this codebase's own types,
one-liners, or anything where you would reject a match on sight. A search you already know will fail
costs tokens and returns nothing.

## Judging what comes back

`MATCH` — use it. Do not verify it by reimplementing; that spends the saving.

`PARTIAL_MATCH` — the index found overlap, not agreement. Read `matchedOn` in the response: if the
match rests on one generic word the two uses share, it is a coincidence. Distance between
coordinates and distance between strings are not the same capability. Write the code yourself.

`NO_MATCH` — a normal answer, not a failure. Write the code, say nothing about having searched.

**The confidence number is advice, and the evidence is the argument.** A capability whose contract
does not fit your input is wrong at any confidence. Trusting a number over a contract you can read
is the one failure mode that makes searching worse than not searching.

## Getting the code instead of the answer

Ask for `return: "artifact"` or `"result-and-artifact"` when the implementation needs to live in the
user's project rather than run once. Use `cfcm_describe` when you need the contract before shaping
input.

## When it refuses

An error is information, not an emergency. Write the code yourself and carry on. Do not retry, do
not work around it, and do not report the failure as though the task were blocked.

## Afterwards

If you wrote something that **passes the same three-part test you would have applied before
searching** — deterministic, general-purpose, useful elsewhere — offer it with
`cfcm_submit_candidate`. Nothing is published; it queues for a person.

Give real `aliases` and `exampleQueries`: phrases someone would search for, never restatements of
the name. Without them the capability can only be found by someone who already knows it exists,
which defeats the point.

Do not submit business logic, project glue, a thin wrapper around a standard library call, or
anything you would not want to maintain for someone else. Submitting everything you write is how a
registry becomes useless. Most of what you write should not be a candidate.
