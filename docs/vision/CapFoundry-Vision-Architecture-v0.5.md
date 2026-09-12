# CapFoundry

**Vision & Architecture - Version 0.5**

**A demand-driven software capability platform for humans and AI agents**

**Tagline:** Don't generate what you already know.

## The Napkin Version

Before an AI agent solves a software task, it can ask:

> **Can CapFoundry already do this?**

The question is normally answered by a compact local component: the **CapFoundry Capabilities Manager (CFCM)**.

If a suitable capability exists, CFCM resolves it and, by default, executes its artifact **locally where the task is already running**.

If no suitable capability exists, the agent solves the problem normally. It must then ask:

> **Should what I just created become a CapFoundry capability?**

If yes, it can submit a candidate package for review and future reuse.

```text
                    SOFTWARE NEED
                         |
                         v
             "Can CapFoundry do this?"
                         |
                        CFCM
                   /             \
                MATCH           NO MATCH
                  |                 |
          resolve artifact        CREATE
                  |                 |
          execute locally     capability-worthy?
                  |              /        \
                RESULT          YES        NO
                                 |          |
                              CANDIDATE    DONE
                                 |
                            CAPFOUNDRY
```

CapFoundry turns repeated software creation into shared software learning while keeping normal execution close to the software that needs it.

The architectural shorthand is:

> **Centralize knowledge. Decentralize execution.**

This simple loop is the product idea. The rest of this document describes the architecture required if that loop proves useful at scale.

## 1. Why CapFoundry Exists

Coding agents make software generation increasingly cheap. That is useful, but it also creates a new inefficiency: stable software behavior can be generated repeatedly even when an equivalent, tested capability already exists.

The original inspiration is close to function calling: instead of asking an LLM to recreate a known operation, let it discover a capability with a clear contract and invoke it. CapFoundry extends that idea with dynamic discovery, local execution, governance, distribution, private namespaces, candidate creation, telemetry and demand intelligence.

Examples include:

- validators
- parsers
- data transformations
- calculations
- code and artifact generators
- HTML Custom Elements and UI controls
- API adapters
- database queries
- domain logic
- document processing
- workflow steps

Traditional reuse assumes that a developer already knows where existing code lives. AI agents make regeneration so convenient that rediscovery and reuse can become less likely.

CapFoundry introduces a shared capability layer between software demand and software creation.

The goal is not to stop generation. The goal is to make generation the right fallback when no suitable capability exists, and then to capture useful new solutions as possible future capabilities.

## 2. Four Governing Principles

CapFoundry follows four practical principles:

> **Don't generate what you already know.**

> **Don't ask an LLM to judge what you can verify.**

> **Don't retrieve when generation is cheaper.**

> **Centralize knowledge. Decentralize execution.**

The third principle matters because search itself has cost. The fourth matters because a central execution service would add latency, infrastructure cost, privacy exposure and a scaling bottleneck to operations that can usually run locally.

## 3. The Core Loop

```text
Software need
     |
     v
Should CFCM search?
     |
adaptive retrieval decision
     |
MATCH / PARTIAL_MATCH / NO_MATCH / OUT_OF_DOMAIN
     |
 ┌───────────────┬─────────────────────────────┐
 |               |                             |
MATCH          PARTIAL                      NO/OOD
 |               |                             |
resolve       inspect/choose                 CREATE
artifact          |                             |
 |                |                      candidate-worthy?
local or          |                         /       \
policy-selected   |                       YES       NO
execution         |                        |         |
 |                |                    CANDIDATE    DONE
RESULT             |                        |
 |                 |                   QUARANTINE
 └─────────────────┴───────────────→    VERIFY
                                      |
                                    PUBLISH
                                      |
                                  DISTRIBUTE
                                      |
                                   TELEMETRY
```

A failed search is not the end of CapFoundry's role. If the agent creates something that appears useful beyond the immediate task, that result can become a candidate.

Execution and artifact retrieval are deliberately separate concepts. A capability may be invoked for a result, or - when policy permits - its artifact may be returned to the caller.

## 4. Capabilities, Not Files

CapFoundry stores **capabilities**, not merely files or code snippets.

A capability is a semantically defined piece of software behavior with an explicit contract and at least one implementation.

Examples:

