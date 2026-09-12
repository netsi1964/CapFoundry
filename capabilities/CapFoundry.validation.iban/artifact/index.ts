/**
 * CapFoundry.validation.iban
 *
 * Validates an IBAN per ISO 13616 and returns a normalized form.
 *
 * What this checks: length for the country, the character set, and the
 * ISO 7064 mod-97-10 checksum. What it cannot check: whether the account
 * exists, whether it is open, or whether it belongs to who you think. A
 * structurally valid IBAN is a well-formed string, not a verified payee — the
 * output says `valid`, never `safe to pay`.
 *
 * On failure the reason is machine-readable, because "invalid" alone forces
 * the caller to re-derive what went wrong to show a useful message.
 *
 * PURE: no network, no filesystem, no clock, no randomness.
 */

export interface IbanInput {
  iban: string;
}

export type IbanReason =
  | "TOO_SHORT"
  | "INVALID_CHARACTERS"
  | "UNKNOWN_COUNTRY"
  | "WRONG_LENGTH_FOR_COUNTRY"
  | "CHECKSUM_FAILED";

export interface IbanOutput {
  valid: boolean;
  /** Uppercase, no spaces. Null when the input could not be normalized. */
  normalized: string | null;
  countryCode: string | null;
  /** Groups of four, the printed form. Null when invalid. */
  formatted: string | null;
  reason: IbanReason | null;
  message: string | null;
}

/** ISO 13616 registry lengths. A country absent here is rejected, not guessed. */
const COUNTRY_LENGTHS: Record<string, number> = {
  AD: 24,
  AE: 23,
  AL: 28,
  AT: 20,
  AZ: 28,
  BA: 20,
  BE: 16,
  BG: 22,
  BH: 22,
  BI: 27,
  BR: 29,
  BY: 28,
  CH: 21,
  CR: 22,
  CY: 28,
  CZ: 24,
  DE: 22,
  DJ: 27,
  DK: 18,
  DO: 28,
  EE: 20,
  EG: 29,
  ES: 24,
  FI: 18,
  FK: 18,
  FO: 18,
  FR: 27,
  GB: 22,
  GE: 22,
  GI: 23,
  GL: 18,
  GR: 27,
  GT: 28,
  HR: 21,
  HU: 28,
  IE: 22,
  IL: 23,
  IQ: 23,
  IS: 26,
  IT: 27,
  JO: 30,
  KW: 30,
  KZ: 20,
  LB: 28,
  LC: 32,
  LI: 21,
  LT: 20,
  LU: 20,
  LV: 21,
  LY: 25,
  MC: 27,
  MD: 24,
  ME: 22,
  MK: 19,
  MN: 20,
  MR: 27,
  MT: 31,
  MU: 30,
  NI: 28,
  NL: 18,
  NO: 15,
  OM: 23,
  PK: 24,
  PL: 28,
  PS: 29,
  PT: 25,
  QA: 29,
  RO: 24,
  RS: 22,
  RU: 33,
  SA: 24,
  SC: 31,
  SD: 18,
  SE: 24,
  SI: 19,
  SK: 24,
  SM: 27,
  SO: 23,
  ST: 25,
  SV: 28,
  TL: 23,
  TN: 24,
  TR: 26,
  UA: 29,
  VA: 22,
  VG: 24,
  XK: 20,
  YE: 30,
};

function fail(reason: IbanReason, message: string, normalized: string | null): IbanOutput {
  return { valid: false, normalized, countryCode: null, formatted: null, reason, message };
}

/**
 * ISO 7064 mod-97-10, computed in chunks.
 *
 * An IBAN can be 34 characters, which expands to well over 60 digits once
 * letters become numbers — far beyond what a double can hold exactly. Folding
 * the remainder every 7 digits keeps every intermediate inside safe integer
 * range without reaching for BigInt.
 */
function mod97(digits: string): number {
  let remainder = 0;
  for (let i = 0; i < digits.length; i += 7) {
    remainder = Number(`${remainder}${digits.slice(i, i + 7)}`) % 97;
  }
  return remainder;
}

export default function validateIban(input: IbanInput): IbanOutput {
  if (!input || typeof input !== "object") {
    throw new TypeError("input must be an object with an iban field");
  }
  if (typeof input.iban !== "string") {
    throw new TypeError("iban must be a string");
  }

  // Spaces are how IBANs are printed, so stripping them is normalization
  // rather than leniency.
  const normalized = input.iban.replace(/[\s]/g, "").toUpperCase();

  if (normalized.length === 0) {
    return fail("TOO_SHORT", "IBAN is empty", null);
  }
  if (!/^[A-Z0-9]+$/.test(normalized)) {
    return fail(
      "INVALID_CHARACTERS",
      "IBAN may contain only letters and digits once spaces are removed",
      normalized,
    );
  }
  // Shortest registered IBAN is Norway at 15.
  if (normalized.length < 15) {
    return fail(
      "TOO_SHORT",
      `IBAN is ${normalized.length} characters; the minimum is 15`,
      normalized,
    );
  }
  if (!/^[A-Z]{2}\d{2}/.test(normalized)) {
    return fail(
      "INVALID_CHARACTERS",
      "IBAN must start with a two-letter country code followed by two check digits",
      normalized,
    );
  }

  const countryCode = normalized.slice(0, 2);
  const expectedLength = COUNTRY_LENGTHS[countryCode];
  if (expectedLength === undefined) {
    return fail(
      "UNKNOWN_COUNTRY",
      `"${countryCode}" is not a registered IBAN country code`,
      normalized,
    );
  }
  if (normalized.length !== expectedLength) {
    return fail(
      "WRONG_LENGTH_FOR_COUNTRY",
      `${countryCode} IBANs are ${expectedLength} characters; this one is ${normalized.length}`,
      normalized,
    );
  }

  // Move the first four characters to the end, then map A-Z to 10-35.
  const rearranged = normalized.slice(4) + normalized.slice(0, 4);
  let digits = "";
  for (const char of rearranged) {
    digits += char >= "A" && char <= "Z" ? String(char.charCodeAt(0) - 55) : char;
  }

  if (mod97(digits) !== 1) {
    return fail("CHECKSUM_FAILED", "IBAN check digits do not match the account number", normalized);
  }

  return {
    valid: true,
    normalized,
    countryCode,
    formatted: normalized.match(/.{1,4}/g)!.join(" "),
    reason: null,
    message: null,
  };
}
