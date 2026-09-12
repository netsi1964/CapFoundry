/**
 * The evaluation report (PRD-FEAT-015.5).
 *
 * Written to be read by someone deciding whether to continue, and that
 * governs every choice in here. The report states what was not measured as
 * prominently as what was, separates a control that lost from a control that
 * could not play, and ends on MVP section 27's seven falsification conditions
 * rather than on a summary — because a report that only presents favourable
 * numbers is not evidence, it is advocacy.
 */

import type { Condition, RunResult } from "./harness.ts";
import type { Scenario } from "./types.ts";

interface Aggregate {
  runs: number;
  failed: number;
  correct: number;
  correctRate: number;
  medianDurationMs: number | null;
  medianOutputTokens: number | null;
  totalCostUsd: number | null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function aggregate(results: RunResult[]): Aggregate {
  // Failed runs are counted and then excluded from the averages. A timeout is
  // not a slow success and not a zero-token answer; averaging it in would
  // quietly flatter whichever condition crashed more.
  const usable = results.filter((r) => !r.run.failed);
  const costs = usable.map((r) => r.run.costUsd).filter((c): c is number => c !== null);

  return {
    runs: results.length,
    failed: results.length - usable.length,
    correct: usable.filter((r) => r.correct).length,
    correctRate: usable.length === 0 ? 0 : usable.filter((r) => r.correct).length / usable.length,
    medianDurationMs: median(usable.map((r) => r.run.durationMs)),
    medianOutputTokens: median(
      usable.map((r) => r.run.outputTokens).filter((t): t is number => t !== null),
    ),
    totalCostUsd: costs.length === 0 ? null : costs.reduce((a, b) => a + b, 0),
  };
}

function pct(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

function ms(value: number | null): string {
  return value === null ? "—" : `${(value / 1000).toFixed(1)} s`;
}

export function buildReport(
  results: RunResult[],
  scenarios: Scenario[],
  meta: { driver: string; repetitions: number; startedAt: string },
): string {
  const byId = new Map(scenarios.map((s) => [s.id, s]));
  const of = (id: string, condition: Condition) =>
    results.filter((r) => r.scenario === id && r.condition === condition);

  const comparable = scenarios.filter((s) => (s.control ?? "comparable") === "comparable");
  const impossible = scenarios.filter((s) => s.control === "cannot-succeed");

  const lines: string[] = [];
  const push = (...l: string[]) => lines.push(...l);

  push(`# Evaluation run — ${meta.startedAt}`);
  push("");
  push(
    `Driver \`${meta.driver}\` · ${meta.repetitions} repetition(s) per condition · ` +
      `${scenarios.length} scenarios · ${results.length} runs`,
  );
  push("");

  if (meta.driver === "mock") {
    push(
      "> **This run proves the harness, not CapFoundry.** The mock driver returns scripted",
      "> answers, so every number below describes the measurement machinery. A real verdict",
      "> needs `--driver claude-code`.",
      "",
    );
  }

  // ---- correctness, on scenarios both conditions could attempt ----
  push("## Correctness where both conditions could compete");
  push("");
  push("| Scenario | CapFoundry | Control | Behaviour as expected |");
  push("|---|---|---|---|");

  for (const scenario of comparable) {
    const a = aggregate(of(scenario.id, "capfoundry"));
    const b = aggregate(of(scenario.id, "control"));
    const behaviour = of(scenario.id, "capfoundry").filter((r) => r.behaviourMatched !== null);
    const matched = behaviour.filter((r) => r.behaviourMatched).length;
    const behaviourCell = behaviour.length === 0
      ? "—"
      : `${matched}/${behaviour.length}${matched === behaviour.length ? " ✅" : " ⚠️"}`;

    push(
      `| \`${scenario.id}\` | ${pct(a.correctRate)} (${a.correct}/${a.runs - a.failed}) ` +
        `| ${pct(b.correctRate)} (${b.correct}/${b.runs - b.failed}) | ${behaviourCell} |`,
    );
  }
  push("");

  // ---- the distinction Marie asked for ----
  if (impossible.length > 0) {
    push("## Scenarios the control cannot answer at all");
    push("");
    push(
      "These are **not** performance results. The control fails because the data does not exist",
      "outside CFCM, which is the claim OBJ-6 makes. Counting them as wins would be counting the",
      "premise as evidence for itself.",
      "",
    );
    push("| Scenario | CapFoundry | Control | Why the control cannot succeed |");
    push("|---|---|---|---|");
    for (const scenario of impossible) {
      const a = aggregate(of(scenario.id, "capfoundry"));
      const b = aggregate(of(scenario.id, "control"));
      push(
        `| \`${scenario.id}\` | ${pct(a.correctRate)} | ${pct(b.correctRate)} | ` +
          `${scenario.controlReason ?? "—"} |`,
      );
    }
    push("");
  }

  // ---- cost of the loop ----
  const allA = aggregate(results.filter((r) => r.condition === "capfoundry"));
  const allB = aggregate(results.filter((r) => r.condition === "control"));

  push("## What the loop cost");
  push("");
  push("| | CapFoundry | Control |");
  push("|---|---|---|");
  push(`| Median wall clock | ${ms(allA.medianDurationMs)} | ${ms(allB.medianDurationMs)} |`);
  push(
    `| Median output tokens | ${allA.medianOutputTokens ?? "—"} | ${
      allB.medianOutputTokens ?? "—"
    } |`,
  );
  push(
    `| Total cost | ${allA.totalCostUsd === null ? "—" : `$${allA.totalCostUsd.toFixed(2)}`} ` +
      `| ${allB.totalCostUsd === null ? "—" : `$${allB.totalCostUsd.toFixed(2)}`} |`,
  );
  push(`| Runs that failed outright | ${allA.failed} | ${allB.failed} |`);
  push("");
  push(
    "Failed runs are excluded from the medians rather than counted as zero. A timeout is not a",
    "fast answer and not a cheap one.",
    "",
  );

  // ---- objectives ----
  push("## Objectives");
  push("");
  push("| Objective | Scenarios | Verdict |");
  push("|---|---|---|");

  const objectives = [...new Set(scenarios.flatMap((s) => s.objectives))].sort();
  for (const objective of objectives) {
    const relevant = scenarios.filter((s) => s.objectives.includes(objective));
    const runs = relevant.flatMap((s) => of(s.id, "capfoundry")).filter((r) => !r.run.failed);
    const behaviourOk = runs.filter((r) => r.behaviourMatched !== false).length;
    const verdict = runs.length === 0
      ? "⬜ not measured"
      : behaviourOk === runs.length
      ? "✅ as expected"
      : `⚠️ ${runs.length - behaviourOk} of ${runs.length} runs diverged`;
    push(`| ${objective} | ${relevant.map((s) => `\`${s.id}\``).join(", ")} | ${verdict} |`);
  }
  push("");

  const untested = ["OBJ-1", "OBJ-2", "OBJ-3", "OBJ-4", "OBJ-5", "OBJ-6", "OBJ-7"]
    .filter((o) => !objectives.includes(o as never));
  if (untested.length > 0) {
    push(`**Not covered by any scenario:** ${untested.join(", ")}.`);
    push("");
  }
  push(
    "OBJ-8 — whether candidates get reused enough to compound — cannot be measured in this",
    "project's time horizon and is deferred rather than passed. No verdict should be inferred",
    "from its absence.",
    "",
  );

  // ---- the thing the report exists for ----
  push("## Falsification (MVP §27)");
  push("");
  push(
    "The MVP is allowed to fail. These are the conditions written down before any code existed.",
    "",
  );
  push("| # | Condition | Evidence here |");
  push("|---|---|---|");

  const nearMiss = results.filter((r) =>
    r.condition === "capfoundry" && byId.get(r.scenario)?.objectives.includes("OBJ-2")
  );
  const wrongBehaviour = nearMiss.filter((r) => r.behaviourMatched === false).length;
  const comparableA = aggregate(comparable.flatMap((s) => of(s.id, "capfoundry")));
  const comparableB = aggregate(comparable.flatMap((s) => of(s.id, "control")));

  push(
    `| 1 | Agents rarely find useful matches | ${pct(comparableA.correctRate)} correct with CFCM |`,
  );
  push(
    `| 2 | Local search costs more than it returns | median ${ms(comparableA.medianDurationMs)} ` +
      `vs ${ms(comparableB.medianDurationMs)} |`,
  );
  push(
    `| 3 | Wrong matches degrade quality | ${wrongBehaviour} of ${nearMiss.length} near-miss runs ` +
      `behaved wrongly |`,
  );
  push("| 4 | Artifact distribution is cumbersome | see `custom-element-artifact` |");
  push("| 5 | Candidates are mostly noise | see `candidate-worthy`, `candidate-not-worthy` |");
  push("| 6 | Approved candidates are rarely reused | ⛔ out of scope — OBJ-8 |");
  push(
    `| 7 | **Direct generation stays cheaper and equally reliable** | ` +
      `${pct(comparableA.correctRate)} vs ${pct(comparableB.correctRate)} correct, ` +
      `${allA.totalCostUsd === null ? "—" : `$${allA.totalCostUsd.toFixed(2)}`} vs ` +
      `${allB.totalCostUsd === null ? "—" : `$${allB.totalCostUsd.toFixed(2)}`} |`,
  );
  push("");
  push(
    "Condition 7 is the one that matters. Everything above it can pass while it fails.",
    "",
  );

  // ---- every failure, named ----
  const failures = results.filter((r) => !r.correct);
  if (failures.length > 0) {
    push("## Every run that did not pass");
    push("");
    for (const f of failures) {
      const why = f.run.failed ? (f.run.timedOut ? "timed out" : "agent failed") : f.detail;
      push(`- \`${f.scenario}\` · ${f.condition} · run ${f.repetition} — ${why}`);
      if (f.behaviourMatched === false) push(`  - CFCM behaviour: ${f.behaviourDetail}`);
    }
    push("");
  }

  return lines.join("\n");
}