- `CapFoundry.json.schema.infer`
- `CapFoundry.geo.distance`
- `CapFoundry.iban.validate`
- `CapFoundry.csv.toJson`
- `CapFoundry.ui.dataTable`
- `CapFoundry.openapi.toTypescript`
- `Netsi.customer.findByCVR`
- `Netsi.faktura.getInvoice`
- `Netsi.invoice.process`

A capability name is a stable semantic identity, not an implementation name.

A capability can be:

- a pure function
- a validator
- a parser
- an algorithm
- an adapter
- a component
- a generator
- a query
- a connector
- an integration
- a workflow
- a service

The common abstraction is not implementation technology. It is a discoverable contract that software can invoke.

## 5. Capability Identity and Namespaces

Capability names use hierarchical namespaces.

A normal form is:

```text
<namespace>.<domain>.<capability>
```

and deeper domain nesting is allowed when useful:

```text
<namespace>.<domain>.<subdomain>.<capability>
```

Examples:

```text
CapFoundry.json.schema.infer
CapFoundry.geo.distance
Netsi.faktura.getInvoice
Netsi.customer.findByCVR
DocPipe.pdf.extractTitleBlock
Local.pdf.experimentalParser
```

Names describe **what** a capability means, not how it is implemented. `Netsi.faktura.getInvoice` should remain stable if its implementation moves from SQL Server to an internal REST API.

Namespace identity and distribution scope are separate metadata. For example:

```yaml
name: Netsi.faktura.getInvoice
scope: organization
visibility: private
execution: local
```

### Reserved `Local` Namespace

`Local.*` is reserved by the CapFoundry specification.

It means that the capability exists only in the CFCM environment on the machine where it is registered. It is not published to the central CapFoundry registry and is not distributed by CapFoundry.

The central service does not need to know that a `Local.*` capability exists.

`Local` must therefore not be assignable to a public publisher or private organization.

## 6. CFCM - CapFoundry Capabilities Manager

The **CapFoundry Capabilities Manager (CFCM)** is the compact local component that makes CapFoundry practical.

CFCM maintains the capability space visible to the current machine and agent. It can combine:

```text
PUBLIC / GLOBAL
  CapFoundry.*

PRIVATE / ORGANIZATION
  Netsi.*
  CustomerA.*
  InternalPlatform.*

LOCAL MACHINE
  Local.*
```

Its responsibilities include:

- maintain a compact local capability index
- search across public, private and local namespaces
- resolve compatible implementations/artifacts
- cache capability artifacts
- verify versions, hashes and signatures
- apply local trust and permission policy
- execute locally by default
- route to a permitted remote executor when explicitly configured
- expose capability metadata and artifacts when policy allows
- submit candidates and feedback
- collect privacy-conscious telemetry

From the agent's perspective, this complexity should remain hidden. The agent asks whether a capability exists and CFCM resolves how it can be satisfied.

```text
Agent
  |
  v
CFCM
  |
  +-- CapFoundry public index
  +-- private namespace indexes
  +-- Local.* index
  |
  v
best compatible capability
```

## 7. Private Namespaces and `cfcm.json`

Private capabilities are not `Local.*`. They retain their organization or publisher namespace and can be distributed only to authorized CFCM installations.

CFCM uses a local configuration file named:

```text
cfcm.json
```

The file describes capability sources and local policy; it should not contain every capability definition itself.

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

A private source may later be implemented through a filesystem, private registry, Git repository, package feed or organization mirror.

Possible management commands:

```text
cfcm namespace add Netsi ./capabilities/netsi
cfcm namespace list
cfcm sync
cfcm list Netsi.*
```

`Local.*` is built into CFCM and is not added as an ordinary external namespace.

## 8. Local-First Execution

CapFoundry is **not** primarily a hosted "execute this function" service.

Central execution of every capability would create four avoidable problems:

1. server compute cost grows with every execution
2. a central service becomes a scaling bottleneck
3. network round trips add latency to otherwise cheap deterministic operations
4. input data may unnecessarily leave the local or organizational environment

The default execution path is therefore:

```text
LLM / coding agent
       |
       v
      CFCM
       |
search / resolve
       |
artifact cached?
   /          \
 yes           no
  |             |
  |          fetch artifact
  |             |
  |       verify + cache
  |             |
  └───────┬─────┘
          v
    LOCAL EXECUTION
          |
          v
        RESULT
```

A capability can still call an external system when its declared permissions and purpose require it. For example, a private `Netsi.faktura.getInvoice` adapter may execute locally while calling an authorized internal invoice service with locally controlled credentials.

