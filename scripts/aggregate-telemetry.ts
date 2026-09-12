#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env
/**
 * Aggregates local telemetry into the deterministic figures Explore shows
 * (PRD-FEAT-009.5, MVP section 20).
 *
 * No LLM analysis, no trend inference, no smoothing. Six counts and two
 * comparisons, computed the same way every time, so a number on the page can
 * be traced back to the lines that produced it.
 *
 * `missing` is the section worth caring about. It is demand for a capability
 * that does not exist, and it is the only part of Explore that tells you what
 * to build next rather than what already happened. Everything else is history.
 */

import { join } from "@std/path";
import { pathExists, paths } from "../cfcm/util/paths.ts";
import type { TelemetryEvent } from "../cfcm/telemetry/telemetry.ts";
import type { RegistryIndex } from "../cfcm/types.ts";

export interface ExploreData {
  generatedAt: string;
  window: { from: string | null; to: string | null; days: number };
  totals: {
    searches: number;
    matches: number;
    noMatches: number;
    invocations: number;
    candidates: number;
  };
  mostUsed: { name: string; invocations: number; namespaceType: string }[];
  mostSearched: { name: string; appearances: number; matchRate: number }[];
  missing: { query: string; occurrences: number; lastSeen: string; bestConfidence: number }[];
  newCandidates: { name: string; submittedAt: string }[];
  fastestGrowing: { name: string; recent: number; earlier: number; change: number }[];
  recentlyAdded: { name: string; version: string; indexedAt: string }[];
}

const TOP_N = 10;

async function readEvents(dir: string): Promise<TelemetryEvent[]> {
  if (!await pathExists(dir)) return [];
  const events: TelemetryEvent[] = [];

  for await (const entry of Deno.readDir(dir)) {
    if (!entry.isFile || !entry.name.endsWith(".jsonl")) continue;
    const text = await Deno.readTextFile(join(dir, entry.name));
    for (const line of text.split("\n")) {
      if (line.trim() === "") continue;
      try {
        events.push(JSON.parse(line));
      } catch {
        // A partially written final line is normal for an append-only log that
        // is being read while something writes to it. Skip it rather than
        // failing the whole aggregation.
      }
    }
  }

  return events.sort((a, b) => a.ts.localeCompare(b.ts));
}

function tally<T>(items: T[], key: (item: T) => string | null): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    if (k === null) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

function top(counts: Map<string, number>, n = TOP_N): [string, number][] {
  // Ties broken by name so the page does not reshuffle between builds.
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);
}

