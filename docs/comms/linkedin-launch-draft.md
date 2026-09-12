# LinkedIn launch post — draft 1

**Status:** draft for Sten's review, not published · **Audience:** developers pushing AI-assisted
software development forward · **Goal:** start a conversation, not announce a product

Placeholders to fill before posting: `[REPO LINK]`, and the measured numbers in the falsification
line if the README scoreboard lands first.

---

## The post

**Draft 3 — Fry-metoden. Audience: developers evaluating AI in the SDLC.**

---

**Your AI writes the same function every week. That's not the expensive part.**

You've watched it happen. You ask for something small — distance between two coordinates, a CSV
delimiter sniffer, a slug function — and the model writes it. Correctly. In four seconds.

And you've seen it write that same function before. Last month, in another repo, slightly
differently.

It feels like speed. Here's why it isn't.

Every session starts empty, which means the model has no memory that the problem was ever solved. So
it solves it again — and because it is generating rather than retrieving, it solves it *slightly*
differently each time. Which means the version sitting in your repo is one somebody has to read. And
the next one. And the one after that.

Before AI, reinventing a utility was expensive enough that you'd go looking for an existing one
first. That friction was doing real work, and nobody misses it.

**The problem isn't that AI writes bad code. It's that it writes good code cheaply enough that
nothing ever accumulates.**

So I've been building the unglamorous half: a registry an agent searches before it generates.
Versioned contracts, permissions the runtime enforces rather than the model promising, and "no
match" as a perfectly normal answer — because a registry that's embarrassed to say it has nothing
starts recommending things that nearly fit.

It's an experiment and it's allowed to fail. Seven conditions that would falsify it were written
down before the first line of code, and the verdict gets published whichever way it lands.

If you're putting AI into your SDLC: where do you think this breaks?

[REPO LINK]

---

**Self-check.** Written for SOME (LinkedIn), ~275 words. you:I ratio roughly 8:1. The reveal is
counterintuitive: the reader expects the complaint to be about code quality, and it is about
accumulation — that cheap, correct generation removed the friction that used to force reuse.

**Alternative anchor**, if the function example feels too small: the moment you open a PR and
recognise a helper you are certain already exists somewhere in the monorepo — same sensation,
closer to the reviewer's experience than the author's.

**Alternative headline:** "AI made writing code cheap. It also made forgetting it free."

## Notes on the draft

**Draft 3 replaced draft 2 entirely.** Sten's note was that the post focused on the wrong thing: the
bugs encountered while building are not relevant to a presentation of the concept. He was right, and
the reason is worth keeping. The near-miss story was a good story about *me*, in a post that needed
to be about the reader's problem. A launch post that opens on its author's debugging asks the reader
to care about the project before they have been given a reason to.

**What survived the cut, and why.** "No match has to be a normal answer" stayed, compressed to one
clause, because it is a design claim rather than an anecdote — it tells a developer something about
how the thing behaves. The 0.5679 near-miss, the levenshtein test that confirmed its author's hopes,
the SEC-10 discovery about zero permissions: all cut. Every one of them is genuinely interesting and
none of them belongs in the first thing someone reads.

**Why the falsification line stayed.** It is the one sentence that distinguishes this from a product
announcement, it costs two lines, and it is verifiable — the conditions predate the first commit
(`45fa959` vs `37849e3`).

**The SDLC audience changed the frame.** Draft 2 addressed people building AI tooling. Draft 3
addresses people deciding whether to let AI into their pipeline, which is a larger and more sceptical
group. For them the interesting claim is not "search is better than generation" but "generated code
that nobody accumulates is a review cost you pay forever" — a lifecycle argument, not a tooling one.

**The closing question is unchanged** and still invites the strongest objection. It is the sentence
most likely to produce replies rather than congratulations.

**Still deliberately left out:** that two Claude Code sessions built this in parallel and coordinated
through a file in the repo. It remains the most interesting thing here and it would still swallow the
post.
