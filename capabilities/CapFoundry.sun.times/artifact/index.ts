/**
 * CapFoundry.sun.times
 *
 * Sunrise, sunset and the other solar light phases for a date and location.
 *
 * The astronomy is a TypeScript port of SunCalc v2.0.2 by Volodymyr Agafonkin
 * (BSD-2-Clause, see ../license/LICENSE), which implements Meeus, "Astronomical
 * Algorithms" ch. 15 and 25. The port keeps SunCalc's numerics unchanged; what
 * is new here is the contract around them — validated input, ISO 8601 output,
 * and explicit polar-day/polar-night reporting.
 *
 * PURE: no network, no filesystem, no randomness — and deliberately no clock.
 * `date` is required rather than defaulting to "now", because a capability that
 * reads the wall clock returns a different answer on every call and cannot be
 * tested, cached or reasoned about. Time is an input here, not an ambient fact.
 *
 * Accuracy is roughly ±1 minute for the rise/set phases at moderate latitudes,
 * degrading near the poles where the Sun crosses the horizon at a shallow angle.
 */

const { PI, sin, cos, tan, asin, atan2: atan, acos, sqrt, abs, round } = Math;
const rad = PI / 180;

const dayMs = 1000 * 60 * 60 * 24;
const J1970 = 2440588;
const J2000 = 2451545;

/** Altitude angle (degrees) and the morning/evening name of each light phase. */
const PHASES: ReadonlyArray<readonly [number, string, string]> = [
  [-0.833, "sunrise", "sunset"],
  [-0.3, "sunriseEnd", "sunsetStart"],
  [-6, "dawn", "dusk"],
  [-12, "nauticalDawn", "nauticalDusk"],
  [-18, "nightEnd", "night"],
  [6, "goldenHourEnd", "goldenHour"],
];

export type PhaseName =
  | "sunrise"
  | "sunset"
  | "sunriseEnd"
  | "sunsetStart"
  | "dawn"
  | "dusk"
  | "nauticalDawn"
  | "nauticalDusk"
  | "nightEnd"
  | "night"
  | "goldenHourEnd"
  | "goldenHour";

export interface SunTimesInput {
  lat: number;
  lon: number;
  /** ISO 8601 date (`2026-06-21`) or instant (`2026-06-21T10:00:00Z`). */
  date: string;
  /** Observer height above the horizon, in metres. Raises the horizon slightly. */
  height?: number;
  /** IANA time zone for rendering the output, e.g. `Europe/Copenhagen`. */
  timeZone?: string;
}

export interface SunTimesOutput {
  date: string;
  timeZone: string;
  coordinates: { lat: number; lon: number };
  /** Always present; the Sun has a highest and lowest point even in polar conditions. */
  solarNoon: string;
  nadir: string;
  /** `null` where the Sun never reaches that phase's altitude on this day. */
  times: Record<PhaseName, string | null>;
  polarDay: boolean;
  polarNight: boolean;
}

// --- SunCalc port -----------------------------------------------------------

function fromJulian(j: number): Date {
  return new Date((j + 0.5 - J1970) * dayMs);
}

function toDays(date: Date): number {
  return date.valueOf() / dayMs - 0.5 + J1970 - J2000;
}

/**
 * ΔT = TT − UT in seconds (Espenak & Meeus polynomial fits, good ~1900–2150).
 * The Meeus series are defined in Terrestrial Time but the input is UT, so the
 * position math runs on TT while sidereal time stays on UT.
 */
function deltaT(d: number): number {
  const y = 2000 + d / 365.2425;
  let t: number;
  if (y < 1920) {
    t = y - 1900;
    return -2.79 + t * (1.494119 + t * (-0.0598939 + t * (0.0061966 - t * 0.000197)));
  }
  if (y < 1941) {
    t = y - 1920;
    return 21.20 + t * (0.84493 + t * (-0.076100 + t * 0.0020936));
  }
  if (y < 1961) {
    t = y - 1950;
    return 29.07 + t * (0.407 + t * (-1 / 233 + t / 2547));
  }
  if (y < 1986) {
    t = y - 1975;
    return 45.45 + t * (1.067 + t * (-1 / 260 - t / 718));
  }
  if (y < 2005) {
    t = y - 2000;
    return 63.86 +
      t * (0.3345 +
          t * (-0.060374 + t * (0.0017275 + t * (0.000651814 + t * 0.00002373599))));
  }
  if (y < 2050) {
    t = y - 2000;
    return 62.92 + t * (0.32217 + t * 0.005589);
  }
  t = (y - 1820) / 100;
  return -20 + 32 * t * t - 0.5628 * (2150 - y);
}

