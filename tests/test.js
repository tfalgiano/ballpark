/* Ballpark engine + content tests. Run: node tests/test.js */
"use strict";
const assert = require("node:assert");
const path = require("node:path");

global.window = {};
require(path.join(__dirname, "..", "puzzles.js"));
require(path.join(__dirname, "..", "app.js"));

const C = window.BALLPARK_CORE;
const DATA = window.BALLPARK_DATA;
let passed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; }
}

// ---------- value mapping ----------
const logQ = { scale: "log", lo: 10, hi: 1000, answer: 100 };
const linQ = { scale: "linear", lo: 1900, hi: 2000, answer: 1969 };

test("log mapping roundtrip", () => {
  for (const p of [0, 0.25, 0.5, 0.9, 1]) {
    assert.ok(Math.abs(C.valToPos(logQ, C.posToVal(logQ, p)) - p) < 1e-9, `p=${p}`);
  }
});
test("linear mapping roundtrip", () => {
  for (const p of [0, 0.3, 0.5, 1]) {
    assert.ok(Math.abs(C.valToPos(linQ, C.posToVal(linQ, p)) - p) < 1e-9, `p=${p}`);
  }
});
test("log midpoint is geometric mean", () => {
  assert.ok(Math.abs(C.posToVal(logQ, 0.5) - 100) < 1e-9);
});
test("snap stays inside bounds", () => {
  for (const q of [logQ, linQ]) {
    for (const p of [0, 0.001, 0.5, 0.999, 1]) {
      const s = C.snapVal(q, C.posToVal(q, p));
      assert.ok(s >= q.lo && s <= q.hi, `snap ${s} outside [${q.lo}, ${q.hi}]`);
    }
  }
});

// ---------- scoring ----------
test("hit is inclusive at both edges", () => {
  assert.ok(C.scoreAnswer(linQ, 1969, 1980).hit);
  assert.ok(C.scoreAnswer(linQ, 1950, 1969).hit);
  assert.ok(!C.scoreAnswer(linQ, 1970, 1990).hit);
});
test("miss scores zero", () => {
  assert.strictEqual(C.scoreAnswer(linQ, 1900, 1950).pts, 0);
});
test("narrower hit scores more", () => {
  const wide = C.scoreAnswer(linQ, 1910, 1990).pts;
  const mid = C.scoreAnswer(linQ, 1950, 1990).pts;
  const tight = C.scoreAnswer(linQ, 1965, 1975).pts;
  assert.ok(tight > mid && mid > wide, `${tight} > ${mid} > ${wide}`);
});
test("points bounded 15..100 on a hit", () => {
  for (const [lo, hi] of [[1900.5, 2000], [1968, 1970], [1969, 1969.5]]) {
    const a = C.scoreAnswer(linQ, lo, hi);
    assert.ok(a.hit && a.pts >= 15 && a.pts <= 100, `pts=${a.pts}`);
  }
});
test("emoji tiers", () => {
  assert.strictEqual(C.emojiFor({ hit: true, w: 0.1 }), "🟩");
  assert.strictEqual(C.emojiFor({ hit: true, w: 0.5 }), "🟨");
  assert.strictEqual(C.emojiFor({ hit: false, w: 0.1 }), "🟥");
});

