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
 *
 * Two checks, and they cover different halves of the problem.
 *
 * The recorded set catches a capability that collides with a question someone
 * already thought to write down. Its reach is exactly the set's contents: a
 * description too broad for a query nobody added is invisible to it, which is
 * how ui.dataTable 1.1.0 would have passed if the React query had not happened
 * to be there since phase 2. So the success line says what was checked rather
 * than implying a clearance.
 *
 * The cross-check needs nobody to write anything. Every capability ships
 * example queries that should resolve to *it*; if one resolves to a different
 * capability, the owner has lost its own question. Free evidence, already in
 * the registry.
 *
 * It catches **theft, not proximity**. A capability can absorb a great deal of
 * another's vocabulary and pass, as long as the original still wins. Copying
 * geo.geocode's example query verbatim into sun.times's aliases passes this
 * check, while collapsing geocode's margin on its own query from 0.729 to
 * 0.225 — the signal exists and neither check reads it.
 *
 * Reading it would need a threshold on rank distance, and a threshold that is
 * right at eleven capabilities will be wrong at fifty. So the uncovered middle
 * — a capability that is merely too broad — is documented in PRD-SEC-009
 * rather than guarded against badly.
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

  // Cross-check: nobody has to write these down. They are already in the
  // registry, and a capability winning another's example query means two
  // descriptors have grown into each other.
  const collisions: { owner: string; winner: string; query: string; confidence: number }[] = [];

  for (const record of cfcm.list()) {
    for (const query of record.exampleQueries) {
      const result = await cfcm.search(query);
      const top = result.candidates[0]?.record.name;
      if (result.status === "MATCH" && top && top !== record.name) {
        collisions.push({
          owner: record.name,
          winner: top,
          query,
          confidence: result.confidence,
        });
      }
    }
  }

  if (collisions.length > 0) {
    console.error(
      `\n✗ ${collisions.length} capability example query/ies resolve to the wrong capability.\n`,
    );
    for (const c of collisions) {
      console.error(`  "${c.query}"`);
      console.error(`    belongs to ${c.owner}`);
      console.error(`    won by     ${c.winner} at ${c.confidence}\n`);
    }
    console.error(
      "Two descriptors have grown into each other. Narrow whichever one reached into the other's\n" +
        "territory — this is the same precision cost as a near-miss, but between capabilities.\n",
    );
    Deno.exit(1);
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

  // Deliberately not "all clear". The set is finite and hand-written, so this
  // says what was checked rather than implying the registry is safe.
  console.log(
    `✓ none of the ${queries.length} recorded near-miss queries reaches MATCH, and no ` +
      `capability wins another's example query.\n` +
      `  Queries outside the set are not checked. When you add a capability, add the questions ` +
      `it should not answer.`,
  );
} finally {
  await Deno.remove(home, { recursive: true }).catch(() => {});
}
