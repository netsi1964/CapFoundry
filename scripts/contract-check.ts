/**
 * Live contract check for NETWORK capabilities. **Deliberately outside CI.**
 *
 * CI cannot record a fixture, and a suite that calls a live API measures
 * someone else's uptime — a red build that means nothing, which is worse than
 * no build because it trains people to ignore red.
 *
 * But a recording goes stale when the upstream API changes shape, and nothing
 * else would notice. So this runs on demand: it refetches each recorded query
 * and compares the *shape* of what comes back against the recording.
 *
 * Shape, not content. Coordinates move, display names get edited, new places
 * appear — none of that is a contract change. A field disappearing is.
 *
 *   deno task contract-check            check every NETWORK capability
 *   deno task contract-check --update   rewrite the recordings after reviewing
 */

import { join } from "@std/path";

interface Recording {
  file: string;
  source: string;
  retrievedAt: string;
  license: string;
  notes?: string;
}

const REPO_ROOT = new URL("..", import.meta.url).pathname;
const CAPABILITIES = join(REPO_ROOT, "capabilities");
const RATE_LIMIT_MS = 1200; // Nominatim allows 1 req/s. Be a good citizen.

/** The set of field paths present in a payload, ignoring array position and values. */
function shapeOf(value: unknown, prefix = "", out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    // Union across elements: one entry missing an optional field is not a change.
    for (const item of value) shapeOf(item, `${prefix}[]`, out);
    return out;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      const path = prefix === "" ? k : `${prefix}.${k}`;
      out.add(`${path}:${Array.isArray(v) ? "array" : v === null ? "null" : typeof v}`);
      shapeOf(v, path, out);
    }
  }
  return out;
}

async function findNetworkCapabilities(): Promise<string[]> {
  const found: string[] = [];
  for await (const entry of Deno.readDir(CAPABILITIES)) {
    const dirs = entry.isDirectory ? [join(CAPABILITIES, entry.name)] : [];
    for (const dir of dirs) {
      try {
        const descriptor = JSON.parse(await Deno.readTextFile(join(dir, "capability.json")));
        if (descriptor.effect === "NETWORK") found.push(dir);
      } catch {
        // Not a capability directory, or a namespace folder. Skip.
      }
    }
  }
  return found.sort();
}

async function checkCapability(dir: string, update: boolean): Promise<number> {
  const name = dir.split("/").pop()!;
  const fixturesDir = join(dir, "tests", "fixtures");
  const provPath = join(fixturesDir, "provenance.json");

  let recordings: Recording[];
  try {
    recordings = JSON.parse(await Deno.readTextFile(provPath)).recordings ?? [];
  } catch {
    console.error(`✗ ${name}: tests/fixtures/provenance.json is missing or unreadable`);
    return 1;
  }

  console.log(`\n${name} — ${recordings.length} recording(s)`);
  let failures = 0;

  for (const rec of recordings) {
    const recordedRaw = await Deno.readTextFile(join(fixturesDir, rec.file));
    const recorded = JSON.parse(recordedRaw);

    let live: unknown;
    try {
      const res = await fetch(rec.source, {
        headers: {
          accept: "application/json",
          "user-agent": "CapFoundry/0.1 (+https://github.com/netsi1964/CapFoundry)",
        },
      });
      if (!res.ok) {
        console.error(
          `  ✗ ${rec.file}: HTTP ${res.status} — network problem, not a contract change`,
        );
        failures++;
        await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
        continue;
      }
      live = await res.json();
    } catch (err) {
      console.error(
        `  ✗ ${rec.file}: ${(err as Error).message} — network problem, not a contract change`,
      );
      failures++;
      continue;
    }

    const before = shapeOf(recorded);
    const after = shapeOf(live);
    const removed = [...before].filter((f) => !after.has(f));
    const added = [...after].filter((f) => !before.has(f));

    if (removed.length === 0 && added.length === 0) {
      console.log(`  ✓ ${rec.file}`);
    } else {
      // Removed fields can break parse; added ones cannot. Report both, fail on removed.
      if (removed.length > 0) {
        failures++;
        console.error(`  ✗ ${rec.file}: ${removed.length} field(s) no longer present`);
        for (const f of removed.slice(0, 8)) console.error(`      - ${f}`);
      }
      if (added.length > 0) {
        console.log(`  · ${rec.file}: ${added.length} new field(s), not a break`);
        for (const f of added.slice(0, 5)) console.log(`      + ${f}`);
      }
    }

    if (update) {
      await Deno.writeTextFile(
        join(fixturesDir, rec.file),
        JSON.stringify(live, null, 2) + "\n",
      );
      console.log(`    updated ${rec.file} — review the diff and bump retrievedAt`);
    }

    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
  }

  return failures;
}

const update = Deno.args.includes("--update");
const capabilities = await findNetworkCapabilities();

if (capabilities.length === 0) {
  console.log("No NETWORK capabilities to check.");
  Deno.exit(0);
}

console.log(
  `Checking ${capabilities.length} NETWORK capability/capabilities against the live API.` +
    (update ? "  (--update: recordings will be rewritten)" : ""),
);

let total = 0;
for (const dir of capabilities) total += await checkCapability(dir, update);

console.log("");
if (total === 0) {
  console.log("✓ Recordings still match the live contract.");
} else {
  console.error(
    `✗ ${total} problem(s). A missing field is a contract change; an HTTP error is not — rerun before believing it.`,
  );
  Deno.exit(1);
}