// ---------- what-you-see-is-what-scores (player bug reports, Aug 2026) ----------
test("Vesuvius case: readout 79-87 must trap 79", () => {
  // player dragged until display showed 79; raw position was slightly above
  const q = { scale: "linear", lo: 0, hi: 500, answer: 79 };
  const pLo = C.valToPos(q, 79.4); // displays as 79
  const pHi = C.valToPos(q, 87.2); // displays as 87
  const r = C.quantizeRange(q, pLo, pHi);
  assert.strictEqual(r.lo, 79);
  assert.ok(C.scoreAnswer(q, r.lo, r.hi).hit, "79 must be inside 79-87");
});
test("Apollo case: readout 1969-1970 must trap 1969", () => {
  const q = { scale: "linear", lo: 1950, hi: 2020, answer: 1969 };
  const r = C.quantizeRange(q, C.valToPos(q, 1969.3), C.valToPos(q, 1969.8));
  assert.ok(r.lo <= 1969 && r.hi >= 1969, `range ${r.lo}-${r.hi} must contain 1969`);
  assert.ok(C.scoreAnswer(q, r.lo, r.hi).hit);
});
test("DNA case: pinched handles can never display x-x", () => {
  const q = { scale: "log", lo: 0.5, hi: 50, answer: 2 };
  const p = C.valToPos(q, 2.04);
  const r = C.quantizeRange(q, p, p + 0.001);
  assert.ok(r.hi > r.lo, `collapsed to ${r.lo}-${r.hi}`);
  assert.ok(C.scoreAnswer(q, r.lo, r.hi).hit, "2 must be inside " + r.lo + "-" + r.hi);
});
test("quantized range never collapses anywhere on any real question", () => {
  for (const [id, q] of Object.entries(DATA.questions)) {
    for (const p of [0, 0.1, 0.33, 0.5, 0.77, 0.98]) {
      const r = C.quantizeRange(q, p, Math.min(1, p + 0.02));
      assert.ok(r.hi > r.lo, `${id} at p=${p}: ${r.lo}-${r.hi}`);
      assert.ok(r.lo >= q.lo && r.hi <= q.hi, `${id} out of bounds`);
    }
  }
});
test("exact boundary counts as inside on both edges", () => {
  const q = { scale: "linear", lo: 0, hi: 100, answer: 30 };
  assert.ok(C.scoreAnswer(q, 30, 40).hit);
  assert.ok(C.scoreAnswer(q, 20, 30).hit);
  assert.ok(!C.scoreAnswer(q, 30.5, 40).hit);
});

// ---------- schedule ----------
test("epoch day is day 0 → puzzle #1", () => {
  const e = DATA.epoch.split("-").map(Number);
  assert.strictEqual(C.dayNumber(new Date(e[0], e[1] - 1, e[2])), 0);
  assert.strictEqual(C.dayNumber(new Date(e[0], e[1] - 1, e[2] + 1)), 1);
});
test("rotation wraps, never crashes", () => {
  for (const n of [0, 1, DATA.days.length - 1, DATA.days.length, DATA.days.length * 3 + 2]) {
    assert.strictEqual(C.puzzleForDay(n).length, 5);
  }
});

// ---------- pro codes ----------
test("generated codes validate, junk does not", () => {
  const { execFileSync } = require("node:child_process");
  const codes = execFileSync(process.execPath, [path.join(__dirname, "..", "tools", "make-code.js"), "5"]).toString().trim().split(/\r?\n/);
  for (const c of codes) assert.ok(C.validCode(c), `${c} should validate`);
  assert.ok(!C.validCode("BP-AAAA-AAAB"));
  assert.ok(!C.validCode("hunter2"));
});

// ---------- content pack ----------
test("every day references 5 real questions, no repeats within a day", () => {
  for (const day of DATA.days) {
    assert.strictEqual(day.length, 5);
    assert.strictEqual(new Set(day).size, 5);
    for (const id of day) assert.ok(DATA.questions[id], `missing question ${id}`);
  }
});
test("every question is well-formed with a fair margin", () => {
  for (const [id, q] of Object.entries(DATA.questions)) {
    assert.ok(q.lo < q.hi, `${id}: lo >= hi`);
    if (q.scale === "log") assert.ok(q.lo > 0, `${id}: log with lo <= 0`);
    const p = C.valToPos(q, q.answer);
    assert.ok(p >= 0.05 && p <= 0.95, `${id}: answer at ${(p * 100).toFixed(1)}% of track`);
    assert.ok(q.prompt && q.unit && q.reveal && q.source, `${id}: missing field`);
  }
});
test("no question repeats across consecutive-day pairs", () => {
  for (let i = 1; i < DATA.days.length; i++) {
    const prev = new Set(DATA.days[i - 1]);
    for (const id of DATA.days[i]) assert.ok(!prev.has(id), `${id} repeats on adjacent days`);
  }
});


