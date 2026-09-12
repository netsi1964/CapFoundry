/**
 * CFCM core: the object every surface (MCP server, CLI, eval harness) talks to.
 *
 * Keeping orchestration here rather than in the MCP layer is what makes the
 * A/B control group a configuration difference instead of a second code path
 * (AD-1): the harness drives exactly the same object the agent does.
 */

import { CfcmError } from "./types.ts";
import type {
  CapabilityDescriptor,
  CfcmConfig,
  IndexRecord,
  InvocationRequest,
  InvocationResult,
  ReturnMode,
  SearchResult,
} from "./types.ts";
import { loadConfig } from "./config/config.ts";
import { SearchEngine } from "./search/engine.ts";
import { tokenize } from "./search/tokenize.ts";
import { RegistrySource } from "./sources/registry.ts";
import { FilesystemSource } from "./sources/filesystem.ts";
import { createLocalSource } from "./sources/local.ts";
import type { CapabilitySource } from "./sources/mod.ts";
import { ArtifactCache } from "./cache/cache.ts";
import { Resolver } from "./resolver/resolver.ts";
import { execute } from "./runtime/execute.ts";
import { computeGrant } from "./runtime/permissions.ts";
import { Telemetry } from "./telemetry/telemetry.ts";
import { formatIssues, validate } from "./util/json_schema.ts";
import { CandidateQueue } from "./candidates/candidates.ts";
import type { CandidateInput, NearestExisting, SubmitResult } from "./candidates/candidates.ts";

export interface SourceReport {
  id: string;
  namespaceType: string;
  status: string;
  detail?: string;
  capabilities: number;
}

export interface CfcmOptions {
  config?: CfcmConfig;
  configPath?: string;
  /** Overrides the built-in Local.* directory. Used by tests. */
  localRoot?: string;
}

export class Cfcm {
  private records: IndexRecord[] = [];
  private sourceByName = new Map<string, CapabilitySource>();
  private recordByName = new Map<string, IndexRecord>();
  private engine: SearchEngine | null = null;
  private reports: SourceReport[] = [];
  private readonly resolver: Resolver;
  readonly telemetry: Telemetry;
  readonly candidates: CandidateQueue;

  private constructor(readonly config: CfcmConfig, private readonly sources: CapabilitySource[]) {
    this.resolver = new Resolver(new ArtifactCache());
    this.telemetry = new Telemetry(config.telemetry);
    this.candidates = new CandidateQueue();
  }

  static async create(opts: CfcmOptions = {}): Promise<Cfcm> {
    const config = opts.config ?? (await loadConfig(opts.configPath)).config;

    const sources: CapabilitySource[] = [];
    if (config.capfoundry.enabled && config.capfoundry.registry) {
      sources.push(new RegistrySource(config.capfoundry.registry));
    }
    for (const ns of config.namespaces) {
      sources.push(new FilesystemSource(ns.name, ns.source.path, "private", ns.name));
    }
    sources.push(createLocalSource(opts.localRoot));

    const cfcm = new Cfcm(config, sources);
    await cfcm.reload();
    return cfcm;
  }

  /** Loads every source into one search space (OBJ-6). */
  async reload(): Promise<void> {
    this.records = [];
    this.sourceByName.clear();
    this.recordByName.clear();
    this.reports = [];

    for (const source of this.sources) {
      let loaded: IndexRecord[] = [];
      try {
        loaded = await source.load();
      } catch (err) {
        source.status = "unavailable";
        source.statusDetail = (err as Error).message;
      }

      for (const record of loaded) {
        if (this.recordByName.has(record.name)) {
          // First source wins, and the shadowed one is reported rather than
          // silently dropped: a private capability quietly masking a public
          // one would be a debugging nightmare.
          this.reports.push({
            id: source.id,
            namespaceType: source.namespaceType,
            status: "shadowed",
            detail: `${record.name} is already provided by another source`,
            capabilities: 0,
          });
          continue;
        }
        this.records.push(record);
        this.recordByName.set(record.name, record);
        this.sourceByName.set(record.name, source);
      }

      this.reports.push({
        id: source.id,
        namespaceType: source.namespaceType,
        status: source.status,
        detail: source.statusDetail,
        capabilities: loaded.length,
      });
    }

    this.engine = new SearchEngine(this.records, this.config.search);
  }