An optional **Capability Executor** may also exist for workloads that are unsuitable for local execution, such as heavy compute, specialized hardware, proprietary hosted implementations or organization-controlled execution environments.

Remote execution is therefore an allowed deployment option, not the default architecture.

## 9. CFCM Packages, Indexes and Caching

CFCM should not require a central round trip for every capability search.

CapFoundry can distribute compact, signed CFCM index packages containing information such as:

- capability names and descriptions
- semantic contracts
- versions
- runtime compatibility
- assurance/trust metadata
- artifact hashes and locations
- compact search data

A CFCM index package is distinct from the executable artifact.

```text
CapFoundry / private registry
          |
          v
 signed compact index package
          |
       CDN/cache/
   organization mirror
          |
          v
        CFCM
```

Capability artifacts can then be fetched on demand and cached locally.

```text
CFCM index
    |
match capability
    |
artifact cached?
  /        \
yes         no
 |           |
run       fetch + verify
             |
            cache
             |
             run
```

This keeps both search and repeated execution fast while allowing indexes and artifacts to have independent update lifecycles.

## 10. Results and Artifacts

A capability invocation normally returns a **result**.

CapFoundry must also support returning the underlying **artifact** when the capability's exposure policy permits it.

The generic return mode should support at least:

```text
result
artifact
result-and-artifact
metadata
```

`result` is the default.

An artifact may be source code, a WASM module, a package, a compiled binary, a Custom Element bundle or another executable/distributable implementation form. "Artifact" is deliberately broader than "code".

Example request:

```json
{
  "capability": "CapFoundry.json.schema.infer",
  "input": {
    "data": {"status": "open"}
  },
  "options": {
    "return": "result-and-artifact"
  }
}
```

Artifact exposure is policy-controlled:

```json
{
  "exposure": {
    "execution": true,
    "artifact": false
  }
}
```

A private capability can therefore be executable without making its implementation available to the calling agent.

> **Capabilities are executable by default and inspectable when permitted.**

## 11. Capability vs. Implementation

A capability answers **what**.
An implementation answers **how and where**.

Example:

```text
CapFoundry.json.schema.infer
├── TypeScript / Deno
├── TypeScript / Node.js
├── Python
├── Rust
└── WASM
```

Each implementation should satisfy the same semantic contract and conformance tests.

This distinction lets CapFoundry represent stable software meaning while implementations evolve.

It also avoids forcing every capability to support every runtime. Implementations should be added based on real demand.

## 12. Capability Contract

A mature capability can contain metadata such as:

```yaml
name: CapFoundry.json.schema.infer
version: 1.0.0
type: function

summary: Infer a JSON Schema from JSON values.

semantic_guarantees:
  - output is valid JSON Schema
  - object properties are inferred recursively
  - enum inference follows documented evidence rules

input:
  schema: ...

output:
  schema: ...

deterministic: true
effects: PURE

permissions:
  filesystem: none
  network: none
  secrets: none

implementations:
  - runtime: deno
    language: typescript
    artifact: ...

provenance: ...
license: ...
tests: ...
```

The exact schema can evolve. The important point is that a capability is more than a text description or source file.

## 13. Semantic Contracts Must Be Stable

A capability's semantic contract should be immutable once published.

An implementation can improve:

- performance
- memory use
- portability
- security
- dependency quality

without changing what the capability means.

If the semantics change materially, the system should create either:

- a new major semantic identity, or
- a distinct capability

SemVer remains useful, but conformance against semantic tests is more important than a version number alone.

## 14. Determinism Is Not Correctness

A deterministic implementation can be consistently wrong.

Therefore CapFoundry must distinguish:

```text
DETERMINISTIC
from
CORRECT
from
VERIFIED
from
TRUSTED
```

Correctness comes from evidence:

- tests
- reference data
- conformance suites
- differential testing
- formal verification where justified
- human review where evidence remains ambiguous

## 15. Components Are Also Capabilities

UI components should fit the same model, but they need richer contracts.

A component can have four contract dimensions:

1. data contract
2. behavior contract
3. visual contract
4. accessibility contract

Possible metadata:

- framework
- browser compatibility
- responsive behavior
- accessibility
- bundle size
- dependencies
- design system
- styling assumptions
- properties
- events
- slots
- screenshots/snapshots
- tests

For broadly reusable components, a standards-based Web Component may be useful, with framework adapters where demand justifies them.

