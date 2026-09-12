/** Search tests (PRD-FEAT-004 acceptance criteria, OBJ-1 and OBJ-2). */

import { assert, assertEquals } from "@std/assert";
import { tokenize } from "../cfcm/search/tokenize.ts";
import { DEFAULT_THRESHOLDS, SearchEngine } from "../cfcm/search/engine.ts";
import type { IndexRecord } from "../cfcm/types.ts";

function record(partial: Partial<IndexRecord> & Pick<IndexRecord, "name">): IndexRecord {
  return {
    schemaVersion: 1,
    version: "1.0.0",
    description: "",
    aliases: [],
    exampleQueries: [],
    tags: [],
    inputSummary: "",
    outputSummary: "",
    runtime: "deno",
    effect: "PURE",
    artifact: { type: "typescript", sha256: "0".repeat(64) },
    exposure: { execution: true, artifact: true },
    cfpLocation: `capabilities/${partial.name}`,
    artifactLocation: `capabilities/${partial.name}/artifact/index.ts`,
    namespaceType: "public",
    indexedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

/**
 * Three real capability descriptors, copied verbatim from their capability.json.
 *
 * An invented fixture drifts from what ships and then lies in both directions:
 * a thinner one under-reports recall, a richer one hides wrong matches. These
 * are the actual aliases and example queries, so a mechanic pinned here is a
 * mechanic that holds in production.
 */
const FLEET = [
  record({
    name: "CapFoundry.geo.distance",
    description: "Calculate the great-circle distance between two geographic coordinates",
    aliases: [
      "haversine",
      "great circle distance",
      "distance between coordinates",
      "how far apart are two points",
      "kilometres between two places",
      "lat lon distance",
    ],
    exampleQueries: [
      "calculate distance between two latitude longitude coordinates",
      "how many kilometres between these two GPS points",
      "great circle distance between two places on earth",
      "how far apart are two coordinates in miles",
      "compute haversine distance between two positions",
    ],
    tags: ["geo", "geography", "math", "coordinates", "haversine", "gps"],
    inputSummary: "Two WGS-84 points as lat/lon degrees, plus an optional unit",
    outputSummary: "Great-circle distance as a number in the requested unit",
  }),
  record({
    name: "CapFoundry.text.slugify",
    description: "Convert arbitrary text into a stable URL-safe and filename-safe slug",
    aliases: [
      "url slug",
      "permalink",
      "kebab case",
      "web safe string",
      "clean up a title for a url",
      "seo friendly filename",
    ],
    exampleQueries: [
      "turn a blog post title into a url friendly string",
      "make a permalink from a heading with accents",
      "convert a product name into a safe filename",
      "generate a kebab case identifier from free text",
      "strip diacritics and spaces to build a web address",
    ],
    tags: ["text", "string", "url", "web", "normalization"],
    inputSummary: "Free text plus optional locale, separator, maxLength and lowercase",
    outputSummary: "A stable slug and whether it was truncated",
  }),
  record({
    name: "CapFoundry.validation.iban",
    description: "Validate an IBAN against ISO 13616 length, charset and mod-97 checksum rules",
    aliases: [
      "bank account check",
      "international bank account number",
      "mod 97 checksum",
      "payment details validation",
      "verify a bank account string",
      "sepa account format",
    ],
    exampleQueries: [
      "check whether this bank account number is valid",
      "validate an international bank account number before saving it",
      "is this sepa payment detail correctly formatted",
      "verify the checksum on a customer bank account",
      "normalize and check a bank account string from a form",
    ],
    tags: ["validation", "finance", "banking", "payments", "sepa"],
    inputSummary: "An IBAN string, with or without spaces",
    outputSummary:
      "Validity, normalized and printed forms, country code and a machine-readable reason",
  }),
];

const engine = new SearchEngine(FLEET, DEFAULT_THRESHOLDS);

Deno.test("tokenizer splits camelCase and dotted names", () => {
  assertEquals(tokenize("businessDaysBetween"), ["business", "days"]);
  assertEquals(tokenize("CapFoundry.geo.distance".split(".").join(" ")), [
    "cap",
    "foundry",
    "geo",
    "distance",
  ]);
});

Deno.test("tokenizer strips diacritics and stopwords", () => {
  assertEquals(tokenize("Afstand imellem to Koordinater på Jorden"), [
    "afstand",
    "imellem",
    "koordinater",
    "pa",
    "jorden",
  ]);
});

Deno.test("MVP section 12's own example query is a MATCH", () => {
  const r = engine.search({
    query: "calculate distance between two latitude longitude coordinates",
  });
  assertEquals(r.status, "MATCH");
  assertEquals(r.candidates[0].record.name, "CapFoundry.geo.distance");
});

Deno.test("capabilities are findable without their name (OBJ-1)", () => {
  const cases: [string, string][] = [
    ["how many kilometres between these two GPS points", "CapFoundry.geo.distance"],
    ["great circle distance between two places", "CapFoundry.geo.distance"],
    ["turn a blog post title into a url friendly string", "CapFoundry.text.slugify"],
    ["check whether this bank account number is valid", "CapFoundry.validation.iban"],
  ];
  for (const [query, expected] of cases) {
    const r = engine.search({ query });
    assertEquals(r.status, "MATCH", `expected MATCH for "${query}", got ${r.status}`);
    assertEquals(r.candidates[0].record.name, expected, `wrong top hit for "${query}"`);
  }
});

Deno.test("a lone candidate earns no margin credit", () => {
  // The regression that returned geo.distance for "edit distance between two
  // strings". Being the only capability that shares a word is not evidence of
  // being the right one; on a small index it is the normal case.
  const single = new SearchEngine([FLEET[0]], DEFAULT_THRESHOLDS);

  const partial = single.search({ query: "compute the edit distance between two strings" });
  assertEquals(partial.candidates.length, 1, "the fixture should leave exactly one candidate");
  assert(
    partial.status !== "MATCH",
    `a 1-of-N coverage query must not MATCH on an uncontested index, got ${partial.confidence}`,
  );

  // A genuinely well-covered query still clears the bar without a runner-up.
  const good = single.search({ query: "great circle distance between coordinates" });
  assertEquals(good.status, "MATCH");
});

Deno.test("an empty query matches nothing", () => {
  assertEquals(engine.search({ query: "   " }).status, "NO_MATCH");
});

Deno.test("search returns evidence a human can read", () => {
  const r = engine.search({ query: "great circle distance between coordinates" });
  const evidence = r.candidates[0].evidence;
  assert(evidence.length > 0);
  assert(evidence.every((e) => e.tokens.length > 0));
  assert(evidence.some((e) => e.field === "aliases"));
});

Deno.test("runtime filter excludes non-matching capabilities before scoring", () => {
  const r = engine.search({ query: "distance between coordinates", runtime: "python" });
  assertEquals(r.status, "NO_MATCH");
  assertEquals(r.candidates.length, 0);
});

Deno.test("search latency stays well under the 5 ms budget", () => {
  const queries = Array.from({ length: 200 }, () => "distance between two coordinates in miles");
  const started = performance.now();
  for (const q of queries) engine.search({ query: q });
  const perQuery = (performance.now() - started) / queries.length;
  assert(perQuery < 5, `search averaged ${perQuery.toFixed(3)} ms per query`);
});

Deno.test("thresholds are honoured", () => {
  const strict = new SearchEngine(FLEET, { ...DEFAULT_THRESHOLDS, matchThreshold: 0.99 });
  const loose = new SearchEngine(FLEET, { ...DEFAULT_THRESHOLDS, matchThreshold: 0.1 });
  const query = "distance to the moon";
  assert(strict.search({ query }).status !== "MATCH");
  assertEquals(loose.search({ query }).status, "MATCH");
});
