# LinkedIn launch post — draft 1

**Status:** draft for Sten's review, not published · **Audience:** developers pushing AI-assisted
software development forward · **Goal:** start a conversation, not announce a product

Placeholders to fill before posting: `[REPO LINK]`, and the measured numbers in the falsification
line if the README scoreboard lands first.

---

## The post

I kept watching models reinvent the wheel.

Not badly — usually correctly. The same haversine formula, the same CSV delimiter sniffer, the same
slug function, written fresh in every session, with no memory that any of it had ever been solved
before.

So I built CapFoundry: a registry an agent asks *before* it generates.

Three things turned out to be less obvious than I expected.

**"No match" has to be a normal answer.** A registry that's embarrassed to say it has nothing starts
returning things that nearly fit — and a near-miss is worse than no answer, because the agent
actually uses it.

Mine failed this, and I only found out by accident. An agent asked for the edit distance between two
strings. My registry returned a *geographic* distance capability — not hedged, not flagged as
uncertain, but a confident MATCH at 0.568. One word, "distance", appearing across the capability's
name, aliases, description, summaries and example queries at once. The agent rejected it and wrote
the code itself, which is the only reason I noticed. The test suite had missed it because my
near-miss case used the word "levenshtein", which the index had never seen and weighted heavily
enough to push the score under the threshold. I'd written a test that confirmed the answer I was
hoping for.

**Enforcement beats promises.** A skill that says "I don't touch the network" is making a promise. A
capability that declares `effect: PURE` runs in a subprocess with no permission flags at all — plus
a few more that close the holes zero permissions leaves open. I'd assumed zero permissions *was* a
sandbox until I tested it: a static import of a remote URL gets fetched by the module loader before
any permission check runs. The flag list is the threat model, not tidiness.

**Skills and capabilities aren't competitors.** Skills change how a model behaves; capabilities
produce values. "When is it worth searching?" can't be a capability — that's judgement, not
computation. But skills lack what packaging gives you: no checksum, no provenance, no licence trail.
You can't verify that the skill running is the one you reviewed.

It's an experiment, not a product. Seven conditions that would falsify the idea were written down
before the first line of code. Three of them aren't measured yet — and one number I'd already
reported as 0.000 turned out to be 0.105, which is in the changelog rather than quietly fixed.

If you're working in this space I'd like to hear where you think it breaks. The question I'm least
sure about: is search-before-generate worth the latency, or does the model just write the thing
faster than it can look it up?

[REPO LINK]

---

## Notes on the draft

**Why it opens on reinvention rather than on the registry.** The problem is felt by the audience
daily; the solution isn't. Leading with the architecture makes it a product announcement, which is
the thing least likely to get replies.

**Draft 2: the anecdote was wrong in draft 1, and the correction improved it.** I had written the
failure as a hedged `PARTIAL_MATCH` at 0.508. Verified against the index at commit 6a2a471, the real
figures are 0.4656 for the short phrasing and a confident **MATCH at 0.5679** for "compute the edit
distance between two strings". The system did not hedge — it recommended a geographic function for a
string problem and meant it, which is worse for CapFoundry and better as an illustration. Draft 1
also claimed the agent "read the match evidence" before rejecting it; the transcript shows it judged
the capability unrelated from its contract, with nothing to show it inspected `matchedOn`. That
sentence is now gone. It was the one a reader would have tested.

**Why the near-miss example is the centre.** It's the only part nobody else is saying, it's real
rather than illustrative, and it demonstrates the design decision instead of asserting it. It also
shows the system failing gracefully, which reads as more honest than a success story.

**Why the falsification line is near the end rather than the hook.** It's the strongest claim but it
only means something after the reader knows what's being falsified. Opening with it sounds like
positioning.

**The closing question is genuinely open.** Latency versus generation cost is the weakest point in
the premise, and asking about it invites the objection rather than waiting to be hit with it.
Inviting the strongest counter-argument is also the thing most likely to produce real replies rather
than congratulations.

**One thing deliberately left out:** that two Claude Code sessions built this in parallel and
coordinated through a file in the repo. It's the most interesting thing here, but it's a different
post and it would swallow this one.
