/**
 * PRD-FEAT-016 — Explore. Static HTML from aggregated telemetry.
 *
 * No server, no LLM analysis, no JavaScript on the page. It reads
 * web/explore/data.json and writes web/explore/index.html, which opens from
 * file:// as readily as from GitHub Pages.
 *
 * Two things this script is careful about.
 *
 * **Empty is not the same as unknown.** A section with no rows because nothing
 * happened, and a section with no rows because the data was deliberately not
 * recorded, look identical in a table and mean opposite things. Missing gets an
 * explicit third state for that, fed by `missingUnavailable`.
 *
 * **Query text is the one field that can carry personal data.** Everything else
 * here is capability names and counts. If recorded queries are present, the page
 * is publishable only after someone has read them, so the build says so out loud
 * rather than trusting that it was considered.
 */

import { join } from "@std/path";

interface Place {
  name: string;
}

interface ExploreData {
  generatedAt: string;
  window: { from: string | null; to: string | null; days: number };
  totals: {
    searches: number;
    matches: number;
    noMatches: number;
    invocations: number;
    candidates: number;
  };
  mostUsed: { name: string; invocations: number; namespaceType: string }[];
  mostSearched: { name: string; appearances: number; matchRate: number }[];
  missing: { query: string; occurrences: number; lastSeen: string; bestConfidence: number }[];
  missingUnavailable: { unattributedNoMatches: number; enableWith: string } | null;
  newCandidates: { name: string; submittedAt: string }[];
  fastestGrowing: { name: string; recent: number; earlier: number; change: number }[];
  recentlyAdded: { name: string; version: string; indexedAt: string }[];
}

const REPO_ROOT = new URL("..", import.meta.url).pathname;
const OUT_DIR = join(REPO_ROOT, "web", "explore");

function esc(s: unknown): string {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!),
  );
}

