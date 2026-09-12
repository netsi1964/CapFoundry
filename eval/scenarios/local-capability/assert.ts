import type { Assertion } from "../../types.ts";
import { join } from "@std/path";

/**
 * "Exactly what comes back" is the point: the control condition has no harness
 * to ask, so a run that produces the string by writing it directly is not the
 * same result. The scenario tests reachability of the Local.* space, which is
 * why the prompt names a machine-local check without naming CFCM.
 */
const assertion: Assertion = async (ctx) => {
  let text: string;
  try {
    text = (await Deno.readTextFile(join(ctx.workspace, "echo.txt"))).trim();
  } catch {
    return { pass: false, detail: `echo.txt was not created in ${ctx.workspace}` };
  }
  return text.includes("ping from eval") ? { pass: true, detail: text.slice(0, 80) } : {
    pass: false,
    detail: `echo.txt does not contain the echoed message: ${JSON.stringify(text.slice(0, 80))}`,
  };
};

export default assertion;
