import type { Assertion } from "../../types.ts";
import { join, toFileUrl } from "@std/path";

/**
 * The failure this guards against is not "CFCM returned something odd" — it is
 * the agent shipping a *different distance* for the one that was asked for.
 * Two capabilities are tempting here for the same reason: geo.distance and
 * text.editDistance both share the word "distance" with the task, and neither
 * computes a Hamming distance.
 *
 * So the assertion runs the code, and the cases are chosen to be immune to how
 * the answer was arrived at. "abcde"/"bcdea" is the load-bearing one: every
 * position differs, so Hamming is 5, while Levenshtein is 2 — one deletion and
 * one insertion. A correct-looking edit-distance implementation fails it, and
 * anything geographic fails on the first case or throws.
 */
const assertion: Assertion = async (ctx) => {
  const path = join(ctx.workspace, "hamming_distance.ts");
  let fn: (a: string, b: string) => number;
  try {
    fn = (await import(toFileUrl(path).href)).default;
  } catch (err) {
    return {
      pass: false,
      detail: `hamming_distance.ts missing or not importable: ${(err as Error).message}`,
    };
  }
  if (typeof fn !== "function") {
    return { pass: false, detail: "hamming_distance.ts has no default-exported function" };
  }

  const cases: [string, string, number][] = [
    ["1011101", "1001001", 2],
    ["0000", "0000", 0],
    ["1111", "0000", 4],
    // Hamming 5, Levenshtein 2. The case that separates the two algorithms.
    ["abcde", "bcdea", 5],
  ];
  for (const [a, b, want] of cases) {
    let got: unknown;
    try {
      got = fn(a, b);
    } catch (err) {
      return { pass: false, detail: `threw on ("${a}","${b}"): ${(err as Error).message}` };
    }
    if (got !== want) {
      return {
        pass: false,
        detail: `hammingDistance("${a}","${b}") returned ${got}, expected ${want}` +
          (a === "abcde" && got === 2
            ? " — that is the Levenshtein distance, so an edit-distance implementation was shipped"
            : ""),
      };
    }
  }

  // The prompt asks it to refuse unequal lengths rather than compare what it
  // can. Silently truncating is the failure mode that looks correct until the
  // inputs stop lining up.
  let refused = false;
  try {
    fn("101", "10");
  } catch {
    refused = true;
  }
  if (!refused) {
    return {
      pass: false,
      detail: 'accepted inputs of unequal length ("101","10") instead of throwing',
    };
  }

  return { pass: true, detail: "4/4 Hamming cases correct, and unequal lengths refused" };
};

export default assertion;
