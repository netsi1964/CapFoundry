import { assertEquals } from "@std/assert";
import quote from "../artifact/index.ts";

// Cannot run without network: there is no seam to test through.
Deno.test("fetches a quote", async () => {
  assertEquals((await quote({ symbol: "novo" })).symbol, "NOVO");
});
