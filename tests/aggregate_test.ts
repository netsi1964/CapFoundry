/**
 * Telemetry aggregation (PRD-FEAT-009.5).
 *
 * The section that earns its keep is `missing`: repeated NO_MATCH grouped by
 * query is demand for a capability that does not exist, and it is the only
 * part of Explore that says what to build rather than what already happened.
 *
 * It is also the reason `queryText` is recorded at all. These tests pin both
 * halves of that trade — the text is in the local log, and it is stripped
 * before anything is uploaded.
 */

import { assert, assertEquals } from "@std/assert";
import { aggregate } from "../scripts/aggregate-telemetry.ts";
import type { TelemetryEvent } from "../cfcm/telemetry/telemetry.ts";
import type { RegistryIndex } from "../cfcm/types.ts";

let clock = 0;
function event(partial: Partial<TelemetryEvent>): TelemetryEvent {
  clock += 1000;
  return {
    ts: new Date(Date.UTC(2026, 8, 12) + clock).toISOString(),
    cfcmVersion: "0.1.0",
    eventType: "search",
    capability: null,
    version: null,
    namespaceType: null,
    queryTokenCount: null,
    queryText: null,
    status: "MATCH",
    confidence: null,
    thresholds: null,
    searchMs: null,
    artifactCacheHit: null,
    artifactFetchMs: null,
    spawnMs: null,
    executionMs: null,
    returnMode: null,
    fellBackToGeneration: null,
    candidateSubmitted: null,
    errorClass: null,
    ...partial,
  };
}

const search = (capability: string | null, status: TelemetryEvent["status"], queryText?: string) =>
  event({ eventType: "search", capability, status, queryText: queryText ?? null });

const invoke = (capability: string, namespaceType = "public") =>
  event({
    eventType: "invoke",
    status: "OK",
    capability,
    namespaceType: namespaceType as TelemetryEvent["namespaceType"],
  });

Deno.test("empty telemetry aggregates to empty, not to an error", () => {
  const data = aggregate([], null, []);
  assertEquals(data.totals.searches, 0);
  assertEquals(data.mostUsed, []);
  assertEquals(data.missing, []);
  assertEquals(data.window.days, 0);
});

Deno.test("most used counts successful invocations only", () => {
  const data = aggregate(
    [
      invoke("CapFoundry.geo.distance"),
      invoke("CapFoundry.geo.distance"),
      invoke("CapFoundry.text.slugify"),
      event({ eventType: "invoke", status: "ERROR", capability: "CapFoundry.text.slugify" }),
    ],
    null,
    [],
  );

  assertEquals(data.mostUsed[0], {
    name: "CapFoundry.geo.distance",
    invocations: 2,
    namespaceType: "public",
  });
  assertEquals(data.mostUsed[1].invocations, 1, "a failed invocation is not a use");
});

Deno.test("repeated NO_MATCH is grouped into unmet demand", () => {
  const data = aggregate(
    [
      search(null, "NO_MATCH", "convert markdown to pdf"),
      search(null, "NO_MATCH", "Convert Markdown to PDF"),
      search(null, "NO_MATCH", "  convert   markdown   to   pdf  "),
      search(null, "NO_MATCH", "resize an image"),
    ],
    null,
    [],
  );

  assertEquals(data.missing.length, 2);
  // Case and whitespace differences are the same unmet demand, not three.
  assertEquals(data.missing[0].occurrences, 3);
  assertEquals(data.missing[0].query, "convert markdown to pdf");
  assertEquals(data.missing[1].occurrences, 1);
});

Deno.test("missing is ordered by how often it was asked for", () => {
  const data = aggregate(
    [
      search(null, "NO_MATCH", "rare request"),
      ...Array.from({ length: 5 }, () => search(null, "NO_MATCH", "common request")),
      ...Array.from({ length: 3 }, () => search(null, "NO_MATCH", "middling request")),
    ],
    null,
    [],
  );

  assertEquals(data.missing.map((m) => m.occurrences), [5, 3, 1]);
});

