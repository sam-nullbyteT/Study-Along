// app.js - Main Application Controller for Study Along (Ekagraa)
// Manages Pomodoro Timer, Screen Wake Lock, PiP Mini-Timer, Web Audio Ambience,
// 40Hz Gamma Binaural Beats, Moodist Presets, Lofi Turntable, Tasks,
// Korean 10-Minute Study Planner, D-Day Target Sync, Analytics & Journal

(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const pad = n => String(n).padStart(2, '0');

  // Application State
  const AppState = {
    days: {},
    done: {},
    tasks: [],
    note: '',
    mood: '',
    scene: 'cafe',
    chars: 3,
    zen: false,
    focusSpeed: 1.0,
    engine: 'gsap',
    animEnabled: true,
    ddayDate: '',
    ddayTitle: 'Exam'
  };

  // Restore state from localStorage
  try {
    const saved = localStorage.getItem('ekagraa_state');
    if (saved) Object.assign(AppState, JSON.parse(saved));
  } catch (e) {}

  if (typeof AppState.chars !== 'number' || AppState.chars < 0 || AppState.chars > 4) AppState.chars = 3;

  function saveState() {
    try {
      localStorage.setItem('ekagraa_state', JSON.stringify(AppState));
    } catch (e) {}
  }

  const dateKey = offsetDays => {
    const d = new Date();
    d.setDate(d.getDate() - offsetDays);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  /* =========================================================================
     1. SCREEN WAKE LOCK CONTROLLER
     ========================================================================= */
  let wakeLock = null;
  async function requestWakeLock() {
    if ('wakeLock' in navigator) {
      try {
        wakeLock = await navigator.wakeLock.request('screen');
      } catch (e) {}
    }
  }

  function releaseWakeLock() {
    if (wakeLock) {
      try {
        wakeLock.release();
      } catch (e) {}
      wakeLock = null;
    }
  }

  /* =========================================================================
     2. POMODORO TIMER CONTROLLER
     ========================================================================= */
  const TIMER_DURATIONS = { f: 25, s: 5, l: 15 };
  let currentTimerMode = 'f'; // 'f' (Focus) | 's' (Short Break) | 'l' (Long Break)
  let remainingSeconds = 1500;
  let isRunning = false;
  let timerEndTime = 0;
  let sessionCount = 1;
  let unsavedFocusSeconds = 0;
  let notificationRequested = false;

  function updateTimerDisplay() {
    const h = Math.floor(remainingSeconds / 3600);
    const m = Math.floor((remainingSeconds % 3600) / 60);
    const s = remainingSeconds % 60;
    const timeStr = (h ? `${h}:${pad(m)}` : pad(m)) + `:${pad(s)}`;

    const timeEl = $('time');
    if (timeEl) timeEl.textContent = timeStr;

    const t = window.I18n ? window.I18n.t : k => k;
    const modeLabels = {
      f: `${t('focusSession')}${sessionCount}`,
      s: t('shortBreakLabel'),
      l: t('longBreakLabel')
    };

    const lblEl = $('lbl');
    if (lblEl) lblEl.textContent = modeLabels[currentTimerMode];

    const startBtn = $('start');
    if (startBtn) {
      startBtn.textContent = isRunning ? t('pauseTimer') : t('startTimer');
    }

    document.title = (isRunning ? `${timeStr} · ` : '') + t('appName');
    updateHeaderStats();
    updatePipCanvas();
  }

  function setTimerMode(mode) {
    currentTimerMode = mode;
    isRunning = false;
    releaseWakeLock();
    remainingSeconds = TIMER_DURATIONS[mode] * 60;

    document.querySelectorAll('#tabs button').forEach(b => {
      b.classList.toggle('on', b.dataset.m === mode);
    });

    const hrInput = $('hr');
    const mnInput = $('mn');
    if (hrInput) hrInput.value = Math.floor(TIMER_DURATIONS[mode] / 60);
    if (mnInput) mnInput.value = TIMER_DURATIONS[mode] % 60;

    // Notify animation engine
    if (window.animEngine) {
      const animState = (mode === 'f') ? (isRunning ? 'studying' : 'paused') : 'break';
      window.animEngine.setTimerState(animState, remainingSeconds);
    }

    updateTimerDisplay();
  }

  function toggleTimer() {
    if (isRunning) {
      isRunning = false;
      releaseWakeLock();
      if (window.animEngine) {
        const animState = (currentTimerMode === 'f') ? 'paused' : 'break';
        window.animEngine.setTimerState(animState, remainingSeconds);
      }
      saveState();
    } else {
      isRunning = true;
      requestWakeLock();
      timerEndTime = Date.now() + remainingSeconds * 1000;

      // Request browser notification permission
      if (!notificationRequested && window.Notification && Notification.permission === 'default') {
        notificationRequested = true;
        try { Notification.requestPermission(); } catch (e) {}
      }

      // Initialize audio context on user gesture
      initAudioContext();

      if (window.animEngine) {
        const animState = (currentTimerMode === 'f') ? 'studying' : 'break';
        window.animEngine.setTimerState(animState, remainingSeconds);
      }
    }
    updateTimerDisplay();
  }

  function onTimerComplete(naturalEnd) {
    isRunning = false;
    releaseWakeLock();

    if (naturalEnd) {
      playZenSingingBowlChime();

      // Confetti celebration
      if (typeof confetti === 'function') {
        confetti({
          particleCount: 85,
          spread: 75,
          origin: { y: 0.62 },
          colors: ['#fdba74', '#fbbf24', '#f472b6', '#60a5fa', '#34d399']
        });
      }

      try {
        if (Notification.permission === 'granted') {
          const t = window.I18n ? window.I18n.t : k => k;
          new Notification(t('appName'), {
            body: currentTimerMode === 'f'
              ? t('shortBreakLabel')
              : t('studyingState')
          });
        }
      } catch (e) {}

      if (currentTimerMode === 'f') {
        const todayKey = dateKey(0);
        AppState.done[todayKey] = (AppState.done[todayKey] || 0) + 1;
      }
    }

    let nextMode = 'f';
    if (currentTimerMode === 'f') {
      nextMode = (sessionCount % 4 === 0) ? 'l' : 's';
      sessionCount++;
    }
    saveState();
    setTimerMode(nextMode);
  }

  // Timer Tick Interval
  setInterval(() => {
    if (!isRunning) return;

    const currentRem = Math.max(0, Math.ceil((timerEndTime - Date.now()) / 1000));
    if (currentRem !== remainingSeconds) {
      if (currentTimerMode === 'f') {
        const delta = remainingSeconds - currentRem;
        const todayKey = dateKey(0);
        AppState.days[todayKey] = (AppState.days[todayKey] || 0) + delta;
        unsavedFocusSeconds += delta;

        if (unsavedFocusSeconds >= 10) {
          saveState();
          unsavedFocusSeconds = 0;
        }

        const statsSec = $('s-stats');
        if (statsSec && statsSec.classList.contains('on')) {
          renderStats();
          renderKoreanPlannerGrid();
        }
      }

      remainingSeconds = currentRem;

      if (window.animEngine && currentTimerMode === 'f') {
        window.animEngine.setTimerState('studying', remainingSeconds);
      }

      updateTimerDisplay();
    }

    if (currentRem <= 0) {
      onTimerComplete(true);
    }
  }, 250);

  function onDurationChange() {
    if (isRunning) return;
    const hr = Math.max(0, parseInt($('hr').value, 10) || 0);
    const mn = Math.max(1, parseInt($('mn').value, 10) || 0);
    TIMER_DURATIONS[currentTimerMode] = hr * 60 + mn;
    remainingSeconds = TIMER_DURATIONS[currentTimerMode] * 60;
    updateTimerDisplay();
  }

  /* =========================================================================
     3. PICTURE-IN-PICTURE (PiP) FLOATING MINI-TIMER
     ========================================================================= */
  let pipActive = false;
  function updatePipCanvas() {
    const canvas = $('pip-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    // Dark glassmorphic background
    ctx.fillStyle = '#0a0d18';
    ctx.fillRect(0, 0, w, h);

    // Circular background track
    ctx.lineWidth = 14;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2 - 12, 100, 0, Math.PI * 2);
    ctx.stroke();

    // Progress arc
    const totalSec = TIMER_DURATIONS[currentTimerMode] * 60;
    const progress = totalSec > 0 ? (totalSec - remainingSeconds) / totalSec : 0;
    const endAngle = -Math.PI / 2 + progress * (Math.PI * 2);

    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#fdba74');
    grad.addColorStop(1, '#f97316');
    ctx.strokeStyle = grad;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2 - 12, 100, -Math.PI / 2, endAngle);
    ctx.stroke();

    // Large Digits
    const mins = Math.floor(remainingSeconds / 60);
    const secs = remainingSeconds % 60;
    const timeText = `${pad(mins)}:${pad(secs)}`;

    ctx.font = 'bold 44px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(timeText, w / 2, h / 2 - 16);

    // Session Status Label
    const modeLabel = (currentTimerMode === 'f') ? `FOCUS #${sessionCount}` : 'BREAK';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = '#fdba74';
    ctx.fillText(modeLabel, w / 2, h / 2 + 26);

    // App branding
    ctx.font = '10px sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('Ekagraa · Study Along', w / 2, h - 20);
  }

  async function togglePictureInPicture() {
    const video = $('pip-video');
    const canvas = $('pip-canvas');
    if (!video || !canvas) return;

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        pipActive = false;
      } else {
        updatePipCanvas();
        if (!video.srcObject) {
          const stream = canvas.captureStream(10);
          video.srcObject = stream;
        }
        await video.play();
        await video.requestPictureInPicture();
        pipActive = true;
      }
    } catch (e) {
      console.warn('PiP error:', e);
    }
  }

  /* =========================================================================
     4. EXAM D-DAY TARGET COUNTDOWN & POST-IT SYNC
     ========================================================================= */
  function updateDDayDisplay() {
    const badgeText = $('dday-badge-text');
    const deskText = $('desk-dday-text');
    let ddayStr = 'D-14';

    if (AppState.ddayDate) {
      const target = new Date(AppState.ddayDate);
      const now = new Date();
      target.setHours(0, 0, 0, 0);
      now.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil((target - now) / (1000 * 60 * 60 * 24));
      if (diffDays === 0) ddayStr = 'D-Day';
      else if (diffDays > 0) ddayStr = `D-${diffDays}`;
      else ddayStr = `D+${Math.abs(diffDays)}`;
    }

    if (badgeText) badgeText.textContent = ddayStr;
    if (deskText) {
      const title = AppState.ddayTitle || 'Focus';
      deskText.textContent = `${ddayStr} 🎯 ${title}`;
    }
  }

  function promptDDaySetup() {
    const current = AppState.ddayDate || '';
    const dateInput = prompt('Enter your exam or target date (YYYY-MM-DD):', current || '2026-11-15');
    if (dateInput) {
      const parsed = new Date(dateInput);
      if (!isNaN(parsed.getTime())) {
        AppState.ddayDate = dateInput;
        const titleInput = prompt('Enter target exam or goal name (e.g. CSAT, SAT, Finals):', AppState.ddayTitle || 'Exam');
        if (titleInput) AppState.ddayTitle = titleInput;
        saveState();
        updateDDayDisplay();
      } else {
        alert('Please enter a valid date in YYYY-MM-DD format.');
      }
    }
  }

  /* =========================================================================
     5. KOREAN 10-MINUTE FOCUS PLANNER GRID (10분 플래너 시간표)
     ========================================================================= */
  function renderKoreanPlannerGrid() {
    const grid = $('kr-planner-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const todaySec = AppState.days[dateKey(0)] || 0;
    const totalFilledBlocks = Math.floor(todaySec / 600); // 1 block per 10 minutes

    let blockCounter = 0;
    // Hours from 06:00 to 24:00 (19 hours total)
    for (let h = 6; h <= 24; h++) {
      const row = document.createElement('div');
      row.className = 'kr-planner-row';

      const hourLabel = document.createElement('span');
      hourLabel.className = 'kr-planner-hour';
      hourLabel.textContent = `${pad(h % 24)}:00`;

      const blocksContainer = document.createElement('div');
      blocksContainer.className = 'kr-planner-blocks';

      for (let b = 0; b < 6; b++) {
        const block = document.createElement('div');
        block.className = 'kr-planner-block';
        if (blockCounter < totalFilledBlocks) {
          block.classList.add('filled');
        }
        blockCounter++;
        blocksContainer.appendChild(block);
      }

      row.append(hourLabel, blocksContainer);
      grid.appendChild(row);
    }
  }

  /* =========================================================================
     6. CHARACTER CAST CONTROLLER (0 - 4)
     ========================================================================= */
  const STUDY_CAST_KEYS = ['cast0', 'cast1', 'cast2', 'cast3', 'cast4'];
  const ZEN_CAST_KEYS = ['cast0', 'cast1', 'cast2', 'cast3', 'cast4'];

  function setCastCount(n) {
    AppState.chars = Math.max(0, Math.min(4, n));

    const ghibliStage = $('ghibli-stage');
    if (ghibliStage) {
      ghibliStage.classList.toggle('hide-all', false);
    }

    for (let i = 1; i <= 4; i++) {
      const charEl = $('char-' + i);
      const zenCharEl = $('zchar-' + i);
      if (charEl) charEl.classList.toggle('show', i <= AppState.chars);
      if (zenCharEl) zenCharEl.classList.toggle('show', i <= AppState.chars);
    }

    const countBadge = $('cp-cnt');
    if (countBadge) countBadge.textContent = AppState.chars;

    const charDesc = $('char-desc');
    if (charDesc && window.I18n) {
      const keys = AppState.zen ? ZEN_CAST_KEYS : STUDY_CAST_KEYS;
      charDesc.textContent = window.I18n.t(keys[AppState.chars]);
    }

    document.querySelectorAll('#char-sel button').forEach(btn => {
      btn.classList.toggle('on', parseInt(btn.dataset.c, 10) === AppState.chars);
    });

    saveState();
  }

  /* =========================================================================
     7. STAGE WORLD & KOREAN THEMES
     ========================================================================= */
  const SCENE_THEMES = {
    dokseosil: ['독서실 (Study Cubicle)', '#fdba74', '#1f1611', '#2c1f18', '#0c0a08', '35% 38%', '16s'],
    classroom: ['야간 교실 (Night Classroom)', '#93c5fd', '#0a101f', '#14203d', '#070b16', '50% 25%', '18s'],
    cafe: ['스터디 카페 (Study Cafe)', '#fcd34d', '#241a10', '#3b291a', '#100a06', '25% 30%', '16s'],
    rain: ['비 오는 서울 (Rainy Seoul)', '#7dd3fc', '#091322', '#162842', '#050a12', '50% 20%', '11s'],
    cherry: ['벚꽃 교실 (Spring Blossoms)', '#f472b6', '#220e1a', '#3f1c32', '#0d050a', '60% 30%', '15s'],
    library: ['남산 도서관 (Namsan Library)', '#fbbf24', '#1f1609', '#3d2b12', '#0e0904', '80% 25%', '20s'],
    snow: ['겨울 눈밤 (Winter Snow)', '#bae6fd', '#0e1828', '#20344f', '#080d16', '50% 10%', '24s'],
    zen: ['한옥 서재 (Hanok Study)', '#fde047', '#121c17', '#1f382e', '#080e0b', '50% 25%', '22s']
  };
  let activeBgIndex = 1;

  function setZenMode(isZen) {
    AppState.zen = !!isZen;
    document.body.classList.toggle('zen-mode', AppState.zen);

    const zenPill = $('zen-pill');
    if (zenPill) zenPill.classList.toggle('on', AppState.zen);

    const mStudy = $('m-study');
    const mZen = $('m-zen');
    if (mStudy) mStudy.classList.toggle('on', !AppState.zen);
    if (mZen) mZen.classList.toggle('on', AppState.zen);

    const pomoTitle = $('pomo-title');
    if (pomoTitle && window.I18n) {
      pomoTitle.textContent = AppState.zen ? window.I18n.t('zenPomoTitle') : window.I18n.t('pomoTitle');
    }

    setCastCount(AppState.chars);
    saveState();
  }

  function setScene(id, keepMode) {
    if (!SCENE_THEMES[id]) id = 'dokseosil';
    AppState.scene = id;

    if (id === 'zen') setZenMode(true);
    else if (!keepMode && AppState.zen && id !== 'zen') setZenMode(false);

    const theme = SCENE_THEMES[id];
    const hex = theme[1];
    const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(',');

    document.body.dataset.s = id;
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--a', hex);
    rootStyle.setProperty('--ar', rgb);
    rootStyle.setProperty('--ws', theme[6]);

    const bgGradient = `radial-gradient(60% 55% at ${theme[5]}, ${hex}38, transparent 70%), linear-gradient(170deg, ${theme[2]}, ${theme[3]} 55%, ${theme[4]})`;
    const nextBg = $('b' + (3 - activeBgIndex));
    const currentBg = $('b' + activeBgIndex);

    if (nextBg && currentBg) {
      nextBg.style.background = bgGradient;
      nextBg.classList.add('on');
      currentBg.classList.remove('on');
      activeBgIndex = 3 - activeBgIndex;
    }

    document.querySelectorAll('.card').forEach(c => {
      c.classList.toggle('on', c.dataset.id === id);
    });

    if (window.animEngine) {
      window.animEngine.setScene(id);
    }

    saveState();
  }

  function renderThemeCards() {
    const container = $('scenes');
    if (!container) return;
    container.innerHTML = '';

    for (const id in SCENE_THEMES) {
      const theme = SCENE_THEMES[id];
      const card = document.createElement('button');
      card.className = 'card btn';
      card.dataset.id = id;
      card.style.background = `linear-gradient(160deg, ${theme[3]}, ${theme[4]})`;
      card.textContent = theme[0];
      card.onclick = () => setScene(id, false);
      container.appendChild(card);
    }
  }

  /* =========================================================================
     8. WEB AUDIO AMBIENT SOUNDSCAPES & 40Hz GAMMA BINAURAL BEATS
     ========================================================================= */
  let audioCtx, masterGain, musicGain;
  const AMBIENCE_SOUNDS = [
    { nameKey: 'rain', icon: '🌧️', type: 'white', filter: 'bandpass', freq: 2800, q: 0.4, lfoRate: 0, lfoDepth: 0 },
    { nameKey: 'wind', icon: '💨', type: 'white', filter: 'lowpass', freq: 450, q: 0.5, lfoRate: 0.07, lfoDepth: 0.35 },
    { nameKey: 'waves', icon: '🌊', type: 'white', filter: 'lowpass', freq: 700, q: 0.5, lfoRate: 0.11, lfoDepth: 0.45 },
    { nameKey: 'fire', icon: '🔥', type: 'brown', filter: 'lowpass', freq: 500, q: 0.5, lfoRate: 0.6, lfoDepth: 0.15 },
    { nameKey: 'cafe', icon: '☕', type: 'white', filter: 'bandpass', freq: 900, q: 0.6, lfoRate: 0.25, lfoDepth: 0.2 },
    { nameKey: 'crickets', icon: '🌙', type: 'osc' },
    { nameKey: 'bowl', icon: '🔔', type: 'bowl_btn' },
    { nameKey: 'gamma', icon: '🧠', type: 'binaural_40hz', label: '40Hz Gamma Focus' }
  ];

  const soundVolumes = AMBIENCE_SOUNDS.map(() => 0.5);
  const activeSoundNodes = {};

  function initAudioContext() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContextClass();

      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.9;
      masterGain.connect(audioCtx.destination);

      musicGain = audioCtx.createGain();
      musicGain.gain.value = 0.5;
      musicGain.connect(masterGain);
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function generateNoiseBuffer(isBrown) {
    const ctx = initAudioContext();
    const bufferSize = ctx.sampleRate * 3;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0;

    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      if (isBrown) {
        lastOut = (lastOut + 0.02 * white) / 1.02;
        data[i] = lastOut * 3.5;
      } else {
        data[i] = white;
      }
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    return source;
  }

  function createLfo(ctx, param, rate, depth) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = rate;
    gain.gain.value = depth;
    osc.connect(gain);
    gain.connect(param);
    osc.start();
    return osc;
  }

  function playZenSingingBowlChime() {
    const ctx = initAudioContext();
    const harmonics = [528, 660, 880, 1056, 1320];
    harmonics.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startTime = ctx.currentTime + idx * 0.18;

      osc.type = 'sine';
      osc.frequency.value = freq;

      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(0.24 / (idx + 1), startTime + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 2.8);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(startTime);
      osc.stop(startTime + 3.0);
    });
  }

  function startAmbienceSound(idx) {
    const ctx = initAudioContext();
    const config = AMBIENCE_SOUNDS[idx];

    if (config.type === 'bowl_btn') {
      playZenSingingBowlChime();
      return;
    }

    const outGain = ctx.createGain();
    const modGain = ctx.createGain();
    const sourceList = [];

    outGain.gain.value = soundVolumes[idx];
    outGain.connect(masterGain);
    modGain.connect(outGain);

    if (config.type === 'binaural_40hz') {
      // 40Hz Gamma wave binaural synthesis (200Hz Left, 240Hz Right)
      const oscL = ctx.createOscillator();
      const oscR = ctx.createOscillator();
      oscL.type = 'sine';
      oscR.type = 'sine';
      oscL.frequency.value = 200;
      oscR.frequency.value = 240;

      const merger = ctx.createChannelMerger(2);
      oscL.connect(merger, 0, 0); // left ear
      oscR.connect(merger, 0, 1); // right ear

      merger.connect(modGain);
      oscL.start();
      oscR.start();

      sourceList.push(oscL, oscR);
      modGain.gain.value = 0.45;
    } else if (config.type === 'osc') {
      // Crickets chirp
      const osc = ctx.createOscillator();
      const chirpGain = ctx.createGain();
      osc.frequency.value = 4500;
      chirpGain.gain.value = 0;
      osc.connect(chirpGain);
      chirpGain.connect(modGain);
      osc.start();

      sourceList.push(osc, createLfo(ctx, chirpGain.gain, 5.5, 0.06));
      modGain.gain.value = 1;
    } else {
      // Noise soundscapes (rain, wind, waves, fire, cafe)
      const noise = generateNoiseBuffer(config.type === 'brown');
      const filter = ctx.createBiquadFilter();
      filter.type = config.filter;
      filter.frequency.value = config.freq;
      filter.Q.value = config.q;

      noise.connect(filter);
      filter.connect(modGain);
      noise.start();

      sourceList.push(noise);
      if (config.lfoRate > 0) {
        sourceList.push(createLfo(ctx, modGain.gain, config.lfoRate, config.lfoDepth));
      } else {
        modGain.gain.value = 1;
      }
    }

    activeSoundNodes[idx] = { outGain, sourceList };
  }

  function stopAmbienceSound(idx) {
    if (activeSoundNodes[idx]) {
      activeSoundNodes[idx].sourceList.forEach(s => {
        try { s.stop(); s.disconnect(); } catch (e) {}
      });
      delete activeSoundNodes[idx];
    }
  }

  function renderAmbienceMixer() {
    const container = $('snds');
    if (!container) return;
    container.innerHTML = '';

    AMBIENCE_SOUNDS.forEach((item, idx) => {
      const row = document.createElement('div');
      row.className = 'snd';

      const btn = document.createElement('button');
      btn.className = 'btn' + (activeSoundNodes[idx] ? ' on' : '');
      const label = item.label || (window.I18n ? window.I18n.t(item.nameKey) : item.nameKey);
      btn.innerHTML = `<span>${item.icon}</span> <span>${label}</span>`;

      btn.onclick = () => {
        if (item.type === 'bowl_btn') {
          playZenSingingBowlChime();
          btn.classList.add('on');
          setTimeout(() => btn.classList.remove('on'), 1200);
          return;
        }

        if (activeSoundNodes[idx]) {
          stopAmbienceSound(idx);
          btn.classList.remove('on');
        } else {
          startAmbienceSound(idx);
          btn.classList.add('on');
        }
      };

      row.appendChild(btn);

      if (item.type !== 'bowl_btn') {
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '0';
        slider.max = '1';
        slider.step = '0.01';
        slider.value = String(soundVolumes[idx]);
        slider.oninput = () => {
          soundVolumes[idx] = parseFloat(slider.value);
          if (activeSoundNodes[idx]) {
            activeSoundNodes[idx].outGain.gain.value = soundVolumes[idx];
          }
        };
        row.appendChild(slider);
      }

      container.appendChild(row);
    });
  }

  /* 1-Click Moodist Ambience Presets */
  function applyAmbiencePreset(presetKey) {
    document.querySelectorAll('.amb-preset-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.preset === presetKey);
    });

    // Stop all currently active soundscapes
    for (const idx in activeSoundNodes) {
      stopAmbienceSound(parseInt(idx, 10));
    }

    if (presetKey === 'rainy-cafe') {
      soundVolumes[0] = 0.6; // Rain
      soundVolumes[4] = 0.35; // Cafe
      startAmbienceSound(0);
      startAmbienceSound(4);
    } else if (presetKey === 'dokseosil') {
      soundVolumes[7] = 0.55; // 40Hz Gamma
      soundVolumes[5] = 0.2;  // Crickets/night
      startAmbienceSound(7);
      startAmbienceSound(5);
    } else if (presetKey === 'spring') {
      soundVolumes[1] = 0.45; // Wind
      soundVolumes[2] = 0.35; // Waves
      startAmbienceSound(1);
      startAmbienceSound(2);
    } else if (presetKey === 'gamma') {
      soundVolumes[7] = 0.7; // Solo 40Hz Gamma
      startAmbienceSound(7);
    }

    renderAmbienceMixer();
  }

  /* =========================================================================
     9. LOFI SYNTH TURNTABLE PLAYER
     ========================================================================= */
  const LOFI_TRACKS = [
    { title: 'Rainy Day Loop', bpm: 70, chords: [[57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65], [52, 55, 59, 62]] },
    { title: 'Warm Study Flow', bpm: 76, chords: [[48, 52, 55, 59], [53, 57, 60, 64], [50, 53, 57, 60], [55, 59, 62, 65]] },
    { title: 'Night Drive Tokyo', bpm: 64, chords: [[62, 65, 69, 72], [58, 62, 65, 69], [60, 64, 67, 70], [57, 60, 64, 67]] }
  ];
  let currentTrackIdx = 0;
  let isLofiPlaying = false;
  let lofiTimer = null;
  let chordStep = 0;

  const midiToFreq = midi => 440 * Math.pow(2, (midi - 69) / 12);

  function playLofiChord() {
    const ctx = initAudioContext();
    const track = LOFI_TRACKS[currentTrackIdx];
    const dur = 240 / track.bpm;
    const now = ctx.currentTime;
    const notes = track.chords[chordStep++ % 4];

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 920;

    const chordGain = ctx.createGain();
    chordGain.gain.setValueAtTime(0, now);
    chordGain.gain.linearRampToValueAtTime(0.18, now + 0.15);
    chordGain.gain.linearRampToValueAtTime(0, now + dur);

    chordGain.connect(filter);
    filter.connect(musicGain);

    notes.concat([notes[0] - 12]).forEach((note, i) => {
      const osc = ctx.createOscillator();
      osc.type = (i < 4) ? 'triangle' : 'sine';
      osc.frequency.value = midiToFreq(note);
      osc.detune.value = (i % 2 === 0) ? 6 : -6;

      osc.connect(chordGain);
      osc.start(now);
      osc.stop(now + dur + 0.1);
    });
  }

  function setLofiPlaying(playState) {
    isLofiPlaying = playState;
    clearInterval(lofiTimer);

    const disc = $('disc');
    if (disc) disc.classList.toggle('spin', isLofiPlaying);

    const playBtn = $('mpl');
    if (playBtn && window.I18n) {
      playBtn.textContent = isLofiPlaying ? window.I18n.t('pause') : window.I18n.t('play');
    }

    if (isLofiPlaying) {
      chordStep = 0;
      playLofiChord();
      const intervalMs = (240000 / LOFI_TRACKS[currentTrackIdx].bpm);
      lofiTimer = setInterval(playLofiChord, intervalMs);
    }
  }

  function updateTrackTitle() {
    const titleEl = $('tt');
    if (titleEl) titleEl.textContent = LOFI_TRACKS[currentTrackIdx].title;
  }

  /* =========================================================================
     10. STUDY TASKS TRACKER
     ========================================================================= */
  function renderTasks() {
    const list = $('tl');
    if (!list) return;
    list.innerHTML = '';

    const t = window.I18n ? window.I18n.t : k => k;

    if (!AppState.tasks.length) {
      list.textContent = t('noTasks');
      list.style.color = 'var(--text-muted)';
      list.style.fontSize = '13px';
      list.style.padding = '12px 0';
      return;
    }

    list.removeAttribute('style');

    AppState.tasks.forEach((item, idx) => {
      const row = document.createElement('div');
      row.className = 'task' + (item.d ? ' d' : '');

      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = !!item.d;
      check.onchange = () => {
        item.d = check.checked;
        saveState();
        renderTasks();
      };

      const title = document.createElement('span');
      title.textContent = item.t;
      title.title = 'Click to focus on this task';
      title.onclick = () => {
        const workInput = $('work');
        if (workInput) workInput.value = item.t;
      };

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'x';
      deleteBtn.textContent = '✕';
      deleteBtn.setAttribute('aria-label', 'Delete task');
      deleteBtn.onclick = () => {
        AppState.tasks.splice(idx, 1);
        saveState();
        renderTasks();
      };

      row.append(check, title, deleteBtn);
      list.appendChild(row);
    });
  }

  /* =========================================================================
     11. STUDY ANALYTICS & HABIT STREAK
     ========================================================================= */
  function calculateStreak() {
    let streak = 0;
    let offset = (AppState.days[dateKey(0)] > 0) ? 0 : 1;
    while (AppState.days[dateKey(offset)] > 0) {
      streak++;
      offset++;
    }
    return streak;
  }

  function updateHeaderStats() {
    const todaySeconds = AppState.days[dateKey(0)] || 0;
    const hours = Math.floor(todaySeconds / 3600);
    const mins = Math.floor((todaySeconds % 3600) / 60);

    const hfEl = $('hf');
    if (hfEl) hfEl.textContent = `${hours}h ${mins}m`;

    const streakEl = $('streak');
    if (streakEl) streakEl.textContent = String(calculateStreak());

    const dateEl = $('date');
    if (dateEl) {
      dateEl.textContent = new Date().toLocaleDateString(
        document.documentElement.lang || 'en-GB',
        { weekday: 'long', day: 'numeric', month: 'short' }
      );
    }
  }

  function renderStats() {
    const todaySeconds = AppState.days[dateKey(0)] || 0;
    const st1 = $('st1');
    const st2 = $('st2');
    const st3 = $('st3');

    if (st1) {
      st1.textContent = todaySeconds >= 3600
        ? `${Math.floor(todaySeconds / 3600)}h ${Math.floor((todaySeconds % 3600) / 60)}m`
        : `${Math.floor(todaySeconds / 60)}m`;
    }
    if (st2) st2.textContent = String(AppState.done[dateKey(0)] || 0);
    if (st3) st3.textContent = String(calculateStreak());

    const bars = $('bars');
    if (!bars) return;
    bars.innerHTML = '';

    let maxVal = 1;
    const weekData = [];
    for (let i = 6; i >= 0; i--) {
      const val = AppState.days[dateKey(i)] || 0;
      maxVal = Math.max(maxVal, val);
      weekData.push([i, val]);
    }

    weekData.forEach(([offset, val]) => {
      const col = document.createElement('div');
      const bar = document.createElement('i');
      bar.style.height = `${Math.round((val / maxVal) * 85)}px`;

      const dayDate = new Date(Date.now() - offset * 864e5);
      const dayLabel = dayDate.toLocaleDateString(
        document.documentElement.lang || 'en-GB',
        { weekday: 'short' }
      ).slice(0, 2);

      col.append(bar, dayLabel);
      bars.appendChild(col);
    });

    renderKoreanPlannerGrid();
  }

  /* =========================================================================
     12. FOCUS JOURNAL
     ========================================================================= */
  function renderJournal() {
    const moodsContainer = $('moods');
    if (moodsContainer) {
      moodsContainer.innerHTML = '';
      ['😄', '🙂', '😐', '😟', '😴'].forEach(m => {
        const btn = document.createElement('button');
        btn.className = 'btn';
        btn.textContent = m;
        btn.classList.toggle('on', AppState.mood === m);
        btn.onclick = () => {
          AppState.mood = m;
          saveState();
          moodsContainer.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === btn));
        };
        moodsContainer.appendChild(btn);
      });
    }

    const noteInput = $('note');
    if (noteInput) {
      noteInput.value = AppState.note || '';
      noteInput.oninput = () => {
        AppState.note = noteInput.value;
        saveState();
        updateWordCount();
      };
      updateWordCount();
    }
  }

  function updateWordCount() {
    const noteInput = $('note');
    const cntEl = $('cnt');
    if (!noteInput || !cntEl) return;
    const text = noteInput.value.trim();
    const count = text ? text.split(/\s+/).length : 0;
    const t = window.I18n ? window.I18n.t : k => k;
    cntEl.textContent = `${count} ${t('words')}`;
  }

  /* =========================================================================
     13. DOCK & DRAWER PANELS
     ========================================================================= */
  function toggleDrawer(panelKey) {
    const focusCard = $('focus');
    if (panelKey === 'focus') {
      if (focusCard) focusCard.classList.toggle('hide');
    } else {
      const side = $('side');
      const targetSec = $('s-' + panelKey);
      const wasOpen = side.classList.contains('open') && targetSec && targetSec.classList.contains('on');

      document.querySelectorAll('#side section').forEach(sec => sec.classList.remove('on'));

      if (wasOpen) {
        side.classList.remove('open');
      } else {
        if (targetSec) targetSec.classList.add('on');
        side.classList.add('open');
      }

      if (panelKey === 'stats') renderStats();
      if (panelKey === 'todo') renderTasks();
      if (panelKey === 'journal') renderJournal();
      if (panelKey === 'amb') renderAmbienceMixer();
      if (panelKey === 'theme') renderThemeCards();
    }

    const sideOpen = $('side').classList.contains('open');
    const currentOpenSec = document.querySelector('#side section.on');

    document.querySelectorAll('#dock button').forEach(btn => {
      const k = btn.dataset.k;
      const isAct = (k === 'focus')
        ? (focusCard && !focusCard.classList.contains('hide'))
        : (sideOpen && currentOpenSec && currentOpenSec.id === 's-' + k);

      btn.classList.toggle('act', !!isAct);
    });
  }

  /* =========================================================================
     14. LANGUAGE SELECTOR SETUP
     ========================================================================= */
  function setupLanguageDropdown() {
    const btn = $('lang-select-btn');
    const menu = $('lang-menu');
    if (!btn || !menu || !window.I18n) return;

    btn.onclick = e => {
      e.stopPropagation();
      menu.classList.toggle('show');
    };

    menu.innerHTML = '';
    window.I18n.LANGUAGES.forEach(lang => {
      const opt = document.createElement('button');
      opt.className = 'lang-option' + (lang.code === window.I18n.getLanguage() ? ' selected' : '');
      opt.innerHTML = `<span>${lang.flag} ${lang.native}</span> <span style="opacity:0.6;font-size:11px">${lang.code}</span>`;
      opt.onclick = () => {
        window.I18n.setLanguage(lang.code);
        menu.classList.remove('show');
        updateCurrentLangBtn();
      };
      menu.appendChild(opt);
    });

    document.addEventListener('click', () => menu.classList.remove('show'));
  }

  function updateCurrentLangBtn() {
    const btn = $('lang-select-btn');
    if (!btn || !window.I18n) return;
    const meta = window.I18n.getMeta();
    btn.innerHTML = `<span>${meta.flag}</span> <b>${meta.native}</b> <span>▾</span>`;

    const quoteEl = $('quote-banner');
    if (quoteEl) quoteEl.textContent = `“${window.I18n.getRandomQuote()}”`;
  }

  /* =========================================================================
     15. INITIALIZATION
     ========================================================================= */
  function initApp() {
    // 1. Initialize i18n
    if (window.I18n) {
      window.I18n.init();
      setupLanguageDropdown();
      updateCurrentLangBtn();

      window.addEventListener('languagechange', () => {
        updateTimerDisplay();
        renderAmbienceMixer();
        renderThemeCards();
        renderTasks();
        updateWordCount();
        setCastCount(AppState.chars);
        updateCurrentLangBtn();
      });
    }

    // 2. Wire Timer Buttons
    const startBtn = $('start');
    if (startBtn) startBtn.onclick = toggleTimer;

    const resetBtn = $('reset');
    if (resetBtn) resetBtn.onclick = () => setTimerMode(currentTimerMode);

    const skipBtn = $('skip');
    if (skipBtn) skipBtn.onclick = () => onTimerComplete(false);

    document.querySelectorAll('#tabs button').forEach(btn => {
      btn.onclick = () => setTimerMode(btn.dataset.m);
    });

    const hrInput = $('hr');
    const mnInput = $('mn');
    if (hrInput) hrInput.onchange = onDurationChange;
    if (mnInput) mnInput.onchange = onDurationChange;

    // 3. Wire Cast Count Buttons
    document.querySelectorAll('#char-sel button').forEach(btn => {
      btn.onclick = () => setCastCount(parseInt(btn.dataset.c, 10));
    });
    const charPill = $('char-pill');
    if (charPill) charPill.onclick = () => setCastCount((AppState.chars + 1) % 5);

    // 4. Wire D-Day Pill & Countdown
    const ddayPill = $('dday-pill');
    if (ddayPill) ddayPill.onclick = promptDDaySetup;
    updateDDayDisplay();

    // 5. Wire Master Animation Toggle Pill
    const animToggleBtn = $('anim-toggle-btn');
    if (animToggleBtn) {
      animToggleBtn.onclick = () => {
        if (window.animEngine) {
          const nextState = window.animEngine.toggleAnim();
          AppState.animEnabled = nextState;
          saveState();
        }
      };
    }

    // 6. Wire Picture-in-Picture Button
    const pipBtn = $('pip-btn');
    if (pipBtn) pipBtn.onclick = togglePictureInPicture;

    // 7. Wire Zen Mode Button
    const zenPill = $('zen-pill');
    if (zenPill) zenPill.onclick = () => setZenMode(!AppState.zen);

    const mStudy = $('m-study');
    if (mStudy) mStudy.onclick = () => setZenMode(false);

    const mZen = $('m-zen');
    if (mZen) mZen.onclick = () => setZenMode(true);

    const peekBtn = $('peek-btn');
    if (peekBtn) peekBtn.onclick = () => toggleDrawer('focus');

    // 8. Wire Dock Navigation
    document.querySelectorAll('#dock button').forEach(btn => {
      btn.onclick = () => toggleDrawer(btn.dataset.k);
    });

    // 9. Wire Ambience Moodist Presets
    document.querySelectorAll('.amb-preset-btn').forEach(btn => {
      btn.onclick = () => applyAmbiencePreset(btn.dataset.preset);
    });

    // 10. Wire Tasks Form
    const taskForm = $('tf');
    if (taskForm) {
      taskForm.onsubmit = e => {
        e.preventDefault();
        const input = $('ti');
        const val = input ? input.value.trim() : '';
        if (!val) return;
        AppState.tasks.push({ t: val, d: false });
        input.value = '';
        saveState();
        renderTasks();
      };
    }

    // 11. Wire Lofi Music Controls
    const lofiPlayBtn = $('mpl');
    if (lofiPlayBtn) lofiPlayBtn.onclick = () => setLofiPlaying(!isLofiPlaying);

    const lofiPrevBtn = $('mp');
    if (lofiPrevBtn) {
      lofiPrevBtn.onclick = () => {
        currentTrackIdx = (currentTrackIdx + LOFI_TRACKS.length - 1) % LOFI_TRACKS.length;
        updateTrackTitle();
        if (isLofiPlaying) setLofiPlaying(true);
      };
    }

    const lofiNextBtn = $('mn2');
    if (lofiNextBtn) {
      lofiNextBtn.onclick = () => {
        currentTrackIdx = (currentTrackIdx + 1) % LOFI_TRACKS.length;
        updateTrackTitle();
        if (isLofiPlaying) setLofiPlaying(true);
      };
    }

    const musicVolSlider = $('mv');
    if (musicVolSlider) {
      musicVolSlider.oninput = e => {
        initAudioContext();
        if (musicGain) musicGain.gain.value = parseFloat(e.target.value);
      };
    }
    updateTrackTitle();

    // 12. Initial Scene, Mode & Render
    renderThemeCards();
    renderAmbienceMixer();
    renderTasks();
    renderJournal();
    renderStats();
    setScene(AppState.scene || 'dokseosil', true);
    setZenMode(AppState.zen);
    setCastCount(AppState.chars);
    setTimerMode('f');

    // Sync master animation engine
    if (window.animEngine) {
      window.animEngine.setAnimEnabled(AppState.animEnabled !== undefined ? AppState.animEnabled : true);
    }

    // 13. Global Spacebar to Start/Pause
    document.addEventListener('keydown', e => {
      if (e.code === 'Space' && !/INPUT|TEXTAREA|BUTTON/.test(e.target.tagName)) {
        e.preventDefault();
        toggleTimer();
      }
    });

    // 14. Support URL params (?panel=stats, ?panel=amb, ?zen=1, ?chars=2)
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const panel = urlParams.get('panel');
      if (panel) toggleDrawer(panel);
      if (urlParams.get('zen') === '1') setZenMode(true);
      if (urlParams.get('chars') !== null) setCastCount(parseInt(urlParams.get('chars'), 10));
    } catch (e) {}

    window.addEventListener('beforeunload', saveState);
  }

  // Export functions to window
  window.app = {
    toggleDrawer,
    setTimerMode,
    setZenMode,
    setScene,
    setCastCount,
    promptDDaySetup,
    togglePictureInPicture
  };

  document.addEventListener('DOMContentLoaded', initApp);
})();
