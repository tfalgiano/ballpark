# The Ballpark Puzzle Standard

The internal rubric for writing Ballpark questions. Every candidate must pass all
of it. Written 2026-09-03 from analysis of the 327 questions already shipped.

Ballpark is not a trivia game. The player never types a number — they drag two
handles to trap the answer inside a range, and a narrower correct range scores
more. So the only question worth asking is one where **a thoughtful person who
does not know the fact can still reason their way to within a factor of two.**

The feeling we are aiming for, every single time:

> *"I don't know this exactly — but I can work out roughly where it lives."*

If a question does not produce that reaction, it does not ship, however
interesting the fact is.

---

## The eight rules

### 1. Estimable, not recallable
There must be a reasoning path from common knowledge to the neighbourhood of the
answer. A player should be able to think *"a cheetah is faster than a racehorse,
slower than a car on the motorway"* and land near 120 km/h.

**Fails:** "How many muscles are in an elephant's trunk?" — you either know it or
you don't, and no chain of reasoning gets you there. It was cut for this.

**The test:** write down the reasoning chain a smart non-expert would use. If you
can't, the question is memorisation wearing a slider.

### 2. One defensible number
If two reputable sources disagree by more than about 10%, cut it. Players will
check, and being scored wrong on a number you can defend from Wikipedia destroys
trust faster than any bug.

**Fails:** Cleopatra's 1963 production budget ($31M vs $44M across mainstream
sources). Cut. Blood vessel length in the human body (100,000 km traces to a
1920s estimate; modern figures are far lower). Cut.

**Note:** a *disputed popular figure* is fine if the dispute resolves to the same
measurement — the bamboo growth question survived a player challenge because
"91 cm/day" and the challenger's "4 cm/hour" are the same number.

### 3. The readout is the contract
Whatever the slider displays is what gets scored. This is enforced in code
(`quantizeRange`) and must never be reasoned around when authoring: don't write a
question whose answer needs more precision than the track can display. If the
track shows whole years, the answer is a whole year.

Violating this in v1.0.5 cost three players their trust and took a week to repair.

### 4. The answer sits away from the edges
At least 8% of track span from either end — enforced by `tools/assemble.js`, but
author for it. Choose `lo` and `hi` so the answer is *not* at the midpoint either:
a player who learns that the middle is usually right stops estimating.

Current shipped spread: 94 low / 125 middle / 108 high. Keep it that flat.

### 5. Pick the scale that matches the quantity
`log` when the plausible range spans more than about one order of magnitude
(speeds, populations, distances, counts). `linear` when it doesn't (years,
percentages, temperatures, small counts). A log question with a narrow range
wastes the track; a linear question spanning 1–1,000,000 makes every guess a
shrug.

### 6. The reveal earns the loss
Every question ends in a sentence worth knowing, and it must add something the
prompt didn't. "Stooky Bill" — the ventriloquist's dummy John Logie Baird
televised — is why a miss still feels like a good trade.

**Fails:** a reveal that restates the answer ("It grows 91 cm per day, which is
very fast"). If the reveal is not interesting, the question isn't either.

### 7. Culturally portable
No US-only sports, no imperial-native units, no brand recognition, no wordplay,
no US-centric geography, no currency figures that need local context. Half of one
recent week's players were Argentine.

This costs nothing to honour and widens the door. Metric throughout. Where a
figure is famously imperial, either convert cleanly or pick another fact.

### 8. Stable for years
Prefer facts that don't drift. Where a value does move, set `asOf` and choose
something that changes slowly. Never write a question whose answer needs
maintaining every quarter — we have no process for that and a stale answer is
indistinguishable from a wrong one.

---

## Estimability tags

Every question is tagged. `tools/rebalance.js` enforces the daily mix.

| Tag | Meaning | Target share |
|---|---|---|
| `gut` | Pure intuition; almost anyone can reason toward it | ~20% |
| `anchor` | Needs one known anchor point, then reasoning | ~70% |
| `lookup` | Know-it-or-don't. Rationed hard. | ≤10%, **max 1 per day** |

A day of five `lookup` questions is a quiz, not a ballpark. The current bank runs
62 gut / 235 anchor / 30 lookup, which is roughly the right shape.

---

## Craft notes

- **Prompt length: 31–109 characters in the shipped set.** Hard cap is 140.
  Shorter is better; it is read on a phone, once.
- **Ask for the unit in the prompt** ("...in km/h?", "...in what year?"). The
  player should never have to guess what the track measures.
- **Open with the interesting noun, not the question frame.** "Fastest bird ever
  clocked in a dive:" beats "What is the top speed of a peregrine falcon".
- **Surprise is the point.** The best questions have answers that are bigger or
  smaller than people expect. A question whose answer is exactly what everyone
  guesses is technically fine and emotionally worthless.
- **Vary the subject within a category.** Six speed questions in Nature is a
  pattern players will notice and exploit.

---

## Categories

Six, fixed. Each day serves one question from five different categories.

`nature` · `space` · `history` · `geography` · `everyday` · `culture`

`everyday` is the most valuable and the hardest to write well — kitchen-scale
quantities people have physical intuition for. `culture` must stay portable
(rule 7): film, music and art that travelled, not US television.

---

## Schema

```json
{
  "prompt":  "How fast can a cheetah sprint at full tilt, in km/h?",
  "answer":  120,
  "unit":    "km/h",
  "scale":   "log",
  "lo":      20,
  "hi":      400,
  "source":  "widely documented",
  "reveal":  "A cheetah hits 100 km/h in about three seconds...",
  "confidence": "high",
  "asOf":    null
}
```

`confidence` is `high` or `medium` and reflects source quality, not difficulty.
`asOf` is `null` for timeless facts, otherwise a year.

---

## The pipeline

1. **Generate** in per-category batches against this document.
2. **Validate** mechanically — `tools/assemble.js` checks bounds, log-scale
   validity, the 8% edge margin, prompt length, unit presence, exact-prompt
   dedupe.
3. **Adversarially fact-check** — a separate pass whose only job is to *disprove*
   the answer, returning `keep` / `fix` / `drop` verdicts. This is what caught the
   elephant-trunk and blood-vessel questions.
4. **Human review** — a skim of each batch for voice and interest, not facts.
5. **Assemble** — published days frozen, new days appended only.
6. **Monitor** — once per-question analytics land, questions with pathological
   miss rates get pulled from *future* scheduling. Never from a published day.

## The one inviolable rule

**A published day never changes.** Players have answers saved against its index,
the archive replays it, and `?d=` challenge links address it. `assemble.js`
refuses to build on drift and `tests/published-schedule.json` is the frozen
record. Append only.