function toDaysTT(d: number): number {
  return d + deltaT(d) / 86400;
}

function altitude(H: number, phi: number, dec: number): number {
  return asin(sin(phi) * sin(dec) + cos(phi) * cos(dec) * cos(H));
}

/** Greenwich mean sidereal time, Meeus 12.4 (linear term). */
function siderealTime(d: number, lw: number): number {
  return rad * (280.46061837 + 360.98564736629 * d) - lw;
}

/** The Sun's apparent equatorial coordinates, Meeus ch. 25. */
function sunCoords(d: number): { ra: number; dec: number } {
  const t = d / 36525;
  const L0 = rad * (280.46646 + t * (36000.76983 + t * 0.0003032));
  const M = rad * (357.52911 + t * (35999.05029 - t * 0.0001537));
  const sinM = sin(M);
  const cosM = cos(M);
  const C = rad * ((1.914602 - t * (0.004817 + t * 0.000014)) * sinM +
    (0.019993 - 0.000101 * t) * 2 * sinM * cosM +
    0.000289 * sinM * (3 - 4 * sinM * sinM));
  const Om = rad * (125.04 - 1934.136 * t);
  const L = L0 + C - rad * (0.00569 + 0.00478 * sin(Om));
  const e = rad * (23.439291 - t * (0.0130042 + t * (0.00000016 - t * 0.000000504))) +
    rad * 0.00256 * cos(Om);

  return { ra: atan(cos(e) * sin(L), cos(L)), dec: asin(sin(e) * sin(L)) };
}

const J0 = 0.0009;

function observerAngle(height: number): number {
  return -2.076 * sqrt(height) / 60;
}

function wrapPi(a: number): number {
  return a - 2 * PI * round(a / (2 * PI));
}

/** Refines a transit time until the Sun's local hour angle is zero (Meeus 15.2). */
function solarTransit(dt: number, lw: number): number {
  for (let i = 0; i < 3; i++) {
    const H = wrapPi(siderealTime(dt, lw) - sunCoords(toDaysTT(dt)).ra);
    dt -= H / (2 * PI);
  }
  return dt;
}

/** Time the Sun reaches altitude h0; sign -1 = rise, +1 = set. NaN if it never does. */
function getSetJ(
  h0: number,
  dt: number,
  sign: number,
  lw: number,
  phi: number,
  decT: number,
): number {
  const cosH0 = (sin(h0) - sin(phi) * sin(decT)) / (cos(phi) * cos(decT));
  if (cosH0 < -1 || cosH0 > 1) return NaN;

  let d = dt + sign * acos(cosH0) / (2 * PI);
  for (let i = 0; i < 2; i++) {
    const c = sunCoords(toDaysTT(d));
    const H = wrapPi(siderealTime(d, lw) - c.ra);
    const h = altitude(H, phi, c.dec);
    const sinH = cos(phi) * cos(c.dec) * sin(H);
    if (abs(sinH) < 1e-6) break; // grazing the horizon — the correction is ill-conditioned
    d += (h - h0) / (2 * PI * sinH);
  }
  return d;
}

// --- Contract ---------------------------------------------------------------

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(value: unknown): Date {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError("date must be an ISO 8601 string, e.g. 2026-06-21");
  }
  // A date with no time is anchored at 12:00 UTC. Solar-day resolution keys off
  // local noon at the given longitude, so midday is the anchor least likely to
  // land on the wrong side of a day boundary.
  const raw = DATE_ONLY.test(value) ? `${value}T12:00:00Z` : value;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.valueOf())) {
    throw new RangeError(`date is not a valid ISO 8601 string: ${value}`);
  }
  return parsed;
}

