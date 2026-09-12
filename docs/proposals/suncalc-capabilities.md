# SunCalc as CapFoundry capabilities

**Status:** `CapFoundry.sun.times` is implemented and indexed · the rest are proposals · **Date:** 2026-09-12

SunCalc ([mourner/suncalc](https://github.com/mourner/suncalc), BSD-2-Clause) is an unusually good
match for the registry: pure mathematics, no outside world, no dependencies. Everything in the
library is `PURE` and runs unchanged in the zero-permission sandbox. That also makes it the cheapest
way to exercise the licence and provenance story from README §"CFP" against real third-party code.

## Status

| Capability | SunCalc method | Effect | Status |
|---|---|---|---|
| `CapFoundry.sun.times` | `getTimes` | `PURE` | **Implemented**, 11 tests, indexed |
| `CapFoundry.sun.position` | `getPosition` | `PURE` | Proposed — small |
| `CapFoundry.moon.illumination` | `getMoonIllumination` | `PURE` | Proposed — small |
| `CapFoundry.moon.position` | `getMoonPosition` | `PURE` | Proposed |
| `CapFoundry.moon.times` | `getMoonTimes` | `PURE` | Proposed |
| — | `addTime` | — | **Excluded**, see §4 |

## 1. Decisions already made in `sun.times`

These apply to all five. They are worth copying rather than renegotiating.

**Time is an input, never read.** `date` is required and does not default to "now". SunCalc's
`getMoonIllumination(date = new Date())` has a clock default — it must be removed in the port. A
capability that reads the wall clock is not `PURE`: it cannot be tested, cannot be cached, and gives
a different answer on every call. This is the only change to upstream behaviour that is necessary.

**Output is ISO 8601, and `timeZone` only changes how an instant reads.** Without a zone: `Z`. With
one: that zone's offset. Intl's time-zone database is verified available under zero permissions — no
`--allow-read`, no bundled data file.

**`null` means "does not occur", not "error".** And when something is `null`, the output must say
why. `sun.times` returns `polarDay`/`polarNight`; `moon.times` should likewise return
`alwaysUp`/`alwaysDown`. An empty result with no explanation is the same trap as a geocoding guess:
plausible and wrong.

**The licence travels in the package.** `license/LICENSE` holds upstream's BSD-2-Clause text
verbatim — redistribution requires it — and `provenance.json` carries `origin: "derived"` with
`derivedFrom`, version and retrieval date. `sun.times` is the template.

## 2. `CapFoundry.sun.position` — recommended next

Least work, and it shares `sunCoords`, `siderealTime` and `altitude` with the implemented one.

```jsonc
// in
{ "lat": 56.4602, "lon": 9.4054, "date": "2026-09-12T14:30:00Z" }
// out
{ "azimuth": 218.4, "altitude": 31.2, "date": "2026-09-12T14:30:00Z", "coordinates": {...} }
```

Two things the contract must state out loud that upstream only says in a comment:

- **Azimuth is north-based and clockwise** (0° = N, 90° = E, 180° = S, 270° = W). SunCalc v1 used
  south-based azimuth in radians. Anyone who remembers v1 will guess wrong, so the field needs a
  `description` saying so, not merely a number.
- **`altitude` is refraction-corrected** and in degrees, not radians.

Degrees rather than radians throughout is a deliberate break with upstream. The registry is an API
for humans and agents, not a mathematics library.

## 3. The Moon

`moon.illumination` is the most interesting of the three because it **takes only a date** — no
position. That makes it an unusually clean capability, and "what phase is the Moon in" is something
people actually search for.

```jsonc
// in
{ "date": "2026-09-12" }
// out
{ "fraction": 0.42, "phase": 0.27, "angle": -1.2, "phaseName": "waxing crescent" }
```

`phaseName` does not exist upstream. It is worth adding, because `phase: 0.27` is useless without
looking up what the number means, and a name is what the person was searching for in the first
place. Eight standard phases, derived deterministically from `phase`. That is the kind of contract
value that justifies a capability rather than pointing at the npm package.

`moon.times` has `alwaysUp`/`alwaysDown` and one extra wrinkle upstream warns about: the Moon can
rise and set **twice** in the same calendar day, because the lunar day is ~24h 50m. The contract
must be able to express that rather than dropping one of the events.

`moon.position` is straightforward, but add `distance` in km and consider omitting
`parallacticAngle` — it matters only for telescope mounts and costs contract surface.

## 4. Why `addTime` is excluded

`SunCalc.addTime(angle, riseName, setName)` mutates a module-global array. Two calls in the same
process affect each other, and the shape of the output depends on call history rather than on input.
That is incompatible with a contract whose `outputSchema` has `additionalProperties: false`.

If custom angles are to be supported, they belong as **input**, not as global configuration:

```jsonc
{ "lat": 56.46, "lon": 9.41, "date": "2026-06-21",
  "customPhases": [{ "angle": -4, "riseName": "myDawn", "setName": "myDusk" }] }
```

That is an additive change to `sun.times` and can wait until someone actually asks for it. YAGNI is
the right answer for now.

## 5. Order

1. `sun.position` — small, shares code with the implemented one, closes the solar half.
2. `moon.illumination` — date-only input, high search value, `phaseName` as added value.
3. `moon.times` — needs the double rise/set question decided first.
4. `moon.position` — lowest value; take it once the others exist.

A shared `artifact/astro.ts` across the solar capabilities is tempting, but each CFP has to be
self-contained on disk. A little duplicated mathematics across packages is the right price for each
package being distributable alone.
