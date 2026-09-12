/**
 * CapFoundry.json.schema.infer
 *
 * Infers a JSON Schema (draft 2020-12) from an example JSON value.
 *
 * This is the benchmark capability (MVP section 37): it exists to be compared
 * against asking a model to do the same job. That comparison is only
 * meaningful if the rules are pinned down, so every inference below is stated
 * as a rule rather than left to judgement. An LLM will produce a *plausible*
 * schema; this produces the *same* schema every time, and you can read why.
 *
 * The design is two-pass. First it walks the value building an observation
 * tree that records what was actually seen — which types, which keys, how
 * often, which string values. Then it converts observations to a schema.
 * Merging schemas directly would work for types but would lose the frequency
 * information that enum and required inference depend on.
 *
 * ## The rules
 *
 * Types      A number is `integer` when every observation is a whole number,
 *            otherwise `number`. Mixed types become a sorted type array, and
 *            integer+number collapses to number.
 *
 * Required   For a single object, every key is required. For an array of
 *            objects, a key is required only when it appears in *every*
 *            element. A key present in 9 of 10 samples is optional, because
 *            the tenth is direct evidence that it can be absent.
 *
 * Arrays     `items` is the merged observation of all elements, so a
 *            heterogeneous array yields a type union rather than the first
 *            element's shape. An array observed only ever empty gets no
 *            `items`: there is no evidence to write one from.
 *
 * Enums      Only for strings, and only with evidence of a closed set: at
 *            least `enumMinSamples` observations (default 3), at most
 *            `enumMaxValues` distinct (default 5), and at least one repeat.
 *            Without a repeat, three samples of three distinct values is a
 *            free-text field, not an enum. A single scalar is never an enum.
 *
 * Formats    Applied only when every observed string matches, and never
 *            alongside an enum, which is the more specific statement.
 *
 * Ordering   Keys, enum values and type arrays are all sorted, so the output
 *            is byte-stable across runs.
 *
 * PURE: no network, no filesystem, no clock, no randomness.
 */

export interface InferInput {
  data: unknown;
  options?: {
    enumMinSamples?: number;
    enumMaxValues?: number;
    detectFormats?: boolean;
    includeSchemaKeyword?: boolean;
    maxDepth?: number;
  };
}

// deno-lint-ignore no-explicit-any
export type JsonSchema = Record<string, any>;

type TypeName = "null" | "boolean" | "integer" | "number" | "string" | "array" | "object";

const TYPE_ORDER: TypeName[] = [
  "null",
  "boolean",
  "integer",
  "number",
  "string",
  "array",
  "object",
];

interface Observation {
  types: Set<TypeName>;
  /** Total values observed at this position. */
  count: number;
  stringValues: string[];
  /** Number of observed values that were objects. */
  objectCount: number;
  properties: Map<string, Observation>;
  /** How many of the observed objects carried each key. */
  presence: Map<string, number>;
  items: Observation | null;
  /** True when at least one non-empty array was seen. */
  sawArrayElements: boolean;
}

/** Cap on retained string samples: enough for enum evidence, bounded memory. */
const MAX_STRING_SAMPLES = 2000;

const FORMATS: [string, RegExp][] = [
  ["date-time", /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/],
  ["date", /^\d{4}-\d{2}-\d{2}$/],
  ["time", /^\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})?$/],
  ["uuid", /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/],
  ["email", /^[^@\s]+@[^@\s.]+\.[^@\s]+$/],
  ["uri", /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s]+$/],
];

function newObservation(): Observation {
  return {
    types: new Set(),
    count: 0,
    stringValues: [],
    objectCount: 0,
    properties: new Map(),
    presence: new Map(),
    items: null,
    sawArrayElements: false,
  };
}

