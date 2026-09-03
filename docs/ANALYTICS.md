# Ballpark analytics

Backend is GoatCounter (cookieless, self-hosted `count.js`, no personal data, no
cross-site tracking). It counts **paths**. It has no concept of a person.

That single limitation caused the worst analytical error in this project's short
life, so the naming scheme now encodes the distinction explicitly.

## The two namespaces

| Prefix | Meaning | Can it be read as a headcount? |
|---|---|---|
| `evt/` | Something happened. Repeats freely. | **No. Never.** |
| `uniq/` | Fires at most once per browser, for all time. | **Yes.** That is the point. |

A `uniq/` path is guarded by a flag in the player's own saved state, so however
many puzzles that browser finishes, the path fires once. `tests/test.js` proves
this property and will fail if it is ever broken.

Legacy `event/` paths predate the scheme and are documented below.

---

## Reliable unique-player data begins **2026-09-03**

Everything before that date is event counts only. We can say how many puzzles
were finished; we **cannot** say how many people finished them, and no amount of
analysis will recover it — the information was never collected.

Do not backfill, estimate, or present a pre-September player count as if it were
measured. The honest statement for the launch-to-September period is:

> 1,405 puzzles were completed by somewhere between 9 and 337 distinct people.

That range is genuinely as tight as the data allows.

---

## Misleading metrics — audit of what already existed

**`event/returning-player` — the one that actually misled us.** Two independent
faults:

1. It fires on *every* finish where the streak is ≥ 2. One person on a 30-day
   streak fires it 29 times. Reading 337 of these as "337 returning players" was
   wrong by up to a factor of 37.
2. It only ever counted *consecutive*-day returns. A player who plays Monday,
   Wednesday and Friday every week for a month — a genuinely habitual player —
   fired it **zero times**. So it simultaneously overcounts people and undercounts
   loyalty.

It still fires, unchanged, so the series stays continuous back to launch. It is
now labelled in code as an event count. `uniq/retained-d*` is the honest version,
and a test specifically covers the gappy-player case the old metric missed.

**`event/started-daily`** fires when the player answers the *first question*, not
when they land. So "start rate" measured against visits is not what it looks
like: people who load the page and leave without answering are not counted as
starts. Real visit→finish is roughly 14%; the 78% figure is finishes ÷ starts,
which is a different and much narrower funnel.

**Page paths fragment.** `/` and `/ballpark` split across dozens of rows because
newsletter tracking parameters (`_hsenc`, `_hsmi`, `mc_cid`) and our own
`?d=&s=` challenge links each create a distinct path. Any single pageview row
badly understates real traffic; use the period total.

**`event/pro-view`** (no context suffix) came from `openPro` being passed
directly as a click handler, so the context argument was a DOM event rather than
a string. Removed along with the Pro store.

**GoatCounter's "visits" is itself de-duplicated per day** by a rotating hash, so
it is closer to daily unique devices than to raw pageviews. Do not add it across
days and call the result people.

---

## Current events

### `uniq/` — counts are people

| Path | Fires |
|---|---|
| `uniq/player-first-finish` | First ever completed daily. **This is the player count.** |
| `uniq/days-played-{2,3,5,7,14,30,60,100}` | Reached N *distinct* days completed |
| `uniq/best-streak-{3,7,14,30}` | Best streak first reached N |
| `uniq/retained-d{1,3,7,14,30}` | Still finishing puzzles N+ days after their first |
| `uniq/cohort/w{N}/new` | First finish, tagged by launch-week cohort |
| `uniq/cohort/w{N}/d{1,7,30}` | That cohort's retention |
| `uniq/source/{src}/new` | First finish, tagged by where they arrived from |
| `uniq/source/{src}/d{1,3,7,14,30}` | That source's retention |

`src` is one of: `newsletter`, `challenge`, `reddit`, `producthunt`, `search`,
`social`, `itch`, `code`, `pwa`, `direct`, `other`. Captured on the **first** visit and
never overwritten. `challenge` means they arrived on a link another player
shared — which is how we tell player-driven growth from publisher-driven growth.

### `evt/` — counts are events

| Path | Fires |
|---|---|
| `evt/finish-streak/{1,2,3-4,5-7,8-14,15-30,31plus}` | Every finish, bucketed by streak. Gives the live streak distribution. |
| `evt/entry-puzzle` | Landed on the daily and question 1 rendered |
| `evt/entry-summary` | Landed on the daily but had already finished it today |
| `evt/launch/standalone` | App opened from an installed PWA / home-screen icon |
| `evt/launch/browser` | App opened in a normal browser tab |

`evt/launch/standalone` + `evt/launch/browser` partition every app load, and
`evt/entry-puzzle` is the **real denominator** for the start rate. A raw pageview
is not an opportunity to play: a player who already finished today goes straight
to their summary, and so does every re-open of the installed PWA. Both were
sitting in the denominator and dragging the apparent start rate down.

### `event/` — legacy, kept for series continuity

`event/started-daily` · `event/finished-daily` · `event/returning-player` ·
`event/finished-archive` · `event/share-native` · `event/share-copy` ·
`event/pro-unlocked` · `event/js-error/{type}/{message}/{file-line}` ·
`event/ph-click`

---

## Questions this can now answer

- How many people play → `uniq/player-first-finish`
- New players per day → same path, grouped by day
- Do they come back → `uniq/retained-d1` ÷ `uniq/player-first-finish`, and so on
  through d3 / d7 / d14 / d30
- How deep does the habit go → the `uniq/days-played-*` ladder
- Streak distribution → `evt/finish-streak/*` for any period
- **Which traffic sources produce habits rather than clicks** →
  `uniq/source/{src}/d7` ÷ `uniq/source/{src}/new`

That last one is the question that would have answered the Cenital case in a day
instead of a month.

## Still not captured

- Per-question performance (hit rate, error distance, abandonment point). Nothing
  fires with a question id, so no content decision can currently cite evidence.
  Proposed: `evt/qmiss/{id}` on a missed question only — misses are the signal,
  hits are noise, and it would surface a disputed answer before a player emails.
- Time on task and where in a session people give up.
- Ad-blocker undercount rate. Uniform across paths, so ratios hold and absolute
  counts are floors.

## Privacy

The player id is generated on-device, stored in the player's own browser, and
**never transmitted** — it exists so distinct-day and streak maths survive a
reload. No cookies, no fingerprinting, no cross-site identifiers, no referrer
URLs or query strings in any event. What leaves the browser is a bucketed
counter and nothing else. Cohorts are week-wide and sources are coarse buckets,
so no event can single out an individual.
