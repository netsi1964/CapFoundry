import type { Assertion } from "../../types.ts";
import { join, toFileUrl } from "@std/path";

/**
 * A clean fallback means the work is indistinguishable from what the control
 * condition produces. So this asserts nothing about CFCM at all — only that the
 * function is correct, including the rejection the prompt asked for.
 */
const assertion: Assertion = async (ctx) => {
  const path = join(ctx.workspace, "roman.ts");
  let fn: (s: string) => number;
  try {
    fn = (await import(toFileUrl(path).href)).default;
  } catch (err) {
    return { pass: false, detail: `roman.ts missing or not importable: ${(err as Error).message}` };
  }

  for (const [input, want] of [["IV", 4], ["MCMXCIV", 1994], ["III", 3], ["LVIII", 58]] as const) {
    const got = fn(input);
    if (got !== want) return { pass: false, detail: `${input} gave ${got}, expected ${want}` };
  }

  // "guessing" on malformed input is the failure the prompt names explicitly.
  for (const bad of ["IIII", "VV", "ABC", ""]) {
    let rejected = false;
    try {
      const got = fn(bad);
      rejected = typeof got !== "number" || Number.isNaN(got);
    } catch {
      rejected = true;
    }
    if (!rejected) {
      return { pass: false, detail: `accepted malformed numeral ${JSON.stringify(bad)}` };
    }
  }
  return { pass: true, detail: "4 valid, 4 malformed rejected" };
};

export default assertion;
