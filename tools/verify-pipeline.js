/* Adversarial verification for the content pipeline.

   "The tests passed" is not sufficient evidence for a change that touches puzzle
   identity or scheduling. The bug that motivated this file looked completely
   healthy on its first run: a published-content bypass keyed on id occupancy
   instead of identity, which shifted 77 ids — but only on the SECOND build.
   A single successful build proves nothing about idempotency.

   Each check below asks the same question: what would have to be subtly wrong
   for this to look successful once while corrupting something later?

   Run: node tools/verify-pipeline.js
   MUST pass before committing any change to tools/assemble.js or data/. */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PUZZLES = path.join(ROOT, "puzzles.js");
const VERIFIED = path.join(ROOT, "data", "verified.json");
const AMEND = path.join(ROOT, "data", "schedule-amendments.json");

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`  ok    ${name}`);
  } catch (e) {
    failures++;
    console.error(`  FAIL  ${name}\n        ${e.message}`);
  }
}

function load(file) {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(file, "utf8"), sandbox);
  return sandbox.window.BALLPARK_DATA;
}
function build() {
  return execFileSync(process.execPath, [path.join(ROOT, "tools", "assemble.js")],
    { encoding: "utf8", cwd: ROOT });
}
function buildExpectingRefusal() {
  try {
    execFileSync(process.execPath, [path.join(ROOT, "tools", "assemble.js")],
      { encoding: "utf8", cwd: ROOT, stdio: "pipe" });
    return null;                      // built successfully — that is the failure
  } catch (e) {
    return (e.stderr || "") + (e.stdout || "");
  }
}
function todayIndex(epoch) {
  const e = epoch.split("-").map(Number);
  const n = new Date();
  return Math.floor((Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) -
    Date.UTC(e[0], e[1] - 1, e[2])) / 864e5);
}

// everything is restored in the finally block, whatever happens
const backup = {
  puzzles: fs.readFileSync(PUZZLES, "utf8"),
  verified: fs.readFileSync(VERIFIED, "utf8"),
  amend: fs.existsSync(AMEND) ? fs.readFileSync(AMEND, "utf8") : null,
};

