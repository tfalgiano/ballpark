/* Builds puzzles.js from the fact-checked content in data/verified.json.
   - applies verifier verdicts (fix / drop)
   - validates every question (bounds, margins, units, dedup)
   - PRESERVES every day already published, then appends new days from
     questions that have never been scheduled
   Run: node tools/assemble.js */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const EPOCH = "2026-07-27";
const MIN_MARGIN = 0.08; // answer must sit >=8% of track span from each edge
const PER_DAY = 5;

const batches = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "verified.json"), "utf8"));

/* The published pack is the source of truth for the schedule. Every day in it
   has either been played already or is sitting in a service-worker cache on
   somebody's phone, so re-dealing one would rewrite history: saved answers in
   state.history are keyed by day index, archive replays would show different
   questions than the player answered, and shared ?d=&s= challenge links would
   point at a puzzle the sender never saw. Days only ever get appended. */
function loadPublished() {
  const p = path.join(ROOT, "puzzles.js");
  if (!fs.existsSync(p)) return null;
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(p, "utf8"), sandbox);
  return sandbox.window.BALLPARK_DATA || null;
}

function valToPos(q, v) {
  return q.scale === "log" ? Math.log(v / q.lo) / Math.log(q.hi / q.lo) : (v - q.lo) / (q.hi - q.lo);
}

// deterministic PRNG so every rebuild yields the same schedule
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* near-duplicate detection helpers (see the check inside the batch loop) */
const STOPWORDS = new Set(("the a an of in on at to for how many is are does do what which " +
  "with and or by its it about roughly up per one").split(" "));
function tokens(s) {
  return new Set(String(s).toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w)));
}
function similarity(a, b) {
  let hit = 0;
  for (const w of a) if (b.has(w)) hit++;
  return hit / (a.size + b.size - hit);
}
const accepted = [];   // {prompt, tokens, unit, answer} for everything kept so far

/* Loaded before the batch loop: validation needs to know which ids are already
   published so it can leave them alone. */
const published = loadPublished();
const publishedIds = new Set(published ? published.days.flat() : []);
const questions = {};
const byCat = {};
const seenPrompts = new Set();
const report = { kept: 0, fixed: 0, dropped: 0, rejected: [] };

for (const batch of batches) {
  const verdictByIndex = {};
  for (const v of batch.verdicts || []) verdictByIndex[v.index] = v;
  byCat[batch.category] = byCat[batch.category] || [];

  batch.questions.forEach((q, i) => {
    const v = verdictByIndex[i];
    if (v && v.verdict === "drop") { report.dropped++; report.rejected.push([q.prompt, "verifier: " + v.note]); return; }
    if (v && v.verdict === "fix") {
      if (v.correctedAnswer !== undefined) q.answer = v.correctedAnswer;
      if (v.correctedLo !== undefined) q.lo = v.correctedLo;
      if (v.correctedHi !== undefined) q.hi = v.correctedHi;
      if (v.correctedPrompt) q.prompt = v.correctedPrompt;
      if (v.correctedReveal) q.reveal = v.correctedReveal;
      report.fixed++;
      /* A "fix" that carries no correction is a silent no-op: the verifier saw
         something wrong and nothing changed. The first content batch produced 11
         of these, every one a factually wrong reveal that would have shipped. */
      if (v.correctedAnswer === undefined && v.correctedLo === undefined &&
          v.correctedHi === undefined && !v.correctedPrompt && !v.correctedReveal) {
        report.dropped++;
        report.rejected.push([q.prompt, 'verifier said "fix" but supplied no correction: ' + (v.note || "")]);
        return;
      }
    }

    const key = q.prompt.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const t = tokens(q.prompt);

    /* IDs are positional, so the id has to be known BEFORE validation runs: a
       question that has already shipped keeps its id whatever a later rule says
       about it. Rejecting one retroactively would slide every later id in the
       category onto a different prompt and silently rewrite days people have
       played. New rules apply to new candidates only — published content is
       immutable, including its mistakes. */
    const id = batch.category + (byCat[batch.category].length + 1);
    /* Identity, not just occupancy. Asking only "does this id exist in the
       published pack" is wrong and silently non-idempotent: a question rejected
       on the previous run leaves its prospective id pointing at the NEXT
       question's published id, so it would bypass validation, take that id, and
       shift every later question in the category by one. The published prompt
       has to match this exact question. */
    const pub = published && published.questions[id];
    const isPublished = !!pub && pub.prompt === q.prompt;

    if (!isPublished) {
      // hard validation - anything failing is rejected, not repaired silently
      const problems = [];
      if (!(q.lo < q.hi)) problems.push("lo >= hi");
      if (q.scale === "log" && q.lo <= 0) problems.push("log scale with lo <= 0");
      if (typeof q.answer !== "number" || !isFinite(q.answer)) problems.push("bad answer");
      if (!problems.length) {
        const p = valToPos(q, q.answer);
        if (!(p >= MIN_MARGIN && p <= 1 - MIN_MARGIN)) problems.push(`answer at ${(p * 100).toFixed(0)}% of track (needs ${MIN_MARGIN * 100}% margin)`);
      }
      if (!q.prompt || q.prompt.length > 140) problems.push("prompt missing/too long");
      if (!q.unit) problems.push("no unit");
      if (seenPrompts.has(key)) problems.push("duplicate prompt");

      /* Exact-prompt matching misses the duplicates that actually happen. Batch 1
         produced ten pairs like "gives off body heat at about how many watts" vs
         "...at roughly how many watts" — different strings, same question. Word
         overlap alone cannot judge it, because "average temperature on Mars" and
         "...on Venus" overlap just as much and are entirely different questions.
         The discriminator is the ANSWER: near-identical wording AND a near-
         identical answer in the same unit. This still false-positives on a shared
         template with coincidentally close answers (Brazil and Australia have
         similar land areas), so it reports the match it objected to. */
      for (const prev of accepted) {
        if (similarity(t, prev.tokens) < 0.45) continue;
        if (prev.unit !== q.unit) continue;
        const a = Math.abs(q.answer), b = Math.abs(prev.answer);
        const close = Math.max(a, b) === 0 ? true : Math.abs(a - b) / Math.max(a, b) <= 0.1;
        if (close) { problems.push(`near-duplicate of "${prev.prompt}"`); break; }
      }

      if (problems.length) { report.dropped++; report.rejected.push([q.prompt, problems.join("; ")]); return; }
    }
    seenPrompts.add(key);
    questions[id] = {
      prompt: q.prompt, answer: q.answer, unit: q.unit, scale: q.scale,
      lo: q.lo, hi: q.hi, asOf: q.asOf || null,
      source: q.source, reveal: q.reveal, categoryName: batch.categoryName,
    };
    byCat[batch.category].push(id);
    accepted.push({ prompt: q.prompt, tokens: t, unit: q.unit, answer: q.answer });
    report.kept++;
  });
}

