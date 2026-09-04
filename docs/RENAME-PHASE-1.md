# Phase 1 — brand rename, prepared not deployed

**Ballpark → Halfsure, staying on `theballparkgame.com`.**

No origin change. No `localStorage` migration. No cohort reset. No redirect. Same
game, different name — the cleanest possible experiment.

**Status: NOT IMPLEMENTED. NOT DEPLOYED. Awaiting approval.**

---

## The thing that makes this more than a find-and-replace

Eight strings use **"ballpark" as a common noun meaning *one day's puzzle*.**

> "Play today's **ballpark**" · "Next **ballpark** in 4h 12m" · "Every past
> **ballpark**" · "New **ballpark** is ready" · "perfect **ballpark** 🎯" ·
> "Play your first **ballpark**" · "beat 340/500 on this **ballpark**"

That was a genuinely good piece of copywriting: the brand doubled as the unit of
play, so the name got repeated eight more times without ever feeling like
branding. **Halfsure cannot do that.** "Play today's halfsure" is not English.

So the rename needs a replacement noun, and that is a copy decision rather than a
substitution. Options considered:

| Candidate | Reads as |
|---|---|
| **puzzle** | "Play today's puzzle" · "Next puzzle in 4h 12m" · "Every past puzzle" |
| round | "Play today's round" — implies more than one per day, which is wrong |
| set | "Today's set" — accurate, slightly cold |
| five | "Today's five" — charming, but opaque on first encounter |

**Recommendation: `puzzle`.** It is the genre's own word, it is invisible, and it
never competes with the brand for attention. The cost is real and worth naming:
we lose eight free repetitions of the product name. That is the price of a brand
that is a *state* rather than an *object*, and it is the same property that makes
Halfsure worth having.

---

## MUST RENAME — player-facing brand

Sixteen changes. Every one is visible to a player.

**`index.html`**
| Line | Now | Becomes |
|---|---|---|
| 6 | `<title>Ballpark — the daily estimation game` | `Halfsure — the daily estimation game` |
| 10 | `og:title` | same string |
| 18 | `twitter:title` | same string |
| 30 | `aria-label="Ballpark home"` | `"Halfsure home"` |
| 32 | `<span class="wordmark-text">BALLPARK` | `HALFSURE` |

Both wordmarks are **eight characters**, so the topbar needs no layout work.

**`manifest.webmanifest`**
| Key | Becomes |
|---|---|
| `name` | `Halfsure — the daily estimation game` |
| `short_name` | `Halfsure` |

**`app.js`**
| Line | What it is |
|---|---|
| 550 | dispute mailto subject — `"Ballpark answer dispute"` |
| 580 | pre-launch notice — `"Ballpark opens on …"` |
| 659 | archive summary kicker — `"Ballpark #N · archive"` |
| 676 | archive share text — `"Ballpark #N — 340/500"` |
| 721 | **`shareGrid()`** — the share text everyone sees |
| 736 | `navigator.share({title: "Ballpark"})` |
| 768 | daily summary kicker — `"Ballpark #N · final"` |
| 1193 | redemption toast — `"Thanks for backing Ballpark ⚡"` |

**Assets**
- `tools/make-og.ps1` lines 32 and 40 draw `BALLPARK` into the share card.
  Regenerate `og.png`.
- **`icon.svg` needs no change.** The mark is pure geometry — `[ • ]` on tape
  yellow. The visual identity survives the rename intact, which also means the
  installed app icon does not change under people.

**Plus** the eight common-noun strings above, which take `puzzle`.

---

## MUST NOT RENAME — touching these breaks continuity

| Identifier | Where | What breaks |
|---|---|---|
| **`STORE_KEY = "ballpark-state-v1"`** | `app.js:12` | **Every player's state.** Streaks, history, player id, cohort, every `uniq/` milestone. It is a localStorage key, not a brand. Changing it orphans all of it and every existing player reappears as new. |
| **`playballpark.goatcounter.com/count`** | `index.html:65` | **The analytics series.** A new endpoint is a new site. The reliable retention data that began 3 September would end there and restart at zero. |
| `event/*`, `evt/*`, `uniq/*` paths | `app.js` | Series continuity. `uniq/player-first-finish` renamed is a new metric with no history. |
| Question ids (`nature28`, `culture99`) | `puzzles.js` | The published schedule. Positional and frozen. |
| `tests/published-schedule.json` day data | tests | The immutability record itself. |

The rule: **a string a player reads is brand; a string a machine matches on is an
identifier.** They look identical in a grep and must never be treated the same.

---

## Domain-dependent — Phase 2, deliberately NOT Phase 1

These mention the brand but resolve to the *domain*, so changing them now would
start the migration early and blur the experiment.

- `index.html:13` `og:url` → `https://theballparkgame.com/`
- `index.html:14` `og:image`, `:20` `twitter:image` → `.../og.png`
- **`app.js:745` `shareUrl()`** → returns `https://theballparkgame.com/`

Phase 1 ships with share links still pointing at the current domain. That is
correct: every link already in the wild keeps working, and nothing depends on a
domain that has not been bought.

---

## SHOULD RENAME — safe, cosmetic

Code comments, `README.md`, `LAUNCH.md`, `docs/*.md`, tool header comments. Zero
runtime effect. Do them in the same commit so the repo does not read as
half-migrated, but they carry no risk and block nothing.

`sw.js` cache prefix `ballpark-v1.6.0` **may** be renamed — the activate handler
deletes any key that is not the current `VERSION`, so old caches clean themselves
up. There is no benefit and a typo would cost a cache cycle. Leave it.

---

## One deletion worth making at the same time

`app.js:826–827` is the Product Hunt launch banner, date-gated to
**11 August 2026**. That condition can never be true again. It is dead code
carrying a stale brand string and a stale URL. Remove it.

---

## Verification before it is called done

Brand strings are easy; the risk is that something *identifier-shaped* moved with
them. Check in this order:

1. `grep -rn "allpark"` returns hits **only** in: `STORE_KEY`, the GoatCounter
   endpoint, the domain-dependent lines above, `puzzles.js`'s generated header,
   and historical docs. Anything else is a miss.
2. An existing player's **streak survives** a reload. This is the one that
   matters — it proves `STORE_KEY` was not touched.
3. `uniq/player-first-finish` **does not re-fire** for an existing player.
4. The installed PWA still launches and still plays.
5. A challenge link `?d=39&s=340` still resolves.
6. Share text carries the new name and the **old** domain.
7. `node tests/test.js` · `node tools/verify-pipeline.js` · rebuild `dist/`.
8. Bump `sw.js VERSION` — shell files changed.

---

## Annotating the change for the retention analysis

The rename must not contaminate the measurement that began 3 September. It will
not change player identity, but it *will* change what players see, so the
analysis needs to know when.

**Fire one event, once, on the first load after the rename ships:**

```
evt/brand/halfsure
```

One line, no new state, no identity. It appears in GoatCounter on exactly the day
the brand changed, so any later cohort comparison can split pre- and post-rename
without inferring the date from a commit log. Record the date in
`docs/ANALYTICS.md` next to the 3 September note.

**Do not** add a flag to player state. Nothing about a player changes; only the
paint does.
