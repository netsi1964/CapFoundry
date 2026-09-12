import type { Assertion } from "../../types.ts";

/**
 * Judge the work, not the route.
 *
 * This runs identically in both conditions. Reading ctx.telemetry to decide
 * pass or fail would score the control run as failing for having no CFCM,
 * which is not a correctness result.
 */
const assertion: Assertion = (ctx) => {
  const produced = ctx.transcript.includes("something the agent should have produced");

  return produced
    ? { pass: true, detail: "" }
    : { pass: false, detail: `expected …, but the workspace at ${ctx.workspace} had …` };
};

export default assertion;
