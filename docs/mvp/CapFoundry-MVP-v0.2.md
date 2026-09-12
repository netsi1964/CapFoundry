# CapFoundry MVP

**MVP - Version 0.2**

**The smallest implementation that can test the CapFoundry idea without turning CapFoundry into a central compute service**

## The MVP on a Napkin

Before an AI agent solves a software task, it can ask its local **CFCM - CapFoundry Capabilities Manager**:

> **Can CapFoundry already do this?**

If yes, CFCM resolves the capability artifact and normally executes it locally.

If no, the agent solves the problem normally and then asks:

> **Should what I just created become a CapFoundry capability?**

If yes, it can prepare and submit a candidate.

```text
NEED
 |
 v
CFCM search
 |
 +-- MATCH ------> resolve artifact --> local execution --> RESULT
 |
 +-- NO MATCH ---> CREATE
                      |
                capability-worthy?
                   /       \
                 YES       NO
                  |         |
               SUBMIT      DONE
                  |
                REVIEW
                  |
               PUBLISH
```

The MVP exists to measure whether this loop creates more value than it costs.

## 1. What Changed from MVP v0.1

MVP v0.2 incorporates the architectural decisions made after the first split between Vision and MVP:

- CFCM is now a first-class local component.
- Execution is local by default.
- CapFoundry is not a central "execute this function" service.
- Optional remote executors are allowed, but are not required for the first implementation.
- Capabilities use namespaces.
- `Local.*` is reserved for capabilities that exist only on the current machine.
- Private organization namespaces can be configured through `cfcm.json`.
- CFCM can cache compact capability indexes and executable artifacts.
- A caller can request a result, an artifact, both, or metadata when policy permits.
- Candidate creation remains part of the core loop.
- The first capability set is deliberately small and varied.
- Capability-creation Skills and a future GitHub-to-CFP workflow are explicitly part of the roadmap.

## 2. What the MVP Must Prove

The MVP should answer:

1. Can an agent discover useful capabilities without knowing their exact names?
2. Can CFCM resolve and execute those capabilities locally with low overhead?
3. Does capability use improve correctness, repeatability, token use, latency, cost or maintainability?
4. Can search avoid obvious false positives?
5. When no match exists, can an agent identify useful candidate capabilities without flooding the system?
6. Can public, private and `Local.*` capabilities appear as one coherent capability space?
7. Is returning an artifact useful in addition to returning an execution result?
8. Do candidates later become reused often enough to create compounding value?

If the answers are weak, CapFoundry should not be expanded merely because the architecture is interesting.

## 3. MVP Architecture

The first implementation has two required runtime parts:

```text
┌───────────────────────────────────────┐
│          CAPFOUNDRY SERVICE           │
│                                       │
│ registry metadata                     │
│ public capability index               │
│ artifacts                             │
│ candidates                            │
│ simple telemetry / Explore            │
└──────────────────┬────────────────────┘
                   │ sync/fetch
                   v
┌───────────────────────────────────────┐
│                 CFCM                  │
│                                       │
│ local index                           │
│ namespace sources                     │
│ search                                │
│ artifact resolver/cache               │
│ local execution                       │
│ result/artifact return                │
│ candidate submission                  │
└──────────────────┬────────────────────┘
                   v
             Coding agent
```

The central service distributes knowledge and artifacts. CFCM performs normal execution locally.

## 4. What We Build

The MVP contains these essential building blocks:

1. central capability registry and artifact store
2. compact CFCM
3. capability search
4. artifact resolution and local cache
5. local capability execution
6. candidate submission
7. one Capability Awareness Skill/integration
8. basic telemetry
9. minimal Explore / Trending page

The implementation should remain small enough that these are components, not separate enterprise services.

## 5. What We Deliberately Do Not Build

The MVP does **not** require:

- a central execution service
- automatic GitHub/npm/PyPI ingestion
- autonomous repository conversion
- workflow discovery
- multi-agent orchestration
- enterprise SSO/SCIM/RBAC
- arbitrary privileged execution
- sophisticated trust scoring
- full A0-A5 automation
- multi-runtime orchestration
- automatic requirement generation
- semantic workflow migration
- autonomous publishing

An optional remote executor may be prototyped later, but it is not needed to validate the first loop.

## 6. Namespaces

Capability identity uses namespaces.

Examples:

```text
CapFoundry.text.slugify
CapFoundry.date.businessDaysBetween
CapFoundry.geo.distance
CapFoundry.validation.iban
CapFoundry.csv.detectDelimiter

CapFoundry.json.schema.infer
CapFoundry.ui.dataTable

Netsi.faktura.getInvoice
Local.dev.experimentalParser
```

