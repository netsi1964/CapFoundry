/**
 * Candidate submission tests (PRD-FEAT-013, MVP section 16).
 *
 * The property worth most of these assertions is the negative one: submitting
 * a candidate must change nothing that anyone else can see.
 */

import { assert, assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";
import { Cfcm } from "../cfcm/core.ts";
import { CandidateQueue } from "../cfcm/candidates/candidates.ts";
import { promote } from "../cfcm/candidates/promote.ts";
import { CfcmError } from "../cfcm/types.ts";
import { parseConfig } from "../cfcm/config/config.ts";

const REPO_ROOT = new URL("..", import.meta.url).pathname;

// MVP section 16's own worked example, chosen because it is genuinely absent
// from the registry — CapFoundry.text.editDistance no longer is, having come in
// through this very loop.
const NORMALIZE_WHITESPACE =
  `export default function normalizeWhitespace(input: { text: string }): { text: string } {
  return { text: input.text.replace(/\\s+/gu, " ").trim() };
}
`;

function candidateInput(overrides: Record<string, unknown> = {}) {
  return {
    suggestedName: "CapFoundry.text.normalizeWhitespace",
    description: "Collapse runs of whitespace to single spaces and trim the ends",
    artifactSource: NORMALIZE_WHITESPACE,
    reason: "General-purpose cleanup written while solving an unrelated task",
    inputSchema: { type: "object", required: ["text"] },
    outputSchema: { type: "object", required: ["text"] },
    aliases: ["tidy up spacing", "collapse repeated spaces", "clean pasted text"],
    exampleQueries: [
      "remove extra spaces and line breaks from pasted text",
      "tidy the spacing in a block of user input",
      "collapse repeated whitespace into single spaces",
    ],
    inputSummary: "Text with irregular whitespace",
    outputSummary: "The same text with whitespace normalised",
    ...overrides,
  };
}

async function withCfcm(fn: (cfcm: Cfcm, home: string) => Promise<void>) {
  const home = await Deno.makeTempDir({ prefix: "cfcm-cand-" });
  const previous = Deno.env.get("CFCM_HOME");
  Deno.env.set("CFCM_HOME", home);
  try {
    const config = parseConfig({
      capfoundry: { registry: REPO_ROOT, enabled: true },
      telemetry: { local: true, upload: false },
    }, REPO_ROOT);
    await fn(await Cfcm.create({ config, localRoot: join(home, "local") }), home);
  } finally {
    if (previous === undefined) Deno.env.delete("CFCM_HOME");
    else Deno.env.set("CFCM_HOME", previous);
    await Deno.remove(home, { recursive: true });
  }
}

Deno.test("a candidate is queued locally and nothing is published", async () => {
  const indexBefore = await Deno.readTextFile(join(REPO_ROOT, "registry/index.json"));

  await withCfcm(async (cfcm, home) => {
    const result = await cfcm.submitCandidate(candidateInput());

    assertEquals(result.candidate.status, "local");
    assertEquals(result.candidate.suggestedName, "CapFoundry.text.normalizeWhitespace");
    assertStringIncludes(result.path, join(home, "candidates"));

    // The queue holds it, and the index does not.
    assertEquals((await cfcm.candidates.list()).length, 1);
    assertEquals(
      cfcm.list().some((r) => r.name === "CapFoundry.text.normalizeWhitespace"),
      false,
      "a submitted candidate must not appear in the search index",
    );
  });

  assertEquals(
    await Deno.readTextFile(join(REPO_ROOT, "registry/index.json")),
    indexBefore,
    "submitting a candidate must not touch the published registry",
  );
});

Deno.test("a Local.* candidate is refused with an explanation", async () => {
  await withCfcm(async (cfcm) => {
    const err = await assertRejects(
      () => cfcm.submitCandidate(candidateInput({ suggestedName: "Local.dev.something" })),
      CfcmError,
    );
    assertEquals(err.code, "CANDIDATE_LOCAL_NAMESPACE");
    assertStringIncludes(err.message, "this machine only");
  });
});

Deno.test("an unnamespaced candidate is refused", async () => {
  await withCfcm(async (cfcm) => {
    for (const name of ["editDistance", "lowercase.thing", ""]) {
      const err = await assertRejects(
        () => cfcm.submitCandidate(candidateInput({ suggestedName: name })),
        CfcmError,
      );
      assertEquals(err.code, "CANDIDATE_INVALID");
    }
  });
});

Deno.test("a candidate missing required prose is refused", async () => {
  await withCfcm(async (cfcm) => {
    for (const field of ["description", "reason", "artifactSource"]) {
      await assertRejects(
        () => cfcm.submitCandidate(candidateInput({ [field]: "   " })),
        CfcmError,
      );
    }
  });
});

Deno.test("a near-duplicate is flagged but still accepted", async () => {
  await withCfcm(async (cfcm) => {
    // Deliberately describes something the registry already has.
    const result = await cfcm.submitCandidate(candidateInput({
      suggestedName: "CapFoundry.geo.haversine",
      description: "Calculate the great-circle distance between two geographic coordinates",
      aliases: ["distance between coordinates", "haversine", "great circle distance"],
    }));

    assert(result.warning, "an obvious duplicate should produce a warning");
    assertStringIncludes(result.warning, "CapFoundry.geo.distance");
    // Accepted anyway: whether two capabilities are the same is a judgement.
    assertEquals(result.candidate.status, "local");
    assert(result.candidate.nearestExisting);
  });
});

Deno.test("a genuinely new capability produces no duplicate warning", async () => {
  await withCfcm(async (cfcm) => {
    const result = await cfcm.submitCandidate(candidateInput());
    assertEquals(result.warning, null);
    assertEquals(result.candidate.nearestExisting, null);
  });
});

Deno.test("duplicate detection reads the description, not the proposed name", async () => {
  await withCfcm(async (cfcm) => {
    // A novel name must not hide a duplicate implementation.
    const result = await cfcm.submitCandidate(candidateInput({
      suggestedName: "CapFoundry.misc.zzz",
      description: "Convert arbitrary text into a stable URL-safe and filename-safe slug",
      aliases: ["url slug", "permalink", "web safe string"],
    }));
    assertStringIncludes(result.warning ?? "", "CapFoundry.text.slugify");
  });
});

Deno.test("submission is recorded in telemetry without the implementation", async () => {
  await withCfcm(async (cfcm, home) => {
    await cfcm.submitCandidate(candidateInput());

    let combined = "";
    for await (const entry of Deno.readDir(join(home, "telemetry"))) {
      combined += await Deno.readTextFile(join(home, "telemetry", entry.name));
    }
    const events = combined.trim().split("\n").map((l) => JSON.parse(l));
    const candidateEvent = events.find((e) => e.eventType === "candidate");

    assert(candidateEvent, "a candidate event should be recorded");
    assertEquals(candidateEvent.candidateSubmitted, true);
    assert(
      !combined.includes("normalizeWhitespace(input"),
      "the implementation leaked into telemetry",
    );
    assert(!combined.includes("replace(/"), "the implementation leaked into telemetry");
  });
});

Deno.test("promote writes a CFP skeleton that the validator accepts", async () => {
  const root = await Deno.makeTempDir({ prefix: "cfcm-promote-" });
  const home = await Deno.makeTempDir({ prefix: "cfcm-promote-home-" });
  try {
    const queue = new CandidateQueue(join(home, "candidates"));
    const { candidate } = await queue.submit(candidateInput(), null);
    const result = await promote(candidate, root, "Apache-2.0\n");

    // Every file a CFP needs.
    for (
      const relative of [
        "capability.json",
        "artifact/index.ts",
        "provenance.json",
        "README.md",
        "license/LICENSE",
      ]
    ) {
      await Deno.stat(join(result.directory, relative));
    }

    const cmd = new Deno.Command(Deno.execPath(), {
      args: ["run", "--allow-read", join(REPO_ROOT, "scripts/validate-cfp.ts"), root],
      stdout: "piped",
      stderr: "piped",
    });
    const out = await cmd.output();
    const text = new TextDecoder().decode(out.stdout) + new TextDecoder().decode(out.stderr);
    assertEquals(out.code, 0, `a complete candidate should promote to a valid CFP:\n${text}`);
  } finally {
    await Deno.remove(root, { recursive: true });
    await Deno.remove(home, { recursive: true });
  }
});

Deno.test("promote refuses to overwrite an existing capability", async () => {
  const root = await Deno.makeTempDir({ prefix: "cfcm-promote-clash-" });
  const home = await Deno.makeTempDir({ prefix: "cfcm-promote-clash-home-" });
  try {
    const queue = new CandidateQueue(join(home, "candidates"));
    const { candidate } = await queue.submit(candidateInput(), null);
    await promote(candidate, root, "Apache-2.0\n");

    const err = await assertRejects(() => promote(candidate, root, "Apache-2.0\n"), CfcmError);
    assertEquals(err.code, "ALREADY_EXISTS");
  } finally {
    await Deno.remove(root, { recursive: true });
    await Deno.remove(home, { recursive: true });
  }
});

Deno.test("an incomplete candidate promotes to a skeleton the validator rejects", async () => {
  const root = await Deno.makeTempDir({ prefix: "cfcm-promote-thin-" });
  const home = await Deno.makeTempDir({ prefix: "cfcm-promote-thin-home-" });
  try {
    const queue = new CandidateQueue(join(home, "candidates"));
    const { candidate } = await queue.submit(
      candidateInput({ aliases: [], exampleQueries: [], inputSummary: "", outputSummary: "" }),
      null,
    );
    const result = await promote(candidate, root, "Apache-2.0\n");

    // The gap is named rather than invented past.
    assert(result.todos.some((t) => t.includes("aliases")), "missing aliases should be a TODO");
    assert(
      result.todos.some((t) => t.includes("exampleQueries")),
      "missing example queries should be a TODO",
    );

    const descriptor = JSON.parse(
      await Deno.readTextFile(join(result.directory, "capability.json")),
    );
    assert(
      descriptor.aliases.every((a: string) => a.startsWith("TODO")),
      "placeholders must be visibly unfinished, not plausible inventions",
    );

    const cmd = new Deno.Command(Deno.execPath(), {
      args: ["run", "--allow-read", join(REPO_ROOT, "scripts/validate-cfp.ts"), root],
      stdout: "piped",
      stderr: "piped",
    });
    assertEquals(
      (await cmd.output()).code,
      1,
      "a skeleton with placeholders must not pass validation",
    );
  } finally {
    await Deno.remove(root, { recursive: true });
    await Deno.remove(home, { recursive: true });
  }
});

Deno.test("the submission response hands back a runnable promote command", async () => {
  // Buried in prose, an exact id gets paraphrased away and the user is left
  // knowing a candidate exists but not how to accept it.
  await withCfcm(async (cfcm) => {
    const result = await cfcm.submitCandidate(candidateInput());
    const id = result.candidate.id;

    // The MCP layer builds these from the id; assert the id is usable as one.
    assertEquals(`deno task candidate promote ${id}`.includes(id), true);
    assert(/^\d{4}-\d{2}-\d{2}-[0-9a-f]{8}$/.test(id), `id "${id}" is not shell-safe`);
    assert(!/[\s;&|$`'"]/.test(id), `id "${id}" contains characters that would break a command`);
  });
});

Deno.test("the skill stays policy, not mechanics (PRD-FEAT-014)", async () => {
  const skill = await Deno.readTextFile(
    join(REPO_ROOT, "skills/capability-awareness/SKILL.md"),
  );
  const lines = skill.split("\n").length;
  assert(
    lines < 100,
    `the skill is ${lines} lines; over 100 means the tool surface is too complex`,
  );

  // The agent must not have to reason about any of this (MVP section 18).
  for (const forbidden of ["sha256", "artifact cache", "cache layout", "subprocess", "resolver"]) {
    assert(
      !skill.toLowerCase().includes(forbidden),
      `the skill mentions "${forbidden}", which the agent should never need to know`,
    );
  }

  // And it must cover the six things section 18 requires.
  for (const required of ["When to search", "NO_MATCH", "PARTIAL_MATCH", "cfcm_submit_candidate"]) {
    assert(skill.includes(required), `the skill omits ${required}`);
  }
});
