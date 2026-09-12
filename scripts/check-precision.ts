#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env
/**
 * Refuses a registry that confidently answers a question it should not.
 *
 * This exists because of a class of mistake the tooling was silent about.
 * Widening a capability's description, aliases or summaries is a **search
 * precision change**, not a documentation change: confidence rises with the
 * number of fields a query's tokens hit, so every accurate sentence added to a
 * descriptor is another surface a wrong query can land on. `deno task prepare`
 * would reseal and reindex without a word.
 *
 * It has happened twice. F5 in the PRD was `distance` hitting five fields of
 * geo.distance and returning it for a string problem; ui.dataTable 1.1.0 added
 * "render" and took a React virtual-scrolling query to MATCH. Both were caught
 * by CI after the fact. This catches them at the point the change is made.
 *
 * Run from `deno task prepare`, and it fails rather than warns: a warning
 * printed by a script that also fixes things gets scrolled past.
 */

import { join } from "@std/path";
import { Cfcm } from "../cfcm/core.ts";
import { parseConfig } from "../cfcm/config/config.ts";

interface NearMiss {
  query: string;
  why: string;
}

const REPO_ROOT = new URL("..", import.meta.url).pathname;

const { queries } = JSON.parse(
  await Deno.readTextFile(join(REPO_ROOT, "eval/near-misses.json")),
) as { queries: NearMiss[] };

// A throwaway home, so a precision check never writes telemetry into the
// developer's own log.
const home = await Deno.makeTempDir({ prefix: "cfcm-precision-" });
Deno.env.set("CFCM_HOME", home);

try {
  const cfcm = await Cfcm.create({
    config: parseConfig({
      capfoundry: { registry: REPO_ROOT, enabled: true },
      telemetry: { local: false, upload: false },
      namespaces: [{
        name: "Netsi",
        type: "private",
        source: { type: "filesystem", path: join(REPO_ROOT, "capabilities/netsi") },
      }],
    }, REPO_ROOT),
    localRoot: join(REPO_ROOT, "capabilities/local"),
  });

  const failures: { near: NearMiss; capability: string; confidence: number }[] = [];

  for (const near of queries) {
    const result = await cfcm.search(near.query);
    if (result.status === "MATCH") {
      failures.push({
        near,
        capability: result.candidates[0].record.name,
        confidence: result.confidence,
      });
    }
  }

  if (failures.length > 0) {
    console.error(
      `\n✗ ${failures.length} of ${queries.length} near-miss queries now reach MATCH.\n`,
    );
    for (const f of failures) {
      console.error(`  "${f.near.query}"`);
      console.error(`    → ${f.capability} at ${f.confidence}`);
      console.error(`    ${f.near.why}\n`);
    }
    console.error(
      "Something added search surface. Widening a description, alias or summary is a precision\n" +
        "change: confidence rises with how many fields a query hits, not with how well the\n" +
        "capability fits. Narrow the wording that collides, or — if the match is genuinely\n" +
        "correct now — move the query to the recall set in tests/objectives_test.ts and say so.\n",
    );
    Deno.exit(1);
  }

  console.log(`✓ ${queries.length} near-miss queries all stay below MATCH`);
} finally {
  await Deno.remove(home, { recursive: true }).catch(() => {});
}
