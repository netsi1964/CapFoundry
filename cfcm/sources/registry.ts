/**
 * Registry source: the static, Git-hosted public index (AD-4).
 *
 * The base may be an https URL (GitHub Pages) or a local directory, which is
 * what lets the whole pipeline be exercised end to end without hosting
 * anything. Layout under the base:
 *
 *   registry/index.json
 *   capabilities/<Capability.Name>/capability.json
 *   capabilities/<Capability.Name>/artifact/index.ts
 *
 * Freshness is a timestamp/ETag check, not delta distribution (MVP section 8).
 * When the network is unavailable CFCM falls back to the cached index and
 * reports itself stale rather than failing.
 */

import { join, resolve } from "@std/path";
import { CfcmError } from "../types.ts";
import type { CapabilityDescriptor, IndexRecord, RegistryIndex } from "../types.ts";
import type { CapabilitySource, SourceStatus } from "./mod.ts";
import { ensureDir, paths } from "../util/paths.ts";
import { sha256Text } from "../util/hash.ts";

interface CachedIndex {
  etag: string | null;
  fetchedAt: string;
  index: RegistryIndex;
}

export class RegistrySource implements CapabilitySource {
  readonly id = "capfoundry-registry";
  readonly namespaceType = "public" as const;
  status: SourceStatus = "ok";
  statusDetail?: string;

  private readonly remote: boolean;

  constructor(private readonly base: string) {
    this.remote = /^https?:\/\//.test(base);
  }

  private childUrl(relative: string): string {
    if (this.remote) return `${this.base.replace(/\/$/, "")}/${relative}`;
    return resolve(join(this.base, relative));
  }

  private async cacheFile(): Promise<string> {
    const key = (await sha256Text(this.base)).slice(0, 16);
    return join(paths.indexCache(), `${key}.json`);
  }

  private async readCache(): Promise<CachedIndex | null> {
    try {
      return JSON.parse(await Deno.readTextFile(await this.cacheFile()));
    } catch {
      return null;
    }
  }

  private async writeCache(entry: CachedIndex): Promise<void> {
    await ensureDir(paths.indexCache());
    await Deno.writeTextFile(await this.cacheFile(), JSON.stringify(entry));
  }

  async freshness(): Promise<string | null> {
    // A remote base would need a round trip per search, which is the opposite
    // of what this is for. Remote staleness stays the ETag check in load().
    if (this.remote) return null;
    try {
      const stat = await Deno.stat(this.childUrl("registry/index.json"));
      return `${stat.mtime?.getTime() ?? 0}:${stat.size}`;
    } catch {
      return "missing";
    }
  }

  async load(): Promise<IndexRecord[]> {
    const cached = await this.readCache();

    if (!this.remote) {
      const text = await Deno.readTextFile(this.childUrl("registry/index.json"));
      this.status = "ok";
      return this.stamp(JSON.parse(text) as RegistryIndex);
    }

    try {
      const headers: HeadersInit = cached?.etag ? { "If-None-Match": cached.etag } : {};
      const res = await fetch(this.childUrl("registry/index.json"), { headers });

      if (res.status === 304 && cached) {
        this.status = "ok";
        return this.stamp(cached.index);
      }
      if (!res.ok) throw new Error(`registry responded ${res.status}`);

      const index = await res.json() as RegistryIndex;
      await this.writeCache({
        etag: res.headers.get("etag"),
        fetchedAt: new Date().toISOString(),
        index,
      });
      this.status = "ok";
      return this.stamp(index);
    } catch (err) {
      if (cached) {
        // Offline is a normal state for a local-first tool. Serve what we have
        // and say so, rather than pretending the registry is empty.
        this.status = "stale";
        this.statusDetail = `using cached index from ${cached.fetchedAt}: ${
          (err as Error).message
        }`;
        return this.stamp(cached.index);
      }
      this.status = "unavailable";
      this.statusDetail = `registry unreachable and nothing cached: ${(err as Error).message}`;
      return [];
    }
  }

  /** Registry records are public by definition, whatever the file claims. */
  private stamp(index: RegistryIndex): IndexRecord[] {
    return index.capabilities.map((r) => ({ ...r, namespaceType: "public" as const }));
  }

  private async readRelative(relative: string): Promise<Uint8Array> {
    if (!this.remote) return await Deno.readFile(this.childUrl(relative));
    const res = await fetch(this.childUrl(relative));
    if (!res.ok) {
      throw new CfcmError("FETCH_FAILED", `registry responded ${res.status} for ${relative}`);
    }
    return new Uint8Array(await res.arrayBuffer());
  }

  async describe(record: IndexRecord): Promise<CapabilityDescriptor> {
    const bytes = await this.readRelative(`${record.cfpLocation}/capability.json`);
    return JSON.parse(new TextDecoder().decode(bytes)) as CapabilityDescriptor;
  }

  readArtifact(record: IndexRecord): Promise<Uint8Array> {
    return this.readRelative(record.artifactLocation);
  }
}
