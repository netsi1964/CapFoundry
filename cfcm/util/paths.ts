/**
 * CFCM home layout. CFCM_HOME lets tests and the eval harness run against a
 * throwaway directory instead of the developer's real cache.
 */

import { join } from "@std/path";

export function cfcmHome(): string {
  const override = Deno.env.get("CFCM_HOME");
  if (override) return override;
  const home = Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE") ?? ".";
  return join(home, ".cfcm");
}

export const paths = {
  home: cfcmHome,
  artifacts: () => join(cfcmHome(), "artifacts"),
  indexCache: () => join(cfcmHome(), "index-cache"),
  telemetry: () => join(cfcmHome(), "telemetry"),
  candidates: () => join(cfcmHome(), "candidates"),
  local: () => join(cfcmHome(), "local"),
};

export async function ensureDir(path: string): Promise<void> {
  await Deno.mkdir(path, { recursive: true });
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) return false;
    throw err;
  }
}
