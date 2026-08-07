/* ============================================================
   Sight Words Explorer — app logic
   All state persists to localStorage. No external requests.
   ============================================================ */

(function () {
  "use strict";

  // ---------- 1. Word dataset (HMH Into Reading — Kindergarten HFW) ----------
  const sightWordsData = {
    1: { 1: ["the"], 2: ["a"], 3: ["see"], 4: ["I"] },
    2: { 1: ["by", "my", "to"], 2: ["am", "at", "go"], 3: ["is", "man", "no"], 4: ["and", "can", "you"] },
    3: { 1: ["an", "has", "it"], 2: ["he", "ran", "she"], 3: ["did", "in", "put"], 4: ["me", "sits", "with"] },
    4: { 1: ["big", "good", "his", "very"], 2: ["got", "here", "of", "on"], 3: ["are", "lot", "not", "was"], 4: ["be", "do", "had", "ten"] },
    5: { 1: ["but", "look", "up", "want"], 2: ["for", "her", "him", "us"], 3: ["help", "they", "too", "yes"], 4: ["have", "six", "some", "we"] },
    6: { 1: ["get", "hot", "or", "where"], 2: ["come", "from", "if", "stop"], 3: ["as", "our", "red", "that"], 4: ["cut", "must", "said", "when"] },
    7: { 1: ["down", "off", "so", "will"], 2: ["back", "let", "were", "what"], 3: ["could", "now", "then", "this"], 4: ["tell", "well", "who", "your"] },
    8: { 1: ["know", "out", "same", "take"], 2: ["home", "like", "many", "right"], 3: ["keep", "made", "why", "would"], 4: ["all", "into", "make", "time"] },
    9: { 1: ["about", "came", "gave", "one"], 2: ["because", "just", "pick", "play"], 3: ["again", "ate", "how", "them"] }
  };

  const STORAGE_KEY = "sightwords.v1";

  // ---------- 2. Persisted progress ----------
  const defaultProgress = {
    audioEnabled: true,
    voiceURI: "",
    stars: 0,
    streakCount: 0,
    lastPlayedDate: null,
    unlockedBadges: []
  };

  // Fields cleared by "Reset progress" — sound/voice preferences are left alone on purpose.
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
    { threshold: 25, name: "Word Explorer", emoji: "🧭", accentClass: "accent-cyan" },
    { threshold: 50, name: "Reading Rocket", emoji: "🚀", accentClass: "accent-pink" },
    { threshold: 100, name: "Word Wizard", emoji: "🪄", accentClass: "accent-yellow" },
    { threshold: 200, name: "Sight Word Champion", emoji: "🏆", accentClass: "accent-red" }
  ];

  // ---------- 3. App state ----------
  let activeWords = [];
  let currentIndex = 0;
  let currentMode = "flashcards";
  let quizScore = 0;
  let currentQuizWord = null;
  let balloonScore = 0;
  let balloonTargetWord = null;
  let balloonInterval = null;
  let balloonTimeouts = [];
  let spellingTarget = "";
  let spellingCurrent = [];

  // ---------- 4. DOM refs ----------
  const $ = (id) => document.getElementById(id);
  const audioToggleBtn = $("audio-toggle-btn");
  const audioIconOn = $("audio-icon-on");
  const audioIconOff = $("audio-icon-off");
  const streakCountEl = $("streak-count");
  const starCountEl = $("star-count");
  const streakCountLgEl = $("streak-count-lg");
  const starCountLgEl = $("star-count-lg");
  const badgeRow = $("badge-row");
  const toastEl = $("toast");
  const moduleGrid = $("module-grid");

  let activeModuleFilter = "all";
  let lastGameMode = "flashcards"; // remembers where to return after visiting the dataset view

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
  // Audio: speech synthesis (word narration) + generated tones (SFX)
  // ================================================================
  function speakWord(text) {
    if (!progress.audioEnabled || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.85;
    utterance.pitch = 1.1;
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
    speakWord("Hi! I'm your reading buddy.");
  }

  function resetProgress() {
    const ok = window.confirm("Reset stars, streak, and badges on this device? This can't be undone.");
    if (!ok) return;
    RESETTABLE_FIELDS.forEach((field) => { progress[field] = defaultProgress[field]; });
    // unlockedBadges/lastPlayedDate need fresh copies, not shared references
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
    pop: () => playTone([880], { duration: 0.08, type: "square", volume: 0.12 }),
    celebrate: () => playTone([523.25, 659.25, 783.99, 1046.5], { duration: 0.1, gap: 0.015 })
  };

  function setAudioButtonUI() {
    audioIconOn.hidden = !progress.audioEnabled;
    audioIconOff.hidden = progress.audioEnabled;
    audioToggleBtn.setAttribute("aria-pressed", String(progress.audioEnabled));
    audioToggleBtn.setAttribute("aria-label", progress.audioEnabled ? "Turn word narration off" : "Turn word narration on");
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
  // Word list building
  // ================================================================
  // Fisher-Yates shuffle — unbiased, in place.
  function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function buildWordList(moduleFilter = "all") {
    activeWords = [];
    for (const [modNum, weeks] of Object.entries(sightWordsData)) {
      if (moduleFilter === "all" || moduleFilter === modNum) {
        for (const [weekNum, words] of Object.entries(weeks)) {
          words.forEach((w) => activeWords.push({ word: w, module: parseInt(modNum, 10), week: parseInt(weekNum, 10) }));
        }
      }
    }
    shuffleArray(activeWords); // never the curriculum's fixed module/week order
    currentIndex = 0;
  }

  function handleModuleChange(val) {
    activeModuleFilter = val;
    buildWordList(val);
    updateFlashcardUI();
    if (currentMode === "quiz") startQuizQuestion();
    if (currentMode === "balloons") startBalloonArcade();
    if (currentMode === "spelling") startSpellingQuestion();
  }

  const MODULE_LABELS = { all: "All" };
  for (let i = 1; i <= 9; i++) MODULE_LABELS[String(i)] = `Mod ${i}`;

  function renderModuleGrid() {
    moduleGrid.innerHTML = "";
    Object.keys(MODULE_LABELS).forEach((key) => {
      const btn = document.createElement("button");
      btn.className = "module-btn";
      btn.type = "button";
      btn.textContent = MODULE_LABELS[key];
      btn.setAttribute("aria-pressed", String(key === activeModuleFilter));
      btn.addEventListener("click", () => {
        handleModuleChange(key);
        renderModuleGrid();
      });
      moduleGrid.appendChild(btn);
    });
  }

  // ================================================================
  // Mode switching
  // ================================================================
  const MODES = ["flashcards", "quiz", "balloons", "spelling", "dataset"];
  const GAME_MODES = ["flashcards", "quiz", "balloons", "spelling"];

  function switchMode(mode) {
    stopBalloonArcade();
    currentMode = mode;
    if (GAME_MODES.includes(mode)) lastGameMode = mode;
    MODES.forEach((m) => {
      $(`tab-${m}`).setAttribute("aria-selected", String(m === mode));
      $(`mode-${m}`).hidden = m !== mode;
    });
    if (mode === "quiz") startQuizQuestion();
    if (mode === "balloons") startBalloonArcade();
    if (mode === "spelling") startSpellingQuestion();
    if (mode === "dataset") renderJSON();
  }

  // ================================================================
  // 1. Flashcards
  // ================================================================
  function updateFlashcardUI() {
    if (activeWords.length === 0) return;
    const current = activeWords[currentIndex];
    $("flashcard-word").textContent = current.word;
    $("flashcard-word-back").textContent = current.word;
    $("card-counter").textContent = `Word ${currentIndex + 1} of ${activeWords.length}`;
    $("card-module-tag").textContent = `Module ${current.module} · Week ${current.week}`;
    $("card-inner").classList.remove("flipped");
  }

  function speakCurrentWord() {
    if (activeWords[currentIndex]) speakWord(activeWords[currentIndex].word);
  }

  function flipCard() {
    $("card-inner").classList.toggle("flipped");
  }

  function nextCard() {
    if (activeWords.length === 0) return;
    const wrapped = currentIndex === activeWords.length - 1;
    currentIndex = (currentIndex + 1) % activeWords.length;
    if (wrapped) { shuffleArray(activeWords); currentIndex = 0; } // fresh order each lap through the deck
    updateFlashcardUI();
    speakCurrentWord();
  }

  function prevCard() {
    if (activeWords.length === 0) return;
    const wrapped = currentIndex === 0;
    currentIndex = (currentIndex - 1 + activeWords.length) % activeWords.length;
    if (wrapped) { shuffleArray(activeWords); currentIndex = activeWords.length - 1; }
    updateFlashcardUI();
    speakCurrentWord();
  }

  // ================================================================
  // 2. Listen & Match quiz
  // ================================================================
  function startQuizQuestion() {
    if (activeWords.length === 0) return;
    $("quiz-feedback").textContent = "";
    $("quiz-feedback").className = "feedback-line";

    const targetObj = activeWords[Math.floor(Math.random() * activeWords.length)];
    currentQuizWord = targetObj.word;

    const distractors = activeWords
      .filter((w) => w.word !== currentQuizWord)
      .sort(() => 0.5 - Math.random())
      .slice(0, 3)
      .map((w) => w.word);

    const options = [currentQuizWord, ...distractors].sort(() => 0.5 - Math.random());
    const grid = $("quiz-options-grid");
    grid.innerHTML = "";

    options.forEach((opt) => {
      const btn = document.createElement("button");
      btn.className = "quiz-option";
      btn.textContent = opt;
      btn.onclick = () => checkQuizAnswer(opt, btn);
      grid.appendChild(btn);
    });

    setTimeout(() => playQuizPrompt(), 300);
  }

  function playQuizPrompt() {
    if (currentQuizWord) speakWord(currentQuizWord);
  }

  function checkQuizAnswer(selectedWord, btnElement) {
    const feedback = $("quiz-feedback");
    if (selectedWord === currentQuizWord) {
      quizScore += 10;
      $("quiz-score").textContent = quizScore;
      feedback.className = "feedback-line feedback-line--good";
      feedback.textContent = "🌟 Correct! Great job!";
      btnElement.classList.add("is-correct");
      sfx.correct();
      awardStars(1);
      burstConfetti(0.7);
      setTimeout(() => startQuizQuestion(), 1100);
    } else {
      feedback.className = "feedback-line feedback-line--bad";
      feedback.textContent = "Try again!";
      btnElement.classList.add("is-wrong");
      sfx.incorrect();
    }
  }

  // ================================================================
  // 3. Balloon Pop
  // ================================================================
  function startBalloonArcade() {
    if (activeWords.length === 0) return;
    const field = $("balloon-field");
    field.innerHTML = "";
    clearInterval(balloonInterval);

    balloonTargetWord = activeWords[Math.floor(Math.random() * activeWords.length)].word;
    $("balloon-target").textContent = balloonTargetWord;
    speakBalloonTarget();

    balloonInterval = setInterval(spawnBalloon, 1500);
  }

  function stopBalloonArcade() {
    clearInterval(balloonInterval);
    balloonInterval = null;
    balloonTimeouts.forEach(clearTimeout);
    balloonTimeouts = [];
  }

  function speakBalloonTarget() {
    if (balloonTargetWord) speakWord(`Find ${balloonTargetWord}`);
  }

  // Neon fills pair with navy text (AA-verified); the two deep brand colors pair with white.
  const BALLOON_HUES = [
    { bg: "#8FBCF2", fg: "#020C28" },
    { bg: "#84D9A8", fg: "#020C28" },
    { bg: "#F2A0C4", fg: "#020C28" },
    { bg: "#BBA8F0", fg: "#020C28" },
    { bg: "#F5B77E", fg: "#020C28" },
    { bg: "#36069A", fg: "#FFFFFF" }
  ];

  function spawnBalloon() {
    const field = $("balloon-field");
    const stage = $("balloon-stage");
    if (!field || currentMode !== "balloons") return;

    const hue = BALLOON_HUES[Math.floor(Math.random() * BALLOON_HUES.length)];
    const isTarget = Math.random() < 0.4;
    const wordText = isTarget ? balloonTargetWord : activeWords[Math.floor(Math.random() * activeWords.length)].word;

    const balloon = document.createElement("button");
    balloon.className = "balloon";
    balloon.style.background = hue.bg;
    balloon.style.color = hue.fg;
    balloon.textContent = wordText;
    balloon.setAttribute("aria-label", `Balloon: ${wordText}`);

    const stageWidth = stage.clientWidth;
    const leftPos = Math.random() * Math.max(stageWidth - 90, 10);
    balloon.style.left = `${leftPos}px`;
    balloon.style.bottom = "-110px";
    field.appendChild(balloon);

    let bottomPos = -110;
    const speed = 1.3 + Math.random() * 1.3;
    const anim = setInterval(() => {
      bottomPos += speed;
      balloon.style.bottom = `${bottomPos}px`;
      if (bottomPos > stage.clientHeight + 110) {
        clearInterval(anim);
        if (field.contains(balloon)) field.removeChild(balloon);
      }
    }, 20);

    balloon.onclick = () => {
      clearInterval(anim);
      if (wordText === balloonTargetWord) {
        balloonScore += 1;
        $("balloon-score").textContent = `Pops: ${balloonScore}`;
        sfx.pop();
        awardStars(1);
        balloon.classList.add("is-popped");
        const t = setTimeout(() => { if (field.contains(balloon)) field.removeChild(balloon); }, 200);
        balloonTimeouts.push(t);
        if (balloonScore % 3 === 0) {
          burstConfetti(1);
          const t2 = setTimeout(() => startBalloonArcade(), 250);
          balloonTimeouts.push(t2);
        }
      } else {
        speakWord(wordText);
        balloon.classList.add("is-wrong-tap");
      }
    };
  }

  // ================================================================
  // 4. Word Builder (spelling)
  // ================================================================
  function startSpellingQuestion() {
    if (activeWords.length === 0) return;
    $("spelling-feedback").textContent = "";

    const wordObj = activeWords[Math.floor(Math.random() * activeWords.length)];
    spellingTarget = wordObj.word;
    spellingCurrent = [];

    renderSpellingUI();
    setTimeout(() => speakSpellingWord(), 200);
  }

  function speakSpellingWord() {
    if (spellingTarget) speakWord(spellingTarget);
  }

  function renderSpellingUI() {
    const slotsContainer = $("spelling-slots");
    const tilesContainer = $("spelling-tiles");
    slotsContainer.innerHTML = "";
    tilesContainer.innerHTML = "";

    for (let i = 0; i < spellingTarget.length; i++) {
      const slot = document.createElement("div");
      slot.className = "spelling-slot";
      slot.textContent = spellingCurrent[i] || "";
      slotsContainer.appendChild(slot);
    }

    const letters = spellingTarget.split("").sort(() => 0.5 - Math.random());
    letters.forEach((char) => {
      const btn = document.createElement("button");
      btn.className = "spelling-tile";
      btn.textContent = char;
      btn.onclick = () => addSpellingLetter(char, btn);
      tilesContainer.appendChild(btn);
    });
  }

  function addSpellingLetter(char, btn) {
    if (spellingCurrent.length < spellingTarget.length) {
      spellingCurrent.push(char);
      btn.disabled = true;
      renderSpellingUI();
      if (spellingCurrent.length === spellingTarget.length) checkSpelling();
    }
  }

  function checkSpelling() {
    const feedback = $("spelling-feedback");
    const attempted = spellingCurrent.join("");
    if (attempted === spellingTarget) {
      feedback.className = "feedback-line feedback-line--good";
      feedback.textContent = "✨ Awesome! You spelled it!";
      speakWord(`Great job! ${spellingTarget}`);
      sfx.celebrate();
      awardStars(2);
      burstConfetti(1);
      setTimeout(() => startSpellingQuestion(), 1400);
    } else {
      feedback.className = "feedback-line feedback-line--bad";
      feedback.textContent = "Oops! Let's try again.";
      sfx.incorrect();
      setTimeout(() => {
        spellingCurrent = [];
        renderSpellingUI();
      }, 900);
    }
  }

  // ================================================================
  // 5. Dataset view
  // ================================================================
  function renderJSON() {
    $("json-display").textContent = JSON.stringify(sightWordsData, null, 2);
  }

  function copyDatasetJSON() {
    const text = JSON.stringify(sightWordsData, null, 2);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => showToast("JSON copied to clipboard"));
    } else {
      showToast("Copy not supported on this browser");
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

    GAME_MODES.forEach((m) => $(`tab-${m}`).addEventListener("click", () => switchMode(m)));

    $("card-flip").addEventListener("click", flipCard);
    $("card-flip").addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flipCard(); }
    });
    $("hear-word-btn").addEventListener("click", (e) => { e.stopPropagation(); speakCurrentWord(); });
    $("repeat-audio-btn").addEventListener("click", speakCurrentWord);
    $("prev-card-btn").addEventListener("click", prevCard);
    $("next-card-btn").addEventListener("click", nextCard);

    $("replay-quiz-btn").addEventListener("click", playQuizPrompt);
    $("replay-balloon-btn").addEventListener("click", speakBalloonTarget);
    $("hear-spelling-btn").addEventListener("click", speakSpellingWord);
    $("skip-spelling-btn").addEventListener("click", startSpellingQuestion);
    $("copy-json-btn").addEventListener("click", copyDatasetJSON);

    $("open-dataset-btn").addEventListener("click", () => {
      closeSheet("settings-sheet", "settings-backdrop", "settings-btn");
      switchMode("dataset");
    });
    $("dataset-back-btn").addEventListener("click", () => switchMode(lastGameMode));

    wireSheet({ triggerId: "progress-chip", sheetId: "progress-sheet", backdropId: "progress-backdrop", closeId: "progress-sheet-close" });
    wireSheet({
      triggerId: "settings-btn",
      sheetId: "settings-sheet",
      backdropId: "settings-backdrop",
      closeId: "settings-sheet-close",
      onOpen: () => { renderModuleGrid(); refreshVoiceList(); }
    });

    $("voice-select").addEventListener("change", (e) => handleVoiceChange(e.target.value));
    $("test-voice-btn").addEventListener("click", () => speakWord("Hi! I'm your reading buddy."));
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
    buildWordList("all");
    updateFlashcardUI();
    refreshVoiceList();
    registerServiceWorker();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
