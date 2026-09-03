/* Pre-merge quality gates for a generated content batch.

   assemble.js validates a question against mechanical rules one at a time. This
   checks the batch as a POPULATION — the properties you can only see in
   aggregate, and the ones that quietly ruin a daily game: answers drifting
   toward the midpoint until players learn to stop estimating, one category
   starving the schedule, sources that say "widely documented" and nothing else.

   Run it BEFORE appending a batch to data/verified.json.
   Run: node tools/check-batch.js <batch.json> */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const file = process.argv[2];
if (!file) {
  console.error("usage: node tools/check-batch.js <batch.json>");
  process.exit(2);
}

const raw = JSON.parse(fs.readFileSync(file, "utf8"));
const batches = raw.batches || raw;

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, "puzzles.js"), "utf8"), sandbox);
const LIVE = sandbox.window.BALLPARK_DATA;

let failures = 0, warnings = 0;
function fail(name, detail) { failures++; console.log(`  FAIL  ${name}\n        ${detail}`); }
function warn(name, detail) { warnings++; console.log(`  warn  ${name}\n        ${detail}`); }
function pass(name, detail) { console.log(`  ok    ${name}${detail ? `  (${detail})` : ""}`); }

/* survivors, with every verifier correction applied — this is what would
   actually ship, not what was drafted */
const survivors = [];
let identityProblems = 0;
for (const b of batches) {
  const byIndex = {};
  for (const v of b.verdicts || []) byIndex[v.index] = v;
  b.questions.forEach((q, i) => {
    const v = byIndex[i];
    if (v && v.prompt !== undefined && v.prompt !== q.prompt) { identityProblems++; return; }
    if (v && v.verdict === "drop") return;
    const x = { ...q, _cat: b.category };
    if (v && v.verdict === "fix") {
      if (v.correctedAnswer !== undefined) x.answer = v.correctedAnswer;
      if (v.correctedLo !== undefined) x.lo = v.correctedLo;
      if (v.correctedHi !== undefined) x.hi = v.correctedHi;
      if (v.correctedPrompt) x.prompt = v.correctedPrompt;
      if (v.correctedReveal) x.reveal = v.correctedReveal;
    }
    survivors.push(x);
  });
}

const posOf = (q) => q.scale === "log"
  ? Math.log(q.answer / q.lo) / Math.log(q.hi / q.lo)
  : (q.answer - q.lo) / (q.hi - q.lo);

console.log(`\nbatch quality gates — ${survivors.length} survivors from ${batches.reduce((s, b) => s + b.questions.length, 0)} candidates\n`);

// ---- identity -------------------------------------------------------------
if (identityProblems) fail("verdict identity", `${identityProblems} verdict(s) name a different prompt than the question at their index`);
else pass("verdict identity", "every verdict matches its question");

// ---- every verdict accounted for -----------------------------------------
{
  const missing = batches.reduce((s, b) => s + b.questions.filter((_, i) => !(b.verdicts || []).some((v) => v.index === i)).length, 0);
  if (missing) fail("verdict coverage", `${missing} candidate(s) were never given a verdict — they would ship unverified`);
  else pass("verdict coverage", "every candidate has a verdict");
}

// ---- corrections that do nothing ------------------------------------------
{
  const noop = batches.flatMap((b) => (b.verdicts || []).filter((v) =>
    v.verdict === "fix" && v.correctedAnswer === undefined && v.correctedLo === undefined &&
    v.correctedHi === undefined && !v.correctedPrompt && !v.correctedReveal));
  if (noop.length) fail("corrections are actionable",
    `${noop.length} "fix" verdict(s) carry no correction — the verifier saw a problem and nothing would change`);
  else pass("corrections are actionable");
}

// ---- range sanity ---------------------------------------------------------
{
  const bad = survivors.filter((q) => !(posOf(q) >= 0.08 && posOf(q) <= 0.92));
  if (bad.length) fail("answers sit away from the track edges",
    bad.slice(0, 5).map((q) => `${(posOf(q) * 100).toFixed(0)}% — ${q.prompt}`).join("\n        "));
  else pass("answers sit away from the track edges");
}

// ---- the midpoint must not be a tell --------------------------------------
{
  const mid = survivors.filter((q) => posOf(q) > 0.45 && posOf(q) < 0.55).length;
  const share = mid / survivors.length;
  const detail = `${mid} of ${survivors.length} (${(share * 100).toFixed(0)}%) sit within 45-55% of the track`;
  if (share > 0.18) fail("the midpoint is not a tell",
    `${detail} — a player who learns the answer is usually central stops estimating`);
  else if (share > 0.12) warn("the midpoint is not a tell", detail);
  else pass("the midpoint is not a tell", detail);
}

