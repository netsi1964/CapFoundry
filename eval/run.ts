#!/usr/bin/env -S deno run -A
/**
 * `deno task eval` — the entry point.
 *
 * Defaults to the mock driver. Spending money should be something you asked
 * for, and a harness whose default run costs nothing is one people will
 * actually run before the expensive one.
 */

import { join } from "@std/path";
import { runHarness } from "./harness.ts";
import { ClaudeCodeDriver, MockDriver } from "./drivers.ts";
import { buildReport } from "./report.ts";

const REPO_ROOT = new URL("..", import.meta.url).pathname;

function option(name: string, fallback: string): string {
  const i = Deno.args.indexOf(`--${name}`);
  return i === -1 ? fallback : (Deno.args[i + 1] ?? fallback);
}

const driverName = option("driver", "mock");
const repetitions = Number(option("n", "1"));
const only = option("only", "").split(",").filter(Boolean);
const configPath = option("config", join(REPO_ROOT, "cfcm.json"));

// Answers as a competent agent would give them, so the machinery can be
// exercised end to end. It deliberately does NOT simulate CFCM being used —
// the mock cannot call an MCP server, so behaviour checks come back empty and
// the report says the run proves the harness rather than the idea.
const mock = new MockDriver((o) => ({
  transcript: o.cfcmEnabled
    ? "Used an existing capability and returned the result."
    : "Wrote the code myself and returned the result.",
  outputTokens: o.cfcmEnabled ? 120 : 400,
  durationMs: o.cfcmEnabled ? 4000 : 9000,
  costUsd: o.cfcmEnabled ? 0.04 : 0.09,
}));

const driver = driverName === "claude-code" ? new ClaudeCodeDriver(REPO_ROOT, configPath) : mock;

if (driverName === "claude-code") {
  console.error(
    `Running ${repetitions} repetition(s) of each scenario in both conditions with a real agent.\n` +
      "This spends tokens. Ctrl-C now if that was not intended.\n",
  );
}

const startedAt = new Date().toISOString();
const { results, scenarios } = await runHarness({
  driver,
  configPath,
  repetitions,
  only,
  onProgress: (r) => {
    const mark = r.run.failed ? "!" : r.correct ? "✓" : "✗";
    const behaviour = r.behaviourMatched === false ? "  behaviour: " + r.behaviourDetail : "";
    console.error(
      `  ${mark} ${r.scenario.padEnd(26)} ${r.condition.padEnd(11)} #${r.repetition}${behaviour}`,
    );
  },
});

const report = buildReport(results, scenarios, {
  driver: driver.id,
  repetitions,
  startedAt,
});

const outDir = join(REPO_ROOT, "eval/reports");
await Deno.mkdir(outDir, { recursive: true });
const path = join(outDir, `${startedAt.replace(/[:.]/g, "-")}.md`);
await Deno.writeTextFile(path, `${report}\n`);

console.error(`\n✓ ${path}`);
