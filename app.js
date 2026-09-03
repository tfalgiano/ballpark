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

  // ---------- state ----------
  function defaultState() {
    // `player` is additive: loadState() fills any key missing from saved state
    // from these defaults, so existing players pick it up with no migration.
    return {
      v: 1, seenTutorial: false, pro: false, history: {}, archive: {}, maxStreak: 0,
      practice: { date: "", used: 0 },
      player: { id: "", firstDay: null, cohort: "", source: "", milestones: {} }
    };
  }
  function loadState() {
    var d = defaultState();
    try {
      var s = JSON.parse(localStorage.getItem(STORE_KEY));
      if (s && s.v === 1) {
        // merge over defaults so a missing field can never crash the app
        var merged = {};
        for (var k in d) merged[k] = s[k] !== undefined ? s[k] : d[k];
        merged.practice = s.practice && typeof s.practice === "object" ? s.practice : d.practice;
        merged.player = s.player && typeof s.player === "object" ? s.player : d.player;
        if (!merged.player.milestones || typeof merged.player.milestones !== "object") merged.player.milestones = {};
        merged.history = s.history && typeof s.history === "object" ? s.history : d.history;
        merged.archive = s.archive && typeof s.archive === "object" ? s.archive : d.archive;
        return merged;
      }
      if (s && s.v && s.v !== 1) {
        // unknown future schema: preserve it rather than clobbering on next save
        try { localStorage.setItem(STORE_KEY + "-backup", JSON.stringify(s)); } catch (e2) {}
      }
    } catch (e) {}
    return d;
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
  function snapStepSize(q, v) {
    if (q.scale === "linear") {
      var span = q.hi - q.lo;
      return span > 4000 ? 10 : span > 400 ? 1 : span > 40 ? 1 : span > 4 ? 0.5 : 0.1;
    }
    if (v === 0) return 0.1;
    return Math.pow(10, Math.floor(Math.log10(Math.abs(v))) - 1);
  }
  function snapVal(q, v) {
    var step = snapStepSize(q, v);
    var s = Math.round(v / step) * step;
    return Math.min(q.hi, Math.max(q.lo, +s.toPrecision(12)));
  }
  // The displayed numbers ARE the answer: handles, scoring, and readout all use
  // this. Ranges keep at least one snap step of width so "2–2" can never show.
  function quantizeRange(q, pLo, pHi) {
    var lo = snapVal(q, posToVal(q, pLo));
    var hi = snapVal(q, posToVal(q, pHi));
    if (hi <= lo) {
      var up = snapVal(q, lo + snapStepSize(q, lo));
      if (up > lo) {
        hi = up;
      } else {
        hi = lo;
        var down = snapVal(q, hi - snapStepSize(q, hi));
        if (down < hi) lo = down;
      }
    }
    return { lo: lo, hi: hi };
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
    // boundaries count as inside; epsilon guards float noise at exact edges
    var eps = Math.max(1e-9, Math.abs(q.answer) * 1e-9);
    var hit = q.answer >= vLo - eps && q.answer <= vHi + eps;
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

  /* ---------- anonymous player identity ----------
     GoatCounter counts paths; it cannot count people. So uniqueness is produced
     on the device instead: a milestone fires AT MOST ONCE per browser, ever, and
     the resulting count is therefore a headcount rather than an event tally.

     Naming is the contract, because reading an event count as a headcount is the
     exact mistake that made us believe we had 333 loyal players when the honest
     range was 9 to 337:
       evt/...   something happened. Repeats. Never a number of people.
       uniq/...  fires once per browser for all time. The count IS people.

     The id never leaves the device — it exists so distinct-day and streak maths
     survive a page reload, not to be transmitted. No fingerprinting, no cookies,
     nothing that identifies a person: what ships is a bucketed counter. */
  /* Display-mode is the reliable signal, not the URL. start_url carries
     "?src=pwa" so GoatCounter can separate the paths, but that parameter is
     lost the moment the app navigates or rewrites history, and it is absent
     entirely for anyone who installed before it shipped. */
  function isStandalone() {
    try {
      if (window.matchMedia && matchMedia("(display-mode: standalone)").matches) return true;
      if (window.matchMedia && matchMedia("(display-mode: fullscreen)").matches) return true;
      if (window.matchMedia && matchMedia("(display-mode: minimal-ui)").matches) return true;
      return navigator.standalone === true;     // iOS Safari, added to home screen
    } catch (e) { return false; }
  }

  function newPlayerId() {
    try {
      if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
      if (window.crypto && window.crypto.getRandomValues) {
        var b = new Uint8Array(16);
        window.crypto.getRandomValues(b);
        return Array.prototype.map.call(b, function (x) { return ("0" + x.toString(16)).slice(-2); }).join("");
      }
    } catch (e) {}
    return "p" + String(Date.now()) + String(Math.floor(Math.random() * 1e9));
  }

  // Coarse buckets only — never a raw referrer or query string, so no URL a
  // player arrived on can ever be reconstructed from the analytics.
  function acquisitionSource() {
    try {
      var qs = new URLSearchParams(location.search);
      if (qs.get("d") !== null) return "challenge";       // a link another player shared
      if (qs.get("code") !== null) return "code";
      /* Only reachable if someone cleared storage inside the installed app —
         a genuine first visit cannot arrive from a PWA that isn't installed
         yet. Named rather than left to fall through to "other". */
      if (qs.get("src") === "pwa" || isStandalone()) return "pwa";
      var utm = (qs.get("utm_medium") || qs.get("utm_source") || "").toLowerCase();
      if (utm.indexOf("email") >= 0 || utm.indexOf("newsletter") >= 0) return "newsletter";
      if (qs.get("_hsmi") || qs.get("_hsenc") || qs.get("mc_cid")) return "newsletter";
      var r = document.referrer || "";
      if (!r) return "direct";
      var host = "";
      try { host = new URL(r).hostname.toLowerCase().replace(/^www\./, ""); } catch (e2) { return "other"; }
      if (host === location.hostname.toLowerCase().replace(/^www\./, "")) return "direct";
      if (/thehustle|cenital|substack|beehiiv|mailchi|convertkit|ghost\.io/.test(host)) return "newsletter";
      if (/reddit/.test(host)) return "reddit";
      if (/producthunt/.test(host)) return "producthunt";
      if (/google|bing|duckduckgo|ecosia|yahoo|brave/.test(host)) return "search";
      if (/twitter|^x\.com|facebook|linkedin|instagram|tiktok|mastodon|bsky/.test(host)) return "social";
      if (/itch\.io/.test(host)) return "itch";
      return "other";
    } catch (e) { return "other"; }
  }

  function initPlayer() {
    var p = state.player;
    if (!p.id) {
      p.id = newPlayerId();
      p.source = acquisitionSource();   // captured on the FIRST visit and never overwritten
      saveState();
    }
  }

  // fires `path` at most once per browser, for all time
  function once(path) {
    var m = state.player.milestones;
    if (m[path]) return false;
    m[path] = 1;
    saveState();
    track(path);
    return true;
  }

  function distinctDaysPlayed() {
    var n = 0;
    for (var k in state.history) if (state.history[k] && state.history[k].done) n++;
    return n;
  }

  var DAY_MILESTONES = [2, 3, 5, 7, 14, 30, 60, 100];
  var STREAK_MILESTONES = [3, 7, 14, 30];
  var RETURN_WINDOWS = [1, 3, 7, 14, 30];

  function streakBucket(s) {
    if (s <= 1) return "1";
    if (s === 2) return "2";
    if (s <= 4) return "3-4";
    if (s <= 7) return "5-7";
    if (s <= 14) return "8-14";
    if (s <= 30) return "15-30";
    return "31plus";
  }

  /* Called once per completed daily. Everything here is derived from local
     state; the only thing that leaves the browser is a bucketed path. */
  function recordDailyFinish(dayIdx, streak) {
    var p = state.player;
    if (p.firstDay === null || p.firstDay === undefined) {
      p.firstDay = dayIdx;
      p.cohort = "w" + Math.floor(dayIdx / 7);   // weeks since launch; wide enough to never single anyone out
      saveState();
      once("uniq/player-first-finish");
      once("uniq/cohort/" + p.cohort + "/new");
      once("uniq/source/" + (p.source || "unknown") + "/new");
    }

    // distribution of streaks across today's finishers — an EVENT, by design:
    // it must be re-counted every day, so it can never be read as a headcount
    track("evt/finish-streak/" + streakBucket(streak));

    var days = distinctDaysPlayed();
    for (var i = 0; i < DAY_MILESTONES.length; i++) {
      if (days >= DAY_MILESTONES[i]) once("uniq/days-played-" + DAY_MILESTONES[i]);
    }
    for (var j = 0; j < STREAK_MILESTONES.length; j++) {
      if (state.maxStreak >= STREAK_MILESTONES[j]) once("uniq/best-streak-" + STREAK_MILESTONES[j]);
    }

    // true cohort retention: still finishing puzzles N days after the first one.
    // Tagged by cohort and by where the player came from, so we can finally ask
    // whether a given traffic source produced habits or just clicks.
    var age = dayIdx - p.firstDay;
    for (var k = 0; k < RETURN_WINDOWS.length; k++) {
      var w = RETURN_WINDOWS[k];
      if (age >= w) {
        once("uniq/retained-d" + w);
        once("uniq/cohort/" + p.cohort + "/d" + w);
        once("uniq/source/" + (p.source || "unknown") + "/d" + w);
      }
    }
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
  // cookieless GoatCounter event. Events fired before the async analytics
  // script loads (e.g. the boot-time Pro unlock) queue and flush once ready.
  var pendingEvents = [];
  function track(name) {
    try {
      if (window.goatcounter && window.goatcounter.count) {
        window.goatcounter.count({ path: name, event: true });
      } else {
        pendingEvents.push(name);
      }
    } catch (e) {}
  }
  if (typeof setInterval === "function") {
    var flushTimer = setInterval(function () {
      if (!(window.goatcounter && window.goatcounter.count)) return;
      while (pendingEvents.length) {
        try { window.goatcounter.count({ path: pendingEvents.shift(), event: true }); } catch (e) {}
      }
      clearInterval(flushTimer);
    }, 500);
    setTimeout(function () { clearInterval(flushTimer); }, 15000);
  }
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
      return quantizeRange(q, pLo, pHi);
    }
    function paint() {
      // render at the quantized positions so what you see is what gets scored
      var v = values();
      var qLo = valToPos(q, v.lo), qHi = valToPos(q, v.hi);
      hLo.style.left = (qLo * 100) + "%";
      hHi.style.left = (qHi * 100) + "%";
      fill.style.left = (qLo * 100) + "%";
      fill.style.right = ((1 - qHi) * 100) + "%";
      hLo.setAttribute("aria-valuemin", q.lo); hLo.setAttribute("aria-valuemax", q.hi);
      hHi.setAttribute("aria-valuemin", q.lo); hHi.setAttribute("aria-valuemax", q.hi);
      hLo.setAttribute("aria-valuenow", v.lo); hLo.setAttribute("aria-valuetext", fmtVal(q, v.lo) + " " + q.unit);
      hHi.setAttribute("aria-valuenow", v.hi); hHi.setAttribute("aria-valuetext", fmtVal(q, v.hi) + " " + q.unit);
      onChange(v.lo, v.hi, qHi - qLo);
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
        active = { which: which, id: ev.pointerId };
        handle.classList.add("dragging");
        if (ev.pointerId !== undefined && handle.setPointerCapture) handle.setPointerCapture(ev.pointerId);
      };
    }
    function moveDrag(ev) {
      if (locked || !active || ev.pointerId !== active.id) return;
      setP(active.which, posFromEvent(ev));
    }
    function endDrag(ev) {
      if (active && ev && ev.pointerId !== undefined && ev.pointerId !== active.id) return;
      active = null;
      hLo.classList.remove("dragging"); hHi.classList.remove("dragging");
    }
    hLo.addEventListener("pointerdown", startDrag("lo", hLo));
    hHi.addEventListener("pointerdown", startDrag("hi", hHi));
    window.addEventListener("pointermove", moveDrag);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    hLo.addEventListener("lostpointercapture", endDrag);
    hHi.addEventListener("lostpointercapture", endDrag);
    tape.addEventListener("pointerdown", function (ev) {
      if (locked || active || ev.target === hLo || ev.target === hHi) return;
      var r = tape.getBoundingClientRect();
      var px = ev.clientX - r.left;
      var dLo = Math.abs(px - pLo * r.width), dHi = Math.abs(px - pHi * r.width);
      var which = dLo <= dHi ? "lo" : "hi";
      // near-miss of a handle grabs it in place; a deliberate far tap jumps it
      if (Math.min(dLo, dHi) > 28) setP(which, posFromEvent(ev));
      active = { which: which, id: ev.pointerId };
      (which === "lo" ? hLo : hHi).classList.add("dragging");
      var h = which === "lo" ? hLo : hHi;
      if (ev.pointerId !== undefined && h.setPointerCapture) h.setPointerCapture(ev.pointerId);
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
      lock: function () { locked = true; wrap.style.touchAction = "auto"; },
      reveal: function (answer, hit) {
        locked = true;
        wrap.style.touchAction = "auto";
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
      ruler.setAttribute("role", "img");
      ruler.setAttribute("aria-label", "Question " + (i + 1) + " of " + opts.qids.length +
        (answers.length ? ". So far: " + answers.map(function (a) { return a.hit ? "hit" : "miss"; }).join(", ") : ""));
      for (var k = 0; k < opts.qids.length; k++) {
        var t = el("div", "ptick");
        if (k < answers.length) t.classList.add(answers[k].hit ? "done-hit" : "done-miss");
        else if (k === i) t.classList.add("current");
        ruler.appendChild(t);
      }
      screen.appendChild(ruler);

      if (opts.banner) screen.appendChild(el("div", "challenge-banner", opts.banner));

      // fire the loss-aversion trigger at the moment of play, not after
      if (opts.daily && i === 0 && currentStreak() >= 2) {
        screen.appendChild(el("div", "streak-line", "🔥 " + currentStreak() + "-day streak on the line"));
      }

      var eyebrow = el("div", "q-eyebrow",
        '<span class="q-count">' + (i + 1) + "/" + opts.qids.length + "</span> &nbsp;·&nbsp; " + esc(q.categoryName || ""));
      screen.appendChild(eyebrow);
      var promptEl = el("div", "q-prompt", esc(q.prompt));
      promptEl.setAttribute("tabindex", "-1");
      screen.appendChild(promptEl);
      if (q.asOf) screen.appendChild(el("div", "q-asof", "as of " + esc(q.asOf)));

      var readout = el("div", "readout");
      screen.appendChild(readout);

      // first-ever question: one hint line instead of a blocking tutorial modal
      if (!state.seenTutorial) {
        screen.appendChild(el("div", "first-hint",
          "Drag the brackets — trap the true number inside. Narrower = bigger points."));
      }

      var slider = TapeSlider(q, function (lo, hi, w) {
        // live stake: show what this width is worth, so narrowing has visible tension
        var worth = Math.round(15 + 85 * Math.pow(1 - w, 1.4));
        var tight = w <= NARROW_W;
        readout.innerHTML = esc(fmtVal(q, lo)) + '<span class="r-dash">–</span>' + esc(fmtVal(q, hi)) +
          '<span class="r-unit">' + esc(q.unit) + "</span>" +
          '<span class="r-worth' + (tight ? " tight" : "") + '">worth +' + worth + (tight ? " 🟩" : "") + "</span>";
      });
      liveSlider = slider;
      screen.appendChild(slider.root);

      var actions = el("div", "action-row");
      var lockBtn = el("button", "btn btn-primary", "Lock it in");
      actions.appendChild(lockBtn);
      screen.appendChild(actions);

      lockBtn.addEventListener("click", function () {
        // the readout numbers are the contract: they are exactly what gets scored
        var v = slider.values();
        var a = scoreAnswer(q, v.lo, v.hi);
        a.qid = opts.qids[i]; a.lo = v.lo; a.hi = v.hi;
        answers.push(a);
        if (!state.seenTutorial) { state.seenTutorial = true; saveState(); }
        if (opts.onAnswer) opts.onAnswer(i, a);
        slider.reveal(q.answer, a.hit);
        if (navigator.vibrate) navigator.vibrate(a.hit ? 15 : [30, 40, 30]);

        // fly-up points
        if (a.pts > 0) {
          var fly = el("div", "pts-fly", "+" + a.pts);
          fly.style.left = "50%"; fly.style.top = "40%";
          screen.style.position = "relative";
          screen.appendChild(fly);
        }

        var word;
        if (a.hit) {
          word = '<span class="verdict-word is-hit">✓ Inside' + (a.w <= NARROW_W ? " — tight!" : "") + "</span>";
        } else {
          // how far outside the brackets the truth landed, in track space
          var pAns = Math.max(0, Math.min(1, valToPos(q, q.answer)));
          var dist = pAns < valToPos(q, v.lo) ? valToPos(q, v.lo) - pAns : pAns - valToPos(q, v.hi);
          var missWord = dist <= 0.03 ? "✗ Missed by a hair" : dist <= 0.1 ? "✗ Missed — close" : "✗ Missed";
          word = '<span class="verdict-word is-miss">' + missWord + "</span>";
        }
        var card = el("div", "verdict",
          '<div class="verdict-line">' + word +
          '<span class="verdict-pts">' + (a.hit ? "+" + a.pts : "+0") + "</span></div>" +
          '<div class="verdict-fact">' + esc(q.reveal) + "</div>" +
          '<div class="verdict-src">' + esc(q.source) + (q.asOf ? " · as of " + esc(q.asOf) : "") +
          ' · <a class="dispute" href="mailto:tfalgiano@gmail.com?subject=' +
          encodeURIComponent("Ballpark answer dispute") + "&body=" +
          encodeURIComponent("Question: " + q.prompt + "\nShown answer: " + q.answer + " " + q.unit +
            "\nSource: " + q.source + "\n\nMy case: ") + '">dispute</a></div>');
        card.setAttribute("role", "status");
        actions.parentNode.insertBefore(card, actions);

        lockBtn.textContent = i + 1 < opts.qids.length ? "Next question →" : "See my score →";
        lockBtn.replaceWith(lockBtn.cloneNode(true));
        var next = actions.querySelector("button");
        // a jittery double-tap must not blow past the reveal — the payoff moment
        next.disabled = true;
        setTimeout(function () { next.disabled = false; next.focus(); }, 400);
        next.addEventListener("click", function () { i++; showQuestion(); });
      });

      // update ruler tick fill for progress marker each question
      stage.innerHTML = "";
      stage.appendChild(screen);
      promptEl.focus({ preventScroll: false });
    }

    showQuestion();
  }

  // ---------- daily flow ----------
  var summaryDay = null; // day whose summary is on screen, for midnight rollover
  var challengeTarget = null; // score to beat when arriving via a ?d=&s= link

  function startDaily() {
    var n = dayNumber();
    if (n < 0) { stage.innerHTML = ""; stage.appendChild(el("div", "summary", "<p>Ballpark opens on " + esc(DATA.epoch) + ". See you then.</p>")); return; }
    var rec = state.history[n] || (state.history[n] = { answers: [], done: false });
    /* Partitions the top of the funnel. A pageview is not an opportunity to
       play: a player who already finished today lands straight on their summary
       and never sees a question, and so does every PWA re-open. Without this
       split, those sit in the denominator and make the start rate look broken
       when nothing is wrong. entry-puzzle is the real denominator. */
    if (rec.done) { track("evt/entry-summary"); renderSummary(n); return; }
    track("evt/entry-puzzle");

    document.getElementById("puzzle-no").textContent = "#" + (n + 1);
    summaryDay = null;
    runSession({
      daily: true,
      qids: puzzleForDay(n),
      startIndex: rec.answers.length,
      answers: rec.answers,
      onAnswer: function (idx, a) {
        rec.answers[idx] = a; saveState();
        if (idx === 0) track("event/started-daily");
      },
      onDone: function (answers) {
        rec.done = true;
        rec.score = answers.reduce(function (s, a) { return s + a.pts; }, 0);
        var streak = currentStreak();
        if (streak > state.maxStreak) state.maxStreak = streak;
        saveState();
        track("event/finished-daily");
        /* Kept firing so the series stays continuous back to launch, but read it
           as what it is: one event per finish on a streak, NOT a count of people.
           uniq/retained-d* below is the honest version. */
        if (streak >= 2) track("event/returning-player");
        recordDailyFinish(n, streak);
        // a finished game is worth protecting: ask the browser not to evict
        // this site's storage (guards streaks and the Pro flag)
        if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
        renderSummary(n, true);
      }
    });
  }

  // ---------- archive & challenges ----------
  function startChallenge(dayIdx, targetScore) {
    if (dayIdx === dayNumber()) {
      challengeTarget = targetScore;
      startDaily();
      return;
    }
    playArchive(dayIdx, targetScore);
  }

  function playArchive(dayIdx, targetScore) {
    summaryDay = null;
    var rec = state.archive[dayIdx];
    if (rec && rec.done) { renderArchiveSummary(dayIdx, targetScore); return; }
    if (!rec) { rec = { answers: [], done: false }; state.archive[dayIdx] = rec; }
    document.getElementById("puzzle-no").textContent = "#" + (dayIdx + 1);
    runSession({
      qids: puzzleForDay(dayIdx),
      startIndex: rec.answers.length,
      answers: rec.answers,
      banner: targetScore != null
        ? "⚔️ Challenge: beat " + targetScore + "/500 on this ballpark"
        : "Archive #" + (dayIdx + 1) + " — doesn't touch your streak",
      onAnswer: function (idx, a) { rec.answers[idx] = a; saveState(); },
      onDone: function (answers) {
        rec.done = true;
        rec.score = answers.reduce(function (s, a) { return s + a.pts; }, 0);
        saveState();
        track("event/finished-archive");
        renderArchiveSummary(dayIdx, targetScore);
      }
    });
  }

  function renderArchiveSummary(dayIdx, targetScore) {
    var rec = state.archive[dayIdx];
    var hits = rec.answers.filter(function (a) { return a.hit; }).length;
    var screen = el("div", "screen summary");
    screen.appendChild(el("div", "summary-kicker", "Ballpark #" + (dayIdx + 1) + " · archive"));
    screen.appendChild(el("div", "summary-score", rec.score + "<span class='of'>/500</span>"));
    screen.appendChild(el("div", "summary-grid", rec.answers.map(emojiFor).join("")));
    screen.appendChild(el("div", "summary-label", hits + " of " + rec.answers.length + " trapped"));
    if (targetScore != null) {
      screen.appendChild(el("div", "streak-line", rec.score > targetScore
        ? "⚔️ Challenge won — " + rec.score + " beats their " + targetScore
        : rec.score === targetScore
          ? "⚔️ Dead heat at " + rec.score
          : "⚔️ Challenge stands — their " + targetScore + ", your " + rec.score));
    }
    var actions = el("div", "action-row");
    var shareBtn = el("button", "btn btn-primary", "Challenge a friend");
    var todayBtn = el("button", "btn", "Play today's ballpark");
    actions.appendChild(shareBtn); actions.appendChild(todayBtn);
    screen.appendChild(actions);
    shareBtn.addEventListener("click", function () {
      shareResult("Ballpark #" + (dayIdx + 1) + " — " + rec.score + "/500\n" +
        rec.answers.map(emojiFor).join(""), challengeUrl(dayIdx, rec.score));
    });
    todayBtn.addEventListener("click", function () {
      history.replaceState(null, "", location.pathname);
      startDaily();
    });
    stage.innerHTML = "";
    stage.appendChild(screen);
  }

  function challengeUrl(dayIdx, score) {
    return shareUrl() + "?d=" + (dayIdx + 1) + (score != null ? "&s=" + score : "");
  }

  function openArchive() {
    openModal(function (m) {
      m.appendChild(el("h2", "", "The archive"));
      m.appendChild(el("div", "modal-sub", "Every past ballpark. Archive plays don't touch your streak."));
      var grid = el("div", "archive-grid");
      var today = dayNumber();
      for (var d = today - 1; d >= 0; d--) {
        (function (dayIdx) {
          var played = (state.history[dayIdx] && state.history[dayIdx].done && state.history[dayIdx]) ||
                       (state.archive[dayIdx] && state.archive[dayIdx].done && state.archive[dayIdx]);
          var chip = el("button", "archive-chip" + (played ? " played" : ""),
            "#" + (dayIdx + 1) + (played ? "<span class='chip-score'>" + played.score + "</span>" : ""));
          chip.addEventListener("click", function () {
            closeModal();
            playArchive(dayIdx, null);
          });
          grid.appendChild(chip);
        })(d);
      }
      if (today < 1) m.appendChild(el("div", "chart-sub", "Come back tomorrow — the archive starts once there's a yesterday."));
      m.appendChild(grid);
    });
  }

  // ---------- summary ----------
  function shareGrid(n) {
    var rec = state.history[n];
    var grid = rec.answers.map(emojiFor).join("");
    var hits = rec.answers.filter(function (a) { return a.hit; }).length;
    var streak = currentStreak();
    return "Ballpark #" + (n + 1) + " — " + rec.score + "/500" + (hits === rec.answers.length ? " 🎯" : "") +
      "\n" + grid + (streak > 1 ? "  🔥" + streak : "");
  }
  // one share path for daily and archive: native sheet on touch, clipboard on desktop
  function shareResult(gridText, url) {
    var full = gridText + "\nBeat me: " + url;
    var coarse = window.matchMedia && matchMedia("(pointer: coarse)").matches;
    function copyFallback() {
      if (!navigator.clipboard) { toast("Couldn't share — select and copy manually"); return; }
      navigator.clipboard.writeText(full).then(function () {
        track("event/share-copy");
        toast("Copied — go brag");
      }, function () { toast("Couldn't copy — check clipboard permission"); });
    }
    if (coarse && navigator.share) {
      navigator.share({ title: "Ballpark", text: gridText + "\nBeat me:", url: url })
        .then(function () { track("event/share-native"); })
        .catch(copyFallback);
    } else {
      copyFallback();
    }
  }
  function shareUrl() {
    // shares always point at the canonical domain, wherever the game is running
    return "https://theballparkgame.com/";
  }
  function renderSummary(n, celebrate) {
    var rec = state.history[n];
    document.getElementById("puzzle-no").textContent = "#" + (n + 1);
    var hits = rec.answers.filter(function (a) { return a.hit; }).length;
    var screen = el("div", "screen summary");

    // confetti only at the moment a perfect day is earned, never on revisit
    if (celebrate && hits === rec.answers.length && rec.answers.length &&
        !(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)) {
      var burst = el("div", "confetti");
      for (var ci = 0; ci < 44; ci++) {
        var p = el("i");
        p.style.left = Math.random() * 100 + "%";
        p.style.animationDelay = Math.random() * 0.9 + "s";
        p.style.background = ["#FFC933", "#1B2733", "#26AC7F", "#FAFAF7"][ci % 4];
        burst.appendChild(p);
      }
      screen.appendChild(burst);
      setTimeout(function () { burst.remove(); }, 3200);
    }

    screen.appendChild(el("div", "summary-kicker", "Ballpark #" + (n + 1) + " · final"));
    var scoreEl = el("div", "summary-score", "0<span class='of'>/500</span>");
    screen.appendChild(scoreEl);
    screen.appendChild(el("div", "summary-grid", rec.answers.map(emojiFor).join("")));
    screen.appendChild(el("div", "summary-label",
      hits + " of " + rec.answers.length + " trapped" + (hits === rec.answers.length ? " — perfect ballpark 🎯" : "")));

    var priorBest = 0, priorDays = 0;
    Object.keys(state.history).forEach(function (k) {
      if (+k !== n && state.history[k].done) { priorDays++; priorBest = Math.max(priorBest, state.history[k].score || 0); }
    });
    if (celebrate && priorDays > 0 && rec.score > priorBest) {
      screen.appendChild(el("div", "pb-ribbon", "★ New personal best"));
    }
    var streakNow = currentStreak();
    if (streakNow >= 2) {
      screen.appendChild(el("div", "streak-line", "🔥 " + streakNow + "-day streak"));
    }
    if (challengeTarget != null) {
      screen.appendChild(el("div", "streak-line", rec.score > challengeTarget
        ? "⚔️ Challenge won — " + rec.score + " beats their " + challengeTarget
        : rec.score === challengeTarget
          ? "⚔️ Dead heat at " + rec.score
          : "⚔️ Challenge stands — their " + challengeTarget + ", your " + rec.score));
    }

    // recap: the five questions stay reviewable — the learning loop lives here
    var recap = el("div", "recap");
    rec.answers.forEach(function (a) {
      var q = DATA.questions[a.qid];
      if (!q) return;
      var row = el("div", "recap-row");
      row.appendChild(el("span", "recap-emoji", emojiFor(a)));
      var mid = el("div", "recap-mid");
      mid.appendChild(el("div", "recap-q", esc(q.prompt)));
      mid.appendChild(el("div", "recap-nums",
        "you " + esc(fmtVal(q, a.lo)) + "–" + esc(fmtVal(q, a.hi)) +
        " · truth <b>" + esc(fmtVal(q, q.answer)) + "</b> " + esc(q.unit)));
      row.appendChild(mid);
      row.appendChild(el("span", "recap-pts", "+" + a.pts));
      recap.appendChild(row);
    });
    screen.appendChild(recap);

    var actions = el("div", "action-row");
    var shareBtn = el("button", "btn btn-primary", "Challenge a friend");
    var statsBtn = el("button", "btn", "My stats");
    var practiceBtn = el("button", "btn btn-ghost",
      "Practice round");
    var archiveBtn = el("button", "btn btn-ghost", "Play the archive");
    actions.appendChild(shareBtn); actions.appendChild(statsBtn);
    actions.appendChild(practiceBtn); actions.appendChild(archiveBtn);
    screen.appendChild(actions);
    archiveBtn.addEventListener("click", openArchive);

    // launch-day only: point our own players at the Product Hunt page (auto-expires)
    var today = new Date();
    if (today.getFullYear() === 2026 && today.getMonth() === 7 && today.getDate() === 11) {
      var ph = el("a", "ph-banner", "🚀 Ballpark is live on Product Hunt today — support the launch →");
      ph.href = "https://www.producthunt.com/products/ballpark-the-daily-estimation-game?utm_source=ballpark&utm_medium=web";
      ph.target = "_blank";
      ph.rel = "noopener";
      ph.addEventListener("click", function () { track("event/ph-click"); });
      screen.appendChild(ph);
    }

    var cd = el("div", "countdown");
    screen.appendChild(cd);
    function tickCd() {
      // the moment the local day flips, the countdown becomes the play button
      if (dayNumber() !== n) {
        clearInterval(renderSummary._cd);
        cd.innerHTML = "";
        var playNew = el("button", "btn btn-primary", "New ballpark is ready — play #" + (dayNumber() + 1));
        playNew.addEventListener("click", startDaily);
        cd.appendChild(playNew);
        return;
      }
      var now = new Date();
      var mid = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      var s = Math.floor((mid - now) / 1000);
      var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
      cd.innerHTML = "Next ballpark in <b>" + h + "h " + (m < 10 ? "0" : "") + m + "m " + (ss < 10 ? "0" : "") + ss + "s</b>";
    }
    tickCd();
    clearInterval(renderSummary._cd);
    renderSummary._cd = setInterval(tickCd, 1000);
    summaryDay = n;

    shareBtn.addEventListener("click", function () {
      shareResult(shareGrid(n), challengeUrl(n, rec.score));
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
  function shuffled(arr) {
    var a = arr.slice();
    for (var k = a.length - 1; k > 0; k--) {
      var j = Math.floor(Math.random() * (k + 1));
      var tmp = a[k]; a[k] = a[j]; a[j] = tmp;
    }
    return a;
  }
  function startPractice() {
    summaryDay = null;

    // never serve the upcoming two weeks of dailies — practice must not spoil them
    var excluded = {};
    var n = dayNumber();
    for (var d = 0; d < 14; d++) puzzleForDay(n + d).forEach(function (id) { excluded[id] = 1; });
    var seen = {};
    Object.keys(state.history).forEach(function (k) {
      (state.history[k].answers || []).forEach(function (a) { if (a.qid) seen[a.qid] = 1; });
    });
    (state.practice.seen || []).forEach(function (id) { seen[id] = 1; });
    var pool = Object.keys(DATA.questions).filter(function (id) { return !excluded[id]; });
    var fresh = shuffled(pool.filter(function (id) { return !seen[id]; }));
    var qids = fresh.concat(shuffled(pool.filter(function (id) { return seen[id]; }))).slice(0, 5);

    var consumed = false;
    runSession({
      qids: qids,
      onAnswer: function (idx) {
        // practice is unlimited; the counter survives only so state.practice.seen
        // keeps steering later rounds toward questions this player hasn't met
        if (consumed) return;
        consumed = true;
        var today = String(dayNumber());
        if (state.practice.date !== today) { state.practice.date = today; state.practice.used = 0; }
        state.practice.used++;
        state.practice.seen = (state.practice.seen || []).concat(qids);
        saveState();
      },
      onDone: function (answers) {
        var score = answers.reduce(function (s, a) { return s + a.pts; }, 0);
        var hits = answers.filter(function (a) { return a.hit; }).length;
        var screen = el("div", "screen summary");
        screen.appendChild(el("div", "summary-kicker", "Practice · doesn't touch your streak"));
        screen.appendChild(el("div", "summary-score", score + "<span class='of'>/500</span>"));
        screen.appendChild(el("div", "summary-grid", answers.map(emojiFor).join("")));
        screen.appendChild(el("div", "summary-label", hits + " of 5 trapped"));
        var actions = el("div", "action-row");
        var again = el("button", "btn btn-primary", "Another round");
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
    openModal._opener = document.activeElement;
    var veil = el("div", "modal-veil");
    var modal = el("div", "modal");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    var close = el("button", "modal-close", "✕");
    close.setAttribute("aria-label", "Close");
    modal.appendChild(close);
    builder(modal);
    var h2 = modal.querySelector("h2");
    if (h2) { h2.id = "modal-title"; modal.setAttribute("aria-labelledby", "modal-title"); }
    veil.appendChild(modal);
    document.body.appendChild(veil);
    var app = document.getElementById("app");
    if (app) app.setAttribute("aria-hidden", "true");
    openModal._veil = veil;
    close.addEventListener("click", closeModal);
    veil.addEventListener("click", function (ev) { if (ev.target === veil) closeModal(); });
    veil.addEventListener("keydown", function (ev) {
      if (ev.key !== "Tab") return;
      var focusables = modal.querySelectorAll("button, a[href], input, [tabindex]:not([tabindex='-1'])");
      if (!focusables.length) return;
      var first = focusables[0], last = focusables[focusables.length - 1];
      if (ev.shiftKey && document.activeElement === first) { last.focus(); ev.preventDefault(); }
      else if (!ev.shiftKey && document.activeElement === last) { first.focus(); ev.preventDefault(); }
    });
    document.addEventListener("keydown", escClose);
    close.focus();
  }
  function escClose(ev) { if (ev.key === "Escape") closeModal(); }
  function closeModal() {
    if (openModal._veil) { openModal._veil.remove(); openModal._veil = null; }
    var app = document.getElementById("app");
    if (app) app.removeAttribute("aria-hidden");
    document.removeEventListener("keydown", escClose);
    if (openModal._opener && openModal._opener.focus && document.contains(openModal._opener)) {
      openModal._opener.focus();
    }
    openModal._opener = null;
  }

  function openHelp(firstRun) {
    openModal(function (m) {
      m.appendChild(el("h2", "", "How to play"));
      m.appendChild(el("div", "modal-sub", "Five questions a day. Don't guess the number — trap it."));
      var steps = [
        ["[ ]", "<b>Drag the brackets</b> to set your range. The truth has to land inside."],
        ["↔", "<b>Narrow range, big points.</b> Squeeze under a quarter of the track for a 🟩. Miss entirely: zero."],
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

      // category breakdown — where your gut is sharp and where it lies to you
      var cats = {};
      allAnswers.forEach(function (a) {
        var q = DATA.questions[a.qid];
        if (!q) return;
        var c = q.categoryName || "Other";
        cats[c] = cats[c] || { hit: 0, n: 0 };
        cats[c].n++; if (a.hit) cats[c].hit++;
      });
      var catBlock = el("div", "chart-block");
      catBlock.appendChild(el("div", "chart-title", "By category"));
      Object.keys(cats).sort().forEach(function (c) {
        var row = el("div", "chart-sub",
          esc(c) + " — " + Math.round(100 * cats[c].hit / cats[c].n) + "% over " + cats[c].n);
        catBlock.appendChild(row);
      });
      if (!Object.keys(cats).length) catBlock.appendChild(el("div", "chart-sub", "Play a few days to build this up."));
      m.appendChild(catBlock);
    });
  }

  /* The Pro store is closed. Archive, practice and the category breakdown are
     free for everyone. The payment path is intentionally left intact and
     dormant: validCode(), the ?code= redemption below, tools/make-code.js and
     the Stripe link in index.html all still work, so the handful of issued
     codes keep resolving and reopening a store is a UI change, not a rebuild.
     state.pro is still written by redemption and still fires pro-unlocked so
     the analytics series stays continuous — nothing reads it to gate a feature. */

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
    var s = currentStreak();
    document.getElementById("streak-n").textContent = s;
    // a zero next to a flame reads as failure — hide until a streak exists
    document.getElementById("btn-streak").style.display = s > 0 ? "" : "none";
  }

  // Pure core exposed for tests and tooling.
  window.BALLPARK_CORE = {
    posToVal: posToVal, valToPos: valToPos, snapVal: snapVal, fmtVal: fmtVal,
    quantizeRange: quantizeRange, scoreAnswer: scoreAnswer, emojiFor: emojiFor,
    dayNumber: dayNumber, puzzleForDay: puzzleForDay, validCode: validCode,
    streakBucket: streakBucket, distinctDaysPlayed: distinctDaysPlayed,
    initPlayer: initPlayer, isStandalone: isStandalone, STORE_KEY: STORE_KEY,
    recordDailyFinish: recordDailyFinish, once: once, newPlayerId: newPlayerId,
    _state: function () { return state; }
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

    // one beacon per session: surface silent crashes in analytics, no backend
    // needed. A short sanitized slug of the message makes errors diagnosable.
    var errorReported = false;
    function slugify(s) {
      return String(s).toLowerCase().replace(/https?:\/\/\S+/g, "").replace(/[^a-z0-9 ]+/g, " ")
        .trim().replace(/\s+/g, "-").slice(0, 72);
    }
    function reportError(kind, ev) {
      if (errorReported) return;
      errorReported = true;
      var parts = [kind];
      try {
        var src = ev && (ev.reason !== undefined && ev.reason !== null ? ev.reason : ev);
        // a message alone is often empty (cross-origin scripts, reason-less
        // rejections) — the constructor name and origin file are what make
        // those diagnosable, so record them too
        var name = src && src.name ? src.name
          : (src && src.constructor && src.constructor.name) || "";
        var msg = (src && src.message) || (typeof src === "string" ? src : "");
        if (name && name !== "Error") parts.push(slugify(name));
        if (msg) parts.push(slugify(msg));
        // filename is same-origin for our own scripts; strip the path, keep the file
        var file = ev && ev.filename ? String(ev.filename).split("/").pop() : "";
        if (file) parts.push(slugify(file) + (ev.lineno ? "-" + ev.lineno : ""));
      } catch (e) { parts.push("introspect-failed"); }
      var slug = parts.filter(Boolean).join("/") || "unknown";
      track("event/js-error/" + slug);
    }
    window.addEventListener("error", function (ev) { reportError("err", ev); });
    window.addEventListener("unhandledrejection", function (ev) { reportError("rej", ev); });

    // must run before the ?code= branch below rewrites the URL, or a first-time
    // visitor's acquisition source is erased before it is ever recorded
    initPlayer();
    // partitions every app load, so the start-rate denominator no longer mixes
    // installed-app re-opens with genuine browser arrivals
    track(isStandalone() ? "evt/launch/standalone" : "evt/launch/browser");

    // URL params: ?code= is Stripe's after-checkout return; ?d=&s= is a challenge link
    var challengeDayParam = NaN, challengeScoreParam = NaN;
    try {
      var params = new URLSearchParams(location.search);
      var urlCode = params.get("code");
      challengeDayParam = parseInt(params.get("d"), 10);
      challengeScoreParam = parseInt(params.get("s"), 10);
      if (urlCode && validCode(urlCode.trim().toUpperCase())) {
        if (!state.pro) { state.pro = true; saveState(); track("event/pro-unlocked"); }
        params.delete("code");
        var rest = params.toString();
        history.replaceState(null, "", location.pathname + (rest ? "?" + rest : ""));
        // everything a code used to unlock is free now, so thank them rather
        // than announce an unlock they already had
        setTimeout(function () { toast("Thanks for backing Ballpark ⚡"); }, 600);
      }
    } catch (e) {}

    // if the app was parked overnight (common for installed PWAs), wake into the new day
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible" && summaryDay !== null && dayNumber() !== summaryDay) {
        startDaily();
      }
    });

    // a fresh service worker means fresh code — reload once so the deploy lands now
    if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
      var reloaded = false;
      navigator.serviceWorker.addEventListener("controllerchange", function () {
        if (reloaded) return;
        reloaded = true;
        location.reload();
      });
    }

    refreshStreakBadge();
    if (!isNaN(challengeDayParam) && challengeDayParam >= 1 && challengeDayParam - 1 <= dayNumber()) {
      startChallenge(challengeDayParam - 1, isNaN(challengeScoreParam) ? null : challengeScoreParam);
    } else {
      startDaily();
    }

    if ("serviceWorker" in navigator && location.protocol !== "file:") {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    }
  }
})();
