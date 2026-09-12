import { assert, assertEquals, assertStringIncludes, assertThrows } from "@std/assert";
import dataTable from "../artifact/index.ts";

const COLUMNS = [
  { key: "name", label: "Name" },
  { key: "amount", label: "Amount", type: "number" as const },
];

Deno.test("generates a named element with the expected column count", () => {
  const out = dataTable({ columns: COLUMNS });
  assertEquals(out.elementName, "cf-data-table");
  assertEquals(out.columnCount, 2);
  assertStringIncludes(out.javascript, 'customElements.define("cf-data-table"');
});

Deno.test("the class name is derived from the element name", () => {
  assertStringIncludes(dataTable({ columns: COLUMNS }).javascript, "class CfDataTable");
  assertStringIncludes(
    dataTable({ columns: COLUMNS, elementName: "acme-grid" }).javascript,
    "class AcmeGrid",
  );
});

Deno.test("a custom element name is honoured throughout", () => {
  const out = dataTable({ columns: COLUMNS, elementName: "netsi-table" });
  assertEquals(out.elementName, "netsi-table");
  assertStringIncludes(out.javascript, 'customElements.define("netsi-table"');
  assertStringIncludes(out.usageExample, "<netsi-table");
});

Deno.test("generated markup is a real table, not a div grid", () => {
  const js = dataTable({ columns: COLUMNS }).javascript;
  for (const tag of ["table", "thead", "tbody", "tr", "th", "td"]) {
    assertStringIncludes(js, `createElement("${tag}")`);
  }
});

Deno.test("sorting is announced through aria-sort", () => {
  const js = dataTable({ columns: COLUMNS }).javascript;
  assertStringIncludes(js, 'setAttribute("aria-sort"');
  // "none" must be present too: it is what tells a reader the column sorts.
  assertStringIncludes(js, '"none"');
});

Deno.test("sort controls are real buttons, so they are keyboard reachable", () => {
  const js = dataTable({ columns: COLUMNS }).javascript;
  assertStringIncludes(js, 'createElement("button")');
  assertStringIncludes(js, 'button.type = "button"');
});

Deno.test("cell values use textContent, never innerHTML", () => {
  const js = dataTable({ columns: COLUMNS }).javascript;
  assertStringIncludes(js, "td.textContent");
  // Match actual member access, so the explanatory comment in the generated
  // source does not trip the check.
  assert(!/\.innerHTML/.test(js), "generated code must never use innerHTML");
  assert(!/\.outerHTML/.test(js), "generated code must never use outerHTML");
  assert(!/insertAdjacentHTML\s*\(/.test(js), "generated code must never inject markup");
  assert(!/document\.write/.test(js), "generated code must never use document.write");
});

Deno.test("the generated element has no imports or dependencies", () => {
  const js = dataTable({ columns: COLUMNS }).javascript;
  assert(!/^import\s/m.test(js), "generated code must not import anything");
  assert(!js.includes("require("), "generated code must not require anything");
});

Deno.test("numeric columns align end by default, strings align start", () => {
  const js = dataTable({ columns: COLUMNS }).javascript;
  assertStringIncludes(js, '"align": "end"');
  assertStringIncludes(js, '"align": "start"');
});

Deno.test("an explicit align overrides the type default", () => {
  const js = dataTable({
    columns: [{ key: "amount", label: "Amount", type: "number", align: "center" }],
  }).javascript;
  assertStringIncludes(js, '"align": "center"');
});

Deno.test("sortable false disables sorting on every column", () => {
  const js = dataTable({ columns: COLUMNS, sortable: false }).javascript;
  assert(!js.includes('"sortable": true'), "no column should remain sortable");
});

Deno.test("a single column can opt out of sorting", () => {
  const js = dataTable({
    columns: [
      { key: "name", label: "Name" },
      { key: "actions", label: "Actions", sortable: false },
    ],
  }).javascript;
  assertStringIncludes(js, '"key": "actions"');
  assertStringIncludes(js, '"sortable": false');
  assertStringIncludes(js, '"sortable": true');
});

Deno.test("caption and empty text are embedded and overridable by attribute", () => {
  const js = dataTable({ columns: COLUMNS, caption: "Invoices", emptyText: "Nothing yet" })
    .javascript;
  assertStringIncludes(js, '"Invoices"');
  assertStringIncludes(js, '"Nothing yet"');
  assertStringIncludes(js, 'getAttribute("caption")');
  assertStringIncludes(js, 'getAttribute("empty-text")');
});

Deno.test("quotes in a caption cannot break out of the string literal", () => {
  const js = dataTable({ columns: COLUMNS, caption: 'He said "hi"; alert(1)//' }).javascript;
  assertStringIncludes(js, '"He said \\"hi\\"; alert(1)//"');
});

Deno.test("missing values are documented as sorting last", () => {
  const js = dataTable({ columns: COLUMNS }).javascript;
  assertStringIncludes(js, "if (left == null) return 1;");
  assertStringIncludes(js, "if (right == null) return -1;");
});

Deno.test("sorting copies rather than mutating the caller's array", () => {
  assertStringIncludes(dataTable({ columns: COLUMNS }).javascript, "[...this.#rows].sort");
});

Deno.test("the usage example mentions every column key", () => {
  const out = dataTable({ columns: COLUMNS });
  for (const column of COLUMNS) assertStringIncludes(out.usageExample, `"${column.key}"`);
  assertStringIncludes(out.usageExample, "sort-change");
});

Deno.test("deterministic across repeated calls", () => {
  const first = JSON.stringify(dataTable({ columns: COLUMNS, caption: "X" }));
  for (let i = 0; i < 50; i++) {
    assertEquals(JSON.stringify(dataTable({ columns: COLUMNS, caption: "X" })), first);
  }
});

Deno.test("rejects an element name without a hyphen", () => {
  assertThrows(() => dataTable({ columns: COLUMNS, elementName: "table" }), RangeError);
  assertThrows(() => dataTable({ columns: COLUMNS, elementName: "MyTable" }), RangeError);
  assertThrows(() => dataTable({ columns: COLUMNS, elementName: "-leading" }), RangeError);
});

Deno.test("rejects an element name reserved by the HTML spec", () => {
  assertThrows(() => dataTable({ columns: COLUMNS, elementName: "font-face" }), RangeError);
});

Deno.test("rejects empty or duplicated columns", () => {
  assertThrows(() => dataTable({ columns: [] }), RangeError);
  assertThrows(
    () => dataTable({ columns: [{ key: "a", label: "A" }, { key: "a", label: "B" }] }),
    RangeError,
  );
});

Deno.test("rejects a column missing a key or label", () => {
  assertThrows(() => dataTable({ columns: [{ key: "", label: "A" }] }), RangeError);
  assertThrows(() => dataTable({ columns: [{ key: "a", label: "" }] }), RangeError);
});

Deno.test("rejects an unknown column type or align", () => {
  assertThrows(
    () => dataTable({ columns: [{ key: "a", label: "A", type: "money" as never }] }),
    RangeError,
  );
  assertThrows(
    () => dataTable({ columns: [{ key: "a", label: "A", align: "middle" as never }] }),
    RangeError,
  );
});
