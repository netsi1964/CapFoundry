/**
 * The claude-code driver's command line.
 *
 * Every flag asserted here was found missing by a real run that cost money and
 * returned a result that looked meaningful. Together they are the difference
 * between an evaluation that measures CapFoundry and one that produces a
 * falsification-shaped report caused by a harness bug.
 */

import { assert, assertEquals } from "@std/assert";
import { ClaudeCodeDriver, evalConfig } from "../eval/drivers.ts";
import { parseConfig } from "../cfcm/config/config.ts";

const REPO_ROOT = new URL("..", import.meta.url).pathname;

async function argsFor(cfcmEnabled: boolean): Promise<string[]> {
  const ws = await Deno.makeTempDir({ prefix: "args-" });
  const driver = new ClaudeCodeDriver(REPO_ROOT, `${REPO_ROOT}cfcm.json`);
  return await driver.buildArgs({
    prompt: "x",
    workspace: ws,
    cfcmEnabled,
    timeoutSeconds: 1,
    cfcmHome: ws,
  });
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
}

Deno.test("both conditions may write files", async () => {
  // Without a permission mode, print mode refused Write: every scenario failed
  // in both conditions with an empty workspace. Found by Marie for $1.45.
  for (const cfcm of [true, false]) {
    assertEquals(flag(await argsFor(cfcm), "--permission-mode"), "acceptEdits");
  }
});

Deno.test("neither condition bypasses permissions entirely", async () => {
  // An agent that never has to ask is not the agent anyone runs.
  for (const cfcm of [true, false]) {
    const args = await argsFor(cfcm);
    assert(!args.includes("bypassPermissions"));
    assert(!args.includes("--dangerously-skip-permissions"));
  }
});

Deno.test("condition A is granted the CFCM tools by name", async () => {
  // acceptEdits does not cover MCP tools. Without this grant condition A can
  // see CFCM and is refused on first use — which produced zero searches that
  // read as a behavioural result and were really a permission failure.
  const allowed = flag(await argsFor(true), "--allowedTools") ?? "";
  for (const tool of ["cfcm_search", "cfcm_invoke", "cfcm_describe", "cfcm_submit_candidate"]) {
    assert(allowed.includes(`mcp__cfcm__${tool}`), `condition A cannot call ${tool}`);
  }
});

Deno.test("the control arm has no CFCM, no grant and no awareness skill", async () => {
  const args = await argsFor(false);
  assert(!args.includes("--mcp-config"), "control was given the MCP server");
  assert(!args.includes("--allowedTools"), "control was granted CFCM tools");
  assert(!args.includes("--append-system-prompt"), "control was given the skill");
});

Deno.test("globally installed skills are disabled in both arms", async () => {
  // capability-awareness was installed into the user's global skills
  // directory, so it loaded in the control arm too: the variable under test
  // leaking into the control.
  for (const cfcm of [true, false]) {
    assert((await argsFor(cfcm)).includes("--disable-slash-commands"));
  }
});

Deno.test("condition A carries the awareness skill without its frontmatter", async () => {
  // MVP section 22: condition A is CFCM *and* the skill.
  const skill = flag(await argsFor(true), "--append-system-prompt") ?? "";
  assert(skill.includes("When to search"), "the skill body is missing");
  assert(!skill.startsWith("---"), "frontmatter leaked into the system prompt");
});

Deno.test("the two arms differ by exactly the variable under test", async () => {
  // Everything condition A has that the control lacks must be CFCM.
  const a = await argsFor(true);
  const b = await argsFor(false);
  const onlyInA = new Set(["--mcp-config", "--allowedTools", "--append-system-prompt"]);
  for (const arg of a) {
    if (arg.startsWith("--") && !b.includes(arg)) {
      assert(onlyInA.has(arg), `condition A has an unexplained extra flag: ${arg}`);
    }
  }
});

Deno.test("an evaluation run logs query text without moving any path", () => {
  // Without query text the pilot's PARTIAL_MATCH could only be guessed at.
  // Copying the config into the run's home must not make "./capabilities"
  // resolve somewhere else, or condition A searches an empty registry.
  const original = {
    capfoundry: { registry: "./", enabled: true },
    telemetry: { local: true, logQueryText: false },
    namespaces: [{
      name: "Netsi",
      type: "private",
      source: { type: "filesystem", path: "./netsi" },
    }],
  };
  const derived = evalConfig(original, "/repo");
  const before = parseConfig(original, "/repo");
  const after = parseConfig(derived, "/somewhere/else");

  assertEquals(after.telemetry.logQueryText, true);
  assertEquals(after.capfoundry.registry, before.capfoundry.registry);
  assertEquals(after.namespaces[0].source.path, before.namespaces[0].source.path);
  assertEquals(original.telemetry.logQueryText, false, "the user's own config must not change");
});

Deno.test("a remote registry URL is left alone", () => {
  const derived = evalConfig({ capfoundry: { registry: "https://example.org/r/" } }, "/repo");
  assertEquals((derived.capfoundry as { registry: string }).registry, "https://example.org/r/");
});