`Local.*` is reserved and means **this machine only**.

Private capabilities keep their organization namespace, for example `Netsi.*`; they are not renamed to `Local.*`.

Scope and identity remain separate metadata.

## 7. `cfcm.json`

CFCM uses a small local configuration file named `cfcm.json`.

Example:

```json
{
  "capfoundry": {
    "registry": "https://registry.capfoundry.example"
  },
  "namespaces": [
    {
      "name": "Netsi",
      "type": "private",
      "source": {
        "type": "filesystem",
        "path": "./capabilities/netsi"
      },
      "permissions": {
        "network": ["internal.netsi.example"],
        "secrets": ["NETSI_API_TOKEN"],
        "filesystem": []
      }
    }
  ]
}
```

The file tells CFCM where capability sources live and which local policies apply. Capability definitions remain separate artifacts/packages.

`Local.*` is built into CFCM and does not need to be added as an external namespace.

## 8. CFCM Index and Artifact Cache

The MVP should distinguish a compact **capability index** from the executable **artifact**.

The index contains enough information to search and resolve:

- names
- descriptions
- versions
- input/output summaries
- runtime
- effect
- artifact hash/location
- exposure policy

Artifacts are fetched only when needed and cached locally.

```text
CFCM search
   |
  MATCH
   |
artifact cached?
 /          \
yes          no
 |            |
 |        fetch + verify
 |            |
 └──────┬─────┘
        v
  local execution
```

A simple timestamp/version check is enough for the first implementation. Sophisticated delta distribution is not required yet.

## 9. Generic Return Modes

The invocation contract supports:

```text
result
artifact
result-and-artifact
metadata
```

Default:

```text
result
```

Example:

```json
{
  "capability": "CapFoundry.json.schema.infer",
  "input": {
    "data": {
      "status": "open"
    }
  },
  "options": {
    "return": "result-and-artifact"
  }
}
```

Artifact return is allowed only when the capability exposure policy permits it.

```json
{
  "exposure": {
    "execution": true,
    "artifact": true
  }
}
```

Private capabilities may set `"artifact": false` while remaining executable.

## 10. First Capability Set

The first implementation should not start with 10-20 arbitrary functions. Start with **seven deliberately chosen capabilities**: five small capabilities spread across domains, one more substantial JSON capability, and one UI/artifact capability.

### Five small, generic capabilities

1. `CapFoundry.text.slugify`
   - domain: text transformation
   - input: text + optional locale/options
   - output: stable URL/file-safe slug
   - reason: trivial to understand, deterministic, easy baseline

2. `CapFoundry.date.businessDaysBetween`
   - domain: date/calendar calculation
   - input: two dates + optional weekend definition
   - output: number of business days
   - reason: demonstrates non-string deterministic logic

3. `CapFoundry.geo.distance`
   - domain: geometry/geography
   - input: two latitude/longitude points
   - output: distance in requested unit
   - reason: stable mathematical capability

4. `CapFoundry.validation.iban`
   - domain: validation/finance
   - input: IBAN
   - output: valid/invalid + normalized value/reason where appropriate
   - reason: clear contract and test cases

5. `CapFoundry.csv.detectDelimiter`
   - domain: parsing/data
   - input: CSV-like text
   - output: likely delimiter + confidence/evidence
   - reason: slightly richer deterministic inference without becoming large

### Larger capability: JSON -> JSON Schema

6. `CapFoundry.json.schema.infer`

Input:

```json
{
  "data": {
    "name": "Alice",
    "status": "active",
    "age": 42
  }
}
```

Output: a JSON Schema inferred according to explicit, testable rules.

The capability should support nested objects, arrays, primitive types, required-field rules and carefully defined enum inference. It is intentionally larger because it was part of the original CapFoundry exploration and gives us something substantial enough to benchmark against direct LLM generation.

### UI/artifact capability: HTML Custom Element

7. `CapFoundry.ui.dataTable`

This capability demonstrates that CapFoundry is not only about JSON-in/JSON-out utility functions.

The input describes a small table contract, for example columns and behavior. The capability returns an **artifact** containing a standards-based HTML Custom Element implementation.

Conceptually:

```json
{
  "columns": [
    {"key": "name", "label": "Name"},
    {"key": "amount", "label": "Amount"}
  ],
  "sortable": true
}
```

Artifact:

```text
<netsi-table> / JavaScript Custom Element implementation
```

For the MVP it should remain deliberately modest: framework-independent, no build system requirement, accessible markup, sortable columns and structured data input. The point is to test artifact delivery, not to build a complete data-grid product.