// ---- category balance -----------------------------------------------------
{
  const byCat = {};
  survivors.forEach((q) => { byCat[q._cat] = (byCat[q._cat] || 0) + 1; });
  const counts = Object.values(byCat);
  const detail = Object.entries(byCat).map(([k, v]) => `${k}=${v}`).join(" ");
  // a day needs 5 of the 6 categories, so the smallest category caps the schedule
  const spread = Math.max(...counts) / Math.min(...counts);
  if (spread > 2) fail("category balance", `${detail} — the smallest category starves the schedule`);
  else pass("category balance", detail);
}

// ---- estimability mix -----------------------------------------------------
{
  const byTag = {};
  survivors.forEach((q) => { byTag[q.tag || "untagged"] = (byTag[q.tag || "untagged"] || 0) + 1; });
  const lookup = (byTag.lookup || 0) / survivors.length;
  const detail = Object.entries(byTag).map(([k, v]) => `${k}=${v}`).join(" ");
  if (lookup > 0.15) fail("estimability mix", `${detail} — too many know-it-or-don't questions; this becomes a quiz`);
  else pass("estimability mix", detail);
}

// ---- source quality -------------------------------------------------------
{
  const vague = survivors.filter((q) => /^(widely documented|common knowledge|general|various|multiple sources)\.?$/i.test((q.source || "").trim()));
  if (vague.length > survivors.length * 0.15) {
    warn("sources name a real authority", `${vague.length} of ${survivors.length} give no checkable source`);
  } else pass("sources name a real authority", `${vague.length} vague of ${survivors.length}`);
}

// ---- drifting facts need asOf ---------------------------------------------
{
  /* A YEAR in the prompt anchors a fact rather than making it drift — "the 2022
     World Cup" is settled forever. What drifts is a present-tense reading with
     no anchor: "still survive today", "how many are there now". Matching bare
     years flagged five permanently-fixed questions and no real ones. */
  const drifty = survivors.filter((q) =>
    /\b(currently|nowadays|to date|so far)\b/i.test(q.prompt) ||
    /\b(today|now|current)\b(?![^?]*\b(19|20)\d\d\b)/i.test(q.prompt));
  if (drifty.filter((q)=>!q.asOf).length) warn("drifting facts carry asOf",
    `${drifty.length} time-sensitive prompt(s) have no asOf and will silently go stale:\n        ` +
    drifty.slice(0, 3).map((q) => q.prompt).join("\n        "));
  else pass("drifting facts carry asOf");
}

// ---- semantic duplicates, within the batch and against everything shipped --
{
  const STOP = new Set(("the a an of in on at to for how many is are does do what which " +
    "with and or by its it about roughly up per one").split(" "));
  const tok = (s) => new Set(String(s).toLowerCase().replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
  const sim = (a, b) => { let h = 0; for (const w of a) if (b.has(w)) h++; return h / (a.size + b.size - h); };
  const near = (a, b) => {
    const x = Math.abs(a), y = Math.abs(b);
    return Math.max(x, y) === 0 ? true : Math.abs(x - y) / Math.max(x, y) <= 0.1;
  };

  const mine = survivors.map((q) => ({ q, t: tok(q.prompt) }));
  const live = Object.keys(LIVE.questions).map((id) => ({ id, q: LIVE.questions[id], t: tok(LIVE.questions[id].prompt) }));

  const hitsLive = [];
  mine.forEach((m) => live.forEach((l) => {
    if (sim(m.t, l.t) >= 0.45 && l.q.unit === m.q.unit && near(m.q.answer, l.q.answer)) {
      hitsLive.push(`"${m.q.prompt}"\n          duplicates ${l.id} "${l.q.prompt}"`);
    }
  }));
  if (hitsLive.length) fail(`no duplicates of the ${live.length} shipped questions`, hitsLive.slice(0, 5).join("\n        "));
  else pass(`no duplicates of the ${live.length} shipped questions`);

  const hitsSelf = [];
  for (let i = 0; i < mine.length; i++) {
    for (let j = i + 1; j < mine.length; j++) {
      if (sim(mine[i].t, mine[j].t) >= 0.45 && mine[i].q.unit === mine[j].q.unit && near(mine[i].q.answer, mine[j].q.answer)) {
        hitsSelf.push(`"${mine[i].q.prompt}"\n          duplicates "${mine[j].q.prompt}"`);
      }
    }
  }
  if (hitsSelf.length) fail("no duplicates within the batch", hitsSelf.slice(0, 5).join("\n        "));
  else pass("no duplicates within the batch");
}

console.log(`\n${survivors.length} survivors = ~${Math.floor(survivors.length / 5)} new days`);
console.log(failures
  ? `\n${failures} gate(s) FAILED${warnings ? `, ${warnings} warning(s)` : ""} — do not merge`
  : `\nall gates passed${warnings ? ` (${warnings} warning(s))` : ""}`);
process.exit(failures ? 1 : 0);
