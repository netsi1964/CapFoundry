# CapFoundry.sun.times

Sunrise, sunset, twilight and golden hour for a date and location.

```json
{ "lat": 56.4602, "lon": 9.4054, "date": "2026-06-21", "timeZone": "Europe/Copenhagen" }
```

```json
{
  "date": "2026-06-21",
  "timeZone": "Europe/Copenhagen",
  "coordinates": { "lat": 56.4602, "lon": 9.4054 },
  "solarNoon": "2026-06-21T13:24:12+02:00",
  "nadir": "2026-06-21T01:24:12+02:00",
  "times": {
    "sunrise": "2026-06-21T04:31:55+02:00",
    "sunset": "2026-06-21T22:16:29+02:00",
    "dawn": "2026-06-21T03:26:46+02:00",
    "dusk": "2026-06-21T23:21:38+02:00",
    "nauticalDawn": null,
    "nauticalDusk": null,
    "nightEnd": null,
    "night": null,
    "goldenHourEnd": "2026-06-21T05:37:43+02:00",
    "goldenHour": "2026-06-21T21:10:41+02:00",
    "sunriseEnd": "2026-06-21T04:37:36+02:00",
    "sunsetStart": "2026-06-21T22:10:48+02:00"
  },
  "polarDay": false,
  "polarNight": false
}
```

## Phases

| Name                            | Sun's altitude | Meaning                              |
| ------------------------------- | -------------- | ------------------------------------ |
| `sunrise` / `sunset`            | −0.833°        | Upper edge touches the horizon       |
| `sunriseEnd` / `sunsetStart`    | −0.3°          | Whole disc is up / starts to set     |
| `goldenHourEnd` / `goldenHour`  | 6°             | Soft, warm light for photography     |
| `dawn` / `dusk`                 | −6°            | Civil twilight                       |
| `nauticalDawn` / `nauticalDusk` | −12°           | Nautical twilight                    |
| `nightEnd` / `night`            | −18°           | Astronomical twilight; full darkness |

## Three things the contract decides for you

**`null` means the phase does not happen that day — it is not an error.** At 56°N in midsummer the
Sun never drops 12° below the horizon, so `nauticalDawn` is `null` while `sunrise` is a real time.
`polarDay` and `polarNight` tell you which side the Sun stayed on when even `sunrise` is `null`, so
an empty result is never ambiguous.

**`date` is required and never defaults to "now".** Reading the wall clock would make the capability
non-deterministic: untestable, uncacheable, and different on every call. Time is an input here, not
an ambient fact.

**`timeZone` changes how an instant reads, never which instant it is.** Output is always ISO 8601 —
`Z` by default, the zone's offset when you name one. Both parse to the same epoch milliseconds. A
date with no time is anchored at 12:00 UTC, because solar-day resolution keys off local noon at the
given longitude.

## Accuracy

Roughly ±1 minute for rise and set at moderate latitudes, degrading near the poles where the Sun
crosses the horizon at a shallow angle. Atmospheric refraction is the standard −0.833° allowance,
not a live pressure and temperature model. `height` raises the horizon for an elevated observer but
assumes a sea-level horizon, not surrounding terrain.

## Licence and provenance

The astronomy is a port of [SunCalc](https://github.com/mourner/suncalc) v2.0.2 by Volodymyr
Agafonkin, BSD-2-Clause, retained verbatim in `license/LICENSE`. See `provenance.json`.
Cross-checked against upstream across 78 phase times at 8 locations, including polar day and polar
night, with no disagreement beyond trimmed milliseconds.
