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

// ---- rows, the usage example and the preview (1.1.0) ----

const ROWS = [
  { name: "Nordlys Analyse ApS", amount: 12450, due: "2026-09-30" },
  { name: "Fjordbyg Entreprise A/S", amount: 3200.5, due: "2026-10-15" },
  { name: "Vestegnens Kommune", amount: 87999.95, due: "2026-09-18" },
  { name: "Søgaard & Vinther I/S", amount: 450, due: "2026-11-01" },
];

Deno.test("rows are reported and reach the usage example", () => {
  const out = dataTable({ columns: COLUMNS, rows: ROWS });
  assertEquals(out.rowCount, 4);
  for (const row of ROWS) assertStringIncludes(out.usageExample, row.name);
});

Deno.test("rows never become part of the component", () => {
  // A generator that baked the caller's data into a reusable element would
  // have produced something reusable by nobody.
  const out = dataTable({ columns: COLUMNS, rows: ROWS });
  for (const row of ROWS) {
    assert(
      !out.javascript.includes(row.name),
      `${row.name} leaked into the component rather than staying sample data`,
    );
  }
});

Deno.test("without rows the example falls back to a shaped placeholder", () => {
  const out = dataTable({ columns: COLUMNS });
  assertEquals(out.rowCount, 0);
  assertStringIncludes(out.usageExample, '"name"');
  assertStringIncludes(out.usageExample, '"amount"');
});

Deno.test("the preview is a whole document that carries the component and the rows", () => {
  const out = dataTable({ columns: COLUMNS, rows: ROWS, elementName: "netsi-table" });
  assertStringIncludes(out.preview, "<!doctype html>");
  // The same component, embedded — not a second renderer that has to agree
  // with the first.
  assertStringIncludes(out.preview, "class NetsiTable");
  assertStringIncludes(out.preview, '<netsi-table id="preview">');
  assertStringIncludes(out.preview, "Nordlys Analyse ApS");
});

Deno.test("a closing script tag in row data cannot end the preview's script block", () => {
  // The one injection a document assembled this way is actually exposed to.
  const out = dataTable({
    columns: COLUMNS,
    rows: [{ name: "</script><img src=x onerror=alert(1)>", amount: 1 }],
  });
  assert(!out.preview.includes("</script><img"), "row data closed the script block");
  assertStringIncludes(out.preview, "<\\/script>");
});

Deno.test("a caption with markup is escaped in the preview title", () => {
  const out = dataTable({ columns: COLUMNS, caption: '<img src=x> & "quoted"' });
  assertStringIncludes(out.preview, "<title>&lt;img src=x&gt; &amp; &quot;quoted&quot;</title>");
});

Deno.test("rows are capped, with the reason given", () => {
  const many = Array.from({ length: 101 }, (_, i) => ({ name: `r${i}`, amount: i }));
  const err = assertThrows(() => dataTable({ columns: COLUMNS, rows: many }), RangeError);
  assertStringIncludes(err.message, "not a dataset");
});

Deno.test("rejects rows that are not objects", () => {
  assertThrows(() => dataTable({ columns: COLUMNS, rows: ["a"] as never }), TypeError);
  assertThrows(() => dataTable({ columns: COLUMNS, rows: [[1, 2]] as never }), TypeError);
});

Deno.test("a row missing a column is allowed and left to the component", () => {
  // The component renders an empty cell; refusing here would make the
  // capability stricter than the thing it generates.
  const out = dataTable({ columns: COLUMNS, rows: [{ name: "only a name" }] });
  assertEquals(out.rowCount, 1);
  assertStringIncludes(out.preview, "only a name");
});

Deno.test("output stays deterministic with rows", () => {
  const first = JSON.stringify(dataTable({ columns: COLUMNS, rows: ROWS }));
  for (let i = 0; i < 20; i++) {
    assertEquals(JSON.stringify(dataTable({ columns: COLUMNS, rows: ROWS })), first);
  }
});
