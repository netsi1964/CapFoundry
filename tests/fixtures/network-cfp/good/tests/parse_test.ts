import { assert, assertEquals, assertThrows } from "@std/assert";
import { buildRequest, parse } from "../artifact/index.ts";

const recorded = JSON.parse(
  await Deno.readTextFile(new URL("./fixtures/response.json", import.meta.url)),
);

// ---- buildRequest: encoding and parameters ----

Deno.test("builds a canonical URL", () => {
  const { url } = buildRequest({ symbol: "novo" });
  assertEquals(url, "https://quotes.example/v1/quote?symbol=NOVO");
});

Deno.test("encodes a symbol that would otherwise change the resource", () => {
  // A slash would silently become a path segment; a space would break the URL.
  assert(buildRequest({ symbol: "a/b" }).url.includes("symbol=A%2FB"));
  assert(buildRequest({ symbol: "a b" }).url.includes("symbol=A+B"));
});

Deno.test("preserves non-ASCII characters through encoding", () => {
  // The class of bug where "Rådhuspladsen" arrives as "Grenvej".
  const { url } = buildRequest({ symbol: "grenåvej" });
  assert(url.includes("GREN%C3%85VEJ"), `lost the å: ${url}`);
});

Deno.test("omits an optional parameter rather than sending it empty", () => {
  assert(!buildRequest({ symbol: "x" }).url.includes("ccy="));
  assert(buildRequest({ symbol: "x", currency: "dkk" }).url.includes("ccy=DKK"));
});

Deno.test("sends the headers the API requires", () => {
  const { headers } = buildRequest({ symbol: "x" });
  assertEquals(headers.accept, "application/json");
  assert(headers["user-agent"].length > 0, "an anonymous caller may be refused outright");
});

Deno.test("rejects a missing or blank symbol", () => {
  assertThrows(() => buildRequest({ symbol: "  " }), TypeError);
  assertThrows(() => buildRequest({} as never), TypeError);
});

// ---- parse: the recorded response ----

Deno.test("parses a recorded response", () => {
  assertEquals(parse(recorded, { symbol: "novo" }), {
    symbol: "NOVO",
    price: 142.5,
    currency: "DKK",
    stale: false,
  });
});

Deno.test("a missing timestamp is reported as stale, not assumed fresh", () => {
  assertEquals(parse({ last: 1, ccy: "usd" }, { symbol: "x" }).stale, true);
});

Deno.test("currency defaults rather than throwing", () => {
  assertEquals(parse({ last: 1 }, { symbol: "x" }).currency, "USD");
});

Deno.test("a payload without a usable price is rejected", () => {
  assertThrows(() => parse({ ccy: "usd" }, { symbol: "x" }), RangeError);
  assertThrows(() => parse({ last: "142.5" }, { symbol: "x" }), RangeError);
  assertThrows(() => parse(null, { symbol: "x" }), TypeError);
});
