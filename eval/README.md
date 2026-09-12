# eval/ — the A/B harness

`PRD-FEAT-015`. This is the feature the MVP exists to produce: a measured answer to whether asking
CapFoundry beats writing the code, including when it does not.

## Layout

```
eval/
├── types.ts              the scenario contract      (owned by Helmut)
├── harness.ts            runner, scoring, report    (owned by Helmut)
├── scenarios/<id>/       ten §22 scenarios          (owned by Marie)
└── reports/<timestamp>.md
```

## A scenario

```
eval/scenarios/near-miss-reject/
├── scenario.json     metadata and expected CFCM behaviour
├── prompt.md         the task, given to the agent verbatim
├── fixtures/         input files the task needs, if any
└── assert.ts         deterministic correctness check
```

## The two questions, kept apart

**Was the task solved?** `assert.ts`. Scenario-specific, so it is code.

**Did CFCM behave as expected?** The `expect` block in `scenario.json`. Identical in shape across
all ten, so it is declarative — and it is **not evaluated for the control run**, which has no CFCM.

Keeping these apart is what makes the comparison trustworthy. Merged, a scenario could quietly grade
itself on whether CapFoundry was used rather than on whether the work came out right, and then the
harness would only ever confirm what we hoped. `assert.ts` judges the work, not the route.

No LLM judges anything. A scenario that cannot be scored deterministically is not ready to be a
scenario.

## Recorded beats designed

`origin: "recorded"` marks a scenario taken from a real session. Those are worth more than invented
ones: the collision actually happened, so it stays honest as the index grows. Two already exist —

- **`near-miss-reject`** — "compute the edit distance between two strings" returned `PARTIAL_MATCH`
  at 0.508 against `CapFoundry.geo.distance`, matching on the token `distance` alone.
- **`candidate-worthy`** — `CapFoundry.text.editDistance` entered through the candidate loop after
  exactly that miss.

A set built entirely from imagination tests the search we think we built.

## Writing one

Copy `scenarios/_template/`. Fill in `scenario.json`, write the task in `prompt.md` as you would
type it to an agent, and make `assert.ts` check the output the way a reviewer would — not the way
the implementation happens to work.
