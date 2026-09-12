/**
 * CapFoundry.geo.distance
 *
 * Great-circle distance between two WGS-84 coordinates.
 *
 * Uses the haversine formula on a spherical Earth. That is a deliberate
 * contract choice, not an oversight: haversine is numerically stable for small
 * distances (where the naive spherical law of cosines loses precision) and is
 * accurate to roughly 0.5% against the WGS-84 ellipsoid. Callers needing
 * survey-grade accuracy want Vincenty, which is a different capability with a
 * different contract, not a silent upgrade to this one.
 *
 * PURE: no network, no filesystem, no clock, no randomness.
 */

export type Unit = "km" | "m" | "mi" | "nmi";

export interface Point {
  lat: number;
  lon: number;
}

export interface DistanceInput {
  from: Point;
  to: Point;
  unit?: Unit;
}

export interface DistanceOutput {
  distance: number;
  unit: Unit;
  method: "haversine";
}

/** IUGG mean Earth radius, in metres. */
const EARTH_RADIUS_M = 6_371_008.8;

const PER_METRE: Record<Unit, number> = {
  m: 1,
  km: 1 / 1000,
  mi: 1 / 1609.344,
  nmi: 1 / 1852,
};

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function assertPoint(point: Point, label: string): void {
  if (!point || typeof point !== "object") {
    throw new TypeError(`${label} must be an object with lat and lon`);
  }
  const { lat, lon } = point;
  if (typeof lat !== "number" || !Number.isFinite(lat)) {
    throw new RangeError(`${label}.lat must be a finite number`);
  }
  if (typeof lon !== "number" || !Number.isFinite(lon)) {
    throw new RangeError(`${label}.lon must be a finite number`);
  }
  if (lat < -90 || lat > 90) {
    throw new RangeError(`${label}.lat must be between -90 and 90, got ${lat}`);
  }
  if (lon < -180 || lon > 180) {
    throw new RangeError(`${label}.lon must be between -180 and 180, got ${lon}`);
  }
}

export default function distance(input: DistanceInput): DistanceOutput {
  if (!input || typeof input !== "object") {
    throw new TypeError("input must be an object with from, to and an optional unit");
  }

  assertPoint(input.from, "from");
  assertPoint(input.to, "to");

  const unit: Unit = input.unit ?? "km";
  if (!(unit in PER_METRE)) {
    throw new RangeError(`unit must be one of km, m, mi, nmi — got ${String(unit)}`);
  }

  const phi1 = toRadians(input.from.lat);
  const phi2 = toRadians(input.to.lat);
  const deltaPhi = toRadians(input.to.lat - input.from.lat);
  const deltaLambda = toRadians(input.to.lon - input.from.lon);

  const sinHalfPhi = Math.sin(deltaPhi / 2);
  const sinHalfLambda = Math.sin(deltaLambda / 2);

  const a = sinHalfPhi * sinHalfPhi +
    Math.cos(phi1) * Math.cos(phi2) * sinHalfLambda * sinHalfLambda;

  // atan2 rather than asin: stable for antipodal points, where `a` reaches 1
  // and floating-point error can push it just past it.
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  const metres = EARTH_RADIUS_M * c;

  // Six decimals is sub-millimetre in every supported unit: enough to make the
  // output stable and comparable, without implying accuracy haversine lacks.
  return {
    distance: Number((metres * PER_METRE[unit]).toFixed(6)),
    unit,
    method: "haversine",
  };
}
