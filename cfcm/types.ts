/**
 * Shared CapFoundry types.
 *
 * The shapes here are the on-disk and on-the-wire contract described in
 * PRD-SEC-005. Changing a required field is a `schemaVersion` bump.
 */

export const CAPABILITY_SCHEMA_VERSION = 1 as const;

export type Effect = "PURE" | "READ" | "WRITE" | "NETWORK";
export type NamespaceType = "public" | "private" | "local";
export type ReturnMode = "result" | "artifact" | "result-and-artifact" | "metadata";
export type SearchStatus = "MATCH" | "PARTIAL_MATCH" | "NO_MATCH";

/** A JSON Schema subset. See cfcm/util/json_schema.ts for what is enforced. */
// deno-lint-ignore no-explicit-any
export type JsonSchema = Record<string, any>;

/** capability.json — the full descriptor inside a CFP. */
export interface CapabilityDescriptor {
  schemaVersion: 1;
  name: string;
  version: string;
  description: string;
  aliases: string[];
  exampleQueries: string[];
  tags?: string[];
  inputSummary: string;
  outputSummary: string;
  runtime: "deno";
  effect: Effect;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  artifact: {
    type: "typescript";
    entrypoint: string;
    sha256: string;
  };
  exposure: {
    execution: boolean;
    artifact: boolean;
  };
  /**
   * What the capability declares it needs. Required when effect is NETWORK.
   *
   * A declaration is a request, never a grant: CFCM intersects it with local
   * policy before anything runs. A capability that could permit itself would
   * be self-certifying, which is not a permission model.
   */
  permissions?: {
    network?: string[];
  };
  limits?: {
    timeoutMs?: number;
    maxOutputBytes?: number;
  };
  tests: string;
}

/**
 * The compact record CFCM searches over.
 *
 * Deliberately excludes inputSchema, outputSchema and tests: those are fetched
 * on describe or invoke, which is what keeps the index small enough to ship in
 * one request (MVP section 8).
 */
export interface IndexRecord {
  schemaVersion: 1;
  name: string;
  version: string;
  description: string;
  aliases: string[];
  exampleQueries: string[];
  tags: string[];
  inputSummary: string;
  outputSummary: string;
  runtime: "deno";
  effect: Effect;
  artifact: {
    type: "typescript";
    sha256: string;
  };
  exposure: {
    execution: boolean;
    artifact: boolean;
  };
  /** Carried into the index so a caller can see where a capability would reach. */
  permissions?: {
    network?: string[];
  };
  limits?: {
    timeoutMs?: number;
    maxOutputBytes?: number;
  };
  /** CFP directory, relative to the source that produced this record. */
  cfpLocation: string;
  /** Artifact entrypoint, relative to the source that produced this record. */
  artifactLocation: string;
  /** Set by the source that loaded the record, never by the descriptor itself. */
  namespaceType: NamespaceType;
  indexedAt: string;
}

/** registry/index.json */
export interface RegistryIndex {
  schemaVersion: 1;
  generatedAt: string;
  capabilities: IndexRecord[];
}

export interface SearchThresholds {
  matchThreshold: number;
  partialThreshold: number;
  coverageWeight: number;
  marginWeight: number;
}

export interface NetworkPolicy {
  /** Master switch. Off by default: no machine gains network capabilities by upgrading. */
  enabled: boolean;
  /** Hosts this machine permits, before any capability's own declaration. */
  allow: string[];
}

export interface ExecutionLimits {
  defaultTimeoutMs: number;
  maxOutputBytes: number;
  network: NetworkPolicy;
}

export interface TelemetryConfig {
  local: boolean;
  upload: boolean;
  endpoint: string | null;
  /** Record the search query in the local log. Never uploaded either way. */
  logQueryText: boolean;
}

export interface NamespaceConfig {
  name: string;
  type: "private";
  source: { type: "filesystem"; path: string };
  permissions?: {
    network?: string[];
    secrets?: string[];
    filesystem?: string[];
  };
}

export interface CfcmConfig {
  capfoundry: { registry: string | null; enabled: boolean };
  search: SearchThresholds;
  execution: ExecutionLimits;
  telemetry: TelemetryConfig;
  namespaces: NamespaceConfig[];
}

/** Which query tokens hit which fields, so a human can explain a score. */
export interface MatchEvidence {
  field: string;
  tokens: string[];
}

export interface SearchCandidate {
  record: IndexRecord;
  score: number;
  evidence: MatchEvidence[];
}

export interface SearchResult {
  status: SearchStatus;
  confidence: number;
  candidates: SearchCandidate[];
  searchMs: number;
  thresholds: SearchThresholds;
}

export interface InvocationRequest {
  capability: string;
  version?: string;
  input?: unknown;
  options?: { return?: ReturnMode; timeoutMs?: number };
}

export interface InvocationResult {
  capability: string;
  version: string;
  returnMode: ReturnMode;
  result?: unknown;
  artifact?: { type: string; sha256: string; source: string };
  metadata?: Record<string, unknown>;
  timings: {
    resolveMs: number;
    spawnMs: number;
    executionMs: number;
    artifactCacheHit: boolean;
    artifactFetchMs: number | null;
  };
}

export class CfcmError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "CfcmError";
  }
}