  get sourceReports(): SourceReport[] {
    return this.reports;
  }

  get size(): number {
    return this.records.length;
  }

  list(): IndexRecord[] {
    return [...this.records];
  }

  async search(
    query: string,
    opts: { runtime?: string; limit?: number } = {},
  ): Promise<SearchResult> {
    if (!this.engine) throw new CfcmError("NOT_READY", "CFCM index has not been loaded");
    const result = this.engine.search({ query, runtime: opts.runtime, limit: opts.limit });

    await this.telemetry.record({
      eventType: "search",
      status: result.status,
      capability: result.candidates[0]?.record.name ?? null,
      version: result.candidates[0]?.record.version ?? null,
      namespaceType: result.candidates[0]?.record.namespaceType ?? null,
      queryTokenCount: tokenize(query).length,
      confidence: result.confidence,
      thresholds: { ...result.thresholds },
      searchMs: result.searchMs,
    });

    return result;
  }

  record(name: string): IndexRecord {
    const record = this.recordByName.get(name);
    if (!record) {
      throw new CfcmError("NOT_FOUND", `no capability named "${name}" in this CFCM index`, {
        name,
      });
    }
    return record;
  }

  async describe(name: string): Promise<CapabilityDescriptor> {
    const record = this.record(name);
    return await this.sourceByName.get(name)!.describe(record);
  }

  /**
   * Records a candidate locally (PRD-FEAT-013).
   *
   * Duplicate detection runs the candidate's own description and name through
   * the same search the agent used. If something close already exists, the
   * result carries a warning rather than a rejection: whether two capabilities
   * are really the same is a judgement, and refusing outright would lose the
   * submission along with the disagreement.
   */
  async submitCandidate(input: CandidateInput): Promise<SubmitResult> {
    let nearest: NearestExisting | null = null;

    if (this.engine) {
      // Search on what the capability does, not on the name someone proposed:
      // a novel name would otherwise hide a duplicate implementation.
      const probe = this.engine.search({
        query: `${input.description} ${(input.aliases ?? []).join(" ")}`,
        limit: 1,
      });
      if (probe.status !== "NO_MATCH" && probe.candidates.length > 0) {
        nearest = {
          name: probe.candidates[0].record.name,
          confidence: probe.confidence,
          status: probe.status,
        };
      }
    }

    try {
      const result = await this.candidates.submit(input, nearest);
      await this.telemetry.record({
        eventType: "candidate",
        status: "OK",
        capability: result.candidate.suggestedName,
        namespaceType: null,
        candidateSubmitted: true,
      });
      return result;
    } catch (err) {
      await this.telemetry.record({
        eventType: "candidate",
        status: "ERROR",
        candidateSubmitted: false,
        errorClass: err instanceof CfcmError ? err.code : (err as Error).name,
      });
      throw err;
    }
  }

  async invoke(request: InvocationRequest): Promise<InvocationResult> {
    const returnMode: ReturnMode = request.options?.return ?? "result";
    const record = this.record(request.capability);
    const source = this.sourceByName.get(record.name)!;

    if (request.version && request.version !== record.version) {
      throw new CfcmError(
        "VERSION_MISMATCH",
        `${record.name} is available at ${record.version}, not ${request.version}`,
        { capability: record.name, available: record.version, requested: request.version },
      );
    }

    try {
      const result = await this.invokeInner(request, record, source, returnMode);
      await this.telemetry.record({
        eventType: "invoke",
        status: "OK",
        capability: record.name,
        version: record.version,
        namespaceType: record.namespaceType,
        returnMode,
        artifactCacheHit: result.timings.artifactCacheHit,
        artifactFetchMs: result.timings.artifactFetchMs,
        spawnMs: result.timings.spawnMs || null,
        executionMs: result.timings.executionMs || null,
      });
      return result;
    } catch (err) {
      await this.telemetry.record({
        eventType: "invoke",
        status: "ERROR",
        capability: record.name,
        version: record.version,
        namespaceType: record.namespaceType,
        returnMode,
        errorClass: err instanceof CfcmError ? err.code : (err as Error).name,
      });
      throw err;
    }
  }

