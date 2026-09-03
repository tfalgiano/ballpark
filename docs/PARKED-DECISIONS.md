# Parked decisions

Things we investigated, decided against **for now**, and the specific evidence
that would reopen them. A parked decision is not a rejected one — it is one
waiting on a named signal. If none of the reopen conditions has fired, the
answer is still no and it does not need re-litigating.

Last reviewed: 2026-09-03.

---

## Arkadium distribution — PARKED

Arkadium runs a games arena with a developer programme: submit an existing game,
reach their audience, take a share of revenue. On the surface it is the only
concrete distribution channel we have found that requires no publisher
relationship. The terms do not survive reading.

**Why parked**

- **The 75% revenue share has no defined base for advertising.** The only place
  the site quantifies it captions it *"To developers for mtx in licensed games"*
  — microtransactions. Gross vs net after their ad stack is unpublished, as is
  any payout threshold or payment cadence.
- **The Developer Terms you must agree to is a dead link** —
  `developers.arkadium.com/terms-and-conditions/` returns HTTP 404. The document
  defining ownership, exclusivity, payout and termination is not public anywhere.
- **SDK integration is mandatory** before publication. Estimated port: **25–45
  developer hours**, plus ~2–4 h/month keeping a permanent fork in sync.
- **Ads are injected platform-side** — prerolls and banners, no published opt-out.
- **Offline PWA behaviour is structurally impossible** inside their iframe; the
  service worker and manifest are dropped, and installability goes with them.
- **No outside redirects**, which blocks `theballparkgame.com` share URLs. Since
  sharing is our only compounding growth loop, the channel would take players and
  return nothing.
- **Zero verifiable independent developer success stories.** No case studies on
  their own developer site. (Recorded as unconfirmed rather than proven negative —
  the community half of that research could not run.)

**Reopen if any of these becomes true**

1. The Developer Terms become publicly readable and define the advertising
   revenue base, the payout threshold and the exclusivity term.
2. Direct evidence appears of meaningful revenue for a *comparable* game — a
   simple daily web game from a solo developer, not a session-based casual title.
3. Integration stops requiring a permanent fork: an opt-out from injected ads, or
   any path that preserves offline play and outbound share links.
4. Ballpark reaches a scale where a walled audience is worth 25–45 hours and an
   ongoing maintenance tax — roughly, when organic growth has plateaued *and*
   retention is proven, so the engineering trade is against a known quantity.

**Not a reason to reopen:** a marketing email from them, a headline revenue-share
figure, or "it's only an hour to apply." The application is an hour; the
commitment it leads to is not.

---

## Spanish localisation — PARKED

Cenital (Argentina) drove ~650 visits, 192 puzzle starts and 142 finishes — and
**zero returning-player events, lifetime.** Traffic, not users.

**Reopen if:** Spanish-speaking countries produce **≥30 `uniq/retained-d7`
players in a 30-day window**, or a Spanish-language publisher asks for it
directly. The source/country instrumentation now answers this automatically; it
does not need another investigation.

Meanwhile, rule 7 of the Puzzle Standard keeps new questions culturally portable
at no cost, so the content stays translation-ready without translating anything.

---

## Consumer Pro / any paid tier — PARKED

71 people opened a Pro screen across the product's life. **One clicked buy, and
that was the maker's own test.** Zero organic purchases at $14 and at $6.99, so
price was never the objection. The store is closed; the payment path is dormant
but intact.

**Reopen if:** retention data shows a segment with genuine depth — say **≥100
players at `uniq/days-played-7`** — because a durable habit is the only
precondition under which asking for money is not simply friction. Even then, the
offer must be something that *compounds with* the daily habit, not something that
lets people bypass it. The archive failed because it fought the product.

---

## Publisher / B2B software — PARKED

The Hustle and Cenital both featured Ballpark unpitched, which is genuinely
unusual. But neither named it, The Hustle linked the stale github.io URL, and
**neither can buy** — The Hustle sells no sponsorships post-HubSpot, Cenital is
member-funded. Publishers with a games budget build in-house. The genre's
canonical directory lists 400+ daily games, so editors filling a recurring slot
are not supply-constrained.

**Reopen if:** Test A (the peer-developer base-rate survey) returns **2+ credible
accounts of a publisher actually paying an indie daily-game developer.** Below
that, the base rate is the answer.

**Build nothing either way until a publisher has asked to pay.** No dashboard, no
multi-tenancy, no billing.

---

## Also parked, without further investigation

Ads · subscriptions · accounts and login · native apps · leaderboards ·
achievements · social profiles · multiplayer · aggressive SEO · major game
redesign.

The App Store is the one worth a note: the daily-game format genuinely fits it,
and the reopen condition is the same as for Pro — something has to convert first.
Porting an offer that converts at zero costs $99/yr plus 15% for the privilege of
learning the same thing again.
