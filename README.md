# [ • ] Ballpark — the daily estimation game

Five real-world questions a day. You don't guess the number — you **trap it** in a range.
Narrow range, big points. Wide and safe, fewer points. Miss entirely, zero.

It's the Wordle daily-ritual formula applied to interval estimation (the core skill of
calibration training from forecasting science). Streaks, emoji share grids, and a
self-improvement hook: *most people discover their gut is overconfident within a week.*

**Zero dependencies. Zero backend. Zero server cost.** One static folder, installable as
a PWA, wrappable for the app stores with Capacitor.

## Run it

```
node tests/test.js          # engine + content tests
npx serve .                 # or any static server; then open http://localhost:3000
```

(Opening `index.html` directly from disk also works — the service worker just stays off.)

## Project map

| Path | What it is |
|---|---|
| `index.html` / `styles.css` / `app.js` | The whole game |
| `puzzles.js` | Content pack — generated, don't hand-edit |
| `sw.js`, `manifest.webmanifest`, icons | PWA layer |
| `data/verified.json` | Raw authored questions + fact-check verdicts |
| `tools/assemble.js` | verdicts → validation → daily schedule → `puzzles.js` |
| `tools/make-icons.js` | Renders the PNG icons from scratch (no deps) |
| `tools/make-code.js` | Generates Pro unlock codes |
| `tools/build-artifact.js` | Bundles everything into `dist/ballpark.html` (single file) |
| `tests/test.js` | 15 tests: mapping, scoring, schedule, content integrity |
| `LAUNCH.md` | The go-to-market playbook |

## Deploy (free)

Push this folder to GitHub → enable Pages. Or drag the folder into Netlify / Cloudflare
Pages / Vercel. There is no build step. On deploy day: buy a domain (`.game` or `.day`
reads well), update `VERSION` in `sw.js` whenever you ship changes so clients refresh.

## How the daily puzzle works

`puzzles.js` holds ~300 verified questions arranged into daily sets of 5 (each from a
different category). Day number = local days since `epoch` (2026-07-27 = #1); the
schedule wraps when it runs out, and `tools/assemble.js` regenerates it deterministically
— same input, same schedule, so every player worldwide sees the same puzzle on the same
local date with no server.

Adding content later: append new authored questions to `data/verified.json` (same shape),
re-run `node tools/assemble.js`, bump `sw.js` VERSION, deploy. The network-first rule for
`puzzles.js` in the service worker means players get new content without reinstalling.

## Monetization — what's wired and what you must connect

Built and working today:

- **Free tier**: the daily puzzle, streaks, share grid, core stats. Never gate these —
  the daily ritual is the growth engine.
- **Practice mode**: 3 free rounds/day, then a Pro prompt. Pro = unlimited.
- **Pro gate** ($14 once, adjustable in `app.js`): unlocks unlimited practice + category
  breakdown stats. Unlock via redeem code — generate codes with `node tools/make-code.js`.

To start charging (one evening of work):

1. Create a **Stripe Payment Link** (or Gumroad product) for Ballpark Pro.
2. Set `window.BALLPARK_PRO_URL = "https://buy.stripe.com/..."` in a small script tag in
   `index.html` — the Pro button uses it automatically.
3. In Stripe/Gumroad's post-purchase email, include a code from `tools/make-code.js`.
   That's the whole fulfillment loop. (Client-side code validation is honor-system-grade
   — fine for launch; move to server-side licensing if revenue justifies it.)
4. Optional ads for free users: one banner slot under the summary screen is the accepted
   pattern in daily games. AdSense or, better for this audience, a direct sponsor line
   ("Today's ballpark brought to you by …"). Don't put ads inside the question flow.

## App stores later (Capacitor)

```
npm init -y && npm i @capacitor/core @capacitor/cli
npx cap init Ballpark com.yourdomain.ballpark --web-dir .
npx cap add ios && npx cap add android
```

The game is already touch-first, offline-capable, and safe-area aware, so the wrap is
mechanical. App-store monetization: keep web Pro, add a single non-consumable IAP that
sets the same `pro` flag. Wordle-class games historically convert best on iOS.

## Accuracy stance

Every question was authored and then adversarially fact-checked by a separate pass
(drop/fix/keep verdicts are preserved in `data/verified.json`). Point-in-time facts carry
an `asOf` label shown in-game. If a player disputes an answer: check the source note in
`puzzles.js`, correct in `data/verified.json`, re-assemble. Corrections are content
updates, not code changes.

## Trademark note

"Ballpark" is used by companies in other categories (invoicing software, a sports app).
Short-form game titles generally coexist, but before spending on branding, run a USPTO
TESS search for class 9/41 games and have a $300 trademark consult. Fallback names that
keep the mechanic-first identity: **Bracket**, **Trapline**, **Within**.
