#!/usr/bin/env -S deno run --allow-read --allow-write --allow-net --allow-run --allow-env
/**
 * CFCM as a local MCP server (AD-1, PRD-FEAT-008).
 *
 * This is the agent's only contact surface. Everything the agent should not
 * have to reason about — cache layout, registry sync, artifact verification,
 * execution routing (MVP section 18) — stops here.
 *
 * Note on permissions: this process holds real permissions because it must
 * read a cache, write telemetry, reach the registry and spawn children. Every
 * child it spawns holds none. That asymmetry is the design (SEC-9).
 */

import { Cfcm } from "../core.ts";
import { CfcmError } from "../types.ts";
import type { ReturnMode, SearchResult } from "../types.ts";
import { CFCM_VERSION } from "../telemetry/telemetry.ts";
import { ERROR_CODES, readMessages, writeMessage } from "./protocol.ts";
import type { JsonRpcRequest } from "./protocol.ts";

const SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const TOOLS = [
  {
    name: "cfcm_search",
    description:
      "Ask whether CapFoundry already has a capability for a deterministic, reusable sub-task " +
      "before writing code for it yourself. Worth calling for general-purpose work (parsing, " +
      "validation, format conversion, geometry, date arithmetic). Not worth calling for " +
      "business logic, project-specific glue, or anything trivial. " +
      "Returns MATCH, PARTIAL_MATCH or NO_MATCH. On NO_MATCH, just write the code — that is a " +
      "normal answer, not an error. If you pass `input` and the search is a confident MATCH, " +
      "the capability is executed in the same call and the result is returned, so the common " +
      "case costs one round trip.",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: {
          type: "string",
          description: "What you need done, in plain language. Describe the task, not a name.",
        },
        input: {
          description:
            "Optional. Input for the capability. When supplied and the match is confident, " +
            "the capability runs immediately and its result is included.",
        },
        limit: { type: "integer", minimum: 1, maximum: 10, default: 3 },
      },
    },
  },
  {
    name: "cfcm_invoke",
    description: 'Run a capability you already know the name of. Use `return: "artifact"` or ' +
      '"result-and-artifact" when you need the implementation source to put into the user\'s ' +
      'project rather than just its output; use "metadata" to inspect the contract without ' +
      "running anything.",
    inputSchema: {
      type: "object",
      required: ["capability"],
      properties: {
        capability: { type: "string", description: "e.g. CapFoundry.geo.distance" },
        version: { type: "string" },
        input: { description: "Input matching the capability's inputSchema." },
        return: {
          enum: ["result", "artifact", "result-and-artifact", "metadata"],
          default: "result",
        },
      },
    },
  },
  {
    name: "cfcm_describe",
    description:
      "Full contract for a known capability — input and output schemas, effect, exposure — " +
      "without executing it. Use when you need to shape input before invoking.",
    inputSchema: {
      type: "object",
      required: ["capability"],
      properties: { capability: { type: "string" } },
    },
  },

  {
    name: "cfcm_submit_candidate",
    description:
      "Propose that something you just wrote should become a reusable CapFoundry capability. " +
      "Worth doing when the code is deterministic, general-purpose, and would help someone on a " +
      "different project — the same test you applied before searching. NOT worth doing for " +
      "business logic, project-specific glue, one-off scripts, or thin wrappers around a standard " +
      "library call. Submitting everything you write is how a registry becomes useless, so submit " +
      "selectively. Nothing is published: the candidate lands in a local queue for a person to " +
      "review. Supply aliases and exampleQueries — phrases someone would actually search for, " +
      "never restatements of the name — because without them the capability can only be found by " +
      "someone who already knows it exists.",
    inputSchema: {
      type: "object",
      required: ["suggestedName", "description", "artifactSource", "reason"],
      properties: {
        suggestedName: {
          type: "string",
          description:
            "Namespaced, e.g. CapFoundry.text.editDistance. Local.* cannot be submitted.",
        },
        description: { type: "string", description: "One sentence on what it does." },
        artifactSource: {
          type: "string",
          description: "The implementation, as TypeScript with a default-exported function.",
        },
        reason: { type: "string", description: "Why this is worth keeping rather than rewriting." },
        inputSchema: { type: "object", description: "JSON Schema for the input." },
        outputSchema: { type: "object", description: "JSON Schema for the output." },
        aliases: {
          type: "array",
          items: { type: "string" },
          description: "At least 3 phrases someone might search for. Do not restate the name.",
        },
        exampleQueries: {
          type: "array",
          items: { type: "string" },
          description: "At least 3 natural-language questions this capability answers.",
        },
        inputSummary: { type: "string" },
        outputSummary: { type: "string" },
        source: { enum: ["generated", "existing-code", "third-party"] },
      },
    },
  },
];

function summarise(result: SearchResult, limit: number) {
  return {
    status: result.status,
    confidence: result.confidence,
    searchMs: result.searchMs,
    candidates: result.candidates.slice(0, limit).map((c) => ({
      name: c.record.name,
      version: c.record.version,
      description: c.record.description,
      inputSummary: c.record.inputSummary,
      outputSummary: c.record.outputSummary,
      namespaceType: c.record.namespaceType,
      effect: c.record.effect,
      exposure: c.record.exposure,
      score: Number(c.score.toFixed(4)),
      // Evidence lets the caller reject a borderline match on its merits
      // instead of trusting the number (PRD-FEAT-004.5).
      matchedOn: c.evidence,
    })),
  };
}

const cfcm = await Cfcm.create();