## 11. Minimal Capability Descriptor

The descriptor should remain small but must support the concepts now needed by the MVP.

```json
{
  "name": "CapFoundry.geo.distance",
  "version": "1.0.0",
  "description": "Calculate distance between two geographic coordinates",
  "runtime": "deno",
  "effect": "PURE",
  "inputSchema": {},
  "outputSchema": {},
  "artifact": {
    "type": "typescript",
    "entrypoint": "./artifact/index.ts",
    "sha256": "..."
  },
  "exposure": {
    "execution": true,
    "artifact": true
  },
  "tests": "./tests/"
}
```

Do not add metadata unless the experiment needs it.

## 12. Search and Resolve

A minimal search request:

```json
{
  "query": "calculate distance between two latitude longitude coordinates",
  "runtime": "deno"
}
```

Result:

```json
{
  "status": "MATCH",
  "capability": {
    "name": "CapFoundry.geo.distance",
    "version": "1.0.0"
  },
  "confidence": 0.97
}
```

CFCM then resolves the artifact from local cache or an authorized source.

Search should support at least:

```text
MATCH
NO_MATCH
```

`PARTIAL_MATCH` and `OUT_OF_DOMAIN` may be added if they remain simple. The MVP must not build a complex classifier merely to satisfy the vision document.

## 13. Local Execution

The first seven public capabilities should execute locally.

For PURE capabilities:

- no network
- no secrets
- no external writes
- structured input
- structured output or artifact
- hard timeout
- basic resource limits where practical

CFCM should not send the user's input to the central CapFoundry service merely to execute a utility capability.

This is both a performance and privacy requirement.

## 14. Private Capability Proof

The MVP should include at least **one small private capability** to prove the namespace/source model, even if it is only a development fixture.

Example:

```text
Netsi.demo.getCustomer
```

or another harmless internal-style mock capability.

The purpose is not to connect to a real production system. It is to prove that:

- `cfcm.json` can register a private namespace
- CFCM can search it alongside public capabilities
- private policy can differ from public policy
- artifact exposure can be disabled
- execution can remain local

## 15. `Local.*` Proof

Include one machine-only development capability:

```text
Local.dev.echo
```

It is discovered by the local CFCM but is absent from the central registry and private namespace sources.

This verifies the reserved namespace semantics.

## 16. Candidate Submission

Candidate submission remains essential.

After creating a solution, the agent should ask whether it should become a capability.

A minimal candidate should include:

```json
{
  "suggestedName": "CapFoundry.text.normalizeWhitespace",
  "description": "Normalize whitespace according to a stable rule set",
  "source": "generated",
  "artifact": {},
  "inputSchema": {},
  "outputSchema": {},
  "reason": "General-purpose transformation created during a coding task"
}
```

The MVP does not auto-publish candidates.

## 17. CFP - CapFoundry Package

The MVP may use a simple directory or archive format for a complete capability package. The conceptual name is **CFP - CapFoundry Package**.

Example:

```text
CapFoundry.geo.distance.cfp/
├── capability.json
├── artifact/
│   └── index.ts
├── tests/
├── provenance.json
├── license/
└── README.md
```

The physical packaging format is not yet frozen. The important point is that the package is complete enough to install, inspect, test and distribute.

## 18. Capability Awareness Skill

One coding agent should receive a thin Skill/policy that teaches it:

1. when a capability search may be useful
2. how to ask CFCM
3. how to use a confident match
4. how to request an artifact when needed
5. how to fall back cleanly
6. how to consider candidate submission after creating something new

The agent should not need to reason about cache layout, registry synchronization or execution routing.

## 19. Capability Packager Skill - First Design, Not Full Automation

The MVP does not need a complete GitHub ingestion system, but we should design and begin testing a Skill that can turn existing code into a CFP.

The Skill should eventually support:

- existing local code
- existing CapFoundry capabilities
- permissively licensed code such as MIT-licensed projects
- a GitHub repository

For a GitHub repository, the intended interaction is conversational:

```text
User points to repository
        |
Skill inspects repository
        |
proposes capability candidates
        |
discusses boundaries with user
        |
user selects candidate(s)
        |
Skill proposes namespace + contract
        |
tests/provenance/license reviewed
        |
complete namespaced CFP produced
```

The important design principle is **proposal through dialogue**, not blind automatic conversion.

For MVP v0.2, success can simply mean manually testing this workflow on one small MIT-licensed repository and documenting what the Skill would need to automate.

## 20. Minimal Explore / Trending

The MVP information page remains deterministic.

Show:

