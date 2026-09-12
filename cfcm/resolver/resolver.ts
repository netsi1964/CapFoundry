/**
 * Artifact resolution: cache hit, or fetch and verify (MVP section 8).
 *
 * Private filesystem capabilities are read in place and never written to the
 * shared cache: their artifacts are the user's, not the registry's, and mixing
 * them would leak private code into a directory shared across projects.
 */

import type { CapabilitySource } from "../sources/mod.ts";
import type { IndexRecord } from "../types.ts";
import { CfcmError } from "../types.ts";
import { ArtifactCache } from "../cache/cache.ts";
import { sha256Hex } from "../util/hash.ts";

export interface ResolvedArtifact {
  /** Path to a file on disk that can be executed. */
  path: string;
  sha256: string;
  cacheHit: boolean;
  fetchMs: number | null;
  source: string;
}

export class Resolver {
  constructor(private readonly cache: ArtifactCache) {}

  async resolve(record: IndexRecord, source: CapabilitySource): Promise<ResolvedArtifact> {
    if (source.namespaceType !== "public") {
      const started = performance.now();
      const bytes = await source.readArtifact(record);
      const actual = await sha256Hex(bytes);
      if (actual !== record.artifact.sha256) {
        throw new CfcmError(
          "ARTIFACT_INTEGRITY",
          `artifact hash mismatch for ${record.name}: expected ${record.artifact.sha256}, got ${actual}`,
          { capability: record.name, expected: record.artifact.sha256, actual },
        );
      }
      return {
        path: record.artifactLocation,
        sha256: actual,
        cacheHit: true,
        fetchMs: Number((performance.now() - started).toFixed(3)),
        source: source.id,
      };
    }

    const hit = await this.cache.get(record.artifact.sha256);
    if (hit) {
      return { path: hit.path, sha256: hit.sha256, cacheHit: true, fetchMs: null, source: "cache" };
    }

    const started = performance.now();
    const bytes = await source.readArtifact(record);
    const fetchMs = Number((performance.now() - started).toFixed(3));
    const entry = await this.cache.put(record.artifact.sha256, bytes);

    return { path: entry.path, sha256: entry.sha256, cacheHit: false, fetchMs, source: source.id };
  }
}
