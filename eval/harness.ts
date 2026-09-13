#!/usr/bin/env -S deno run -A
/**
 * The A/B harness (PRD-FEAT-015.2 to .6).
 *
 * Runs every scenario in both conditions and reports what happened. This is
 * the feature the MVP exists to produce: the seven exit criteria are claims
 * until something measures them, and MVP section 27 cannot be enforced against
 * an impression.
 *
 * Three properties it will not trade away:
 *
 *  - **Correctness is judged identically in both conditions.** assert.ts runs
 *    the same way with and without CFCM, and never sees whether CFCM was on.
 *    Expected CFCM behaviour is evaluated for condition A only, because
 *    condition B has no CFCM to behave.
 *  - **Nothing is scored by a model.** A scenario that cannot be scored
 *    deterministically is not ready to be a scenario.
 *  - **A failed run is recorded, never averaged.** A timeout is not a zero,
 *    and rolling it in as one is how a broken harness reports a result.
 */

import { basename, join } from "@std/path";
import { copy, exists } from "@std/fs";
import type { AssertionContext, Objective, Scenario } from "./types.ts";
import type { AgentDriver, AgentRun } from "./drivers.ts";
import { ClaudeCodeDriver, MockDriver } from "./drivers.ts";
import type { TelemetryEvent } from "../cfcm/telemetry/telemetry.ts";

export type Condition = "capfoundry" | "control";

export interface RunResult {
  scenario: string;
  condition: Condition;
  repetition: number;
  correct: boolean;
  detail: string;
  behaviourMatched: boolean | null;
  behaviourDetail: string;
  run: AgentRun;
  telemetry: TelemetryEvent[];
}

const REPO_ROOT = new URL("..", import.meta.url).pathname;

async function loadScenarios(only?: string[]): Promise<{ scenario: Scenario; dir: string }[]> {
  const root = join(REPO_ROOT, "eval/scenarios");
  const out: { scenario: Scenario; dir: string }[] = [];

  for await (const entry of Deno.readDir(root)) {
    if (!entry.isDirectory || entry.name.startsWith("_")) continue;
    if (only && only.length > 0 && !only.includes(entry.name)) continue;
    const dir = join(root, entry.name);
    out.push({ scenario: JSON.parse(await Deno.readTextFile(join(dir, "scenario.json"))), dir });
  }

  return out.sort((a, b) => a.scenario.id.localeCompare(b.scenario.id));
}

async function readTelemetry(home: string): Promise<TelemetryEvent[]> {
  const dir = join(home, "telemetry");
  if (!await exists(dir)) return [];
  const events: TelemetryEvent[] = [];
  for await (const entry of Deno.readDir(dir)) {
    if (!entry.isFile || !entry.name.endsWith(".jsonl")) continue;
    for (const line of (await Deno.readTextFile(join(dir, entry.name))).split("\n")) {
      if (line.trim()) events.push(JSON.parse(line));
    }
  }
  return events.sort((a, b) => a.ts.localeCompare(b.ts));
}

/**
 * Checks what CFCM did against the scenario's `expect` block.
 *
 * Condition A only. Running it against the control would score the control as
 * failing for having no CFCM, which is not a result about anything.
 */
function checkBehaviour(
  scenario: Scenario,
  telemetry: TelemetryEvent[],
): { matched: boolean; detail: string } {
  const searches = telemetry.filter((e) => e.eventType === "search");
  const invocations = telemetry.filter((e) => e.eventType === "invoke" && e.status === "OK");
  const candidates = telemetry.filter((e) => e.eventType === "candidate" && e.status === "OK");
  const problems: string[] = [];

  const expected = scenario.expect;

  if (expected.search === "none") {
    if (searches.length > 0) problems.push(`searched ${searches.length}x when it should not have`);
  } else if (expected.search !== "any") {
    const statuses = searches.map((s) => s.status);
    if (!statuses.includes(expected.search)) {
      problems.push(`expected a ${expected.search} search, saw [${statuses.join(", ") || "none"}]`);
    }
  }

  if (expected.capability) {
    const used = invocations.map((i) => i.capability);
    if (expected.invoked !== false && !used.includes(expected.capability)) {
      problems.push(
        `expected ${expected.capability} to run, ran [${used.join(", ") || "nothing"}]`,
      );
    }
  }

  if (expected.invoked === false && invocations.length > 0) {
    problems.push(`ran ${invocations.map((i) => i.capability).join(", ")} when it should not have`);
  }

  if (expected.candidateSubmitted === true && candidates.length === 0) {
    problems.push("expected a candidate, none was submitted");
  }
  if (expected.candidateSubmitted === false && candidates.length > 0) {
    problems.push(`submitted ${candidates.length} candidate(s) when it should not have`);
  }

  if (expected.artifactReturned === true) {
    const returned = invocations.some((i) =>
      i.returnMode === "artifact" || i.returnMode === "result-and-artifact"
    );
    if (!returned) problems.push("expected an artifact to be returned, none was");
  }

  return { matched: problems.length === 0, detail: problems.join("; ") };
}

