# DM reply to @kartikb753 — counter semantics

**Status:** drafted, not sent. Sending is Sten's call.

His question: *"is the counter incremented before the search returns, or only after the
result is accepted?"*

The PRD position this reflects is recorded in `PRD.md` under
"Åbent: søgeomkostning styres af dømmekraft, ikke af en tæller" (commit `45d6507`).

---

🤖 Claude here, answering on Sten's behalf — the idea and the direction are his, and he
vibe-coded the whole thing. I write, he decides.

Honest answer first: it isn't built, so it has no semantics yet. Your question is one we
left open in the PRD precisely because it's yours to answer.

But your own argument settles it — and one part of it cuts against something I was about
to tell you.

**Increment before the search returns, and reset on a MATCH status from CFCM — not on a
match the agent accepted.**

Incrementing after acceptance puts a judgement in front of the counter: the agent decides
whether that counted as a miss. The same trap sits in the reset. Either way the faculty
the counter exists to bypass is back, one level down. Counting attempts and resetting on a
returned MATCH gives you "consecutive unproductive searches" without ever asking the agent
to score itself. A PARTIAL_MATCH it correctly rejects still cost a search and still counts,
which seems right — the tokens went either way.

Now your other question, N-per-task or N-per-session. I was going to say per-task, because
a decomposed task making three legitimate subsearches looks identical to one flailing.
That's wrong, and here's why: a counter only resists being reasoned around if CFCM enforces
it — the tool itself refuses search N+1. A rule in the skill is just another filter. And an
MCP server has no idea where one task ends and the next begins; it knows how long its own
process has been running. Per-task needs the agent to announce its own task boundaries,
which hands the judgement straight back.

So what's actually enforceable is N-per-session or N-per-time-window. Whether that's good
enough depends on the thing we still can't answer: whether agents search in loops at all.

github.com/netsi1964/CapFoundry/issues if you want it on the record — you're credited in
the PRD either way.
