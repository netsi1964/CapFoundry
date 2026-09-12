/**
 * The test contract for NETWORK capabilities.
 *
 * One rule, and it is the whole point: **a NETWORK capability's test suite must
 * pass with zero network permission.** If it cannot, the recordings are not
 * doing their job and the suite would be measuring someone else's uptime — a
 * red build that means nothing, which is worse than no build at all because it
 * trains people to ignore red.
 *
 * The shape that satisfies it is two pure halves, `buildRequest` and `parse`,
 * with a default export thin enough to have no logic left to test. Splitting
 * only at `parse` is not enough: request construction is deterministic and is
 * where URL-encoding, query parameters and required headers go wrong, and
 * under a single seam all of that sits on the untestable side of the line.
 *
 * The fetch path itself is covered once, at platform level, in
 * tests/network_test.ts — not once per capability.
 */

import { assert, assertEquals } from "@std/assert";
import { join } from "@std/path";
import { pathExists } from "../cfcm/util/paths.ts";

const REPO_ROOT = new URL("..", import.meta.url).pathname;
const FIXTURES = join(REPO_ROOT, "tests/fixtures/network-cfp");

/** Runs a CFP's tests with read access but no network at all. */
async function runOffline(testsDir: string): Promise<{ ok: boolean; output: string }> {
  const cmd = new Deno.Command(Deno.execPath(), {
    // Its own config: deno.json excludes these fixtures from the main suite,
    // and an exclude applies to explicit paths too.
    args: [
      "test",
      "--config",
      join(FIXTURES, "deno.json"),
      "--allow-read",
      "--quiet",
      testsDir,
    ],
    cwd: REPO_ROOT,
    stdout: "piped",
    stderr: "piped",
  });
  const out = await cmd.output();
  return {
    ok: out.code === 0,
    output: new TextDecoder().decode(out.stdout) + new TextDecoder().decode(out.stderr),
  };
}

Deno.test("the rule passes a capability whose logic is separable", async () => {
  const { ok, output } = await runOffline(join(FIXTURES, "good/tests"));
  assert(ok, `the reference shape should test offline:\n${output}`);
});

Deno.test("the rule fails a capability whose logic is welded to fetch", async () => {
  // An unarmed tripwire is decoration. This proves the rule can actually fail.
  const { ok, output } = await runOffline(join(FIXTURES, "bad/tests"));
  assert(!ok, "a capability that can only be tested against the live API must fail the rule");
  assert(
    /net access|NotCapable/i.test(output),
    `expected a permission failure, got:\n${output.slice(0, 400)}`,
  );
});

Deno.test("every shipped NETWORK capability tests offline", async () => {
  // No-op while the first capability set is entirely PURE. It arms itself the
  // moment a NETWORK capability ships, which is the point of writing it now
  // rather than alongside the first one.
  const root = join(REPO_ROOT, "capabilities");
  let checked = 0;

  for await (const entry of Deno.readDir(root)) {
    if (!entry.isDirectory) continue;
    const descriptorPath = join(root, entry.name, "capability.json");
    if (!await pathExists(descriptorPath)) continue;

    const descriptor = JSON.parse(await Deno.readTextFile(descriptorPath));
    if (descriptor.effect !== "NETWORK") continue;

    checked++;
    const { ok, output } = await runOffline(join(root, entry.name, "tests"));
    assert(
      ok,
      `${descriptor.name} cannot be tested without network access. Split buildRequest and parse ` +
        `out of the default export and test them against recorded responses.\n${output}`,
    );
  }

  assertEquals(typeof checked, "number");
});

Deno.test("the reference shape exports both pure halves", async () => {
  const artifact = await import(`${FIXTURES}/good/artifact/index.ts`);
  assertEquals(
    typeof artifact.buildRequest,
    "function",
    "buildRequest must be separately testable",
  );
  assertEquals(typeof artifact.parse, "function", "parse must be separately testable");
  assertEquals(typeof artifact.default, "function");
});

Deno.test("recorded responses carry their provenance", async () => {
  // A recorded payload is third-party data. Nominatim responses are ODbL;
  // without a trail the repository quietly accumulates redistributed data with
  // no licence attached. Same discipline as provenance.json, one level down.
  const dir = join(FIXTURES, "good/tests/fixtures");
  const manifest = JSON.parse(await Deno.readTextFile(join(dir, "provenance.json")));

  const recorded = new Set<string>();
  for await (const entry of Deno.readDir(dir)) {
    if (entry.isFile && entry.name !== "provenance.json") recorded.add(entry.name);
  }

  for (const file of recorded) {
    const record = manifest.recordings.find((r: { file: string }) => r.file === file);
    assert(record, `${file} is recorded but not covered by provenance.json`);
    for (const field of ["source", "retrievedAt", "license"]) {
      assert(record[field], `${file} provenance is missing ${field}`);
    }
  }
});
