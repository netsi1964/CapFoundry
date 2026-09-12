import { assert, assertEquals, assertThrows } from "@std/assert";
import detectDelimiter from "../artifact/index.ts";

const detect = (text: string, opts: Record<string, unknown> = {}) =>
  detectDelimiter({ text, ...opts });

Deno.test("plain comma-separated data", () => {
  const out = detect("name,age,city\nAlice,30,Copenhagen\nBob,41,Aarhus");
  assertEquals(out.delimiter, ",");
  assertEquals(out.fieldCount, 3);
  assert(out.confidence > 0.8, `confidence was ${out.confidence}`);
});

Deno.test("semicolon export, the European spreadsheet default", () => {
  const out = detect("name;age;city\nAlice;30;Copenhagen\nBob;41;Aarhus");
  assertEquals(out.delimiter, ";");
  assertEquals(out.fieldCount, 3);
});

Deno.test("tab separated", () => {
  const out = detect("name\tage\nAlice\t30\nBob\t41");
  assertEquals(out.delimiter, "\t");
  assertEquals(out.fieldCount, 2);
});

Deno.test("pipe separated", () => {
  const out = detect("name|age\nAlice|30\nBob|41");
  assertEquals(out.delimiter, "|");
});

Deno.test("consistency beats frequency: prose commas do not outvote real pipes", () => {
  // Every row has more commas than pipes, but only the pipe count is stable.
  const text = [
    "id|description",
    "1|apples, pears, and plums",
    "2|salt, pepper, oil, and butter",
    "3|one, two",
  ].join("\n");
  const out = detect(text);
  assertEquals(out.delimiter, "|", `picked ${JSON.stringify(out.delimiter)}`);

  const comma = out.evidence.find((e) => e.delimiter === ",")!;
  const pipe = out.evidence.find((e) => e.delimiter === "|")!;
  assert(comma.averagePerRow > pipe.averagePerRow, "the test premise requires more commas");
  assert(pipe.score > comma.score, "consistency must dominate the score");
});

Deno.test("delimiters inside quotes do not split", () => {
  const text = [
    "name;note",
    '"Smith, John";"lives in Aarhus, Denmark"',
    '"Doe, Jane";"moved from Oslo, Norway"',
  ].join("\n");
  const out = detect(text);
  assertEquals(out.delimiter, ";");
  assertEquals(out.fieldCount, 2);
});

Deno.test("a newline inside a quoted field does not start a new row", () => {
  const text = 'id,note\n1,"line one\nline two"\n2,"plain"';
  const out = detect(text);
  assertEquals(out.delimiter, ",");
  assertEquals(out.fieldCount, 2);
  assertEquals(out.evidence[0].rowsExamined, 3, "the quoted newline must not add a row");
});

Deno.test("an escaped doubled quote is handled", () => {
  const text = 'id,note\n1,"she said ""hi, there"""\n2,"ok"';
  const out = detect(text);
  assertEquals(out.delimiter, ",");
  assertEquals(out.fieldCount, 2);
});

Deno.test("CRLF line endings work", () => {
  const out = detect("a,b\r\n1,2\r\n3,4");
  assertEquals(out.delimiter, ",");
  assertEquals(out.fieldCount, 2);
});

Deno.test("blank lines are ignored", () => {
  const out = detect("a,b\n\n1,2\n\n\n3,4\n");
  assertEquals(out.delimiter, ",");
  assertEquals(out.evidence[0].rowsExamined, 3);
});

Deno.test("a trailing comment row does not outvote the data", () => {
  const out = detect("a;b;c\n1;2;3\n4;5;6\n7;8;9\nend of file");
  assertEquals(out.delimiter, ";");
  assertEquals(out.fieldCount, 3);
});

Deno.test("a single row is answered but flagged and capped", () => {
  const out = detect("a,b,c");
  assertEquals(out.delimiter, ",");
  assertEquals(out.reason, "SINGLE_ROW");
  assert(out.confidence <= 0.5, `single-row confidence was ${out.confidence}`);
});

Deno.test("text with no candidate present returns null rather than guessing", () => {
  const out = detect("just some prose\nwith no separators at all\nnothing here");
  assertEquals(out.delimiter, null);
  assertEquals(out.fieldCount, null);
  assertEquals(out.confidence, 0);
  assertEquals(out.reason, "NO_CANDIDATE_PRESENT");
});

Deno.test("empty input returns NO_ROWS", () => {
  assertEquals(detect("").reason, "NO_ROWS");
  assertEquals(detect("   \n  \n ").reason, "NO_ROWS");
  assertEquals(detect("").delimiter, null);
});

Deno.test("custom candidates are honoured and defaults are not consulted", () => {
  const out = detect("a:b:c\n1:2:3\n4:5:6", { candidates: [":"] });
  assertEquals(out.delimiter, ":");
  assertEquals(out.fieldCount, 3);
  assertEquals(out.evidence.length, 1);
});

Deno.test("maxRows bounds the work", () => {
  const text = Array.from({ length: 500 }, (_, i) => `${i},${i * 2}`).join("\n");
  assertEquals(detect(text, { maxRows: 10 }).evidence[0].rowsExamined, 10);
});

Deno.test("ragged rows lower consistency and confidence", () => {
  const clean = detect("a,b,c\n1,2,3\n4,5,6\n7,8,9");
  const ragged = detect("a,b,c\n1,2\n4,5,6,7\n8");
  assert(
    ragged.confidence < clean.confidence,
    `ragged ${ragged.confidence} should be below clean ${clean.confidence}`,
  );
});

Deno.test("evidence covers every candidate and is sorted best first", () => {
  const out = detect("a;b\n1;2\n3;4");
  assertEquals(out.evidence.length, 4);
  for (let i = 1; i < out.evidence.length; i++) {
    assert(out.evidence[i - 1].score >= out.evidence[i].score, "evidence must be sorted by score");
  }
});

Deno.test("deterministic across repeated calls", () => {
  const text = "name;age\nAlice;30\nBob;41";
  const first = JSON.stringify(detect(text));
  for (let i = 0; i < 100; i++) assertEquals(JSON.stringify(detect(text)), first);
});

Deno.test("rejects the quote character as a candidate", () => {
  assertThrows(() => detectDelimiter({ text: "a,b", candidates: ['"'] }), RangeError);
});

Deno.test("rejects multi-character candidates and an empty list", () => {
  assertThrows(() => detectDelimiter({ text: "a,b", candidates: ["::"] }), RangeError);
  assertThrows(() => detectDelimiter({ text: "a,b", candidates: [] }), RangeError);
});

Deno.test("rejects a non-positive maxRows and non-string text", () => {
  assertThrows(() => detectDelimiter({ text: "a,b", maxRows: 0 }), RangeError);
  assertThrows(() => detectDelimiter({ text: 42 as never }), TypeError);
});
