/**
 * Standing measurement of OBJ-1 and OBJ-2 against the real index.
 *
 * The unit tests in search_test.ts use a hand-built three-record fixture, which
 * is good for pinning mechanics but says nothing about the system as shipped.
 * This runs the same two questions against all nine real capabilities.
 *
 * A caveat that belongs in the file rather than a footnote: these queries were
 * written by the same person who wrote the capabilities' aliases, so they
 * measure internal consistency, not independent recall. The honest measurement
 * is the A/B harness (PRD-FEAT-015), whose scenarios are task-shaped rather
 * than query-shaped. Treat this as a regression guard, not as evidence that
 * OBJ-1 and OBJ-2 are met.
 */

import { assert, assertEquals } from "@std/assert";
import { join } from "@std/path";
import { Cfcm } from "../cfcm/core.ts";
import { parseConfig } from "../cfcm/config/config.ts";

const REPO_ROOT = new URL("..", import.meta.url).pathname;

/** Rephrasings a user might type, none reusing the capability's name. */
const RECALL: [string, string][] = [
  ["kilometres between two places on the globe", "CapFoundry.geo.distance"],
  ["great circle distance between two coordinates", "CapFoundry.geo.distance"],
  ["make a web address friendly version of this heading", "CapFoundry.text.slugify"],
  ["strip accents and spaces for a filename", "CapFoundry.text.slugify"],
  ["how many working days until the deadline", "CapFoundry.date.businessDaysBetween"],
  ["count weekdays excluding public holidays", "CapFoundry.date.businessDaysBetween"],
  ["is this bank account number correctly formatted", "CapFoundry.validation.iban"],
  ["verify a sepa payment detail checksum", "CapFoundry.validation.iban"],
  ["work out if this export is comma or semicolon separated", "CapFoundry.csv.detectDelimiter"],
  ["sniff the field separator of a flat file", "CapFoundry.csv.detectDelimiter"],
  ["derive validation rules from a sample api response", "CapFoundry.json.schema.infer"],
  ["reverse engineer the shape of this data", "CapFoundry.json.schema.infer"],
  ["accessible sortable table web component without react", "CapFoundry.ui.dataTable"],
  ["vanilla javascript grid widget with column sorting", "CapFoundry.ui.dataTable"],
  ["fetch the internal account record for a client id", "Netsi.demo.getCustomer"],
  ["loopback probe that returns my payload unchanged", "Local.dev.echo"],
];

/**
 * Queries that must never MATCH. Two kinds, both dangerous:
 * near misses share vocabulary with a real capability but mean something
 * else; out-of-domain queries are simply not covered.
 */
const MUST_NOT_MATCH = [
  // The first three came from a real trial session and are the reason the
  // single-candidate rule changed. The original set only had the "levenshtein"
  // spelling, whose unknown token diluted coverage enough to hide the bug:
  // drop that one word and geo.distance was returned as a confident MATCH for
  // a string problem.
  "compute the edit distance between two strings",
  "levenshtein distance",
  "beregn edit distance mellem to strenge",
  "how similar are these two strings",
  "compute the levenshtein edit distance between two strings",
  "compute the hamming distance between two bit vectors",
  "measure how long the flight distance is in air miles",
  "how far did the runner travel on the treadmill",
  "distance to the moon in light years",
  "validate a credit card number with the luhn algorithm",
  "check that an email address is well formed",
  "how many days until christmas",
  "split this string on commas",
  "generate a typescript interface from a class",
  "render a react data grid with virtual scrolling",
  "look up a customer in salesforce over the api",
  "send an invoice to the customer by email",
  "deploy the application to production",
  "resize an uploaded image to a thumbnail",
];

async function withCfcm(fn: (cfcm: Cfcm) => Promise<void>) {
  const home = await Deno.makeTempDir({ prefix: "cfcm-obj-" });
  const previous = Deno.env.get("CFCM_HOME");
  Deno.env.set("CFCM_HOME", home);
  try {
    const config = parseConfig({
      capfoundry: { registry: REPO_ROOT, enabled: true },
      telemetry: { local: false, upload: false },
      namespaces: [{
        name: "Netsi",
        type: "private",
        source: { type: "filesystem", path: join(REPO_ROOT, "capabilities", "netsi") },
      }],
    }, REPO_ROOT);
    await fn(await Cfcm.create({ config, localRoot: join(REPO_ROOT, "capabilities", "local") }));
  } finally {
    if (previous === undefined) Deno.env.delete("CFCM_HOME");
    else Deno.env.set("CFCM_HOME", previous);
    await Deno.remove(home, { recursive: true });
  }
}