// Surfaced on the first response rather than logged, so an agent finds out
// about a stale or unreachable registry at the point it matters.
const degraded = cfcm.sourceReports.filter((r) => r.status !== "ok" && r.status !== "shadowed");

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "cfcm_search": {
      const query = String(args.query ?? "");
      const limit = typeof args.limit === "number" ? args.limit : 3;
      const result = await cfcm.search(query, { limit: Math.max(limit, 3) });
      const payload: Record<string, unknown> = summarise(result, limit);

      if (result.status === "NO_MATCH") {
        payload.guidance = "No suitable capability exists. Write the code yourself.";
        return payload;
      }
      if (result.status === "PARTIAL_MATCH") {
        payload.guidance =
          "Nothing matched confidently. Treat these as suggestions only: check the contract " +
          "with cfcm_describe before using one, otherwise write the code yourself.";
        return payload;
      }

      // Confident match with input supplied: execute now (PRD-FEAT-008.4).
      if ("input" in args) {
        const top = result.candidates[0].record;
        try {
          payload.invocation = await cfcm.invoke({ capability: top.name, input: args.input });
        } catch (err) {
          payload.invocationError = err instanceof CfcmError
            ? { code: err.code, message: err.message }
            : { code: "UNKNOWN", message: (err as Error).message };
          payload.guidance =
            "The capability matched but did not accept this input. Check the contract with " +
            "cfcm_describe, or write the code yourself.";
        }
      } else {
        payload.guidance = "Confident match. Call cfcm_invoke with input matching its contract.";
      }
      return payload;
    }

    case "cfcm_invoke":
      return await cfcm.invoke({
        capability: String(args.capability),
        version: args.version ? String(args.version) : undefined,
        input: args.input,
        options: { return: (args.return as ReturnMode) ?? "result" },
      });

    case "cfcm_describe":
      return await cfcm.describe(String(args.capability));

    case "cfcm_submit_candidate": {
      const result = await cfcm.submitCandidate({
        suggestedName: String(args.suggestedName),
        description: String(args.description),
        artifactSource: String(args.artifactSource),
        reason: String(args.reason),
        inputSchema: (args.inputSchema ?? {}) as Record<string, unknown>,
        outputSchema: (args.outputSchema ?? {}) as Record<string, unknown>,
        aliases: (args.aliases as string[]) ?? [],
        exampleQueries: (args.exampleQueries as string[]) ?? [],
        inputSummary: args.inputSummary ? String(args.inputSummary) : undefined,
        outputSummary: args.outputSummary ? String(args.outputSummary) : undefined,
        source: args.source as "generated" | "existing-code" | "third-party" | undefined,
      });

      return {
        id: result.candidate.id,
        status: "queued locally",
        suggestedName: result.candidate.suggestedName,
        ...(result.warning ? { warning: result.warning } : {}),
        nextStep:
          "Nothing has been published. Tell the user the candidate is queued locally, and that " +
          "they can review it with `deno task candidate list` and promote it with " +
          `\`deno task candidate promote ${result.candidate.id}\`.`,
      };
    }

    default:
      throw new CfcmError("UNKNOWN_TOOL", `no such tool: ${name}`);
  }
}

async function handle(req: JsonRpcRequest): Promise<void> {
  const id = req.id ?? null;
  const reply = (result: unknown) => writeMessage({ jsonrpc: "2.0", id, result });

  switch (req.method) {
    case "initialize": {
      const requested = String(req.params?.protocolVersion ?? "");
      await reply({
        protocolVersion: SUPPORTED_PROTOCOLS.includes(requested)
          ? requested
          : SUPPORTED_PROTOCOLS[SUPPORTED_PROTOCOLS.length - 1],
        capabilities: { tools: {} },
        serverInfo: { name: "cfcm", version: CFCM_VERSION },
        instructions: [
          `CFCM has ${cfcm.size} capabilit${cfcm.size === 1 ? "y" : "ies"} indexed.`,
          degraded.length > 0
            ? `Degraded sources: ${degraded.map((d) => `${d.id} (${d.status})`).join(", ")}.`
            : "",
          "Search before generating deterministic, reusable code. NO_MATCH is a normal answer.",
        ].filter(Boolean).join(" "),
      });
      return;
    }

    case "notifications/initialized":
    case "notifications/cancelled":
      return; // Notifications take no response.

    case "ping":
      await reply({});
      return;

    case "tools/list":
      await reply({ tools: TOOLS });
      return;

    case "tools/call": {
      const name = String(req.params?.name ?? "");
      const args = (req.params?.arguments ?? {}) as Record<string, unknown>;
      try {
        const value = await callTool(name, args);
        await reply({ content: [{ type: "text", text: JSON.stringify(value, null, 2) }] });
      } catch (err) {
        // Tool failures come back as results with isError, not as protocol
        // errors: the agent needs to read them and choose a fallback
        // (PRD-FEAT-008.3).
        const body = err instanceof CfcmError
          ? { error: err.code, message: err.message, ...(err.detail ? { detail: err.detail } : {}) }
          : { error: "INTERNAL", message: (err as Error).message };
        await reply({
          content: [{
            type: "text",
            text: JSON.stringify(
              { ...body, guidance: "Fall back to writing the code yourself." },
              null,
              2,
            ),
          }],
          isError: true,
        });
      }
      return;
    }

    default:
      await writeMessage({
        jsonrpc: "2.0",
        id,
        error: { code: ERROR_CODES.methodNotFound, message: `unsupported method: ${req.method}` },
      });
  }
}

for await (const message of readMessages(Deno.stdin.readable)) {
  if ("__parseError" in message) {
    await writeMessage({
      jsonrpc: "2.0",
      id: null,
      error: { code: ERROR_CODES.parseError, message: message.__parseError },
    });
    continue;
  }
  // Notifications have no id and must never receive a response.
  if (message.id === undefined && !message.method.startsWith("notifications/")) {
    await handle({ ...message, id: null });
  } else {
    await handle(message);
  }
}
