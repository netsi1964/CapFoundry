import { assertEquals, assertThrows } from "@std/assert";
import inferSchema from "../artifact/index.ts";

// deno-lint-ignore no-explicit-any
const infer = (data: unknown, options?: Record<string, unknown>): any =>
  inferSchema({ data, options: { includeSchemaKeyword: false, ...options } });

Deno.test("MVP section 11's own example", () => {
  assertEquals(infer({ name: "Alice", status: "active", age: 42 }), {
    type: "object",
    properties: {
      age: { type: "integer" },
      name: { type: "string" },
      status: { type: "string" },
    },
    required: ["age", "name", "status"],
  });
});

Deno.test("primitives", () => {
  assertEquals(infer("hello"), { type: "string" });
  assertEquals(infer(42), { type: "integer" });
  assertEquals(infer(4.2), { type: "number" });
  assertEquals(infer(true), { type: "boolean" });
  assertEquals(infer(null), { type: "null" });
});

Deno.test("the schema keyword is included by default", () => {
  assertEquals(
    inferSchema({ data: 1 }).$schema,
    "https://json-schema.org/draft/2020-12/schema",
  );
});

Deno.test("integer and number collapse to number", () => {
  // A field seen as both 3 and 3.5 must accept 3.5.
  assertEquals(infer([1, 2, 3.5]).items, { type: "number" });
  assertEquals(infer([1, 2, 3]).items, { type: "integer" });
});

Deno.test("mixed types become a sorted type array", () => {
  assertEquals(infer(["a", 1, true, null]).items.type, [
    "null",
    "boolean",
    "integer",
    "string",
  ]);
});

Deno.test("nested objects recurse", () => {
  assertEquals(infer({ user: { name: "A", address: { city: "CPH" } } }), {
    type: "object",
    properties: {
      user: {
        type: "object",
        properties: {
          address: {
            type: "object",
            properties: { city: { type: "string" } },
            required: ["city"],
          },
          name: { type: "string" },
        },
        required: ["address", "name"],
      },
    },
    required: ["user"],
  });
});

Deno.test("a single object makes every key required", () => {
  assertEquals(infer({ a: 1, b: 2 }).required, ["a", "b"]);
});

Deno.test("a key missing from one element is optional", () => {
  const schema = infer([{ a: 1, b: 2 }, { a: 3, b: 4 }, { a: 5 }]);
  assertEquals(schema.items.required, ["a"], "b appears in 2 of 3, so it is optional");
  assertEquals(Object.keys(schema.items.properties).sort(), ["a", "b"]);
});

Deno.test("a key present in every element stays required", () => {
  assertEquals(infer([{ a: 1 }, { a: 2 }, { a: 3 }]).items.required, ["a"]);
});

Deno.test("required is omitted entirely when nothing is required", () => {
  const schema = infer([{ a: 1 }, { b: 2 }]);
  assertEquals(schema.items.required, undefined);
});

Deno.test("items merges all elements, not just the first", () => {
  const schema = infer([{ a: 1 }, { a: 2, b: "x" }]);
  assertEquals(Object.keys(schema.items.properties).sort(), ["a", "b"]);
});

Deno.test("an always-empty array gets no items", () => {
  assertEquals(infer([]), { type: "array" });
  assertEquals(infer({ tags: [] }).properties.tags, { type: "array" });
});

Deno.test("an array empty in one sample and filled in another still gets items", () => {
  const schema = infer([{ tags: [] }, { tags: ["a"] }]);
  assertEquals(schema.items.properties.tags.items, { type: "string" });
});

Deno.test("nested arrays recurse", () => {
  assertEquals(infer([[1, 2], [3]]), {
    type: "array",
    items: { type: "array", items: { type: "integer" } },
  });
});

Deno.test("enum needs enough samples, few enough values, and a repeat", () => {
  // 4 samples, 2 distinct, repeats: qualifies.
  assertEquals(
    infer(["open", "closed", "open", "closed"]).items,
    { type: "string", enum: ["closed", "open"] },
  );
});

Deno.test("three distinct values with no repeat is free text, not an enum", () => {
  // The rule most inferrers get wrong: without a repeat there is no evidence
  // the set is closed, and the first unseen value would fail validation.
  assertEquals(infer(["draft", "sent", "paid"]).items, { type: "string" });
});

Deno.test("too many distinct values is not an enum", () => {
  const many = ["a", "b", "c", "d", "e", "f", "a"];
  assertEquals(infer(many).items, { type: "string" });
  // Raising the ceiling admits it.
  assertEquals(infer(many, { enumMaxValues: 6 }).items.enum, ["a", "b", "c", "d", "e", "f"]);
});