// ---------- published-schedule immutability ----------
/* A published day has been played, sits in service-worker caches, and is
   addressed by index from state.history, the archive and ?d= challenge links.
   Re-dealing one silently repoints all three at different questions, so the
   schedule is frozen in tests/published-schedule.json and diffed here. */
const crypto = require("node:crypto");
const FROZEN = require("./published-schedule.json");
const hashPrompt = (s) => crypto.createHash("sha256").update(s, "utf8").digest("hex").slice(0, 12);

test("epoch never moves", () => {
  assert.strictEqual(DATA.epoch, FROZEN.epoch, "epoch changed - every past day would shift");
});
test("published days are never re-dealt", () => {
  assert.ok(DATA.days.length >= FROZEN.days.length,
    `pack shrank from ${FROZEN.days.length} to ${DATA.days.length} days`);
  for (let i = 0; i < FROZEN.days.length; i++) {
    assert.deepStrictEqual(DATA.days[i], FROZEN.days[i],
      `day index ${i} (puzzle #${i + 1}) changed
      was: ${FROZEN.days[i].join(", ")}
      now: ${(DATA.days[i] || []).join(", ")}`);
  }
});
test("published questions never change text", () => {
  for (const [id, want] of Object.entries(FROZEN.promptHashes)) {
    const q = DATA.questions[id];
    assert.ok(q, `${id} was scheduled on a published day but no longer exists`);
    assert.strictEqual(hashPrompt(q.prompt), want,
      `${id} prompt changed after publication: "${q.prompt}"`);
  }
});
test("appended days reuse no published question", () => {
  const published = new Set(FROZEN.days.flat());
  for (let i = FROZEN.days.length; i < DATA.days.length; i++) {
    for (const id of DATA.days[i]) {
      assert.ok(!published.has(id), `day ${i} reuses already-published question ${id}`);
    }
  }
});

// ---------- content runway alarm ----------
/* The schedule wraps with a modulo, so running out is silent: day N returns
   puzzle #1 wearing a new number. This test is the alarm that the cliff is
   approaching - if it fails, write questions. */
test("at least 21 days of unplayed content remain", () => {
  const now = new Date();
  const [y, m, d] = FROZEN.epoch.split("-").map(Number);
  const today = Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
    - Date.UTC(y, m - 1, d)) / 864e5);
  const remaining = DATA.days.length - today - 1;
  assert.ok(remaining >= 21,
    `only ${remaining} day(s) of content left (today is puzzle #${today + 1} of ${DATA.days.length}). ` +
    `On day ${DATA.days.length} the schedule wraps to puzzle #1 and every player replays it.`);
});


// ---------- unique-player instrumentation ----------
/* The whole value of the uniq/ namespace is that its counts are HEADCOUNTS.
   These tests defend that property: a milestone must never fire twice on one
   browser, however many puzzles that browser finishes. */
const fired = [];
window.goatcounter = { count: (o) => fired.push(o.path) };
const st = C._state();
function resetPlayer(source) {
  fired.length = 0;
  st.history = {}; st.maxStreak = 0;
  st.player = { id: "test", firstDay: null, cohort: "", source: source || "newsletter", milestones: {} };
}
function playDays(indices) {
  for (const d of indices) {
    st.history[d] = { done: true, answers: [], score: 300 };
    let streak = 0, k = d;
    while (st.history[k] && st.history[k].done) { streak++; k--; }
    if (streak > st.maxStreak) st.maxStreak = streak;
    C.recordDailyFinish(d, streak);
  }
}

test("streak buckets are stable and total", () => {
  const got = [0,1,2,3,4,5,7,8,14,15,30,31,900].map(C.streakBucket);
  assert.deepStrictEqual(got, ["1","1","2","3-4","3-4","5-7","5-7","8-14","8-14","15-30","15-30","31plus","31plus"]);
});

