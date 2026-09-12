#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env
/**
 * Candidate review CLI (PRD-FEAT-013.3).
 *
 * Promotion lives here rather than in the MCP server on purpose. MVP section
 * 16 says the MVP does not auto-publish, and a tool an agent can call is a
 * tool an agent will call. Putting the step behind a command a person types
 * is what makes "a human reviewed this" true rather than aspirational.
 */

import { CandidateQueue } from "../cfcm/candidates/candidates.ts";
import { promote } from "../cfcm/candidates/promote.ts";
import { CfcmError } from "../cfcm/types.ts";

const [command, argument] = Deno.args;
const queue = new CandidateQueue();

function usage(): never {
  console.log(`Usage:
  deno task candidate list              show queued candidates
  deno task candidate show <id>         print one candidate in full
  deno task candidate promote <id>      write a CFP skeleton under capabilities/
  deno task candidate discard <id>      mark a candidate as discarded
  deno task candidate remove <id>       delete a candidate from the queue`);
  Deno.exit(command ? 1 : 0);
}

try {
  switch (command) {
    case "list": {
      const candidates = await queue.list();
      if (candidates.length === 0) {
        console.log("No candidates queued.");
        break;
      }
      for (const c of candidates) {
        const flag = c.nearestExisting ? `  ⚠ near ${c.nearestExisting.name}` : "";
        console.log(`${c.id}  [${c.status}]  ${c.suggestedName}${flag}`);
        console.log(`    ${c.description}`);
        if (c.aliases.length < 3 || c.exampleQueries.length < 3) {
          console.log(
            `    incomplete: ${c.aliases.length} alias(es), ${c.exampleQueries.length} example query/ies — 3 of each needed`,
          );
        }
      }
      console.log(`\n${candidates.length} candidate(s). Nothing here is published.`);
      break;
    }

    case "show": {
      if (!argument) usage();
      console.log(JSON.stringify(await queue.get(argument), null, 2));
      break;
    }

    case "promote": {
      if (!argument) usage();
      const candidate = await queue.get(argument);
      const license = await Deno.readTextFile("./LICENSE");
      const result = await promote(candidate, "./capabilities", license);
      await queue.setStatus(argument, "promoted");

      console.log(`✓ CFP skeleton written to ${result.directory}\n`);
      for (const file of result.files) console.log(`    ${file}`);

      console.log(`\nBefore this can be a capability:\n`);
      for (const todo of result.todos) console.log(`  • ${todo}`);
      console.log(`
Then:
  deno task prepare     format, re-seal the artifact hash, rebuild the index
  deno task ci          the validator will refuse the TODO placeholders
  git checkout -b add-${candidate.suggestedName}   and open a pull request

Nothing is published until that pull request is merged.`);
      break;
    }

    case "discard": {
      if (!argument) usage();
      await queue.setStatus(argument, "discarded");
      console.log(`${argument} marked discarded. Use "remove" to delete it.`);
      break;
    }

    case "remove": {
      if (!argument) usage();
      await queue.remove(argument);
      console.log(`${argument} removed from the queue.`);
      break;
    }

    default:
      usage();
  }
} catch (err) {
  if (err instanceof CfcmError) {
    console.error(`✗ ${err.code}: ${err.message}`);
    Deno.exit(1);
  }
  throw err;
}
