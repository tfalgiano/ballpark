# Ballpark — launch playbook

The honest frame first: nobody can guarantee a game makes money. What Ballpark has is the
one proven viral engine in casual gaming (daily ritual + emoji share grid + streaks), a
mechanic no mainstream product owns, and a cost structure of $0/month. That combination
means every experiment below is free to run and any one of them catching is pure upside.

## Why this can work (the thesis)

- **The mechanic is genuinely fresh.** Interval estimation ("give me a range you're 90%
  sure about") is the core exercise of calibration training — beloved in forecasting
  and rationalist circles, validated by decades of research (people are reliably
  overconfident), and never packaged as a polished consumer daily game. Closest
  neighbors: Wits & Wagers (board game), The Estimation Game (niche, monthly, academic).
  The daily-web-game lane is empty.
- **It has a hook trivia games don't**: you don't just learn facts, you learn *how wrong
  your gut is* — and watch yourself get better. "My trap rate went from 40% to 75%" is a
  shareable transformation story, not just a score.
- **Emoji grids are the acquisition channel.** 🟩🟨🟥 in a group chat is a question
  ("what's that?") — the same loop that took Wordle from 90 players to 2 million in two
  months, at $0 CAC.

## Week 0 — ship it

1. Deploy the folder (Netlify/Cloudflare Pages, free). Buy a domain: `ballpark.day`,
   `playballpark.com`, or similar (~$15/yr — likely your only cost).
2. Create the Stripe Payment Link for Pro ($14 once), set `BALLPARK_PRO_URL`, wire the
   post-purchase email with codes from `tools/make-code.js` (README has the steps).
3. Add a free privacy-friendly counter (GoatCounter/Plausible) so you can see the share
   loop working. No cookies banner needed if you stay cookieless.
4. Play it yourself for 3 days. Fix anything that annoys you. The daily ritual has to
   feel good on *your* phone first.

## Week 1–2 — seed the niches that already care

Go where calibration is already a loved idea; these communities evangelize hard:

- **Hacker News**: "Show HN: Ballpark – a daily game that measures how overconfident you
  are". The framing is the calibration angle, not "another Wordle." Post ~9am ET weekday.
- **Reddit**: r/webgames, r/InternetIsBeautiful (huge for exactly this), r/slatestarcodex
  and r/samharris (calibration angle), r/trivia.
- **The forecasting world**: Astral Codex Ten open threads, Metaculus/Manifold Discords,
  LessWrong. This crowd treats calibration as a virtue — a daily trainer is catnip, and
  they write newsletters.
- **TikTok/Shorts** (biggest upside, most effort): film the reveal moment — "everyone
  thinks they know how fast a cheetah is; watch the needle drop." The needle animation
  *is* the format.

Ask every early player one question: "did you share your grid?" If under ~15% do,
tighten the share moment before spending more effort on reach.

## The metrics that matter (in order)

1. **D1/D7 retention** — do people come back tomorrow? (This decides everything.)
2. **Share rate** — grids copied ÷ games finished.
3. **K-factor** — new players per sharing player. Above ~0.3 compounds nicely.
4. Pro conversion — expect 1–3% of *retained* players; ignore it until you have retention.

## Revenue paths, in realistic order

| Path | When | Notes |
|---|---|---|
| Pro ($14 once) | Day 1 | Already built. Zero marginal cost. |
| Direct sponsor line | ~5k DAU | "Today's ballpark brought to you by X" — daily games command strong CPMs because of ritual attention. One tasteful line, summary screen only. |
| App store wrap ($2.99 or IAP) | After web retention proven | Capacitor steps in README. Paid daily-game apps do convert once the habit exists on web. |
| B2B teams mode | Opportunistic | Forecasting/finance/consulting teams pay real money for calibration training (this is an actual corporate training category). A shared leaderboard + admin CSV is a weekend of work and a $49/mo SKU. |
| Acquisition | If it catches | NYT bought Wordle for low seven figures; LinkedIn, Netflix, and NYT are all actively buying daily games for their catalogs. |

## Content runway

65 days are loaded. The pipeline (author → adversarial fact-check → `assemble.js`) is
repeatable — run it monthly. Later, "community questions" (submit + vote) turns content
cost negative and deepens retention.

## Risks, named honestly

- **Discovery is the hard part.** The game is built; distribution is the actual work.
  Budget 10× more effort for seeding than you think reasonable.
- **A disputed answer in week one** is reputational damage in a game about being right.
  Mitigation is built (adversarial verification, `asOf` labels, sources on every card,
  correction workflow in README) — respond to disputes fast and publicly.
- **The name** may need a trademark check before serious branding spend (README has
  fallback names).
- **Cloning.** If it works, clones appear in weeks. The moat is the daily habit, the
  content pipeline, and your stats history — ship improvements weekly and own the niche
  communities before a clone can.
