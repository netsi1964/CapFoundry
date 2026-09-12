import type { Assertion } from "../../types.ts";
import { join, toFileUrl } from "@std/path";

/**
 * Correctness only. Whether a candidate was offered is expected behaviour and
 * belongs in `expect`, evaluated for condition A alone — asserting it here
 * would fail the control run for not having a registry to submit to, which is
 * not a correctness result.
 */
const assertion: Assertion = async (ctx) => {
  const path = join(ctx.workspace, "format_bytes.ts");
  let fn: (n: number, decimals?: number) => string;
  try {
    fn = (await import(toFileUrl(path).href)).default;
  } catch (err) {
    return {
      pass: false,
      detail: `format_bytes.ts missing or not importable: ${(err as Error).message}`,
    };
  }

  const norm = (s: unknown) => String(s).replace(/\s+/g, " ").trim().toUpperCase();
  const cases: [number, string][] = [
    [1536, "1.5 KB"],
    [0, "0 B"],
    [1048576, "1 MB"],
  ];
  for (const [input, want] of cases) {
    const got = norm(fn(input));
    // Accept "1 MB" and "1.0 MB" alike: trailing-zero style is not correctness.
    if (got !== norm(want) && got !== norm(want).replace(/^(\d+) /, "$1.0 ")) {
      return {
        pass: false,
        detail: `formatBytes(${input}) gave ${JSON.stringify(got)}, expected ~${want}`,
      };
    }
  }
  if (!norm(fn(1099511627776)).endsWith("TB")) {
    return { pass: false, detail: "does not reach TB" };
  }
  return { pass: true, detail: "KB, MB, TB and zero all correct" };
};

export default assertion;
