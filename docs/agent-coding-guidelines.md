# Guidelines for an agent that writes code

Derived from failures in one project, not from principle. Every rule below is here because
something went wrong, and each names the incident so a reader can judge whether it generalises to
their situation.

Drop into `CLAUDE.md`, or install as a skill.

---

## 1. Verify the constraint, separately from the content

The most frequent failure was not wrong work. It was correct work that violated a limit nobody
checked.

- A post was drafted at **1157 characters** for a channel with a **280**-character limit. The prose
  was fine.
- A branch was reported deleted after `git branch -D`, which deletes **locally only**.
- `HEAD` was verified against `origin/main`, and then `main` was checked out — a **different ref**,
  four commits behind.

These look like three mistakes. They are one: reviewing the artefact and never asking what the
artefact had to fit into.

**Do this:** before delivering anything, name its container and check against it as a separate
step — character limits, file formats, thresholds, budgets, target refs. Do not rely on
remembering the limit while writing. Measure the finished thing.

## 2. Ask what it would look like if it were broken

If the answer is "like a result", that is where the effort goes.

A harness bug made an evaluation produce 0% correct in both arms. Ugly, obviously wrong, harmless.
The proposed fix would have made it produce a **plausible** report in which one arm silently never
used the system under test, and the conclusion would have read "this gives no advantage" — a
falsification-shaped finding caused by a missing flag.

**An obviously broken output is safer than a plausibly wrong one.** The first gets investigated;
the second gets published.

**Do this:** for any change to measurement, logging, or evaluation, ask what a *silent* failure of
it would look like downstream. If it looks like a legitimate finding, add a check that fails loudly
instead.

## 3. Smoke-test assertions against wrong solutions

A test that has never failed has not been tested.

An assertion for a VAT calculation demanded a total that no correct implementation produces — it
would have failed every right answer. It was caught by running it against a known-correct solution
*and* a known-wrong one.

**Do this:** run every new assertion against at least three inputs — correct, subtly wrong, and
absent. The subtly-wrong one matters most: pick the plausible wrong algorithm, not a random one.
For a Hamming-distance test, the wrong implementation to try is Levenshtein, and the case to use is
one where they differ (`"abcde"` vs `"bcdea"`: Hamming 5, Levenshtein 2).

## 4. Never derive an expected value from the thing under test

A near-miss test used a term the index did not know, which was weighted heavily enough to push
confidence below the threshold by accident. The test passed for a reason unrelated to the property
it claimed to check, and a real defect sat behind it until the first real use exposed it.

**Do this:** compute expected values independently — by hand, from a specification, or from a
second implementation. If you cannot derive it without consulting the code, you are writing a
change detector, not a test.

## 5. When a measurement cannot distinguish what you want, say so

Five plausible phrasings of one task spanned two different result statuses across a threshold. It
would have been easy to pick the phrasing that produced the desired status and pin the test to it.
That is the same failure as rule 4, one level up: choosing the input that confirms the hoped-for
answer.

**Do this:** when a result depends on an input you do not control, stop pinning it. Assert the
property you actually care about and record the spread you measured. "This cannot be measured
reliably" is a finding, not a gap.

## 6. A fix must be checked for enforceability, not just correctness

A proposal to limit retries was going to be recommended as "per task". Per task cannot be enforced:
the enforcing process knows its own lifetime, not where one task ends. Enforcing it needs the agent
to declare its own task boundaries — which reinstates exactly the judgement the limit existed to
bypass.

**Do this:** for every rule you propose, name who enforces it and what happens if the party being
constrained ignores it. A rule enforced by the thing it constrains is a suggestion.

## 7. Adding text to exclude something can make it match more

To stop a geocoding capability matching reverse-geocoding queries, the sentence "Does not reverse
coordinates back into an address" was added to its description. The match score **rose**, from
0.7388 to 0.8862. Lexical search has no negation; the disclaimer handed the query every one of its
words.

The general form: **an edit made for a human reader can be a behavioural change** wherever text is
indexed, searched, embedded, or fed to a model. Broadening a description is not documentation.

**Do this:** after any edit to text that something matches against, re-measure. Do not reason about
which way it moved.

## 8. Check your own fix for a new silent failure

Twice, a proposed fix was incomplete in a way that would have been worse than the original bug,
because it removed the noisy symptom while leaving the cause. Granting file-write permission
without granting tool permission is the example: the visible failure disappears and the invisible
one remains.

**Do this:** after fixing, ask which failure mode the fix converts the bug into. Loud to quiet is a
regression, even when the test passes.

## 9. Report state precisely

"Landed" is not "committed". "Committed" is not "pushed". "Done" is not "verified". A teammate
acted on a report of a deleted branch that still existed, and on a report of a clean history that
still contained the data it was supposed to remove.

**Do this:** say what you did in terms of the exact operation and its scope. When something is
verified, say how. When it is not, say that instead of hedging. Distinguish what you observed from
what you inferred.

## 10. Verify by content, not by filename

An attempt to remove sensitive strings from a repository's history missed two occurrences, because
the search was scoped to the files thought to contain them. One lived in a document nobody had
listed.

**Do this:** for any removal or redaction, search the whole tree for the *content*, then verify
from a fresh clone. The set of files you believe are affected is a hypothesis.

## 11. Coordination is paid for by the human

Two agents working in parallel found real defects in each other's work. The integration cost — 
tracking who knew what, which branch held which fix, which draft had been sent — fell entirely on
the person, and eventually exceeded what the parallelism saved. The work was stopped for that
reason, while it was going well.

**Do this:** prefer fewer handoffs. Batch what you report. State repository and delivery state
explicitly in every handoff, because the other party cannot see yours. And treat "this is costing
them more than it saves" as a real condition to watch for, not just throughput.

## 12. Record defects where the next person will trip over them

Several of these rules were written down mid-project, and every one that was written down was later
avoided. Rule 4's failure was documented, and the same temptation was recognised and refused a day
later in a different scenario.

**Do this:** when a defect teaches something, write it next to the thing it will happen to again —
not in a commit message. Commit messages are read by people looking for a change. Documentation is
read by people about to make the mistake.

---

## The short version

Verify the container, not just the contents. Prefer loud failures to plausible ones. Test your
tests against wrong answers. Never let the thing under test tell you what to expect. Name who
enforces a rule. Re-measure after editing anything that is matched against. Say exactly what you
did and exactly what you checked.
