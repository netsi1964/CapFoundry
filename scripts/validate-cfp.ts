#!/usr/bin/env -S deno run --allow-read
/**
 * CFP validator (PRD-FEAT-001.4).
 *
 * Fails on the first problem it can name precisely: a vague "invalid package"
 * would push the cost of every mistake onto whoever authors the next
 * capability.
 */

import { join, relative } from "@std/path";
import { CfcmError } from "../cfcm/types.ts";
import { entrypointPath, listCfpDirs, readDescriptor } from "../cfcm/sources/cfp.ts";
import { sha256File } from "../cfcm/util/hash.ts";
import { pathExists } from "../cfcm/util/paths.ts";
import { tokenize } from "../cfcm/search/tokenize.ts";

const CAPABILITIES_ROOT = Deno.args[0] ?? "./capabilities";

interface Problem {
  cfp: string;
  message: string;
}

async function validateCfp(dir: string, problems: Problem[]): Promise<void> {
  const rel = relative(".", dir);
  const fail = (message: string) => problems.push({ cfp: rel, message });

  let descriptor;
  try {
    descriptor = await readDescriptor(dir);
  } catch (err) {
    fail(err instanceof CfcmError ? err.message : String(err));
    return;
  }

  // The directory name is the capability's identity on disk. Letting them
  // drift makes the registry impossible to navigate.
  const expectedDir = descriptor.name;
  if (!dir.endsWith(expectedDir)) {
    fail(`directory should be named "${expectedDir}" to match capability.json`);
  }

  const entry = entrypointPath(dir, descriptor);
  if (!await pathExists(entry)) {
    fail(`artifact.entrypoint points at ${descriptor.artifact.entrypoint}, which does not exist`);
  } else {
    const actual = await sha256File(entry);
    if (actual !== descriptor.artifact.sha256) {
      fail(
        `artifact.sha256 does not match ${descriptor.artifact.entrypoint}\n` +
          `      declared: ${descriptor.artifact.sha256}\n` +
          `      actual:   ${actual}\n` +
          `      run "deno task seal" to update it`,
      );
    }
  }

  const testsDir = join(dir, descriptor.tests);
  if (!await pathExists(testsDir)) {
    fail(`tests points at ${descriptor.tests}, which does not exist`);
  }

  for (const required of ["provenance.json", "README.md"]) {
    if (!await pathExists(join(dir, required))) fail(`${required} is missing`);
  }
  if (!await pathExists(join(dir, "license"))) fail(`license/ directory is missing`);

  // Aliases exist to make a capability findable without its name (OBJ-1). An
  // alias that just restates the name adds ranking weight without adding
  // recall, so it is rejected rather than tolerated.
  const nameTokens = new Set(tokenize(descriptor.name.split(".").join(" ")));
  for (const alias of descriptor.aliases) {
    const aliasTokens = tokenize(alias);
    if (aliasTokens.length > 0 && aliasTokens.every((t) => nameTokens.has(t))) {
      fail(`alias "${alias}" only restates the capability name and adds no recall`);
    }
  }

  if (descriptor.effect !== "PURE") {
    fail(`effect is ${descriptor.effect}; the MVP executes PURE capabilities only`);
  }
}

const dirs = await listCfpDirs(CAPABILITIES_ROOT);
const problems: Problem[] = [];

for (const dir of dirs) await validateCfp(dir, problems);

// Nested roots: capabilities/netsi/ holds private fixtures.
let nested = 0;
if (await pathExists(CAPABILITIES_ROOT)) {
  for await (const entry of Deno.readDir(CAPABILITIES_ROOT)) {
    if (!entry.isDirectory) continue;
    const sub = join(CAPABILITIES_ROOT, entry.name);
    if (await pathExists(join(sub, "capability.json"))) continue;
    for (const dir of await listCfpDirs(sub)) {
      nested++;
      await validateCfp(dir, problems);
    }
  }
}

if (problems.length > 0) {
  console.error(`\n✗ ${problems.length} problem(s) in ${CAPABILITIES_ROOT}:\n`);
  for (const p of problems) console.error(`  ${p.cfp}\n      ${p.message}\n`);
  Deno.exit(1);
}

console.log(`✓ ${dirs.length + nested} CFP(s) valid in ${CAPABILITIES_ROOT}`);