test("first-finish fires exactly once no matter how much you play", () => {
  resetPlayer();
  playDays([10,11,12,13,14,15,16,17,18,19,20]);
  const n = fired.filter((p) => p === "uniq/player-first-finish").length;
  assert.strictEqual(n, 1, `fired ${n} times — this metric would overcount people`);
});

test("every uniq/ path fires at most once per browser", () => {
  resetPlayer();
  playDays([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14]);
  const counts = {};
  for (const p of fired) if (p.startsWith("uniq/")) counts[p] = (counts[p] || 0) + 1;
  const repeats = Object.entries(counts).filter(([, n]) => n > 1);
  assert.strictEqual(repeats.length, 0, `repeated: ${JSON.stringify(repeats)}`);
});

test("evt/ paths DO repeat — they are event counts by design", () => {
  resetPlayer();
  playDays([0,1,2,3]);
  const evts = fired.filter((p) => p.startsWith("evt/finish-streak/"));
  assert.strictEqual(evts.length, 4, "one streak event per finish");
});

test("day milestones need DISTINCT days, not a long streak", () => {
  resetPlayer();
  playDays([5]);
  assert.ok(!fired.includes("uniq/days-played-2"), "one day cannot reach the 2-day milestone");
  playDays([6]);
  assert.ok(fired.includes("uniq/days-played-2"));
});

test("retention windows measure age since first play, not streak length", () => {
  resetPlayer();
  playDays([100]);            // first ever play
  assert.ok(!fired.includes("uniq/retained-d7"), "day one is not d7 retention");
  playDays([108]);            // came back 8 days later, streak broken
  assert.ok(fired.includes("uniq/retained-d7"), "a returner after 8 days IS d7-retained");
  assert.ok(!fired.includes("uniq/retained-d14"), "but not yet d14");
});

test("a gappy player still counts as retained (the old metric missed these)", () => {
  resetPlayer();
  playDays([200, 202, 204, 208]);   // never two consecutive days
  assert.strictEqual(st.maxStreak, 1, "no streak at all");
  assert.ok(fired.includes("uniq/retained-d7"), "event/returning-player would have scored this loyal player as zero");
  assert.ok(fired.includes("uniq/days-played-3"));
});

test("cohort and source tag the first finish and never change", () => {
  resetPlayer("reddit");
  playDays([15, 16, 30]);
  assert.ok(fired.includes("uniq/cohort/w2/new"), "day 15 is week 2");
  assert.ok(fired.includes("uniq/source/reddit/new"));
  assert.ok(fired.includes("uniq/source/reddit/d14"), "source must tag retention, not just arrival");
  assert.strictEqual(st.player.cohort, "w2");
  assert.strictEqual(fired.filter((p) => p.startsWith("uniq/cohort/") && p.endsWith("/new")).length, 1);
});

test("milestones survive a reload — they live in saved state", () => {
  resetPlayer();
  playDays([50, 51]);
  const before = fired.length;
  const saved = JSON.parse(JSON.stringify(st.player));
  st.player = saved;                 // simulate reload from localStorage
  playDays([52]);
  assert.ok(!fired.slice(before).includes("uniq/player-first-finish"), "reload must not re-fire first-finish");
  assert.ok(!fired.slice(before).includes("uniq/days-played-2"), "reload must not re-fire an earned milestone");
});

delete window.goatcounter;


// ---------- PWA attribution must not fork player state ----------
/* start_url now carries ?src=pwa. localStorage is scoped to the ORIGIN, not the
   URL, so a query parameter cannot create a second identity — but that is the
   failure mode that would look fine for weeks and then show every installed
   player as a brand new person, so it gets an explicit test. */
test("the state key is a constant, independent of any URL", () => {
  assert.strictEqual(C.STORE_KEY, "ballpark-state-v1");
  assert.ok(!/[?&=]/.test(C.STORE_KEY), "state key must not embed URL data");
});

