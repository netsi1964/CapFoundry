/**
 * Local-first telemetry (PRD-FEAT-009, AD-5).
 *
 * The invariant that matters more than any field here: a telemetry line never
 * contains capability input or output, not even inside an error. The writer
 * accepts a fixed record shape rather than an open object precisely so that a
 * future caller cannot casually pass a payload through. tests/telemetry_test.ts
 * greps a full run to prove it.
 */

import { join } from "@std/path";
import { ensureDir, paths } from "../util/paths.ts";
import type { NamespaceType, ReturnMode, SearchStatus, TelemetryConfig } from "../types.ts";

export const CFCM_VERSION = "0.1.0";

export interface TelemetryEvent {
  ts: string;
  cfcmVersion: string;
  eventType: "search" | "invoke" | "candidate";
  capability: string | null;
  version: string | null;
  namespaceType: NamespaceType | null;
  queryTokenCount: number | null;
  /**
   * The search query, recorded locally and stripped before upload.
   *
   * MVP section 20 asks Explore to show repeated NO_MATCH grouped, which is
   * the single most valuable thing telemetry can produce: demand for a
   * capability that does not exist. Grouping needs the text — a token count
   * cannot tell you *what* is missing, and a hash can group repeats but not
   * be read.
   *
   * A query is not capability input. "calculate distance between coordinates"
   * is a feature request; the coordinates are the payload, and those are still
   * never recorded. But a query can carry context all the same — "look up
   * customer C-1002 in our CRM" — so it stays on the machine that asked it.
   * The local log is deliberately richer than anything that leaves.
   *
   * **Off by default**, and deliberately so. The harm is asymmetric: recording
   * when we should not is silent and permanent — this log appends forever and
   * has no retention policy — while not recording costs one page section,
   * which is visible and recoverable. A default that can only be discovered by
   * reading config.ts is not a default anyone chose.
   *
   * Turn it on with telemetry.logQueryText when you want to see what people
   * are asking for that does not exist. The aggregator says so at the moment
   * it would have been useful, rather than leaving you to find the setting.
   */
  queryText: string | null;
  status: SearchStatus | "OK" | "ERROR";
  confidence: number | null;
  thresholds: Record<string, number> | null;
  searchMs: number | null;
  artifactCacheHit: boolean | null;
  artifactFetchMs: number | null;
  spawnMs: number | null;
  executionMs: number | null;
  returnMode: ReturnMode | null;
  fellBackToGeneration: boolean | null;
  candidateSubmitted: boolean | null;
  /** An error *class*, never a message: messages can quote input. */
  errorClass: string | null;
}

export type TelemetryInput =
  & Partial<Omit<TelemetryEvent, "ts" | "cfcmVersion" | "eventType" | "status">>
  & Pick<TelemetryEvent, "eventType" | "status">;

const EMPTY: Omit<TelemetryEvent, "ts" | "cfcmVersion" | "eventType" | "status"> = {
  capability: null,
  version: null,
  namespaceType: null,
  queryTokenCount: null,
  queryText: null,
  confidence: null,
  thresholds: null,
  searchMs: null,
  artifactCacheHit: null,
  artifactFetchMs: null,
  spawnMs: null,
  executionMs: null,
  returnMode: null,
  fellBackToGeneration: null,
  candidateSubmitted: null,
  errorClass: null,
};

export class Telemetry {
  constructor(
    private readonly config: TelemetryConfig,
    private readonly dir: string = paths.telemetry(),
  ) {}

  private file(now: Date): string {
    return join(this.dir, `${now.toISOString().slice(0, 10)}.jsonl`);
  }

  async record(input: TelemetryInput): Promise<TelemetryEvent> {
    const now = new Date();
    const event: TelemetryEvent = {
      ...EMPTY,
      ...input,
      ts: now.toISOString(),
      cfcmVersion: CFCM_VERSION,
    };

    if (!this.config.logQueryText) event.queryText = null;

    if (this.config.local) {
      await ensureDir(this.dir);
      await Deno.writeTextFile(this.file(now), `${JSON.stringify(event)}\n`, { append: true });
    }

    if (this.config.upload && this.config.endpoint) {
      // The asymmetry is the whole design: what is kept locally is richer than
      // what leaves. Stripping here rather than at the call site means a
      // future field cannot reach the network by someone forgetting.
      const { queryText: _queryText, ...uploadable } = event;

      // Fire and forget: telemetry must never be able to fail an invocation or
      // add latency to it.
      fetch(this.config.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(uploadable),
      }).catch(() => {});
    }

    return event;
  }
}
