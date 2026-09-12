/**
 * Turning an accepted candidate into a CFP skeleton (PRD-FEAT-013.3).
 *
 * Promotion is a person's decision, so this runs from the CLI and never from
 * the MCP server. It writes files and stops. It does not rebuild the index, it
 * does not commit, and it certainly does not publish: the next steps are
 * `deno task prepare` and a pull request, both of which a human performs.
 *
 * Where the candidate lacks something a valid CFP needs, the skeleton carries
 * a visible TODO rather than an invention. A generated alias that nobody meant
 * is worse than a missing one — it adds ranking weight to a guess, and the
 * validator's job is to stop exactly that from reaching the registry.
 */

import { join } from "@std/path";
import { CfcmError } from "../types.ts";
import { ensureDir, pathExists } from "../util/paths.ts";
import { sha256Text } from "../util/hash.ts";
import type { Candidate } from "./candidates.ts";

export interface PromoteResult {
  directory: string;
  files: string[];
  /** What a person must still supply before the CFP will validate. */
  todos: string[];
}

const PLACEHOLDER_ALIAS = "TODO: a phrase someone would search for, not the capability name";
const PLACEHOLDER_QUERY = "TODO: a full natural-language question this capability answers";

export async function promote(
  candidate: Candidate,
  capabilitiesRoot: string,
  licenseText: string,
): Promise<PromoteResult> {
  const directory = join(capabilitiesRoot, candidate.suggestedName);

  if (await pathExists(directory)) {
    throw new CfcmError(
      "ALREADY_EXISTS",
      `${directory} already exists. Promoting would overwrite a capability that is already ` +
        "authored; rename the candidate or remove the existing directory first.",
      { directory },
    );
  }

  const todos: string[] = [];
  const aliases = candidate.aliases.length >= 3
    ? candidate.aliases
    : [...candidate.aliases, PLACEHOLDER_ALIAS, PLACEHOLDER_ALIAS, PLACEHOLDER_ALIAS].slice(0, 3);
  if (candidate.aliases.length < 3) {
    todos.push(
      `capability.json: supply at least 3 real aliases (${candidate.aliases.length} given). ` +
        "Without them the capability can only be found by someone who already knows its name.",
    );
  }

  const exampleQueries = candidate.exampleQueries.length >= 3
    ? candidate.exampleQueries
    : [...candidate.exampleQueries, PLACEHOLDER_QUERY, PLACEHOLDER_QUERY, PLACEHOLDER_QUERY]
      .slice(0, 3);
  if (candidate.exampleQueries.length < 3) {
    todos.push(
      `capability.json: supply at least 3 real exampleQueries (${candidate.exampleQueries.length} given).`,
    );
  }

  if (!candidate.inputSummary) todos.push("capability.json: write inputSummary");
  if (!candidate.outputSummary) todos.push("capability.json: write outputSummary");
  todos.push(`tests/: write table-driven tests, including edge cases and at least one rejection`);
  todos.push("provenance.json: confirm origin, author and licence before opening a pull request");

  const descriptor = {
    schemaVersion: 1,
    name: candidate.suggestedName,
    version: "1.0.0",
    description: candidate.description,
    aliases,
    exampleQueries,
    tags: [],
    inputSummary: candidate.inputSummary || "TODO: one line describing the input",
    outputSummary: candidate.outputSummary || "TODO: one line describing the output",
    runtime: "deno",
    effect: "PURE",
    inputSchema: candidate.inputSchema,
    outputSchema: candidate.outputSchema,
    artifact: {
      type: "typescript",
      entrypoint: "./artifact/index.ts",
      sha256: await sha256Text(candidate.artifact.source),
    },
    exposure: { execution: true, artifact: true },
    tests: "./tests/",
  };

  await ensureDir(join(directory, "artifact"));
  await ensureDir(join(directory, "tests"));
  await ensureDir(join(directory, "license"));

  const files: string[] = [];
  const write = async (relative: string, contents: string) => {
    await Deno.writeTextFile(join(directory, relative), contents);
    files.push(join(directory, relative));
  };

  await write("capability.json", `${JSON.stringify(descriptor, null, 2)}\n`);
  await write("artifact/index.ts", candidate.artifact.source);
  await write("license/LICENSE", licenseText);
  await write(
    "provenance.json",
    `${
      JSON.stringify(
        {
          origin: candidate.source === "generated" ? "generated" : candidate.source,
          author: "TODO",
          createdAt: candidate.createdAt.slice(0, 10),
          license: "Apache-2.0",
          derivedFrom: [],
          notes:
            `Promoted from candidate ${candidate.id}. Reason given at submission: ${candidate.reason}`,
        },
        null,
        2,
      )
    }\n`,
  );
  await write(
    "tests/placeholder_test.ts",
    `import { assertEquals } from "@std/assert";
import capability from "../artifact/index.ts";

// TODO: replace with real table-driven cases. A capability without tests is a
// guess that happens to be committed.
Deno.test("TODO: cover the contract", () => {
  assertEquals(typeof capability, "function");
});
`,
  );
  await write(
    "README.md",
    `# ${candidate.suggestedName}

${candidate.description}

## Why this exists

${candidate.reason}

## Contract

TODO: show an input and its output, and state the decisions a caller cannot
infer from the schema — units, edge-case behaviour, what is deliberately not
handled.

${
      candidate.nearestExisting
        ? `## Relationship to existing capabilities\n\nAt submission, CFCM's nearest match was \`${candidate.nearestExisting.name}\` ` +
          `(confidence ${candidate.nearestExisting.confidence}). Say here why this is a different capability.\n`
        : ""
    }`,
  );

  return { directory, files, todos };
}