console.log("content pipeline verification\n");
try {
  const baseline = load(PUZZLES);
  const today = todayIndex(baseline.epoch);
  console.log(`  (epoch ${baseline.epoch}, today is day index ${today}, ` +
    `${baseline.days.length} days scheduled)\n`);

  /* 1. Idempotency. The published pack is an INPUT to the build as well as its
        output, so a build can be stable on paper and still drift in practice. */
  check("two consecutive builds produce identical output", () => {
    build();
    const first = fs.readFileSync(PUZZLES, "utf8");
    build();
    const second = fs.readFileSync(PUZZLES, "utf8");
    if (first !== second) throw new Error("second build differs from the first — the build is not idempotent");
  });

  check("a third build still produces identical output", () => {
    const before = fs.readFileSync(PUZZLES, "utf8");
    build();
    if (fs.readFileSync(PUZZLES, "utf8") !== before) throw new Error("output drifted on the third run");
  });

  /* 2. Rejecting a candidate must not shift ids. IDs are positional, so a
        question dropped in the middle of a category would slide every later id
        onto a different prompt. This is the exact corruption that took 43 days
        with it the first time. */
  check("rejecting a NEW candidate cannot shift published ids", () => {
    const before = load(PUZZLES);
    const v = JSON.parse(backup.verified);
    // inject a candidate that hard-fails validation into the middle of a category
    const batch = v.find((b) => b.category === "culture");
    const mid = Math.floor(batch.questions.length / 2);
    batch.questions.splice(mid, 0, {
      prompt: "Deliberately invalid probe question for pipeline verification?",
      answer: 5, unit: "probe", scale: "linear", lo: 100, hi: 1,   // lo > hi: must be rejected
      source: "n/a", reveal: "n/a", confidence: "high", asOf: null,
    });
    fs.writeFileSync(VERIFIED, JSON.stringify(v, null, 1));
    const out = buildExpectingRefusal();
    if (out !== null) {
      // refusing is an acceptable outcome; the unacceptable one is silent drift
      fs.writeFileSync(VERIFIED, backup.verified);
      build();
      return;
    }
    const after = load(PUZZLES);
    fs.writeFileSync(VERIFIED, backup.verified);
    build();
    for (let i = 0; i <= Math.min(today, before.days.length - 1); i++) {
      if (before.days[i].join() !== after.days[i].join()) {
        throw new Error(`played day ${i} changed when an unrelated candidate was rejected`);
      }
    }
    for (const id of Object.keys(before.questions)) {
      if (after.questions[id] && after.questions[id].prompt !== before.questions[id].prompt) {
        throw new Error(`id ${id} slid onto a different prompt when a candidate was rejected`);
      }
    }
  });

  /* 3. Appending content must never disturb a played day. */
  check("appending a new category batch cannot alter any PLAYED puzzle", () => {
    const before = load(PUZZLES);
    const v = JSON.parse(backup.verified);
    v.push({
      category: "culture",
      categoryName: "Money, Tech & Pop Culture",
      questions: Array.from({ length: 6 }, (_, i) => ({
        prompt: `Pipeline probe question number ${i + 1}: how many probes?`,
        answer: 40 + i, unit: "probe", scale: "linear", lo: 0, hi: 100,
        source: "pipeline verification", reveal: "This question exists only inside a test.",
        confidence: "high", asOf: null,
      })),
      verdicts: [],
    });
    fs.writeFileSync(VERIFIED, JSON.stringify(v, null, 1));
    build();
    const after = load(PUZZLES);
    fs.writeFileSync(VERIFIED, backup.verified);
    build();
    if (after.days.length < before.days.length) throw new Error("appending content REMOVED days");
    for (let i = 0; i <= Math.min(today, before.days.length - 1); i++) {
      if (before.days[i].join() !== after.days[i].join()) {
        throw new Error(`played day ${i} (puzzle #${i + 1}) changed when new content was appended`);
      }
    }
  });

  /* 4. Editing a published prompt must fail loudly, not silently repoint a day. */
  check("editing a PUBLISHED prompt is refused, not applied", () => {
    const v = JSON.parse(backup.verified);
    v[0].questions[0].prompt = "Tampered published prompt for pipeline verification?";
    fs.writeFileSync(VERIFIED, JSON.stringify(v, null, 1));
    const out = buildExpectingRefusal();
    fs.writeFileSync(VERIFIED, backup.verified);
    build();
    if (out === null) throw new Error("build accepted an edit to an already-published prompt");
    if (!/drift|REFUSING/i.test(out)) throw new Error("build failed, but not with a drift refusal");
  });

  /* 5. An amendment aimed at a played day must be refused. This is the guard
        that separates "played is immutable" from "unplayed is amendable". */
  check("an amendment targeting a PLAYED day is refused", () => {
    const d = load(PUZZLES);
    const victimDay = Math.max(0, today - 1);
    fs.writeFileSync(AMEND, JSON.stringify([{
      dayIndex: victimDay,
      replace: d.days[victimDay][0],
      with: "does-not-matter",
      reason: "pipeline verification probe — must be refused",
    }], null, 1));
    const out = buildExpectingRefusal();
    fs.writeFileSync(AMEND, backup.amend === null ? "[]\n" : backup.amend);
    build();
    if (out === null) throw new Error(`build applied an amendment to played day ${victimDay}`);
    if (!/already played|immutable/i.test(out)) {
      throw new Error("build refused, but not because the day was already played");
    }
  });

  /* 6. An amendment must not be able to smuggle in a question from another
        category — a day has to keep five distinct categories. */
  check("a cross-category amendment is refused", () => {
    const d = load(PUZZLES);
    const futureDay = d.days.length - 1;
    if (futureDay <= today) throw new Error("no future day available to probe");
    const victim = d.days[futureDay][0];
    const victimCat = d.questions[victim].categoryName;
    const other = Object.keys(d.questions).find((id) =>
      d.questions[id].categoryName !== victimCat && !new Set(d.days.flat()).has(id));
    if (!other) { console.log("        (skipped: no unscheduled question in another category)"); return; }
    fs.writeFileSync(AMEND, JSON.stringify([{
      dayIndex: futureDay, replace: victim, with: other,
      reason: "pipeline verification probe — must be refused",
    }], null, 1));
    const out = buildExpectingRefusal();
    fs.writeFileSync(AMEND, backup.amend === null ? "[]\n" : backup.amend);
    build();
    if (out === null) throw new Error("build accepted a cross-category amendment");
  });

  /* 7. No question may appear on two days — the defect that started all this. */
  check("no question is scheduled on more than one day", () => {
    const d = load(PUZZLES);
    const seen = new Map();
    d.days.forEach((day, i) => day.forEach((id) => {
      if (seen.has(id)) throw new Error(`${id} appears on day ${seen.get(id)} and day ${i}`);
      seen.set(id, i);
    }));
  });

  /* 8. Two different questions must not carry the same answer to the same
        question — the Nintendo case, which no id-level check can see. */
  check("no two scheduled questions share a prompt", () => {
    const d = load(PUZZLES);
    const byPrompt = new Map();
    for (const id of d.days.flat()) {
      const key = d.questions[id].prompt.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (byPrompt.has(key)) throw new Error(`${id} and ${byPrompt.get(key)} have the same prompt`);
      byPrompt.set(key, id);
    }
  });
  /* 9. The check that would actually have caught Nintendo. Exact-prompt matching
        misses it: "Nintendo was founded — as a playing-card company — in what
        year?" and "In what year was Nintendo founded (as a playing-card
        company)?" are different strings, sit in different categories, and are
        the same question. Same answer + same unit + heavy word overlap is the
        signature, and it works across category boundaries where the per-batch
        fact-checkers cannot see. */
  check("no two scheduled questions are semantic duplicates", () => {
    const d = load(PUZZLES);
    const STOP = new Set(("the a an of in on at to for how many is are does do what which " +
      "with and or by its it about roughly up per one").split(" "));
    const tok = (s) => new Set(String(s).toLowerCase().replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
    const sim = (a, b) => {
      let hit = 0;
      for (const w of a) if (b.has(w)) hit++;
      return hit / (a.size + b.size - hit);
    };
    const items = d.days.flat().map((id) => ({ id, q: d.questions[id], t: tok(d.questions[id].prompt) }));
    const dupes = [];
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const A = items[i], B = items[j];
        if (A.q.unit !== B.q.unit) continue;
        const a = Math.abs(A.q.answer), b = Math.abs(B.q.answer);
        const sameAnswer = Math.max(a, b) === 0 ? true : Math.abs(a - b) / Math.max(a, b) <= 0.02;
        if (!sameAnswer) continue;
        if (sim(A.t, B.t) < 0.45) continue;
        dupes.push(`${A.id} "${A.q.prompt}"\n           ${B.id} "${B.q.prompt}"`);
      }
    }
    if (dupes.length) throw new Error(`${dupes.length} semantic duplicate pair(s):\n        ${dupes.join("\n        ")}`);
  });
} finally {
  fs.writeFileSync(PUZZLES, backup.puzzles);
  fs.writeFileSync(VERIFIED, backup.verified);
  if (backup.amend !== null) fs.writeFileSync(AMEND, backup.amend);
  else if (fs.existsSync(AMEND)) fs.unlinkSync(AMEND);
}

console.log(failures
  ? `\n${failures} pipeline check(s) FAILED`
  : "\nall pipeline checks passed");
process.exit(failures ? 1 : 0);
