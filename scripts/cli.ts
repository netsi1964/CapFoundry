#!/usr/bin/env -S deno run --allow-read --allow-write --allow-net --allow-run --allow-env
/**
 * `cfcm` — calling capabilities from a shell.
 *
 * The same Cfcm object the MCP server drives, so there is no second code path
 * to keep honest: what an agent gets and what you get at a prompt are the same
 * search, the same sandbox, the same telemetry.
 *
 * Designed for pipes rather than for reading. `invoke` writes the result value
 * and nothing else to stdout, diagnostics go to stderr, and input can arrive on
 * stdin — so capabilities compose in a shell the way they would in code. That
 * composition is worth more than the convenience: if two capabilities cannot be
 * piped together, their contracts do not actually fit, and a pipeline finds out
 * in seconds where a code review would not.
 *
 * `search` prints for a human by default, because a human is who runs it.
 */

import { Cfcm } from "../cfcm/core.ts";
import { CfcmError } from "../cfcm/types.ts";
import type { ReturnMode } from "../cfcm/types.ts";
import { buildInput, describeArgs } from "../cfcm/util/schema_args.ts";

const USAGE = `cfcm — ask CapFoundry from a shell

  cfcm search <query> [--limit N] [--json]
  cfcm invoke <capability> [args...] [--field value] [--return mode] [--pretty]
  cfcm describe <capability>
  cfcm list [--json]

Arguments are read from the capability's own inputSchema, so you rarely write JSON.
Run: cfcm invoke <capability> --help   to see what a capability takes.

  cfcm invoke CapFoundry.text.slugify "Rødgrød med fløde" --locale da
  cfcm invoke CapFoundry.geo.geocode Aarhus
  cfcm invoke CapFoundry.geo.distance --from.lat 55.6 --from.lon 12.5 --to.lat 56.1 --to.lon 10.2

JSON still works for anything the mapping cannot express, and stdin is read when
no argument is given. invoke writes only the result to stdout, so it pipes.

  echo '{"text":"Hej"}' | cfcm invoke CapFoundry.text.slugify

Exit codes: 0 success · 1 error · 2 no confident match · 3 usage`;

function flag(args: string[], name: string): boolean {
  const i = args.indexOf(name);
  if (i === -1) return false;
  args.splice(i, 1);
  return true;
}

function option(args: string[], name: string): string | null {
  const i = args.indexOf(name);
  if (i === -1) return null;
  const value = args[i + 1] ?? null;
  args.splice(i, value === null ? 1 : 2);
  return value;
}

async function readStdin(): Promise<string> {
  // A terminal with no piped input would block forever waiting for EOF.
  if (Deno.stdin.isTerminal()) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of Deno.stdin.readable) {
    chunks.push(chunk);
    total += chunk.length;
  }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(joined);
}

function out(value: unknown, pretty: boolean): void {
  console.log(JSON.stringify(value, null, pretty ? 2 : 0));
}

const args = [...Deno.args];
const command = args.shift();
const asJson = flag(args, "--json");
const pretty = flag(args, "--pretty");

if (!command || command === "--help" || command === "-h") {
  console.log(USAGE);
  Deno.exit(command ? 0 : 3);
}

