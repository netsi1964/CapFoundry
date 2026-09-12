/**
 * Netsi.demo.getCustomer
 *
 * A private-namespace fixture (MVP section 14).
 *
 * Its job is not to be useful. Its job is to prove four things at once:
 *
 *   1. cfcm.json can register a private namespace with no CFCM code knowing
 *      the organisation exists.
 *   2. A private capability is searched alongside public ones, in one space.
 *   3. Private policy can differ: this one sets exposure.artifact to false,
 *      so it executes but never hands back its source.
 *   4. Execution stays local; nothing reaches the central registry.
 *
 * It deliberately does NOT connect to a real system. A fixture that needed
 * credentials would prove the namespace model works only where credentials
 * exist, which is the opposite of what a proof should require.
 *
 * PURE: the "database" is the frozen table below.
 */

export interface GetCustomerInput {
  customerId: string;
}

export interface Customer {
  customerId: string;
  name: string;
  segment: "enterprise" | "smb" | "public";
  country: string;
  active: boolean;
}

export interface GetCustomerOutput {
  found: boolean;
  customer: Customer | null;
}

/** Entirely invented. No real customer data belongs in a repository. */
const CUSTOMERS: Record<string, Customer> = {
  "C-1001": {
    customerId: "C-1001",
    name: "Nordlys Analyse ApS",
    segment: "smb",
    country: "DK",
    active: true,
  },
  "C-1002": {
    customerId: "C-1002",
    name: "Fjordbyg Entreprise A/S",
    segment: "enterprise",
    country: "DK",
    active: true,
  },
  "C-1003": {
    customerId: "C-1003",
    name: "Vestegnens Kommune",
    segment: "public",
    country: "DK",
    active: false,
  },
};

export default function getCustomer(input: GetCustomerInput): GetCustomerOutput {
  if (!input || typeof input !== "object" || typeof input.customerId !== "string") {
    throw new TypeError("input must be an object with a customerId string");
  }

  const key = input.customerId.trim().toUpperCase();

  // Object.hasOwn, not a bare lookup: without it, "constructor" or "toString"
  // would resolve through Object.prototype and report a customer that does not
  // exist. Uppercasing happens to dodge those particular keys today, which is
  // luck rather than a defence.
  const customer = Object.hasOwn(CUSTOMERS, key) ? CUSTOMERS[key] : undefined;

  // A missing customer is an answer, not an error: the caller asked whether
  // one exists, and throwing would force exception handling for a normal case.
  return { found: customer !== undefined, customer: customer ?? null };
}
