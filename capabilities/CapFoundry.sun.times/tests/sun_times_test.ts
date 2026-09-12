import { assertAlmostEquals, assertEquals, assertThrows } from "@std/assert";
import sunTimes from "../artifact/index.ts";

const VIBORG = { lat: 56.4602, lon: 9.4054 };
const LONGYEARBYEN = { lat: 78.2232, lon: 15.6267 };
const QUITO = { lat: -0.1807, lon: -78.4678 };

/** Reference values cross-checked against SunCalc v2.0.2 (mourner/suncalc). */
Deno.test("Viborg midsummer matches the reference implementation", () => {
  const out = sunTimes({ ...VIBORG, date: "2026-06-21", timeZone: "Europe/Copenhagen" });
  assertEquals(out.times.sunrise, "2026-06-21T04:31:55+02:00");
  assertEquals(out.times.sunset, "2026-06-21T22:16:29+02:00");
  assertEquals(out.solarNoon, "2026-06-21T13:24:12+02:00");
  assertEquals(out.date, "2026-06-21");
  assertEquals(out.timeZone, "Europe/Copenhagen");
});

Deno.test("a time zone changes the rendering, never the instant", () => {
  const utc = sunTimes({ ...VIBORG, date: "2026-06-21" });
  const local = sunTimes({ ...VIBORG, date: "2026-06-21", timeZone: "Europe/Copenhagen" });
  assertEquals(
    new Date(utc.times.sunrise!).valueOf(),
    new Date(local.times.sunrise!).valueOf(),
  );
  assertEquals(utc.times.sunrise!.endsWith("Z"), true);
  assertEquals(local.times.sunrise!.endsWith("+02:00"), true);
});

Deno.test("phases that never occur are null, not an invalid date", () => {
  // At 56°N in midsummer the Sun never drops 12° below the horizon.
  const out = sunTimes({ ...VIBORG, date: "2026-06-21" });
  assertEquals(out.times.nauticalDawn, null);
  assertEquals(out.times.nauticalDusk, null);
  assertEquals(out.times.night, null);
  assertEquals(out.polarDay, false);
  assertEquals(out.polarNight, false);
});

Deno.test("polar day is reported, not silently empty", () => {
  const out = sunTimes({ ...LONGYEARBYEN, date: "2026-06-21" });
  assertEquals(out.times.sunrise, null);
  assertEquals(out.times.sunset, null);
  assertEquals(out.polarDay, true);
  assertEquals(out.polarNight, false);
  // Solar noon exists even when sunrise does not.
  assertEquals(out.solarNoon, "2026-06-21T10:59:19Z");
});

Deno.test("polar night is distinguished from polar day", () => {
  const out = sunTimes({ ...LONGYEARBYEN, date: "2026-12-21" });
  assertEquals(out.times.sunrise, null);
  assertEquals(out.polarDay, false);
  assertEquals(out.polarNight, true);
});

Deno.test("near the equator day length is close to twelve hours", () => {
  const out = sunTimes({ ...QUITO, date: "2026-09-23" });
  const hours = (new Date(out.times.sunset!).valueOf() -
    new Date(out.times.sunrise!).valueOf()) / 3_600_000;
  assertAlmostEquals(hours, 12.1, 0.2);
});

Deno.test("the result does not depend on the time of day in the input", () => {
  const morning = sunTimes({ ...VIBORG, date: "2026-06-21T01:00:00Z" });
  const evening = sunTimes({ ...VIBORG, date: "2026-06-21T23:00:00Z" });
  assertEquals(morning.times.sunrise, evening.times.sunrise);
});

Deno.test("observer height moves sunrise earlier", () => {
  const ground = sunTimes({ ...VIBORG, date: "2026-03-20", height: 0 });
  const tower = sunTimes({ ...VIBORG, date: "2026-03-20", height: 300 });
  const delta = new Date(ground.times.sunrise!).valueOf() -
    new Date(tower.times.sunrise!).valueOf();
  assertEquals(delta > 0, true, "a higher observer sees the Sun sooner");
});

Deno.test("southern hemisphere seasons are inverted", () => {
  const jan = sunTimes({ lat: -33.8688, lon: 151.2093, date: "2026-01-15" });
  const jul = sunTimes({ lat: -33.8688, lon: 151.2093, date: "2026-07-15" });
  const len = (o: typeof jan) =>
    new Date(o.times.sunset!).valueOf() - new Date(o.times.sunrise!).valueOf();
  assertEquals(len(jan) > len(jul), true, "January is summer in Sydney");
});

Deno.test("rejects invalid input", () => {
  assertThrows(() => sunTimes({ lat: 91, lon: 0, date: "2026-06-21" }), RangeError);
  assertThrows(() => sunTimes({ lat: 0, lon: 181, date: "2026-06-21" }), RangeError);
  assertThrows(() => sunTimes({ ...VIBORG, date: "not a date" }), RangeError);
  assertThrows(() => sunTimes({ ...VIBORG, date: "2026-06-21", height: -5 }), RangeError);
  assertThrows(
    () => sunTimes({ ...VIBORG, date: "2026-06-21", timeZone: "Mars/Olympus" }),
    RangeError,
  );
  // deno-lint-ignore no-explicit-any
  assertThrows(() => sunTimes(undefined as any), TypeError);
});

Deno.test("date is required rather than defaulting to the clock", () => {
  // A capability that reads the wall clock is not PURE and cannot be tested.
  // deno-lint-ignore no-explicit-any
  assertThrows(() => sunTimes({ ...VIBORG } as any), TypeError);
});