But this should not become a universal rule.

## 16. Effect Classes

Capabilities have different levels of operational risk.

A useful initial classification is:

```text
PURE
LOCAL_EFFECT
READ_EXTERNAL
WRITE_EXTERNAL
PRIVILEGED
```

Examples:

```text
geo.distance                    PURE
file.format                     LOCAL_EFFECT
economic.getInvoice             READ_EXTERNAL
github.createIssue              WRITE_EXTERNAL
system.installPackage           PRIVILEGED
```

Effect level is independent of implementation language.

The MVP should initially concentrate on PURE capabilities.

## 17. Permission Model

A capability should declare what it needs.

Example PURE capability:

```yaml
permissions:
  filesystem: none
  network: none
  environment: none
  secrets: none
  cpu: 100ms
  memory: 32MB
```

Example connector:

```yaml
permissions:
  network:
    allow:
      - api.e-conomic.com
  secrets:
    - economic.oauth
```

The principle is:

> **A capability declares what it needs; the runtime grants nothing else.**

This is stronger than asking an LLM whether an implementation looks safe.

## 18. Confinement Before Inference

Many security questions can be simplified by architecture.

Instead of asking:

> "Is this code likely to misuse the network?"

prefer:

```text
NETWORK ACCESS = IMPOSSIBLE
```

where the capability does not need it.

Likewise:

```text
filesystem = none
secrets = none
process spawning = none
```

This leads to an important principle:

> **Prefer confinement over inference where practical.**

AI can assist with analysis. The runtime should enforce policy.

## 19. Trust Lifecycle

A capability may move through states such as:

```text
UNVERIFIED
SANDBOXED
VERIFIED
APPROVED
TRUSTED
REVOKED
```

These states describe lifecycle and trust, not simply effect level.

A PURE capability can still be unverified.
A connector can still eventually become trusted.

## 20. Assurance Levels

Different capabilities justify different levels of evidence.

A possible assurance scale:

```text
A0  UNVERIFIED
A1  SCANNED
A2  SANDBOX VERIFIED
A3  REVIEWED
A4  HIGH ASSURANCE
A5  FORMALLY VERIFIED
```

The level should reflect actual evidence, not marketing language.

Not every capability needs high assurance.

Formal verification should be reserved for places where the value justifies the cost.

## 21. Provenance and Supply Chain

Candidates can originate from:

```text
LLM-generated software
human-written software
internal repositories
open-source repositories
package registries
external APIs
```

Every candidate should preserve provenance such as:

- source
- publisher
- repository
- commit
- package version
- dependencies
- build process
- license
- signatures
- review history
- vulnerability state

External discovery is not trust.

Finding a GitHub repository does not mean its code should immediately execute inside a trusted environment.

## 22. Quarantine

Unknown software should enter a quarantine stage before publication.

```text
DISCOVERED
    |
QUARANTINE
    |
STATIC ANALYSIS
    |
SANDBOX VALIDATION
    |
CONFORMANCE TESTS
    |
SECURITY / LICENSE / PROVENANCE
    |
ASSURANCE ASSESSMENT
    |
RISK ASSESSMENT
    |
AUTO-APPROVE / HUMAN REVIEW / REJECT
    |
APPROVED
    |
SIGNED
    |
PUBLISHED
```

Quarantined candidates should not be presented as normal production capabilities.

## 23. Revalidation and Revocation

Approval is not permanent certainty.

Revalidation can be triggered by events such as:

- new CVE
- dependency compromise
- dependency update
- runtime update
- failure regression
- contract violation
- security incident
- provenance problem
- ownership transfer

A capability can then be:

```text
REVALIDATED
DEPRECATED
REVOKED
```

A universal confidence-decay timer is not necessary. Risk- and event-driven revalidation is more defensible.

## 24. MVP Execution Profile

A safe first runtime profile can be intentionally narrow:

```text
PURE capabilities only
No network
No secrets
Read-only structured input
Structured output
Hard CPU limit
Hard memory limit
Hard execution timeout
No ambient environment access
```

This profile is simple enough to build and useful enough to test the basic thesis.

It should be enforced locally by CFCM's execution environment in the first implementation.

WRITE_EXTERNAL and PRIVILEGED capabilities should wait.

## 25. Human Review Must Be Risk-Based

If every candidate requires manual review, CapFoundry will become a queue rather than a learning system.

