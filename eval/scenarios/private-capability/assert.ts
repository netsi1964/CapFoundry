import type { Assertion } from "../../types.ts";
import { join } from "@std/path";

/**
 * The record only exists inside the private namespace, so the control
 * condition cannot invent it. That is deliberate: a capability holding
 * organisational facts is precisely what a private namespace is for, and the
 * scenario should show the control run unable to answer rather than guessing.
 */
const assertion: Assertion = async (ctx) => {
  let text: string;
  try {
    text = (await Deno.readTextFile(join(ctx.workspace, "customer.txt"))).trim();
  } catch {
    return { pass: false, detail: `customer.txt was not created in ${ctx.workspace}` };
  }

  const lower = text.toLowerCase();
  const missing: string[] = [];
  if (!lower.includes("fjordbyg")) missing.push("company name");
  if (!lower.includes("enterprise")) missing.push("segment");
  if (!/\bactive\b|\baktiv\b|\byes\b|\btrue\b/.test(lower)) missing.push("active status");

  return missing.length === 0 ? { pass: true, detail: text.slice(0, 80) } : {
    pass: false,
    detail: `customer.txt omits ${missing.join(", ")}: ${JSON.stringify(text.slice(0, 80))}`,
  };
};

export default assertion;
