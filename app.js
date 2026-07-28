/* ============================================================
   BALLPARK — game engine
   Fully client-side. State lives in localStorage. Daily puzzle
   is picked deterministically from the local date.
   ============================================================ */
(function () {
  "use strict";

  var DATA = window.BALLPARK_DATA;
  var MIN_GAP = 0.02;          // minimum handle separation, in track space
  var NARROW_W = 0.25;         // hit at or under this width earns a green square
  var STORE_KEY = "ballpark-state-v1";
  var FREE_PRACTICE_PER_DAY = 3;

  // ---------- state ----------
  function loadState() {
    try {
      var s = JSON.parse(localStorage.getItem(STORE_KEY));
      if (s && s.v === 1) return s;
    } catch (e) {}
    return { v: 1, seenTutorial: false, pro: false, history: {}, maxStreak: 0, practice: { date: "", used: 0 } };
  }
  function saveState() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {} }
  var HAS_DOM = typeof document !== "undefined";
  var state = loadState();

  // ---------- dates ----------
  function epochParts() {
    var m = DATA.epoch.split("-");
    return [+m[0], +m[1] - 1, +m[2]];
  }
  function dayNumber(d) {
    d = d || new Date();
    var e = epochParts();
    var a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    var b = Date.UTC(e[0], e[1], e[2]);
    return Math.floor((a - b) / 864e5);
  }
  function puzzleForDay(n) {
    var len = DATA.days.length;
    var i = ((n % len) + len) % len;
    return DATA.days[i];
  }

  // ---------- value mapping ----------
  function posToVal(q, p) {
    return q.scale === "log" ? q.lo * Math.pow(q.hi / q.lo, p) : q.lo + p * (q.hi - q.lo);
  }
  function valToPos(q, v) {
    return q.scale === "log" ? Math.log(v / q.lo) / Math.log(q.hi / q.lo) : (v - q.lo) / (q.hi - q.lo);
  }
  function snapVal(q, v) {
    var s;
    if (q.scale === "linear") {
      var span = q.hi - q.lo;
      var step = span > 4000 ? 10 : span > 400 ? 1 : span > 40 ? 1 : span > 4 ? 0.5 : 0.1;
      s = Math.round(v / step) * step;
    } else {
      // 2 significant figures reads like an instrument, not a spreadsheet
      if (v === 0) return 0;
      var mag = Math.pow(10, Math.floor(Math.log10(Math.abs(v))) - 1);
      s = Math.round(v / mag) * mag;
    }
    return Math.min(q.hi, Math.max(q.lo, +s.toPrecision(12)));
  }
  function fmtVal(q, v) {
    var abs = Math.abs(v);
    var str;
    if (abs >= 1e6) str = (v / 1e6).toPrecision(3).replace(/\.?0+$/, "") + "M";
    else if (abs >= 10000) str = Math.round(v).toLocaleString("en-US");
    else if (abs >= 100 || v === Math.round(v)) str = Math.round(v).toLocaleString("en-US");
    else if (abs >= 1) str = (+v.toPrecision(3)).toString();
    else str = (+v.toPrecision(2)).toString();
    return str;
  }

  // ---------- scoring ----------
  function scoreAnswer(q, vLo, vHi) {
    var hit = q.answer >= vLo && q.answer <= vHi;
    var w = valToPos(q, vHi) - valToPos(q, vLo);
    var pts = hit ? Math.round(15 + 85 * Math.pow(1 - w, 1.4)) : 0;
    return { hit: hit, w: w, pts: pts };
  }
  function emojiFor(a) { return a.hit ? (a.w <= NARROW_W ? "🟩" : "🟨") : "🟥"; }

  // ---------- streaks ----------
  function currentStreak() {
    var n = dayNumber();
    var streak = 0;
    var d = state.history[n] && state.history[n].done ? n : n - 1;
    while (d >= 0 && state.history[d] && state.history[d].done) { streak++; d--; }
    return streak;
  }

  // ---------- DOM helpers ----------
  var stage = HAS_DOM ? document.getElementById("stage") : null;
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function toast(msg) {
    var t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove("show"); }, 2200);
  }

  // ---------- tape slider component ----------
  function TapeSlider(q, onChange) {
    var pLo = 0.3, pHi = 0.7, locked = false, active = null;

    var wrap = el("div", "tape-wrap");
    var tape = el("div", "tape");
    var fill = el("div", "tape-fill");
    var hLo = el("div", "handle", "[");
    var hHi = el("div", "handle", "]");
    hLo.setAttribute("role", "slider"); hHi.setAttribute("role", "slider");
    hLo.setAttribute("tabindex", "0"); hHi.setAttribute("tabindex", "0");
    hLo.setAttribute("aria-label", "Lower bound"); hHi.setAttribute("aria-label", "Upper bound");
    tape.appendChild(fill); tape.appendChild(hLo); tape.appendChild(hHi);
    wrap.appendChild(tape);

    var labels = el("div", "tape-labels");
    labels.appendChild(el("span", "", esc(fmtVal(q, q.lo))));
    labels.appendChild(el("span", "", esc(fmtVal(q, snapVal(q, posToVal(q, 0.5))))));
    labels.appendChild(el("span", "", esc(fmtVal(q, q.hi))));
    wrap.appendChild(labels);

    function values() {
      return { lo: snapVal(q, posToVal(q, pLo)), hi: snapVal(q, posToVal(q, pHi)) };
    }
    function paint() {
      hLo.style.left = (pLo * 100) + "%";
      hHi.style.left = (pHi * 100) + "%";
      fill.style.left = (pLo * 100) + "%";
      fill.style.right = ((1 - pHi) * 100) + "%";
      var v = values();
      hLo.setAttribute("aria-valuemin", q.lo); hLo.setAttribute("aria-valuemax", q.hi);
      hHi.setAttribute("aria-valuemin", q.lo); hHi.setAttribute("aria-valuemax", q.hi);
      hLo.setAttribute("aria-valuenow", v.lo); hLo.setAttribute("aria-valuetext", fmtVal(q, v.lo) + " " + q.unit);
      hHi.setAttribute("aria-valuenow", v.hi); hHi.setAttribute("aria-valuetext", fmtVal(q, v.hi) + " " + q.unit);
      onChange(v.lo, v.hi);
    }
    function setP(which, p) {
      if (which === "lo") pLo = Math.max(0, Math.min(p, pHi - MIN_GAP));
      else pHi = Math.min(1, Math.max(p, pLo + MIN_GAP));
      paint();
    }
    function posFromEvent(ev) {
      var r = tape.getBoundingClientRect();
      var x = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
      return Math.max(0, Math.min(1, x / r.width));
    }
    function startDrag(which, handle) {
      return function (ev) {
        if (locked) return;
        ev.preventDefault();
        active = which;
        handle.classList.add("dragging");
        if (ev.pointerId !== undefined && handle.setPointerCapture) handle.setPointerCapture(ev.pointerId);
      };
    }
    function moveDrag(ev) {
      if (locked || !active) return;
      setP(active, posFromEvent(ev));
    }
    function endDrag() {
      active = null;
      hLo.classList.remove("dragging"); hHi.classList.remove("dragging");
    }
    hLo.addEventListener("pointerdown", startDrag("lo", hLo));
    hHi.addEventListener("pointerdown", startDrag("hi", hHi));
    window.addEventListener("pointermove", moveDrag);
    window.addEventListener("pointerup", endDrag);
    tape.addEventListener("pointerdown", function (ev) {
      if (locked || ev.target === hLo || ev.target === hHi) return;
      var p = posFromEvent(ev);
      var which = Math.abs(p - pLo) <= Math.abs(p - pHi) ? "lo" : "hi";
      setP(which, p);
      active = which;
    });
    function keyHandler(which) {
      return function (ev) {
        if (locked) return;
        var step = ev.shiftKey ? 0.05 : 0.01;
        var p = which === "lo" ? pLo : pHi;
        if (ev.key === "ArrowLeft" || ev.key === "ArrowDown") { setP(which, p - step); ev.preventDefault(); }
        else if (ev.key === "ArrowRight" || ev.key === "ArrowUp") { setP(which, p + step); ev.preventDefault(); }
        else if (ev.key === "Home") { setP(which, 0); ev.preventDefault(); }
        else if (ev.key === "End") { setP(which, 1); ev.preventDefault(); }
      };
    }
    hLo.addEventListener("keydown", keyHandler("lo"));
    hHi.addEventListener("keydown", keyHandler("hi"));

    paint();

    return {
      root: wrap,
      values: values,
      width: function () { return pHi - pLo; },
      lock: function () { locked = true; },
      reveal: function (answer, hit) {
        locked = true;
        tape.classList.add("revealed");
        fill.classList.add(hit ? "verdict-hit" : "verdict-miss");
        var p = Math.max(0, Math.min(1, valToPos(q, answer)));
        var needle = el("div", "needle");
        needle.style.left = (p * 100) + "%";
        var flag = el("div", "needle-flag", esc(fmtVal(q, answer)));
        if (p < 0.14) flag.classList.add("flag-left");
        if (p > 0.86) flag.classList.add("flag-right");
        needle.appendChild(flag);
        tape.appendChild(needle);
      },
      destroy: function () {
        window.removeEventListener("pointermove", moveDrag);
        window.removeEventListener("pointerup", endDrag);
      }
    };
  }

  // ---------- session (daily or practice) ----------
  var liveSlider = null;

  function runSession(opts) {
    // opts: { qids, startIndex, answers, onAnswer(i, ans), onDone(answers) , title }
    var i = opts.startIndex || 0;
    var answers = opts.answers || [];

    function showQuestion() {
      if (liveSlider) { liveSlider.destroy(); liveSlider = null; }
      if (i >= opts.qids.length) { opts.onDone(answers); return; }
      var q = DATA.questions[opts.qids[i]];
      var screen = el("div", "screen");

      var ruler = el("div", "progress-ruler");
      for (var k = 0; k < opts.qids.length; k++) {
        var t = el("div", "ptick");
        if (k < answers.length) t.classList.add(answers[k].hit ? "done-hit" : "done-miss");
        else if (k === i) t.classList.add("current");
        ruler.appendChild(t);
      }
      screen.appendChild(ruler);

      var eyebrow = el("div", "q-eyebrow",
        '<span class="q-count">' + (i + 1) + "/" + opts.qids.length + "</span> &nbsp;·&nbsp; " + esc(q.categoryName || ""));
      screen.appendChild(eyebrow);
      screen.appendChild(el("div", "q-prompt", esc(q.prompt)));
      if (q.asOf) screen.appendChild(el("div", "q-asof", "as of " + esc(q.asOf)));

      var readout = el("div", "readout");
      screen.appendChild(readout);

      var slider = TapeSlider(q, function (lo, hi) {
        readout.innerHTML = esc(fmtVal(q, lo)) + '<span class="r-dash">–</span>' + esc(fmtVal(q, hi)) +
          '<span class="r-unit">' + esc(q.unit) + "</span>";
      });
      liveSlider = slider;
      screen.appendChild(slider.root);

      var actions = el("div", "action-row");
      var lockBtn = el("button", "btn btn-primary", "Lock it in");
      actions.appendChild(lockBtn);
      screen.appendChild(actions);

      lockBtn.addEventListener("click", function () {
        var v = slider.values();
        var a = scoreAnswer(q, v.lo, v.hi);
        a.qid = opts.qids[i]; a.lo = v.lo; a.hi = v.hi;
        answers.push(a);
        if (opts.onAnswer) opts.onAnswer(i, a);
        slider.reveal(q.answer, a.hit);

        // fly-up points
        if (a.pts > 0) {
          var fly = el("div", "pts-fly", "+" + a.pts);
          fly.style.left = "50%"; fly.style.top = "40%";
          screen.style.position = "relative";
          screen.appendChild(fly);
        }

        var word = a.hit
          ? '<span class="verdict-word is-hit">✓ Inside' + (a.w <= NARROW_W ? " — tight!" : "") + "</span>"
          : '<span class="verdict-word is-miss">✗ Missed</span>';
        var card = el("div", "verdict",
          '<div class="verdict-line">' + word +
          '<span class="verdict-pts">' + (a.hit ? "+" + a.pts : "+0") + "</span></div>" +
          '<div class="verdict-fact">' + esc(q.reveal) + "</div>" +
          '<div class="verdict-src">' + esc(q.source) + (q.asOf ? " · as of " + esc(q.asOf) : "") + "</div>");
        actions.parentNode.insertBefore(card, actions);

        lockBtn.textContent = i + 1 < opts.qids.length ? "Next question →" : "See my score →";
        lockBtn.replaceWith(lockBtn.cloneNode(true));
        var next = actions.querySelector("button");
        next.addEventListener("click", function () { i++; showQuestion(); });
        next.focus();
      });

      // update ruler tick fill for progress marker each question
      stage.innerHTML = "";
      stage.appendChild(screen);
    }

    showQuestion();
  }

  // ---------- daily flow ----------
  function startDaily() {
    var n = dayNumber();
    if (n < 0) { stage.innerHTML = ""; stage.appendChild(el("div", "summary", "<p>Ballpark opens on " + esc(DATA.epoch) + ". See you then.</p>")); return; }
    var rec = state.history[n] || (state.history[n] = { answers: [], done: false });
    if (rec.done) { renderSummary(n); return; }

    document.getElementById("puzzle-no").textContent = "#" + (n + 1);
    runSession({
      qids: puzzleForDay(n),
      startIndex: rec.answers.length,
      answers: rec.answers,
      onAnswer: function (idx, a) { rec.answers[idx] = a; saveState(); },
      onDone: function (answers) {
        rec.done = true;
        rec.score = answers.reduce(function (s, a) { return s + a.pts; }, 0);
        var streak = currentStreak();
        if (streak > state.maxStreak) state.maxStreak = streak;
        saveState();
        renderSummary(n);
      }
    });
  }

  // ---------- summary ----------
  function shareText(n) {
    var rec = state.history[n];
    var grid = rec.answers.map(emojiFor).join("");
    var hits = rec.answers.filter(function (a) { return a.hit; }).length;
    var streak = currentStreak();
    var lines = [
      "Ballpark #" + (n + 1) + " — " + rec.score + "/500" + (hits === rec.answers.length ? " 🎯" : ""),
      grid + (streak > 1 ? "  🔥" + streak : ""),
      "[ trap the truth ] " + shareUrl()
    ];
    return lines.join("\n");
  }
  function shareUrl() {
    return location.origin === "null" || location.protocol === "file:"
      ? "ballpark.game" : location.origin + location.pathname;
  }
  function renderSummary(n) {
    var rec = state.history[n];
    document.getElementById("puzzle-no").textContent = "#" + (n + 1);
    var hits = rec.answers.filter(function (a) { return a.hit; }).length;
    var screen = el("div", "screen summary");

    screen.appendChild(el("div", "summary-kicker", "Ballpark #" + (n + 1) + " · final"));
    var scoreEl = el("div", "summary-score", "0<span class='of'>/500</span>");
    screen.appendChild(scoreEl);
    screen.appendChild(el("div", "summary-grid", rec.answers.map(emojiFor).join("")));
    screen.appendChild(el("div", "summary-label",
      hits + " of " + rec.answers.length + " trapped" + (hits === rec.answers.length ? " — perfect ballpark 🎯" : "")));

    var actions = el("div", "action-row");
    var shareBtn = el("button", "btn btn-primary", "Share result");
    var statsBtn = el("button", "btn", "My stats");
    var practiceBtn = el("button", "btn btn-ghost", "Practice round" + (state.pro ? "" : " (" + practiceLeft() + " free today)"));
    actions.appendChild(shareBtn); actions.appendChild(statsBtn); actions.appendChild(practiceBtn);
    screen.appendChild(actions);

    var cd = el("div", "countdown");
    screen.appendChild(cd);
    function tickCd() {
      var now = new Date();
      var mid = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      var s = Math.floor((mid - now) / 1000);
      var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
      cd.innerHTML = "Next ballpark in <b>" + h + "h " + (m < 10 ? "0" : "") + m + "m " + (ss < 10 ? "0" : "") + ss + "s</b>";
    }
    tickCd();
    clearInterval(renderSummary._cd);
    renderSummary._cd = setInterval(tickCd, 1000);

    shareBtn.addEventListener("click", function () {
      var text = shareText(n);
      if (navigator.share) {
        navigator.share({ text: text }).catch(function () {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function () { toast("Copied — go brag"); });
      }
    });
    statsBtn.addEventListener("click", openStats);
    practiceBtn.addEventListener("click", startPractice);

    stage.innerHTML = "";
    stage.appendChild(screen);

    // count-up
    var target = rec.score, cur = 0;
    var stepper = setInterval(function () {
      cur = Math.min(target, cur + Math.max(1, Math.round(target / 30)));
      scoreEl.innerHTML = cur + "<span class='of'>/500</span>";
      if (cur >= target) clearInterval(stepper);
    }, 24);

    refreshStreakBadge();
  }

  // ---------- practice ----------
  function practiceLeft() {
    var today = new Date().toISOString().slice(0, 10);
    if (state.practice.date !== today) return FREE_PRACTICE_PER_DAY;
    return Math.max(0, FREE_PRACTICE_PER_DAY - state.practice.used);
  }
  function startPractice() {
    if (!state.pro && practiceLeft() <= 0) { openPro(); return; }
    var today = new Date().toISOString().slice(0, 10);
    if (state.practice.date !== today) { state.practice.date = today; state.practice.used = 0; }
    state.practice.used++;
    saveState();

    var todayIds = {};
    puzzleForDay(dayNumber()).forEach(function (id) { todayIds[id] = 1; });
    var pool = Object.keys(DATA.questions).filter(function (id) { return !todayIds[id]; });
    for (var k = pool.length - 1; k > 0; k--) {
      var j = Math.floor(Math.random() * (k + 1));
      var tmp = pool[k]; pool[k] = pool[j]; pool[j] = tmp;
    }
    var qids = pool.slice(0, 5);

    runSession({
      qids: qids,
      onDone: function (answers) {
        var score = answers.reduce(function (s, a) { return s + a.pts; }, 0);
        var hits = answers.filter(function (a) { return a.hit; }).length;
        var screen = el("div", "screen summary");
        screen.appendChild(el("div", "summary-kicker", "Practice · doesn't touch your streak"));
        screen.appendChild(el("div", "summary-score", score + "<span class='of'>/500</span>"));
        screen.appendChild(el("div", "summary-grid", answers.map(emojiFor).join("")));
        screen.appendChild(el("div", "summary-label", hits + " of 5 trapped"));
        var actions = el("div", "action-row");
        var again = el("button", "btn btn-primary", "Another round" + (state.pro ? "" : " (" + practiceLeft() + " free left)"));
        var back = el("button", "btn btn-ghost", "Back to today");
        actions.appendChild(again); actions.appendChild(back);
        screen.appendChild(actions);
        again.addEventListener("click", startPractice);
        back.addEventListener("click", startDaily);
        stage.innerHTML = "";
        stage.appendChild(screen);
      }
    });
  }

  // ---------- modals ----------
  function openModal(builder) {
    closeModal();
    var veil = el("div", "modal-veil");
    var modal = el("div", "modal");
    var close = el("button", "modal-close", "✕");
    close.setAttribute("aria-label", "Close");
    modal.appendChild(close);
    builder(modal);
    veil.appendChild(modal);
    document.body.appendChild(veil);
    openModal._veil = veil;
    close.addEventListener("click", closeModal);
    veil.addEventListener("click", function (ev) { if (ev.target === veil) closeModal(); });
    document.addEventListener("keydown", escClose);
    close.focus();
  }
  function escClose(ev) { if (ev.key === "Escape") closeModal(); }
  function closeModal() {
    if (openModal._veil) { openModal._veil.remove(); openModal._veil = null; }
    document.removeEventListener("keydown", escClose);
  }

  function openHelp(firstRun) {
    openModal(function (m) {
      m.appendChild(el("h2", "", "How to play"));
      m.appendChild(el("div", "modal-sub", "Five questions a day. Don't guess the number — trap it."));
      var steps = [
        ["[ ]", "<b>Drag the brackets</b> to set your range. The truth has to land inside."],
        ["↔", "<b>Narrow range, big points.</b> Wide and safe scores less. Miss entirely: zero."],
        ["🔥", "<b>Come back tomorrow.</b> Five new questions every day. Keep the streak alive."]
      ];
      steps.forEach(function (s) {
        var step = el("div", "howto-step");
        step.appendChild(el("div", "howto-glyph", s[0]));
        step.appendChild(el("p", "", s[1]));
        m.appendChild(step);
      });
      var b = el("button", "btn btn-primary", firstRun ? "Play today's ballpark" : "Got it");
      b.style.width = "100%"; b.style.marginTop = "8px";
      b.addEventListener("click", function () {
        state.seenTutorial = true; saveState(); closeModal();
      });
      m.appendChild(b);
    });
  }

  function openStats() {
    var days = Object.keys(state.history).filter(function (k) { return state.history[k].done; });
    var played = days.length;
    var allAnswers = [];
    days.forEach(function (k) { allAnswers = allAnswers.concat(state.history[k].answers); });
    var hits = allAnswers.filter(function (a) { return a.hit; }).length;
    var hitRate = allAnswers.length ? Math.round(100 * hits / allAnswers.length) : 0;
    var streak = currentStreak();

    openModal(function (m) {
      m.appendChild(el("h2", "", "Your numbers"));
      m.appendChild(el("div", "modal-sub", "The instrument reads as follows."));

      var tiles = el("div", "stat-tiles");
      [[played, "played"], [hitRate + "%", "trap rate"], [streak, "streak"], [state.maxStreak, "best streak"]].forEach(function (t) {
        var tile = el("div", "stat-tile");
        tile.appendChild(el("div", "v", String(t[0])));
        tile.appendChild(el("div", "l", t[1]));
        tiles.appendChild(tile);
      });
      m.appendChild(tiles);

      // calibration bullet: trap rate vs the sweet-spot band
      var cal = el("div", "chart-block");
      cal.appendChild(el("div", "chart-title", "Calibration"));
      cal.appendChild(el("div", "chart-sub", "Sweet spot is 60–85%: below it you're overconfident, above it you're playing too safe."));
      var track = el("div", "cal-track");
      var band = el("div", "cal-band"); band.style.left = "60%"; band.style.width = "25%";
      track.appendChild(band);
      [60, 85].forEach(function (x) { var e2 = el("div", "cal-band-edge"); e2.style.left = x + "%"; track.appendChild(e2); });
      if (allAnswers.length) {
        var mk = el("div", "cal-marker"); mk.style.left = hitRate + "%";
        mk.title = "Your trap rate: " + hitRate + "%";
        track.appendChild(mk);
      }
      cal.appendChild(track);
      var scale = el("div", "cal-scale");
      ["0%", "25%", "50%", "75%", "100%"].forEach(function (s) { scale.appendChild(el("span", "", s)); });
      cal.appendChild(scale);
      m.appendChild(cal);

      // score histogram
      var hist = el("div", "chart-block");
      hist.appendChild(el("div", "chart-title", "Daily scores"));
      hist.appendChild(el("div", "chart-sub", played ? "Distribution of your finals. Ink bar is today." : "Play your first ballpark to start the record."));
      var buckets = [0, 0, 0, 0, 0];
      var todayBucket = -1;
      var todayN = dayNumber();
      days.forEach(function (k) {
        var b = Math.min(4, Math.floor(state.history[k].score / 100));
        buckets[b]++;
        if (+k === todayN) todayBucket = b;
      });
      var max = Math.max.apply(null, buckets.concat(1));
      var bars = el("div", "hist");
      buckets.forEach(function (c, bi) {
        var col = el("div", "hist-col");
        var bar = el("div", "hist-bar" + (bi === todayBucket ? " today" : ""));
        bar.style.height = Math.round(100 * c / max) + "%";
        bar.title = c + (c === 1 ? " day" : " days");
        col.appendChild(bar);
        bars.appendChild(col);
      });
      hist.appendChild(bars);
      var xa = el("div", "hist-x");
      ["0–99", "100s", "200s", "300s", "400+"].forEach(function (s) { xa.appendChild(el("span", "", s)); });
      hist.appendChild(xa);
      m.appendChild(hist);

      // category breakdown — the Pro tease
      var cats = {};
      allAnswers.forEach(function (a) {
        var q = DATA.questions[a.qid];
        if (!q) return;
        var c = q.categoryName || "Other";
        cats[c] = cats[c] || { hit: 0, n: 0 };
        cats[c].n++; if (a.hit) cats[c].hit++;
      });
      var catBlock = el("div", "chart-block");
      catBlock.appendChild(el("div", "chart-title", 'By category <span class="badge-pro">PRO</span>'));
      if (state.pro) {
        Object.keys(cats).sort().forEach(function (c) {
          var row = el("div", "chart-sub",
            esc(c) + " — " + Math.round(100 * cats[c].hit / cats[c].n) + "% over " + cats[c].n);
          catBlock.appendChild(row);
        });
        if (!Object.keys(cats).length) catBlock.appendChild(el("div", "chart-sub", "Play a few days to build this up."));
      } else {
        catBlock.appendChild(el("div", "chart-sub", "See where your gut is sharp and where it lies to you. Unlock with Ballpark Pro."));
        var pb = el("button", "btn", "About Pro");
        pb.style.width = "100%";
        pb.addEventListener("click", openPro);
        catBlock.appendChild(pb);
      }
      m.appendChild(catBlock);
    });
  }

  function openPro() {
    openModal(function (m) {
      m.appendChild(el("h2", "", "Ballpark Pro"));
      m.appendChild(el("div", "modal-sub", "One coffee. Forever sharp."));
      var card = el("div", "pro-card");
      card.appendChild(el("h3", "", "Everything in free, plus:"));
      var ul = el("ul");
      ["Unlimited practice rounds", "Category breakdown — find your blind spots", "Full score history, forever", "Zero ads, zero nags"].forEach(function (li) {
        ul.appendChild(el("li", "", li));
      });
      card.appendChild(ul);
      var buy = el("a");
      buy.className = "btn btn-primary";
      buy.style.display = "block"; buy.style.textAlign = "center"; buy.style.textDecoration = "none";
      buy.textContent = "Get Pro — $14 once";
      buy.href = window.BALLPARK_PRO_URL || "#";
      if (!window.BALLPARK_PRO_URL) {
        buy.addEventListener("click", function (ev) { ev.preventDefault(); toast("Checkout opens at launch — codes work now"); });
      }
      card.appendChild(buy);
      var row = el("div", "pro-code-row");
      var input = el("input");
      input.placeholder = "Have a code? BP-XXXX-XXXX";
      input.setAttribute("aria-label", "Pro unlock code");
      var redeem = el("button", "btn", "Redeem");
      row.appendChild(input); row.appendChild(redeem);
      card.appendChild(row);
      redeem.addEventListener("click", function () {
        if (validCode(input.value.trim().toUpperCase())) {
          state.pro = true; saveState(); closeModal(); toast("Pro unlocked. Welcome to the shop.");
        } else {
          toast("That code doesn't measure up");
        }
      });
      m.appendChild(card);
    });
  }

  // Simple checksum gate for launch-week codes (see tools/make-code.js).
  function validCode(code) {
    var m = /^BP-([A-Z0-9]{4})-([A-Z0-9]{4})$/.exec(code);
    if (!m) return false;
    var s = 0, body = m[1] + m[2];
    for (var k = 0; k < body.length; k++) s = (s * 31 + body.charCodeAt(k)) % 9973;
    return s % 89 === 7;
  }

  // ---------- header ----------
  function refreshStreakBadge() {
    document.getElementById("streak-n").textContent = currentStreak();
  }

  // Pure core exposed for tests and tooling.
  window.BALLPARK_CORE = {
    posToVal: posToVal, valToPos: valToPos, snapVal: snapVal, fmtVal: fmtVal,
    scoreAnswer: scoreAnswer, emojiFor: emojiFor, dayNumber: dayNumber,
    puzzleForDay: puzzleForDay, validCode: validCode
  };

  // ---------- boot ----------
  if (HAS_DOM) {
    document.getElementById("btn-help").addEventListener("click", function () { openHelp(false); });
    document.getElementById("btn-stats").addEventListener("click", openStats);
    document.getElementById("btn-streak").addEventListener("click", openStats);
    document.getElementById("btn-home").addEventListener("click", startDaily);
    document.getElementById("btn-home").addEventListener("keydown", function (ev) {
      if (ev.key === "Enter" || ev.key === " ") startDaily();
    });

    refreshStreakBadge();
    startDaily();
    if (!state.seenTutorial) openHelp(true);

    if ("serviceWorker" in navigator && location.protocol !== "file:") {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    }
  }
})();
