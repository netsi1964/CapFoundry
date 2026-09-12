/**
 * The scenario contract for the A/B harness (PRD-FEAT-015).
 *
 * A scenario asks two separate questions, and keeping them separate is what
 * makes the harness trustworthy:
 *
 *   1. **Was the task solved?** Scenario-specific, so it is code: `assert.ts`.
 *   2. **Did CFCM behave as expected?** The same shape for all ten, so it is
 *      declarative: the `expect` block in `scenario.json`.
 *
 * Mixing them would let a scenario quietly grade itself on whether CapFoundry
 * was used rather than on whether the work came out right — which is the one
 * bias that would make the whole comparison worthless. Correctness is judged
 * identically in both conditions; only `expect` differs, and it is not
 * evaluated at all for the control run.
 *
 * No LLM judges anything. If a scenario cannot be scored deterministically it
 * is not ready to be a scenario.
 */

import type { SearchStatus } from "../cfcm/types.ts";
import type { TelemetryEvent } from "../cfcm/telemetry/telemetry.ts";

/** Which of the MVP's exit criteria this scenario feeds. */
export type Objective = "OBJ-1" | "OBJ-2" | "OBJ-3" | "OBJ-4" | "OBJ-5" | "OBJ-6" | "OBJ-7";

/**
 * Where the scenario came from.
 *
 * A set built entirely from imagination tests the search we think we built.
 * Recorded scenarios are worth more than designed ones and should say so, so a
 * later reader can weigh them differently.
 */
export type ScenarioOrigin = "recorded" | "designed";

export interface ExpectedBehaviour {
  /**
   * What search should return. "none" means no search should happen at all —
   * the scenario is testing restraint, not retrieval.
   */
  search: SearchStatus | "none" | "any";
  /** Which capability should top the results, when a match is expected. */
  capability?: string | null;
  /** Whether a capability should actually have been executed. */
  invoked?: boolean;
  /** Whether the agent should have written the code itself. */
  fellBackToGeneration?: boolean;
  /** Whether a candidate should have been offered. */
  candidateSubmitted?: boolean;
  /** Whether an artifact, rather than a result, should have been returned. */
  artifactReturned?: boolean;
}

export interface Scenario {
  id: string;
  title: string;
  /** One sentence: what would be true if this scenario failed? */
  rationale: string;
  objectives: Objective[];
  origin: ScenarioOrigin;
  /** Required when origin is "recorded": where the trace came from. */
  recordedFrom?: string;
  expect: ExpectedBehaviour;
  /** Seconds before the run is abandoned. Keep generous; a timeout is not a result. */
  timeoutSeconds?: number;
}

/** What an assertion gets to look at. */
export interface AssertionContext {
  /**
   * Directory the agent worked in.
   *
   * The harness creates it fresh per run and copies the scenario's `fixtures/`
   * into it first, so a scenario that needs a CSV or a sample document refers
   * to it by plain relative path and the agent finds it where a user would
   * have put it. Nothing else is placed there, and it is not reused between
   * the two conditions — a file left behind by condition A would be an input
   * to condition B, which is the sort of contamination that produces a result
   * nobody can explain.
   */
  workspace: string;
  /** Everything the agent said and did, as plain text. */
  transcript: string;
  /**
   * CFCM telemetry for this run. Empty in the control condition, which is why
   * a correctness assertion must never read it.
   */
  telemetry: TelemetryEvent[];
}

export interface AssertionResult {
  pass: boolean;
  /** Shown in the report when it fails. Say what was expected and what happened. */
  detail: string;
}

/**
 * A scenario's assert.ts default export.
 *
 * Judge the work, not the route. Reading `telemetry` here would score the
 * control condition as failing for the wrong reason — it is provided only so
 * an assertion can report context alongside a genuine correctness failure.
 */
export type Assertion = (ctx: AssertionContext) => AssertionResult | Promise<AssertionResult>;
