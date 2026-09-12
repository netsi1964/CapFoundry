/**
 * Candidate submission (PRD-FEAT-013, MVP section 16).
 *
 * The half of the core loop that runs when search finds nothing: an agent
 * writes something general-purpose, then asks whether it should be retained.
 *
 * Three properties are deliberate and load-bearing:
 *
 *  - Nothing is published. A submission lands in a local queue and goes no
 *    further without a person running `promote` and opening a pull request.
 *    MVP section 16 states this outright, and the value of a registry is
 *    exactly the review standing between a good idea and an entry in it.
 *  - Nothing leaves the machine. Submission writes to disk; the optional
 *    intake endpoint (PRD-FEAT-013.5) is not part of this build.
 *  - A near-duplicate is reported, not rejected. If CFCM already holds
 *    something close the agent is told which, but whether it is genuinely the
 *    same capability is a judgement that belongs to a person.
 */

import { join } from "@std/path";
import { CfcmError } from "../types.ts";
import type { JsonSchema } from "../types.ts";
import { ensureDir, pathExists, paths } from "../util/paths.ts";

export type CandidateStatus = "local" | "promoted" | "discarded";
export type CandidateSource = "generated" | "existing-code" | "third-party";

export interface CandidateArtifact {
  type: "typescript";
  /** The implementation itself, as source text. */
  source: string;
}

export interface NearestExisting {
  name: string;
  confidence: number;
  status: string;
}

export interface Candidate {
  id: string;
  createdAt: string;
  status: CandidateStatus;
  suggestedName: string;
  description: string;
  source: CandidateSource;
  artifact: CandidateArtifact;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  reason: string;
  /** Proposed at submission; required before the CFP can pass validation. */
  aliases: string[];
  exampleQueries: string[];
  inputSummary: string;
  outputSummary: string;
  /** Set when the index already holds something close. */
  nearestExisting: NearestExisting | null;
}

export interface CandidateInput {
  suggestedName: string;
  description: string;
  source?: CandidateSource;
  artifactSource: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  reason: string;
  aliases?: string[];
  exampleQueries?: string[];
  inputSummary?: string;
  outputSummary?: string;
}

/** The same shape the capability descriptor schema enforces. */
const NAME_PATTERN = /^[A-Z][A-Za-z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*)+$/;

export function assertSubmittable(name: string): void {
  if (typeof name !== "string" || !NAME_PATTERN.test(name)) {
    throw new CfcmError(
      "CANDIDATE_INVALID",
      `suggestedName "${name}" must be namespaced, for example CapFoundry.text.editDistance`,
      { suggestedName: name },
    );
  }

  // Local.* means this machine only. Submitting one would ask the registry to
  // publish something whose whole definition is that it is not published.
  if (name.startsWith("Local.")) {
    throw new CfcmError(
      "CANDIDATE_LOCAL_NAMESPACE",
      `${name} is in the reserved Local.* namespace, which means this machine only and cannot ` +
        "be submitted as a candidate. Propose it under a shareable namespace instead.",
      { suggestedName: name },
    );
  }
}

export interface SubmitResult {
  candidate: Candidate;
  path: string;
  /** Present when something close already exists. */
  warning: string | null;
}

export class CandidateQueue {
  constructor(private readonly dir: string = paths.candidates()) {}

  private file(id: string): string {
    return join(this.dir, `${id}.json`);
  }

  async submit(input: CandidateInput, nearest: NearestExisting | null): Promise<SubmitResult> {
    assertSubmittable(input.suggestedName);

    for (const field of ["description", "reason", "artifactSource"] as const) {
      const value = input[field];
      if (typeof value !== "string" || value.trim() === "") {
        throw new CfcmError("CANDIDATE_INVALID", `${field} is required and must be non-empty`);
      }
    }

    const candidate: Candidate = {
      id: `${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID().slice(0, 8)}`,
      createdAt: new Date().toISOString(),
      status: "local",
      suggestedName: input.suggestedName,
      description: input.description.trim(),
      source: input.source ?? "generated",
      artifact: { type: "typescript", source: input.artifactSource },
      inputSchema: input.inputSchema ?? {},
      outputSchema: input.outputSchema ?? {},
      reason: input.reason.trim(),
      aliases: input.aliases ?? [],
      exampleQueries: input.exampleQueries ?? [],
      inputSummary: input.inputSummary ?? "",
      outputSummary: input.outputSummary ?? "",
      nearestExisting: nearest,
    };

    await ensureDir(this.dir);
    await Deno.writeTextFile(this.file(candidate.id), `${JSON.stringify(candidate, null, 2)}\n`);

    const warning = nearest
      ? `CFCM already has ${nearest.name} at confidence ${nearest.confidence}. Check whether ` +
        "this is genuinely a different capability before promoting it."
      : null;

    return { candidate, path: this.file(candidate.id), warning };
  }

  async list(): Promise<Candidate[]> {
    if (!await pathExists(this.dir)) return [];
    const out: Candidate[] = [];
    for await (const entry of Deno.readDir(this.dir)) {
      if (!entry.isFile || !entry.name.endsWith(".json")) continue;
      out.push(JSON.parse(await Deno.readTextFile(join(this.dir, entry.name))));
    }
    return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async get(id: string): Promise<Candidate> {
    try {
      return JSON.parse(await Deno.readTextFile(this.file(id)));
    } catch {
      throw new CfcmError("NOT_FOUND", `no candidate with id "${id}"`, { id });
    }
  }

  async setStatus(id: string, status: CandidateStatus): Promise<void> {
    const candidate = await this.get(id);
    candidate.status = status;
    await Deno.writeTextFile(this.file(id), `${JSON.stringify(candidate, null, 2)}\n`);
  }

  async remove(id: string): Promise<void> {
    await Deno.remove(this.file(id));
  }
}
