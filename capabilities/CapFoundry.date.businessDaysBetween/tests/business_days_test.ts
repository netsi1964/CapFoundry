import { assertEquals, assertThrows } from "@std/assert";
import businessDaysBetween from "../artifact/index.ts";

// 2026-09-07 is a Monday. Anchoring on a known weekday keeps every case
// readable without a calendar in hand.
const MON = "2026-09-07";
const FRI = "2026-09-11";
const SAT = "2026-09-12";
const NEXT_MON = "2026-09-14";

const days = (from: string, to: string, opts: Record<string, unknown> = {}) =>
  businessDaysBetween({ from, to, ...opts }).businessDays;

Deno.test("half-open interval is the default: Monday to Friday is 4", () => {
  assertEquals(days(MON, FRI), 4);
});

Deno.test("inclusive counts both endpoints: Monday to Friday is 5", () => {
  assertEquals(days(MON, FRI, { inclusive: true }), 5);
});

Deno.test("a weekend is skipped", () => {
  // Mon..Sun half-open spans 7 calendar days, 5 of them working.
  assertEquals(days(MON, NEXT_MON), 5);
  const out = businessDaysBetween({ from: MON, to: NEXT_MON });
  assertEquals(out.calendarDays, 7);
  assertEquals(out.weekendDays, 2);
});

Deno.test("the same day is zero half-open and one inclusive", () => {
  assertEquals(days(MON, MON), 0);
  assertEquals(days(MON, MON, { inclusive: true }), 1);
});

Deno.test("a single weekend day is zero even when inclusive", () => {
  assertEquals(days(SAT, SAT, { inclusive: true }), 0);
});

Deno.test("a reversed range gives a negative count and sets reversed", () => {
  const out = businessDaysBetween({ from: FRI, to: MON });
  assertEquals(out.businessDays, -4);
  assertEquals(out.reversed, true);
  assertEquals(out.calendarDays, -4);
});

Deno.test("holidays are excluded", () => {
  // Wednesday 2026-09-09 removed from Mon..Fri.
  assertEquals(days(MON, FRI, { holidays: ["2026-09-09"] }), 3);
  const out = businessDaysBetween({ from: MON, to: FRI, holidays: ["2026-09-09"] });
  assertEquals(out.holidayDays, 1);
});

Deno.test("a holiday on a weekend is not double-counted", () => {
  const out = businessDaysBetween({
    from: MON,
    to: NEXT_MON,
    holidays: [SAT],
  });
  assertEquals(out.businessDays, 5, "a Saturday holiday must not reduce business days");
  assertEquals(out.holidayDays, 0);
  assertEquals(out.weekendDays, 2);
});

Deno.test("a holiday outside the range is ignored", () => {
  assertEquals(days(MON, FRI, { holidays: ["2026-12-25"] }), 4);
});

Deno.test("duplicate holidays are counted once", () => {
  const out = businessDaysBetween({
    from: MON,
    to: FRI,
    holidays: ["2026-09-09", "2026-09-09", "2026-09-09"],
  });
  assertEquals(out.businessDays, 3);
  assertEquals(out.holidayDays, 1);
});

Deno.test("the breakdown always sums back to calendarDays", () => {
  const out = businessDaysBetween({
    from: "2026-09-01",
    to: "2026-10-01",
    holidays: ["2026-09-09", "2026-09-12"],
  });
  assertEquals(out.businessDays + out.weekendDays + out.holidayDays, out.calendarDays);
});

Deno.test("a Sunday-Thursday working week is supported", () => {
  // Friday and Saturday as weekend: Mon..Fri half-open loses nothing,
  // but Mon..next Mon loses Friday and Saturday.
  assertEquals(days(MON, NEXT_MON, { weekend: [5, 6] }), 5);
  const out = businessDaysBetween({ from: MON, to: NEXT_MON, weekend: [5, 6] });
  assertEquals(out.weekendDays, 2);
});

Deno.test("an empty weekend counts every day", () => {
  assertEquals(days(MON, NEXT_MON, { weekend: [] }), 7);
});

Deno.test("spans a month and a year boundary correctly", () => {
  // 2026-12-31 is a Thursday, 2027-01-01 a Friday.
  assertEquals(days("2026-12-31", "2027-01-04"), 2);
});

Deno.test("handles a leap day", () => {
  // 2028-02-28 is a Monday; 2028 is a leap year so the 29th exists.
  const out = businessDaysBetween({ from: "2028-02-28", to: "2028-03-01" });
  assertEquals(out.calendarDays, 2);
  assertEquals(out.businessDays, 2);
});

Deno.test("deterministic across repeated calls", () => {
  const first = JSON.stringify(businessDaysBetween({ from: MON, to: NEXT_MON }));
  for (let i = 0; i < 100; i++) {
    assertEquals(JSON.stringify(businessDaysBetween({ from: MON, to: NEXT_MON })), first);
  }
});

Deno.test("rejects a malformed date", () => {
  assertThrows(() => businessDaysBetween({ from: "07-09-2026", to: FRI }), RangeError);
  assertThrows(() => businessDaysBetween({ from: MON, to: "2026-9-1" }), RangeError);
});

Deno.test("rejects an impossible calendar date rather than rolling it over", () => {
  // Date.UTC would silently turn this into 2026-03-02.
  assertThrows(() => businessDaysBetween({ from: "2026-02-30", to: FRI }), RangeError);
  // 2027 is not a leap year.
  assertThrows(() => businessDaysBetween({ from: "2027-02-29", to: FRI }), RangeError);
});

Deno.test("rejects an out-of-range weekend day", () => {
  assertThrows(() => businessDaysBetween({ from: MON, to: FRI, weekend: [7] }), RangeError);
  assertThrows(() => businessDaysBetween({ from: MON, to: FRI, weekend: [-1] }), RangeError);
});

Deno.test("rejects a weekend covering all seven days", () => {
  assertThrows(
    () => businessDaysBetween({ from: MON, to: FRI, weekend: [0, 1, 2, 3, 4, 5, 6] }),
    RangeError,
  );
});

Deno.test("rejects a malformed holiday", () => {
  assertThrows(
    () => businessDaysBetween({ from: MON, to: FRI, holidays: ["not-a-date"] }),
    RangeError,
  );
});