A better policy is:

```text
Risk + provenance + evidence + confidence
                   |
            policy decision
          /       |       \
       AUTO     REVIEW    REJECT
```

Examples:

```text
PURE + strong tests + known provenance
→ potentially automatic approval

READ_EXTERNAL + known vendor adapter
→ targeted review

WRITE_EXTERNAL + secrets
→ human review

PRIVILEGED
→ strict review / policy
```

Humans should review uncertainty and risk, not every line of every capability.

A useful operational KPI is:

> **Human Review Minutes per 1,000 Capability Executions**

## 26. LLM Authority Boundary

LLMs are useful in the lifecycle, but they should not become the root of trust.

An LLM MAY:

- summarize code
- classify behavior
- propose capability boundaries
- suggest tests
- explain licenses
- identify possible risks
- cluster demand
- draft requirements

An LLM MUST NOT be the only evidence used to:

- approve correctness
- approve security
- determine legal license compatibility
- grant permissions
- publish high-risk capabilities

The principle is:

> **The LLM is an analyst, not an authority.**

and:

> **Don't ask an LLM to judge what you can verify.**

## 27. Capability Awareness

Technical access to CapFoundry is insufficient.

An agent needs a small amount of capability awareness so it knows when to ask the question.

The mental model should remain compact:

```text
Need something
     |
Ask CFCM
     |
Can it do it?
   /       \
 YES        NO
 |           |
run      create normally
            |
       worth sharing?
            |
      candidate.submit
```

Possible operations include:

- `capability.search`
- `capability.describe`
- `capability.resolve`
- `capability.run`
- `capability.artifact`
- `candidate.submit`
- `capability.feedback`

`capability.run` is normally fulfilled by CFCM through local execution. It does not imply a central CapFoundry execution service.

The agent should not have to understand the entire CapFoundry architecture.

> **Keep the agent integration thin. Put complexity in the platform/client.**

## 28. Skills and MCP Solve Different Problems

A useful separation is:

```text
SKILL
"What should I do?"

MCP / API / SDK
"How do I interact?"

CAPFOUNDRY + CFCM
"What capability exists, how can I resolve it,
and what should be learned next?"
```

MCP can expose CFCM operations to an agent, but MCP is an interface protocol, not CapFoundry itself.

## 29. MCP Is an Adapter

CapFoundry should support multiple access methods.

```text
Agent / Developer / Application
          |
    ┌─────┼─────┐
    |     |     |
   MCP   REST   SDK
    |     |     |
    └─────┼─────┘
          |
         CFCM
          |
   local capability space
```

All interfaces should use the same contracts and policy model. For normal execution, the central service does not need to sit in the data path; CFCM applies local resolution, artifact verification, permissions and execution policy.

The security principle remains:

> **Protocol permissions are not capability permissions.**

## 30. Search Before Generate - But Not Blindly

The earliest version of the idea can be summarized as:

```text
search before generate
```

But unconditional retrieval is not always efficient.

Search has costs:

- latency
- context
- tool calls
- infrastructure
- false matches

Therefore a mature agent should use an **Adaptive Retrieval Policy**.

Conceptually:

```text
Expected value of retrieval
=
probability of useful match
× value of reuse
-
search cost
-
false-match risk
```

Search when expected value is positive.

Do not search when generation is obviously cheaper.

## 31. Precision Before Recall

For executable software, an incorrect recommendation can be worse than no recommendation.

Search should therefore optimize precision before recall.

Useful result states:

```text
MATCH
PARTIAL_MATCH
NO_MATCH
OUT_OF_DOMAIN
```

`OUT_OF_DOMAIN` means the registry lacks enough evidence that it adequately covers the requested domain.

Search should combine multiple signals:

```text
semantic similarity
        +
input/output compatibility
        +
runtime compatibility
        +
effect compatibility
        +
permission compatibility
        +
contract compatibility
        +
trust requirements
        |
        v
CONFIDENT MATCH
```

Returning nothing is preferable to confidently recommending the wrong executable capability.

## 32. Natural-Language Developer Access

CapFoundry should not only serve AI agents.

A developer should be able to search using ordinary language.

Example:

```text
I need to generate JSON Schema from arbitrary JSON
and identify likely enums.
```

Search could consider:

```json
{
  "query": "I need to generate a JSON Schema from arbitrary JSON and identify likely enums",
  "runtime": "deno",
  "language": "typescript"
}
```

