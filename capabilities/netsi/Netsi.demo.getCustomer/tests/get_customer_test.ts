import { assertEquals, assertThrows } from "@std/assert";
import getCustomer from "../artifact/index.ts";

Deno.test("finds a known customer", () => {
  const out = getCustomer({ customerId: "C-1001" });
  assertEquals(out.found, true);
  assertEquals(out.customer?.name, "Nordlys Analyse ApS");
  assertEquals(out.customer?.segment, "smb");
});

Deno.test("returns each seeded segment", () => {
  assertEquals(getCustomer({ customerId: "C-1002" }).customer?.segment, "enterprise");
  assertEquals(getCustomer({ customerId: "C-1003" }).customer?.segment, "public");
});

Deno.test("an inactive customer is still found", () => {
  const out = getCustomer({ customerId: "C-1003" });
  assertEquals(out.found, true);
  assertEquals(out.customer?.active, false);
});

Deno.test("a missing customer is an answer, not an error", () => {
  const out = getCustomer({ customerId: "C-9999" });
  assertEquals(out.found, false);
  assertEquals(out.customer, null);
});

Deno.test("identifiers are trimmed and case-insensitive", () => {
  assertEquals(getCustomer({ customerId: "  c-1001  " }).found, true);
  assertEquals(getCustomer({ customerId: "c-1001" }).customer?.customerId, "C-1001");
});

Deno.test("an empty identifier is simply not found", () => {
  assertEquals(getCustomer({ customerId: " " }).found, false);
});

Deno.test("a prototype key cannot be reached through the lookup", () => {
  // A bare CUSTOMERS[key] would resolve these through Object.prototype and
  // report a customer that does not exist. Uppercasing alone would not save
  // us here: these are checked in the exact casing the map uses.
  for (const key of ["CONSTRUCTOR", "__PROTO__", "TOSTRING", "VALUEOF", "HASOWNPROPERTY"]) {
    const out = getCustomer({ customerId: key });
    assertEquals(out.found, false, `${key} must not resolve to a customer`);
    assertEquals(out.customer, null);
  }
  // And in the casing a caller would actually type.
  assertEquals(getCustomer({ customerId: "constructor" }).found, false);
  assertEquals(getCustomer({ customerId: "__proto__" }).found, false);
});

Deno.test("the returned record is complete", () => {
  const customer = getCustomer({ customerId: "C-1002" }).customer!;
  assertEquals(Object.keys(customer).sort(), [
    "active",
    "country",
    "customerId",
    "name",
    "segment",
  ]);
});

Deno.test("deterministic across repeated calls", () => {
  const first = JSON.stringify(getCustomer({ customerId: "C-1001" }));
  for (let i = 0; i < 100; i++) {
    assertEquals(JSON.stringify(getCustomer({ customerId: "C-1001" })), first);
  }
});

Deno.test("rejects a non-string identifier", () => {
  assertThrows(() => getCustomer({ customerId: 1001 as never }), TypeError);
  assertThrows(() => getCustomer(null as never), TypeError);
});