test("initPlayer is idempotent — id and source survive repeat calls", () => {
  const st = C._state();
  st.player = { id: "", firstDay: null, cohort: "", source: "", milestones: {} };
  C.initPlayer();
  const id1 = st.player.id, src1 = st.player.source;
  assert.ok(id1, "first call must mint an id");
  C.initPlayer(); C.initPlayer();
  assert.strictEqual(st.player.id, id1, "a repeat launch must not mint a new player");
  assert.strictEqual(st.player.source, src1, "acquisition source must never be overwritten");
});

test("isStandalone never throws without a matchMedia implementation", () => {
  assert.strictEqual(typeof C.isStandalone(), "boolean");
});


// ---------- rename safety ----------
/* The adversarial question for a rebrand: what could make it look visually
   perfect while silently resetting or fragmenting player state? Answer: the
   brand string and the storage key are both the word "ballpark", and they are
   indistinguishable in a grep. Renaming the second one orphans every streak,
   history entry, cohort and one-shot milestone in existence, and the UI would
   look flawless while doing it. These tests exist so that can never ship. */

test("the storage key is NOT the brand and must never track it", () => {
  assert.strictEqual(C.STORE_KEY, "ballpark-state-v1",
    "STORE_KEY changed. Every existing player just lost their streak, history, " +
    "cohort and milestones, and the app looks completely fine. This is the single " +
    "most destructive edit available in this codebase.");
});

test("a pre-rename saved state still loads intact", () => {
  const st = C._state();
  const before = {
    id: st.player.id, cohort: st.player.cohort, source: st.player.source,
    milestones: Object.keys(st.player.milestones).length,
    days: C.distinctDaysPlayed(), maxStreak: st.maxStreak
  };
  // simulate what a returning player carries across the rebrand deploy
  st.player.id = "pre-rename-id";
  st.player.cohort = "w3";
  st.player.source = "newsletter";
  st.player.milestones = { "uniq/player-first-finish": 1, "uniq/days-played-7": 1 };
  st.history = { 10: { done: true, score: 300, answers: [] }, 11: { done: true, score: 320, answers: [] } };
  st.maxStreak = 2;
  const snapshot = JSON.parse(JSON.stringify(st.player));
  C.initPlayer();                       // the rebrand build boots
  assert.strictEqual(st.player.id, "pre-rename-id", "boot minted a new player id");
  assert.strictEqual(st.player.cohort, "w3", "cohort was reset");
  assert.strictEqual(st.player.source, "newsletter", "acquisition source was overwritten");
  assert.deepStrictEqual(st.player.milestones, snapshot.milestones, "milestones were disturbed");
  assert.strictEqual(C.distinctDaysPlayed(), 2, "history was lost");
  // restore
  st.player.id = before.id; st.player.cohort = before.cohort; st.player.source = before.source;
  st.history = {}; st.maxStreak = before.maxStreak; st.player.milestones = {};
});

test("a returning player does not re-fire first-finish after the rebrand", () => {
  const fired2 = [];
  window.goatcounter = { count: (o) => fired2.push(o.path) };
  const st = C._state();
  st.history = {}; st.maxStreak = 0;
  st.player = { id: "veteran", firstDay: 5, cohort: "w0", source: "direct",
    milestones: { "uniq/player-first-finish": 1, "uniq/days-played-2": 1 } };
  st.history[20] = { done: true, score: 300, answers: [] };
  C.recordDailyFinish(20, 1);
  assert.ok(!fired2.includes("uniq/player-first-finish"),
    "an existing player was counted as brand new after the rebrand");
  assert.strictEqual(st.player.cohort, "w0", "cohort moved");
  delete window.goatcounter;
  st.history = {}; st.player.milestones = {};
});

test("a perfect-day label cannot claim perfection on an empty day", () => {
  // 0 === 0 is true; a migrated day with no answers must not read as perfect
  const src = require("node:fs").readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  assert.ok(/rec.answers.length && hits === rec.answers.length/.test(src),
    "the perfect-day label is unguarded: an empty answers array reads as a perfect round");
});

console.log(`${passed} tests passed${process.exitCode ? " (with failures)" : ""}`);
