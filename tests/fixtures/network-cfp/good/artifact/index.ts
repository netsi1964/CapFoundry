/**
 * Fixture: the shape every NETWORK capability should take.
 *
 * Two pure halves, so the default export has no logic left to test.
 *
 *   buildRequest  deterministic, and where a whole class of bugs lives:
 *                 URL-encoding, query parameters, the headers an API refuses
 *                 you without. Under a single parse seam all of that would sit
 *                 on the untestable side of the line.
 *   parse         deterministic, exercised against recorded responses.
 *
 * What is left in the default export is four lines with nothing to get wrong,
 * and the fetch path itself is covered once at platform level in
 * tests/network_test.ts rather than once per capability.
 */

export interface QuoteInput {
  symbol: string;
  currency?: string;
}

export interface QuoteOutput {
  symbol: string;
  price: number;
  currency: string;
  stale: boolean;
}

export interface BuiltRequest {
  url: string;
  headers: Record<string, string>;
}

/** Pure. Encoding and parameter bugs are caught here or not at all. */
export function buildRequest(input: QuoteInput): BuiltRequest {
  if (!input || typeof input.symbol !== "string" || input.symbol.trim() === "") {
    throw new TypeError("symbol is required");
  }

  const url = new URL("https://quotes.example/v1/quote");
  // encodeURIComponent via URLSearchParams: a symbol containing a slash, a
  // space or a non-ASCII character must not change which resource is fetched.
  url.searchParams.set("symbol", input.symbol.trim().toUpperCase());
  if (input.currency) url.searchParams.set("ccy", input.currency.toUpperCase());

  return {
    url: url.toString(),
    // Some APIs refuse an anonymous caller outright; forgetting this header is
    // a request-construction bug that a payload fixture would never surface.
    headers: { accept: "application/json", "user-agent": "CapFoundry/0.1" },
  };
}

/** Pure. Everything that can be wrong about the response lives here. */
export function parse(payload: unknown, input: QuoteInput): QuoteOutput {
  if (!payload || typeof payload !== "object") {
    throw new TypeError("response was not a JSON object");
  }
  const p = payload as Record<string, unknown>;

  if (typeof p.last !== "number" || !Number.isFinite(p.last)) {
    throw new RangeError(`response has no usable price for ${input.symbol}`);
  }

  return {
    symbol: input.symbol.trim().toUpperCase(),
    price: p.last,
    currency: typeof p.ccy === "string" ? p.ccy.toUpperCase() : "USD",
    // A missing timestamp means freshness cannot be claimed, so it is reported
    // rather than assumed.
    stale: typeof p.asOf !== "string",
  };
}

export default async function quote(input: QuoteInput): Promise<QuoteOutput> {
  const { url, headers } = buildRequest(input);
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`quotes.example responded ${res.status}`);
  return parse(await res.json(), input);
}
