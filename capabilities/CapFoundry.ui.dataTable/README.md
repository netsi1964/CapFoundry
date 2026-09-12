# CapFoundry.ui.dataTable

Generates a standards-based HTML Custom Element for a sortable data table.

```json
{ "columns": [{ "key": "name", "label": "Name" },
              { "key": "amount", "label": "Amount", "type": "number" }],
  "sortable": true }
→ { "elementName": "cf-data-table", "javascript": "…", "usageExample": "…", "columnCount": 2 }
```

## Why this capability exists

Everything else in the first capability set answers a question. This one hands back **an
implementation** — code you paste into a project. It is here to test that half of the model (MVP
§10), not because CapFoundry needs a data grid.

## Deliberately modest

No virtual scrolling, no filtering, no pagination, no editing. The point is to prove artifact
delivery, not to build a data-grid product.

What it will **not** compromise on is being correct HTML:

- A real `<table>` with `<thead>`/`<tbody>`, not a grid of `<div>`s.
- Sorting exposed through `aria-sort` — set to `"none"` on sortable columns too, since that is what
  tells a screen reader the column can be sorted.
- Sort controls are real `<button>`s, so they are keyboard reachable for free.
- Cell text set via `textContent`, never `innerHTML`, so row data can never become markup.
- Missing values sort last in **both** directions. A blank is not "smallest"; it is absent, and
  floating it to the top hides real data.
- Sorting copies before it sorts, so the caller's array is not mutated.

A table a screen reader cannot read is not a smaller version of the right answer.

## Element name

Defaults to `cf-data-table`, overridable via `elementName`. It is validated against the HTML
custom-element rules — lowercase, at least one hyphen, not a reserved name — so an invalid name
fails here rather than silently at `customElements.define`.

The generated element has no build step, no framework and no dependencies.