Deno.test("too few samples is not an enum", () => {
  assertEquals(infer(["x", "x"]).items, { type: "string" });
  assertEquals(infer(["x", "x"], { enumMinSamples: 2 }).items.enum, ["x"]);
});

Deno.test("a single scalar is never an enum", () => {
  assertEquals(infer("active"), { type: "string" });
});

Deno.test("enum values are sorted for stability", () => {
  assertEquals(infer(["z", "a", "m", "a"]).items.enum, ["a", "m", "z"]);
});

Deno.test("enum applies to a nested property", () => {
  const data = [
    { id: 1, status: "open" },
    { id: 2, status: "closed" },
    { id: 3, status: "open" },
  ];
  assertEquals(infer(data).items.properties.status.enum, ["closed", "open"]);
  assertEquals(infer(data).items.properties.id.type, "integer");
});

Deno.test("a nullable string is not given an enum", () => {
  // The type is no longer a pure string, so the closed-set claim would be
  // about something the samples do not establish.
  const schema = infer(["a", "b", "a", null]);
  assertEquals(schema.items.type, ["null", "string"]);
  assertEquals(schema.items.enum, undefined);
});

Deno.test("formats are detected when every string matches", () => {
  assertEquals(infer({ when: "2026-09-12" }).properties.when.format, "date");
  assertEquals(
    infer({ at: "2026-09-12T10:30:00Z" }).properties.at.format,
    "date-time",
  );
  assertEquals(infer({ who: "a@b.com" }).properties.who.format, "email");
  assertEquals(infer({ url: "https://example.com/x" }).properties.url.format, "uri");
  assertEquals(
    infer({ id: "123e4567-e89b-12d3-a456-426614174000" }).properties.id.format,
    "uuid",
  );
});

Deno.test("a format is not applied when only some strings match", () => {
  assertEquals(infer(["2026-09-12", "not a date"]).items.format, undefined);
});

Deno.test("format detection can be turned off", () => {
  assertEquals(infer({ when: "2026-09-12" }, { detectFormats: false }).properties.when, {
    type: "string",
  });
});

Deno.test("enum wins over format, never both", () => {
  const schema = infer(["2026-01-01", "2026-01-02", "2026-01-01"]);
  assertEquals(schema.items.enum, ["2026-01-01", "2026-01-02"]);
  assertEquals(schema.items.format, undefined);
});

Deno.test("output is byte-stable regardless of key order", () => {
  const a = JSON.stringify(infer({ b: 1, a: "x", c: true }));
  const b = JSON.stringify(infer({ c: true, a: "x", b: 1 }));
  assertEquals(a, b);
});

Deno.test("deterministic across repeated calls", () => {
  const data = [{ id: 1, status: "open" }, { id: 2, status: "closed" }, { id: 3, status: "open" }];
  const first = JSON.stringify(infer(data));
  for (let i = 0; i < 50; i++) assertEquals(JSON.stringify(infer(data)), first);
});

Deno.test("a realistic API response", () => {
  const schema = infer({
    page: 1,
    total: 2,
    items: [
      { id: "a1", status: "open", tags: ["x"], assignee: null },
      { id: "a2", status: "closed", tags: [], assignee: "bob" },
      { id: "a3", status: "open", tags: ["y", "z"] },
    ],
  });
  assertEquals(schema.required, ["items", "page", "total"]);
  const item = schema.properties.items.items;
  assertEquals(item.required, ["id", "status", "tags"], "assignee is missing from one element");
  assertEquals(item.properties.status.enum, ["closed", "open"]);
  assertEquals(item.properties.assignee.type, ["null", "string"]);
  assertEquals(item.properties.tags.items, { type: "string" });
});

Deno.test("rejects a non-finite number", () => {
  assertThrows(() => inferSchema({ data: { x: NaN } }), RangeError);
  assertThrows(() => inferSchema({ data: Infinity }), RangeError);
});

Deno.test("rejects data nested beyond maxDepth", () => {
  // deno-lint-ignore no-explicit-any
  let deep: any = 1;
  for (let i = 0; i < 20; i++) deep = { next: deep };
  assertThrows(() => inferSchema({ data: deep, options: { maxDepth: 5 } }), RangeError);
});

Deno.test("rejects invalid options and missing data", () => {
  assertThrows(() => inferSchema({ data: 1, options: { enumMinSamples: 1 } }), RangeError);
  assertThrows(() => inferSchema({ data: 1, options: { enumMaxValues: 0 } }), RangeError);
  assertThrows(() => inferSchema({} as never), TypeError);
});