// answer-position spread check: the midpoint must not be a tell
const positions = Object.values(questions).map((q) => valToPos(q, q.answer));
const thirds = [0, 0, 0];
positions.forEach((p) => thirds[Math.min(2, Math.floor(p * 3))]++);
console.log(`answer position spread: low ${thirds[0]} / mid ${thirds[1]} / high ${thirds[2]}`);

/* ---- freeze the published schedule ---------------------------------- */
const frozenDays = published ? published.days.map((d) => d.slice()) : [];

if (published) {
  // IDs are positional (category + index), so a dropped or reordered question
  // silently shifts every later ID onto the wrong prompt. Refuse to build
  // rather than repoint a day that people have already played.
  const drift = [];
  for (const id of new Set(frozenDays.flat())) {
    const before = published.questions[id];
    const after = questions[id];
    if (!after) { drift.push(`${id}: no longer exists`); continue; }
    if (before && before.prompt !== after.prompt) {
      drift.push(`${id}: prompt changed\n      was: ${before.prompt}\n      now: ${after.prompt}`);
    }
  }
  if (drift.length) {
    console.error(`\nREFUSING TO BUILD - ${drift.length} published question id(s) drifted:\n`);
    for (const d of drift) console.error("  - " + d);
    console.error(
      "\nA published day would silently change question. Append new questions to the END\n" +
      "of a category in data/verified.json; never delete, reorder, or drop-verdict a\n" +
      "question that is already scheduled.\n");
    process.exit(1);
  }
  // carry forward anything later tooling embedded (e.g. rebalance.js tags)
  for (const id of Object.keys(questions)) {
    const prev = published.questions[id];
    if (prev && prev.tag && !questions[id].tag) questions[id].tag = prev.tag;
  }
}

/* ---- amendments to scheduled-but-UNPLAYED days ----------------------- */
/* Played content is immutable. Scheduled-but-unplayed content is amendable when
   a concrete defect is found — but only through an explicit, recorded, reviewed
   amendment, never as a side effect of a rebuild. Each entry names the exact
   day, the question leaving it and the question replacing it, so the change is
   reviewable in a diff instead of emerging from a shuffle. */
const retired = new Set();
const AMEND_PATH = path.join(ROOT, "data", "schedule-amendments.json");
const amendments = fs.existsSync(AMEND_PATH)
  ? JSON.parse(fs.readFileSync(AMEND_PATH, "utf8")) : [];

