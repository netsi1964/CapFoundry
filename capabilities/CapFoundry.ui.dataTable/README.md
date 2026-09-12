# CapFoundry.ui.dataTable

Generates a standards-based HTML Custom Element for a sortable data table.

```json
{ "columns": [{ "key": "name", "label": "Name" },
               { "key": "amount", "label": "Amount", "type": "number" }],
  "rows": [{ "name": "Nordlys Analyse ApS", "amount": 12450 }],
  "caption": "Invoices" }
→ { "elementName": "cf-data-table", "javascript": "…", "usageExample": "…",
    "preview": "<!doctype html>…", "columnCount": 2, "rowCount": 1 }
```

```bash
cfcm invoke CapFoundry.ui.dataTable "$(cat table.json)" | jq -r .preview > table.html
open table.html
```

## Rows are samples, not data

`rows` is optional and never becomes part of the component. A generator that baked the caller's data
into a reusable element would have produced something reusable by nobody. They fill in the usage
example, so what you paste already has your columns in it, and they populate `preview`.

Capped at 100, and the refusal says why: these are samples for a preview, not a dataset. A component
is generated once and fed at runtime.

## The preview has one renderer, not two

`preview` is a complete HTML document that **embeds the component** and sets `.rows` on it. It does
not render the table a second time in TypeScript.

Two renderers that have to agree is a bug waiting for the day someone changes one of them — and the
browser is going to do the rendering in the real project anyway, so it may as well do it here.

The one injection a document assembled this way is exposed to is a `</script>` inside row data
ending the block early. That is escaped, and there is a test that puts
`</script><img src=x onerror=…>` in a cell.

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
