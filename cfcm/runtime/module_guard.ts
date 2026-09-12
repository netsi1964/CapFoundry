/**
 * Refusing artifacts that can load modules (SEC-11).
 *
 * Deno's permission system does not gate module loading. That was already
 * known for remote specifiers — SEC-10, closed with --no-remote — but the same
 * gap applies to local ones, and it is worse there:
 *
 *     await import("file:///home/you/.config/app.json", { with: { type: "json" } })
 *
 * returns the file's contents to an artifact holding no permissions at all,
 * while Deno.readTextFile on the same path is correctly refused. Verified that
 * --deny-read, --deny-read=<exact path> and a scoped --allow-read all fail to
 * close it: module loading is simply outside the permission model.
 *
 * So it is closed a layer up. A capability artifact is a single self-contained
 * file — all twelve shipped ones contain no import of any kind — so refusing
 * the construct entirely costs nothing and removes the primitive.
 *
 * The check is syntactic, and that is defensible here for a specific reason:
 * `import(...)` is *syntax*, not a callable value. There is no
 * `globalThis["import"]`, escaped keywords are not valid, so the token has to
 * appear literally in the source. Strings and comments are stripped first so a
 * capability may still talk about importing in its own documentation.
 *
 * It is not a complete defence on its own — nothing syntactic is — but it sits
 * behind mandatory pull-request review (SEC-6) and in front of a sandbox that
 * grants nothing else.
 */

import { CfcmError } from "../types.ts";

/** Removes comments and string bodies so only real code is scanned. */
function stripLiterals(source: string): string {
  let out = "";
  let i = 0;

  while (i < source.length) {
    const two = source.slice(i, i + 2);

    if (two === "//") {
      const end = source.indexOf("\n", i);
      i = end === -1 ? source.length : end;
      continue;
    }
    if (two === "/*") {
      const end = source.indexOf("*/", i + 2);
      i = end === -1 ? source.length : end + 2;
      continue;
    }

    const char = source[i];
    if (char === '"' || char === "'" || char === "`") {
      const quote = char;
      i++;
      while (i < source.length) {
        if (source[i] === "\\") {
          i += 2;
          continue;
        }
        if (source[i] === quote) {
          i++;
          break;
        }
        // A template literal's ${...} holds real code, so keep scanning it.
        if (quote === "`" && source.slice(i, i + 2) === "${") {
          let depth = 1;
          i += 2;
          const start = i;
          while (i < source.length && depth > 0) {
            if (source[i] === "{") depth++;
            else if (source[i] === "}") depth--;
            i++;
          }
          out += ` ${stripLiterals(source.slice(start, i - 1))} `;
          continue;
        }
        i++;
      }
      out += ' "" ';
      continue;
    }

    out += char;
    i++;
  }

  return out;
}

export interface ModuleLoadFinding {
  construct: string;
  line: number;
}

const FORBIDDEN: [RegExp, string][] = [
  // Dynamic import. Whitespace and comments between the token and the paren are
  // legal, and comments are already gone by this point.
  [/(^|[^.\w$])import\s*\(/, "import(...)"],
  // Static import in any of its forms.
  [/(^|[^.\w$])import\s+["'{*\w]/, "import ... from"],
  [/(^|[^.\w$])export\s+\*\s+from/, "export * from"],
  [/(^|[^.\w$])export\s*\{[^}]*\}\s*from/, "export { ... } from"],
  [/(^|[^.\w$])require\s*\(/, "require(...)"],
  // A worker is a second module graph, loaded the same ungated way.
  [/new\s+Worker\s*\(/, "new Worker(...)"],
];

export function findModuleLoading(source: string): ModuleLoadFinding[] {
  const stripped = stripLiterals(source);
  const findings: ModuleLoadFinding[] = [];

  // Scanned as one string rather than line by line: `import` and its opening
  // paren may legally sit on separate lines, and a per-line check would miss
  // exactly the split a determined author would use.
  for (const [pattern, construct] of FORBIDDEN) {
    const global = new RegExp(pattern.source, "g");
    for (const match of stripped.matchAll(global)) {
      const line = stripped.slice(0, match.index).split("\n").length;
      findings.push({ construct, line });
    }
  }

  return findings.sort((a, b) => a.line - b.line || a.construct.localeCompare(b.construct));
}

export function assertNoModuleLoading(source: string, capability: string): void {
  const findings = findModuleLoading(source);
  if (findings.length === 0) return;

  const detail = findings.map((f) => `line ${f.line}: ${f.construct}`).join(", ");
  throw new CfcmError(
    "ARTIFACT_LOADS_MODULES",
    `${capability} tries to load a module (${detail}). Capability artifacts must be a single ` +
      "self-contained file: Deno does not gate module loading behind permissions, so an import " +
      "is a way out of a sandbox that grants nothing else.",
    { capability, findings },
  );
}
