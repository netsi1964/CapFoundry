#!/usr/bin/env -S deno run --allow-read --allow-write
/**
 * Builds registry/index.json from capabilities/ (PRD-FEAT-002.1).
 *
 * The index is derived from the CFPs but committed to Git, so the build has to
 * be reproducible in a way that survives a fresh clone. That rules out file
 * mtimes: Git does not preserve them, so an mtime-derived timestamp would make
 * `--check` fail on every clone for reasons that have nothing to do with drift.
 *
 * Timestamps are therefore real build times, and `--check` compares the
 * capability records with timestamps normalised out. The gate asks "have the
 * capabilities drifted from the index?", which is the question worth failing a
 * PR over — not "was this rebuilt in the same second".
 */

import { join, relative, SEPARATOR } from "@std/path";
import type { IndexRecord, RegistryIndex } from "../cfcm/types.ts";
import { listCfpDirs, readDescriptor, toIndexRecord } from "../cfcm/sources/cfp.ts";
import { pathExists } from "../cfcm/util/paths.ts";

const CAPABILITIES_ROOT = "./capabilities";
const OUTPUT = "./registry/index.json";
const check = Deno.args.includes("--check");

/** Paths inside the index are posix and relative to the registry base. */
function toPosix(path: string): string {
  return path.split(SEPARATOR).join("/");
}

/** Everything except when the file was written. */
function comparable(index: RegistryIndex): string {
  return JSON.stringify({
    schemaVersion: index.schemaVersion,
    capabilities: index.capabilities.map(({ indexedAt: _indexedAt, ...rest }) => rest),
  });
}

const generatedAt = new Date().toISOString();
const records: IndexRecord[] = [];

for (const dir of await listCfpDirs(CAPABILITIES_ROOT)) {
  const descriptor = await readDescriptor(dir);
  records.push(toIndexRecord(
    descriptor,
    toPosix(relative(".", dir)),
    toPosix(relative(".", join(dir, descriptor.artifact.entrypoint))),
    "public",
    generatedAt,
  ));
}

records.sort((a, b) => a.name.localeCompare(b.name));

const index: RegistryIndex = { schemaVersion: 1, generatedAt, capabilities: records };
const serialized = `${JSON.stringify(index, null, 2)}\n`;

if (check) {
  if (!await pathExists(OUTPUT)) {
    console.error(`✗ ${OUTPUT} does not exist. Run "deno task build-index" and commit the result.`);
    Deno.exit(1);
  }
  const current = JSON.parse(await Deno.readTextFile(OUTPUT)) as RegistryIndex;
  if (comparable(current) !== comparable(index)) {
    console.error(
      `✗ ${OUTPUT} is out of date with ${CAPABILITIES_ROOT}.\n` +
        `  Run "deno task build-index" and commit the result.`,
    );
    Deno.exit(1);
  }
  console.log(`✓ ${OUTPUT} is in sync (${records.length} capabilities)`);
} else {
  await Deno.mkdir("./registry", { recursive: true });
  await Deno.writeTextFile(OUTPUT, serialized);
  const bytes = new TextEncoder().encode(serialized).length;
  console.log(`✓ ${OUTPUT} — ${records.length} capabilities, ${(bytes / 1024).toFixed(1)} KB`);
}
