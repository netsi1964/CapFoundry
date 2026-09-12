/**
 * Search engine: BM25 ranking plus the confidence rule that turns a ranking
 * into MATCH / PARTIAL_MATCH / NO_MATCH (PRD-FEAT-004.3).
 *
 * The confidence formula is deliberately two-part:
 *
 *   confidence = coverageWeight * idfCoverage + marginWeight * margin
 *
 * idfCoverage asks "how much of what the caller actually asked for did we
 * account for?" and margin asks "is the winner clearly the winner?". A high
 * BM25 score alone must not be enough, because on a short query a single
 * common token can dominate. Both halves are needed to keep OBJ-2's
 * wrong-match rate down.
 */

import { Bm25Index } from "./bm25.ts";
import { tokenize } from "./tokenize.ts";
import type {
  Effect,
  IndexRecord,
  MatchEvidence,
  SearchCandidate,
  SearchResult,
  SearchStatus,
  SearchThresholds,
} from "../types.ts";

export interface SearchQuery {
  query: string;
  runtime?: string;
  effect?: Effect;
  /** How many candidates to return. Ranking is unaffected. */
  limit?: number;
}

export const DEFAULT_THRESHOLDS: SearchThresholds = {
  matchThreshold: 0.55,
  partialThreshold: 0.35,
  coverageWeight: 0.7,
  marginWeight: 0.3,
};

export class SearchEngine {
  private readonly bm25: Bm25Index;

  constructor(
    private readonly records: IndexRecord[],
    private readonly thresholds: SearchThresholds = DEFAULT_THRESHOLDS,
  ) {
    this.bm25 = new Bm25Index(records);
  }

  get size(): number {
    return this.records.length;
  }

  search(q: SearchQuery): SearchResult {
    const started = performance.now();
    const tokens = tokenize(q.query);

    // Filters run before scoring (PRD-FEAT-004.4) so an excluded capability
    // cannot influence the margin term of a competitor.
    const allowed = (i: number): boolean => {
      const r = this.records[i];
      if (q.runtime && r.runtime !== q.runtime) return false;
      if (q.effect && r.effect !== q.effect) return false;
      return true;
    };

    const scored = tokens.length === 0 ? [] : this.bm25.score(tokens, allowed);
    const limit = q.limit ?? 5;

    const candidates: SearchCandidate[] = scored.slice(0, limit).map((s) => ({
      record: this.records[s.index],
      score: s.score,
      evidence: [...s.matches.entries()].map(([field, set]): MatchEvidence => ({
        field,
        tokens: [...set].sort(),
      })).sort((a, b) => a.field.localeCompare(b.field)),
    }));

    const confidence = this.confidence(tokens, scored);
    const status = this.classify(confidence, scored.length);

    return {
      status,
      confidence: Number(confidence.toFixed(4)),
      candidates,
      searchMs: Number((performance.now() - started).toFixed(3)),
      thresholds: this.thresholds,
    };
  }

  private confidence(
    tokens: string[],
    scored: { index: number; score: number; matches: Map<string, Set<string>> }[],
  ): number {
    // No document matched a single query token. There is nothing to be
    // confident about, and reporting a margin here would be an artifact of
    // having only one capability in the index rather than a real signal.
    if (scored.length === 0) return 0;

    const unique = [...new Set(tokens)];
    // Unknown tokens are counted at the maximum rate in the denominator (see
    // Bm25Index.coverageIdf). They are the evidence that the query is about
    // something the index does not contain.
    const totalIdf = unique.reduce((sum, t) => sum + this.bm25.coverageIdf(t), 0);

    const top = scored[0];
    const matchedTokens = new Set<string>();
    for (const set of top.matches.values()) {
      for (const t of set) matchedTokens.add(t);
    }
    const matchedIdf = [...matchedTokens].reduce((sum, t) => sum + this.bm25.idf(t), 0);

    const idfCoverage = totalIdf > 0 ? Math.min(1, matchedIdf / totalIdf) : 0;

    const margin = scored.length < 2
      ? 1
      : Math.max(0, Math.min(1, (top.score - scored[1].score) / top.score));

    const { coverageWeight, marginWeight } = this.thresholds;
    return coverageWeight * idfCoverage + marginWeight * margin;
  }

  private classify(confidence: number, candidateCount: number): SearchStatus {
    if (candidateCount === 0) return "NO_MATCH";
    if (confidence >= this.thresholds.matchThreshold) return "MATCH";
    if (confidence >= this.thresholds.partialThreshold) return "PARTIAL_MATCH";
    return "NO_MATCH";
  }
}
