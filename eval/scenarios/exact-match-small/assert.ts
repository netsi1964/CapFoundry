import type { Assertion } from "../../types.ts";
import { join } from "@std/path";

/**
 * Judge the work, not the route. Both conditions must be able to pass this:
 * generating a correct slugifier is a legitimate way to produce the answer.
 *
 * "roedgroed" and "rodgrod" are both defensible transliterations, so both are
 * accepted. Asserting one would be grading style rather than correctness.
 */
const assertion: Assertion = async (ctx) => {
  let slug: string;
  try {
    slug = (await Deno.readTextFile(join(ctx.workspace, "slug.txt"))).trim();
  } catch {
    return { pass: false, detail: `slug.txt was not created in ${ctx.workspace}` };
  }

  const accepted = ["roedgroed-med-floede", "rodgrod-med-flode"];
  if (accepted.includes(slug)) return { pass: true, detail: slug };

  return {
    pass: false,
    detail: `expected one of ${accepted.join(" or ")}, got ${JSON.stringify(slug)}`,
  };
};

export default assertion;
