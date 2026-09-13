# Contributing

CapFoundry is an experiment, and it is allowed to fail — see
[docs/falsification.md](../docs/falsification.md). Contributions that make the answer clearer are as
welcome as ones that make the system bigger.

```bash
deno task ci        # everything the build checks
deno task prepare   # before every commit: fmt, reseal hashes, rebuild index, check precision
```

`prepare` is not optional. Formatting changes an artifact's bytes, which invalidates its sealed
`sha256`, which invalidates the index — and the precision check at the end catches a class of
regression described below.

## Adding a capability

Copy an existing CFP from `capabilities/`. The validator will tell you what is missing, but four of
its rules exist because of specific incidents and are worth knowing before you hit them.

**Artifacts must be a single self-contained file.** No `import`, no `require`, no `new Worker`. Deno
does not gate module loading behind permissions, so an import is a way out of a sandbox that grants
nothing else — a JSON import will read a file that `Deno.readTextFile` is refused. See SEC-11 in
[PRD.md](../PRD.md).

**Aliases must add recall.** An alias whose words all appear in the capability name is rejected: it
adds ranking weight without making the capability findable by anyone who does not already know it
exists.

**Widening a description is a precision change, not a documentation change.** Confidence rises with
how many fields a query's words touch, not with how well the capability fits. Two releases here have
accidentally made an unrelated query match by adding an accurate sentence.
`deno task check-precision` runs in `prepare` and will tell you.

**Add the questions your capability should _not_ answer.** Put them in
[`eval/near-misses.json`](../eval/near-misses.json) with a reason each. The reason is what a
maintainer needs on the day a query has become inconvenient and deleting it is easier than fixing
the collision. This is the single most useful thing you can contribute alongside a capability,
because nobody else knows where its edges are.

## Third-party code and data

`provenance.json` is required, and `derivedFrom` must name the upstream project, version, author and
licence. Keep the upstream licence text verbatim in `license/`. A header comment crediting someone
is good manners; it is not machine-readable provenance.

The same applies one level down: a recorded API response in `tests/fixtures/` is third-party data —
Nominatim payloads are ODbL — so it needs `tests/fixtures/provenance.json` naming source, retrieval
date and licence.

## Network capabilities

A `NETWORK` capability declares the hosts it needs; `cfcm.json` decides whether to grant them, and
the grant is the intersection. Off by default. A capability cannot give itself access by asking.

Its tests must pass with **zero network permission**. Split `buildRequest` and `parse` out as pure
exports and test them against recorded responses — see `tests/fixtures/network-cfp/good/` for the
shape. A suite that needs the live API is measuring someone else's uptime, and a red build that
means nothing teaches people to ignore red.

## Reporting something

Issues are the right place, including for design disagreements. If you think a guard is weaker than
it claims, say so — that has already happened twice here and both times the guard got better.

Pull requests: run `deno task prepare` and `deno task ci` before opening one, and check the exit
status rather than the tail of the output. Both of us have been caught by that.
