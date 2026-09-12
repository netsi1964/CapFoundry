/**
 * cfcm.json loading and validation (PRD-FEAT-003.1).
 *
 * Two rules matter here and are enforced rather than documented:
 *  - `Local` and `CapFoundry` are reserved namespace names (PRD-FEAT-003.5).
 *  - A missing config is not an error. CFCM must start with sane defaults so a
 *    first-time user gets a working search over the public registry.
 */

import { dirname, isAbsolute, join, resolve } from "@std/path";
import { CfcmError } from "../types.ts";
import type { CfcmConfig, NamespaceConfig, NetworkPolicy } from "../types.ts";
import { DEFAULT_THRESHOLDS } from "../search/engine.ts";

export const RESERVED_NAMESPACES = ["Local", "CapFoundry"];

export const DEFAULT_CONFIG: CfcmConfig = {
  capfoundry: { registry: null, enabled: true },
  search: { ...DEFAULT_THRESHOLDS },
  execution: {
    defaultTimeoutMs: 5000,
    maxOutputBytes: 4 * 1024 * 1024,
    network: { enabled: false, allow: [] },
  },
  telemetry: { local: true, upload: false, endpoint: null, logQueryText: false },
  namespaces: [],
};

function num(value: unknown, fallback: number, field: string, min: number, max: number): number {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new CfcmError("CONFIG_INVALID", `cfcm.json: "${field}" must be a number`);
  }
  if (value < min || value > max) {
    throw new CfcmError(
      "CONFIG_INVALID",
      `cfcm.json: "${field}" must be between ${min} and ${max}`,
    );
  }
  return value;
}

function parseNamespaces(raw: unknown, baseDir: string): NamespaceConfig[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new CfcmError("CONFIG_INVALID", 'cfcm.json: "namespaces" must be an array');
  }

  return raw.map((entry, i): NamespaceConfig => {
    const at = `namespaces[${i}]`;
    if (!entry || typeof entry !== "object") {
      throw new CfcmError("CONFIG_INVALID", `cfcm.json: ${at} must be an object`);
    }
    const e = entry as Record<string, unknown>;

    if (typeof e.name !== "string" || e.name.length === 0) {
      throw new CfcmError("CONFIG_INVALID", `cfcm.json: ${at}.name is required`);
    }
    if (RESERVED_NAMESPACES.includes(e.name)) {
      throw new CfcmError(
        "CONFIG_RESERVED_NAMESPACE",
        `cfcm.json: ${at}.name "${e.name}" is reserved. ` +
          (e.name === "Local"
            ? "Local.* is built into CFCM and means this machine only; it cannot be declared as an external source."
            : 'CapFoundry.* is served by the public registry, configured under "capfoundry.registry".'),
      );
    }
    if (e.type !== "private") {
      throw new CfcmError("CONFIG_INVALID", `cfcm.json: ${at}.type must be "private"`);
    }

    const source = e.source as Record<string, unknown> | undefined;
    if (!source || source.type !== "filesystem" || typeof source.path !== "string") {
      throw new CfcmError(
        "CONFIG_INVALID",
        `cfcm.json: ${at}.source must be { "type": "filesystem", "path": "..." }`,
      );
    }

    const path = isAbsolute(source.path) ? source.path : join(baseDir, source.path);
    const perms = (e.permissions ?? {}) as Record<string, unknown>;

    return {
      name: e.name,
      type: "private",
      source: { type: "filesystem", path },
      permissions: {
        network: (perms.network as string[]) ?? [],
        secrets: (perms.secrets as string[]) ?? [],
        filesystem: (perms.filesystem as string[]) ?? [],
      },
    };
  });
}

/**
 * Machine-level network policy.
 *
 * Disabled by default and empty by default, so upgrading CFCM never silently
 * grants a machine something it did not have. Turning it on is a decision a
 * person makes in a file they own.
 */