  private async invokeInner(
    request: InvocationRequest,
    record: IndexRecord,
    source: CapabilitySource,
    returnMode: ReturnMode,
  ): Promise<InvocationResult> {
    const wantsResult = returnMode === "result" || returnMode === "result-and-artifact";
    const wantsArtifact = returnMode === "artifact" || returnMode === "result-and-artifact";

    // Exposure is checked before anything is read or spawned (PRD-FEAT-007.2).
    if (wantsResult && !record.exposure.execution) {
      throw new CfcmError(
        "EXPOSURE_DENIED",
        `${record.name} does not permit execution (exposure.execution is false)`,
        { capability: record.name, policy: "exposure.execution" },
      );
    }
    if (wantsArtifact && !record.exposure.artifact) {
      throw new CfcmError(
        "EXPOSURE_DENIED",
        `${record.name} does not permit artifact return (exposure.artifact is false)`,
        { capability: record.name, policy: "exposure.artifact" },
      );
    }

    const base: InvocationResult = {
      capability: record.name,
      version: record.version,
      returnMode,
      timings: {
        resolveMs: 0,
        spawnMs: 0,
        executionMs: 0,
        artifactCacheHit: false,
        artifactFetchMs: null,
      },
    };

    // metadata never resolves or spawns anything.
    if (returnMode === "metadata") {
      const descriptor = await source.describe(record);
      return {
        ...base,
        metadata: {
          name: descriptor.name,
          version: descriptor.version,
          description: descriptor.description,
          inputSummary: descriptor.inputSummary,
          outputSummary: descriptor.outputSummary,
          effect: descriptor.effect,
          runtime: descriptor.runtime,
          exposure: descriptor.exposure,
          permissions: descriptor.permissions ?? null,
          inputSchema: descriptor.inputSchema,
          outputSchema: descriptor.outputSchema,
          namespaceType: record.namespaceType,
        },
      };
    }

    const resolveStarted = performance.now();
    const artifact = await this.resolver.resolve(record, source);
    base.timings.resolveMs = Number((performance.now() - resolveStarted).toFixed(3));
    base.timings.artifactCacheHit = artifact.cacheHit;
    base.timings.artifactFetchMs = artifact.fetchMs;

    const out: InvocationResult = { ...base };

    if (wantsResult) {
      const descriptor = await source.describe(record);

      const inputIssues = validate(request.input ?? null, descriptor.inputSchema);
      if (inputIssues.length > 0) {
        throw new CfcmError(
          "INPUT_INVALID",
          `input does not satisfy the inputSchema of ${record.name}:\n${formatIssues(inputIssues)}`,
          { capability: record.name, issues: inputIssues },
        );
      }

      // Computed before the process is spawned, so a policy refusal is a clean
      // error rather than a permission failure mid-run.
      const grant = computeGrant(record, this.config);

      const executed = await execute({
        artifactPath: artifact.path,
        input: request.input,
        grantedHosts: grant.network,
        timeoutMs: request.options?.timeoutMs ?? record.limits?.timeoutMs ??
          this.config.execution.defaultTimeoutMs,
        maxOutputBytes: record.limits?.maxOutputBytes ?? this.config.execution.maxOutputBytes,
        effect: record.effect,
        capability: record.name,
      });

      const outputIssues = validate(executed.value, descriptor.outputSchema);
      if (outputIssues.length > 0) {
        throw new CfcmError(
          "OUTPUT_INVALID",
          `${record.name} returned a value that violates its own outputSchema:\n${
            formatIssues(outputIssues)
          }`,
          { capability: record.name, issues: outputIssues },
        );
      }

      out.result = executed.value;
      out.timings.spawnMs = executed.spawnMs;
      out.timings.executionMs = executed.executionMs;
    }

    if (wantsArtifact) {
      out.artifact = {
        type: record.artifact.type,
        sha256: artifact.sha256,
        source: new TextDecoder().decode(await Deno.readFile(artifact.path)),
      };
    }

    return out;
  }
}
