import { assertAlmostEquals, assertEquals, assertThrows } from "@std/assert";
import distance from "../artifact/index.ts";

const COPENHAGEN = { lat: 55.6761, lon: 12.5683 };
const STOCKHOLM = { lat: 59.3293, lon: 18.0686 };
const LONDON = { lat: 51.5074, lon: -0.1278 };

Deno.test("known distance: Copenhagen to Stockholm", () => {
  const out = distance({ from: COPENHAGEN, to: STOCKHOLM });
  // Published great-circle distance is ~522 km.
  assertAlmostEquals(out.distance, 522.2, 1.5);
  assertEquals(out.unit, "km");
  assertEquals(out.method, "haversine");
});

Deno.test("known distance: Copenhagen to London", () => {
  const out = distance({ from: COPENHAGEN, to: LONDON });
  assertAlmostEquals(out.distance, 955.5, 2);
});

Deno.test("identical points are zero", () => {
  assertEquals(distance({ from: COPENHAGEN, to: { ...COPENHAGEN } }).distance, 0);
});

Deno.test("unit conversion is consistent", () => {
  const km = distance({ from: COPENHAGEN, to: STOCKHOLM, unit: "km" }).distance;
  const m = distance({ from: COPENHAGEN, to: STOCKHOLM, unit: "m" }).distance;
  const mi = distance({ from: COPENHAGEN, to: STOCKHOLM, unit: "mi" }).distance;
  const nmi = distance({ from: COPENHAGEN, to: STOCKHOLM, unit: "nmi" }).distance;

  assertAlmostEquals(m / 1000, km, 0.001);
  assertAlmostEquals(km / 1.609344, mi, 0.001);
  assertAlmostEquals(km / 1.852, nmi, 0.001);
});

Deno.test("default unit is km", () => {
  assertEquals(
    distance({ from: COPENHAGEN, to: STOCKHOLM }).distance,
    distance({ from: COPENHAGEN, to: STOCKHOLM, unit: "km" }).distance,
  );
});

Deno.test("symmetric: distance A to B equals B to A", () => {
  assertEquals(
    distance({ from: COPENHAGEN, to: STOCKHOLM }).distance,
    distance({ from: STOCKHOLM, to: COPENHAGEN }).distance,
  );
});

Deno.test("antipodal points are half the circumference", () => {
  // atan2 must stay stable where a approaches 1.
  const out = distance({ from: { lat: 0, lon: 0 }, to: { lat: 0, lon: 180 } });
  assertAlmostEquals(out.distance, 20015.09, 0.5);
});

Deno.test("poles: north to south pole", () => {
  const out = distance({ from: { lat: 90, lon: 0 }, to: { lat: -90, lon: 0 } });
  assertAlmostEquals(out.distance, 20015.09, 0.5);
});

Deno.test("crossing the antimeridian takes the short way", () => {
  const out = distance({ from: { lat: 0, lon: 179 }, to: { lat: 0, lon: -179 } });
  assertAlmostEquals(out.distance, 222.4, 1);
});

Deno.test("equator boundary coordinates are accepted", () => {
  const out = distance({ from: { lat: -90, lon: -180 }, to: { lat: 90, lon: 180 } });
  assertAlmostEquals(out.distance, 20015.09, 0.5);
});

Deno.test("deterministic across repeated calls", () => {
  const first = JSON.stringify(distance({ from: COPENHAGEN, to: STOCKHOLM }));
  for (let i = 0; i < 100; i++) {
    assertEquals(JSON.stringify(distance({ from: COPENHAGEN, to: STOCKHOLM })), first);
  }
});

Deno.test("rejects out-of-range latitude", () => {
  assertThrows(() => distance({ from: { lat: 91, lon: 0 }, to: LONDON }), RangeError);
});

Deno.test("rejects out-of-range longitude", () => {
  assertThrows(() => distance({ from: { lat: 0, lon: 181 }, to: LONDON }), RangeError);
});

Deno.test("rejects non-finite coordinates", () => {
  assertThrows(() => distance({ from: { lat: NaN, lon: 0 }, to: LONDON }), RangeError);
  assertThrows(() => distance({ from: { lat: 0, lon: Infinity }, to: LONDON }), RangeError);
});

Deno.test("rejects an unsupported unit", () => {
  assertThrows(
    () => distance({ from: COPENHAGEN, to: STOCKHOLM, unit: "furlong" as never }),
    RangeError,
  );
});

Deno.test("rejects a missing point", () => {
  assertThrows(
    () => distance({ from: COPENHAGEN } as never),
    TypeError,
  );
});
