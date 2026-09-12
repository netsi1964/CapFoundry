import { assertEquals, assertThrows } from "@std/assert";
import editDistance from "../artifact/index.ts";

const d = (a: string, b: string) => editDistance({ a, b }).distance;

Deno.test("textbook cases", () => {
  assertEquals(d("kitten", "sitting"), 3);
  assertEquals(d("saturday", "sunday"), 3);
  assertEquals(d("flaw", "lawn"), 2);
  assertEquals(d("book", "back"), 2);
});

Deno.test("identical strings are zero", () => {
  assertEquals(d("abc", "abc"), 0);
  assertEquals(d("", ""), 0);
});

Deno.test("an empty string costs the length of the other", () => {
  assertEquals(d("", "hello"), 5);
  assertEquals(d("hello", ""), 5);
});

Deno.test("single operations cost one", () => {
  assertEquals(d("cat", "cats"), 1, "insertion");
  assertEquals(d("cats", "cat"), 1, "deletion");
  assertEquals(d("cat", "bat"), 1, "substitution");
});

Deno.test("symmetric in both directions", () => {
  for (const [a, b] of [["kitten", "sitting"], ["", "abc"], ["rødgrød", "rodgrod"]]) {
    assertEquals(d(a, b), d(b, a), `${a} vs ${b}`);
  }
});

Deno.test("obeys the triangle inequality", () => {
  const [a, b, c] = ["kitten", "sitting", "mittens"];
  assertEquals(d(a, c) <= d(a, b) + d(b, c), true);
});

Deno.test("counts code points, not UTF-16 units", () => {
  // "😀" is two UTF-16 units; naive .length would make this 2.
  assertEquals(d("😀a", "a"), 1);
  assertEquals(d("😀", ""), 1);
  assertEquals(editDistance({ a: "😀😀", b: "" }).lengths.a, 2);
});

Deno.test("handles Danish characters as single characters", () => {
  assertEquals(d("rødgrød", "rodgrod"), 2);
  assertEquals(d("æble", "able"), 1);
  // Each ø to oe is one substitution plus one insertion.
  assertEquals(d("rødgrød-med-fløde", "roedgroed-med-floede"), 6);
});

Deno.test("a combining sequence counts as two, as documented", () => {
  // NFD "e" + combining acute versus precomposed NFC.
  assertEquals(d("é", "é"), 2);
  // Normalising first gives the answer most callers expect.
  assertEquals(d("é".normalize("NFC"), "é"), 0);
});

Deno.test("transposition costs two, not one — this is not Damerau", () => {
  assertEquals(d("ab", "ba"), 2);
  assertEquals(d("form", "from"), 2);
});

Deno.test("similarity is 1 for identical and 0 for nothing shared", () => {
  assertEquals(editDistance({ a: "abc", b: "abc" }).similarity, 1);
  assertEquals(editDistance({ a: "abc", b: "xyz" }).similarity, 0);
});

Deno.test("two empty strings are identical, not a division by zero", () => {
  assertEquals(editDistance({ a: "", b: "" }).similarity, 1);
});

Deno.test("similarity normalises by the longer string", () => {
  // distance 2 against a longest length of 4.
  assertEquals(editDistance({ a: "abcd", b: "abxy" }).similarity, 0.5);
});

Deno.test("lengths report what was actually compared", () => {
  const out = editDistance({ a: "😀ab", b: "" });
  assertEquals(out.lengths, { a: 3, b: 0 });
});

Deno.test("argument order does not affect the result", () => {
  // The shorter string is swapped onto the row axis internally.
  const forward = editDistance({ a: "a", b: "abcdefghij" });
  const backward = editDistance({ a: "abcdefghij", b: "a" });
  assertEquals(forward.distance, backward.distance);
  assertEquals(forward.similarity, backward.similarity);
  assertEquals(forward.lengths, { a: 1, b: 10 });
  assertEquals(backward.lengths, { a: 10, b: 1 });
});

Deno.test("long strings stay correct", () => {
  const a = "x".repeat(500);
  assertEquals(d(a, a), 0);
  assertEquals(d(a, a + "y"), 1);
  assertEquals(d(a, ""), 500);
});

Deno.test("deterministic across repeated calls", () => {
  const first = JSON.stringify(editDistance({ a: "kitten", b: "sitting" }));
  for (let i = 0; i < 100; i++) {
    assertEquals(JSON.stringify(editDistance({ a: "kitten", b: "sitting" })), first);
  }
});

Deno.test("rejects non-string input", () => {
  assertThrows(() => editDistance({ a: "x", b: 1 as never }), TypeError);
  assertThrows(() => editDistance({ a: null as never, b: "x" }), TypeError);
  assertThrows(() => editDistance(null as never), TypeError);
});
