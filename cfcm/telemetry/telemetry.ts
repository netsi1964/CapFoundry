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
  /** Token count only. The query text itself never leaves the caller. */
  queryTokenCount: number | null;
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

    if (this.config.local) {
      await ensureDir(this.dir);
      await Deno.writeTextFile(this.file(now), `${JSON.stringify(event)}\n`, { append: true });
    }

    if (this.config.upload && this.config.endpoint) {
      // Fire and forget: telemetry must never be able to fail an invocation or
      // add latency to it.
      fetch(this.config.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(event),
      }).catch(() => {});
    }

    return event;
  }
}
