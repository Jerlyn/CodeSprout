/* ============================================================
   Number Bonds Explorer — app logic
   All state persists to localStorage. No external requests.
   ============================================================ */

(function () {
  "use strict";

  const STORAGE_KEY = "numberbonds.v1";
  const TARGET_PRESETS = [5, 6, 10, 20, 50, 100];
  const MISSING_WEIGHTS = ["partA", "partB", "partB", "whole"]; // parts come up slightly more than the whole
  const WORKSHEET_SIZE = 12;

  // ---------- 1. Persisted progress ----------
  const defaultProgress = {
    audioEnabled: true,
    voiceURI: "",
    stars: 0,
    streakCount: 0,
    lastPlayedDate: null,
    unlockedBadges: [],
    targetNumber: 6
  };

  // Fields cleared by "Reset progress" — sound/voice/target are left alone on purpose.
  const RESETTABLE_FIELDS = ["stars", "streakCount", "lastPlayedDate", "unlockedBadges"];

  function loadProgress() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...defaultProgress };
      return { ...defaultProgress, ...JSON.parse(raw) };
    } catch (e) {
      return { ...defaultProgress };
    }
  }

  function saveProgress() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    } catch (e) { /* storage unavailable — fail silently, game still works */ }
  }

  const progress = loadProgress();

  const BADGE_MILESTONES = [
    { threshold: 10, name: "First Sparks", emoji: "✨", accentClass: "accent-green" },
    { threshold: 25, name: "Bond Builder", emoji: "🧩", accentClass: "accent-cyan" },
    { threshold: 50, name: "Number Ninja", emoji: "🚀", accentClass: "accent-pink" },
    { threshold: 100, name: "Math Wizard", emoji: "🪄", accentClass: "accent-yellow" },
    { threshold: 200, name: "Bond Champion", emoji: "🏆", accentClass: "accent-red" }
  ];

  // ---------- 2. App state ----------
  let activeTarget = progress.targetNumber;
  let currentMode = "bonds";
  let currentBond = { whole: 6, partA: 4, partB: 2, missingNode: "partB" };
  let showDots = true;
  let worksheetData = [];
  let lastGameMode = "bonds";
  let practiceStreak = 0; // in-session correct-in-a-row streak shown next to the bond card

  // ---------- 3. DOM refs ----------
  const $ = (id) => document.getElementById(id);
  const audioToggleBtn = $("audio-toggle-btn");
  const audioIconOn = $("audio-icon-on");
  const audioIconOff = $("audio-icon-off");
  const streakCountEl = $("streak-count");
  const starCountEl = $("star-count");
  const streakCountLgEl = $("streak-count-lg");
  const starCountLgEl = $("star-count-lg");
  const bondStreakEl = $("bond-streak");
  const badgeRow = $("badge-row");
  const toastEl = $("toast");
  const targetGrid = $("target-grid");

  // ================================================================
  // Streak tracking (consecutive calendar days played)
  // ================================================================
  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  function daysBetween(a, b) {
    const da = new Date(a), db = new Date(b);
    return Math.round((db - da) / 86400000);
  }

  function registerDailyVisit() {
    const today = todayStr();
    if (progress.lastPlayedDate === today) return;
    if (progress.lastPlayedDate) {
      const gap = daysBetween(progress.lastPlayedDate, today);
      progress.streakCount = gap === 1 ? progress.streakCount + 1 : 1;
    } else {
      progress.streakCount = 1;
    }
    progress.lastPlayedDate = today;
    saveProgress();
  }

  // ================================================================
  // Stars & badges
  // ================================================================
  function awardStars(n) {
    progress.stars += n;
    saveProgress();
    updateStatStrip();
    checkBadges();
  }

  function checkBadges() {
    BADGE_MILESTONES.forEach((b) => {
      if (progress.stars >= b.threshold && !progress.unlockedBadges.includes(b.name)) {
        progress.unlockedBadges.push(b.name);
        saveProgress();
        showToast(`${b.emoji} Badge unlocked: ${b.name}!`);
        burstConfetti(1.4);
      }
    });
    renderBadges();
  }

  function renderBadges() {
    badgeRow.innerHTML = "";
    BADGE_MILESTONES.forEach((b) => {
      const unlocked = progress.unlockedBadges.includes(b.name);
      const chip = document.createElement("span");
      chip.className = "badge-chip" + (unlocked ? ` ${b.accentClass}` : " badge-chip--locked");
      chip.innerHTML = `<span aria-hidden="true">${unlocked ? b.emoji : "🔒"}</span> ${b.name}`;
      chip.title = unlocked ? `Unlocked at ${b.threshold} stars` : `Unlock at ${b.threshold} stars`;
      badgeRow.appendChild(chip);
    });
  }

  function updateStatStrip() {
    streakCountEl.textContent = progress.streakCount;
    starCountEl.textContent = progress.stars;
    if (streakCountLgEl) streakCountLgEl.textContent = progress.streakCount;
    if (starCountLgEl) starCountLgEl.textContent = progress.stars;
    if (bondStreakEl) bondStreakEl.textContent = progress.streakCount;
  }

  // ================================================================
  // Toast
  // ================================================================
  let toastTimer = null;
  function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("is-visible"), 2200);
  }

  // ================================================================
  // Audio: speech synthesis (question prompts) + generated tones (SFX)
  // ================================================================
  function speakText(text) {
    if (!progress.audioEnabled || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1.05;
    utterance.lang = "en-US";
    const chosenVoice = getChosenVoice();
    if (chosenVoice) utterance.voice = chosenVoice;
    window.speechSynthesis.speak(utterance);
  }

  // ================================================================
  // Voice selection (Web Speech API — voice list is device/browser-dependent
  // and often loads asynchronously, especially on Android Chrome).
  // ================================================================
  let cachedVoices = [];

  function getChosenVoice() {
    if (!progress.voiceURI) return null;
    return cachedVoices.find((v) => v.voiceURI === progress.voiceURI) || null;
  }

  function refreshVoiceList() {
    if (!("speechSynthesis" in window)) return;
    cachedVoices = window.speechSynthesis.getVoices();
    renderVoiceSelect();
  }

  function renderVoiceSelect() {
    const select = $("voice-select");
    if (!select) return;
    const englishVoices = cachedVoices.filter((v) => v.lang && v.lang.toLowerCase().startsWith("en"));
    const list = englishVoices.length ? englishVoices : cachedVoices;

    select.innerHTML = "";
    const defaultOpt = document.createElement("option");
    defaultOpt.value = "";
    defaultOpt.textContent = "Device default";
    select.appendChild(defaultOpt);

    list.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v.voiceURI;
      opt.textContent = `${v.name} (${v.lang})`;
      select.appendChild(opt);
    });

    select.value = list.some((v) => v.voiceURI === progress.voiceURI) ? progress.voiceURI : "";
  }

  function handleVoiceChange(voiceURI) {
    progress.voiceURI = voiceURI;
    saveProgress();
    speakText("Hi! I'm your number bonds buddy.");
  }

  function resetProgress() {
    const ok = window.confirm("Reset stars, streak, and badges on this device? This can't be undone.");
    if (!ok) return;
    RESETTABLE_FIELDS.forEach((field) => { progress[field] = defaultProgress[field]; });
    progress.unlockedBadges = [];
    progress.lastPlayedDate = null;
    saveProgress();
    updateStatStrip();
    renderBadges();
    showToast("Progress reset.");
  }

  let audioCtx = null;
  function getAudioCtx() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    return audioCtx;
  }

  // Simple generated tone stings — no audio files needed, works fully offline.
  function playTone(freqs, { duration = 0.14, gap = 0.03, type = "sine", volume = 0.18 } = {}) {
    if (!progress.audioEnabled) return;
    const ctx = getAudioCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();
    let t = ctx.currentTime;
    freqs.forEach((f) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(f, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(volume, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + duration + 0.02);
      t += duration + gap;
    });
  }

  const sfx = {
    correct: () => playTone([523.25, 659.25, 783.99], { duration: 0.12, gap: 0.02 }), // C-E-G
    incorrect: () => playTone([220, 174.6], { duration: 0.16, gap: 0.02, type: "triangle", volume: 0.14 }),
    tap: () => playTone([660], { duration: 0.06, type: "square", volume: 0.1 }),
    celebrate: () => playTone([523.25, 659.25, 783.99, 1046.5], { duration: 0.1, gap: 0.015 })
  };

  function setAudioButtonUI() {
    audioIconOn.hidden = !progress.audioEnabled;
    audioIconOff.hidden = progress.audioEnabled;
    audioToggleBtn.setAttribute("aria-pressed", String(progress.audioEnabled));
    audioToggleBtn.setAttribute("aria-label", progress.audioEnabled ? "Turn audio prompts off" : "Turn audio prompts on");
  }

  function toggleAudio() {
    progress.audioEnabled = !progress.audioEnabled;
    saveProgress();
    setAudioButtonUI();
    if (!progress.audioEnabled) window.speechSynthesis && window.speechSynthesis.cancel();
  }

  // ================================================================
  // Confetti (hand-rolled canvas, no external library)
  // ================================================================
  const confettiCanvas = $("confetti-canvas");
  const confettiCtx = confettiCanvas.getContext("2d");
  let confettiParticles = [];
  let confettiRAF = null;
  const CONFETTI_COLORS = ["#36069A", "#8FBCF2", "#84D9A8", "#F2A0C4", "#BBA8F0", "#F5B77E"];

  function resizeConfettiCanvas() {
    confettiCanvas.width = window.innerWidth;
    confettiCanvas.height = window.innerHeight;
  }
  window.addEventListener("resize", resizeConfettiCanvas);
  resizeConfettiCanvas();

  function burstConfetti(intensity = 1) {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const count = Math.round(60 * intensity);
    for (let i = 0; i < count; i++) {
      confettiParticles.push({
        x: confettiCanvas.width / 2 + (Math.random() - 0.5) * 120,
        y: confettiCanvas.height * 0.3,
        vx: (Math.random() - 0.5) * 8,
        vy: -Math.random() * 9 - 4,
        size: Math.random() * 7 + 4,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.3,
        life: 0
      });
    }
    if (!confettiRAF) confettiRAF = requestAnimationFrame(tickConfetti);
  }

  function tickConfetti() {
    confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    confettiParticles.forEach((p) => {
      p.vy += 0.25; // gravity
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.rotSpeed;
      p.life += 1;
      confettiCtx.save();
      confettiCtx.translate(p.x, p.y);
      confettiCtx.rotate(p.rotation);
      confettiCtx.fillStyle = p.color;
      confettiCtx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      confettiCtx.restore();
    });
    confettiParticles = confettiParticles.filter((p) => p.y < confettiCanvas.height + 40 && p.life < 260);
    if (confettiParticles.length > 0) {
      confettiRAF = requestAnimationFrame(tickConfetti);
    } else {
      confettiRAF = null;
    }
  }

  // ================================================================
  // Target number
  // ================================================================
  function renderTargetGrid() {
    targetGrid.innerHTML = "";
    TARGET_PRESETS.forEach((n) => {
      const btn = document.createElement("button");
      btn.className = "module-btn";
      btn.type = "button";
      btn.textContent = n;
      btn.setAttribute("aria-pressed", String(n === activeTarget));
      btn.addEventListener("click", () => setTargetNumber(n));
      targetGrid.appendChild(btn);
    });
    $("custom-target-input").value = activeTarget;
    $("custom-target-slider").value = Math.min(100, Math.max(2, activeTarget));
  }

  function setTargetNumber(n) {
    activeTarget = Math.min(100, Math.max(2, parseInt(n, 10) || 6));
    progress.targetNumber = activeTarget;
    saveProgress();
    $("bond-target-label").textContent = activeTarget;
    $("worksheet-target-label").textContent = activeTarget;
    $("print-target-label").textContent = activeTarget;
    renderTargetGrid();
    sfx.tap();
    if (currentMode === "bonds") generateBond();
    if (currentMode === "worksheet") generateWorksheet();
  }

  // ================================================================
  // Mode switching
  // ================================================================
  const MODES = ["bonds", "worksheet"];

  function switchMode(mode) {
    currentMode = mode;
    lastGameMode = mode;
    MODES.forEach((m) => {
      $(`tab-${m}`).setAttribute("aria-selected", String(m === mode));
      $(`mode-${m}`).hidden = m !== mode;
    });
    if (mode === "worksheet" && worksheetData.length === 0) generateWorksheet();
  }

  // ================================================================
  // 1. Bonds practice
  // ================================================================
  function generateBond() {
    const partA = Math.floor(Math.random() * (activeTarget + 1));
    const partB = activeTarget - partA;
    const missingNode = MISSING_WEIGHTS[Math.floor(Math.random() * MISSING_WEIGHTS.length)];

    currentBond = { whole: activeTarget, partA, partB, missingNode };
    renderBondUI();
    speakBondPrompt();
  }

  function renderBondUI() {
    const nodeWhole = $("node-whole");
    const nodePartA = $("node-partA");
    const nodePartB = $("node-partB");
    const valWhole = $("val-whole");
    const valPartA = $("val-partA");
    const valPartB = $("val-partB");

    [nodeWhole, nodePartA, nodePartB].forEach((n) => n.classList.remove("is-target", "is-correct", "is-wrong"));

    valWhole.textContent = currentBond.missingNode === "whole" ? "?" : currentBond.whole;
    valPartA.textContent = currentBond.missingNode === "partA" ? "?" : currentBond.partA;
    valPartB.textContent = currentBond.missingNode === "partB" ? "?" : currentBond.partB;

    $(`node-${currentBond.missingNode}`).classList.add("is-target");
    renderDots();
  }

  function renderDots() {
    const grid = $("dots-grid");
    grid.innerHTML = "";

    if (!showDots) {
      grid.innerHTML = '<span class="dots-note">Visual helper hidden</span>';
      return;
    }

    const total = currentBond.whole;
    if (total > 30) {
      grid.innerHTML = `<span class="dots-note">The whole is ${total}. Count up from the given part!</span>`;
      return;
    }

    const { partA, partB, missingNode } = currentBond;

    if (missingNode !== "partA") {
      for (let i = 0; i < partA; i++) {
        const dot = document.createElement("span");
        dot.className = "dot dot--a";
        dot.textContent = i + 1;
        grid.appendChild(dot);
      }
    }
    if (missingNode === "whole" && partA > 0 && partB > 0) {
      const sep = document.createElement("span");
      sep.textContent = "+";
      sep.style.fontWeight = "800";
      sep.style.color = "var(--text-muted)";
      grid.appendChild(sep);
    }
    if (missingNode !== "partB") {
      for (let i = 0; i < partB; i++) {
        const dot = document.createElement("span");
        dot.className = "dot dot--b";
        dot.textContent = i + 1;
        grid.appendChild(dot);
      }
    }
    if (missingNode !== "whole") {
      const knownPart = missingNode === "partA" ? partB : partA;
      const missingCount = total - knownPart;
      for (let i = 0; i < missingCount; i++) {
        const dot = document.createElement("span");
        dot.className = "dot dot--empty";
        dot.textContent = "?";
        grid.appendChild(dot);
      }
    }
  }

  function toggleDots() {
    showDots = !showDots;
    $("dots-toggle-btn").textContent = showDots ? "Hide dots" : "Show dots";
    renderDots();
  }

  function speakBondPrompt() {
    const { whole, partA, partB, missingNode } = currentBond;
    if (missingNode === "whole") speakText(`${partA} plus ${partB} equals what number?`);
    else if (missingNode === "partA") speakText(`What number plus ${partB} makes ${whole}?`);
    else speakText(`${partA} plus what number makes ${whole}?`);
  }

  function typeDigit(digit) {
    sfx.tap();
    const el = $(`val-${currentBond.missingNode}`);
    const current = el.textContent;
    if (current === "?" || current === "0") el.textContent = digit;
    else if (current.length < 3) el.textContent = current + digit;
  }

  function backspaceDigit() {
    sfx.tap();
    const el = $(`val-${currentBond.missingNode}`);
    const current = el.textContent;
    el.textContent = current.length <= 1 ? "?" : current.slice(0, -1);
  }

  function clearInput() {
    sfx.tap();
    $(`val-${currentBond.missingNode}`).textContent = "?";
  }

  function checkBond() {
    const el = $(`val-${currentBond.missingNode}`);
    const nodeEl = $(`node-${currentBond.missingNode}`);
    const feedback = $("bond-feedback");
    if (el.textContent === "?") return;

    const userVal = parseInt(el.textContent, 10);
    const expected = currentBond[currentBond.missingNode];

    if (userVal === expected) {
      nodeEl.classList.add("is-correct");
      feedback.textContent = "Correct! Great job.";
      sfx.correct();
      practiceStreak += 1; // in-session streak, separate from the daily-visit streak in the header
      bondStreakEl.textContent = practiceStreak;
      awardStars(1);
      if (practiceStreak % 5 === 0) {
        sfx.celebrate();
        burstConfetti(1);
      }
      setTimeout(generateBond, 800);
    } else {
      nodeEl.classList.add("is-wrong");
      feedback.textContent = "Not quite — try again.";
      sfx.incorrect();
      practiceStreak = 0;
      bondStreakEl.textContent = practiceStreak;
      setTimeout(() => {
        nodeEl.classList.remove("is-wrong");
        el.textContent = "?";
      }, 700);
    }
  }

  // ================================================================
  // 2. Worksheet (printable)
  // ================================================================
  function generateWorksheet() {
    const grid = $("worksheet-grid");
    grid.innerHTML = "";
    worksheetData = [];

    $("worksheet-target-label").textContent = activeTarget;
    $("print-target-label").textContent = activeTarget;

    for (let i = 1; i <= WORKSHEET_SIZE; i++) {
      const partA = Math.floor(Math.random() * (activeTarget + 1));
      const partB = activeTarget - partA;
      const missingNode = MISSING_WEIGHTS[Math.floor(Math.random() * MISSING_WEIGHTS.length)];
      const item = { id: i, whole: activeTarget, partA, partB, missingNode, userAnswer: null };
      worksheetData.push(item);
      grid.appendChild(buildWorksheetCard(item));
    }
  }

  function buildWorksheetCard(item) {
    const card = document.createElement("div");
    card.className = "ws-card";

    const index = document.createElement("span");
    index.className = "ws-card__index";
    index.textContent = `#${item.id}`;
    card.appendChild(index);

    const stage = document.createElement("div");
    stage.className = "ws-stage";
    stage.innerHTML = `
      <svg class="ws-lines" viewBox="0 0 160 118" preserveAspectRatio="none" aria-hidden="true">
        <line x1="80" y1="26" x2="30" y2="92"></line>
        <line x1="80" y1="26" x2="130" y2="92"></line>
      </svg>
      <div class="ws-node ws-node--whole">${nodeContent(item, "whole")}</div>
      <div class="ws-node ws-node--partA">${nodeContent(item, "partA")}</div>
      <div class="ws-node ws-node--partB">${nodeContent(item, "partB")}</div>
    `;
    card.appendChild(stage);
    return card;
  }

  function nodeContent(item, node) {
    if (item.missingNode !== node) return item[node];
    const label = node === "whole" ? "Whole number" : node === "partA" ? "First part" : "Second part";
    return `<input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="3" class="ws-input" id="ws-input-${item.id}" aria-label="${label}, missing number, item ${item.id}" data-id="${item.id}">`;
  }

  function handleWorksheetInput(e) {
    const input = e.target.closest(".ws-input");
    if (!input) return;
    const item = worksheetData.find((x) => x.id === parseInt(input.dataset.id, 10));
    if (item) item.userAnswer = input.value !== "" ? parseInt(input.value, 10) : null;
  }

  function checkWorksheet() {
    let correctCount = 0;
    worksheetData.forEach((item) => {
      const expected = item[item.missingNode];
      const input = $(`ws-input-${item.id}`);
      if (!input) return;
      input.classList.remove("is-correct", "is-wrong");
      if (item.userAnswer === expected) {
        correctCount++;
        input.classList.add("is-correct");
      } else {
        input.classList.add("is-wrong");
      }
    });

    const total = worksheetData.length;
    $("worksheet-feedback").textContent = `${correctCount} of ${total} correct.`;

    if (correctCount === total) {
      sfx.celebrate();
      awardStars(10);
      burstConfetti(1.6);
      showToast("Whole worksheet correct! 🎉");
    } else if (correctCount > 0) {
      sfx.correct();
      awardStars(correctCount);
    } else {
      sfx.incorrect();
    }
  }

  // ================================================================
  // Offline banner
  // ================================================================
  function updateOfflineBanner() {
    $("offline-banner").classList.toggle("is-visible", !navigator.onLine);
  }
  window.addEventListener("online", updateOfflineBanner);
  window.addEventListener("offline", updateOfflineBanner);

  // ================================================================
  // Sheets (Progress, Settings) — opt-in detail instead of permanent chrome
  // ================================================================
  function openSheet(sheetId, backdropId, triggerId) {
    $(sheetId).hidden = false;
    $(backdropId).hidden = false;
    if (triggerId) $(triggerId).setAttribute("aria-expanded", "true");
    const closeBtn = $(sheetId).querySelector(".sheet__close");
    if (closeBtn) closeBtn.focus();
  }

  function closeSheet(sheetId, backdropId, triggerId) {
    $(sheetId).hidden = true;
    $(backdropId).hidden = true;
    if (triggerId) $(triggerId).setAttribute("aria-expanded", "false");
  }

  function wireSheet({ triggerId, sheetId, backdropId, closeId, onOpen }) {
    const trigger = $(triggerId);
    const backdrop = $(backdropId);
    const closeBtn = $(closeId);
    trigger.addEventListener("click", () => {
      if (onOpen) onOpen();
      openSheet(sheetId, backdropId, triggerId);
    });
    closeBtn.addEventListener("click", () => closeSheet(sheetId, backdropId, triggerId));
    backdrop.addEventListener("click", () => closeSheet(sheetId, backdropId, triggerId));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !$(sheetId).hidden) closeSheet(sheetId, backdropId, triggerId);
    });
  }

  // ================================================================
  // Android / Chrome install prompt
  // ================================================================
  let deferredInstallPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    $("install-app-btn").hidden = false;
    $("install-hint").hidden = true;
  });

  function wireInstallButton() {
    $("install-app-btn").addEventListener("click", async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      const { outcome } = await deferredInstallPrompt.userChoice;
      if (outcome === "accepted") showToast("Installed! Find it on your home screen.");
      deferredInstallPrompt = null;
      $("install-app-btn").hidden = true;
    });
  }

  window.addEventListener("appinstalled", () => {
    $("install-app-btn").hidden = true;
    showToast("Installed! Find it on your home screen.");
  });

  // ================================================================
  // Event wiring
  // ================================================================
  function wireEvents() {
    audioToggleBtn.addEventListener("click", toggleAudio);

    MODES.forEach((m) => $(`tab-${m}`).addEventListener("click", () => switchMode(m)));

    $("keypad").addEventListener("click", (e) => {
      const btn = e.target.closest(".key-tile");
      if (!btn) return;
      if (btn.id === "key-backspace") backspaceDigit();
      else if (btn.id === "key-clear") clearInput();
      else if (btn.dataset.digit != null) typeDigit(btn.dataset.digit);
    });

    $("check-bond-btn").addEventListener("click", checkBond);
    $("new-bond-btn").addEventListener("click", () => { sfx.tap(); generateBond(); });
    $("dots-toggle-btn").addEventListener("click", toggleDots);

    ["node-whole", "node-partA", "node-partB"].forEach((id) => {
      $(id).addEventListener("click", () => {
        if (id === `node-${currentBond.missingNode}`) speakBondPrompt();
      });
    });

    document.addEventListener("keydown", (e) => {
      if (currentMode !== "bonds" || !$("mode-bonds") || $("mode-bonds").hidden) return;
      if (document.activeElement && document.activeElement.tagName === "INPUT") return;
      if (e.key >= "0" && e.key <= "9") typeDigit(e.key);
      else if (e.key === "Backspace") backspaceDigit();
      else if (e.key === "Enter") checkBond();
    });

    $("new-worksheet-btn").addEventListener("click", () => { sfx.tap(); generateWorksheet(); });
    $("print-worksheet-btn").addEventListener("click", () => window.print());
    $("check-worksheet-btn").addEventListener("click", checkWorksheet);
    $("worksheet-grid").addEventListener("input", handleWorksheetInput);

    $("target-minus-btn").addEventListener("click", () => {
      const input = $("custom-target-input");
      const val = Math.max(2, (parseInt(input.value, 10) || 6) - 1);
      input.value = val;
      $("custom-target-slider").value = val;
      sfx.tap();
    });
    $("target-plus-btn").addEventListener("click", () => {
      const input = $("custom-target-input");
      const val = Math.min(100, (parseInt(input.value, 10) || 6) + 1);
      input.value = val;
      $("custom-target-slider").value = val;
      sfx.tap();
    });
    $("custom-target-slider").addEventListener("input", (e) => {
      $("custom-target-input").value = e.target.value;
    });
    $("apply-target-btn").addEventListener("click", () => {
      setTargetNumber($("custom-target-input").value);
    });

    wireSheet({ triggerId: "progress-chip", sheetId: "progress-sheet", backdropId: "progress-backdrop", closeId: "progress-sheet-close" });
    wireSheet({
      triggerId: "settings-btn",
      sheetId: "settings-sheet",
      backdropId: "settings-backdrop",
      closeId: "settings-sheet-close",
      onOpen: () => { renderTargetGrid(); refreshVoiceList(); }
    });

    $("voice-select").addEventListener("change", (e) => handleVoiceChange(e.target.value));
    $("test-voice-btn").addEventListener("click", () => speakText("Hi! I'm your number bonds buddy."));
    $("reset-progress-btn").addEventListener("click", resetProgress);

    if ("speechSynthesis" in window) {
      window.speechSynthesis.addEventListener("voiceschanged", refreshVoiceList);
    }

    wireInstallButton();
  }

  // ================================================================
  // Service worker registration (offline support)
  // ================================================================
  function registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("sw.js").catch(() => { /* offline-first still degrades gracefully */ });
      });
    }
  }

  // ================================================================
  // Init
  // ================================================================
  function init() {
    setAudioButtonUI();
    updateStatStrip();
    renderBadges();
    registerDailyVisit();
    updateStatStrip();
    updateOfflineBanner();
    wireEvents();

    $("bond-target-label").textContent = activeTarget;
    $("worksheet-target-label").textContent = activeTarget;
    $("print-target-label").textContent = activeTarget;
    renderTargetGrid();

    generateBond();
    generateWorksheet();
    refreshVoiceList();
    registerServiceWorker();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
