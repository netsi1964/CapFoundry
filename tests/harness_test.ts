/**
 * The harness itself (PRD-FEAT-015.2 to .6).
 *
 * A harness that has only ever been watched failing has not been shown to
 * detect success. These drive it with a scripted agent that genuinely solves a
 * scenario, and with telemetry written the way the MCP server writes it, so
 * both paths through every branch are exercised without spending anything.
 */

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";
import { checkBehaviour, MockDriver, runHarness } from "../eval/harness.ts";
import { buildReport } from "../eval/report.ts";
import type { Scenario } from "../eval/types.ts";
import type { TelemetryEvent } from "../cfcm/telemetry/telemetry.ts";

const REPO_ROOT = new URL("..", import.meta.url).pathname;

function event(partial: Partial<TelemetryEvent>): TelemetryEvent {
  return {
    ts: new Date().toISOString(),
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

const scenario = (partial: Partial<Scenario>): Scenario => ({
  id: "t",
  title: "t",
  rationale: "t",
  objectives: ["OBJ-1"],
  origin: "designed",
  expect: { search: "MATCH" },
  ...partial,
});

// ---- the behaviour check ----

Deno.test("a matching run passes the behaviour check", () => {
  const result = checkBehaviour(
    scenario({ expect: { search: "MATCH", capability: "A.b.c", invoked: true } }),
    [
      event({ eventType: "search", status: "MATCH" }),
      event({ eventType: "invoke", status: "OK", capability: "A.b.c" }),
    ],
  );
  assertEquals(result.matched, true, result.detail);
});

Deno.test("a search that should not have happened is caught", () => {
  const result = checkBehaviour(scenario({ expect: { search: "none" } }), [
    event({ eventType: "search", status: "NO_MATCH" }),
  ]);
  assertEquals(result.matched, false);
  assertStringIncludes(result.detail, "should not have");
});

Deno.test("restraint passes when nothing was searched", () => {
  assertEquals(checkBehaviour(scenario({ expect: { search: "none" } }), []).matched, true);
});

Deno.test("a missing candidate and an unexpected one are both caught", () => {
  assertEquals(
    checkBehaviour(scenario({ expect: { search: "any", candidateSubmitted: true } }), []).matched,
    false,
  );
  assertEquals(
    checkBehaviour(scenario({ expect: { search: "any", candidateSubmitted: false } }), [
      event({ eventType: "candidate", status: "OK", capability: "A.b.c" }),
    ]).matched,
    false,
  );
});

Deno.test("an artifact return is verified rather than assumed", () => {
  const expect = { search: "MATCH" as const, artifactReturned: true };
  assertEquals(
    checkBehaviour(scenario({ expect }), [
      event({ eventType: "search", status: "MATCH" }),
      event({ eventType: "invoke", status: "OK", capability: "A.b.c", returnMode: "result" }),
    ]).matched,
    false,
  );
  assertEquals(
    checkBehaviour(scenario({ expect }), [
      event({ eventType: "search", status: "MATCH" }),
      event({
        eventType: "invoke",
        status: "OK",
        capability: "A.b.c",
        returnMode: "result-and-artifact",
      }),
    ]).matched,
    true,
  );
});

// ---- the runner ----

Deno.test("the harness detects a correct answer, not only failures", async () => {
  // exact-match-small asks for a slug. A driver that produces one should pass,
  // and if this ever stops passing the harness has stopped measuring.
  // The assertion reads slug.txt rather than the transcript, because it judges
  // the work and not the route. A mock that only spoke would never pass it.
  const driver = new MockDriver(async (o) => {
    await Deno.writeTextFile(join(o.workspace, "slug.txt"), "roedgroed-med-floede\n");
    return { transcript: "Wrote the slug to slug.txt" };
  });

  const { results } = await runHarness({
    driver,
    configPath: join(REPO_ROOT, "cfcm.json"),
    repetitions: 1,
    only: ["exact-match-small"],
  });

  assertEquals(results.length, 2, "one run per condition");
  const passed = results.filter((r) => r.correct);
  assert(passed.length > 0, `no run passed; assertions may be unreachable: ${results[0]?.detail}`);
});

Deno.test("the control condition is never behaviour-checked", async () => {
  const { results } = await runHarness({
    driver: new MockDriver(() => ({ transcript: "x" })),
    configPath: join(REPO_ROOT, "cfcm.json"),
    repetitions: 1,
    only: ["exact-match-small"],
  });

  const control = results.find((r) => r.condition === "control")!;
  assertEquals(
    control.behaviourMatched,
    null,
    "scoring the control against expected CFCM behaviour would fail it for having no CFCM",
  );
});

Deno.test("an assertion never learns which condition it is in", async () => {
  // Same transcript in both conditions must give the same verdict.
  const { results } = await runHarness({
    driver: new MockDriver(async (o) => {
      await Deno.writeTextFile(join(o.workspace, "slug.txt"), "roedgroed-med-floede\n");
      return { transcript: "done" };
    }),
    configPath: join(REPO_ROOT, "cfcm.json"),
    repetitions: 1,
    only: ["exact-match-small"],
  });
  assertEquals(results[0].correct, results[1].correct);
  assertEquals(results[0].correct, true, "the same work must pass in both conditions");
  assertEquals(results[0].correct, true, "the same work must pass in both conditions");
});

Deno.test("a failed run is recorded and kept out of the averages", () => {
  const base = {
    scenario: "t",
    repetition: 1,
    detail: "",
    behaviourMatched: null,
    behaviourDetail: "",
    telemetry: [],
  };
  const ok = {
    ...base,
    condition: "capfoundry" as const,
    correct: true,
    run: {
      transcript: "",
      inputTokens: 10,
      outputTokens: 20,
      cachedInputTokens: 0,
      costUsd: 0.1,
      durationMs: 1000,
      timedOut: false,
      failed: false,
    },
  };
  const timedOut = {
    ...base,
    condition: "capfoundry" as const,
    correct: false,
    run: { ...ok.run, durationMs: 300000, costUsd: null, timedOut: true, failed: true },
  };

  const report = buildReport([ok, timedOut], [scenario({ id: "t" })], {
    driver: "mock",
    repetitions: 2,
    startedAt: "2026-09-12T00:00:00.000Z",
  });

  // The median must be the successful run's 1.0 s, not an average with 300 s.
  assertStringIncludes(report, "1.0 s");
  assert(!report.includes("150.5 s"), "a timeout was averaged into the median");
  assertStringIncludes(report, "Runs that failed outright");
});

// ---- the report ----

Deno.test("the report separates a control that lost from one that could not play", () => {
  const run = {
    transcript: "",
    inputTokens: 1,
    outputTokens: 1,
    cachedInputTokens: 0,
    costUsd: 0,
    durationMs: 1,
    timedOut: false,
    failed: false,
  };
  const results = [
    {
      scenario: "cmp",
      condition: "capfoundry" as const,
      repetition: 1,
      correct: true,
      detail: "",
      behaviourMatched: true,
      behaviourDetail: "",
      run,
      telemetry: [],
    },
    {
      scenario: "cmp",
      condition: "control" as const,
      repetition: 1,
      correct: false,
      detail: "",
      behaviourMatched: null,
      behaviourDetail: "",
      run,
      telemetry: [],
    },
    {
      scenario: "imp",
      condition: "capfoundry" as const,
      repetition: 1,
      correct: true,
      detail: "",
      behaviourMatched: true,
      behaviourDetail: "",
      run,
      telemetry: [],
    },
    {
      scenario: "imp",
      condition: "control" as const,
      repetition: 1,
      correct: false,
      detail: "",
      behaviourMatched: null,
      behaviourDetail: "",
      run,
      telemetry: [],
    },
  ];

  const report = buildReport(results, [
    scenario({ id: "cmp" }),
    scenario({
      id: "imp",
      objectives: ["OBJ-6"],
      control: "cannot-succeed",
      controlReason: "the record exists only inside the private namespace",
    }),
  ], { driver: "mock", repetitions: 1, startedAt: "2026-09-12T00:00:00.000Z" });

  assertStringIncludes(report, "Scenarios the control cannot answer at all");
  assertStringIncludes(report, "only inside the private namespace");
  assertStringIncludes(report, "Counting them as wins would be counting the");

  // And the impossible one must not inflate the headline correctness table.
  const headline = report.slice(0, report.indexOf("## Scenarios the control cannot"));
  assert(!headline.includes("`imp`"), "an unanswerable scenario appeared in the comparison table");
});

Deno.test("the report names every untested objective and defers OBJ-8", () => {
  const report = buildReport([], [scenario({ id: "t", objectives: ["OBJ-1"] })], {
    driver: "mock",
    repetitions: 1,
    startedAt: "2026-09-12T00:00:00.000Z",
  });
  assertStringIncludes(report, "Not covered by any scenario:");
  assertStringIncludes(report, "OBJ-2");
  assertStringIncludes(report, "OBJ-8");
  assertStringIncludes(report, "deferred rather than passed");
});

Deno.test("the report ends on falsification and says which condition matters", () => {
  const report = buildReport([], [scenario({})], {
    driver: "mock",
    repetitions: 1,
    startedAt: "2026-09-12T00:00:00.000Z",
  });
  assertStringIncludes(report, "Falsification (MVP §27)");
  assertStringIncludes(report, "Condition 7 is the one that matters");
});

Deno.test("a mock run says it proves the harness rather than the idea", () => {
  const report = buildReport([], [scenario({})], {
    driver: "mock",
    repetitions: 1,
    startedAt: "2026-09-12T00:00:00.000Z",
  });
  assertStringIncludes(report, "proves the harness, not CapFoundry");
});
