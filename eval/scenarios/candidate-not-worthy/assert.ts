import type { Assertion } from "../../types.ts";
import { join, toFileUrl } from "@std/path";

/**
 * Correctness of the glue. The restraint being measured — that nothing was
 * submitted — is declared in `expect` rather than asserted here, for the same
 * reason as candidate-worthy: the control condition has nothing to submit to.
 */
const assertion: Assertion = async (ctx) => {
  let mod: Record<string, unknown>;
  try {
    mod = await import(toFileUrl(join(ctx.workspace, "config.ts")).href);
  } catch (err) {
    return { pass: false, detail: `config.ts not importable: ${(err as Error).message}` };
  }
  const merge = mod.mergeConfig as
    | ((p: Record<string, unknown>) => Record<string, unknown>)
    | undefined;
  if (typeof merge !== "function") {
    return { pass: false, detail: "config.ts does not export mergeConfig" };
  }

  const merged = merge({ featureFlags: ["beta"], retryBudgetMs: 900 });
  if (merged.retryBudgetMs !== 900) {
    return { pass: false, detail: `retryBudgetMs was not overridden: ${merged.retryBudgetMs}` };
  }
  if (!Array.isArray(merged.featureFlags) || !merged.featureFlags.includes("beta")) {
    return {
      pass: false,
      detail: `featureFlags did not combine: ${JSON.stringify(merged.featureFlags)}`,
    };
  }
  if (merged.region !== "dk") {
    return {
      pass: false,
      detail: `region should fall through to the default, got ${merged.region}`,
    };
  }

  let threw = false;
  try {
    merge({ region: "de" });
  } catch {
    threw = true;
  }
  if (!threw) return { pass: false, detail: "an unknown region was accepted silently" };

  return { pass: true, detail: "overrides, combines flags, rejects unknown region" };
};

export default assertion;
