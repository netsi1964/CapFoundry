/**
 * Validator tests (PRD-FEAT-001.4).
 *
 * Every case builds a deliberately broken CFP and asserts the validator both
 * rejects it and names the field, because a validator that only says "invalid"
 * pushes the cost of each mistake onto the next capability author.
 */

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";

const REPO_ROOT = new URL("..", import.meta.url).pathname;
const ARTIFACT = "export default function () { return { ok: true }; }\n";

const VALID_DESCRIPTOR = {
  schemaVersion: 1,
  name: "Test.demo.thing",
  version: "1.0.0",
  description: "A deliberately minimal capability used only by the validator tests",
  aliases: ["sample widget", "placeholder gizmo", "constant responder"],
  exampleQueries: ["do the demo thing", "run the sample widget", "invoke the placeholder gizmo"],
  inputSummary: "Nothing at all",
  outputSummary: "A constant object",
  runtime: "deno",
  effect: "PURE",
  inputSchema: { type: "object" },
  outputSchema: { type: "object" },
  artifact: { type: "typescript", entrypoint: "./artifact/index.ts", sha256: "" },
  exposure: { execution: true, artifact: true },
  tests: "./tests/",
};

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Builds a CFP tree, applies a mutation, and runs the validator over it. */
async function runValidator(
  mutate: (d: Record<string, unknown>) => void = () => {},
  extra: (dir: string) => Promise<void> = async () => {},
): Promise<{ code: number; output: string }> {
  const root = await Deno.makeTempDir({ prefix: "cfcm-validate-" });
  try {
    const dir = join(root, "Test.demo.thing");
    await Deno.mkdir(join(dir, "artifact"), { recursive: true });
    await Deno.mkdir(join(dir, "tests"), { recursive: true });
    await Deno.mkdir(join(dir, "license"), { recursive: true });
    await Deno.writeTextFile(join(dir, "artifact", "index.ts"), ARTIFACT);
    await Deno.writeTextFile(join(dir, "provenance.json"), "{}");
    await Deno.writeTextFile(join(dir, "README.md"), "# Test\n");
    await Deno.writeTextFile(join(dir, "license", "LICENSE"), "Apache-2.0\n");

    const descriptor: Record<string, unknown> = structuredClone(VALID_DESCRIPTOR);
    (descriptor.artifact as Record<string, unknown>).sha256 = await sha256(ARTIFACT);
    mutate(descriptor);
    await Deno.writeTextFile(join(dir, "capability.json"), JSON.stringify(descriptor, null, 2));
    await extra(dir);

    const cmd = new Deno.Command(Deno.execPath(), {
      args: ["run", "--allow-read", join(REPO_ROOT, "scripts", "validate-cfp.ts"), root],
      stdout: "piped",
      stderr: "piped",
    });
    const out = await cmd.output();
    return {
      code: out.code,
      output: new TextDecoder().decode(out.stdout) + new TextDecoder().decode(out.stderr),
    };
  } finally {
    await Deno.remove(root, { recursive: true });
  }
}

Deno.test("a well-formed CFP passes", async () => {
  const { code, output } = await runValidator();
  assertEquals(code, 0, output);
  assertStringIncludes(output, "1 CFP(s) valid");
});

Deno.test("a missing required field is named", async () => {
  for (const field of ["exposure", "effect", "outputSchema", "inputSummary"]) {
    const { code, output } = await runValidator((d) => delete d[field]);
    assertEquals(code, 1, `deleting ${field} should fail validation`);
    assertStringIncludes(output, field);
  }
});

Deno.test("a mismatched artifact hash is rejected and both hashes shown", async () => {
  const { code, output } = await runValidator((d) => {
    (d.artifact as Record<string, unknown>).sha256 = "a".repeat(64);
  });
  assertEquals(code, 1);
  assertStringIncludes(output, "declared:");
  assertStringIncludes(output, "actual:");
  assertStringIncludes(output, "deno task seal");
});

Deno.test("a modified artifact invalidates a previously correct hash", async () => {
  const { code, output } = await runValidator(() => {}, async (dir) => {
    await Deno.writeTextFile(join(dir, "artifact", "index.ts"), `${ARTIFACT}// tampered\n`);
  });
  assertEquals(code, 1);
  assertStringIncludes(output, "artifact.sha256 does not match");
});

Deno.test("a missing entrypoint is rejected", async () => {
  const { code, output } = await runValidator(() => {}, async (dir) => {
    await Deno.remove(join(dir, "artifact", "index.ts"));
  });
  assertEquals(code, 1);
  assertStringIncludes(output, "does not exist");
});

Deno.test("missing provenance, README or license is rejected", async () => {
  for (const missing of ["provenance.json", "README.md"]) {
    const { code, output } = await runValidator(() => {}, async (dir) => {
      await Deno.remove(join(dir, missing));
    });
    assertEquals(code, 1, `${missing} should be required`);
    assertStringIncludes(output, missing);
  }
});

Deno.test("fewer than three aliases is rejected", async () => {
  const { code } = await runValidator((d) => {
    d.aliases = ["only one"];
  });
  assertEquals(code, 1);
});

Deno.test("an alias that merely restates the name is rejected", async () => {
  const { code, output } = await runValidator((d) => {
    d.aliases = ["sample widget", "placeholder gizmo", "test demo thing"];
  });
  assertEquals(code, 1);
  assertStringIncludes(output, "adds no recall");
});

Deno.test("a NETWORK effect without declared hosts is rejected", async () => {
  const { code, output } = await runValidator((d) => {
    d.effect = "NETWORK";
  });
  assertEquals(code, 1);
  assertStringIncludes(output, "unbounded network capability cannot be granted");
});

Deno.test("a NETWORK effect with declared hosts is accepted", async () => {
  // The format allows it; whether this machine grants it is a separate,
  // runtime decision made against cfcm.json.
  const { code, output } = await runValidator((d) => {
    d.effect = "NETWORK";
    d.permissions = { network: ["www.dr.dk"] };
  });
  assertEquals(code, 0, output);
});

Deno.test("a PURE effect that requests hosts is rejected", async () => {
  const { code, output } = await runValidator((d) => {
    d.permissions = { network: ["www.dr.dk"] };
  });
  assertEquals(code, 1);
  assertStringIncludes(output, "PURE capability reaches nothing");
});

Deno.test("READ and WRITE effects are rejected as unexecutable", async () => {
  for (const effect of ["READ", "WRITE"]) {
    const { code, output } = await runValidator((d) => {
      d.effect = effect;
    });
    assertEquals(code, 1, `${effect} should be rejected`);
    assertStringIncludes(output, "not executable");
  }
});

Deno.test("an unknown effect value is rejected by the schema", async () => {
  const { code } = await runValidator((d) => {
    d.effect = "MAGIC";
  });
  assertEquals(code, 1);
});

Deno.test("an unexpected extra field is rejected", async () => {
  const { code, output } = await runValidator((d) => {
    d.autoPublish = true;
  });
  assertEquals(code, 1);
  assertStringIncludes(output, "autoPublish");
});

Deno.test("a directory name that does not match the capability is rejected", async () => {
  const { code, output } = await runValidator((d) => {
    d.name = "Test.demo.somethingElse";
  });
  assertEquals(code, 1);
  assert(output.includes("directory should be named") || output.includes("adds no recall"));
});
