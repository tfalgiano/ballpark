/* Builds dist/ballpark.html — the whole game in one self-contained file.
   Used for the claude.ai artifact preview and handy as an "email it to a
   friend" build. Run: node tools/build-artifact.js */
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

const css = read("styles.css");
const puzzles = read("puzzles.js");
const app = read("app.js");
const iconSvg = read("icon.svg");
const iconData = "data:image/svg+xml;base64," + Buffer.from(iconSvg).toString("base64");

// only the literal sequence "</script" can end an inline <script> block early;
// escaping all "</" would corrupt regexes like /</g in the code itself
const inline = (js) => js.replace(/<\/script/gi, "<\\/script");

const html = `<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>Ballpark — the daily estimation game</title>
<link rel="icon" href="${iconData}">
<style>
${css}
</style>
<div id="app" class="app">
  <header class="topbar">
    <div class="wordmark" id="btn-home" role="button" tabindex="0" aria-label="Ballpark home">
      <span class="logo-brackets" aria-hidden="true">[<span class="logo-ball"></span>]</span>
      <span class="wordmark-text">BALLPARK</span>
      <span class="puzzle-no" id="puzzle-no"></span>
    </div>
    <nav class="topbar-actions">
      <button class="iconbtn" id="btn-streak" aria-label="Your streak"><span id="streak-flame">🔥</span><span class="streak-n" id="streak-n">0</span></button>
      <button class="iconbtn" id="btn-stats" aria-label="Statistics">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="2" y="10" width="4" height="8" rx="1.5" fill="currentColor"/><rect x="8" y="5" width="4" height="13" rx="1.5" fill="currentColor"/><rect x="14" y="2" width="4" height="16" rx="1.5" fill="currentColor"/></svg>
      </button>
      <button class="iconbtn" id="btn-help" aria-label="How to play">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="2"/><path d="M7.8 7.6c.2-1.1 1.1-1.9 2.3-1.9 1.3 0 2.3.9 2.3 2.1 0 1-.6 1.5-1.4 2-.7.5-1 .8-1 1.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/><circle cx="10" cy="14.4" r="1.1" fill="currentColor"/></svg>
      </button>
    </nav>
  </header>
  <main class="stage" id="stage"></main>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>
</div>
<script>window.BALLPARK_PRO_URL = "https://buy.stripe.com/9B66oAeBV3iK6wDdUmbo400";</script>
<script>
${inline(puzzles)}
</script>
<script>
${inline(app)}
</script>
`;

fs.mkdirSync(path.join(ROOT, "dist"), { recursive: true });
const out = path.join(ROOT, "dist", "ballpark.html");
fs.writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024).toFixed(0)} KB)`);
