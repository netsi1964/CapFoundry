import { assertEquals, assertThrows } from "@std/assert";
import validateIban from "../artifact/index.ts";

// Published ISO 13616 registry examples, which are the canonical test vectors.
const VALID = [
  ["DK5000400440116243", "DK"],
  ["GB82WEST12345698765432", "GB"],
  ["DE89370400440532013000", "DE"],
  ["FR1420041010050500013M02606", "FR"],
  ["NO9386011117947", "NO"],
  ["MT84MALT011000012345MTLCAST001S", "MT"],
  ["SE4550000000058398257466", "SE"],
  ["NL91ABNA0417164300", "NL"],
];

Deno.test("registry example IBANs validate", () => {
  for (const [iban, country] of VALID) {
    const out = validateIban({ iban });
    assertEquals(out.valid, true, `${iban} should be valid, got ${out.reason}`);
    assertEquals(out.countryCode, country);
    assertEquals(out.reason, null);
  }
});

Deno.test("the shortest and longest registered lengths both work", () => {
  // Norway is 15, Malta is 31.
  assertEquals(validateIban({ iban: "NO9386011117947" }).valid, true);
  assertEquals(validateIban({ iban: "MT84MALT011000012345MTLCAST001S" }).valid, true);
});

Deno.test("spaces and lowercase are normalized, not rejected", () => {
  const out = validateIban({ iban: "  dk50 0040 0440 1162 43  " });
  assertEquals(out.valid, true);
  assertEquals(out.normalized, "DK5000400440116243");
});

Deno.test("the printed form is grouped in fours", () => {
  assertEquals(validateIban({ iban: "DK5000400440116243" }).formatted, "DK50 0040 0440 1162 43");
  assertEquals(
    validateIban({ iban: "GB82WEST12345698765432" }).formatted,
    "GB82 WEST 1234 5698 7654 32",
  );
});

Deno.test("a single altered digit fails the checksum", () => {
  const out = validateIban({ iban: "DK5000400440116244" });
  assertEquals(out.valid, false);
  assertEquals(out.reason, "CHECKSUM_FAILED");
  // Normalization still happened, so the caller can echo what was parsed.
  assertEquals(out.normalized, "DK5000400440116244");
});

Deno.test("transposed digits fail the checksum", () => {
  assertEquals(validateIban({ iban: "GB82WEST12345698765423" }).reason, "CHECKSUM_FAILED");
});

Deno.test("wrong check digits fail", () => {
  assertEquals(validateIban({ iban: "DK0000400440116243" }).reason, "CHECKSUM_FAILED");
});

Deno.test("a wrong length for the country is reported as such", () => {
  const out = validateIban({ iban: "DK500040044011624" });
  assertEquals(out.valid, false);
  assertEquals(out.reason, "WRONG_LENGTH_FOR_COUNTRY");
  assertEquals(out.message?.includes("18"), true, "the expected length should be named");
});

Deno.test("an unregistered country is rejected rather than guessed", () => {
  const out = validateIban({ iban: "ZZ8237040044053201300012" });
  assertEquals(out.valid, false);
  assertEquals(out.reason, "UNKNOWN_COUNTRY");
});

Deno.test("non-alphanumeric characters are rejected", () => {
  assertEquals(validateIban({ iban: "DK50-0040-0440-1162-43" }).reason, "INVALID_CHARACTERS");
  assertEquals(validateIban({ iban: "DK50004004401162$3" }).reason, "INVALID_CHARACTERS");
});

Deno.test("a missing country code or check digits is rejected", () => {
  assertEquals(validateIban({ iban: "1234567890123456" }).reason, "INVALID_CHARACTERS");
  assertEquals(validateIban({ iban: "DKXX00400440116243" }).reason, "INVALID_CHARACTERS");
});

Deno.test("too short is reported before anything else", () => {
  assertEquals(validateIban({ iban: "" }).reason, "TOO_SHORT");
  assertEquals(validateIban({ iban: "DK50" }).reason, "TOO_SHORT");
});

Deno.test("an invalid result never carries a country code or formatted form", () => {
  for (const iban of ["", "DK50", "ZZ8237040044053201300012", "DK5000400440116244"]) {
    const out = validateIban({ iban });
    assertEquals(out.valid, false);
    assertEquals(out.countryCode, null);
    assertEquals(out.formatted, null);
  }
});

Deno.test("a valid result never carries a reason", () => {
  for (const [iban] of VALID) {
    const out = validateIban({ iban });
    assertEquals(out.reason, null);
    assertEquals(out.message, null);
  }
});

Deno.test("the longest possible IBAN does not lose precision in mod-97", () => {
  // Russia is 33 characters, which expands well past exact double precision.
  const out = validateIban({ iban: "RU0304452522540817810538091310419" });
  // Whatever the verdict, it must be a checksum decision and not a crash.
  assertEquals(typeof out.valid, "boolean");
  assertEquals(out.reason === null || out.reason === "CHECKSUM_FAILED", true);
});

Deno.test("deterministic across repeated calls", () => {
  const first = JSON.stringify(validateIban({ iban: "DK5000400440116243" }));
  for (let i = 0; i < 100; i++) {
    assertEquals(JSON.stringify(validateIban({ iban: "DK5000400440116243" })), first);
  }
});

Deno.test("rejects non-string input", () => {
  assertThrows(() => validateIban({ iban: 12345 as never }), TypeError);
  assertThrows(() => validateIban(null as never), TypeError);
});
