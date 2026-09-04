# Release A — review before merge

Branch `rename/halfsure-release-a`. **Not merged.** Pages serves `main`, which
still says Ballpark.

Brand only, same origin. **8 files.** Everything below is the complete surface.

---

## 1. Player-visible changes

**The name, in 16 places.** Browser tab · OG and Twitter titles · the topbar
wordmark (`BALLPARK` → `HALFSURE`, both 8 characters, no layout change) · the
wordmark's accessibility label · installed-app name and short name · the dispute
email subject · the pre-launch notice · the daily summary kicker · the archive
kicker · the archive share text · **the share text everyone sees** · the native
share-sheet title · the code-redemption toast · the OG card graphic.

**Eight strings where "ballpark" was a common noun, not the brand.** These now
say **puzzle**, because Halfsure is not a noun:

| Was | Now |
|---|---|
| Play today's ballpark | Play today's **puzzle** |
| Next ballpark in 4h 12m | Next **puzzle** in 4h 12m |
| New ballpark is ready — play #40 | New **puzzle** is ready — play #40 |
| Every past ballpark | Every past **puzzle** |
| Play your first ballpark to start the record | Play your first **puzzle** … |
| beat 340/500 on this ballpark | beat 340/500 on this **puzzle** |
| — perfect ballpark 🎯 | — perfect **round** 🎯 |

**A share now reads:**

```
Halfsure #39 — 340/500
🟩🟨🟥🟩🟨  🔥5
Beat me: https://theballparkgame.com/?d=39&s=340
```

The link still points at the current domain. That is deliberate — it is a
*domain* string and belongs to Release B.

**The icon does not change.** It is pure geometry, so no home-screen icon shifts
under anyone.

**Tagline unchanged:** "the daily estimation game". One variable.

---

## 2. Persistence-sensitive, intentionally unchanged

These are the ones that would make a rename look perfect while destroying
something. Each is a string containing the word *ballpark* that is **not** brand.

| Identifier | Left as | If it changed |
|---|---|---|
| `STORE_KEY` | `"ballpark-state-v1"` | Every streak, history entry, player id, cohort and milestone orphaned — and the UI looks flawless. The single most destructive edit available here. |
| GoatCounter endpoint | `playballpark.goatcounter.com` | A new endpoint is a new site. The retention series that began 3 Sept ends and restarts at zero. |
| `window.BALLPARK_DATA` | unchanged | The global the content pack defines. |
| `window.BALLPARK_CORE` | unchanged | The test export surface. |
| `window.BALLPARK_PRO_*` | unchanged | Dormant Stripe config; issued codes still redeem. |
| All `event/`, `evt/`, `uniq/` paths | unchanged | Series continuity. A renamed metric has no history. |
| Question ids, `state.history` schema, `player` shape | unchanged | No migration, so nothing to migrate. |
| `og:url`, `og:image`, `shareUrl()` | still the old domain | Domain strings — Release B. |

**One addition, not a rename:** `once("uniq/brand-halfsure")` fires a single
event on the first load after deploy, dating the rebrand in the analytics. It
writes one milestone flag and touches no identity. It exists so a later cohort
comparison can split pre- and post-rename without inferring the date from a
commit log.

`sw.js` VERSION goes `v1.6.0` → `v1.7.0`. The cache *prefix* stays `ballpark-`
deliberately: renaming it gains nothing and a typo costs a cache cycle.

---

## 3. Incidental bug fixes

**The `0 of 0` perfect-round claim — two sites, not one.**

`hits === rec.answers.length` is `0 === 0` for a day with no answers, so such a
day reads as perfect. Unreachable today; Release B's migration makes it
reachable. Both lines had to be edited for the rename anyway.

- **Summary label** — would have shown *"0 of 0 trapped — perfect round 🎯"*.
- **Share text** — would have shared *"Halfsure #39 — 340/500 🎯"*, putting a
  false perfect-round claim into a message sent to other people. **This is the
  worse one, and I missed it on the first pass** — it only surfaced while
  writing this summary. The test now asserts *both* guards are present by count,
  because a test that passed on one of two instances is exactly how the second
  survived.

**Expired Product Hunt banner removed.** Date-gated to 11 August 2026; the
condition can never be true again. Nine lines of dead code carrying a stale
brand string and a stale URL.

---

## Verification

- **41 tests pass**, including four new rename-safety tests.
- The `STORE_KEY` guard was **proven to bite** — renaming it to
  `halfsure-state-v1` fails the suite immediately.
- A test loads a realistic pre-rename state (id, cohort, source, milestones,
  history), boots the rebrand build, and asserts every field survives.
- A test proves a returning player does **not** re-fire
  `uniq/player-first-finish`.
- **12/12 pipeline checks pass.** `og.png` regenerated. `dist/` rebuilt.

## Merge is blocked on

1. Halfsure passes the human spelling test at ≥14/20.
2. Your explicit approval of this diff.

Nothing else in this branch. No unrelated cleanup was added.
