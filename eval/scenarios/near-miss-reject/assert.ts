import type { Assertion } from "../../types.ts";
import { join, toFileUrl } from "@std/path";

/**
 * The failure this guards against is not "CFCM returned something odd" — it is
 * the agent shipping a geographic distance function for a string problem.
 *
 * So the assertion runs the code. kitten/sitting is 3 by Levenshtein and
 * nothing like it under any coordinate formula, which makes the check immune to
 * how the answer was arrived at.
 */
const assertion: Assertion = async (ctx) => {
  const path = join(ctx.workspace, "edit_distance.ts");
  let fn: (a: string, b: string) => number;
  try {
    fn = (await import(toFileUrl(path).href)).default;
  } catch (err) {
    return {
      pass: false,
      detail: `edit_distance.ts missing or not importable: ${(err as Error).message}`,
    };
  }
  if (typeof fn !== "function") {
    return { pass: false, detail: "edit_distance.ts has no default-exported function" };
  }

  const cases: [string, string, number][] = [
    ["kitten", "sitting", 3],
    ["", "abc", 3],
    ["abc", "abc", 0],
    ["flaw", "lawn", 2],
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
        detail: `editDistance("${a}","${b}") returned ${got}, expected ${want}`,
      };
    }
  }
  return { pass: true, detail: "4/4 Levenshtein cases correct" };
};

export default assertion;
