/**
 * Shell arguments from a capability's own inputSchema.
 *
 * The schema is already published, so making the user hand-write JSON was
 * asking them to do work the tool had the information to do. These tests pin
 * the three mapping rules and, more importantly, the refusals: a convenience
 * that guesses at the shape of someone's input becomes a bug report.
 */

import { assertEquals, assertStringIncludes, assertThrows } from "@std/assert";
import { buildInput as build, describeArgs } from "../cfcm/util/schema_args.ts";

/** buildInput returns unknown by design; tests know the shape they asked for. */
const buildInput = (schema: Parameters<typeof build>[0], a: Parameters<typeof build>[1]) =>
  build(schema, a) as Record<string, unknown>;
import { CfcmError } from "../cfcm/types.ts";

const args = (positionals: string[] = [], flags: Record<string, string[]> = {}) => ({
  positionals,
  flags: new Map(Object.entries(flags)),
});

const SLUGIFY = {
  type: "object",
  required: ["text"],
  properties: {
    text: { type: "string" },
    locale: { type: "string" },
    maxLength: { type: "integer" },
    lowercase: { type: "boolean" },
  },
};

// The wrapper pattern: a string wrapped in an object so fields can be added
// later without a breaking change.
const PLACES = {
  type: "object",
  required: ["from", "to"],
  properties: {
    from: { $ref: "#/$defs/place" },
    to: { $ref: "#/$defs/place" },
    unit: { enum: ["km", "mi"] },
  },
  $defs: {
    place: {
      type: "object",
      required: ["query"],
      properties: { query: { type: "string" }, countryCode: { type: "string" } },
    },
  },
};

const COORDS = {
  type: "object",
  required: ["from", "to"],
  properties: {
    from: {
      type: "object",
      required: ["lat", "lon"],
      properties: { lat: { type: "number" }, lon: { type: "number" } },
    },
    to: {
      type: "object",
      required: ["lat", "lon"],
      properties: { lat: { type: "number" }, lon: { type: "number" } },
    },
  },
};

Deno.test("a positional fills the first required property", () => {
  assertEquals(buildInput(SLUGIFY, args(["Hej Verden"])), { text: "Hej Verden" });
});

Deno.test("flags fill named properties and are coerced by the schema", () => {
  assertEquals(
    buildInput(SLUGIFY, args(["Hej"], { locale: ["da"], maxLength: ["20"], lowercase: ["false"] })),
    { text: "Hej", locale: "da", maxLength: 20, lowercase: false },
  );
});

Deno.test("a bare flag is true when the schema says boolean", () => {
  assertEquals(buildInput(SLUGIFY, args(["Hej"], { lowercase: [""] })).lowercase, true);
});

Deno.test("a positional is wrapped into a single-required-scalar object", () => {
  // The rule that makes `geocode Aarhus` mean {"query":"Aarhus"}.
  assertEquals(buildInput(PLACES, args(["Aarhus", "Skanderborg"])), {
    from: { query: "Aarhus" },
    to: { query: "Skanderborg" },
  });
});

Deno.test("wrapped positionals combine with dotted flags and options", () => {
  assertEquals(
    buildInput(PLACES, args(["Aarhus", "Berlin"], { "from.countryCode": ["DK"], unit: ["mi"] })),
    { from: { query: "Aarhus", countryCode: "DK" }, to: { query: "Berlin" }, unit: "mi" },
  );
});

Deno.test("dotted flags build nested objects with coerced numbers", () => {
  assertEquals(
    buildInput(
      COORDS,
      args([], {
        "from.lat": ["55.6"],
        "from.lon": ["12.5"],
        "to.lat": ["56.1"],
        "to.lon": ["10.2"],
      }),
    ),
    { from: { lat: 55.6, lon: 12.5 }, to: { lat: 56.1, lon: 10.2 } },
  );
});

Deno.test("an object needing two values refuses a positional and names the flags", () => {
  // Guessing which of lat/lon a bare "55.6" meant would be worse than refusing.
  const err = assertThrows(() => buildInput(COORDS, args(["55.6"])), CfcmError);
  assertStringIncludes(err.message, "--from.lat");
  assertStringIncludes(err.message, "--from.lon");
});

Deno.test("too many positionals is refused rather than silently dropped", () => {
  const err = assertThrows(() => buildInput(SLUGIFY, args(["a", "b"])), CfcmError);
  assertStringIncludes(err.message, "at most 1");
});

Deno.test("an unknown flag is refused and points at --help", () => {
  const err = assertThrows(
    () => buildInput(SLUGIFY, args(["Hej"], { nonsense: ["x"] })),
    CfcmError,
  );
  assertStringIncludes(err.message, "--help");
});

Deno.test("a non-numeric value for a number is refused with the field named", () => {
  const err = assertThrows(
    () => buildInput(COORDS, args([], { "from.lat": ["nord"] })),
    CfcmError,
  );
  assertStringIncludes(err.message, "from.lat");
  assertStringIncludes(err.message, "number");
});

Deno.test("a fractional value for an integer is refused", () => {
  assertThrows(() => buildInput(SLUGIFY, args(["Hej"], { maxLength: ["2.5"] })), CfcmError);
});

Deno.test("arrays come from repeated flags or one comma-separated value", () => {
  const schema = {
    type: "object",
    required: ["from"],
    properties: {
      from: { type: "string" },
      weekend: { type: "array", items: { type: "integer" } },
    },
  };
  assertEquals(buildInput(schema, args(["x"], { weekend: ["5", "6"] })).weekend, [5, 6]);
  assertEquals(buildInput(schema, args(["x"], { weekend: ["5,6"] })).weekend, [5, 6]);
});

Deno.test("JSON as the first argument is still used verbatim", () => {
  // The escape hatch: anything the mapping cannot express stays reachable.
  assertEquals(buildInput(SLUGIFY, args(['{"text":"Hej","locale":"da"}'])), {
    text: "Hej",
    locale: "da",
  });
});

Deno.test("malformed JSON is reported as JSON rather than as a positional", () => {
  const err = assertThrows(() => buildInput(SLUGIFY, args(['{"text":'])), CfcmError);
  assertStringIncludes(err.message, "looks like JSON");
});

Deno.test("no arguments at all yields undefined, so stdin can take over", () => {
  assertEquals(buildInput(SLUGIFY, args()), undefined);
});

Deno.test("help text names positionals, dotted flags and optional fields", () => {
  const help = describeArgs(PLACES);
  assertStringIncludes(help, "<from>");
  assertStringIncludes(help, "--unit <km|mi>");

  const coords = describeArgs(COORDS);
  assertStringIncludes(coords, "--from.lat");
});
