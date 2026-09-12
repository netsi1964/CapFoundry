import { assertEquals, assertThrows } from "@std/assert";
import echo from "../artifact/index.ts";

Deno.test("echoes a scalar unchanged", () => {
  assertEquals(echo({ value: 42 }).echoed, 42);
  assertEquals(echo({ value: "hello" }).echoed, "hello");
  assertEquals(echo({ value: true }).echoed, true);
});

Deno.test("echoes a structure unchanged", () => {
  const value = { a: [1, 2, { b: "c" }], d: null };
  assertEquals(echo({ value }).echoed, value);
});

Deno.test("a missing value echoes null rather than undefined", () => {
  // undefined has no JSON representation, so it must never cross the boundary.
  assertEquals(echo({}).echoed, null);
  assertEquals(echo({ value: undefined }).echoed, null);
});

Deno.test("the label round-trips", () => {
  assertEquals(echo({ value: 1, label: "probe-7" }).label, "probe-7");
  assertEquals(echo({ value: 1 }).label, null);
});

Deno.test("depth is reported for scalars", () => {
  assertEquals(echo({ value: 1 }).depth, 0);
  assertEquals(echo({ value: null }).depth, 0);
});

Deno.test("depth is reported for nested structures", () => {
  assertEquals(echo({ value: [1] }).depth, 1);
  assertEquals(echo({ value: { a: { b: 1 } } }).depth, 2);
  assertEquals(echo({ value: [[[1]]] }).depth, 3);
});

Deno.test("an empty container still counts as one level", () => {
  assertEquals(echo({ value: [] }).depth, 1);
  assertEquals(echo({ value: {} }).depth, 1);
});

Deno.test("depth takes the deepest branch, not the first", () => {
  assertEquals(echo({ value: { shallow: 1, deep: { a: { b: 1 } } } }).depth, 3);
});

Deno.test("deeply nested input does not blow the stack", () => {
  // deno-lint-ignore no-explicit-any
  let deep: any = 1;
  for (let i = 0; i < 200; i++) deep = [deep];
  assertEquals(typeof echo({ value: deep }).depth, "number");
});

Deno.test("a null or absent input is tolerated", () => {
  assertEquals(echo(null as never).echoed, null);
  assertEquals(echo(undefined as never).echoed, null);
});

Deno.test("deterministic across repeated calls", () => {
  const value = { a: [1, 2, 3], b: "x" };
  const first = JSON.stringify(echo({ value, label: "p" }));
  for (let i = 0; i < 100; i++) assertEquals(JSON.stringify(echo({ value, label: "p" })), first);
});

Deno.test("rejects a non-string label", () => {
  assertThrows(() => echo({ label: 7 as never }), TypeError);
});

Deno.test("rejects a non-object input", () => {
  assertThrows(() => echo("nope" as never), TypeError);
  assertThrows(() => echo(42 as never), TypeError);
});
