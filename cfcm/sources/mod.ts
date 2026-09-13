/**
 * Capability sources.
 *
 * A source turns some location into index records and can hand back the bytes
 * of an artifact. CFCM merges every source into one search space (OBJ-6): the
 * only thing that distinguishes them downstream is `namespaceType`.
 */

import type { CapabilityDescriptor, IndexRecord, NamespaceType } from "../types.ts";

export type SourceStatus = "ok" | "stale" | "unavailable";

export interface CapabilitySource {
  /** Human-readable source name, used in diagnostics. */
  readonly id: string;
  readonly namespaceType: NamespaceType;
  status: SourceStatus;
  /** Why the source is stale or unavailable, if it is. */
  statusDetail?: string;
  load(): Promise<IndexRecord[]>;
  /**
   * A cheap value that changes when this source's contents change, or null
   * when the source cannot say without doing real work — a remote registry
   * would need an HTTP round trip, and that belongs at load time, not in
   * front of every search. Never parsed for meaning, only compared (F9).
   */
  freshness?(): Promise<string | null>;
  /** Full descriptor, including the schemas the index omits. */
  describe(record: IndexRecord): Promise<CapabilityDescriptor>;
  /** Raw artifact bytes. Integrity is verified by the resolver, not here. */
  readArtifact(record: IndexRecord): Promise<Uint8Array>;
}