if (amendments.length) {
  const e = EPOCH.split("-").map(Number);
  const now = new Date();
  /* Today counts as PLAYED and is therefore off limits: the day rolls over on
     each player's own clock, so somewhere in UTC+14 today's puzzle was answered
     hours ago. Only strictly-future days can be amended. */
  const todayIndex = Math.floor(
    (Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) -
     Date.UTC(e[0], e[1] - 1, e[2])) / 864e5);
  const scheduled = new Set(frozenDays.flat());
  const refusals = [];

  for (const a of amendments) {
    const where = `day index ${a.dayIndex} (puzzle #${a.dayIndex + 1})`;
    if (!Number.isInteger(a.dayIndex)) { refusals.push(`${where}: dayIndex is not an integer`); continue; }
    if (a.dayIndex <= todayIndex) {
      refusals.push(`${where}: already played (today is index ${todayIndex}). Played days are immutable.`);
      continue;
    }
    const day = frozenDays[a.dayIndex];
    if (!day) { refusals.push(`${where}: no such day in the pack`); continue; }
    if (!questions[a.with]) { refusals.push(`${where}: replacement ${a.with} is not a known question`); continue; }

    /* An amendment is a standing statement about what a day should contain, not
       a one-shot transition. Once applied it is baked into puzzles.js, which is
       an INPUT to the next build — so a build that only knows how to apply
       "swap A for B" refuses forever after the first success. Re-applying has
       to be a no-op, and the retirement still has to register or the replaced
       question gets re-dealt onto a future day. */
    const pos = day.indexOf(a.replace);
    if (pos < 0) {
      if (day.indexOf(a.with) >= 0) {
        if (a.retire) retired.add(a.replace);
        continue;                                  // already applied
      }
      refusals.push(`${where}: contains neither ${a.replace} nor ${a.with}`);
      continue;
    }
    if (scheduled.has(a.with)) { refusals.push(`${where}: replacement ${a.with} is already scheduled elsewhere`); continue; }
    if (questions[a.with].categoryName !== questions[a.replace].categoryName) {
      refusals.push(`${where}: ${a.with} is ${questions[a.with].categoryName} but ${a.replace} is ${questions[a.replace].categoryName}; a day must keep five distinct categories`);
      continue;
    }
    day[pos] = a.with;
    scheduled.delete(a.replace);
    scheduled.add(a.with);
    // a retired question is defective, not merely displaced — never re-deal it
    if (a.retire) retired.add(a.replace);
    console.log(`amended ${where}: ${a.replace} -> ${a.with}${a.retire ? " (retiring " + a.replace + ")" : ""}`);
  }

  if (refusals.length) {
    console.error(`\nREFUSING TO BUILD - ${refusals.length} invalid schedule amendment(s):\n`);
    for (const r of refusals) console.error("  - " + r);
    console.error("\nAmendments may only touch days that have NOT been played, and must name a\n" +
      "question the day actually contains.\n");
    process.exit(1);
  }
}

const used = new Set(frozenDays.flat());

/* ---- deal NEW days from questions that have never been scheduled ----- */
const rng = mulberry32(20260727);
const decks = Object.entries(byCat)
  .map(([cat, ids]) => {
    const d = ids.filter((id) => !used.has(id) && !retired.has(id));
    for (let i = d.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [d[i], d[j]] = [d[j], d[i]];
    }
    return { cat, ids: d, cursor: 0 };
  })
  .filter((d) => d.ids.length > 0);

const newDays = [];
while (true) {
  // pick the categories with the most remaining questions (keeps sets diverse to the end)
  const avail = decks.filter((d) => d.cursor < d.ids.length)
    .sort((a, b) => (b.ids.length - b.cursor) - (a.ids.length - a.cursor));
  if (avail.length < PER_DAY) break;
  const day = avail.slice(0, PER_DAY).map((d) => d.ids[d.cursor++]);
  for (let i = day.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [day[i], day[j]] = [day[j], day[i]];
  }
  newDays.push(day);
}

const days = frozenDays.concat(newDays);

// sanity: no question may appear on two different days
const allIds = days.flat();
if (new Set(allIds).size !== allIds.length) {
  console.error("REFUSING TO BUILD - a question is scheduled on more than one day");
  process.exit(1);
}

const out =
  `/* Ballpark content pack - generated by tools/assemble.js. Do not hand-edit.\n` +
  `   ${report.kept} verified questions · ${days.length} days of puzzles. */\n` +
  `window.BALLPARK_DATA = ${JSON.stringify({ epoch: EPOCH, questions, days }, null, 1)};\n`;
fs.writeFileSync(path.join(ROOT, "puzzles.js"), out);

const spare = report.kept - allIds.length;
console.log(`kept ${report.kept} (${report.fixed} fixed), dropped ${report.dropped}`);
console.log(`days: ${frozenDays.length} frozen + ${newDays.length} new = ${days.length}`);
console.log(`${spare} question(s) banked but unscheduled (need ${PER_DAY} across 5 categories to form a day)`);
if (report.rejected.length) {
  console.log("\nrejected:");
  for (const [p, why] of report.rejected) console.log(`  - ${p}\n      ${why}`);
}
