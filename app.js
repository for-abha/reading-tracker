(function () {
  "use strict";

  // ---------- Storage helpers ----------
  const LOG_KEY = "rt_log_v1";       // { "YYYY-MM-DD": pagesTotal }
  const GOAL_KEY = "rt_goal_v1";     // number
  const BOOK_KEY = "rt_book_v1";     // { title, cover }
  const TIMER_KEY = "rt_timer_start_v1"; // ms timestamp or null

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }
  function saveJSON(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {
      console.error("Storage failed", e);
      showToast("Storage full — try removing the cover photo");
    }
  }

  function getLog() { return loadJSON(LOG_KEY, {}); }
  function setLog(log) { saveJSON(LOG_KEY, log); }
  function getGoal() { return loadJSON(GOAL_KEY, 20); }
  function setGoal(g) { saveJSON(GOAL_KEY, g); }
  function getBook() { return loadJSON(BOOK_KEY, { title: "", cover: "" }); }
  function setBook(b) { saveJSON(BOOK_KEY, b); }

  function todayStr(d) {
    const dt = d || new Date();
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const day = String(dt.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function fmtDate(d) {
    return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  }

  // ---------- Toast ----------
  let toastTimer = null;
  function showToast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
  }

  // ---------- Streak calc ----------
  function computeStreaks(log, goal) {
    // current streak: consecutive days ending today (or yesterday if today not yet met) where pages >= goal
    let current = 0;
    let cursor = new Date();
    // if today doesn't meet goal yet, start counting from yesterday so an in-progress day doesn't break the streak
    if (!(log[todayStr(cursor)] >= goal)) {
      cursor.setDate(cursor.getDate() - 1);
    }
    while (log[todayStr(cursor)] >= goal) {
      current++;
      cursor.setDate(cursor.getDate() - 1);
    }

    // best streak over stored history
    const dates = Object.keys(log).sort();
    let best = 0, run = 0, prev = null;
    for (const ds of dates) {
      if (log[ds] < goal) { run = 0; prev = null; continue; }
      const d = new Date(ds + "T00:00:00");
      if (prev) {
        const diffDays = Math.round((d - prev) / 86400000);
        run = diffDays === 1 ? run + 1 : 1;
      } else {
        run = 1;
      }
      best = Math.max(best, run);
      prev = d;
    }
    best = Math.max(best, current);
    return { current, best };
  }

  // ---------- Ring ----------
  const RING_R = 90;
  const RING_C = 2 * Math.PI * RING_R;

  function renderRing() {
    const log = getLog();
    const goal = getGoal();
    const pages = log[todayStr()] || 0;
    const pct = Math.max(0, Math.min(1, goal > 0 ? pages / goal : 0));

    const ring = document.getElementById("ring-progress");
    ring.style.strokeDasharray = `${RING_C}`;
    ring.style.strokeDashoffset = `${RING_C * (1 - pct)}`;

    document.getElementById("ring-pages").textContent = pages;
    document.getElementById("ring-goal").textContent = `of ${goal} page${goal === 1 ? "" : "s"}`;

    const msgEl = document.getElementById("ring-message");
    if (pages === 0) msgEl.textContent = "Start the timer whenever you pick up the book.";
    else if (pct < 0.5) msgEl.textContent = "Good start — keep going.";
    else if (pct < 1) msgEl.textContent = "Almost at today's goal.";
    else if (pct === 1) msgEl.textContent = "Goal reached today. Nicely done.";
    else msgEl.textContent = "Past your goal — great pace.";

    const { current } = computeStreaks(log, goal);
    document.getElementById("streak-count").textContent = current;
  }

  // ---------- Book card ----------
  function renderBook() {
    const book = getBook();
    const img = document.getElementById("book-cover-img");
    const titleEl = document.getElementById("book-title-display");
    if (book.cover) {
      img.src = book.cover;
      img.classList.remove("empty");
    } else {
      img.removeAttribute("src");
      img.classList.add("empty");
    }
    titleEl.textContent = book.title ? book.title : "Add a book";

    // settings mirror
    document.getElementById("settings-book-title").value = book.title || "";
    const preview = document.getElementById("settings-cover-preview");
    if (book.cover) { preview.src = book.cover; preview.classList.remove("empty"); }
    else { preview.removeAttribute("src"); preview.classList.add("empty"); }
  }

  // ---------- Adding pages ----------
  function addPages(n) {
    if (!n || n <= 0) return;
    const log = getLog();
    const key = todayStr();
    log[key] = (log[key] || 0) + n;
    setLog(log);
    renderRing();
    renderHistory();
    showToast(`+${n} pages logged`);
  }

  // ---------- Timer ----------
  let timerInterval = null;

  function timerStart() {
    return loadJSON(TIMER_KEY, null);
  }

  function startTimer() {
    const now = Date.now();
    saveJSON(TIMER_KEY, now);
    updateTimerUI(true);
    tickTimer();
    timerInterval = setInterval(tickTimer, 1000);
  }

  function stopTimer() {
    const start = timerStart();
    clearInterval(timerInterval);
    timerInterval = null;
    saveJSON(TIMER_KEY, null);
    updateTimerUI(false);
    document.getElementById("timer-display").textContent = "00:00";
    if (!start) return;
    const durationSec = Math.max(1, Math.round((Date.now() - start) / 1000));
    openPagesModal(durationSec);
  }

  function tickTimer() {
    const start = timerStart();
    if (!start) return;
    const elapsed = Math.floor((Date.now() - start) / 1000);
    document.getElementById("timer-display").textContent = formatDuration(elapsed);
  }

  function formatDuration(totalSec) {
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function updateTimerUI(running) {
    const btn = document.getElementById("timer-btn");
    if (running) {
      btn.textContent = "Stop reading";
      btn.classList.remove("start");
      btn.classList.add("stop");
    } else {
      btn.textContent = "Start reading";
      btn.classList.remove("stop");
      btn.classList.add("start");
    }
  }

  function resumeTimerIfRunning() {
    const start = timerStart();
    if (start) {
      updateTimerUI(true);
      tickTimer();
      timerInterval = setInterval(tickTimer, 1000);
    }
  }

  // ---------- Pages modal ----------
  let pendingDurationSec = 0;

  function openPagesModal(durationSec) {
    pendingDurationSec = durationSec;
    document.getElementById("modal-duration").textContent = formatDuration(durationSec).replace(/^0(\d):/, "$1:") + (durationSec < 60 ? "s" : " min");
    document.getElementById("modal-pages-input").value = "";
    document.getElementById("modal-overlay").classList.add("show");
    setTimeout(() => document.getElementById("modal-pages-input").focus(), 150);
  }

  function closePagesModal() {
    document.getElementById("modal-overlay").classList.remove("show");
  }

  // ---------- Heatmap ----------
  function renderHistory() {
    const log = getLog();
    const goal = getGoal();
    const { current, best } = computeStreaks(log, goal);

    document.getElementById("stat-current-streak").textContent = current;
    document.getElementById("stat-best-streak").textContent = best;

    const DAYS = 35;
    let total = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // day-of-week header (align grid to start on Sunday of the earliest shown week)
    const start = new Date(today);
    start.setDate(start.getDate() - (DAYS - 1));
    const startDow = start.getDay();
    start.setDate(start.getDate() - startDow);

    const dowRow = document.getElementById("heat-dow-row");
    dowRow.innerHTML = "";
    ["S", "M", "T", "W", "T", "F", "S"].forEach((d) => {
      const el = document.createElement("div");
      el.className = "heat-dow";
      el.textContent = d;
      dowRow.appendChild(el);
    });

    const grid = document.getElementById("heatmap");
    grid.innerHTML = "";
    const totalCells = 7 * 5;
    for (let i = 0; i < totalCells; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const cell = document.createElement("div");
      cell.className = "heat-cell";

      if (d > today) {
        cell.classList.add("future");
      } else {
        const key = todayStr(d);
        const pages = log[key] || 0;
        if (d >= new Date(today.getTime() - (DAYS - 1) * 86400000)) total += pages;

        const ratio = goal > 0 ? pages / goal : 0;
        let bg = "var(--surface-2)";
        if (ratio >= 1) bg = "var(--gold)";
        else if (ratio >= 0.5) bg = "var(--sage)";
        else if (ratio > 0) bg = "var(--sage-soft)";
        cell.style.background = bg;

        cell.addEventListener("click", () => {
          const label = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
          document.getElementById("heat-caption").textContent =
            pages > 0 ? `${label} — ${pages} page${pages === 1 ? "" : "s"}` : `${label} — no reading logged`;
        });
      }
      grid.appendChild(cell);
    }

    document.getElementById("stat-total-pages").textContent = total;
  }

  // ---------- Nav ----------
  function switchView(view) {
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    document.getElementById(`view-${view}`).classList.add("active");
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
    if (view === "history") renderHistory();
  }

  // ---------- Image handling ----------
  function fileToDataURL(file, maxDim) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            const scale = maxDim / Math.max(width, height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", 0.82));
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // ---------- Init ----------
  function init() {
    document.getElementById("today-date").textContent = fmtDate(new Date());
    renderBook();
    renderRing();
    renderHistory();
    document.getElementById("settings-goal").value = getGoal();
    resumeTimerIfRunning();

    // Nav
    document.querySelectorAll(".nav-btn").forEach((btn) => {
      btn.addEventListener("click", () => switchView(btn.dataset.view));
    });

    // Quick add chips
    document.querySelectorAll(".chip[data-add]").forEach((chip) => {
      chip.addEventListener("click", () => addPages(parseInt(chip.dataset.add, 10)));
    });

    // Manual add
    document.getElementById("manual-add-btn").addEventListener("click", () => {
      const input = document.getElementById("manual-pages");
      const n = parseInt(input.value, 10);
      if (n > 0) { addPages(n); input.value = ""; }
    });

    // Timer
    document.getElementById("timer-btn").addEventListener("click", () => {
      if (timerStart()) stopTimer();
      else startTimer();
    });

    // Modal
    document.getElementById("modal-save-btn").addEventListener("click", () => {
      const n = parseInt(document.getElementById("modal-pages-input").value, 10);
      closePagesModal();
      if (n > 0) addPages(n);
    });
    document.getElementById("modal-skip-btn").addEventListener("click", closePagesModal);

    // Settings: edit book shortcut from Today
    document.getElementById("edit-book-btn").addEventListener("click", () => switchView("settings"));

    // Settings: cover upload
    document.getElementById("settings-upload-btn").addEventListener("click", () => {
      document.getElementById("cover-file-input").click();
    });
    document.getElementById("settings-cover-preview").addEventListener("click", () => {
      document.getElementById("cover-file-input").click();
    });
    document.getElementById("cover-file-input").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const dataUrl = await fileToDataURL(file, 500);
        const book = getBook();
        book.cover = dataUrl;
        setBook(book);
        renderBook();
        showToast("Cover updated");
      } catch (err) {
        showToast("Couldn't read that image");
      }
    });

    // Settings: save
    document.getElementById("settings-save-btn").addEventListener("click", () => {
      const title = document.getElementById("settings-book-title").value.trim();
      const goalVal = parseInt(document.getElementById("settings-goal").value, 10);
      const book = getBook();
      book.title = title;
      setBook(book);
      if (goalVal > 0) setGoal(goalVal);
      renderBook();
      renderRing();
      renderHistory();
      showToast("Saved");
    });

    // Reset
    document.getElementById("reset-btn").addEventListener("click", () => {
      if (confirm("Erase all reading data? This can't be undone.")) {
        localStorage.removeItem(LOG_KEY);
        localStorage.removeItem(GOAL_KEY);
        localStorage.removeItem(BOOK_KEY);
        localStorage.removeItem(TIMER_KEY);
        location.reload();
      }
    });

    // Service worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
