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

console.log(`${passed} tests passed${process.exitCode ? " (with failures)" : ""}`);
