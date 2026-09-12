/**
 * Turning shell arguments into capability input, using the capability's own
 * inputSchema.
 *
 * Every capability publishes a schema, so requiring a hand-written JSON object
 * at the command line was asking the user to do work the tool already had the
 * information to do. A CLI that makes you write `'{"text":"…"}'` is a CLI for
 * people who could have written the script anyway.
 *
 * Three rules, in order of how obvious they are:
 *
 *  1. A positional argument fills the next required property.
 *  2. `--name value` fills a named property; `--a.b value` fills a nested one.
 *  3. A positional filling a property that is an *object with a single
 *     required scalar* gets wrapped into it.
 *
 * Rule 3 is the one that earns its keep. Contracts often wrap a string as
 * `{ "query": "…" }` so that `countryCode` can be added later without a
 * breaking change — good design that would otherwise make the command line
 * worse than the contract deserves. With it, `geocode Aarhus` works and still
 * means `{"query":"Aarhus"}`.
 *
 * Anything ambiguous is refused with a message naming the arguments the
 * capability actually wants. Guessing at the shape of someone's input is how a
 * convenience becomes a bug report.
 */

import type { JsonSchema } from "../types.ts";
import { CfcmError } from "../types.ts";

export interface ParsedArgs {
  positionals: string[];
  flags: Map<string, string[]>;
}

const SCALARS = ["string", "number", "integer", "boolean"];

function resolveRef(schema: JsonSchema, root: JsonSchema): JsonSchema {
  if (typeof schema?.$ref !== "string") return schema;
  const prefix = "#/$defs/";
  if (!schema.$ref.startsWith(prefix)) return schema;
  return (root.$defs as Record<string, JsonSchema>)?.[schema.$ref.slice(prefix.length)] ?? schema;
}

function coerce(raw: string, schema: JsonSchema, path: string): unknown {
  const type = Array.isArray(schema?.type) ? schema.type[0] : schema?.type;

  switch (type) {
    case "number":
    case "integer": {
      const value = Number(raw);
      if (!Number.isFinite(value)) {
        throw new CfcmError("ARG_INVALID", `--${path} expects a number, got "${raw}"`);
      }
      if (type === "integer" && !Number.isInteger(value)) {
        throw new CfcmError("ARG_INVALID", `--${path} expects a whole number, got "${raw}"`);
      }
      return value;
    }
    case "boolean": {
      if (["true", "yes", "1", ""].includes(raw)) return true;
      if (["false", "no", "0"].includes(raw)) return false;
      throw new CfcmError("ARG_INVALID", `--${path} expects true or false, got "${raw}"`);
    }
    case "array": {
      // Repeated flags build the array; a single comma-separated value is a
      // convenience for the common case.
      const items = resolveRef(schema.items ?? {}, schema);
      return raw.split(",").map((part) => coerce(part.trim(), items, path));
    }
    default:
      return raw;
  }
}

/** The single required scalar a positional can be wrapped into, if there is one. */
function wrapperField(schema: JsonSchema, root: JsonSchema): string | null {
  const resolved = resolveRef(schema, root);
  if (resolved?.type !== "object") return null;
  const required = (resolved.required ?? []) as string[];
  if (required.length !== 1) return null;

  const target = resolveRef((resolved.properties ?? {})[required[0]] ?? {}, root);
  const type = Array.isArray(target?.type) ? target.type[0] : target?.type;
  return SCALARS.includes(type) ? required[0] : null;
}

function assign(target: Record<string, unknown>, path: string[], value: unknown): void {
  let node = target;
  for (const key of path.slice(0, -1)) {
    if (typeof node[key] !== "object" || node[key] === null) node[key] = {};
    node = node[key] as Record<string, unknown>;
  }
  node[path[path.length - 1]] = value;
}

function schemaAt(root: JsonSchema, path: string[]): JsonSchema {
  let node = resolveRef(root, root);
  for (const key of path) {
    node = resolveRef((node?.properties ?? {})[key] ?? {}, root);
  }
  return node;
}

/**
 * Whether a field can be expressed on a command line at all.
 *
 * An array of objects cannot: there is no ordering of bare words that means
 * `[{key, label}, {key, label}]` without inventing a syntax. Saying so in the
 * help is the point — the first version printed `<columns>` for exactly that
 * case, which told the reader to try something that could not work and let
 * schema validation deliver the bad news afterwards.
 */
function argShape(name: string, property: JsonSchema, root: JsonSchema): string | null {
  const resolved = resolveRef(property, root);
  const type = Array.isArray(resolved?.type) ? resolved.type[0] : resolved?.type;

  if (wrapperField(property, root)) return `<${name}>`;

  if (type === "array") {
    const items = resolveRef(resolved.items ?? {}, root);
    const itemType = Array.isArray(items?.type) ? items.type[0] : items?.type;
    if (itemType === "object" || itemType === "array") return null;
    return `--${name} <a,b,…>`;
  }

  if (type === "object") {
    const fields = Object.keys(resolved.properties ?? {});
    return fields.length > 0 ? fields.map((k) => `--${name}.${k}`).join(" ") : null;
  }

  return `<${name}>`;
}

