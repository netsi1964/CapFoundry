/**
 * Filesystem source: a directory of CFPs.
 *
 * Backs both private namespaces from cfcm.json (PRD-FEAT-003.3) and the
 * built-in Local.* source (PRD-FEAT-003.4), which differ only in namespace
 * type and in the name prefix they will accept.
 */

import { join } from "@std/path";
import { CfcmError } from "../types.ts";
import type { CapabilityDescriptor, IndexRecord, NamespaceType } from "../types.ts";
import type { CapabilitySource, SourceStatus } from "./mod.ts";
import { entrypointPath, listCfpDirs, readDescriptor, toIndexRecord } from "./cfp.ts";
import { pathExists } from "../util/paths.ts";

export class FilesystemSource implements CapabilitySource {
  status: SourceStatus = "ok";
  statusDetail?: string;
  private dirByName = new Map<string, string>();

  constructor(
    readonly id: string,
    private readonly root: string,
    readonly namespaceType: NamespaceType,
    /** When set, every capability found here must start with `${prefix}.`. */
    private readonly requiredPrefix?: string,
    /**
     * An absent root is normal rather than a fault. True for the built-in
     * Local.* source, which most machines simply never populate; false for a
     * private namespace, where a missing path means a misconfiguration the
     * user needs told about.
     */
    private readonly optional = false,
  ) {}

  async freshness(): Promise<string | null> {
    if (!await pathExists(this.root)) return "missing";
    // The *listing* is part of the token, not just mtimes: adding a CFP always
    // changes the set of names, so a promoted capability is detected exactly
    // rather than depending on the filesystem's mtime granularity.
    const parts: string[] = [];
    for (const dir of (await listCfpDirs(this.root)).sort()) {
      let stamp = "0:0";
      try {
        const stat = await Deno.stat(join(dir, "capability.json"));
        stamp = `${stat.mtime?.getTime() ?? 0}:${stat.size}`;
      } catch {
        // A half-written CFP counts as changed, and will be read again next time.
      }
      parts.push(`${dir}@${stamp}`);
    }
    return parts.join("|");
  }

  async load(): Promise<IndexRecord[]> {
    if (!await pathExists(this.root)) {
      // A misconfigured private namespace must not stop CFCM from serving the
      // sources that do work (PRD-FEAT-003 acceptance criterion).
      this.status = this.optional ? "ok" : "unavailable";
      this.statusDetail = this.optional ? undefined : `source path does not exist: ${this.root}`;
      return [];
    }

    const now = new Date().toISOString();
    const records: IndexRecord[] = [];
    this.dirByName.clear();

    for (const dir of await listCfpDirs(this.root)) {
      const descriptor = await readDescriptor(dir);

      if (this.requiredPrefix && !descriptor.name.startsWith(`${this.requiredPrefix}.`)) {
        throw new CfcmError(
          "NAMESPACE_MISMATCH",
          `${dir}: capability "${descriptor.name}" is served from the "${this.requiredPrefix}" ` +
            `source but is not in the ${this.requiredPrefix}.* namespace`,
        );
      }

      records.push(
        toIndexRecord(descriptor, dir, entrypointPath(dir, descriptor), this.namespaceType, now),
      );
      this.dirByName.set(descriptor.name, dir);
    }

    this.status = "ok";
    this.statusDetail = undefined;
    return records;
  }

  describe(record: IndexRecord): Promise<CapabilityDescriptor> {
    const dir = this.dirByName.get(record.name);
    if (!dir) throw new CfcmError("NOT_FOUND", `${record.name} is not served by source ${this.id}`);
    return readDescriptor(dir);
  }

  readArtifact(record: IndexRecord): Promise<Uint8Array> {
    return Deno.readFile(record.artifactLocation);
  }
}