try {
  const cfcm = await Cfcm.create();

  switch (command) {
    case "search": {
      const query = args.join(" ").trim();
      if (!query) {
        console.error("cfcm search needs a query");
        Deno.exit(3);
      }
      const limit = Number(option(args, "--limit") ?? 3);
      const result = await cfcm.search(query, { limit });

      if (asJson) {
        out(result, pretty);
      } else {
        console.log(`${result.status}  confidence ${result.confidence}  (${result.searchMs} ms)`);
        for (const c of result.candidates) {
          console.log(`\n  ${c.record.name}  ${c.record.version}  [${c.record.namespaceType}]`);
          console.log(`    ${c.record.description}`);
          console.log(`    in:  ${c.record.inputSummary}`);
          console.log(`    out: ${c.record.outputSummary}`);
          // The evidence is what lets a caller reject a borderline match on its
          // merits rather than trusting the number.
          const matched = c.evidence.map((e) => `${e.field}(${e.tokens.join(" ")})`).join(" ");
          console.log(`    matched on: ${matched}`);
        }
        if (result.status === "NO_MATCH") console.log("\n  Nothing suitable. Write it yourself.");
      }
      Deno.exit(result.status === "MATCH" ? 0 : 2);
      break;
    }

    case "invoke": {
      const capability = args.shift();
      if (!capability) {
        console.error("cfcm invoke needs a capability name");
        Deno.exit(3);
      }
      const returnMode = (option(args, "--return") ?? "result") as ReturnMode;

      const descriptor = await cfcm.describe(capability);

      if (flag(args, "--help")) {
        console.log(`${descriptor.name}  ${descriptor.version}\n  ${descriptor.description}\n`);
        console.log(describeArgs(descriptor.inputSchema));
        console.log(`\n  in:  ${descriptor.inputSummary}\n  out: ${descriptor.outputSummary}`);
        Deno.exit(0);
      }

      // Flags first, so what remains is positional.
      const flags = new Map<string, string[]>();
      const positionals: string[] = [];
      for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (!arg.startsWith("--")) {
          positionals.push(arg);
          continue;
        }
        const [name, inline] = arg.slice(2).split(/=(.*)/s);
        const next = args[i + 1];
        const value = inline ?? (next && !next.startsWith("--") ? (i++, next) : "");
        flags.set(name, [...(flags.get(name) ?? []), value]);
      }

      let input: unknown;
      if (positionals.length === 0 && flags.size === 0) {
        const raw = await readStdin();
        try {
          input = raw.trim() === "" ? undefined : JSON.parse(raw);
        } catch (err) {
          console.error(`stdin is not valid JSON: ${(err as Error).message}`);
          Deno.exit(3);
        }
      } else if (positionals[0] === "-") {
        const raw = await readStdin();
        input = raw.trim() === "" ? undefined : JSON.parse(raw);
      } else {
        input = buildInput(descriptor.inputSchema, { positionals, flags });
      }

      const result = await cfcm.invoke({ capability, input, options: { return: returnMode } });

      // Only the value, so the next command in the pipe gets what it expects.
      if (returnMode === "metadata") out(result.metadata, pretty || asJson);
      else if (returnMode === "artifact") console.log(result.artifact?.source ?? "");
      else if (returnMode === "result-and-artifact") out(result, pretty || asJson);
      else out(result.result, pretty || asJson);

      console.error(
        `${capability}  ${result.timings.executionMs} ms` +
          `${result.timings.artifactCacheHit ? "  (cached)" : ""}`,
      );
      break;
    }

    case "describe": {
      const capability = args.shift();
      if (!capability) {
        console.error("cfcm describe needs a capability name");
        Deno.exit(3);
      }
      out(await cfcm.describe(capability), true);
      break;
    }

    case "list": {
      const records = cfcm.list().sort((a, b) => a.name.localeCompare(b.name));
      if (asJson) {
        out(records.map((r) => ({ name: r.name, version: r.version, effect: r.effect })), pretty);
      } else {
        for (const r of records) {
          console.log(
            `${r.name.padEnd(38)} ${r.version.padEnd(8)} ${
              r.effect.padEnd(8)
            } [${r.namespaceType}]`,
          );
          console.log(`  ${r.description}`);
        }
        console.error(`\n${records.length} capabilities`);
      }
      break;
    }

    default:
      console.error(`unknown command: ${command}\n`);
      console.log(USAGE);
      Deno.exit(3);
  }
} catch (err) {
  if (err instanceof CfcmError) {
    console.error(`${err.code}: ${err.message}`);
    Deno.exit(1);
  }
  throw err;
}
