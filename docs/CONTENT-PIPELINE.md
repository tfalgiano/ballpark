# The content pipeline

How Ballpark questions get written, checked and scheduled — and what two runs of
it actually cost and produced.

**Status: generation is PARKED as of 2026-09-03.** The pack holds 174 days
through **16 January 2027**, with 135 unplayed. There is no reason to spend
another five million tokens today on a problem we no longer have. Revisit well
before the January cliff — the runway alarm in `tests/test.js` fails at 21 days
remaining, which is the backstop, not the plan.

---

## The stages

```
author  →  deterministic dedupe barrier  →  adversarial verifier  →
second verifier (contested only)  →  check-batch gates  →  assemble  →  freeze
```

**Author.** One agent owns a whole category and sees every question already
shipped in it. Owning the whole category is what makes internal variety the
author's problem rather than something discovered later at merge.

**Deterministic dedupe barrier.** Plain code, not an agent, between generation
and verification. Every candidate is compared against every other across *all*
categories — the cross-category visibility a per-category verifier structurally
cannot have. Flagged pairs are handed to the verifiers as *adjudication work*,
never rejected silently, because word overlap alone cannot tell "temperature on
Mars" from "temperature on Venus".

**Adversarial verifier.** One per category, told to *disprove*, not approve. Must
open sources rather than trust the claimed one. Every verdict echoes the
candidate's exact prompt — corrections apply by prompt identity, never by index.

**Second verifier.** Fires only on contested verdicts, dedupe flags, or
medium-confidence claims. Its job is to check the *first verifier*, not repeat
it: an over-eager drop wastes a good question. Drops win on conflict.

**`tools/check-batch.js`.** Eleven population-level gates before anything is
appended — the properties visible only in aggregate. Must pass.

**`tools/assemble.js`.** Mechanical validation, published-day freeze, id-drift
refusal, near-duplicate rejection. **`tools/verify-pipeline.js`** must pass too:
a single successful build has twice now hidden a bug that appeared on the second.

**`tools/freeze-schedule.js`.** Records the intended schedule. Refuses to record
any change to a day at or before today.

---

## Two runs, measured

| | Batch 1 | Batch 2 |
|---|---:|---:|
| Architecture | 12 authors + 12 verifiers, isolated | 6 authors + 6 verifiers + 87 adjudicators |
| Candidates | 300 | 300 |
| Accepted | 268 | 277 |
| Dropped — factual | 21 | 2 |
| Dropped — duplicate | 10 | 13 |
| Dropped — other | 1 | 8 |
| Corrected | 29 | 55 |
| Reveal repairs applied in-batch | 0 | 43 |
| **Duplicates reaching the merge** | **10** | **0** |
| Agents | 35 | 99 |
| Tokens | 2,104,651 | 5,483,519 |
| Tokens per accepted question | 7,853 | 19,796 |
| New game days | 54 | 55 |

**The architecture is better and it is not cheaper.** I predicted ~40% fewer
tokens per accepted question and was wrong by a wide margin — it cost 2.5× more.
Halving the authors saved less than the second verification pass added.

### What is proven and must be kept

- **The dedupe barrier works.** Zero duplicates against all 596 shipped questions
  and zero within the batch, against ten that reached the merge in batch 1.
  Deterministic code with global visibility beat agents with partial views.
- **`correctedReveal` works.** 43 defects repaired in-batch, against 11
  detected-but-unfixable in batch 1 that cost an entire extra workflow.
- **Prompt identity works, and has already saved us twice.** Once when eleven
  reveal repairs were addressed to fabricated coordinates, and once when a
  resolver stamped 60 verdicts with an adjudicator's own numbering. Six of those
  carried corrections that would have landed on unrelated questions.
- **Second verification earns its place, narrowly.** It changed ~15 of 87 items,
  including 2 factual errors the first pass missed and an ice-core record
  superseded in January 2025.

### What is not settled

**Whether 99 agents is the right shape.** Batch 2's near-zero factual drop rate
is either authors genuinely improving or one verifier per 50 questions being less
adversarial than one per 25. The second pass suggests the former — it found only
2 factual problems across 87 re-reviews — but that is one data point.

If the next batch needs to be cheaper, the honest lever is narrowing what goes to
second verification, not removing it. Cutting it entirely would remove the only
check that has ever caught a first verifier being wrong.

---

## Rules learned the hard way

1. **A published day never changes.** Not for a better question, not for a typo.
2. **New validation rules apply to new candidates only.** Published content is
   immutable including its mistakes — a retroactive rejection slides every later
   positional id onto a different prompt.
3. **Coordinates are never identity.** A verdict carries the prompt it reviewed.
   A mismatch fails the whole build, not just that question.
4. **A "fix" with no correction is a drop.** A verifier that sees a problem and
   supplies no replacement has not fixed anything.
5. **Run the build twice.** Two separate bugs have looked perfectly healthy on
   their first run and corrupted the schedule on their second.
6. **A year in a prompt anchors a fact; it does not make it drift.** "The 2022
   World Cup" is settled forever. "How many survive today" is not.

---

## Reaching 365 days

174 today. Roughly 950 more accepted questions, so three or four more batches at
current yield. There is no deadline pressure and no reason to run them
back-to-back — each one is an opportunity to spend less for the same quality.