async function runOnce(
  entry: { scenario: Scenario; dir: string },
  condition: Condition,
  repetition: number,
  driver: AgentDriver,
): Promise<RunResult> {
  const { scenario, dir } = entry;

  // Fresh workspace and fresh CFCM home per run. A file left behind by one
  // condition would be an input to the other.
  const workspace = await Deno.makeTempDir({ prefix: `eval-${scenario.id}-${condition}-` });
  const cfcmHome = await Deno.makeTempDir({ prefix: `eval-home-${scenario.id}-` });

  let keep = false;

  try {
    const fixtures = join(dir, "fixtures");
    if (await exists(fixtures)) {
      for await (const file of Deno.readDir(fixtures)) {
        await copy(join(fixtures, file.name), join(workspace, file.name));
      }
    }

    const run = await driver.run({
      prompt: await Deno.readTextFile(join(dir, "prompt.md")),
      workspace,
      cfcmEnabled: condition === "capfoundry",
      timeoutSeconds: scenario.timeoutSeconds ?? 300,
      cfcmHome,
    });

    const telemetry = condition === "capfoundry" ? await readTelemetry(cfcmHome) : [];

    // The assertion never learns which condition it is in.
    const context: AssertionContext = { workspace, transcript: run.transcript, telemetry };
    const assertion = (await import(`${join(dir, "assert.ts")}`)).default;
    const verdict = run.failed
      ? { pass: false, detail: run.timedOut ? "timed out" : "agent run failed" }
      : await assertion(context);

    const behaviour = condition === "capfoundry" && !run.failed
      ? checkBehaviour(scenario, telemetry)
      : null;

    keep = !verdict.pass;

    return {
      scenario: scenario.id,
      condition,
      repetition,
      correct: verdict.pass,
      detail: keep ? `${verdict.detail} (workspace kept: ${workspace})` : verdict.detail,
      behaviourMatched: behaviour?.matched ?? null,
      behaviourDetail: behaviour?.detail ?? "",
      run,
      telemetry,
    };
  } finally {
    // Kept when the run did not pass. Deleting it destroyed the only evidence
    // of what the agent actually did: Marie could see what the claude-code
    // driver had *not* written, never what it had tried, and had to spend a
    // separate experiment to find out.
    if (!keep) {
      await Deno.remove(workspace, { recursive: true }).catch(() => {});
      await Deno.remove(cfcmHome, { recursive: true }).catch(() => {});
    }
  }
}

export async function runHarness(options: {
  driver: AgentDriver;
  /** Unused by the runner; the driver already holds it. Kept so callers read the same. */
  configPath?: string;
  repetitions: number;
  only?: string[];
  onProgress?: (result: RunResult) => void;
}): Promise<{ results: RunResult[]; scenarios: Scenario[] }> {
  const entries = await loadScenarios(options.only);
  const results: RunResult[] = [];

  for (const entry of entries) {
    for (const condition of ["capfoundry", "control"] as Condition[]) {
      // A scenario the control cannot answer is still run, so the report can
      // show it failed rather than assume it.
      for (let i = 1; i <= options.repetitions; i++) {
        const result = await runOnce(entry, condition, i, options.driver);
        results.push(result);
        options.onProgress?.(result);
      }
    }
  }

  return { results, scenarios: entries.map((e) => e.scenario) };
}

export { basename as _basename, checkBehaviour, ClaudeCodeDriver, loadScenarios, MockDriver };
export type { AgentDriver, AgentRun, Objective, Scenario };
