/** Artifact cache and integrity tests (PRD-FEAT-005, SEC-2). */

import { assert, assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import { ArtifactCache } from "../cfcm/cache/cache.ts";
import { sha256Hex } from "../cfcm/util/hash.ts";
import { CfcmError } from "../cfcm/types.ts";
import { pathExists } from "../cfcm/util/paths.ts";

async function withCache(fn: (cache: ArtifactCache, root: string) => Promise<void>) {
  const root = await Deno.makeTempDir({ prefix: "cfcm-cache-" });
  try {
    await fn(new ArtifactCache(root), root);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
}

const bytes = new TextEncoder().encode("export default () => 42;\n");

Deno.test("a verified artifact round-trips through the cache", async () => {
  await withCache(async (cache) => {
    const hash = await sha256Hex(bytes);
    assertEquals(await cache.get(hash), null);

    const entry = await cache.put(hash, bytes);
    assertEquals(entry.sha256, hash);

    const hit = await cache.get(hash);
    assert(hit, "expected a cache hit after put");
    assertEquals(await Deno.readFile(hit.path), bytes);
  });
});

Deno.test("a tampered artifact is rejected and never cached", async () => {
  await withCache(async (cache) => {
    const claimed = await sha256Hex(bytes);
    const tampered = new TextEncoder().encode("export default () => { /* evil */ };\n");

    const err = await assertRejects(() => cache.put(claimed, tampered), CfcmError);
    assertEquals(err.code, "ARTIFACT_INTEGRITY");
    // The message must name both hashes so the failure is diagnosable.
    assertStringIncludes(err.message, claimed);
    assertStringIncludes(err.message, await sha256Hex(tampered));

    assertEquals(await cache.get(claimed), null, "a bad artifact was cached anyway");
  });
});

Deno.test("a failed put leaves no temp files behind", async () => {
  await withCache(async (cache, root) => {
    const claimed = await sha256Hex(bytes);
    await assertRejects(() => cache.put(claimed, new TextEncoder().encode("x")), CfcmError);
    // Nothing should have been written at all: verification precedes any I/O.
    assert(!await pathExists(root) || [...Deno.readDirSync(root)].length === 0);
  });
});

Deno.test("cache survives being reopened", async () => {
  await withCache(async (cache, root) => {
    const hash = await sha256Hex(bytes);
    await cache.put(hash, bytes);
    const reopened = new ArtifactCache(root);
    assert(await reopened.get(hash), "cache did not survive reopening");
  });
});

Deno.test("list and clear", async () => {
  await withCache(async (cache) => {
    await cache.put(await sha256Hex(bytes), bytes);
    const other = new TextEncoder().encode("export default () => 43;\n");
    await cache.put(await sha256Hex(other), other);

    assertEquals((await cache.list()).length, 2);
    assertEquals(await cache.clear(), 2);
    assertEquals((await cache.list()).length, 0);
  });
});

Deno.test("a non-sha256 key is refused", async () => {
  await withCache(async (cache) => {
    await assertRejects(() => cache.put("../../etc/passwd", bytes), CfcmError);
  });
});