export function aggregate(
  events: TelemetryEvent[],
  index: RegistryIndex | null,
  candidates: { suggestedName: string; createdAt: string }[],
): ExploreData {
  const searches = events.filter((e) => e.eventType === "search");
  const invocations = events.filter((e) => e.eventType === "invoke" && e.status === "OK");
  const noMatches = searches.filter((e) => e.status === "NO_MATCH");

  const namespaceByName = new Map<string, string>();
  for (const e of events) {
    if (e.capability && e.namespaceType) namespaceByName.set(e.capability, e.namespaceType);
  }

  // Grouped by the normalised query, so "Compute Edit Distance" and "compute
  // edit distance" are the same unmet demand rather than two.
  const missingGroups = new Map<
    string,
    { query: string; occurrences: number; lastSeen: string; bestConfidence: number }
  >();
  for (const event of noMatches) {
    if (!event.queryText) continue;
    const key = event.queryText.trim().toLowerCase().replace(/\s+/g, " ");
    const existing = missingGroups.get(key);
    if (existing) {
      existing.occurrences++;
      if (event.ts > existing.lastSeen) existing.lastSeen = event.ts;
      existing.bestConfidence = Math.max(existing.bestConfidence, event.confidence ?? 0);
    } else {
      missingGroups.set(key, {
        query: event.queryText.trim(),
        occurrences: 1,
        lastSeen: event.ts,
        bestConfidence: event.confidence ?? 0,
      });
    }
  }

  // Halve the window and compare. Crude, deterministic, and honest about being
  // a comparison of two buckets rather than a trend line.
  const midpoint = events.length > 0
    ? events[Math.floor(events.length / 2)].ts
    : new Date().toISOString();
  const earlierCounts = tally(invocations.filter((e) => e.ts < midpoint), (e) => e.capability);
  const recentCounts = tally(invocations.filter((e) => e.ts >= midpoint), (e) => e.capability);

  const growing = [...new Set([...earlierCounts.keys(), ...recentCounts.keys()])]
    .map((name) => {
      const earlier = earlierCounts.get(name) ?? 0;
      const recent = recentCounts.get(name) ?? 0;
      return { name, recent, earlier, change: recent - earlier };
    })
    .filter((row) => row.change > 0)
    .sort((a, b) => b.change - a.change || a.name.localeCompare(b.name))
    .slice(0, TOP_N);

  const searchAppearances = tally(searches, (e) => e.capability);
  const searchMatches = tally(
    searches.filter((e) => e.status === "MATCH"),
    (e) => e.capability,
  );

  const from = events[0]?.ts ?? null;
  const to = events[events.length - 1]?.ts ?? null;

  return {
    generatedAt: new Date().toISOString(),
    window: {
      from,
      to,
      days: from && to
        ? Math.max(
          1,
          Math.ceil((Date.parse(to) - Date.parse(from)) / 86_400_000),
        )
        : 0,
    },
    totals: {
      searches: searches.length,
      matches: searches.filter((e) => e.status === "MATCH").length,
      noMatches: noMatches.length,
      invocations: invocations.length,
      candidates: events.filter((e) => e.eventType === "candidate" && e.status === "OK").length,
    },
    mostUsed: top(tally(invocations, (e) => e.capability)).map(([name, invocations]) => ({
      name,
      invocations,
      namespaceType: namespaceByName.get(name) ?? "unknown",
    })),
    mostSearched: top(searchAppearances).map(([name, appearances]) => ({
      name,
      appearances,
      matchRate: Number(((searchMatches.get(name) ?? 0) / appearances).toFixed(3)),
    })),
    missing: [...missingGroups.values()]
      .sort((a, b) => b.occurrences - a.occurrences || a.query.localeCompare(b.query))
      .slice(0, TOP_N),
    newCandidates: candidates
      .map((c) => ({ name: c.suggestedName, submittedAt: c.createdAt }))
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
      .slice(0, TOP_N),
    fastestGrowing: growing,
    recentlyAdded: (index?.capabilities ?? [])
      .map((c) => ({ name: c.name, version: c.version, indexedAt: c.indexedAt }))
      .sort((a, b) => b.indexedAt.localeCompare(a.indexedAt) || a.name.localeCompare(b.name))
      .slice(0, TOP_N),
  };
}

if (import.meta.main) {
  const outputPath = Deno.args[0] ?? "./web/explore/data.json";

  const events = await readEvents(paths.telemetry());

  let index: RegistryIndex | null = null;
  try {
    index = JSON.parse(await Deno.readTextFile("./registry/index.json"));
  } catch {
    // Explore is still meaningful without a registry to name recent additions.
  }

  const candidates: { suggestedName: string; createdAt: string }[] = [];
  if (await pathExists(paths.candidates())) {
    for await (const entry of Deno.readDir(paths.candidates())) {
      if (!entry.isFile || !entry.name.endsWith(".json")) continue;
      candidates.push(JSON.parse(await Deno.readTextFile(join(paths.candidates(), entry.name))));
    }
  }

  const data = aggregate(events, index, candidates);
  await Deno.mkdir(outputPath.replace(/\/[^/]+$/, ""), { recursive: true });
  await Deno.writeTextFile(outputPath, `${JSON.stringify(data, null, 2)}\n`);

  console.log(
    `✓ ${outputPath} — ${data.totals.searches} searches, ${data.totals.invocations} invocations, ` +
      `${data.missing.length} unmet demand group(s)`,
  );
}
