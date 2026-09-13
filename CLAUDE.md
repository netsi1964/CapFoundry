# CLAUDE.md

CapFoundry is a capability registry for AI agents: search before you generate. CFCM (`cfcm/`) is
the local MCP server, CLI and runtime. `capabilities/` is the source of truth, `registry/index.json`
is derived from it. The project is an experiment that is allowed to fail, and
[docs/falsification.md](docs/falsification.md) lists the conditions that would count as failure.

- [PRD.md](PRD.md) — the plan and its status markers (Danish; IDs like `PRD-FEAT-015` in English)
- [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md) — how to add a capability, and why each
  validator rule exists
- [dialog.md](dialog.md) — history of two parallel sessions. That arrangement ended 2026-09-13.
  Work in one session.

## Commands

```bash
deno task prepare   # before every commit: fmt, reseal hashes, rebuild index, check precision
deno task ci        # everything the build checks
deno task cfcm search "…"   # or bin/cfcm
deno task eval      # mock driver, free. --driver claude-code spends money, see below
```

## Working with Sten

- Sten decides; explain choices in plain Danish as numbered options he can answer with "1A, 2B".
  Code, commits and CONTRIBUTING are English. PRD.md is Danish.
- **Anything that costs money needs a stated price and an explicit yes.** A 10-run real-agent pilot
  cost $4.56. A $45 full evaluation was declined as too expensive. Default to the mock driver.
- Publishing happens in the open: the repo is public. Never commit private addresses. They had to
  be rewritten out of history once. `cfcm.json`, telemetry and `web/explore/data.json` stay
  untracked.

## Rules, each with what it cost to learn

A rule without its incident cannot be judged by its reader. General advice ("be thorough") helps
nobody, so each rule below names the failure that produced it.

### 1. Verify the container, separately from the content

Check what the output has to fit before checking what it says.

- An X reply was reviewed carefully for content and came out at 1157 characters against a limit of
  280.
- A branch was reported deleted after `git branch -D`, which deletes locally only.
- `origin/main` was verified, and then the bare local `main` was checked out. That was a different
  ref, pointing at rewritten history.

These look like three mistakes and are one: nobody asked what the result had to satisfy. Name the
container (character limit, threshold, budget, target ref) and measure the finished thing against
it as a separate step. For git: fetch, compare against the remote ref, never trust a bare local
branch name.

### 2. Ask what it would look like if it were broken, including after your fix

If the answer is "like a result", that is where the effort belongs. Obviously broken output gets
investigated. Plausibly wrong output gets published.

- The eval driver lacked `--permission-mode`, and every run scored 0%. That was obviously broken
  and got caught.
- Adding only that flag would have been worse: MCP tools were still blocked, so condition A could
  see CFCM but not call it. The report would have shown equal scores and zero CFCM use, a
  falsification-shaped result caused by a missing flag (d1c82a6). The fix would have turned a loud
  failure into a quiet one.
- The pilot report said "2 of 2 wrong matches degrade quality". Neither run produced wrong work
  (b746575).

After fixing anything, ask which failure mode the fix converts the bug into. Loud to quiet is a
regression even when the tests pass.

### 3. Test your tests against wrong answers, and never let the code under test supply the expected value

An assertion that has never failed is untested. Run it against a correct, a subtly wrong and an
absent implementation. Pick the wrong one with care: for Hamming distance the dangerous opponent is
Levenshtein (`"abcde"` vs `"bcdea"`: 5 vs 2), not random garbage.

- A confidence test used a query containing "levenshtein". The rare term carried the score and hid
  the fact that a lone candidate received margin 1, so a wrong match scored 0.5679 (F5 in the PRD).
  The test passed for a reason unrelated to what it claimed to check.
- The reload fix (F9) has a test that asserts the call in `server.ts` itself. The other tests call
  `ensureFresh()` directly and would still pass if the server stopped calling it, which was the
  actual bug.

### 4. When a measurement cannot tell the cases apart, stop pinning it

Five plausible phrasings of one Hamming task spanned PARTIAL_MATCH 0.3604 to NO_MATCH 0.1126,
straddling the threshold. Pinning the scenario to one status would have measured the agent's
wording rather than its judgement. The expectation became `"any"` for search, and the scenario is
carried by `invoked: false`. Choosing the input that yields the hoped-for status is rule 3 one
level up. "Cannot be measured reliably" is a finding. Record the spread.

