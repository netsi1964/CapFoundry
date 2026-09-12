/**
 * CapFoundry.date.businessDaysBetween
 *
 * Counts business days between two dates.
 *
 * "Business days between" is ambiguous in ordinary speech, so the contract
 * pins it down rather than picking a convention silently:
 *
 *   - The interval is half-open [from, to) by default. Monday to Friday is 4.
 *     Set `inclusive: true` to count both endpoints, giving 5.
 *   - `to` before `from` yields a negative count, so the result composes like
 *     a signed difference instead of throwing.
 *   - Weekends default to Saturday and Sunday but are configurable, because
 *     the working week is Sunday-Thursday in much of the world.
 *   - Holidays are supplied by the caller. Deriving them would mean embedding
 *     a jurisdiction, and a wrong holiday table is worse than none.
 *
 * All arithmetic is in UTC. Local time would make the answer depend on the
 * machine, which would break determinism for a capability whose whole value is
 * being reproducible.
 *
 * PURE: no network, no filesystem, no clock, no randomness.
 */

export interface BusinessDaysInput {
  /** ISO date, YYYY-MM-DD. */
  from: string;
  to: string;
  /** Day numbers treated as weekend, 0 = Sunday through 6 = Saturday. */
  weekend?: number[];
  /** ISO dates to exclude. Duplicates and weekend collisions are handled. */
  holidays?: string[];
  /** Count both endpoints instead of the half-open interval. */
  inclusive?: boolean;
}

export interface BusinessDaysOutput {
  businessDays: number;
  calendarDays: number;
  weekendDays: number;
  holidayDays: number;
  /** True when `to` precedes `from`, in which case counts are negative. */
  reversed: boolean;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

function parseUtcDate(value: string, label: string): number {
  if (typeof value !== "string") throw new TypeError(`${label} must be an ISO date string`);
  const match = ISO_DATE.exec(value);
  if (!match) throw new RangeError(`${label} must be formatted YYYY-MM-DD, got "${value}"`);

  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);

  // Date.UTC silently rolls over: 2026-02-30 becomes 2026-03-02. Round-trip
  // the components to reject an impossible date instead of answering for a
  // different one.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new RangeError(`${label} is not a real calendar date: "${value}"`);
  }
  return timestamp;
}

export default function businessDaysBetween(input: BusinessDaysInput): BusinessDaysOutput {
  if (!input || typeof input !== "object") {
    throw new TypeError("input must be an object with from and to");
  }

  const fromTs = parseUtcDate(input.from, "from");
  const toTs = parseUtcDate(input.to, "to");

  const weekend = input.weekend ?? [0, 6];
  if (!Array.isArray(weekend)) throw new TypeError("weekend must be an array of day numbers");
  for (const day of weekend) {
    if (!Number.isInteger(day) || day < 0 || day > 6) {
      throw new RangeError(`weekend entries must be integers 0-6, got ${JSON.stringify(day)}`);
    }
  }
  const weekendSet = new Set(weekend);
  if (weekendSet.size === 7) {
    throw new RangeError("weekend cannot cover all seven days: there would be no business days");
  }

  const holidaySet = new Set<string>();
  for (const holiday of input.holidays ?? []) {
    parseUtcDate(holiday, "holidays entry");
    holidaySet.add(holiday);
  }

  const inclusive = input.inclusive ?? false;
  const reversed = toTs < fromTs;
  const start = reversed ? toTs : fromTs;
  const end = reversed ? fromTs : toTs;

  // Half-open counts [start, end). Inclusive extends the range by one day so
  // both endpoints are examined.
  const lastTs = inclusive ? end : end - MS_PER_DAY;

  let businessDays = 0;
  let weekendDays = 0;
  let holidayDays = 0;
  let calendarDays = 0;

  for (let ts = start; ts <= lastTs; ts += MS_PER_DAY) {
    calendarDays++;
    const isoDay = new Date(ts).toISOString().slice(0, 10);
    const dayOfWeek = new Date(ts).getUTCDay();

    if (weekendSet.has(dayOfWeek)) {
      weekendDays++;
      continue;
    }
    // Counted only when it would otherwise have been a working day, so a
    // holiday falling on a Saturday does not double-count.
    if (holidaySet.has(isoDay)) {
      holidayDays++;
      continue;
    }
    businessDays++;
  }

  const sign = reversed ? -1 : 1;
  return {
    businessDays: sign * businessDays,
    calendarDays: sign * calendarDays,
    weekendDays: sign * weekendDays,
    holidayDays: sign * holidayDays,
    reversed,
  };
}
