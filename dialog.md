# dialog.md — coordination between parallel sessions

Two Claude Code sessions work in this repository at the same time. This file is the operational
state: who owns what, what we have agreed, and what is open.

It used to carry the message history too, and the history won — 246 of 288 lines, so the part you
actually read before starting work was buried under a transcript. The record now lives in
[docs/dialog-log.md](docs/dialog-log.md), newest first. Keep this file short enough to read in full.

**Sessions**

| Name                         | Owns                                                                                                                                            |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Helmut** (`capfoundry-f8`) | `cfcm/`, `scripts/`, `schemas/`, `tests/`, `bin/`, `eval/harness.ts`, `eval/types.ts`, `PRD.md`                                                 |
| **Marie** (`capfoundry-f9`)  | `capabilities/CapFoundry.sun.times`, `capabilities/CapFoundry.geo.geocode`, `eval/scenarios/`, `web/explore/`, `docs/proposals/`, `docs/comms/` |

Message a session directly: `SendMessage({ to: "capfoundry-f9", ... })`. Use this file for what a
restarted session needs; use the log for reasoning worth keeping.

---

## Working agreement

Every line is here because it already went wrong once.

1. **Never `git add -A`.** Stage explicit paths. A blanket add sweeps the other session's
   half-finished work into your commit.
2. **`deno fmt` rewrites the whole repo.** Scope it to your own paths while another session is
   active, or you will reformat a file someone is mid-edit.
3. **JSON config cannot be partially staged.** `deno.json` is shared, and a diff hunk is not
   stageable the way a text file's is. If you both have a task in it, commit only your line and
   restore the other in the working tree — and say so. Committing it whole can publish a task
   pointing at a file that does not exist yet.
4. **`deno task prepare` rebuilds the index.** It no longer dirties the tree when nothing changed,
   but it will move the index under you if it did.
5. **Edit only your own row** in the tables above. Ownership is the one piece of genuinely shared
   mutable state here, and two sessions rewriting the same row is how it goes stale silently.
6. **Claim before you build.** Add the path to your row before creating a capability directory, so
   two sessions do not author the same thing.
7. **Say what you changed that others depend on.** The shared surfaces are `cfcm/`, `schemas/`,
   `scripts/`, `deno.json`, `PRD.md`.
8. **Land your work.** Uncommitted files in a shared tree are the hazard behind half the rules
   above.
9. **Fetch before you bisect.** A failure you are about to investigate may have been fixed in the
   ninety seconds since you saw it. The cheap version costs you an investigation; the expensive one
   has both sessions working the same problem in opposite directions.
10. **Push a ref, never check out a branch.** `git push origin HEAD:main` moves a branch without
    touching the tree. A checkout is _silent from the other session's side_: files change under you
    with no signal, and you find out through a confusing test failure and start doubting your own
    work rather than suspecting the tree. **And a local branch name can be stale even straight after
    a fetch.** Verifying against `origin/main` tells you nothing about what `main` will give you —
    they are different refs, and a rewrite leaves the local one pointing at history that no longer
    exists. If you check out at all, check out the remote ref or reset to it in the same breath.
    Never trust the bare name.
11. **Mark a feature delivered when you deliver it.** Bookkeeping that drifts behind the work is
    invisible until someone asks whether the plan is done — and at that moment the document meant to
    answer that question is the least current thing in the repository. A sweep only happens when
    someone asks, which is exactly too late.

## Decisions

One line each. The reasoning is in [the log](docs/dialog-log.md).

| Decision                                                                                                | Who                                            | Why                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NETWORK capabilities: descriptor declares hosts, `cfcm.json` permits them, CFCM grants the intersection | Helmut                                         | A capability that grants itself access is a comment, not a permission model                                                                                                     |
| NETWORK artifacts split `buildRequest` and `parse` as pure exports                                      | Marie proposed, Helmut built                   | Request construction is deterministic and is where encoding bugs live; a payload-level fixture never sees them                                                                  |
| A NETWORK capability's tests must pass with zero network permission                                     | Helmut                                         | Otherwise the suite measures someone else's uptime, and a red build that means nothing trains people to ignore red                                                              |
| Recorded responses carry `tests/fixtures/provenance.json`                                               | Marie                                          | A recording is third-party data; Nominatim payloads are ODbL                                                                                                                    |
| `telemetry.logQueryText` off by default                                                                 | Marie argued, Helmut conceded                  | Recording when the user would rather not is silent and permanent; not recording costs one page section                                                                          |
| No NETWORK capability in the eval scenario set                                                          | Both                                           | It would let the A/B harness return a different verdict on a rerun for reasons unrelated to CapFoundry, which breaks `PRD-FEAT-015.6` reproducibility — not merely "it is slow" |
| Skills packaged as CFPs: deferred                                                                       | Helmut                                         | Sealing gives provenance, not quality assurance, and nothing measures whether a skill works. Recorded in `PRD-SEC-010` with the `schemaVersion` answer                          |
| No remote execution API                                                                                 | MVP §5                                         | "Centralize knowledge, decentralize execution" is the architecture, not a slogan                                                                                                |
| `dialog.md` is public                                                                                   | Sten                                           | Decided deliberately rather than discovered after the fact                                                                                                                      |
| Widening a descriptor is a precision change, guarded at seal time                                       | Marie flagged, Helmut built                    | Confidence rises with fields matched, not with fit. OBJ-2 has been crossed twice by edits nobody thought risky                                                                  |
| The falsification scoreboard records its own near-misses                                                | Marie                                          | A record containing only the incidents its author was absent for is a highlights reel                                                                                           |
| An artifact states its own limits                                                                       | Marie named it, Helmut had done it by accident | You cannot predict who reads it. A caveat living only in the PRD survives until someone opens a report without reading the PRD                                                  |
| Every guard encodes a lesson already paid for                                                           | Marie                                          | So the claim is not "we have guards" but "we convert each surprise into one" — and the next class is uncovered by definition                                                    |

## Open

- `geo.addresses.distance` waits until `geo.geocode` has survived contact — Marie
- Phase 4: `eval/harness.ts` — Helmut · `eval/scenarios/` and `web/explore/` — Marie
- `PRD-FEAT-017` packager spike — Marie
- Live contract checks exist for `geo.geocode`; whether they generalise is open
