# Skills and capabilities: what CF can replace, and what it cannot

**Status:** analysis with one concrete proposal in §4 · **Date:** 2026-09-12 · **Touches:** Vision §28, §39, `PRD-FEAT-017`

Prompted by a question worth asking out loud: *given how it is built, could CapFoundry be an
alternative to skills?*

Short answer: **no to execution, possibly yes to distribution.** The second half is the interesting
one, and it is not covered by the vision today.

## 1. The vision already has a position

Vision §28 separates them:

```
SKILL                    "What should I do?"
MCP / API / SDK          "How do I interact?"
CAPFOUNDRY + CFCM        "What capability exists, how do I resolve it?"
```

This repository is its own proof. `capability-awareness` is a **skill** whose only job is to teach
an agent when to ask the registry — when a search is worth paying for, how to judge a
`PARTIAL_MATCH`, when something newly written is worth submitting. It cannot be turned into a
capability, because it has no `inputSchema`. It is judgement, not computation.

The relationship is therefore **layers, not competitors**: skill as policy, capability as mechanism.

## 2. Why CF cannot replace skills

**A skill changes behaviour; a capability produces a value.** A skill says "when you do X, do it
this way" — the model still does the work. A capability says "give me this input, get this output" —
the model does none of it.

**Skills are strongest exactly where determinism would be a defect.** "How should I structure a PRD"
must give different answers in different situations. A capability that did that would be broken.

**Prose is the output, not a by-product.** There is no `outputSchema` that captures "explained
well". Anything whose deliverable is text for a human sits outside the contract model.

**Dialogue cannot be put under contract.** A skill that interviews a user through fifteen questions
has no single input-to-output relation to seal.

## 3. Where CF is structurally stronger

| | Skill | CFP |
|---|---|---|
| Context cost | Permanent once loaded | One call; only the answer returns |
| Determinism | Passes through the model | Sealed `sha256`, same bytes every time |
| Trust | Prose the model reads and *promises* to follow | `effect` enforced by the runtime |
| Rejection | Loaded or not | `NO_MATCH` plus inspectable `matchedOn` evidence |
| Versioning | None | `version` plus sealing plus provenance |

**Context.** The SunCalc port in `CapFoundry.sun.times` is ~330 lines. One call returns
`{"sunrise": "2026-09-12T06:47:24+02:00", ...}`. The code never enters context. A registry of 10,000
capabilities costs nothing until one call; 10,000 skills is physically impossible. That is not a
difference of degree, it is the difference between a catalogue that can scale and one that cannot.

**Trust — the strongest point.** A skill saying "I don't touch the network" is making a **promise**.
A capability declaring `effect: PURE` is under a **constraint**: the subprocess gets no `--allow-*`
flag at all, plus `--no-remote` and `--no-npm`, because zero permissions alone is not sufficient
(SEC-10). For `NETWORK`, the grant is an *intersection* of the capability's `permissions.network`
and local policy in `cfcm.json` — a capability cannot grant itself access by asking. A skill cannot
offer that guarantee, however carefully it is written.

**Evidence.** Observed in a real session: the query "compute the edit distance between two strings"
returned a confident `MATCH` against `CapFoundry.geo.distance`, because the word *distance* appeared
in the name, aliases, description, summaries **and** example queries. The agent rejected the match
and wrote the code itself. A skill is loaded or it is not — there is nothing to inspect, and
therefore no way to be wrong in a visible manner.

## 4. Proposal: CFP as a packaging format for skills

Here CF has something skills lack. A skill today is a file with:

- no `sha256` — you cannot verify that the skill running is the one you reviewed
- no provenance — a skill derived from someone else's work has no `derivedFrom`
- no licence in the package
- no version and no sealing
- no machine-readable test suite

The difference is felt in practice. Building `CapFoundry.sun.times` forced the author through
upstream's licence text verbatim, a `derivedFrom` entry with version and retrieval date, and a
validator that rejects the package without them. Written as a skill, nothing would have asked.

**The proposal is therefore not to abolish skills, but to package them as CFPs:**

```jsonc
{
  "name": "CapFoundry.skill.capabilityAwareness",
  "effect": "PURE",
  "artifact": { "type": "instructions", "entrypoint": "./artifact/SKILL.md", "sha256": "..." },
  "exposure": { "execution": false, "artifact": true }
}
```

Same contract, same sealing, same provenance requirements — but `type: "instructions"` rather than
`type: "typescript"`, and `execution: false`, because a skill is not run in a sandbox. It is
**loaded into context**. `exposure.artifact: true` is exactly the right mechanic: fetching a skill
*is* fetching its artifact.

This follows a track the vision is already on. §39 describes a Skill that turns existing software
into governed capabilities. This is the same idea applied to instructions rather than to code.

### What the proposal does not solve

`outputSchema` is meaningless for instructions, and the validator requires it. Either the field
becomes conditional on `artifact.type`, or `type: "instructions"` gets its own validator branch.
That is a breaking descriptor change behind a `schemaVersion` bump, not an additive field — which is
why this is a proposal rather than a task.

Nothing measures whether a skill *works*, either. A capability has tests; a skill has wording. The
A/B harness in `PRD-FEAT-015` is the closest thing to a test for a skill, and the
`search-should-be-skipped` scenario is already tagged "Skill quality" in the PRD. Worth noting
before anyone assumes that sealing alone provides quality assurance.

## 5. Conclusion

CF's **execution model** cannot carry skills — determinism, sandboxing and contracts are the wrong
tools for judgement and prose.

CF's **packaging discipline** could carry them, and that is probably the most overlooked part of the
architecture: a CFP is not primarily a way to run code, but a way to be accountable for its origin,
its licence and its identity.
