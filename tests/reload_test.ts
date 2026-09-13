/**
 * The index must not freeze at process start (F9).
 *
 * The MCP server is the only long-lived CFCM process, and before this it held
 * the index it read at startup for its whole lifetime. A capability added
 * afterwards was invisible to it.
 *
 * What made that worth a test rather than a known quirk is the *shape* of the
 * failure. A missing capability returns NO_MATCH, which is a normal answer —
 * `capability-awareness` tells the agent to write the code and say nothing
 * about having searched. So a frozen index is observationally identical to an
 * empty registry: no error, no warning, nothing to notice. It also breaks the
 * candidate loop precisely where §16 claims it closes, since the session that
 * submits a capability is the one that can never see it.
 *
 * The test therefore asserts both halves against the *same* Cfcm instance:
 * NO_MATCH before the capability exists, MATCH after, with no restart.
 */

import { assert, assertEquals } from "@std/assert";
import { join } from "@std/path";
import { Cfcm } from "../cfcm/core.ts";
import { parseConfig } from "../cfcm/config/config.ts";
import { sha256Text } from "../cfcm/util/hash.ts";

const REPO_ROOT = new URL("..", import.meta.url).pathname;

const ARTIFACT = `export default function reverseWords(input: { text: string }): { text: string } {
  return { text: input.text.split(/\\s+/).reverse().join(" ") };
}
`;

/**
 * A CFP that could plausibly be promoted from the candidate queue. Its
 * vocabulary is deliberately unlike anything in the registry, so a MATCH
 * cannot come from some neighbouring capability.
 */
async function writeCapability(root: string): Promise<void> {
  const dir = join(root, "Local.text.reverseWords");
  await Deno.mkdir(join(dir, "artifact"), { recursive: true });
  await Deno.mkdir(join(dir, "tests"), { recursive: true });
  await Deno.writeTextFile(join(dir, "artifact", "index.ts"), ARTIFACT);
  await Deno.writeTextFile(
    join(dir, "capability.json"),
    JSON.stringify({
      schemaVersion: 1,
      name: "Local.text.reverseWords",
      version: "1.0.0",
      description: "Reverse the order of words in a sentence, leaving each word intact",
      aliases: [
        "reverse the word order in a sentence",
        "flip a sentence back to front",
        "put the words of a phrase in reverse order",
        "invert word sequence",
        "backwards word order",
      ],
      exampleQueries: [
        "reverse the order of the words in this sentence",
        "flip a sentence so the last word comes first",
        "put the words of a phrase into reverse order",
        "invert the word sequence of a line of text",
        "rewrite a sentence backwards word by word",
      ],
      tags: ["text", "words", "reverse", "sentence"],
      inputSummary: "A sentence as a single string",
      outputSummary: "The same words in reverse order",
      runtime: "deno",
      effect: "PURE",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["text"],
        properties: { text: { type: "string" } },
      },
      outputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["text"],
        properties: { text: { type: "string" } },
      },
      artifact: {
        type: "typescript",
        entrypoint: "./artifact/index.ts",
        sha256: await sha256Text(ARTIFACT),
      },
      exposure: { execution: true, artifact: true },
      tests: "./tests/",
    }),
  );
}

Deno.test("a capability added after startup is found without restarting", async () => {
  const home = await Deno.makeTempDir({ prefix: "cfcm-reload-" });
  const previous = Deno.env.get("CFCM_HOME");
  Deno.env.set("CFCM_HOME", home);
  const localRoot = join(home, "local");
  await Deno.mkdir(localRoot, { recursive: true });

  try {
    const config = parseConfig({
      capfoundry: { registry: REPO_ROOT, enabled: true },
      telemetry: { local: true, upload: false },
    }, REPO_ROOT);

    const cfcm = await Cfcm.create({ config, localRoot });
    const sizeAtStartup = cfcm.size;

    const query = "reverse the order of the words in a sentence";

    const before = await cfcm.search(query);
    assertEquals(
      before.status,
      "NO_MATCH",
      "precondition: the capability must not exist yet, or the test proves nothing",
    );

    // The candidate loop's own move: a CFP appears on disk while the process runs.
    await writeCapability(localRoot);

    // No restart, no Cfcm.create — the same instance the agent is already talking to.
    const reloaded = await cfcm.ensureFresh();
    assert(reloaded, "a new capability on disk must be detected as a change");

    const after = await cfcm.search(query);
    assertEquals(after.status, "MATCH", "the capability is on disk and must now be findable");
    assertEquals(after.candidates[0].record.name, "Local.text.reverseWords");
    assertEquals(cfcm.size, sizeAtStartup + 1);
  } finally {
    if (previous === undefined) Deno.env.delete("CFCM_HOME");
    else Deno.env.set("CFCM_HOME", previous);
    await Deno.remove(home, { recursive: true });
  }
});

Deno.test("an unchanged index is not reloaded", async () => {
  const home = await Deno.makeTempDir({ prefix: "cfcm-reload-noop-" });
  const previous = Deno.env.get("CFCM_HOME");
  Deno.env.set("CFCM_HOME", home);

  try {
    const config = parseConfig({
      capfoundry: { registry: REPO_ROOT, enabled: true },
      telemetry: { local: true, upload: false },
    }, REPO_ROOT);

    const cfcm = await Cfcm.create({ config, localRoot: join(home, "local") });

    // The whole point of the freshness token: without it the honest fix would
    // be to reload on every search, which re-reads every CFP off disk and
    // spends the OBJ-3 budget to discover that nothing changed.
    assertEquals(await cfcm.ensureFresh(), false);
    assertEquals(await cfcm.ensureFresh(), false);
  } finally {
    if (previous === undefined) Deno.env.delete("CFCM_HOME");
    else Deno.env.set("CFCM_HOME", previous);
    await Deno.remove(home, { recursive: true });
  }
});

/**
 * The two tests above would both still pass if the MCP server stopped calling
 * ensureFresh, because they call it themselves. That wire *was* the bug: the
 * method to reload already existed at core.ts:84 and nothing invoked it. So the
 * wire is asserted directly, at the one call site that has a long-lived index.
 */
Deno.test("the MCP server refreshes before serving a tool call", async () => {
  const source = await Deno.readTextFile(new URL("../cfcm/mcp/server.ts", import.meta.url));
  const body = source.slice(source.indexOf("async function callTool"));
  assert(
    body.slice(0, body.indexOf("switch (name)")).includes("ensureFresh"),
    "callTool must refresh the index before dispatching, or a long-running server " +
      "answers from the index it read at startup for its whole lifetime (F9)",
  );
});
