/**
 * SEC-11: artifacts must not be able to load modules.
 *
 * Deno's permission system does not cover module loading. SEC-10 closed the
 * remote half with --no-remote; this is the local half, and it is worse,
 * because a JSON import returns a file's contents to an artifact holding no
 * permissions while Deno.readTextFile on the same path is refused.
 *
 * The first test is the one that justifies the rest: it demonstrates the hole
 * against a real subprocess rather than asserting it exists.
 */

import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
  assertThrows,
} from "@std/assert";
import { join } from "@std/path";
import { assertNoModuleLoading, findModuleLoading } from "../cfcm/runtime/module_guard.ts";
import { execute } from "../cfcm/runtime/execute.ts";
import { CfcmError } from "../cfcm/types.ts";
import { SANDBOX_FLAGS } from "../cfcm/runtime/execute.ts";

Deno.test("the hole is real: a JSON import reads a file the sandbox refuses", async () => {
  const dir = await Deno.makeTempDir({ prefix: "cfcm-sec11-" });
  try {
    await Deno.writeTextFile(join(dir, "secret.json"), '{"canary":"MUST-NOT-BE-READABLE"}');
    await Deno.writeTextFile(
      join(dir, "probe.ts"),
      `const out = {};
try {
  const m = await import("file://${join(dir, "secret.json")}", { with: { type: "json" } });
  out.viaImport = m.default.canary;
} catch (e) { out.viaImport = "blocked"; }
try {
  out.viaRead = await Deno.readTextFile("${join(dir, "secret.json")}");
} catch (e) { out.viaRead = "blocked"; }
console.log(JSON.stringify(out));`,
    );

    const cmd = new Deno.Command(Deno.execPath(), {
      args: [...SANDBOX_FLAGS, join(dir, "probe.ts")],
      clearEnv: true,
      env: { DENO_DIR: Deno.env.get("DENO_DIR") ?? join(dir, "deno") },
      stdout: "piped",
      stderr: "piped",
    });
    const out = await cmd.output();
    const result = JSON.parse(new TextDecoder().decode(out.stdout).trim());

    // Both halves of the finding, asserted rather than described.
    assertEquals(result.viaRead, "blocked", "Deno.readTextFile should be refused");
    assertEquals(
      result.viaImport,
      "MUST-NOT-BE-READABLE",
      "if this is now blocked, Deno has gated module loading and the guard can be revisited",
    );
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("dynamic import is refused", () => {
  for (
    const source of [
      'const m = await import("file:///etc/x.json");',
      "const m = await import(  path  );",
      "const m = await import\n(path);",
      "const m = await import /* sneaky */ (path);",
    ]
  ) {
    assert(findModuleLoading(source).length > 0, `not caught: ${source}`);
  }
});

Deno.test("static imports and re-exports are refused", () => {
  for (
    const source of [
      'import x from "./y.ts";',
      'import { a } from "./y.ts";',
      'import * as ns from "./y.ts";',
      'import "./side-effect.ts";',
      'export * from "./y.ts";',
      'export { a } from "./y.ts";',
      'const m = require("fs");',
      'const w = new Worker("./y.ts");',
    ]
  ) {
    assert(findModuleLoading(source).length > 0, `not caught: ${source}`);
  }
});

Deno.test("the word import in prose does not trip it", () => {
  // A capability should be able to document itself without failing validation.
  const source = `/**
 * This capability does not import anything.
 * Do not use import() here — see SEC-11.
 */
export default function () {
  const help = "pass --import to the other tool";
  const note = \`we never import(x) at runtime\`;
  return { help, note };
}`;
  assertEquals(findModuleLoading(source), []);
});

Deno.test("code inside a template placeholder is still scanned", () => {
  // A template literal is a string, but ${...} inside it is real code.
  const source = "const x = `value: ${await import('./y.ts')}`;";
  assert(findModuleLoading(source).length > 0, "template placeholder was not scanned");
});

Deno.test("a property called import is not a module load", () => {
  assertEquals(findModuleLoading("const a = config.import(x); obj.import;"), []);
});

Deno.test("every shipped artifact passes", async () => {
  const root = new URL("../capabilities", import.meta.url).pathname;
  let checked = 0;

  const check = async (dir: string) => {
    try {
      const source = await Deno.readTextFile(join(dir, "artifact", "index.ts"));
      assertEquals(findModuleLoading(source), [], `${dir} loads a module`);
      checked++;
    } catch {
      // Not a CFP directory.
    }
  };

  for await (const entry of Deno.readDir(root)) {
    if (!entry.isDirectory) continue;
    await check(join(root, entry.name));
    for await (const nested of Deno.readDir(join(root, entry.name))) {
      if (nested.isDirectory) await check(join(root, entry.name, nested.name));
    }
  }

  assert(checked >= 10, `only checked ${checked} artifacts`);
});

Deno.test("execution refuses an artifact that loads a module", async () => {
  const dir = await Deno.makeTempDir({ prefix: "cfcm-sec11-exec-" });
  try {
    const artifact = join(dir, "evil.ts");
    await Deno.writeTextFile(
      artifact,
      'export default async function () { return await import("file:///etc/hosts"); }',
    );

    const err = await assertRejects(
      () =>
        execute({
          artifactPath: artifact,
          input: null,
          timeoutMs: 5000,
          maxOutputBytes: 1024,
          effect: "PURE",
          capability: "Test.evil.importer",
          grantedHosts: [],
        }),
      CfcmError,
    );
    assertEquals(err.code, "ARTIFACT_LOADS_MODULES");
    // Checked before anything is spawned.
    assertStringIncludes(err.message, "self-contained");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("the thrown error names the line", () => {
  const err = assertThrows(
    () => assertNoModuleLoading('const a = 1;\nconst m = await import("./x.ts");', "Test.x.y"),
    CfcmError,
  );
  assertStringIncludes(err.message, "line 2");
});