CFCM can then return a high-confidence compatible capability.

This turns CapFoundry into a software discovery system for humans as well as machines.

## 33. Internal and External Discovery

When a capability is missing, a future discovery pipeline can search progressively:

```text
1. local/private CapFoundry sources
2. internal source repositories
3. package registries
4. open-source repositories
5. MCP ecosystem
6. public APIs
7. new implementation
```

This order is not rigid, but it expresses an important preference:

> Reuse known and governed software before importing unknown code or creating new software.

External candidates still enter the normal provenance, quarantine and validation lifecycle.

## 34. Central Platform, CFCM and Execution Environments

The architecture is better understood as three cooperating layers than as one central execution plane.

### Central CapFoundry

Responsible for:

- public registry
- public search metadata and index publication
- candidates and quarantine
- requirements and discovery
- provenance, licensing and validation evidence
- approval and signing
- versioning and lifecycle
- demand intelligence
- Explore and Trending
- distribution metadata

### CFCM

Responsible for:

- local unified capability index
- public/private/local namespace resolution
- index and artifact caching
- local search
- compatibility resolution
- local trust and permission policy
- local execution by default
- optional routing to remote executors
- artifact return policy
- local telemetry buffering and feedback

### Execution Environments

Execution may occur:

- in the local process or sandbox
- in an organization-controlled executor
- in a vendor-hosted service
- in an optional CapFoundry-compatible remote executor

The execution location is a property of capability resolution and policy, not a requirement that CapFoundry centrally execute every call.

## 35. Telemetry

Telemetry is essential because CapFoundry should learn from actual software demand.

### Execution telemetry

Useful measurements include:

- capability
- implementation
- version
- runtime
- calls
- success/failure
- latency
- cache hit/miss
- security events
- revoked attempts
- assurance level

### Demand telemetry

Also record:

- search query
- search/no-search decision
- match result
- selected/rejected result
- confidence
- runtime/framework need
- candidate generated
- candidate submitted
- missing capability
- missing implementation

CFCM should buffer and batch telemetry where possible so central telemetry does not become part of the hot execution path.

## 36. Measuring Whether CapFoundry Helps

CapFoundry should be evaluated against a control group.

```text
A: agent with CFCM / CapFoundry
B: equivalent agent without CapFoundry
```

Compare:

- task success
- correctness
- repeatability
- total latency
- total token consumption
- total cost
- generated code
- search overhead
- maintenance burden
- false matches
- candidate reuse
- human review effort

Important CFCM metrics also include:

- local lookup p50/p95/p99
- artifact cache hit rate
- artifact download latency
- local execution latency
- central server calls avoided
- offline success rate

The goal is not maximum reuse.

The goal is maximum **net value from reuse**.

## 37. The JSON Schema Experiment

An early motivating experiment compared:

```text
A. deterministic software
JSON -> inferred JSON Schema

B. direct LLM prompt
JSON -> inferred JSON Schema
```

Observed execution time was similar in one small test.

The deterministic implementation detected enum structure that the direct LLM response did not identify.

This does not prove the deterministic implementation is universally better.

It illustrates the kinds of advantages CapFoundry can test empirically:

- repeatability
- explicit rules
- testability
- predictable output
- reduced generation
- reduced context/code generation

The enum case also demonstrates why inference rules themselves must be explicit and testable. A single repeated value is not sufficient evidence of an enum.

## 38. Software Memory - Carefully Defined

CapFoundry can be thought of as a form of organizational software memory.

But the useful abstraction is not:

```text
remember all generated code
```

It is:

```text
Need
  |
Capability
  |
Semantic contract
  |
Verified implementation(s)
```

This makes the memory model-independent.

A future model does not need to know which LLM originally produced a capability.

It needs to know:

- what the capability means
- what contract it satisfies
- where it can execute
- what evidence supports it
- whether it is currently trusted

## 39. Capability Creation Skills and CFP Generation

CapFoundry should eventually provide Skills that help humans and agents turn existing software into governed capabilities.

One important Skill class is a **Capability Packager Skill**. It can inspect:

- existing project code
- one or more existing CapFoundry capabilities
- open-source code with a compatible license such as MIT
- a package
- a GitHub repository

The Skill should not blindly ingest a repository. It should work interactively with the user:

