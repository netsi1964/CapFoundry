# CapFoundry

> **Don't generate what you already know.**

CapFoundry is an experimental, demand-driven software capability platform for humans and AI agents.

Before an AI agent solves a software task, it can ask its local **CapFoundry Capabilities Manager (CFCM)**:

> **Can CapFoundry already do this?**

If a suitable capability exists, CFCM resolves its artifact and normally executes it locally. If no suitable capability exists, the agent solves the problem normally and can then consider whether the new solution should become a CapFoundry capability.

The architectural shorthand is:

> **Centralize knowledge. Decentralize execution.**

## Current status

CapFoundry is currently in the **architecture and MVP-design stage**. The repository is intentionally small while the central assumptions are being tested.

The first implementation is planned around:

- a compact local **CFCM**
- namespaced capabilities such as `CapFoundry.geo.distance`
- private organization namespaces such as `Netsi.*`
- the reserved machine-local namespace `Local.*`
- local-first capability execution
- capability artifact caching and optional artifact return
- candidate submission when an agent creates something worth retaining
- a small, measurable initial capability set

## Documentation

The current documents are:

- **[Vision & Architecture v0.5](docs/vision/CapFoundry-Vision-Architecture-v0.5.md)** — the broader product model, architectural principles, CFCM, namespaces, governance, security, discovery, telemetry and future direction.
- **[MVP v0.2](docs/mvp/CapFoundry-MVP-v0.2.md)** — the deliberately smaller first implementation and the experiments needed to prove or falsify the core idea.

The Vision document describes where CapFoundry may go. The MVP document describes what should actually be built first.

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
