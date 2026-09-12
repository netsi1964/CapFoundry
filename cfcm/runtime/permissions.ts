/**
 * Computing what a capability is actually allowed to reach.
 *
 * The rule is an intersection, and both halves are load-bearing:
 *
 *   granted = what the capability declared  ∩  what this machine permits
 *
 * The descriptor alone cannot be the answer — a capability that grants itself
 * permissions is self-certifying, which is not a permission model, it is a
 * comment. Local policy alone cannot be the answer either, because you would
 * have to know every capability's needs before installing it.
 *
 * A shortfall is refused rather than silently narrowed. Granting a capability
 * two of the three hosts it asked for produces a failure halfway through its
 * work, at a point the caller cannot interpret; refusing up front names the
 * missing host and is actionable.
 */

import { CfcmError } from "../types.ts";
import type { CfcmConfig, Effect, IndexRecord } from "../types.ts";

export interface Grant {
  /** Hosts to pass to --allow-net. Empty means the subprocess gets no network. */
  network: string[];
}

/** Hosts this machine permits for a capability in the given namespace. */
export function permittedHosts(config: CfcmConfig, capabilityName: string): string[] {
  if (!config.execution.network.enabled) return [];

  const hosts = new Set(config.execution.network.allow);

  // A private namespace may be granted hosts the machine-wide list does not
  // carry: an internal API is exactly the case where a blanket allowlist would
  // be wrong.
  const namespace = capabilityName.split(".")[0];
  const entry = config.namespaces.find((n) => n.name === namespace);
  for (const host of entry?.permissions?.network ?? []) hosts.add(host.toLowerCase());

  return [...hosts].sort();
}

export function computeGrant(record: IndexRecord, config: CfcmConfig): Grant {
  const effect: Effect = record.effect;

  if (effect === "PURE") {
    // A PURE capability that declared hosts is incoherent: either the effect
    // is wrong or the declaration is, and guessing which would mean either
    // over-granting or breaking it.
    if ((record.permissions?.network ?? []).length > 0) {
      throw new CfcmError(
        "DESCRIPTOR_INCONSISTENT",
        `${record.name} declares effect PURE but also requests network access. ` +
          "A PURE capability reaches nothing; change the effect or drop the declaration.",
        { capability: record.name },
      );
    }
    return { network: [] };
  }

  if (effect !== "NETWORK") {
    throw new CfcmError(
      "EFFECT_UNSUPPORTED",
      `${record.name} declares effect ${effect}; CFCM executes PURE and NETWORK capabilities only`,
      { capability: record.name, effect },
    );
  }

  const declared = (record.permissions?.network ?? []).map((h) => h.toLowerCase());
  if (declared.length === 0) {
    throw new CfcmError(
      "DESCRIPTOR_INCONSISTENT",
      `${record.name} declares effect NETWORK but lists no hosts under permissions.network. ` +
        "An unbounded network capability cannot be granted; list the hosts it needs.",
      { capability: record.name },
    );
  }

  if (!config.execution.network.enabled) {
    throw new CfcmError(
      "NETWORK_DISABLED",
      `${record.name} needs network access, but execution.network.enabled is false in cfcm.json. ` +
        `Enable it and allow ${declared.join(", ")} to run this capability.`,
      { capability: record.name, declared },
    );
  }

  const permitted = new Set(permittedHosts(config, record.name));
  const missing = declared.filter((host) => !permitted.has(host));

  if (missing.length > 0) {
    throw new CfcmError(
      "NETWORK_NOT_PERMITTED",
      `${record.name} needs ${missing.join(", ")}, which this machine does not permit. ` +
        `Add ${missing.length === 1 ? "it" : "them"} to execution.network.allow in cfcm.json ` +
        "if you intend to let this capability reach there.",
      { capability: record.name, declared, missing },
    );
  }

  return { network: declared.sort() };
}
