/**
 * CapFoundry.ui.dataTable
 *
 * Generates a standards-based HTML Custom Element for a sortable data table.
 *
 * This capability exists to test a different part of the model (MVP section
 * 10): the useful output is *code you paste into a project*, not a computed
 * value. Everything else in the first set answers a question; this one hands
 * back an implementation.
 *
 * Deliberately modest. The point is to prove artifact delivery works, not to
 * build a data-grid product. No virtual scrolling, no filtering, no pagination,
 * no editing.
 *
 * What it will not compromise on is being correct HTML: a real <table> with
 * <thead>/<tbody>, sorting exposed through aria-sort, sort controls that are
 * real <button>s so they are keyboard reachable, and text escaped on the way
 * in. A table that cannot be read by a screen reader is not a smaller version
 * of the right answer.
 *
 * The generated element has no build step, no framework and no dependencies.
 *
 * PURE: no network, no filesystem, no clock, no randomness.
 */

export type ColumnType = "string" | "number" | "date";
export type ColumnAlign = "start" | "end" | "center";

export interface ColumnSpec {
  key: string;
  label: string;
  type?: ColumnType;
  align?: ColumnAlign;
  sortable?: boolean;
}

export interface DataTableInput {
  columns: ColumnSpec[];
  /**
   * Sample rows, keyed by column key.
   *
   * Optional, and they do not become part of the component — a generator that
   * baked your data into a reusable element would have produced something
   * reusable by nobody. They are used to fill in the usage example and to
   * render a standalone preview, so what comes back is a file you can open
   * rather than a snippet you have to wire up first.
   */
  rows?: Record<string, unknown>[];
  sortable?: boolean;
  caption?: string;
  emptyText?: string;
  /** Custom element name. Must contain a hyphen, per the HTML spec. */
  elementName?: string;
}

export interface DataTableOutput {
  elementName: string;
  /** The Custom Element implementation, ready to drop into a project. */
  javascript: string;
  /** A runnable snippet showing how to mount it and supply rows. */
  usageExample: string;
  /**
   * A complete standalone HTML document: the component, the rows, nothing else.
   *
   * Written by embedding the same component rather than by rendering the table
   * a second time here. Two renderers that have to agree is a bug waiting for
   * the day someone changes one of them — so the browser does the rendering,
   * exactly as it will in the project this ends up in.
   */
  preview: string;
  columnCount: number;
  rowCount: number;
}

/** Samples for a preview, not a dataset. */
const MAX_ROWS = 100;

const RESERVED_NAMES = new Set([
  "annotation-xml",
  "color-profile",
  "font-face",
  "font-face-src",
  "font-face-uri",
  "font-face-format",
  "font-face-name",
  "missing-glyph",
]);

/** Custom element names: lowercase, must contain a hyphen, must not start with one. */
function assertElementName(name: string): void {
  if (typeof name !== "string" || name.length === 0) {
    throw new TypeError("elementName must be a non-empty string");
  }
  if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)+$/.test(name)) {
    throw new RangeError(
      `elementName "${name}" is not a valid custom element name: it must be lowercase and ` +
        "contain at least one hyphen, for example my-table",
    );
  }
  if (RESERVED_NAMES.has(name)) {
    throw new RangeError(`elementName "${name}" is reserved by the HTML specification`);
  }
}

/** Escapes text for embedding in HTML. Only the title needs it; cells use textContent. */
function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!),
  );
}

/** Escapes a value for embedding in a JavaScript string literal. */
function jsString(value: string): string {
  return JSON.stringify(value);
}

