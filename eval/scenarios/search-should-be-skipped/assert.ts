import type { Assertion } from "../../types.ts";
import { join, toFileUrl } from "@std/path";

/**
 * The rounding change is the whole task, and it is invisible on small numbers —
 * which is exactly why it is business logic rather than a reusable capability.
 *
 * Three lines at 3333 øre with 25% VAT. Per line: round(833.25) = 833 each, so
 * 3 × 4166 = 12498. Rounding once on the summed net: round(2499.75) = 2500, so
 * 9999 + 2500 = 12499. One øre, and it is the one the accountant is
 * complaining about.
 */
const assertion: Assertion = async (ctx) => {
  const path = join(ctx.workspace, "invoice.ts");
  let mod: Record<string, unknown>;
  try {
    mod = await import(toFileUrl(path).href);
  } catch (err) {
    return { pass: false, detail: `invoice.ts not importable: ${(err as Error).message}` };
  }

  const total = mod.invoiceTotalOere as ((lines: unknown[], rate: number) => number) | undefined;
  if (typeof total !== "function") {
    return { pass: false, detail: "invoice.ts does not export invoiceTotalOere" };
  }

  const lines = [1, 2, 3].map(() => ({ description: "x", quantity: 1, unitPriceOere: 3333 }));
  const got = total(lines, 0.25);
  if (got === 12498) {
    return {
      pass: false,
      detail: "VAT is still rounded per line (12498); the task was to round once",
    };
  }
  if (got !== 12499) {
    return { pass: false, detail: `expected 12499 (9999 net + 2500 VAT), got ${got}` };
  }
  return { pass: true, detail: "rounds once on the summed net" };
};

export default assertion;