function parseNetworkPolicy(raw: unknown): NetworkPolicy {
  if (raw === undefined || raw === null) return { enabled: false, allow: [] };
  if (typeof raw !== "object") {
    throw new CfcmError("CONFIG_INVALID", 'cfcm.json: "execution.network" must be an object');
  }
  const r = raw as Record<string, unknown>;

  const allow = r.allow ?? [];
  if (!Array.isArray(allow) || allow.some((h) => typeof h !== "string" || h.length === 0)) {
    throw new CfcmError(
      "CONFIG_INVALID",
      'cfcm.json: "execution.network.allow" must be an array of host strings',
    );
  }
  // A wildcard would turn a host allowlist into no allowlist at all, which is
  // worse than disabling the feature because it looks like a policy.
  for (const host of allow as string[]) {
    if (host.includes("*")) {
      throw new CfcmError(
        "CONFIG_INVALID",
        `cfcm.json: "execution.network.allow" entry "${host}" contains a wildcard. ` +
          "List hosts explicitly; a wildcard allowlist is not an allowlist.",
      );
    }
  }

  return { enabled: r.enabled === true, allow: (allow as string[]).map((h) => h.toLowerCase()) };
}

export function parseConfig(raw: unknown, baseDir: string): CfcmConfig {
  if (!raw || typeof raw !== "object") {
    throw new CfcmError("CONFIG_INVALID", "cfcm.json must contain a JSON object");
  }
  const r = raw as Record<string, unknown>;
  const cf = (r.capfoundry ?? {}) as Record<string, unknown>;
  const search = (r.search ?? {}) as Record<string, unknown>;
  const exec = (r.execution ?? {}) as Record<string, unknown>;
  const tel = (r.telemetry ?? {}) as Record<string, unknown>;

  const matchThreshold = num(
    search.matchThreshold,
    DEFAULT_THRESHOLDS.matchThreshold,
    "search.matchThreshold",
    0,
    1,
  );
  const partialThreshold = num(
    search.partialThreshold,
    DEFAULT_THRESHOLDS.partialThreshold,
    "search.partialThreshold",
    0,
    1,
  );
  if (partialThreshold > matchThreshold) {
    throw new CfcmError(
      "CONFIG_INVALID",
      'cfcm.json: "search.partialThreshold" must not exceed "search.matchThreshold"',
    );
  }

  // A relative registry path resolves against the config file, exactly like a
  // private namespace's source path. Resolving one against the config and the
  // other against the process CWD would make the same "./x" in one file mean
  // two different places depending on where CFCM happened to be started.
  let registry: string | null = null;
  if (typeof cf.registry === "string" && cf.registry.length > 0) {
    registry = /^[a-z][a-z0-9+.-]*:\/\//i.test(cf.registry) || isAbsolute(cf.registry)
      ? cf.registry
      : resolve(join(baseDir, cf.registry));
  }

  return {
    capfoundry: {
      registry,
      enabled: cf.enabled === undefined ? true : cf.enabled === true,
    },
    search: {
      matchThreshold,
      partialThreshold,
      coverageWeight: num(
        search.coverageWeight,
        DEFAULT_THRESHOLDS.coverageWeight,
        "search.coverageWeight",
        0,
        1,
      ),
      marginWeight: num(
        search.marginWeight,
        DEFAULT_THRESHOLDS.marginWeight,
        "search.marginWeight",
        0,
        1,
      ),
    },
    execution: {
      defaultTimeoutMs: num(exec.defaultTimeoutMs, 5000, "execution.defaultTimeoutMs", 1, 600_000),
      maxOutputBytes: num(
        exec.maxOutputBytes,
        4 * 1024 * 1024,
        "execution.maxOutputBytes",
        1024,
        512 * 1024 * 1024,
      ),
      network: parseNetworkPolicy(exec.network),
    },
    telemetry: {
      local: tel.local === undefined ? true : tel.local === true,
      upload: tel.upload === true,
      endpoint: typeof tel.endpoint === "string" ? tel.endpoint : null,
      logQueryText: tel.logQueryText === true,
    },
    namespaces: parseNamespaces(r.namespaces, baseDir),
  };
}

/** Reads cfcm.json, falling back to defaults when the file does not exist. */
export async function loadConfig(
  path?: string,
): Promise<{ config: CfcmConfig; path: string | null }> {
  const candidate = path ?? Deno.env.get("CFCM_CONFIG") ?? "./cfcm.json";
  let text: string;
  try {
    text = await Deno.readTextFile(candidate);
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      if (path) {
        throw new CfcmError("CONFIG_NOT_FOUND", `cfcm.json not found at ${candidate}`);
      }
      return { config: structuredClone(DEFAULT_CONFIG), path: null };
    }
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new CfcmError(
      "CONFIG_INVALID",
      `cfcm.json at ${candidate} is not valid JSON: ${(err as Error).message}`,
    );
  }

  return { config: parseConfig(parsed, dirname(candidate)), path: candidate };
}
