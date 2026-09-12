/**
 * Field-weighted BM25 (BM25F) over the capability index.
 *
 * Parameters and field weights are fixed by PRD-FEAT-004. They are constants
 * rather than configuration because changing them changes what a score means;
 * the thresholds applied to the resulting confidence are what stays tunable.
 */

import { tokenize, tokenizeAll } from "./tokenize.ts";
import type { IndexRecord } from "../types.ts";

export const K1 = 1.2;
export const B = 0.75;

export const FIELD_WEIGHTS: Record<string, number> = {
  name: 3.0,
  aliases: 2.5,
  exampleQueries: 2.0,
  description: 1.5,
  tags: 1.0,
  summaries: 0.5,
};

export type FieldName = keyof typeof FIELD_WEIGHTS;

interface FieldDoc {
  /** token -> count within this field */
  counts: Map<string, number>;
  length: number;
}

export interface ScoredDoc {
  index: number;
  score: number;
  /** field -> matched tokens, for search evidence (PRD-FEAT-004.5) */
  matches: Map<string, Set<string>>;
}

function countTokens(tokens: string[]): FieldDoc {
  const counts = new Map<string, number>();
  for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
  return { counts, length: tokens.length };
}

/** Splits `CapFoundry.geo.distance` into searchable words. */
function nameTokens(name: string): string[] {
  return tokenize(name.split(".").join(" "));
}

export class Bm25Index {
  private readonly docs: Map<string, FieldDoc>[] = [];
  private readonly avgFieldLength = new Map<string, number>();
  /** token -> number of documents containing it in any field */
  private readonly docFreq = new Map<string, number>();

  constructor(readonly records: IndexRecord[]) {
    for (const record of records) {
      const fields = new Map<string, FieldDoc>();
      fields.set("name", countTokens(nameTokens(record.name)));
      fields.set("aliases", countTokens(tokenizeAll(record.aliases ?? [])));
      fields.set("exampleQueries", countTokens(tokenizeAll(record.exampleQueries ?? [])));
      fields.set("description", countTokens(tokenize(record.description)));
      fields.set("tags", countTokens(tokenizeAll(record.tags ?? [])));
      fields.set(
        "summaries",
        countTokens(tokenizeAll([record.inputSummary ?? "", record.outputSummary ?? ""])),
      );
      this.docs.push(fields);

      const seen = new Set<string>();
      for (const field of fields.values()) {
        for (const token of field.counts.keys()) seen.add(token);
      }
      for (const token of seen) this.docFreq.set(token, (this.docFreq.get(token) ?? 0) + 1);
    }

    for (const field of Object.keys(FIELD_WEIGHTS)) {
      const total = this.docs.reduce((sum, d) => sum + (d.get(field)?.length ?? 0), 0);
      this.avgFieldLength.set(field, this.docs.length > 0 ? total / this.docs.length : 0);
    }
  }

  get size(): number {
    return this.docs.length;
  }

  /**
   * Robertson/Sparck-Jones IDF with the +1 smoothing that keeps it positive.
   * With a seven-document index the absolute values are small; only the
   * relative weighting matters.
   */
  idf(token: string): number {
    const n = this.docs.length;
    const df = this.docFreq.get(token) ?? 0;
    if (df === 0) return 0;
    return Math.log(1 + (n - df + 0.5) / (df + 0.5));
  }

  /**
   * The IDF a token would have if it appeared in exactly zero documents.
   *
   * Ranking ignores unknown tokens — they cannot discriminate between
   * documents. Confidence must not. A query word the index has never seen is
   * the single strongest signal that the caller is asking about something we
   * do not have, so coverage charges it at the maximum rate. Without this,
   * "distance to the moon" scores identically to "distance between two
   * coordinates" as soon as one token happens to overlap.
   */
  unknownTokenIdf(): number {
    return Math.log(1 + (this.docs.length + 0.5) / 0.5);
  }

  /** IDF used for coverage: real value when known, maximal when not. */
  coverageIdf(token: string): number {
    const df = this.docFreq.get(token) ?? 0;
    return df === 0 ? this.unknownTokenIdf() : this.idf(token);
  }

  /** Scores every document that matches at least one query token. */
  score(queryTokens: string[], allowed?: (i: number) => boolean): ScoredDoc[] {
    const unique = [...new Set(queryTokens)];
    const out: ScoredDoc[] = [];

    for (let i = 0; i < this.docs.length; i++) {
      if (allowed && !allowed(i)) continue;
      const fields = this.docs[i];
      let score = 0;
      const matches = new Map<string, Set<string>>();

      for (const token of unique) {
        const idf = this.idf(token);
        if (idf === 0) continue;

        // BM25F: accumulate length-normalised, field-weighted term frequency
        // across fields first, then apply saturation once.
        let tfWeighted = 0;
        for (const [fieldName, weight] of Object.entries(FIELD_WEIGHTS)) {
          const field = fields.get(fieldName);
          if (!field) continue;
          const tf = field.counts.get(token);
          if (!tf) continue;

          const avg = this.avgFieldLength.get(fieldName) ?? 0;
          const norm = avg > 0 ? 1 - B + B * (field.length / avg) : 1;
          tfWeighted += (weight * tf) / norm;

          if (!matches.has(fieldName)) matches.set(fieldName, new Set());
          matches.get(fieldName)!.add(token);
        }

        if (tfWeighted > 0) score += idf * (tfWeighted / (K1 + tfWeighted));
      }

      if (score > 0) out.push({ index: i, score, matches });
    }

    return out.sort((a, b) =>
      b.score - a.score || this.records[a.index].name.localeCompare(this.records[b.index].name)
    );
  }
}
