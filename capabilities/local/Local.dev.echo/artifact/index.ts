/**
 * Local.dev.echo
 *
 * The reserved-namespace fixture (MVP section 15).
 *
 * `Local.*` means *this machine only*. This capability exists to verify that
 * semantic holds: CFCM finds it, and it is absent from both the central
 * registry and every configured private namespace source.
 *
 * Echoing input back is the smallest thing that still proves the whole path
 * ran — search, resolve, spawn, execute, return — because a wrong answer is
 * impossible to mistake for a right one.
 *
 * PURE: no network, no filesystem, no clock, no randomness.
 */

export interface EchoInput {
  /** Any JSON value. Returned unchanged. */
  value?: unknown;
  /** Optional label, echoed back so a caller can correlate calls. */
  label?: string;
}

export interface EchoOutput {
  echoed: unknown;
  label: string | null;
  /** Depth of the returned value, as cheap proof the payload was walked. */
  depth: number;
}

function depthOf(value: unknown, depth = 0): number {
  if (depth > 64) return depth;
  if (Array.isArray(value)) {
    return value.length === 0 ? depth + 1 : Math.max(...value.map((v) => depthOf(v, depth + 1)));
  }
  if (value !== null && typeof value === "object") {
    const values = Object.values(value as Record<string, unknown>);
    return values.length === 0 ? depth + 1 : Math.max(...values.map((v) => depthOf(v, depth + 1)));
  }
  return depth;
}

export default function echo(input: EchoInput): EchoOutput {
  if (input !== null && input !== undefined && typeof input !== "object") {
    throw new TypeError("input must be an object with an optional value and label");
  }

  const safe = input ?? {};
  if (safe.label !== undefined && typeof safe.label !== "string") {
    throw new TypeError("label must be a string when present");
  }

  return {
    echoed: safe.value ?? null,
    label: safe.label ?? null,
    depth: depthOf(safe.value ?? null),
  };
}