/** Human-readable usage derived from the schema, for `--help`. */
export function describeArgs(schema: JsonSchema): string {
  const required = (schema?.required ?? []) as string[];
  const properties = (schema?.properties ?? {}) as Record<string, JsonSchema>;
  const lines: string[] = [];
  const jsonOnly: string[] = [];

  for (const name of required) {
    const shape = argShape(name, properties[name] ?? {}, schema);
    if (shape === null) {
      jsonOnly.push(name);
      lines.push(`  ${`(${name})`.padEnd(32)} required — JSON only`);
      continue;
    }
    lines.push(`  ${shape.padEnd(32)} required`);
  }

  for (const [name, property] of Object.entries(properties)) {
    if (required.includes(name)) continue;
    const resolved = resolveRef(property, schema);
    const shape = argShape(name, property, schema);
    if (shape === null) {
      jsonOnly.push(name);
      lines.push(`  ${`(${name})`.padEnd(32)} optional — JSON only`);
      continue;
    }
    const hint = resolved.enum ? resolved.enum.join("|") : (resolved.type ?? "value");
    const rendered = shape.startsWith("<") ? `--${name} <${hint}>` : shape;
    lines.push(`  ${rendered.padEnd(32)} optional`);
  }

  if (jsonOnly.length > 0) {
    lines.push("");
    lines.push(
      `  ${jsonOnly.join(" and ")} cannot be written as flags — pass the whole input as JSON:`,
    );
    lines.push(`    cfcm invoke <capability> '{ "${jsonOnly[0]}": [ … ] }'`);
  }

  return lines.join("\n");
}

export function buildInput(schema: JsonSchema, args: ParsedArgs): unknown {
  // Escape hatch: a JSON object as the first argument is used verbatim, so
  // anything the mapping cannot express is still reachable.
  const first = args.positionals[0];
  if (first && /^\s*[{[]/.test(first)) {
    try {
      return JSON.parse(first);
    } catch (err) {
      throw new CfcmError(
        "ARG_INVALID",
        `input looks like JSON but is not: ${(err as Error).message}`,
      );
    }
  }

  if (args.positionals.length === 0 && args.flags.size === 0) return undefined;

  const required = (schema?.required ?? []) as string[];
  const properties = (schema?.properties ?? {}) as Record<string, JsonSchema>;
  const input: Record<string, unknown> = {};

  if (args.positionals.length > required.length) {
    throw new CfcmError(
      "ARG_INVALID",
      `expected at most ${required.length} positional argument(s) (${required.join(", ")}), ` +
        `got ${args.positionals.length}. Name the rest with --flags.`,
    );
  }

  args.positionals.forEach((raw, i) => {
    const name = required[i];
    const property = properties[name] ?? {};
    const wrapper = wrapperField(property, schema);

    if (wrapper) {
      const inner = schemaAt(schema, [name, wrapper]);
      input[name] = { [wrapper]: coerce(raw, inner, `${name}.${wrapper}`) };
      return;
    }

    const resolved = resolveRef(property, schema);
    const type = Array.isArray(resolved?.type) ? resolved.type[0] : resolved?.type;
    if (type === "array") {
      const items = resolveRef(resolved.items ?? {}, schema);
      const itemType = Array.isArray(items?.type) ? items.type[0] : items?.type;
      if (itemType === "object" || itemType === "array") {
        throw new CfcmError(
          "ARG_INVALID",
          `"${name}" is a list of objects, which has no command-line form. Pass the whole ` +
            `input as JSON: cfcm invoke <capability> '{ "${name}": [ … ] }'`,
        );
      }
      input[name] = coerce(raw, resolved, name);
      return;
    }
    if (type === "object") {
      const fields = Object.keys(resolved.properties ?? {}).map((k) => `--${name}.${k}`);
      throw new CfcmError(
        "ARG_INVALID",
        `"${name}" is not a single value. Give it as ${fields.join(" ")}, or pass the whole ` +
          "input as JSON.",
      );
    }
    input[name] = coerce(raw, resolved, name);
  });

  for (const [flag, values] of args.flags) {
    const path = flag.split(".");
    const target = schemaAt(schema, path);
    if (Object.keys(target).length === 0 && !(path[0] in properties)) {
      throw new CfcmError(
        "ARG_INVALID",
        `--${flag} is not part of this capability's input. Run with --help to see what is.`,
      );
    }
    const value = target?.type === "array"
      ? values.flatMap((v) => coerce(v, target, flag) as unknown[])
      : coerce(values[values.length - 1], target, flag);
    assign(input, path, value);
  }

  return input;
}