Deno.test("OBJ-1: hit rate on rephrasings is at least 0.80", async () => {
  await withCfcm(async (cfcm) => {
    const misses: string[] = [];
    for (const [query, expected] of RECALL) {
      const found = await cfcm.search(query);
      const top = found.candidates[0]?.record.name;
      if (found.status !== "MATCH" || top !== expected) {
        misses.push(`${found.status} ${found.confidence} top=${top} :: "${query}"`);
      }
    }
    const hitRate = (RECALL.length - misses.length) / RECALL.length;
    assert(
      hitRate >= 0.8,
      `hit rate ${hitRate.toFixed(3)} is below 0.80\n${misses.join("\n")}`,
    );
  });
});

Deno.test("OBJ-2: nothing outside a capability's meaning reaches MATCH", async () => {
  await withCfcm(async (cfcm) => {
    const wrong: string[] = [];
    for (const query of MUST_NOT_MATCH) {
      const found = await cfcm.search(query);
      if (found.status === "MATCH") {
        wrong.push(`${found.candidates[0].record.name} @ ${found.confidence} :: "${query}"`);
      }
    }
    const wrongRate = wrong.length / MUST_NOT_MATCH.length;
    assert(
      wrongRate <= 0.05,
      `wrong-match rate ${wrongRate.toFixed(3)} exceeds 0.05\n${wrong.join("\n")}`,
    );
  });
});

/**
 * The measured lexical recall ceiling (CH-1), pinned against the real index.
 *
 * An earlier version of this measurement lived in search_test.ts against a
 * hand-built fixture and reported "make a permalink from a heading" as the
 * ceiling. That was an artifact of a thin fixture, not a property of the
 * system: the shipped slugify capability lists almost that exact phrase as an
 * example query, so it matches at full confidence. The lesson is that a
 * recall claim is only meaningful against the descriptors that actually ship.
 *
 * This is the real one. "how far is it from one gps point to another" is
 * unambiguously a distance question to a human, but only "far", "gps" and
 * "point" carry signal and coverage lands near 0.30. Tuning the threshold down
 * to catch it would re-admit the wrong matches above, which is the trade AD-2
 * exists to measure rather than guess at.
 *
 * If this starts failing because the query now matches, that is an
 * improvement — update it, do not delete it.
 */
Deno.test("recall ceiling: a correct but low-overlap query is missed", async () => {
  await withCfcm(async (cfcm) => {
    const found = await cfcm.search("how far is it from one gps point to another");
    assert(found.status !== "MATCH", `expected a miss, got ${found.status}`);
    assert(found.confidence < 0.55, `confidence was ${found.confidence}`);
  });
});

Deno.test("a MATCH never surfaces the wrong capability at the top", async () => {
  await withCfcm(async (cfcm) => {
    for (const [query, expected] of RECALL) {
      const found = await cfcm.search(query);
      if (found.status !== "MATCH") continue;
      assertEquals(
        found.candidates[0].record.name,
        expected,
        `confident but wrong for "${query}"`,
      );
    }
  });
});

Deno.test("OBJ-3: search plus cached invoke stays inside the 250 ms budget", async () => {
  await withCfcm(async (cfcm) => {
    const input = { from: { lat: 55.6761, lon: 12.5683 }, to: { lat: 59.3293, lon: 18.0686 } };
    // Warm the artifact cache and the child's module cache first: OBJ-3 is
    // about steady-state overhead, not first-run compilation.
    await cfcm.invoke({ capability: "CapFoundry.geo.distance", input });

    const samples: number[] = [];
    for (let i = 0; i < 12; i++) {
      const started = performance.now();
      await cfcm.search("calculate distance between two latitude longitude coordinates");
      await cfcm.invoke({ capability: "CapFoundry.geo.distance", input });
      samples.push(performance.now() - started);
    }

    samples.sort((a, b) => a - b);
    const p95 = samples[Math.floor(samples.length * 0.95)];
    assert(p95 <= 250, `p95 overhead was ${p95.toFixed(1)} ms, budget is 250 ms`);
  });
});