- Most Used
- Most Searched
- Missing / repeated `NO_MATCH`
- New Candidates
- Fastest Growing
- Recently Added

Data sources:

```text
searches
local executions reported by CFCM
NO_MATCH
candidate submissions
unique projects/installations where privacy permits
change over time
```

No LLM trend analysis is required.

## 21. Telemetry

Record enough to evaluate the idea while avoiding unnecessary payload collection.

Useful fields:

- timestamp
- CFCM version
- capability name/version
- namespace type: public/private/local
- search attempted
- search latency
- match/no-match
- artifact cache hit/miss
- artifact fetch latency
- local execution latency
- return mode
- fallback to generation
- candidate submitted
- candidate later approved/rejected

Do **not** upload capability input/output data by default.

## 22. Test Design

Run controlled tasks in two conditions:

### A. CapFoundry enabled

The agent has CFCM and the Capability Awareness Skill.

### B. Control

The same or equivalent model solves the same tasks without CapFoundry.

Include tasks where:

- one of the five small capabilities is an exact match
- JSON Schema inference is required
- a Custom Element artifact is required
- a near match should be rejected
- no capability exists
- search should be skipped
- generated code should become a candidate
- generated code should not become a candidate
- a private capability is available
- a `Local.*` capability is available

## 23. Metrics

Measure:

- task success
- correctness
- test pass rate
- capability reuse rate
- search hit rate
- wrong-match rate
- search latency
- CFCM overhead
- artifact cache hit rate
- artifact fetch latency
- local execution latency
- token use
- total cost
- total task latency
- generated code avoided
- artifact requests
- candidate submission rate
- candidate acceptance rate
- later candidate reuse

The important number is net value after search, resolution and execution overhead.

## 24. Suggested Repository Shape

```text
capfoundry/
├── README.md
├── deno.json
├── src/
│   ├── registry/
│   ├── candidates/
│   ├── telemetry/
│   └── web/
├── cfcm/
│   ├── search/
│   ├── resolver/
│   ├── cache/
│   ├── runtime/
│   └── config/
├── capabilities/
│   ├── text.slugify/
│   ├── date.businessDaysBetween/
│   ├── geo.distance/
│   ├── validation.iban/
│   ├── csv.detectDelimiter/
│   ├── json.schema.infer/
│   └── ui.dataTable/
├── skills/
│   ├── capability-awareness/
│   └── capability-packager/
├── tests/
└── web/
    └── explore/
```

## 25. First Meaningful Milestone

The first milestone is:

> **One coding agent can ask CFCM for a capability, search a compact local index, resolve and cache an artifact, execute it locally, optionally return the artifact, fall back cleanly on no match, and submit a candidate after generation.**

At that milestone the system should include:

- seven public test capabilities
- one private namespace fixture
- one `Local.*` fixture
- `cfcm.json`
- one Capability Awareness Skill
- basic candidate review
- deterministic Explore metrics
- telemetry sufficient for an A/B comparison

## 26. What Comes After Evidence

Only after the MVP produces evidence should we consider:

- better hybrid semantic search
- learned adaptive retrieval
- signed delta CFCM packages
- richer assurance levels
- stronger sandboxing
- optional remote Capability Executor
- multiple runtimes
- more UI capabilities
- connectors with external effects
- workflow discovery
- automatic requirements
- organization registries
- production Capability Packager Skills
- GitHub-to-CFP automation

## 27. Failure Rule

The MVP must be allowed to falsify CapFoundry.

Reconsider the concept if:

- agents rarely find useful matches
- local search still creates more overhead than value
- wrong matches degrade task quality
- artifact distribution is cumbersome
- candidate submission creates mostly noise
- approved candidates are rarely reused
- direct generation remains consistently cheaper and equally reliable

## 28. Final MVP Rule

> **If the MVP needs the full Vision & Architecture document in order to run, it is too complicated.**

The first implementation should remain understandable on a whiteboard and small enough to redesign when the measurements disagree with our assumptions.

## Version History

### v0.2

- introduced CFCM as the local capability manager
- changed execution to local-first
- introduced namespaces, private sources and reserved `Local.*`
- added `cfcm.json`
- separated compact indexes from cached artifacts
- added generic artifact return
- reduced the initial public set to seven deliberate capabilities
- added JSON -> JSON Schema and HTML Custom Element artifact tests
- added private and machine-local fixtures
- introduced CFP as a capability package concept
- added initial Capability Packager Skill / GitHub-to-CFP design

### v0.1

- split MVP from the broad Vision & Architecture document
- defined the first search/reuse/candidate experiment
- introduced deterministic Explore / Trending
