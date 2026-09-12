/**
 * CapFoundry.geo.geocode
 *
 * Resolves an address or place name to coordinates.
 *
 * NETWORK. The only impure capability in the set, and it is split into two
 * pure halves so the default export has no logic left to get wrong:
 *
 *   buildRequest  URL-encoding, the country filter, the language parameter and
 *                 the User-Agent Nominatim refuses you without. Deterministic,
 *                 and where a whole class of bugs lives that a payload fixture
 *                 would never surface.
 *   parse         everything that can be wrong about the response, including
 *                 the ambiguity verdict. Exercised against recorded responses.
 *
 * The contract's one real opinion: **it refuses rather than guesses.** A query
 * whose candidates span more than one country returns status "ambiguous" with
 * the list, not a number. "Viborg" is a town in Denmark, a village in South
 * Dakota and a city in Russia; silently taking the first would compute
 * correctly against the wrong place and return something entirely credible.
 * That is the worst failure a registry can distribute: wrong, plausible, and
 * reused by everyone.
 *
 * Attribution is in the output rather than in this comment, because the ODbL
 * obligation flows to whoever calls the capability, not only to this repo.
 */

export interface GeocodeInput {
  query: string;
  /** ISO 3166-1 alpha-2, e.g. "DK". The primary way to disambiguate a name. */
  countryCode?: string;
  /** Max candidates to consider, 1..10. Default 5. */
  limit?: number;
  /** ISO 639-1 preferred language for display names, e.g. "da". */
  language?: string;
}

export interface Place {
  displayName: string;
  lat: number;
  lon: number;
  countryCode: string;
  placeId: string;
  placeType: string;
}

export interface GeocodeOutput {
  resolved: boolean;
  status: "ok" | "ambiguous" | "not_found";
  query: string;
  /** Set only when status is "ok". */
  match: Place | null;
  /** Always populated when anything was found, best first. */
  candidates: Place[];
  attribution: string;
}

export interface BuiltRequest {
  url: string;
  headers: Record<string, string>;
}

const ENDPOINT = "https://nominatim.openstreetmap.org/search";

/** ODbL requires credit. Carried in the output so a caller cannot drop it by accident. */
const ATTRIBUTION = "Data © OpenStreetMap contributors, ODbL 1.0. Geocoding by Nominatim.";

/** Pure. Encoding and parameter bugs are caught here or not at all. */
export function buildRequest(input: GeocodeInput): BuiltRequest {
  if (!input || typeof input !== "object") {
    throw new TypeError("input must be an object with a query");
  }
  const query = typeof input.query === "string" ? input.query.trim() : "";
  if (query === "") throw new TypeError("query is required and must be a non-empty string");
  if (query.length > 300) throw new RangeError("query must be 300 characters or fewer");

  const limit = input.limit ?? 5;
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) {
    throw new RangeError(`limit must be an integer between 1 and 10, got ${String(limit)}`);
  }

  const url = new URL(ENDPOINT);
  // URLSearchParams encodes for us. "Rådhuspladsen 1" and "Nørre Allé 5" must not
  // change which resource is fetched, and hand-built query strings get this
  // wrong with non-ASCII input in a way that looks like it works.
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", String(limit));

  if (input.countryCode !== undefined) {
    if (typeof input.countryCode !== "string" || !/^[A-Za-z]{2}$/.test(input.countryCode)) {
      throw new RangeError(
        `countryCode must be two letters, e.g. DK — got ${String(input.countryCode)}`,
      );
    }
    url.searchParams.set("countrycodes", input.countryCode.toLowerCase());
  }

  if (input.language !== undefined) {
    if (typeof input.language !== "string" || !/^[a-z]{2}$/.test(input.language)) {
      throw new RangeError(`language must be a two-letter code, got ${String(input.language)}`);
    }
    url.searchParams.set("accept-language", input.language);
  }

  return {
    url: url.toString(),
    // Nominatim's usage policy requires an identifying User-Agent and returns
    // 403 without one. Omitting it is a request bug, invisible to any fixture
    // that starts at the payload.
    headers: {
      accept: "application/json",
      "user-agent": "CapFoundry/0.1 (+https://github.com/netsi1964/CapFoundry)",
    },
  };
}

function toPlace(raw: Record<string, unknown>): Place | null {
  const lat = Number(raw.lat);
  const lon = Number(raw.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;

  const address = (raw.address ?? {}) as Record<string, unknown>;
  const country = typeof address.country_code === "string"
    ? address.country_code.toUpperCase()
    : "";

  return {
    displayName: typeof raw.display_name === "string" ? raw.display_name : "",
    lat,
    lon,
    countryCode: country,
    placeId: raw.place_id === undefined ? "" : String(raw.place_id),
    placeType: typeof raw.addresstype === "string"
      ? raw.addresstype
      : typeof raw.type === "string"
      ? raw.type
      : "",
  };
}

/** Pure. Everything that can be wrong about the response lives here, including the verdict. */
export function parse(payload: unknown, input: GeocodeInput): GeocodeOutput {
  const query = typeof input?.query === "string" ? input.query.trim() : "";

  if (!Array.isArray(payload)) {
    throw new TypeError("response was not a JSON array; Nominatim may have returned an error page");
  }

  const candidates: Place[] = [];
  for (const raw of payload) {
    if (!raw || typeof raw !== "object") continue;
    const place = toPlace(raw as Record<string, unknown>);
    if (place) candidates.push(place);
  }

  if (candidates.length === 0) {
    return {
      resolved: false,
      status: "not_found",
      query,
      match: null,
      candidates: [],
      attribution: ATTRIBUTION,
    };
  }

  // Ambiguity is judged by country rather than by the provider's own ranking.
  // Nominatim's `importance` score would be easier, but leaning on it couples
  // this contract to one provider's quirks and would have to change if the
  // provider did. Crossing a border is the ambiguity that actually causes wrong
  // answers, and countryCode is the input that resolves it.
  const countries = new Set(candidates.map((c) => c.countryCode).filter((c) => c !== ""));
  const ambiguous = countries.size > 1;

  return {
    resolved: !ambiguous,
    status: ambiguous ? "ambiguous" : "ok",
    query,
    match: ambiguous ? null : candidates[0],
    candidates,
    attribution: ATTRIBUTION,
  };
}

export default async function geocode(input: GeocodeInput): Promise<GeocodeOutput> {
  const { url, headers } = buildRequest(input);
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`nominatim.openstreetmap.org responded ${res.status}`);
  return parse(await res.json(), input);
}