function observe(node: Observation, value: unknown, depth: number, maxDepth: number): void {
  if (depth > maxDepth) {
    throw new RangeError(`data nests deeper than maxDepth (${maxDepth})`);
  }

  node.count++;

  if (value === null) {
    node.types.add("null");
    return;
  }

  if (Array.isArray(value)) {
    node.types.add("array");
    if (value.length > 0) {
      node.sawArrayElements = true;
      node.items ??= newObservation();
      for (const element of value) observe(node.items, element, depth + 1, maxDepth);
    }
    return;
  }

  switch (typeof value) {
    case "boolean":
      node.types.add("boolean");
      return;

    case "number":
      if (!Number.isFinite(value)) {
        throw new RangeError("data contains a non-finite number, which JSON cannot represent");
      }
      node.types.add(Number.isInteger(value) ? "integer" : "number");
      return;

    case "string":
      node.types.add("string");
      if (node.stringValues.length < MAX_STRING_SAMPLES) node.stringValues.push(value);
      return;

    case "object": {
      node.types.add("object");
      node.objectCount++;
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        if (!node.properties.has(key)) node.properties.set(key, newObservation());
        node.presence.set(key, (node.presence.get(key) ?? 0) + 1);
        observe(node.properties.get(key)!, child, depth + 1, maxDepth);
      }
      return;
    }

    default:
      throw new TypeError(`data contains a ${typeof value}, which JSON cannot represent`);
  }
}

interface ResolvedOptions {
  enumMinSamples: number;
  enumMaxValues: number;
  detectFormats: boolean;
  maxDepth: number;
}

function resolveTypes(types: Set<TypeName>): TypeName[] {
  const resolved = new Set(types);
  // A field seen as both 3 and 3.5 is a number; keeping "integer" alongside
  // would reject 3.5 against the schema it was inferred from.
  if (resolved.has("number")) resolved.delete("integer");
  return TYPE_ORDER.filter((t) => resolved.has(t));
}

function detectFormat(values: string[]): string | null {
  if (values.length === 0) return null;
  for (const [format, pattern] of FORMATS) {
    if (values.every((v) => pattern.test(v))) return format;
  }
  return null;
}

function toSchema(node: Observation, options: ResolvedOptions): JsonSchema {
  const types = resolveTypes(node.types);

  // No observations at all: an empty array's items node, for instance.
  if (types.length === 0) return {};

  const schema: JsonSchema = {};
  schema.type = types.length === 1 ? types[0] : types;

  if (node.types.has("string")) {
    const distinct = [...new Set(node.stringValues)].sort();
    const isPureString = types.length === 1;
    const hasRepeat = distinct.length < node.stringValues.length;

    const enumQualifies = isPureString &&
      node.stringValues.length >= options.enumMinSamples &&
      distinct.length <= options.enumMaxValues &&
      hasRepeat;

    if (enumQualifies) {
      schema.enum = distinct;
    } else if (options.detectFormats) {
      // Never both: an enum already states the closed set exactly, and a
      // format alongside it is redundant at best and contradictory at worst.
      const format = detectFormat(node.stringValues);
      if (format) schema.format = format;
    }
  }

  if (node.types.has("object") && node.properties.size > 0) {
    const properties: JsonSchema = {};
    const required: string[] = [];

    for (const key of [...node.properties.keys()].sort()) {
      properties[key] = toSchema(node.properties.get(key)!, options);
      // Required means "seen in every object at this position". One absence is
      // evidence of optionality.
      if (node.presence.get(key) === node.objectCount) required.push(key);
    }

    schema.properties = properties;
    if (required.length > 0) schema.required = required;
  }

  if (node.types.has("array") && node.sawArrayElements && node.items) {
    schema.items = toSchema(node.items, options);
  }

  return schema;
}

export default function inferSchema(input: InferInput): JsonSchema {
  if (!input || typeof input !== "object" || !("data" in input)) {
    throw new TypeError("input must be an object with a data field");
  }

  const raw = input.options ?? {};
  const options: ResolvedOptions = {
    enumMinSamples: raw.enumMinSamples ?? 3,
    enumMaxValues: raw.enumMaxValues ?? 5,
    detectFormats: raw.detectFormats ?? true,
    maxDepth: raw.maxDepth ?? 64,
  };

  if (!Number.isInteger(options.enumMinSamples) || options.enumMinSamples < 2) {
    throw new RangeError("enumMinSamples must be an integer of at least 2");
  }
  if (!Number.isInteger(options.enumMaxValues) || options.enumMaxValues < 1) {
    throw new RangeError("enumMaxValues must be a positive integer");
  }
  if (!Number.isInteger(options.maxDepth) || options.maxDepth < 1) {
    throw new RangeError("maxDepth must be a positive integer");
  }

  const root = newObservation();
  observe(root, input.data, 0, options.maxDepth);

  const schema = toSchema(root, options);
  if (raw.includeSchemaKeyword ?? true) {
    return { $schema: "https://json-schema.org/draft/2020-12/schema", ...schema };
  }
  return schema;
}
