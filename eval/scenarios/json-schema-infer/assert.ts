import type { Assertion } from "../../types.ts";
import { join } from "@std/path";

/**
 * The two things that separate a real inference from a plausible one:
 * `note` appears on two of three records and is null on one, so it is optional
 * and nullable; `paid` appears on all three, so it is required. A schema that
 * marks everything required, or everything optional, has not looked at the data.
 */
const assertion: Assertion = async (ctx) => {
  let schema: Record<string, unknown>;
  try {
    schema = JSON.parse(await Deno.readTextFile(join(ctx.workspace, "schema.json")));
  } catch (err) {
    return { pass: false, detail: `schema.json missing or not JSON: ${(err as Error).message}` };
  }

  // The root may be described as an array of objects, or as the object itself.
  const items = (schema.items ?? schema) as Record<string, unknown>;
  const props = (items.properties ?? {}) as Record<string, unknown>;
  const required = (items.required ?? []) as string[];

  const missing = ["id", "customer", "total", "paid"].filter((k) => !(k in props));
  if (missing.length > 0) {
    return { pass: false, detail: `schema omits ${missing.join(", ")}` };
  }
  if (!Array.isArray(required) || !required.includes("id") || !required.includes("paid")) {
    return { pass: false, detail: `id and paid appear on every record but are not both required` };
  }
  if (required.includes("note")) {
    return { pass: false, detail: `note is absent from one record, so it cannot be required` };
  }
  return {
    pass: true,
    detail: `${Object.keys(props).length} properties, ${required.length} required`,
  };
};

export default assertion;
