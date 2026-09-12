/**
 * CapFoundry.csv.detectDelimiter
 *
 * Infers which character separates fields in CSV-like text.
 *
 * This is the first capability in the set that *infers* rather than computes,
 * so it returns its evidence alongside its answer. A caller that disagrees
 * with the verdict can see exactly why it was reached, and a low confidence is
 * a signal to ask the user rather than to guess harder.
 *
 * The scoring rests on one observation: the right delimiter produces the *same*
 * field count on every row. A wrong one produces counts that wander. Row-count
 * consistency therefore dominates the score, and raw frequency is only a
 * tie-breaker — otherwise prose full of commas would beat a real pipe-delimited
 * file.
 *
 * RFC 4180 quoting is honoured: a delimiter inside "quotes" does not split.
 *
 * PURE: no network, no filesystem, no clock, no randomness.
 */

export interface DetectDelimiterInput {
  text: string;
  /** Single characters to consider. Defaults to comma, semicolon, tab, pipe. */
  candidates?: string[];
  /** Rows to examine. More rows cost time; 50 settles almost every real file. */
  maxRows?: number;
}

export interface DelimiterEvidence {
  delimiter: string;
  /** Field count that appeared most often. */
  modalFieldCount: number;
  /** Fraction of rows agreeing on that count, 0..1. */
  consistency: number;
  /** Mean occurrences per row, outside quotes. */
  averagePerRow: number;
  rowsExamined: number;
  score: number;
}

export interface DetectDelimiterOutput {
  delimiter: string | null;
  confidence: number;
  fieldCount: number | null;
  evidence: DelimiterEvidence[];
  reason: string | null;
}

const DEFAULT_CANDIDATES = [",", ";", "\t", "|"];

/**
 * Splits into rows, treating a newline inside quotes as data.
 *
 * A naive text.split("\n") corrupts every file with a multi-line quoted field,
 * and those are exactly the files where delimiter detection is hardest.
 */
function splitRows(text: string, maxRows: number): string[] {
  const rows: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (char === '"') {
      // A doubled quote inside a quoted field is an escaped quote, not a close.
      if (inQuotes && text[i + 1] === '"') {
        current += '""';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      current += char;
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      if (current.trim() !== "") rows.push(current);
      current = "";
      if (rows.length >= maxRows) return rows;
      continue;
    }

    current += char;
  }

  if (current.trim() !== "") rows.push(current);
  return rows.slice(0, maxRows);
}

/** Counts a delimiter's occurrences outside quoted sections. */
function countOutsideQuotes(row: string, delimiter: string): number {
  let count = 0;
  let inQuotes = false;

  for (let i = 0; i < row.length; i++) {
    const char = row[i];
    if (char === '"') {
      if (inQuotes && row[i + 1] === '"') {
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && char === delimiter) count++;
  }
  return count;
}

export default function detectDelimiter(input: DetectDelimiterInput): DetectDelimiterOutput {
  if (!input || typeof input !== "object") {
    throw new TypeError("input must be an object with a text field");
  }
  if (typeof input.text !== "string") {
    throw new TypeError("text must be a string");
  }

  const candidates = input.candidates ?? DEFAULT_CANDIDATES;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new RangeError("candidates must be a non-empty array");
  }
  for (const candidate of candidates) {
    if (typeof candidate !== "string" || candidate.length !== 1) {
      throw new RangeError(
        `each candidate must be a single character, got ${JSON.stringify(candidate)}`,
      );
    }
    if (candidate === '"') {
      throw new RangeError("the quote character cannot be a delimiter");
    }
  }

  const maxRows = input.maxRows ?? 50;
  if (!Number.isInteger(maxRows) || maxRows < 1) {
    throw new RangeError("maxRows must be a positive integer");
  }

  const rows = splitRows(input.text, maxRows);
  if (rows.length === 0) {
    return { delimiter: null, confidence: 0, fieldCount: null, evidence: [], reason: "NO_ROWS" };
  }

  const evidence: DelimiterEvidence[] = [];

  for (const delimiter of candidates) {
    const counts = rows.map((row) => countOutsideQuotes(row, delimiter));

    const frequency = new Map<number, number>();
    for (const count of counts) frequency.set(count, (frequency.get(count) ?? 0) + 1);

    // Ignore rows with zero occurrences when picking the modal count: a
    // trailing comment line should not outvote the data.
    let modalCount = 0;
    let modalRows = 0;
    for (const [count, rowsWithCount] of frequency) {
      if (count === 0) continue;
      if (rowsWithCount > modalRows || (rowsWithCount === modalRows && count > modalCount)) {
        modalCount = count;
        modalRows = rowsWithCount;
      }
    }

    const total = counts.reduce((sum, c) => sum + c, 0);
    const consistency = modalCount === 0 ? 0 : modalRows / rows.length;

    // Consistency is the signal; frequency only breaks ties. Weighting them
    // the other way round would let prose full of commas beat a real
    // pipe-delimited file.
    const frequencyBonus = modalCount === 0 ? 0 : Math.min(1, modalCount / 10);
    const score = modalCount === 0 ? 0 : consistency * 0.9 + frequencyBonus * 0.1;

    evidence.push({
      delimiter,
      modalFieldCount: modalCount === 0 ? 0 : modalCount + 1,
      consistency: Number(consistency.toFixed(4)),
      averagePerRow: Number((total / rows.length).toFixed(4)),
      rowsExamined: rows.length,
      score: Number(score.toFixed(4)),
    });
  }

  evidence.sort((a, b) =>
    b.score - a.score ||
    b.modalFieldCount - a.modalFieldCount ||
    candidates.indexOf(a.delimiter) - candidates.indexOf(b.delimiter)
  );

  const best = evidence[0];
  if (!best || best.score === 0) {
    return {
      delimiter: null,
      confidence: 0,
      fieldCount: null,
      evidence,
      reason: "NO_CANDIDATE_PRESENT",
    };
  }

  // A single row cannot demonstrate consistency, so confidence is capped: one
  // line of prose with three commas would otherwise look like a clean CSV.
  const runnerUp = evidence[1]?.score ?? 0;
  const separation = best.score > 0 ? (best.score - runnerUp) / best.score : 0;
  const rowPenalty = rows.length === 1 ? 0.5 : 1;
  const confidence = Number((best.score * (0.6 + 0.4 * separation) * rowPenalty).toFixed(4));

  return {
    delimiter: best.delimiter,
    confidence,
    fieldCount: best.modalFieldCount,
    evidence,
    reason: rows.length === 1 ? "SINGLE_ROW" : null,
  };
}