function assertLatLon(lat: unknown, lon: unknown): asserts lat is number {
  if (typeof lat !== "number" || !Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new RangeError(`lat must be a finite number between -90 and 90, got ${String(lat)}`);
  }
  if (typeof lon !== "number" || !Number.isFinite(lon) || lon < -180 || lon > 180) {
    throw new RangeError(`lon must be a finite number between -180 and 180, got ${String(lon)}`);
  }
}

function assertTimeZone(tz: string): void {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
  } catch {
    throw new RangeError(`timeZone is not a known IANA zone: ${tz}`);
  }
}

/** `GMT+02:00` → `+02:00`; plain `GMT` → `Z`. */
function offsetInZone(d: Date, timeZone: string): string {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(d)
    .find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const suffix = name.replace("GMT", "");
  return suffix === "" ? "Z" : suffix;
}

/**
 * Renders an instant as ISO 8601 in the requested zone. The same instant is
 * returned either way — the zone changes how it reads, never which moment it is.
 */
function toIsoInZone(d: Date, timeZone: string): string {
  if (timeZone === "UTC") return d.toISOString().replace(/\.\d{3}Z$/, "Z");

  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(d).map((p) => [p.type, p.value]),
  ) as Record<string, string>;

  // hour12:false renders midnight as "24" in some ICU versions.
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}:${parts.second}` +
    offsetInZone(d, timeZone);
}

export default function sunTimes(input: SunTimesInput): SunTimesOutput {
  if (!input || typeof input !== "object") {
    throw new TypeError("input must be an object with lat, lon and date");
  }

  assertLatLon(input.lat, input.lon);
  const date = parseDate(input.date);

  const height = input.height ?? 0;
  if (typeof height !== "number" || !Number.isFinite(height) || height < 0) {
    throw new RangeError(`height must be a non-negative number of metres, got ${String(height)}`);
  }

  const timeZone = input.timeZone ?? "UTC";
  if (typeof timeZone !== "string") throw new TypeError("timeZone must be a string");
  assertTimeZone(timeZone);

  const lw = rad * -input.lon;
  const phi = rad * input.lat;
  const dh = observerAngle(height);

  // Anchor to the input date's solar day regardless of its time of day.
  const d = round(toDays(date) - J0 - lw / (2 * PI));
  const dt = solarTransit(d + J0 + lw / (2 * PI), lw);
  const dec = sunCoords(toDaysTT(dt)).dec;

  const times = {} as Record<PhaseName, string | null>;
  for (const [angle, riseName, setName] of PHASES) {
    const h0 = (angle + dh) * rad;
    const jrise = getSetJ(h0, dt, -1, lw, phi, dec);
    const jset = getSetJ(h0, dt, 1, lw, phi, dec);
    times[riseName as PhaseName] = Number.isNaN(jrise)
      ? null
      : toIsoInZone(fromJulian(jrise + J2000), timeZone);
    times[setName as PhaseName] = Number.isNaN(jset)
      ? null
      : toIsoInZone(fromJulian(jset + J2000), timeZone);
  }

  // Polar day/night: the Sun never crosses the rise/set altitude. Which side it
  // stays on is decided by its altitude at solar noon — its daily maximum.
  let polarDay = false;
  let polarNight = false;
  if (times.sunrise === null) {
    const noonAlt = altitude(0, phi, dec);
    const riseSetAlt = (PHASES[0][0] + dh) * rad;
    polarDay = noonAlt > riseSetAlt;
    polarNight = !polarDay;
  }

  const solarNoonDate = fromJulian(dt + J2000);
  return {
    date: toIsoInZone(solarNoonDate, timeZone).slice(0, 10),
    timeZone,
    coordinates: { lat: input.lat, lon: input.lon },
    solarNoon: toIsoInZone(solarNoonDate, timeZone),
    nadir: toIsoInZone(fromJulian(dt + J2000 - 0.5), timeZone),
    times,
    polarDay,
    polarNight,
  };
}
