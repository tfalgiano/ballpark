# Rename migration plan

**Nothing here is implemented. Nothing is approved. This is the plan only.**

The founder's instinct was right: the brand rename and the domain migration are
two separate decisions, and this document exists mostly to argue that they should
also be two separate *deployments*.

---

## The one fact that shapes everything

**`localStorage` is scoped to the origin.** Every streak, every day of history,
the anonymous player id, the acquisition source, the cohort, and every one-shot
`uniq/` milestone lives at `https://theballparkgame.com`. A new origin sees none
of it.

That has a consequence the scorecard never mentioned: **moving domains carelessly
would make every existing player look like a brand-new player.** They would
re-fire `uniq/player-first-finish`, land in a fresh cohort, lose their streak, and
silently corrupt the retention measurement that only began on 3 September. The
thing we just spent a week building would report a fake acquisition spike and a
fake retention collapse in the same week.

**The brand rename does not touch the origin. The domain migration is the entire
risk.** Everything below follows from separating them.

---

## Recommended sequence — phased

### Phase 0 — secure the names. No code.
Register the chosen domain plus defensive variants. Nothing deploys. Reversible
at the cost of a year's registration.

### Phase 1 — rebrand in place, on the existing origin.
`theballparkgame.com` keeps serving the game. Only strings change:

| Where | Change |
|---|---|
| `index.html` | `<title>`, OG/Twitter `og:title`, `og:site_name` |
| `index.html` | the `.wordmark-text` span |
| `manifest.webmanifest` | `name`, `short_name` |
| `app.js` | `shareGrid()` — the `"Ballpark #"` prefix |
| `og.png` | regenerate via `tools/make-og.ps1` |
| `sw.js` | bump `VERSION` (shell files changed) |
| `README`, `docs/` | prose |

**Explicitly NOT changed in phase 1:** `shareUrl()`, `CNAME`, the GoatCounter
endpoint, `robots.txt`, `sitemap.xml`, or `STORE_KEY`. Same origin, same state,
same service-worker scope, same installed PWAs, same analytics identity.

**Risk: near zero.** Every player keeps their streak and their history. No
migration code runs. If the name turns out to be wrong, phase 1 is a revert.

**Verify before proceeding:** existing streak survives a reload · installed PWA
still launches · `uniq/player-first-finish` does NOT re-fire for an existing
player · a challenge link still resolves · share text carries the new name.

### Phase 2 — stand the new origin up as a mirror.
New domain serves the same build. **Canonical stays on the old origin**: the new
origin carries `<link rel="canonical">` pointing at the old one, and is excluded
from `sitemap.xml`. Nobody is directed there yet. This exists purely to prove
DNS, TLS, Pages configuration and the service worker behave on the new host
before anything depends on them.

### Phase 3 — flip canonical, with the state bridge live.
The new origin becomes canonical. `shareUrl()` starts emitting the new domain, so
**new** challenge links point there. Old links keep working forever.

The bridge is the only genuinely new code, and it is small:

- On the **old** origin, a "Move my streak" action reads the saved state, encodes
  it, and navigates to `https://<new>/#import=<payload>`.
- On the **new** origin, boot checks for `#import=`. It adopts the payload **only
  if** the local state is empty or strictly poorer (fewer completed days), then
  immediately `history.replaceState`s the fragment away.
- A URL **fragment** is used deliberately: fragments are never sent to a server,
  so a player's history never leaves their machine even in transit.

**The payload must include `player.milestones`.** If it does not, every migrated
player re-fires `uniq/player-first-finish` and the retention series breaks — the
precise failure this whole sequence exists to avoid. It must also carry
`player.id`, `firstDay`, `cohort` and `source` so cohort retention stays
continuous across the move.

### Phase 4 — the old origin stays alive indefinitely.
Not a bare redirect. `theballparkgame.com` keeps serving a working game with a
one-time banner offering the move, because **an installed PWA cannot be
redirected** — its `start_url` is bound to the origin it was installed from.
Someone who installed the app in August has an icon that points at the old host
forever, and turning that into a 301 turns their game into a redirect loop with
no visible explanation.

Old URLs 301 for *organic* traffic only, after a long overlap window.

---

## The alternative: single cutover

Brand and domain change in one deploy, with the bridge live from minute one.

**Faster, and worse for one specific reason.** If retention moves in the
following week — up or down — there is no way to tell whether the name did it or
the migration did it. Two variables, one measurement, on a dataset that is nine
days old and is the only real product signal we have.

The phased sequence costs a few extra deploys and buys the ability to attribute.
Given that the entire current priority is *"are anonymous players actually coming
back?"*, spending the attribution to save two deploys is a bad trade.

**Single cutover would be right if** the new domain were needed immediately for a
launch, or if the old domain were being lost. Neither applies.

---

## Every moving part, and what happens to it

| Thing | Phase 1 (rebrand only) | Phase 3–4 (domain move) |
|---|---|---|
| `localStorage` state | Untouched — same origin | Carried by the bridge, or lost |
| Anonymous player id | Untouched | Must ride the bridge |
| `uniq/` milestones | Untouched | **Must** ride the bridge or the series breaks |
| Streaks and history | Untouched | Carried by the bridge |
| Cohort continuity | Untouched | Preserved via `player.cohort` |
| Service worker | New `VERSION`, same scope | New registration on the new origin |
| Cached puzzle pack | Re-fetched on version bump | Re-fetched on the new origin |
| Installed PWAs | Keep working, new label on reinstall | **Cannot be moved** — old origin must stay alive |
| Challenge links in the wild | Keep working | Keep working via 301, forever |
| The Hustle's link | Already 301s via github.io | Second hop added; still resolves |
| Cenital's link | Direct to old domain | 301 to new |
| GitHub Pages redirect | Unchanged | Second hop, tested |
| GoatCounter | Same site, same series | Same site — the endpoint is not the origin |
| `robots.txt` / `sitemap.xml` | Unchanged | Rewritten to the new canonical |
| `og.png` | Regenerated with new wordmark | URL updated |
| `shareUrl()` | Unchanged in phase 1 | Emits the new domain |

---

## What I would want to test before phase 3 ships

The bridge is the only part that can lose player data, so it gets the same
treatment as the schedule: assume it looks fine once and breaks later.

1. A player with a 12-day streak migrates and arrives with a 12-day streak.
2. A migrated player does **not** re-fire `uniq/player-first-finish`.
3. A player who already has richer state on the new origin is **not** overwritten
   by an older payload.
4. Importing twice is a no-op the second time.
5. A truncated or corrupted payload leaves existing state intact and fails quietly
   rather than clearing anything.
6. The fragment is gone from the URL afterwards, so a shared link never carries
   someone else's history.
7. An installed PWA on the old origin still launches and still plays.

Every one of these is a case where the failure is silent and the loss is
permanent, which is exactly the profile of the two bugs already caught this week
by running the build twice.
