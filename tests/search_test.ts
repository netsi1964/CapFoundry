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

const FLEET = [
  record({
    name: "CapFoundry.geo.distance",
    description: "Calculate the great-circle distance between two geographic coordinates",
    aliases: ["haversine", "great circle distance", "distance between coordinates"],
    exampleQueries: ["how many kilometres between these two GPS points"],
    tags: ["geo", "coordinates", "gps"],
    inputSummary: "Two WGS-84 points as lat lon degrees",
    outputSummary: "Distance as a number in the requested unit",
  }),
  record({
    name: "CapFoundry.text.slugify",
    description: "Convert text into a stable URL-safe slug",
    aliases: ["url slug", "permalink", "kebab case"],
    exampleQueries: ["turn a blog post title into a url friendly string"],
    tags: ["text", "url"],
    inputSummary: "Text and optional locale",
    outputSummary: "A lowercase hyphenated slug",
  }),
  record({
    name: "CapFoundry.validation.iban",
    description: "Validate an international bank account number",
    aliases: ["bank account check", "iban checksum", "account number validation"],
    exampleQueries: ["check whether this bank account number is valid"],
    tags: ["finance", "validation"],
    inputSummary: "An IBAN string",
    outputSummary: "Validity plus a normalized value",
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

/**
 * The measured lexical recall ceiling (CH-1), pinned as a test rather than
 * left as a surprise.
 *
 * "make a permalink from a heading" is unambiguously a slugify task to a
 * human. Lexical search ranks slugify first — the signal is there — but two of
 * three content tokens are unknown to the index, so confidence lands at ~0.43
 * and the caller is told to check rather than trust. That is the honest answer
 * for a bag-of-words matcher, and tuning the threshold down to "fix" it would
 * trade OBJ-1 recall straight against OBJ-2's wrong-match rate.
 *
 * This is the evidence AD-2 exists to produce. If the full evaluation shows
 * OBJ-1 below 0.80 with failures shaped like this one, PRD-SEC-010 unlocks
 * embeddings. Until then the cheap fix is richer aliases and exampleQueries on
 * the capability itself.
 *
 * When this test starts failing because the query now MATCHes, that is a real
 * improvement — update it, do not delete it.
 */
Deno.test("recall ceiling: a correct but low-overlap query ranks right, scores low", () => {
  const r = engine.search({ query: "make a permalink from a heading" });
  assertEquals(r.candidates[0].record.name, "CapFoundry.text.slugify");
  assertEquals(r.status, "PARTIAL_MATCH");
  assert(r.confidence > 0.35 && r.confidence < 0.55, `confidence was ${r.confidence}`);
});

Deno.test("near misses never reach MATCH (OBJ-2)", () => {
  const nearMisses = [
    "compute the edit distance between two strings",
    "measure the distance a runner covered on a treadmill",
    "distance to the moon in light years",
    "slugify a snail",
    "validate a credit card number",
  ];
  for (const query of nearMisses) {
    const r = engine.search({ query });
    assert(
      r.status !== "MATCH",
      `near miss "${query}" was wrongly classified MATCH at confidence ${r.confidence}`,
    );
  }
});

Deno.test("out-of-domain queries are NO_MATCH, not PARTIAL_MATCH", () => {
  for (const query of ["send an email to the customer", "deploy the app to production"]) {
    assertEquals(engine.search({ query }).status, "NO_MATCH", query);
  }
});

Deno.test("an unknown query token lowers confidence rather than being ignored", () => {
  // The regression that made every one-token overlap a confident match.
  const clean = engine.search({ query: "distance between coordinates" });
  const diluted = engine.search({ query: "distance between quantum entangled tachyon manifolds" });
  assert(
    diluted.confidence < clean.confidence,
    `unknown tokens must reduce confidence: ${diluted.confidence} vs ${clean.confidence}`,
  );
  assert(diluted.status !== "MATCH");
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
