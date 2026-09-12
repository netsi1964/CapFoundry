#!/usr/bin/env -S deno run --allow-read --allow-write
/**
 * Writes the correct artifact sha256 into each capability.json.
 *
 * A convenience for authors, not part of the trust chain: the validator still
 * enforces the hash independently, so forgetting to run this fails CI rather
 * than shipping an unverified artifact.
 */

import { join, relative } from "@std/path";
import { listCfpDirs } from "../cfcm/sources/cfp.ts";
import { sha256File } from "../cfcm/util/hash.ts";
import { pathExists } from "../cfcm/util/paths.ts";

const root = Deno.args[0] ?? "./capabilities";

async function seal(dir: string): Promise<boolean> {
  const file = join(dir, "capability.json");
  const text = await Deno.readTextFile(file);
  const descriptor = JSON.parse(text);
  const entry = join(dir, descriptor.artifact.entrypoint);

  if (!await pathExists(entry)) {
    console.error(`  ! ${relative(".", dir)}: entrypoint missing, skipped`);
    return false;
  }

  const actual = await sha256File(entry);
  if (descriptor.artifact.sha256 === actual) return false;

  descriptor.artifact.sha256 = actual;
  await Deno.writeTextFile(file, `${JSON.stringify(descriptor, null, 2)}\n`);
  console.log(`  ✓ ${relative(".", dir)} -> ${actual.slice(0, 12)}…`);
  return true;
}

const roots = [root];
for await (const entry of Deno.readDir(root)) {
  if (entry.isDirectory && !await pathExists(join(root, entry.name, "capability.json"))) {
    roots.push(join(root, entry.name));
  }
}

let changed = 0;
for (const r of roots) {
  for (const dir of await listCfpDirs(r)) {
    if (await seal(dir)) changed++;
  }
}
console.log(
  changed === 0 ? "All hashes already current." : `Sealed ${changed} capability descriptor(s).`,
);