Deno.test("a NO_MATCH without recorded text is counted but not grouped", () => {
  // What happens when telemetry.logQueryText is off: the total still moves,
  // the Missing section just cannot say what was wanted.
  const data = aggregate(
    [
      search(null, "NO_MATCH"),
      search(null, "NO_MATCH"),
    ],
    null,
    [],
  );

  assertEquals(data.totals.noMatches, 2);
  assertEquals(data.missing, []);
});

Deno.test("most searched reports a match rate per capability", () => {
  const data = aggregate(
    [
      search("CapFoundry.geo.distance", "MATCH"),
      search("CapFoundry.geo.distance", "MATCH"),
      search("CapFoundry.geo.distance", "PARTIAL_MATCH"),
      search("CapFoundry.geo.distance", "PARTIAL_MATCH"),
    ],
    null,
    [],
  );

  assertEquals(data.mostSearched[0].appearances, 4);
  assertEquals(data.mostSearched[0].matchRate, 0.5);
});

Deno.test("fastest growing compares two halves of the window", () => {
  const data = aggregate(
    [
      // Earlier half.
      invoke("CapFoundry.text.slugify"),
      invoke("CapFoundry.text.slugify"),
      invoke("CapFoundry.geo.distance"),
      // Later half.
      invoke("CapFoundry.geo.distance"),
      invoke("CapFoundry.geo.distance"),
      invoke("CapFoundry.geo.distance"),
    ],
    null,
    [],
  );

  assertEquals(data.fastestGrowing[0].name, "CapFoundry.geo.distance");
  assert(data.fastestGrowing[0].change > 0);
  // Something that only shrank is not "growing".
  assertEquals(data.fastestGrowing.some((r) => r.name === "CapFoundry.text.slugify"), false);
});

Deno.test("recently added comes from the registry, not from usage", () => {
  // Only the three fields the aggregator reads; a full IndexRecord here would
  // be noise that obscures what the assertion is about.
  const capabilities = [
    { name: "B.new.thing", version: "1.0.0", indexedAt: "2026-09-12T10:00:00.000Z" },
    { name: "A.old.thing", version: "2.0.0", indexedAt: "2026-01-01T00:00:00.000Z" },
  ] as unknown as RegistryIndex["capabilities"];

  const data = aggregate([], {
    schemaVersion: 1,
    generatedAt: "2026-09-12T00:00:00.000Z",
    capabilities,
  }, []);

  assertEquals(data.recentlyAdded[0].name, "B.new.thing");
  assertEquals(data.recentlyAdded[1].name, "A.old.thing");
});

Deno.test("candidates are listed newest first", () => {
  const data = aggregate([], null, [
    { suggestedName: "CapFoundry.a.one", createdAt: "2026-09-01T00:00:00.000Z" },
    { suggestedName: "CapFoundry.b.two", createdAt: "2026-09-12T00:00:00.000Z" },
  ]);

  assertEquals(data.newCandidates.map((c) => c.name), ["CapFoundry.b.two", "CapFoundry.a.one"]);
});

Deno.test("output is deterministic and ties break by name", () => {
  const events = [
    invoke("CapFoundry.b.two"),
    invoke("CapFoundry.a.one"),
  ];
  const first = JSON.stringify(aggregate(events, null, []).mostUsed);
  for (let i = 0; i < 20; i++) {
    assertEquals(JSON.stringify(aggregate(events, null, []).mostUsed), first);
  }
  assertEquals(aggregate(events, null, []).mostUsed[0].name, "CapFoundry.a.one");
});

Deno.test("private and local capabilities keep their namespace in the output", () => {
  const data = aggregate(
    [
      invoke("Netsi.demo.getCustomer", "private"),
      invoke("Local.dev.echo", "local"),
    ],
    null,
    [],
  );

  const byName = new Map(data.mostUsed.map((r) => [r.name, r.namespaceType]));
  assertEquals(byName.get("Netsi.demo.getCustomer"), "private");
  assertEquals(byName.get("Local.dev.echo"), "local");
});
