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

/** Reports produced by anything other than the mock driver. */
async function realReports(): Promise<string[]> {
  const dir = join(REPO_ROOT, "eval/reports");
  if (!await exists(dir)) return [];

  const real: string[] = [];
  for await (const entry of Deno.readDir(dir)) {
    if (!entry.isFile || !entry.name.endsWith(".md")) continue;
    const text = await Deno.readTextFile(join(dir, entry.name));
    const driver = /Driver `([a-z-]+)`/.exec(text)?.[1];
    if (driver && driver !== "mock") real.push(entry.name);
  }
  return real;
}

Deno.test("PRD-FEAT-015 is not marked delivered without a real evaluation run", async () => {
  const prd = await Deno.readTextFile(join(REPO_ROOT, "PRD.md"));
  const heading = /^### PRD-FEAT-015 .*$/m.exec(prd)?.[0];
  assert(heading, "PRD-FEAT-015 has no heading; the marker this guards has moved");

  const claimsDelivered = heading.includes("✅");
  const reports = await realReports();

  if (claimsDelivered) {
    assert(
      reports.length > 0,
      "PRD.md marks PRD-FEAT-015 delivered, but every report in eval/reports/ is from the mock " +
        "driver. The harness existing is not the experiment being run — add the marker after a " +
        "real run, not after the code.",
    );
  } else {
    assert(
      reports.length === 0,
      `A real evaluation report exists (${reports.join(", ")}) but PRD-FEAT-015 is still marked ` +
        "as not run. Update the PRD — the marker is now understating the work.",
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
