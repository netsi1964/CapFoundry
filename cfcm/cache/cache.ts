/**
 * Content-addressed artifact cache (PRD-FEAT-005.1).
 *
 * Keying by sha256 rather than by capability name means a version bump is a
 * new cache entry with no invalidation logic, and a tampered artifact can
 * never occupy the slot of a good one.
 */

import { join } from "@std/path";
import { ensureDir, pathExists, paths } from "../util/paths.ts";
import { sha256Hex } from "../util/hash.ts";
import { CfcmError } from "../types.ts";

export interface CacheEntry {
  sha256: string;
  path: string;
  bytes: number;
}

function assertHex(sha256: string): void {
  if (!/^[0-9a-f]{64}$/.test(sha256)) {
    throw new CfcmError("CACHE_INVALID_KEY", `not a sha256 hex digest: ${sha256}`);
  }
}

export class ArtifactCache {
  constructor(private readonly root: string = paths.artifacts()) {}

  path(sha256: string): string {
    assertHex(sha256);
    return join(this.root, `${sha256}.ts`);
  }

  async get(sha256: string): Promise<CacheEntry | null> {
    const path = this.path(sha256);
    if (!await pathExists(path)) return null;
    const stat = await Deno.stat(path);
    return { sha256, path, bytes: stat.size };
  }

  /**
   * Verifies before writing. A mismatch is never cached, so a poisoned fetch
   * cannot become a persistent compromise (SEC-2).
   */
  async put(expectedSha256: string, bytes: Uint8Array): Promise<CacheEntry> {
    assertHex(expectedSha256);
    const actual = await sha256Hex(bytes);
    if (actual !== expectedSha256) {
      throw new CfcmError(
        "ARTIFACT_INTEGRITY",
        `artifact hash mismatch: expected ${expectedSha256}, got ${actual}`,
        { expected: expectedSha256, actual },
      );
    }

    await ensureDir(this.root);
    const path = this.path(expectedSha256);
    // Write to a sibling temp file then rename, so a crash mid-write cannot
    // leave a truncated artifact sitting at a valid hash's path.
    const tmp = `${path}.${crypto.randomUUID()}.tmp`;
    await Deno.writeFile(tmp, bytes);
    await Deno.rename(tmp, path);
    return { sha256: expectedSha256, path, bytes: bytes.length };
  }

  async list(): Promise<CacheEntry[]> {
    if (!await pathExists(this.root)) return [];
    const out: CacheEntry[] = [];
    for await (const entry of Deno.readDir(this.root)) {
      if (!entry.isFile || !entry.name.endsWith(".ts")) continue;
      const sha256 = entry.name.slice(0, -3);
      if (!/^[0-9a-f]{64}$/.test(sha256)) continue;
      const stat = await Deno.stat(join(this.root, entry.name));
      out.push({ sha256, path: join(this.root, entry.name), bytes: stat.size });
    }
    return out.sort((a, b) => a.sha256.localeCompare(b.sha256));
  }

  async clear(): Promise<number> {
    const entries = await this.list();
    for (const e of entries) await Deno.remove(e.path);
    return entries.length;
  }
}