export default function dataTable(input: DataTableInput): DataTableOutput {
  if (!input || typeof input !== "object") {
    throw new TypeError("input must be an object with a columns array");
  }
  if (!Array.isArray(input.columns) || input.columns.length === 0) {
    throw new RangeError("columns must be a non-empty array");
  }

  const elementName = input.elementName ?? "cf-data-table";
  assertElementName(elementName);

  const tableSortable = input.sortable ?? true;
  const seen = new Set<string>();

  const columns = input.columns.map((column, i) => {
    if (!column || typeof column !== "object") {
      throw new TypeError(`columns[${i}] must be an object`);
    }
    if (typeof column.key !== "string" || column.key.length === 0) {
      throw new RangeError(`columns[${i}].key must be a non-empty string`);
    }
    if (seen.has(column.key)) {
      throw new RangeError(`columns[${i}].key "${column.key}" is duplicated`);
    }
    seen.add(column.key);

    if (typeof column.label !== "string" || column.label.length === 0) {
      throw new RangeError(`columns[${i}].label must be a non-empty string`);
    }

    const type = column.type ?? "string";
    if (!["string", "number", "date"].includes(type)) {
      throw new RangeError(`columns[${i}].type must be string, number or date`);
    }

    const align = column.align ?? (type === "number" ? "end" : "start");
    if (!["start", "end", "center"].includes(align)) {
      throw new RangeError(`columns[${i}].align must be start, end or center`);
    }

    return {
      key: column.key,
      label: column.label,
      type,
      align,
      sortable: (column.sortable ?? true) && tableSortable,
    };
  });

  const rows = input.rows ?? [];
  if (!Array.isArray(rows)) throw new TypeError("rows must be an array of objects");
  if (rows.length > MAX_ROWS) {
    throw new RangeError(
      `rows holds ${rows.length} entries; at most ${MAX_ROWS} are accepted. These are samples for ` +
        "the preview, not a dataset — a component is generated once and then fed at runtime.",
    );
  }
  rows.forEach((row, i) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new TypeError(`rows[${i}] must be an object keyed by column key`);
    }
  });

  const className = elementName
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");

  const caption = input.caption ?? "";
  const emptyText = input.emptyText ?? "No data";

  const javascript = `// Generated by CapFoundry.ui.dataTable.
// A framework-free, build-free custom element. Drop it in and set .rows.
//
// Accessibility is not optional here: sorting is announced through aria-sort,
// every sort control is a real <button> so it is keyboard reachable, and all
// cell text is set via textContent so data can never become markup.

const COLUMNS = ${JSON.stringify(columns, null, 2).split("\n").join("\n")};

class ${className} extends HTMLElement {
  #rows = [];
  #sortKey = null;
  #sortDirection = "ascending";

  static get observedAttributes() {
    return ["caption", "empty-text"];
  }

  connectedCallback() {
    this.#render();
  }

  attributeChangedCallback() {
    if (this.isConnected) this.#render();
  }

  /** Array of plain objects keyed by column key. */
  set rows(value) {
    if (!Array.isArray(value)) throw new TypeError("rows must be an array");
    this.#rows = value;
    if (this.isConnected) this.#render();
  }

  get rows() {
    return this.#rows;
  }

  get #caption() {
    return this.getAttribute("caption") ?? ${jsString(caption)};
  }

  get #emptyText() {
    return this.getAttribute("empty-text") ?? ${jsString(emptyText)};
  }

  #compare(a, b, column) {
    const left = a?.[column.key];
    const right = b?.[column.key];

    // Missing values sort last in both directions: a blank is not "smallest",
    // it is absent, and burying it at the top hides real data.
    if (left == null && right == null) return 0;
    if (left == null) return 1;
    if (right == null) return -1;

    if (column.type === "number") return Number(left) - Number(right);
    if (column.type === "date") return new Date(left).getTime() - new Date(right).getTime();
    // localeCompare so accented characters sort where a reader expects.
    return String(left).localeCompare(String(right));
  }

  #sorted() {
    if (!this.#sortKey) return this.#rows;
    const column = COLUMNS.find((c) => c.key === this.#sortKey);
    if (!column) return this.#rows;

    const factor = this.#sortDirection === "ascending" ? 1 : -1;
    // Copy before sorting: mutating the caller's array is a side effect they
    // did not ask for.
    return [...this.#rows].sort((a, b) => this.#compare(a, b, column) * factor);
  }

  #toggleSort(key) {
    if (this.#sortKey === key) {
      this.#sortDirection = this.#sortDirection === "ascending" ? "descending" : "ascending";
    } else {
      this.#sortKey = key;
      this.#sortDirection = "ascending";
    }
    this.#render();
    this.dispatchEvent(
      new CustomEvent("sort-change", {
        detail: { key: this.#sortKey, direction: this.#sortDirection },
        bubbles: true,
      }),
    );
  }

  #render() {
    this.replaceChildren();

    const table = document.createElement("table");
    table.part = "table";

    if (this.#caption) {
      const caption = document.createElement("caption");
      caption.textContent = this.#caption;
      table.append(caption);
    }

    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");

    for (const column of COLUMNS) {
      const th = document.createElement("th");
      th.scope = "col";
      th.style.textAlign = column.align;

      const isSorted = this.#sortKey === column.key;
      // aria-sort belongs on every sortable header, "none" included: that is
      // what tells a screen reader the column can be sorted at all.
      if (column.sortable) th.setAttribute("aria-sort", isSorted ? this.#sortDirection : "none");

      if (column.sortable) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = column.label;
        button.addEventListener("click", () => this.#toggleSort(column.key));

        const indicator = document.createElement("span");
        indicator.setAttribute("aria-hidden", "true");
        indicator.textContent = isSorted ? (this.#sortDirection === "ascending" ? " \\u25B2" : " \\u25BC") : "";
        button.append(indicator);

        th.append(button);
      } else {
        th.textContent = column.label;
      }

      headRow.append(th);
    }

    thead.append(headRow);
    table.append(thead);

    const tbody = document.createElement("tbody");
    const rows = this.#sorted();

    if (rows.length === 0) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = COLUMNS.length;
      td.textContent = this.#emptyText;
      tr.append(td);
      tbody.append(tr);
    } else {
      for (const row of rows) {
        const tr = document.createElement("tr");
        for (const column of COLUMNS) {
          const td = document.createElement("td");
          td.style.textAlign = column.align;
          const value = row?.[column.key];
          // textContent, never innerHTML: row data must never become markup.
          td.textContent = value == null ? "" : String(value);
          tr.append(td);
        }
        tbody.append(tr);
      }
    }

    table.append(tbody);
    this.append(table);
  }
}

if (!customElements.get(${jsString(elementName)})) {
  customElements.define(${jsString(elementName)}, ${className});
}

export default ${className};
`;

  // Real rows when given, otherwise one placeholder shaped like the columns.
  const exampleRows = rows.length > 0 ? rows : [
    Object.fromEntries(
      columns.map((c) => [c.key, c.type === "number" ? 1 : c.type === "date" ? "2026-01-01" : "…"]),
    ),
  ];
  const rowsLiteral = JSON.stringify(exampleRows, null, 2)
    .split("\n")
    .map((line, i) => (i === 0 ? line : `  ${line}`))
    .join("\n");

  const usageExample = `<script type="module" src="./${elementName}.js"></script>

<${elementName} id="table"></${elementName}>

<script type="module">
  document.getElementById("table").rows = ${rowsLiteral};

  document.getElementById("table")
    .addEventListener("sort-change", (e) => console.log(e.detail));
</script>
`;

  // A whole document, so `cfcm invoke … | jq -r .preview > t.html` opens.
  // JSON.stringify escapes the rows, and </script> inside a string literal
  // would otherwise end the block early — the one injection an HTML document
  // built this way is actually exposed to.
  const safeRows = JSON.stringify(exampleRows).replace(/<\/script/gi, "<\\/script");

  const preview = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>${escapeHtml(caption || elementName)}</title>
<style>
  body { font: 14px system-ui, sans-serif; margin: 2rem; color-scheme: light dark; }
  table { border-collapse: collapse; }
  caption { text-align: start; font-weight: 600; padding-block-end: .5rem; }
  th, td { border: 1px solid color-mix(in srgb, currentColor 25%, transparent); padding: .35rem .7rem; }
  th button { font: inherit; background: none; border: 0; padding: 0; cursor: pointer; color: inherit; }
</style>

<${elementName} id="preview"></${elementName}>

<script type="module">
${javascript}
document.getElementById("preview").rows = ${safeRows};
</script>
`;

  return {
    elementName,
    javascript,
    usageExample,
    preview,
    columnCount: columns.length,
    rowCount: rows.length,
  };
}
