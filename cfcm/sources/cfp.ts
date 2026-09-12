/**
 * Reading a CFP (CapFoundry Package) from disk and deriving its index record.
 *
 * The index record is always *derived*, never authored: that is what keeps
 * registry/index.json and capabilities/ from drifting apart (PRD-FEAT-002.4).
 */

import { join, resolve } from "@std/path";
import { CfcmError } from "../types.ts";
import type { CapabilityDescriptor, IndexRecord, NamespaceType } from "../types.ts";
import { formatIssues, validate } from "../util/json_schema.ts";
import { pathExists } from "../util/paths.ts";

let descriptorSchema: Record<string, unknown> | null = null;

async function loadDescriptorSchema(): Promise<Record<string, unknown>> {
  if (descriptorSchema) return descriptorSchema;
  const url = new URL("../../schemas/capability.schema.json", import.meta.url);
  descriptorSchema = JSON.parse(await Deno.readTextFile(url));
  return descriptorSchema!;
}

export async function readDescriptor(cfpDir: string): Promise<CapabilityDescriptor> {
  const file = join(cfpDir, "capability.json");
  let raw: unknown;
  try {
    raw = JSON.parse(await Deno.readTextFile(file));
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      throw new CfcmError("CFP_INVALID", `${file}: capability.json is missing`);
    }
    throw new CfcmError("CFP_INVALID", `${file}: not valid JSON — ${(err as Error).message}`);
  }

  const issues = validate(raw, await loadDescriptorSchema());
  if (issues.length > 0) {
    throw new CfcmError(
      "CFP_INVALID",
      `${file}: invalid capability descriptor\n${formatIssues(issues)}`,
      {
        file,
        issues,
      },
    );
  }
  return raw as CapabilityDescriptor;
}

/** Absolute path to a CFP's artifact entrypoint. */
export function entrypointPath(cfpDir: string, descriptor: CapabilityDescriptor): string {
  return resolve(join(cfpDir, descriptor.artifact.entrypoint));
}

export function toIndexRecord(
  descriptor: CapabilityDescriptor,
  cfpLocation: string,
  artifactLocation: string,
  namespaceType: NamespaceType,
  indexedAt: string,
): IndexRecord {
  return {
    schemaVersion: descriptor.schemaVersion,
    name: descriptor.name,
    version: descriptor.version,
    description: descriptor.description,
    aliases: descriptor.aliases,
    exampleQueries: descriptor.exampleQueries,
    tags: descriptor.tags ?? [],
    inputSummary: descriptor.inputSummary,
    outputSummary: descriptor.outputSummary,
    runtime: descriptor.runtime,
    effect: descriptor.effect,
    artifact: { type: descriptor.artifact.type, sha256: descriptor.artifact.sha256 },
    exposure: descriptor.exposure,
    ...(descriptor.permissions ? { permissions: descriptor.permissions } : {}),
    ...(descriptor.limits ? { limits: descriptor.limits } : {}),
    cfpLocation,
    artifactLocation,
    namespaceType,
    indexedAt,
  };
}

/** Lists CFP directories directly beneath `root`. */
export async function listCfpDirs(root: string): Promise<string[]> {
  if (!await pathExists(root)) return [];
  const dirs: string[] = [];
  for await (const entry of Deno.readDir(root)) {
    if (!entry.isDirectory) continue;
    const dir = join(root, entry.name);
    if (await pathExists(join(dir, "capability.json"))) dirs.push(dir);
  }
  return dirs.sort();
}
