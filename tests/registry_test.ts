/** Registry index build tests (PRD-FEAT-002 acceptance criteria). */

import { assert, assertEquals } from "@std/assert";
import type { RegistryIndex } from "../cfcm/types.ts";

const REPO_ROOT = new URL("..", import.meta.url).pathname;

async function runBuild(args: string[] = []): Promise<{ code: number; output: string }> {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: ["run", "--allow-read", "--allow-write", "scripts/build-index.ts", ...args],
    cwd: REPO_ROOT,
    stdout: "piped",
    stderr: "piped",
  });
  const out = await cmd.output();
  return {
    code: out.code,
    output: new TextDecoder().decode(out.stdout) + new TextDecoder().decode(out.stderr),
  };
}

Deno.test("the committed index is in sync with capabilities/", async () => {
  const { code, output } = await runBuild(["--check"]);
  assertEquals(code, 0, output);
});

Deno.test("the index carries no executable code", async () => {
  const index = JSON.parse(
    await Deno.readTextFile(`${REPO_ROOT}registry/index.json`),
  ) as RegistryIndex;

  for (const record of index.capabilities) {
    const serialized = JSON.stringify(record);
    assert(
      !serialized.includes("function"),
      `${record.name} leaked artifact source into the index`,
    );
    assert(!serialized.includes("=>"), `${record.name} leaked artifact source into the index`);
    // Schemas are fetched on describe, not carried in the index (MVP section 8).
    assert(!("inputSchema" in record), `${record.name} carries inputSchema in the compact index`);
    assert(!("outputSchema" in record), `${record.name} carries outputSchema in the compact index`);
  }
});

Deno.test("the index stays small enough to fetch in one request", async () => {
  const stat = await Deno.stat(`${REPO_ROOT}registry/index.json`);
  const perCapability = stat.size / 7; // budget is sized for the full first set
  assert(perCapability < 32 * 1024, `index is ${stat.size} bytes, too large per capability`);
});

Deno.test("every index record resolves to a real artifact", async () => {
  const index = JSON.parse(
    await Deno.readTextFile(`${REPO_ROOT}registry/index.json`),
  ) as RegistryIndex;

  assert(index.capabilities.length > 0, "the index is empty");
  for (const record of index.capabilities) {
    const stat = await Deno.stat(`${REPO_ROOT}${record.artifactLocation}`);
    assert(stat.isFile, `${record.name}: artifactLocation is not a file`);
    const cfp = await Deno.stat(`${REPO_ROOT}${record.cfpLocation}/capability.json`);
    assert(cfp.isFile, `${record.name}: cfpLocation has no capability.json`);
  }
});
