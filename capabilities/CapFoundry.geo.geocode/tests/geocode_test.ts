/**
 * Runs with no network permission at all — see tests/network_contract_test.ts.
 * Everything below is a pure function fed a recorded payload.
 */
import { assert, assertEquals, assertThrows } from "@std/assert";
import { buildRequest, parse } from "../artifact/index.ts";

const here = new URL(".", import.meta.url).pathname;
const fixture = (name: string) =>
  JSON.parse(Deno.readTextFileSync(`${here}fixtures/${name}`)) as unknown;

// --- buildRequest: the half a payload fixture would never reach ------------

Deno.test("non-ASCII survives encoding", () => {
  const { url } = buildRequest({ query: "Rådhuspladsen 1, 1550 København" });
  // The bug that looks like it works: a hand-built query string mangles å and ø
  // and silently fetches a different resource.
  assert(url.includes("R%C3%A5dhuspladsen"), `å was not UTF-8 encoded: ${url}`);
  assert(url.includes("K%C3%B8benhavn"), `ø was not UTF-8 encoded: ${url}`);
  assertEquals(new URL(url).searchParams.get("q"), "Rådhuspladsen 1, 1550 København");
});

Deno.test("Nominatim's required User-Agent is always sent", () => {
  // Nominatim returns 403 to an anonymous caller. Forgetting this header is a
  // request-construction bug, invisible to any test that starts at the payload.
  const { headers } = buildRequest({ query: "Viborg" });
  assert(headers["user-agent"].startsWith("CapFoundry/"), "identifying User-Agent missing");
});

Deno.test("countryCode and language reach the query string", () => {
  const { url } = buildRequest({ query: "Viborg", countryCode: "DK", language: "da" });
  const params = new URL(url).searchParams;
  assertEquals(params.get("countrycodes"), "dk", "country filter is lowercased");
  assertEquals(params.get("accept-language"), "da");
});

Deno.test("buildRequest rejects bad input before any call is made", () => {
  assertThrows(() => buildRequest({ query: "   " }), TypeError);
  assertThrows(() => buildRequest({ query: "x", limit: 0 }), RangeError);
  assertThrows(() => buildRequest({ query: "x", limit: 11 }), RangeError);
  assertThrows(() => buildRequest({ query: "x", countryCode: "DNK" }), RangeError);
  assertThrows(() => buildRequest({ query: "x", language: "DA" }), RangeError);
  assertThrows(() => buildRequest({ query: "x".repeat(301) }), RangeError);
});

// --- parse: the verdict ----------------------------------------------------

Deno.test("a name spanning countries is ambiguous, not a guess", () => {
  const out = parse(fixture("ambiguous-viborg.json"), { query: "Viborg" });
  assertEquals(out.status, "ambiguous");
  assertEquals(out.resolved, false);
  assertEquals(out.match, null, "no match is offered when the country is undecided");
  assert(out.candidates.length >= 3, "the caller still gets the list to choose from");
  const countries = new Set(out.candidates.map((c) => c.countryCode));
  assert(countries.size > 1, `expected several countries, got ${[...countries].join(",")}`);
});

Deno.test("a single unambiguous hit resolves", () => {
  const out = parse(fixture("ok-address-dk.json"), { query: "Prinsens Alle 5, 8800 Viborg" });
  assertEquals(out.status, "ok");
  assertEquals(out.resolved, true);
  assert(out.match !== null);
  assertEquals(out.match.countryCode, "DK");
  assert(Math.abs(out.match.lat - 56.46) < 0.05, `lat was ${out.match.lat}`);
  assert(Math.abs(out.match.lon - 9.41) < 0.05, `lon was ${out.match.lon}`);
});

Deno.test("countryCode turns an ambiguous name into a resolved one", () => {
  const before = parse(fixture("ambiguous-viborg.json"), { query: "Viborg" });
  const after = parse(fixture("ok-country-filtered.json"), { query: "Viborg", countryCode: "DK" });
  assertEquals(before.status, "ambiguous");
  assertEquals(after.status, "ok");
  assertEquals(after.match?.countryCode, "DK");
});

Deno.test("no results is an answer, not an error", () => {
  const out = parse(fixture("not-found.json"), { query: "Qzzxvbn Nonexistent Street 9999" });
  assertEquals(out.status, "not_found");
  assertEquals(out.resolved, false);
  assertEquals(out.match, null);
  assertEquals(out.candidates, []);
});

Deno.test("Danish characters round-trip through a real response", () => {
  const out = parse(fixture("nonascii-address.json"), { query: "Rådhuspladsen 1, 1550 København" });
  assertEquals(out.status, "ok");
  assert(out.match!.displayName.includes("Rådhuspladsen"), out.match!.displayName);
});

Deno.test("ODbL attribution is in every response, including failures", () => {
  // The obligation flows to the caller, so it cannot live in documentation.
  for (const f of ["ambiguous-viborg.json", "ok-address-dk.json", "not-found.json"]) {
    const out = parse(fixture(f), { query: "x" });
    assert(out.attribution.includes("OpenStreetMap"), `${f} dropped attribution`);
    assert(out.attribution.includes("ODbL"), `${f} dropped the licence name`);
  }
});

Deno.test("a non-array payload is rejected rather than coerced", () => {
  // Nominatim answers an error with an HTML page or an object, not an array.
  assertThrows(() => parse({ error: "Unable to geocode" }, { query: "x" }), TypeError);
  assertThrows(() => parse("<html>429</html>", { query: "x" }), TypeError);
});

Deno.test("entries without usable coordinates are dropped, not returned as NaN", () => {
  const out = parse([{ lat: "not-a-number", lon: "9.4", display_name: "junk" }], { query: "x" });
  assertEquals(out.status, "not_found");
});