function day(iso: string | null): string {
  if (!iso) return "—";
  return iso.slice(0, 10);
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

/** A section with nothing in it says why, rather than showing an empty table. */
function section(
  title: string,
  blurb: string,
  rows: string,
  empty: string,
  lead = false,
): string {
  return `<section class="card${lead ? " lead" : ""}">
  <h2>${esc(title)}</h2>
  <p class="blurb">${blurb}</p>
  ${rows || `<p class="empty">${empty}</p>`}
</section>`;
}

function table(head: string[], rows: string[][]): string {
  if (rows.length === 0) return "";
  return `<table>
  <thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
  <tbody>${
    rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("\n  ")
  }</tbody>
</table>`;
}

function render(d: ExploreData): string {
  const t = d.totals;
  const matchRate = t.searches > 0 ? t.matches / t.searches : 0;

  // Missing leads: it is the only section that says what to build rather than
  // what already happened.
  const missingRows = table(
    ["What was asked for", "Times", "Closest match", "Last seen"],
    d.missing.map((m) => [
      `<span class="q">${esc(m.query)}</span>`,
      `<strong>${m.occurrences}</strong>`,
      m.bestConfidence > 0 ? `${m.bestConfidence.toFixed(2)}` : "—",
      `<span class="dim">${day(m.lastSeen)}</span>`,
    ]),
  );

  const missingEmpty = d.missingUnavailable
    ? `<strong>${d.missingUnavailable.unattributedNoMatches} searches found nothing</strong>, but their
       text was not recorded, so this page cannot say what was wanted. That is the privacy default
       working, not an absence of demand.
       <span class="hint">To see it: ${esc(d.missingUnavailable.enableWith)}. Queries stay on this
       machine and are stripped before any upload.</span>`
    : "Every search found something. No unmet demand in this window.";

  const body = [
    section(
      "Missing",
      "Repeated searches that found nothing. This is the only section that points forward — it is a list of capabilities that do not exist yet.",
      missingRows,
      missingEmpty,
      true,
    ),
    section(
      "Most used",
      "Capabilities actually invoked, not merely found.",
      table(
        ["Capability", "Invocations", "Namespace"],
        d.mostUsed.map((r) => [
          `<code>${esc(r.name)}</code>`,
          `<strong>${r.invocations}</strong>`,
          `<span class="tag">${esc(r.namespaceType)}</span>`,
        ]),
      ),
      "Nothing has been invoked in this window.",
    ),
    section(
      "Most searched",
      "Capabilities that surfaced in results. A high appearance count with a low match rate means the name attracts queries it cannot serve.",
      table(
        ["Capability", "Appearances", "Match rate"],
        d.mostSearched.map((r) => [
          `<code>${esc(r.name)}</code>`,
          `${r.appearances}`,
          `<span class="${r.matchRate < 0.34 ? "warn" : "dim"}">${pct(r.matchRate)}</span>`,
        ]),
      ),
      "No searches recorded in this window.",
    ),
    section(
      "Fastest growing",
      "Change in invocations between the first and second half of the window.",
      table(
        ["Capability", "Earlier", "Recent", "Change"],
        d.fastestGrowing.map((r) => [
          `<code>${esc(r.name)}</code>`,
          `<span class="dim">${r.earlier}</span>`,
          `<strong>${r.recent}</strong>`,
          `<span class="${r.change >= 0 ? "up" : "down"}">${
            r.change >= 0 ? "+" : ""
          }${r.change}</span>`,
        ]),
      ),
      "Not enough history yet to compare two halves of the window.",
    ),
    section(
      "New candidates",
      "Submitted by agents that wrote something reusable and offered it. Nothing is published; a person decides.",
      table(
        ["Candidate", "Submitted"],
        d.newCandidates.map((r) => [
          `<code>${esc(r.name)}</code>`,
          `<span class="dim">${day(r.submittedAt)}</span>`,
        ]),
      ),
      "No candidates submitted in this window.",
    ),
    section(
      "Recently added",
      "Capabilities currently in the index.",
      table(
        ["Capability", "Version"],
        d.recentlyAdded.map((r) => [
          `<code>${esc(r.name)}</code>`,
          `<span class="dim">${esc(r.version)}</span>`,
        ]),
      ),
      "The index is empty.",
    ),
  ].join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>CapFoundry Explore</title>
<style>
  :root {
    --bg: #fbfaf8; --card: #fff; --ink: #1a1a18; --dim: #6b6b66;
    --line: #e6e3dd; --accent: #8a5a2b; --warn: #a8432c; --up: #2f6b4f;
    --mono: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #16161a; --card: #1d1d22; --ink: #e8e6e1; --dim: #97948d;
      --line: #2e2e35; --accent: #d9a066; --warn: #e08163; --up: #6fbf95;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 0 16px 72px; background: var(--bg); color: var(--ink);
    font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif;
  }
  .wrap { max-width: 820px; margin: 0 auto; }
  header { padding-block: 56px 32px; border-bottom: 1px solid var(--line); margin-bottom: 32px; }
  h1 { margin: 0 0 6px; font-size: 26px; letter-spacing: -0.02em; font-weight: 620; }
  .sub { margin: 0; color: var(--dim); font-size: 14px; }
  .totals { display: flex; flex-wrap: wrap; gap: 28px; margin-top: 26px; }
  .stat b { display: block; font-size: 24px; font-weight: 600; letter-spacing: -0.02em; }
  .stat span { font-size: 12px; color: var(--dim); text-transform: uppercase; letter-spacing: .06em; }
  .card {
    background: var(--card); border: 1px solid var(--line); border-radius: 10px;
    padding: 22px 24px; margin-bottom: 18px;
  }
  .card.lead { border-color: var(--accent); }
  h2 { margin: 0 0 4px; font-size: 17px; font-weight: 600; letter-spacing: -0.01em; }
  .blurb { margin: 0 0 16px; color: var(--dim); font-size: 13.5px; max-width: 62ch; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th {
    text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .06em;
    color: var(--dim); font-weight: 600; padding: 0 10px 8px 0; border-bottom: 1px solid var(--line);
  }
  td { padding: 9px 10px 9px 0; border-bottom: 1px solid var(--line); vertical-align: baseline; }
  tr:last-child td { border-bottom: 0; }
  th:not(:first-child), td:not(:first-child) { text-align: right; width: 1%; white-space: nowrap; }
  code, .q { font-family: var(--mono); font-size: 13px; }
  .q { color: var(--accent); }
  .dim { color: var(--dim); }
  .warn { color: var(--warn); font-weight: 600; }
  .up { color: var(--up); font-weight: 600; }
  .down { color: var(--warn); font-weight: 600; }
  .tag {
    font-size: 11px; color: var(--dim); border: 1px solid var(--line);
    border-radius: 4px; padding: 1px 6px;
  }
  .empty { margin: 0; color: var(--dim); font-size: 14px; max-width: 64ch; }
  .empty strong { color: var(--ink); }
  .hint { display: block; margin-top: 10px; font-size: 13px; color: var(--dim); }
  footer { margin-top: 34px; color: var(--dim); font-size: 12.5px; max-width: 70ch; }
  footer code { font-size: 12px; }
  @media (max-width: 560px) {
    .card { padding: 18px 16px; }
    table { font-size: 13px; }
    .totals { gap: 18px 24px; }
  }
</style>
</head>
<body>
<div class="wrap">
<header>
  <h1>CapFoundry Explore</h1>
  <p class="sub">
    What this machine looked for, what it found, and what it could not.
    ${d.window.days} day window to ${day(d.window.to)}.
  </p>
  <div class="totals">
    <div class="stat"><b>${t.searches}</b><span>searches</span></div>
    <div class="stat"><b>${pct(matchRate)}</b><span>match rate</span></div>
    <div class="stat"><b>${t.invocations}</b><span>invocations</span></div>
    <div class="stat"><b>${t.noMatches}</b><span>found nothing</span></div>
    <div class="stat"><b>${t.candidates}</b><span>candidates</span></div>
  </div>
</header>
${body}
<footer>
  Generated ${esc(d.generatedAt)} from local telemetry by <code>deno task explore</code>.
  Static page, no server and no scripts. Counts and capability names only &mdash; CFCM does not
  record capability inputs, and query text is opt-in and never leaves the machine that typed it.
</footer>
</div>
</body>
</html>
`;
}

const dataPath = join(OUT_DIR, "data.json");
let data: ExploreData;
try {
  data = JSON.parse(await Deno.readTextFile(dataPath));
} catch {
  console.error(`✗ ${dataPath} is missing. Run \`deno task aggregate\` first.`);
  Deno.exit(1);
}

await Deno.mkdir(OUT_DIR, { recursive: true });
const outPath = join(OUT_DIR, "index.html");
await Deno.writeTextFile(outPath, render(data));

const bytes = (await Deno.stat(outPath)).size;
console.log(`✓ ./web/explore/index.html — ${(bytes / 1024).toFixed(1)} KB`);

if (data.missing.length > 0) {
  // The one field that can carry personal data. Say so rather than assume it was considered.
  console.log("");
  console.log(
    `  ! This page contains ${data.missing.length} recorded search queries. Everything else is\n` +
      `    counts and capability names. Read them before publishing it anywhere public —\n` +
      `    a query can carry context that a count cannot.`,
  );
}
