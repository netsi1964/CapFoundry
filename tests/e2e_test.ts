/**
 * The Phase 1 exit criterion, as a test.
 *
 * Search a compact index, resolve and verify an artifact, cache it, execute it
 * in a zero-permission subprocess, return the result, and leave a telemetry
 * line on disk — with nothing in that line that could reconstruct the input.
 */

import { assert, assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";
import { Cfcm } from "../cfcm/core.ts";
import { CfcmError } from "../cfcm/types.ts";
import { parseConfig } from "../cfcm/config/config.ts";

const REPO_ROOT = new URL("..", import.meta.url).pathname;

/** A canary that would only appear in telemetry if input were being logged. */
const CANARY_LAT = 55.6761;

async function withCfcm(fn: (cfcm: Cfcm, home: string) => Promise<void>) {
  const home = await Deno.makeTempDir({ prefix: "cfcm-e2e-" });
  const previous = Deno.env.get("CFCM_HOME");
  Deno.env.set("CFCM_HOME", home);
  try {
    const config = parseConfig(
      {
        capfoundry: { registry: REPO_ROOT, enabled: true },
        telemetry: { local: true, upload: false },
      },
      REPO_ROOT,
    );
    await fn(await Cfcm.create({ config, localRoot: join(home, "local") }), home);
  } finally {
    if (previous === undefined) Deno.env.delete("CFCM_HOME");
    else Deno.env.set("CFCM_HOME", previous);
    await Deno.remove(home, { recursive: true });
  }
}

Deno.test("the index loads from the static registry", async () => {
  await withCfcm((cfcm) => {
    assert(cfcm.size >= 1, "expected at least one capability");
    assert(cfcm.list().some((r) => r.name === "CapFoundry.geo.distance"));
    // A missing Local.* directory is normal, not a degraded source.
    const degraded = cfcm.sourceReports.filter((r) => r.status === "unavailable");
    assertEquals(degraded, [], `unexpected degraded sources: ${JSON.stringify(degraded)}`);
    return Promise.resolve();
  });
});

Deno.test("search, resolve, execute, and return a correct result", async () => {
  await withCfcm(async (cfcm) => {
    const found = await cfcm.search(
      "calculate distance between two latitude longitude coordinates",
    );
    assertEquals(found.status, "MATCH");
    assertEquals(found.candidates[0].record.name, "CapFoundry.geo.distance");

    const out = await cfcm.invoke({
      capability: "CapFoundry.geo.distance",
      input: { from: { lat: CANARY_LAT, lon: 12.5683 }, to: { lat: 59.3293, lon: 18.0686 } },
    });

    const result = out.result as { distance: number; unit: string; method: string };
    assert(Math.abs(result.distance - 522.2) < 2, `distance was ${result.distance}`);
    assertEquals(result.unit, "km");
    assertEquals(result.method, "haversine");
    assertEquals(out.timings.artifactCacheHit, false, "first call should miss the cache");
  });
});

Deno.test("the second invocation hits the artifact cache", async () => {
  await withCfcm(async (cfcm) => {
    const input = { from: { lat: 0, lon: 0 }, to: { lat: 1, lon: 1 } };
    await cfcm.invoke({ capability: "CapFoundry.geo.distance", input });
    const second = await cfcm.invoke({ capability: "CapFoundry.geo.distance", input });
    assertEquals(second.timings.artifactCacheHit, true);
    assertEquals(second.timings.artifactFetchMs, null);
  });
});

Deno.test("input is validated against inputSchema before anything is spawned", async () => {
  await withCfcm(async (cfcm) => {
    const err = await assertRejects(
      () =>
        cfcm.invoke({
          capability: "CapFoundry.geo.distance",
          input: { from: { lat: 999, lon: 0 } },
        }),
      CfcmError,
    );
    assertEquals(err.code, "INPUT_INVALID");
    // Both problems named, not just the first.
    assertStringIncludes(err.message, "to");
    assertStringIncludes(err.message, "maximum");
  });
});

Deno.test("return modes are honoured", async () => {
  await withCfcm(async (cfcm) => {
    const input = { from: { lat: 0, lon: 0 }, to: { lat: 0, lon: 1 } };

    const metadata = await cfcm.invoke({
      capability: "CapFoundry.geo.distance",
      input,
      options: { return: "metadata" },
    });
    assertEquals(metadata.result, undefined);
    assertEquals(metadata.artifact, undefined);
    assert(metadata.metadata, "metadata mode returned no metadata");
    assertEquals(metadata.timings.spawnMs, 0, "metadata mode must not spawn a process");

    const both = await cfcm.invoke({
      capability: "CapFoundry.geo.distance",
      input,
      options: { return: "result-and-artifact" },
    });
    assert(both.result, "expected a result");
    assert(both.artifact, "expected an artifact");
    assertStringIncludes(both.artifact.source, "haversine");
  });
});

Deno.test("an unknown capability fails with a usable error", async () => {
  await withCfcm(async (cfcm) => {
    const err = await assertRejects(
      () => cfcm.invoke({ capability: "CapFoundry.nope.missing", input: {} }),
      CfcmError,
    );
    assertEquals(err.code, "NOT_FOUND");
  });
});

Deno.test("a version mismatch is refused rather than silently substituted", async () => {
  await withCfcm(async (cfcm) => {
    const err = await assertRejects(
      () =>
        cfcm.invoke({
          capability: "CapFoundry.geo.distance",
          version: "9.9.9",
          input: { from: { lat: 0, lon: 0 }, to: { lat: 0, lon: 1 } },
        }),
      CfcmError,
    );
    assertEquals(err.code, "VERSION_MISMATCH");
  });
});

Deno.test("telemetry records the run and leaks no payload (PRD-FEAT-009.4)", async () => {
  await withCfcm(async (cfcm, home) => {
    await cfcm.search("calculate distance between two latitude longitude coordinates");
    await cfcm.invoke({
      capability: "CapFoundry.geo.distance",
      input: { from: { lat: CANARY_LAT, lon: 12.5683 }, to: { lat: 59.3293, lon: 18.0686 } },
    });
    await cfcm.invoke({ capability: "CapFoundry.geo.distance", input: { bad: true } }).catch(
      () => {},
    );

    const dir = join(home, "telemetry");
    let combined = "";
    for await (const entry of Deno.readDir(dir)) {
      combined += await Deno.readTextFile(join(dir, entry.name));
    }

    const events = combined.trim().split("\n").map((l) => JSON.parse(l));
    assertEquals(events.length, 3);
    assertEquals(events[0].eventType, "search");
    assertEquals(events[0].status, "MATCH");
    assert(events[0].thresholds, "thresholds must be logged so sweeps are analysable later");
    assertEquals(events[1].eventType, "invoke");
    assertEquals(events[1].status, "OK");
    assert(typeof events[1].spawnMs === "number", "spawnMs must be reported separately (AD-3)");
    assertEquals(events[2].status, "ERROR");
    assertEquals(events[2].errorClass, "INPUT_INVALID");

    // The redaction invariant, checked the blunt way: grep the whole run.
    assert(
      !combined.includes(String(CANARY_LAT)),
      "capability input leaked into telemetry",
    );
    assert(!combined.includes("522."), "capability output leaked into telemetry");
    assert(!combined.includes("latitude"), "the query text leaked into telemetry");
  });
});
