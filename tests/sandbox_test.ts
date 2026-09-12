/**
 * Sandbox tests (PRD-FEAT-006 acceptance criteria, SEC-1 and SEC-3).
 *
 * These are the tests that decide whether it is responsible to run downloaded
 * code on a user's machine. Each one attempts a real escape and asserts that
 * it fails.
 */

import { assert, assertRejects, assertStringIncludes } from "@std/assert";
import { fromFileUrl } from "@std/path";
import { execute } from "../cfcm/runtime/execute.ts";
import { CfcmError } from "../cfcm/types.ts";
import { pathExists } from "../cfcm/util/paths.ts";

const fixture = (name: string) =>
  fromFileUrl(new URL(`./fixtures/artifacts/${name}`, import.meta.url));

function run(name: string, overrides: Partial<Parameters<typeof execute>[0]> = {}) {
  return execute({
    artifactPath: fixture(name),
    input: null,
    timeoutMs: 5000,
    maxOutputBytes: 4 * 1024 * 1024,
    effect: "PURE",
    capability: `test.${name}`,
    ...overrides,
  });
}

Deno.test("network access is denied", async () => {
  const err = await assertRejects(() => run("net.ts"), CfcmError);
  assertStringIncludes(err.message, "test.net.ts failed");
  // Deno's own permission error, not a network error: the call never left.
  assertStringIncludes(err.message.toLowerCase(), "net access");
});

Deno.test("filesystem reads are denied", async () => {
  const err = await assertRejects(() => run("read.ts"), CfcmError);
  assertStringIncludes(err.message.toLowerCase(), "read access");
});

Deno.test("filesystem writes are denied and leave nothing behind", async () => {
  const escape = "/tmp/cfcm-sandbox-escape";
  if (await pathExists(escape)) await Deno.remove(escape);

  const err = await assertRejects(() => run("write.ts"), CfcmError);
  assertStringIncludes(err.message.toLowerCase(), "write access");
  assert(!await pathExists(escape), "artifact managed to write outside the sandbox");
});

Deno.test("host environment variables are not visible", async () => {
  Deno.env.set("CFCM_SECRET_CANARY", "leaked-value");
  try {
    // Reading env is permission-gated, so this throws rather than returning
    // the value. Both the throw and a null would be acceptable; a leak is not.
    const err = await assertRejects(() => run("env.ts"), CfcmError);
    assert(
      !err.message.includes("leaked-value"),
      "host environment leaked into the sandbox",
    );
  } finally {
    Deno.env.delete("CFCM_SECRET_CANARY");
  }
});

Deno.test("an infinite loop is killed by the timeout", async () => {
  const started = performance.now();
  const err = await assertRejects(
    () => run("spin.ts", { timeoutMs: 1000 }),
    CfcmError,
  );
  const elapsed = performance.now() - started;

  assertStringIncludes(err.code, "TIMEOUT");
  // Killed promptly, not merely abandoned.
  assert(elapsed < 1000 + 2000, `timeout took ${elapsed.toFixed(0)} ms, expected under 3000 ms`);
});

Deno.test("oversized output is capped and terminated", async () => {
  const err = await assertRejects(
    () => run("flood.ts", { maxOutputBytes: 64 * 1024 }),
    CfcmError,
  );
  assertStringIncludes(err.code, "OUTPUT_TOO_LARGE");
});

Deno.test("a NETWORK effect without a grant is refused before anything is spawned", async () => {
  // The grant is computed by cfcm/runtime/permissions.ts. Arriving here
  // without one means it was never computed, and running anyway would produce
  // a permission error indistinguishable from a policy decision.
  const err = await assertRejects(() => run("net.ts", { effect: "NETWORK" }), CfcmError);
  assertStringIncludes(err.code, "NETWORK_NOT_PERMITTED");
});

Deno.test("an unexecutable effect is refused before anything is spawned", async () => {
  const err = await assertRejects(() => run("net.ts", { effect: "WRITE" }), CfcmError);
  assertStringIncludes(err.code, "EFFECT_UNSUPPORTED");
});
