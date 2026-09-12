/**
 * A deliberately small JSON Schema validator.
 *
 * CapFoundry validates two kinds of documents: capability descriptors we write
 * ourselves, and capability input/output against schemas declared in those
 * descriptors. Both are simple, so a full JSON Schema implementation would be a
 * dependency we cannot justify at MVP scale (PRD-SEC-004).
 *
 * Supported: type, enum, const, required, properties, additionalProperties,
 * items, minItems, maxItems, minimum, maximum, exclusiveMinimum,
 * exclusiveMaximum, minLength, maxLength, pattern, anyOf, oneOf, allOf, not,
 * $ref to "#" and "#/$defs/<name>".
 *
 * Anything else in a schema is IGNORED rather than rejected, so an unsupported
 * keyword silently weakens validation instead of breaking it. Keep schemas
 * inside this subset.
 */

import type { JsonSchema } from "../types.ts";

export interface ValidationIssue {
  path: string;
  message: string;
}

const TYPE_NAMES = ["null", "boolean", "object", "array", "number", "integer", "string"] as const;
type TypeName = typeof TYPE_NAMES[number];

function typeOf(value: unknown): Exclude<TypeName, "integer"> {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  const t = typeof value;
  if (t === "boolean" || t === "string" || t === "object" || t === "number") return t;
  // undefined, function, symbol, bigint have no JSON representation.
  return "null";
}

function matchesType(value: unknown, expected: TypeName): boolean {
  if (expected === "integer") {
    return typeof value === "number" && Number.isInteger(value) && Number.isFinite(value);
  }
  if (expected === "number") {
    return typeof value === "number" && Number.isFinite(value);
  }
  return typeOf(value) === expected;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeOf(a) !== typeOf(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a as object).sort();
    const kb = Object.keys(b as object).sort();
    if (!deepEqual(ka, kb)) return false;
    return ka.every((k) =>
      deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])
    );
  }
  return false;
}

function resolveRef(ref: string, root: JsonSchema): JsonSchema | null {
  if (ref === "#") return root;
  const defsPrefix = "#/$defs/";
  if (ref.startsWith(defsPrefix)) {
    const key = ref.slice(defsPrefix.length);
    const defs = root.$defs as Record<string, JsonSchema> | undefined;
    return defs?.[key] ?? null;
  }
  return null;
}

function check(
  value: unknown,
  schema: JsonSchema,
  path: string,
  root: JsonSchema,
  issues: ValidationIssue[],
): void {
  // JSON Schema allows a bare boolean in place of an object schema.
  const asBool = schema as unknown;
  if (asBool === true || asBool === undefined || asBool === null) return;
  if (asBool === false) {
    issues.push({ path, message: "schema forbids any value here" });
    return;
  }

  if (typeof schema.$ref === "string") {
    const target = resolveRef(schema.$ref, root);
    if (!target) {
      issues.push({ path, message: `unresolvable $ref "${schema.$ref}"` });
      return;
    }
    check(value, target, path, root, issues);
    return;
  }

  if (schema.type !== undefined) {
    const expected: TypeName[] = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!expected.some((t) => matchesType(value, t))) {
      issues.push({
        path,
        message: `expected type ${expected.join(" | ")}, got ${typeOf(value)}`,
      });
      return; // Further keywords would produce noise once the type is wrong.
    }
  }

  if (Array.isArray(schema.enum) && !schema.enum.some((e: unknown) => deepEqual(value, e))) {
    issues.push({ path, message: `value must be one of ${JSON.stringify(schema.enum)}` });
  }

  if ("const" in schema && !deepEqual(value, schema.const)) {
    issues.push({ path, message: `value must equal ${JSON.stringify(schema.const)}` });
  }

  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      issues.push({ path, message: `string shorter than minLength ${schema.minLength}` });
    }
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) {
      issues.push({ path, message: `string longer than maxLength ${schema.maxLength}` });
    }
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value)) {
      issues.push({ path, message: `string does not match pattern ${schema.pattern}` });
    }
  }

  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      issues.push({ path, message: `value below minimum ${schema.minimum}` });
    }
    if (typeof schema.maximum === "number" && value > schema.maximum) {
      issues.push({ path, message: `value above maximum ${schema.maximum}` });
    }
    if (typeof schema.exclusiveMinimum === "number" && value <= schema.exclusiveMinimum) {
      issues.push({ path, message: `value not above exclusiveMinimum ${schema.exclusiveMinimum}` });
    }
    if (typeof schema.exclusiveMaximum === "number" && value >= schema.exclusiveMaximum) {
      issues.push({ path, message: `value not below exclusiveMaximum ${schema.exclusiveMaximum}` });
    }
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      issues.push({ path, message: `array shorter than minItems ${schema.minItems}` });
    }
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
      issues.push({ path, message: `array longer than maxItems ${schema.maxItems}` });
    }
    if (schema.items) {
      value.forEach((item, i) => check(item, schema.items, `${path}[${i}]`, root, issues));
    }
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const props = (schema.properties ?? {}) as Record<string, JsonSchema>;

    for (const key of (schema.required ?? []) as string[]) {
      if (!(key in obj)) {
        issues.push({
          path: path === "" ? key : `${path}.${key}`,
          message: "required field missing",
        });
      }
    }

    for (const [key, sub] of Object.entries(props)) {
      if (key in obj) check(obj[key], sub, path === "" ? key : `${path}.${key}`, root, issues);
    }

    if (schema.additionalProperties === false) {
      for (const key of Object.keys(obj)) {
        if (!(key in props)) {
          issues.push({
            path: path === "" ? key : `${path}.${key}`,
            message: "unexpected field (additionalProperties is false)",
          });
        }
      }
    } else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
      for (const key of Object.keys(obj)) {
        if (!(key in props)) {
          check(
            obj[key],
            schema.additionalProperties,
            path === "" ? key : `${path}.${key}`,
            root,
            issues,
          );
        }
      }
    }
  }

  if (Array.isArray(schema.allOf)) {
    for (const sub of schema.allOf) check(value, sub, path, root, issues);
  }

  if (Array.isArray(schema.anyOf)) {
    const ok = schema.anyOf.some((sub: JsonSchema) => validate(value, sub, root).length === 0);
    if (!ok) issues.push({ path, message: "value matches none of the anyOf schemas" });
  }

  if (Array.isArray(schema.oneOf)) {
    const hits = schema.oneOf.filter((sub: JsonSchema) => validate(value, sub, root).length === 0);
    if (hits.length !== 1) {
      issues.push({
        path,
        message: `value matches ${hits.length} oneOf schemas, expected exactly 1`,
      });
    }
  }

  if (schema.not && validate(value, schema.not, root).length === 0) {
    issues.push({ path, message: "value matches a schema it must not match" });
  }
}

/** Returns an empty array when `value` is valid. */
export function validate(value: unknown, schema: JsonSchema, root?: JsonSchema): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  check(value, schema, "", root ?? schema, issues);
  return issues;
}

export function formatIssues(issues: ValidationIssue[]): string {
  return issues.map((i) => `  ${i.path || "<root>"}: ${i.message}`).join("\n");
}
