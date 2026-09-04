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

## Further content generation — PARKED

174 scheduled days through **16 January 2027**, 135 of them unplayed. The
September cliff is two re-plannings behind us and the emergency is over.

Batch 2 cost 5.48M tokens at 19,796 per accepted question, against 7,853 in
batch 1. The quality improvements are real and are all kept — see
`docs/CONTENT-PIPELINE.md` — but the exact 99-agent shape is not proven to be the
permanent content factory, and running it again today would spend five million
tokens to solve a problem we no longer have.

**Reopen when:** the runway drops toward roughly 60 unplayed days, or a cheaper
architecture is worth testing on a deliberately small batch. The runway alarm in
`tests/test.js` fails at 21 days remaining — that is the backstop, not the plan.

**Not a reason to reopen:** having an idea for better questions, or the category
looking crowded. Neither is a content shortage.

---

## Tenaza as a replacement name — REJECTED

Not parked. Rejected, with reasons recorded so it is not reconsidered in six
months without new evidence.

Tenaza (Spanish for pincer — two jaws closing on a value) won naming round one.
It won on a brief **I wrote** that made Spanish/English bilingual performance a
near-requirement, which the evidence never supported: one Argentine newsletter
produced 192 puzzle starts and **zero returning-player events, lifetime**. When
that credit was withdrawn the name fell from 1st to 18th, 570 to 450.

**Why it fails on English merits alone:**

- **The metaphor is inaccessible without a footnote.** A monolingual English
  speaker cannot derive "pincers" from "Tenaza" by inspection, cognate or guess.
  The Latin *tenax* root linking it to "tenacious" is invisible unless taught.
  The whole conceptual case was load-bearing on the credit that was withdrawn.
- **It recreates the exact problem we are escaping.** Searching the correctly
  spelled "Tenaza app" returns **Tenaz** at position one — an 18+ crypto app with
  ~144,000 users that now contains a game — then Tanaza (Wi-Fi SaaS), Tanza, a
  perennial shrub, and hair-curling tongs. "Tenaza game" returns **Tenzi**, a
  competing dice game, with no Tenaza result on the page.
- **It regresses on the one axis where Ballpark actually wins.** "Ballpark" is
  unambiguously spellable the moment you hear it. Tenaza yields six plausible
  spellings from one hearing (Tenaza, Tanaza, Tenasa, Tenazza, Tennaza, Tinaza),
  two of which are live companies positioned to absorb the traffic.
- **It does not read as a game.** Across ~30 results from five queries, not one
  was a game; the word's commercial identity is Spanish seafood restaurants,
  because *tenaza* also means crab claw.

**The one real asset, recorded honestly:** the exact string is genuinely unowned
in tech and games, and a site could rank first for it within weeks. But that is
gated entirely behind correct spelling, and the gate is where the name breaks. An
empty results page you cannot route anyone to is not a distribution advantage.

**Reopen only if:** Spanish-speaking players become a demonstrated retained
cohort AND the Tenaz/Tanaza/Tenzi search occupation clears. Both, not either.

---

## Buying halfsure.com at $3,995 — DECLINED, with revisit conditions

Declined 2026-09-04. Recorded so the listing existing does not become a
recurring debate every time someone notices it.

**The decision was not** between owning the .com and a competitor owning it. The
brand query is vacant: no game, no app, no company, no repo anywhere on the
string. It was between ~$4,000 for a shorter URL and ~$11/yr for a clean
game-domain pattern. At this stage that is not worth $4,000.

Canonical is `playhalfsure.com`, with `halfsure.app` alongside. The game has
never owned `ballpark.com` either, and the exact .com was never the constraint —
three live rivals holding the same word was.

**The known cost, accepted consciously:** anyone who hears the name and types
`halfsure.com` lands on a GoDaddy sale page. That leak is real and permanent
until bought.

**Revisit if any of these becomes true:**

1. Direct/typed navigation becomes **measurable** and material — not assumed.
   Until there is a number, the leak is a guess.
2. Revenue makes ~$4,000 trivial rather than significant.
3. The seller materially drops the price, or the listing changes hands.
4. We begin investing materially in the brand — paid acquisition, an app-store
   listing, press outreach — where a split canonical string starts costing more
   than it saves.

**Not a reason to revisit:** noticing the listing again, or a marketing email
from the marketplace. Note the asymmetry honestly though — the price is likelier
to rise than fall once a live product sits on the name, because a dormant 2018
domain suddenly showing daily type-ins is the clearest buy-signal in domaining.
That is the cost of waiting, and it is accepted.

---

## Also parked, without further investigation

Ads · subscriptions · accounts and login · native apps · leaderboards ·
achievements · social profiles · multiplayer · aggressive SEO · major game
redesign.

The App Store is the one worth a note: the daily-game format genuinely fits it,
and the reopen condition is the same as for Pro — something has to convert first.
Porting an offer that converts at zero costs $99/yr plus 15% for the privilege of
learning the same thing again.