### 5. Name who enforces a rule

A rule enforced by the thing it constrains is a suggestion. That holds for a search counter an
agent could argue around (raised by [@kartikb753](https://x.com/kartikb753)), for a capability
granting itself network access, and for this file.

- Network access is the intersection of what the descriptor asks for and what `cfcm.json` allows.
  A capability cannot grant itself access by asking.
- A search limit "per task" was nearly recommended. An MCP server knows its process lifetime, not
  task boundaries, so per task needs the agent to declare its own tasks, which puts the judgement
  back.
- `PRD-FEAT-015` can only be marked ✅ when a real (non-mock) eval report is committed, and
  `tests/prd_claims_test.ts` checks that. A claim once went out that "no guard could catch this".
  It could.

### 6. Editing matched text is a behaviour change. Re-measure, don't reason

- Writing "Does not reverse coordinates back into an address" in `geo.geocode`'s description raised
  the wrong match for that query from 0.7388 to 0.8862. Lexical search has no negation. The
  disclaimer handed the query every one of its words.
- An accurate example query about "render" pushed an unrelated query across MATCH (4cccc8b).

After editing a description, alias or example query, run `deno task check-precision`. Record the
queries a capability must *not* answer in `eval/near-misses.json`, with a reason each.

### 7. Your own environment is part of the experiment

- A `capability-awareness` skill symlinked into the global skills folder loaded in the control arm
  too, so the variable under test leaked into the control. The driver now passes
  `--disable-slash-commands` and gives the skill to condition A only.
- `~/.claude/CLAUDE.md` still loads in both arms. That is symmetric, but it makes results depend on
  whose machine runs them. `--bare` would isolate it and needs `ANTHROPIC_API_KEY`.
- The eval reads Sten's own `cfcm.json`. `private-capability` depends on his `Netsi` namespace.

### 8. Report state precisely

"Committed" is not "pushed". "Done" is not "verified". A branch was reported deleted and was not,
and a history was reported clean while it still held what was meant to be removed. Say the exact
operation and its scope, say how something was verified, and say plainly when it was not.

### 9. Redact by content, across the whole tree

Removing private addresses from history missed occurrences because the search was scoped to the
files believed to contain them. Search the whole tree and history for the content itself, then
verify from a fresh clone. The list of affected files is a hypothesis.

### 10. Check the exit status, not the tail of the output

A broken build was pushed twice because the last lines of `deno task ci` looked fine: a missing
import, then an OBJ-2 regression. Read the exit code.

### 11. A scenario can go stale when the registry grows

`near-miss-reject` expected NO_MATCH for an edit-distance task. Then `text.editDistance` arrived
through the candidate loop, and the agent's correct MATCH scored as a failure. When a capability
lands, reread the scenarios that assumed it was absent.

### 12. Coordination is paid for by the person

Two parallel sessions found real defects in each other's work. The cost of tracking who knew what,
which branch held which fix and which draft had been sent fell on Sten, and it outgrew what the
parallelism saved. The arrangement was stopped while the work was going well. Work in one session,
batch what you report, and treat "this costs him more than it saves" as a real failure condition.

## The honest limit of this file

This file is itself a filter. An agent that can reason its way past a rule will. What actually
worked in this project was CI refusing things:

- `check-precision` caught a wrong match within a minute of the edit.
- The validator rejected an invalid fixture immediately.
- The module guard refuses artifacts that `import`, because Deno's permissions do not gate module
  loading (SEC-10, SEC-11).

The real work is converting rules into checks. Some are enforced already, and these are not yet:

| Rule | Enforced today by | Not yet enforced |
|---|---|---|
| 1 | — | output limits for anything that leaves the repo |
| 2 | `tests/driver_args_test.ts` pins the eval flags | a check that condition A searched at least once per run |
| 3 | scenario assertions smoke-tested by hand | an automatic run of each assertion against a near-correct implementation |
| 5 | `tests/prd_claims_test.ts`, `cfcm/runtime/permissions.ts` | — |
| 6 | `deno task check-precision` in `prepare` and `ci` | near-misses for queries nobody thought of |
| 10 | — | a pre-push hook that runs `ci` and fails on the exit status |
