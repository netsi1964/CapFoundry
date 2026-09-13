/**
 * Couples the PRD's delivery markers to the evidence behind them.
 *
 * PRD-FEAT-015 is the case that motivated this. Its acceptance criterion is
 * that `deno task eval` produces a report — and two reports existed, both from
 * the mock driver, whose own first paragraph says they prove the harness
 * rather than CapFoundry. A checker asking "does a report exist" would have
 * ticked it.
 *
 * I claimed no guard could have caught that. Marie pointed out the reports
 * carry `Driver \`mock\`` in their header, which is mechanical and already in
 * the artifact, and she was right. The non-automatable part was never the
 * check — it was knowing that `driver` is the field that decides the question.
 *
 * So the marker is now unfalsifiable by hand: it cannot be added until a real
 * run exists to justify it.
 */

import { assert } from "@std/assert";
import { join } from "@std/path";
import { exists } from "@std/fs";

const REPO_ROOT = new URL("..", import.meta.url).pathname;

/**
 * Committed reports produced by anything other than the mock driver.
 *
 * Committed, not merely present. eval/reports/*.md is gitignored, and the
 * first version of this test read the directory — so it passed on a fresh
 * clone and failed on any machine where someone had run the harness. A test
 * whose verdict depends on scratch files is not guarding a public claim.
 *
 * It also turned out to be the wrong question one level down. The first real
 * claude-code run came from a driver that could neither write files nor call
 * MCP tools, and read 0% correct in both arms: a real-driver report that is
 * not a valid result. Distinguishing mock from real was not enough; the report
 * that justifies marking PRD-FEAT-015 delivered is one someone chose to commit
 * as evidence, which is what Phase 5 produces.
 */
async function committedRealReports(): Promise<string[]> {
  const listed = new Deno.Command("git", {
    args: ["ls-files", "eval/reports/"],
    cwd: REPO_ROOT,
    stdout: "piped",
    stderr: "null",
  });
  const out = await listed.output();
  if (!out.success) return [];

  const real: string[] = [];
  for (const path of new TextDecoder().decode(out.stdout).split("\n")) {
    if (!path.endsWith(".md")) continue;
    const text = await Deno.readTextFile(join(REPO_ROOT, path));
    const driver = /Driver `([a-z-]+)`/.exec(text)?.[1];
    if (driver && driver !== "mock") real.push(path);
  }
  return real;
}

Deno.test("PRD-FEAT-015 is not marked delivered without a real evaluation run", async () => {
  const prd = await Deno.readTextFile(join(REPO_ROOT, "PRD.md"));
  const heading = /^### PRD-FEAT-015 .*$/m.exec(prd)?.[0];
  assert(heading, "PRD-FEAT-015 has no heading; the marker this guards has moved");

  const claimsDelivered = heading.includes("✅");
  const reports = await committedRealReports();

  if (claimsDelivered) {
    assert(
      reports.length > 0,
      "PRD.md marks PRD-FEAT-015 delivered, but no committed report comes from a real driver. " +
        "The harness existing is not the experiment being run, and a local run is not evidence " +
        "until someone commits it as such.",
    );
  } else {
    assert(
      reports.length === 0,
      `A committed real evaluation report exists (${reports.join(", ")}) but PRD-FEAT-015 is ` +
        "still marked as not run. Update the PRD — the marker is now understating the work.",
    );
  }
});

Deno.test("a mock report says in its own text that it proves the harness, not the idea", async () => {
  // The property that made the distinction survive a reader who never opened
  // the PRD. An artifact should state its own limits, because you cannot
  // predict who reads it — neither of us could have named the reader this
  // saved us from.
  const dir = join(REPO_ROOT, "eval/reports");
  if (!await exists(dir)) return;

  for await (const entry of Deno.readDir(dir)) {
    if (!entry.isFile || !entry.name.endsWith(".md")) continue;
    const text = await Deno.readTextFile(join(dir, entry.name));
    if (!/Driver `mock`/.test(text)) continue;
    assert(
      text.includes("proves the harness, not CapFoundry"),
      `${entry.name} is a mock run but does not say so in its own text. A caveat that lives only ` +
        "in the PRD survives exactly until someone opens a report without reading the PRD.",
    );
  }
});