```text
GitHub repository / existing code
              |
              v
       inspect structure
              |
              v
 identify capability candidates
              |
              v
 discuss candidates with user
              |
              v
 select semantics + namespace
              |
              v
 define contract + permissions
              |
              v
 build tests + provenance
              |
              v
 create complete namespaced CFP
```

The user may point the Skill at a GitHub repository. Through dialogue, the Skill should explain what reusable capabilities it finds, propose boundaries, identify licensing and dependency implications, and let the user choose what should become a capability.

The output should be a complete namespaced **CFP - CapFoundry Package** containing the material required for review, installation and distribution, for example:

```text
Netsi.someDomain.someCapability.cfp
├── capability.json
├── artifact/
├── tests/
├── provenance.json
├── license/
└── README.md
```

The exact CFP physical format is intentionally not frozen yet. The important requirement is that the package has a stable namespace identity, semantic contract, artifact, tests, provenance, license information and execution/permission metadata.

A future Skill may also compose a new CFP from existing capabilities rather than copying or rewriting their implementations.

This is an important route for bootstrapping CapFoundry from the software ecosystem that already exists.

## 40. What CapFoundry Is Not

CapFoundry is not intended to be:

- a replacement for Git
- a replacement for npm/PyPI/crates.io
- a generic code snippet database
- a mandatory central runtime
- a system that executes arbitrary downloaded code
- an LLM-only product
- an MCP-only product
- a claim that every function should be reused
- a claim that generation is bad

Its purpose is narrower:

> Discover, govern and reuse software capabilities when reuse provides more value than regeneration, and learn systematically from the demand that remains unmet.

## 41. Vision vs. MVP

This document intentionally describes a larger future architecture than should be built initially.

Features such as:

- multi-source external discovery
- full assurance levels
- advanced HITL policy
- workflow discovery
- automatic requirement generation
- enterprise IAM
- multi-runtime orchestration

are architectural boundaries, not MVP commitments.

The MVP should remain small enough that it can prove or falsify the central loop.

## 42. Central Formulation

A compact formulation of the product is:

> **CapFoundry is a demand-driven Software Capability Platform in which a compact local CFCM lets humans and AI agents discover namespaced capabilities, resolve and normally execute their artifacts locally, optionally obtain the artifacts themselves, combine public, private and machine-local capability spaces, learn from unmet demand, and submit useful new solutions as governed candidates to a shared, model-independent capability ecosystem.**

An even shorter formulation is:

> **Ask CFCM whether CapFoundry can already do it. If it can, resolve and run it locally. If it cannot, create it - and teach CapFoundry when the result deserves to become a capability.**

And the architectural shorthand remains:

> **Centralize knowledge. Decentralize execution.**

## 43. Research and Validation Questions

The most important open questions are empirical:

1. How often do coding tasks contain useful reusable capability-shaped work?
2. How accurately can search distinguish a real match from semantic similarity?
3. How low can CFCM lookup overhead become with local indexes?
4. How much code generation can actually be avoided?
5. Does reuse improve correctness enough to justify retrieval cost?
6. How often are generated candidates genuinely reused later?
7. What assurance level is economically justified for each effect class?
8. How much review time can risk-based policy remove safely?
9. Can workflow discovery create stable abstractions without semantic drift?
10. Can CapFoundry remain simpler for agents than simply generating code?
11. Does local-first execution materially improve privacy, latency and infrastructure economics?
12. How should private capability namespaces be distributed and governed across organizations?

These should be measured rather than answered architecturally in advance.

## Version History

### v0.5

- made CFCM a first-class local architecture component
- established local-first execution and optional remote executors
- introduced compact CFCM index packages and artifact caching
- introduced public, private and reserved `Local.*` namespaces
- added `cfcm.json` for private namespace sources and local policy
- introduced namespaced capability identities such as `Netsi.faktura.getInvoice`
- added generic artifact return modes and artifact exposure policy
- clarified that CapFoundry is not a central execution service
- added Capability Packager Skills and GitHub-to-CFP workflow
- introduced CFP as the conceptual complete namespaced capability package

### v0.4

- separated Vision & Architecture from the MVP document
- moved the napkin description to the front
- strengthened candidate submission after no-match generation
- added Explore / Trending and software-demand intelligence

### v0.3

- adaptive retrieval economics
- out-of-domain detection
- graded assurance
- quarantine
- concrete low-risk execution boundary
- immutable semantic contracts
- review-economics telemetry
- LLM as analyst, not authority
