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
  /** Full descriptor, including the schemas the index omits. */
  describe(record: IndexRecord): Promise<CapabilityDescriptor>;
  /** Raw artifact bytes. Integrity is verified by the resolver, not here. */
  readArtifact(record: IndexRecord): Promise<Uint8Array>;
}
