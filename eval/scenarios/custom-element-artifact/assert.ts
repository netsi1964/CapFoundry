import type { Assertion } from "../../types.ts";
import { join, toFileUrl } from "@std/path";

/**
 * Executes the file rather than pattern-matching it.
 *
 * A regex for `.sort(` would fail a correct implementation that sorts by hand,
 * and pass a file that merely contains the characters. So this stubs the two
 * globals a custom element needs, imports the module, and checks what actually
 * got registered. That proves the file runs and registers an element — which a
 * grep cannot.
 *
 * The honest limit: sorting *behaviour* needs a real DOM, and dragging jsdom or
 * happy-dom into the harness for one scenario is a worse trade than saying so.
 * What is checked here is that a usable element is in the tree, which is the
 * claim the task makes and what OBJ-7 is about.
 */
const assertion: Assertion = async (ctx) => {
  const path = join(ctx.workspace, "src", "data-table.js");
  let source: string;
  try {
    source = await Deno.readTextFile(path);
  } catch {
    return { pass: false, detail: `src/data-table.js was not created in ${ctx.workspace}` };
  }

  if (/^\s*(import\s|export\s+.*\sfrom\s|require\s*\()/m.test(source)) {
    return {
      pass: false,
      detail: "src/data-table.js pulls in a dependency; the task asked for none",
    };
  }

  const registered: { name: string; ctor: unknown }[] = [];
  const g = globalThis as Record<string, unknown>;
  const saved = {
    HTMLElement: g.HTMLElement,
    customElements: g.customElements,
    document: g.document,
  };

  g.HTMLElement = class {
    attachShadow() {
      return { appendChild() {}, innerHTML: "" };
    }
  };
  g.customElements = { define: (name: string, ctor: unknown) => registered.push({ name, ctor }) };
  g.document = { createElement: () => ({ appendChild() {}, setAttribute() {}, innerHTML: "" }) };

  try {
    await import(toFileUrl(path).href + `?t=${Date.now()}`);
  } catch (err) {
    return { pass: false, detail: `src/data-table.js threw on load: ${(err as Error).message}` };
  } finally {
    Object.assign(g, saved);
  }

  if (registered.length === 0) {
    return { pass: false, detail: "loading src/data-table.js registered no custom element" };
  }
  const { name, ctor } = registered[0];
  if (!name.includes("-")) {
    return { pass: false, detail: `"${name}" is not a valid custom element name` };
  }
  if (typeof ctor !== "function") {
    return { pass: false, detail: `${name} was registered with a non-constructor` };
  }
  return { pass: true, detail: `registered <${name}>, dependency-free` };
};

export default assertion;
