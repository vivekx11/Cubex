/* ============================================================
   CUBE FUSION 2048 —  GAME ENGINE
   ============================================================ */
'use strict';

/* ── Constants ── */
const GRID = 4;
const WIN_TILE = 2048;
const STORAGE_KEY = 'cubefusion_v2';

/* ── State ── */
let state = {
  board: [],
  score: 0,
  best: 0,
  moves: 0,
  merges: 0,
  highest: 0,
  mode: 'classic',
  gameOver: false,
  won: false,
  keepGoing: false,
  paused: false,
  aiRunning: false,
  doubleScore: false,
  destroyMode: false,
  combo: 0,
  comboTimer: null,
  timeLeft: 120,
  timerInterval: null,
  frozen: false,
  history: [],
  powerups: { undo: 3, destroy: 2, shuffle: 1, double: 1, freeze: 1 },
  achievements: new Set(),
  leaderboard: [],
  settings: { sfx: true, music: false, volume: 70, animations: true, particles: true, theme: 'neon' },
  dailySeed: null,
};

/* ── Saved data ── */
function loadStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    state.best = saved.best || 0;
    state.leaderboard = saved.leaderboard || [];
    state.achievements = new Set(saved.achievements || []);
    if (saved.settings) Object.assign(state.settings, saved.settings);
  } catch (e) {}
}
function saveStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      best: state.best,
      leaderboard: state.leaderboard,
      achievements: [...state.achievements],
      settings: state.settings,
    }));
  } catch (e) {}
}

/* ── Board helpers ── */
function emptyBoard() { return Array.from({ length: GRID }, () => Array(GRID).fill(0)); }
function cloneBoard(b) { return b.map(r => [...r]); }
function emptyCell(b) {
  const cells = [];
  for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) if (!b[r][c]) cells.push([r, c]);
  return cells;
}
function addRandom(b, count = 1) {
  const cells = emptyCell(b);
  for (let i = 0; i < count && cells.length; i++) {
    const idx = Math.floor(Math.random() * cells.length);
    const [r, c] = cells.splice(idx, 1)[0];
    b[r][c] = Math.random() < 0.9 ? 2 : 4;
  }
}
function hasMoves(b) {
  for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) {
    if (!b[r][c]) return true;
    if (c < GRID - 1 && b[r][c] === b[r][c + 1]) return true;
    if (r < GRID - 1 && b[r][c] === b[r + 1][c]) return true;
  }
  return false;
}
function boardMax(b) { return Math.max(...b.flat()); }

/* ── Move logic ── */
function slideRow(row) {
  let arr = row.filter(v => v);
  let merged = 0;
  for (let i = 0; i < arr.length - 1; i++) {
    if (arr[i] === arr[i + 1]) {
      arr[i] *= 2;
      merged += arr[i];
      arr.splice(i + 1, 1);
      i++;
    }
  }
  while (arr.length < GRID) arr.push(0);
  return { row: arr, merged };
}
function moveBoard(b, dir) {
  let totalMerged = 0;
  let mergeCount = 0;
  const newB = emptyBoard();
  const mergePositions = [];

  if (dir === 'left' || dir === 'right') {
    for (let r = 0; r < GRID; r++) {
      const row = dir === 'right' ? [...b[r]].reverse() : [...b[r]];
      const { row: slid, merged } = slideRow(row);
      newB[r] = dir === 'right' ? slid.reverse() : slid;
      if (merged) { totalMerged += merged; mergeCount++; }
    }
  } else {
    for (let c = 0; c < GRID; c++) {
      const col = b.map(r => r[c]);
      const arr = dir === 'down' ? [...col].reverse() : [...col];
      const { row: slid, merged } = slideRow(arr);
      const final = dir === 'down' ? slid.reverse() : slid;
      for (let r = 0; r < GRID; r++) newB[r][c] = final[r];
      if (merged) { totalMerged += merged; mergeCount++; }
    }
  }

  // Find merge positions for particles
  for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) {
    if (newB[r][c] > (b[r][c] || 0) && newB[r][c] > 2) mergePositions.push([r, c, newB[r][c]]);
  }

  const changed = JSON.stringify(b) !== JSON.stringify(newB);
  return { board: newB, merged: totalMerged, mergeCount, changed, mergePositions };
}

/* ── Score & Combo ── */
function addScore(pts) {
  if (!pts) return;
  const multiplier = state.doubleScore ? 2 : 1;
  const comboBonus = state.combo > 1 ? state.combo * 0.5 : 1;
  const total = Math.round(pts * multiplier * comboBonus);
  state.score += total;
  if (state.score > state.best) { state.best = state.score; saveStorage(); }
  showScoreAdd('+' + total);
  animateScoreCounter();
}
function showScoreAdd(text) {
  const el = document.getElementById('scoreAdd');
  el.textContent = text;
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
}
function animateScoreCounter() {
  const el = document.getElementById('scoreDisplay');
  el.style.transform = 'scale(1.2)';
  el.style.color = 'var(--accent3)';
  setTimeout(() => { el.style.transform = ''; el.style.color = ''; }, 200);
}
function updateCombo(mergeCount) {
  if (mergeCount > 0) {
    state.combo = Math.min(state.combo + mergeCount, 8);
    clearTimeout(state.comboTimer);
    state.comboTimer = setTimeout(() => { state.combo = 0; updateComboDisplay(); }, 2000);
  } else {
    state.combo = 0;
  }
  updateComboDisplay();
}
function updateComboDisplay() {
  const el = document.getElementById('comboDisplay');
  const val = document.getElementById('comboValue');
  if (state.combo > 1) {
    el.style.display = 'inline';
    val.textContent = state.combo;
  } else {
    el.style.display = 'none';
  }
}

/* ── Render ── */
function getTileSize() {
  const grid = document.getElementById('gridBg');
  const rect = grid.getBoundingClientRect();
  const gap = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--grid-gap')) || 10;
  const size = (rect.width - gap * (GRID + 1)) / GRID;
  return { size, gap, offsetX: rect.left, offsetY: rect.top };
}

function renderBoard(prevBoard, mergePositions = []) {
  const container = document.getElementById('gridTiles');
  const { size, gap } = getTileSize();

  // Remove old tiles
  container.innerHTML = '';

  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const val = state.board[r][c];
      if (!val) continue;

      const tile = document.createElement('div');
      tile.className = 'tile';
      tile.dataset.val = val > 8192 ? '8192' : val;
      tile.textContent = val;

      const x = gap + c * (size + gap);
      const y = gap + r * (size + gap);
      tile.style.left = x + 'px';
      tile.style.top = y + 'px';
      tile.style.width = size + 'px';
      tile.style.height = size + 'px';

      // Font size scaling
      const len = String(val).length;
      const fs = len <= 3 ? size * 0.38 : len === 4 ? size * 0.3 : size * 0.24;
      tile.style.fontSize = fs + 'px';

      // Check if this is a new or merged tile
      const isMerge = mergePositions.some(([mr, mc]) => mr === r && mc === c);
      const wasEmpty = !prevBoard || !prevBoard[r][c];

      if (isMerge && state.settings.animations) {
        tile.classList.add('tile-merge');
        if (state.settings.particles) spawnMergeParticles(x + size / 2, y + size / 2, val);
      } else if (wasEmpty && state.settings.animations) {
        tile.classList.add('tile-new');
      }

      // Destroy mode click
      if (state.destroyMode) {
        tile.style.cursor = 'pointer';
        tile.style.outline = '2px solid rgba(239,68,68,0.7)';
        tile.addEventListener('click', () => destroyTile(r, c));
      }

      container.appendChild(tile);
    }
  }

  // Update displays
  document.getElementById('scoreDisplay').textContent = state.score.toLocaleString();
  document.getElementById('bestDisplay').textContent = state.best.toLocaleString();
  document.getElementById('movesDisplay').textContent = state.moves;
  document.getElementById('highestDisplay').textContent = state.highest;
  document.getElementById('mergesDisplay').textContent = state.merges;
}

function buildGridBg() {
  const bg = document.getElementById('gridBg');
  bg.innerHTML = '';
  for (let i = 0; i < GRID * GRID; i++) {
    const cell = document.createElement('div');
    cell.className = 'grid-cell';
    bg.appendChild(cell);
  }
}

/* ── Particles ── */
function spawnMergeParticles(cx, cy, val) {
  if (!state.settings.particles) return;
  const layer = document.getElementById('particleLayer');
  const colors = ['var(--accent)', 'var(--accent2)', 'var(--accent3)', '#fff'];
  const count = Math.min(8 + Math.log2(val) * 2, 20);

  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const angle = (i / count) * Math.PI * 2;
    const dist = 30 + Math.random() * 50;
    const tx = Math.cos(angle) * dist;
    const ty = Math.sin(angle) * dist;
    const size = 3 + Math.random() * 5;
    const dur = 0.4 + Math.random() * 0.4;
    p.style.cssText = `
      left:${cx}px; top:${cy}px;
      width:${size}px; height:${size}px;
      background:${colors[Math.floor(Math.random() * colors.length)]};
      --tx:${tx}px; --ty:${ty}px;
      animation-duration:${dur}s;
      box-shadow:0 0 6px currentColor;
    `;
    layer.appendChild(p);
    setTimeout(() => p.remove(), dur * 1000 + 100);
  }
}

/* ── Game Flow ── */
function startGame(mode = 'classic') {
  state.mode = mode;
  state.board = emptyBoard();
  state.score = 0;
  state.moves = 0;
  state.merges = 0;
  state.highest = 0;
  state.gameOver = false;
  state.won = false;
  state.keepGoing = false;
  state.paused = false;
  state.combo = 0;
  state.doubleScore = false;
  state.destroyMode = false;
  state.history = [];
  state.powerups = { undo: 3, destroy: 2, shuffle: 1, double: 1, freeze: 1 };

  // Mode-specific setup
  clearInterval(state.timerInterval);
  state.frozen = false;
  const timerEl = document.getElementById('timerDisplay');
  const modeTag = document.getElementById('modeTag');
  modeTag.textContent = mode.toUpperCase().replace('TIMEATTACK', 'TIME ATTACK');

  if (mode === 'timeattack') {
    state.timeLeft = 120;
    timerEl.style.display = 'inline';
    updateTimerDisplay();
    state.timerInterval = setInterval(tickTimer, 1000);
  } else if (mode === 'speed') {
    timerEl.style.display = 'none';
  } else {
    timerEl.style.display = 'none';
  }

  // Hardcore: no powerups
  if (mode === 'hardcore') {
    document.getElementById('powerupsBar').style.display = 'none';
    document.getElementById('btnUndo').style.display = 'none';
  } else {
    document.getElementById('powerupsBar').style.display = 'flex';
    document.getElementById('btnUndo').style.display = '';
  }

  // Daily seed
  if (mode === 'daily') {
    const today = new Date().toDateString();
    state.dailySeed = hashCode(today);
    seededRandom(state.dailySeed);
  }

  addRandom(state.board, 2);
  buildGridBg();
  renderBoard(null);
  updatePowerupUI();
  showScreen('game');
  playSound('move');
}

function tickTimer() {
  if (state.paused || state.frozen || state.gameOver) return;
  state.timeLeft--;
  updateTimerDisplay();
  if (state.timeLeft <= 0) {
    clearInterval(state.timerInterval);
    triggerGameOver();
  }
}
function updateTimerDisplay() {
  const m = Math.floor(state.timeLeft / 60);
  const s = state.timeLeft % 60;
  document.getElementById('timerValue').textContent = `${m}:${s.toString().padStart(2, '0')}`;
  const el = document.getElementById('timerDisplay');
  if (state.timeLeft <= 30) el.style.color = '#ef4444';
  else el.style.color = '';
}

function processMove(dir) {
  if (state.gameOver || state.paused || state.destroyMode) return;

  const prev = cloneBoard(state.board);
  const { board, merged, mergeCount, changed, mergePositions } = moveBoard(state.board, dir);

  if (!changed) { playSound('move'); return; }

  // Save history
  state.history.push({ board: prev, score: state.score, moves: state.moves, merges: state.merges });
  if (state.history.length > 10) state.history.shift();

  state.board = board;
  state.moves++;
  state.merges += mergeCount;

  if (merged) {
    addScore(merged);
    updateCombo(mergeCount);
    playSound('merge');
  } else {
    updateCombo(0);
    playSound('move');
  }

  // Speed mode: spawn 2 tiles
  const spawnCount = state.mode === 'speed' ? 2 : 1;
  addRandom(state.board, spawnCount);

  state.highest = boardMax(state.board);
  renderBoard(prev, mergePositions);
  checkAchievements();

  // Win check
  if (!state.won && !state.keepGoing && state.highest >= WIN_TILE && state.mode !== 'infinite') {
    state.won = true;
    setTimeout(() => triggerVictory(), 400);
    return;
  }

  // Game over check
  if (!hasMoves(state.board)) {
    setTimeout(() => triggerGameOver(), 400);
  }
}

function triggerGameOver() {
  state.gameOver = true;
  clearInterval(state.timerInterval);
  saveToLeaderboard();
  playSound('lose');

  document.getElementById('goScore').textContent = state.score.toLocaleString();
  document.getElementById('goBest').textContent = state.best.toLocaleString();
  document.getElementById('goTile').textContent = state.highest;
  document.getElementById('goMoves').textContent = state.moves;

  const achRow = document.getElementById('goAchievements');
  achRow.innerHTML = '';
  state.achievements.forEach(a => {
    const ach = ACHIEVEMENTS[a];
    if (!ach) return;
    const b = document.createElement('div');
    b.className = 'achievement-badge';
    if (ach.svgPath) {
      b.innerHTML = `<svg class="badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ach.svgPath}</svg><span>${ach.name}</span>`;
    } else {
      b.innerHTML = `<span class="badge-num">${ach.icon}</span><span>${ach.name}</span>`;
    }
    achRow.appendChild(b);
  });

  showScreen('gameover');
}

function triggerVictory() {
  clearInterval(state.timerInterval);
  saveToLeaderboard();
  playSound('win');

  document.getElementById('winScore').textContent = state.score.toLocaleString();
  document.getElementById('winMoves').textContent = state.moves;
  document.getElementById('victoryTile').textContent = WIN_TILE;

  showScreen('victory');
  spawnConfetti();
}

function saveToLeaderboard() {
  state.leaderboard.push({
    score: state.score,
    tile: state.highest,
    moves: state.moves,
    mode: state.mode,
    date: new Date().toLocaleDateString(),
  });
  state.leaderboard.sort((a, b) => b.score - a.score);
  state.leaderboard = state.leaderboard.slice(0, 20);
  saveStorage();
}

/* ── Powerups ── */
function updatePowerupUI() {
  const pu = state.powerups;
  document.getElementById('puUndo').textContent = pu.undo;
  document.getElementById('puDestroy').textContent = pu.destroy;
  document.getElementById('puShuffle').textContent = pu.shuffle;
  document.getElementById('puDouble').textContent = pu.double;
  document.getElementById('puFreeze').textContent = pu.freeze;

  document.querySelectorAll('.powerup-btn').forEach(btn => {
    const p = btn.dataset.power;
    btn.classList.toggle('disabled', pu[p] <= 0);
  });

  // Show freeze only in time attack
  const freezeBtn = document.getElementById('puFreezeBtn');
  freezeBtn.style.display = state.mode === 'timeattack' ? 'flex' : 'none';
}

function usePowerup(type) {
  if (state.powerups[type] <= 0 || state.gameOver) return;
  if (state.mode === 'hardcore') return;

  switch (type) {
    case 'undo': doUndo(); break;
    case 'destroy':
      state.destroyMode = true;
      document.getElementById('destroyOverlay').style.display = 'flex';
      renderBoard(null);
      break;
    case 'shuffle': doShuffle(); break;
    case 'double': doDouble(); break;
    case 'freeze': doFreeze(); break;
  }
}

function doUndo() {
  if (!state.history.length) return;
  const prev = state.history.pop();
  state.board = prev.board;
  state.score = prev.score;
  state.moves = prev.moves;
  state.merges = prev.merges;
  state.powerups.undo--;
  renderBoard(null);
  updatePowerupUI();
  playSound('move');
}

function doShuffle() {
  const vals = state.board.flat().filter(v => v);
  const cells = [];
  for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) cells.push([r, c]);
  // Fisher-Yates shuffle
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  state.board = emptyBoard();
  vals.forEach((v, i) => { state.board[cells[i][0]][cells[i][1]] = v; });
  state.powerups.shuffle--;
  renderBoard(null);
  updatePowerupUI();
  playSound('merge');
}

function doDouble() {
  state.doubleScore = true;
  state.powerups.double--;
  updatePowerupUI();
    showAchievementToast('x2 Score Active for next 30 seconds!');
  let count = 0;
  const orig = processMove.bind({});
  const wrap = (dir) => {
    processMove(dir);
    count++;
    if (count >= 5) { state.doubleScore = false; }
  };
  // handled via state.doubleScore flag in addScore
  setTimeout(() => { state.doubleScore = false; }, 30000);
}

function doFreeze() {
  if (state.mode !== 'timeattack') return;
  state.frozen = true;
  state.powerups.freeze--;
  updatePowerupUI();
  showAchievementToast('Time Frozen for 10 seconds!');
  setTimeout(() => { state.frozen = false; }, 10000);
}

function destroyTile(r, c) {
  if (!state.destroyMode) return;
  state.board[r][c] = 0;
  state.powerups.destroy--;
  state.destroyMode = false;
  document.getElementById('destroyOverlay').style.display = 'none';
  renderBoard(null);
  updatePowerupUI();
  playSound('merge');
}

/* ── Achievements ── */
const ACHIEVEMENTS = {
  first_merge:  { name: 'First Merge',   icon: 'NEW', svgPath: '<path d="M13 2L3 14h9l-1 8 10-12h-9z"/>',                                                                    check: s => s.merges >= 1 },
  score_1000:   { name: 'Score 1K',      icon: '1K',  svgPath: null,                                                                                                         check: s => s.score >= 1000 },
  score_10000:  { name: 'Score 10K',     icon: '10K', svgPath: null,                                                                                                         check: s => s.score >= 10000 },
  score_50000:  { name: 'Score 50K',     icon: '50K', svgPath: null,                                                                                                         check: s => s.score >= 50000 },
  tile_128:     { name: 'Tile 128',      icon: '128', svgPath: null,                                                                                                         check: s => s.highest >= 128 },
  tile_512:     { name: 'Tile 512',      icon: '512', svgPath: null,                                                                                                         check: s => s.highest >= 512 },
  tile_1024:    { name: 'Tile 1024',     icon: '1K',  svgPath: null,                                                                                                         check: s => s.highest >= 1024 },
  tile_2048:    { name: 'Tile 2048',     icon: '2K',  svgPath: '<rect x="9" y="2" width="6" height="20" rx="1"/><rect x="2" y="8" width="6" height="14" rx="1"/><rect x="16" y="5" width="6" height="17" rx="1"/>',  check: s => s.highest >= 2048 },
  tile_4096:    { name: 'Tile 4096',     icon: '4K',  svgPath: '<polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/>',  check: s => s.highest >= 4096 },
  moves_100:    { name: '100 Moves',     icon: '100', svgPath: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',  check: s => s.moves >= 100 },
  combo_5:      { name: 'Combo x5',      icon: 'x5',  svgPath: '<path d="M13 2L3 14h9l-1 8 10-12h-9z"/>',                                                                   check: s => s.combo >= 5 },
  speed_win:    { name: 'Speed Demon',   icon: 'SPD', svgPath: '<path d="M13 2L3 14h9l-1 8 10-12h-9z"/>',                                                                   check: s => s.mode === 'speed' && s.highest >= 512 },
};

function checkAchievements() {
  Object.entries(ACHIEVEMENTS).forEach(([key, ach]) => {
    if (!state.achievements.has(key) && ach.check(state)) {
      state.achievements.add(key);
      saveStorage();
      showAchievementToast('Achievement Unlocked: ' + ach.name);
    }
  });
}

function showAchievementToast(msg) {
  const toast = document.getElementById('achievementToast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

/* ── Sound Engine ── */
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new AudioCtx();
  return audioCtx;
}
function playSound(type) {
  if (!state.settings.sfx) return;
  try {
    const ctx = getAudioCtx();
    const vol = state.settings.volume / 100;
    const g = ctx.createGain();
    g.gain.value = vol * 0.3;
    g.connect(ctx.destination);

    const osc = ctx.createOscillator();
    osc.connect(g);

    const now = ctx.currentTime;
    switch (type) {
      case 'move':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(180, now + 0.08);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(now); osc.stop(now + 0.1);
        break;
      case 'merge':
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now); osc.stop(now + 0.2);
        break;
      case 'win':
        ['C5','E5','G5','C6'].forEach((n, i) => {
          const o2 = ctx.createOscillator();
          const g2 = ctx.createGain();
          o2.connect(g2); g2.connect(ctx.destination);
          o2.type = 'sine';
          const freq = { C5:523, E5:659, G5:784, C6:1047 }[n];
          o2.frequency.value = freq;
          g2.gain.setValueAtTime(vol * 0.2, now + i * 0.12);
          g2.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.3);
          o2.start(now + i * 0.12); o2.stop(now + i * 0.12 + 0.3);
        });
        return;
      case 'lose':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.5);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.start(now); osc.stop(now + 0.5);
        break;
    }
  } catch (e) {}
}

/* ── Screen Manager ── */
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen-' + name);
  if (el) el.classList.add('active');
}

/* ── Background Canvas Animations ── */
class ParticleSystem {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.running = false;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }
  resize() {
    this.canvas.width = this.canvas.offsetWidth;
    this.canvas.height = this.canvas.offsetHeight;
  }
  spawn(count = 60) {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: Math.random() * this.canvas.width,
        y: Math.random() * this.canvas.height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: -0.3 - Math.random() * 0.5,
        size: 1 + Math.random() * 3,
        alpha: 0.1 + Math.random() * 0.4,
        color: Math.random() < 0.5 ? 'var(--accent)' : 'var(--accent2)',
        life: 1,
        decay: 0.002 + Math.random() * 0.003,
      });
    }
  }
  start() {
    if (this.running) return;
    this.running = true;
    this.spawn(80);
    this.loop();
  }
  stop() { this.running = false; }
  loop() {
    if (!this.running) return;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw grid lines
    ctx.strokeStyle = 'rgba(0,255,255,0.03)';
    ctx.lineWidth = 1;
    const spacing = 60;
    for (let x = 0; x < this.canvas.width; x += spacing) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.canvas.height); ctx.stroke();
    }
    for (let y = 0; y < this.canvas.height; y += spacing) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.canvas.width, y); ctx.stroke();
    }

    this.particles = this.particles.filter(p => p.life > 0);
    if (this.particles.length < 60) this.spawn(5);

    this.particles.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.life -= p.decay;
      if (p.y < 0) { p.y = this.canvas.height; p.life = 1; }
      if (p.x < 0) p.x = this.canvas.width;
      if (p.x > this.canvas.width) p.x = 0;

      ctx.save();
      ctx.globalAlpha = p.alpha * p.life;
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#0ff';
      ctx.shadowBlur = 6;
      ctx.shadowColor = ctx.fillStyle;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    requestAnimationFrame(() => this.loop());
  }
}

// Init particle systems for each canvas
const bgSystems = {};
function initBgCanvas(id) {
  const canvas = document.getElementById(id);
  if (!canvas || bgSystems[id]) return;
  bgSystems[id] = new ParticleSystem(canvas);
  bgSystems[id].start();
}

/* ── Floating Cubes (Menu) ── */
function spawnFloatingCubes() {
  const container = document.getElementById('floatingCubes');
  if (!container) return;
  container.innerHTML = '';
  const nums = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048];
  for (let i = 0; i < 15; i++) {
    const cube = document.createElement('div');
    cube.className = 'float-cube';
    const size = 30 + Math.random() * 60;
    const left = Math.random() * 100;
    const dur = 8 + Math.random() * 12;
    const delay = -Math.random() * dur;
    cube.style.cssText = `
      width:${size}px; height:${size}px;
      left:${left}%;
      animation-duration:${dur}s;
      animation-delay:${delay}s;
      font-family:'Orbitron',sans-serif;
      font-size:${size * 0.3}px;
      color:var(--accent);
      display:flex; align-items:center; justify-content:center;
    `;
    cube.textContent = nums[Math.floor(Math.random() * nums.length)];
    container.appendChild(cube);
  }
}

/* ── Confetti ── */
function spawnConfetti() {
  const container = document.getElementById('confettiContainer');
  container.innerHTML = '';
  const colors = ['#ffd700', '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ff9ff3', '#54a0ff'];
  for (let i = 0; i < 120; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    const color = colors[Math.floor(Math.random() * colors.length)];
    const left = Math.random() * 100;
    const dur = 2 + Math.random() * 3;
    const delay = Math.random() * 2;
    const size = 6 + Math.random() * 10;
    const shape = Math.random() < 0.5 ? '50%' : '0';
    piece.style.cssText = `
      left:${left}%;
      width:${size}px; height:${size}px;
      background:${color};
      border-radius:${shape};
      animation-duration:${dur}s;
      animation-delay:${delay}s;
      box-shadow:0 0 6px ${color};
    `;
    container.appendChild(piece);
  }
  setTimeout(() => { container.innerHTML = ''; }, 6000);
}

/* ── Leaderboard UI ── */
function renderLeaderboard(tab = 'scores') {
  const content = document.getElementById('lbContent');
  content.innerHTML = '';

  let entries = [...state.leaderboard];
  if (tab === 'tiles') entries.sort((a, b) => b.tile - a.tile);
  else if (tab === 'modes') {
    // Group by mode
    const modes = {};
    entries.forEach(e => {
      if (!modes[e.mode] || e.score > modes[e.mode].score) modes[e.mode] = e;
    });
    entries = Object.values(modes).sort((a, b) => b.score - a.score);
  }

  if (!entries.length) {
    content.innerHTML = '<p style="text-align:center;color:var(--text-dim);padding:30px">No scores yet. Play a game!</p>';
    return;
  }

  entries.slice(0, 10).forEach((e, i) => {
    const div = document.createElement('div');
    div.className = 'lb-entry';
    const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
    const rankSvg = i === 0
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="6"/><path d="M8 14l-2 7h12l-2-7"/><path d="M10 8h4M12 6v4"/></svg>`
      : i === 1
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="6"/><path d="M8 14l-2 7h12l-2-7"/></svg>`
      : i === 2
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="9" r="6"/><path d="M8 15l-2 6h12l-2-6"/></svg>`
      : `<span>#${i + 1}</span>`;
    div.innerHTML = `
      <div class="lb-rank ${rankClass}">${rankSvg}</div>
      <div class="lb-info">
        <div class="lb-score">${e.score.toLocaleString()}</div>
        <div class="lb-meta">${e.mode.toUpperCase()} · ${e.moves} moves · ${e.date}</div>
      </div>
      <div class="lb-tile">${e.tile}</div>
    `;
    content.appendChild(div);
  });
}

/* ── Settings UI ── */
function applySettings() {
  const s = state.settings;
  document.body.className = 'theme-' + s.theme;
  document.getElementById('sfxToggle').checked = s.sfx;
  document.getElementById('musicToggle').checked = s.music;
  document.getElementById('volumeSlider').value = s.volume;
  document.getElementById('animToggle').checked = s.animations;
  document.getElementById('particleToggle').checked = s.particles;
  document.querySelectorAll('.theme-swatch').forEach(sw => {
    sw.classList.toggle('active', sw.dataset.theme === s.theme);
  });
}

/* ── AI Autoplay ── */
function aiMove() {
  if (!state.aiRunning || state.gameOver) return;
  const dirs = ['up', 'down', 'left', 'right'];
  // Simple heuristic: try each direction, pick best score
  let bestDir = dirs[Math.floor(Math.random() * dirs.length)];
  let bestScore = -1;
  dirs.forEach(dir => {
    const { board, merged, changed } = moveBoard(state.board, dir);
    if (changed) {
      const score = merged + emptyCell(board).length * 10 + boardMax(board);
      if (score > bestScore) { bestScore = score; bestDir = dir; }
    }
  });
  processMove(bestDir);
  if (!state.gameOver) setTimeout(aiMove, 200);
}

/* ── Utility ── */
function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}
let _seed = 0;
function seededRandom(seed) { _seed = seed; }

/* ── Daily Timer ── */
function updateDailyTimer() {
  const now = new Date();
  const midnight = new Date(now); midnight.setHours(24, 0, 0, 0);
  const diff = midnight - now;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  const el = document.getElementById('dailyTimer');
  if (el) el.textContent = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
}

/* ── Input Handling ── */
function setupInput() {
  // Keyboard
  document.addEventListener('keydown', e => {
    const map = { ArrowLeft:'left', ArrowRight:'right', ArrowUp:'up', ArrowDown:'down',
                  a:'left', d:'right', w:'up', s:'down' };
    if (map[e.key]) { e.preventDefault(); processMove(map[e.key]); }
    if (e.key === 'Escape') {
      if (document.getElementById('screen-game').classList.contains('active')) togglePause();
    }
    if (e.key === 'z' || e.key === 'Z') doUndo();
    if (e.key === 'r' || e.key === 'R') {
      if (document.getElementById('screen-game').classList.contains('active')) confirmRestart();
    }
  });

  // Touch / Swipe
  let touchStartX = 0, touchStartY = 0;
  const grid = document.getElementById('gridTiles');

  document.addEventListener('touchstart', e => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  document.addEventListener('touchend', e => {
    if (!document.getElementById('screen-game').classList.contains('active')) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    const absDx = Math.abs(dx), absDy = Math.abs(dy);
    if (Math.max(absDx, absDy) < 20) return;
    if (absDx > absDy) processMove(dx > 0 ? 'right' : 'left');
    else processMove(dy > 0 ? 'down' : 'up');
  }, { passive: true });
}

function togglePause() {
  if (state.gameOver) return;
  state.paused = !state.paused;
  if (state.paused) {
    document.getElementById('pauseScore').textContent = state.score.toLocaleString();
    document.getElementById('pauseMoves').textContent = state.moves;
    document.getElementById('pauseMode').textContent = state.mode.toUpperCase();
    showScreen('pause');
  } else {
    showScreen('game');
  }
}

function confirmRestart() {
  if (confirm('Restart game? Current progress will be lost.')) {
    startGame(state.mode);
  }
}

/* ── Event Listeners ── */
function setupEvents() {
  // Menu
  document.getElementById('btnPlay').addEventListener('click', () => startGame('classic'));
  document.getElementById('btnModes').addEventListener('click', () => { showScreen('modes'); initBgCanvas('modesBgCanvas'); });
  document.getElementById('btnLeaderboard').addEventListener('click', () => {
    renderLeaderboard('scores');
    showScreen('leaderboard');
    initBgCanvas('lbBgCanvas');
  });
  document.getElementById('btnSettings').addEventListener('click', () => {
    applySettings();
    showScreen('settings');
    initBgCanvas('settingsBgCanvas');
  });
  document.getElementById('btnAI').addEventListener('click', () => {
    startGame('classic');
    state.aiRunning = true;
    showAchievementToast('AI Autoplay Active');
    setTimeout(aiMove, 500);
  });

  // Mode cards
  document.querySelectorAll('.mode-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      setTimeout(() => startGame(card.dataset.mode), 200);
    });
  });
  document.getElementById('btnModesBack').addEventListener('click', () => showScreen('menu'));

  // Game controls
  document.getElementById('btnUndo').addEventListener('click', doUndo);
  document.getElementById('btnPause').addEventListener('click', togglePause);
  document.getElementById('btnRestart').addEventListener('click', confirmRestart);

  // Powerups
  document.querySelectorAll('.powerup-btn').forEach(btn => {
    btn.addEventListener('click', () => usePowerup(btn.dataset.power));
  });
  document.getElementById('btnCancelDestroy').addEventListener('click', () => {
    state.destroyMode = false;
    document.getElementById('destroyOverlay').style.display = 'none';
    renderBoard(null);
  });

  // Pause menu
  document.getElementById('btnResume').addEventListener('click', togglePause);
  document.getElementById('btnPauseRestart').addEventListener('click', () => { showScreen('game'); startGame(state.mode); });
  document.getElementById('btnPauseMenu').addEventListener('click', () => { clearInterval(state.timerInterval); showScreen('menu'); });

  // Game over
  document.getElementById('btnGoRestart').addEventListener('click', () => startGame(state.mode));
  document.getElementById('btnGoMenu').addEventListener('click', () => showScreen('menu'));

  // Victory
  document.getElementById('btnWinContinue').addEventListener('click', () => {
    state.keepGoing = true;
    showScreen('game');
  });
  document.getElementById('btnWinRestart').addEventListener('click', () => startGame(state.mode));
  document.getElementById('btnWinMenu').addEventListener('click', () => showScreen('menu'));

  // Leaderboard tabs
  document.querySelectorAll('.lb-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.lb-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderLeaderboard(tab.dataset.tab);
    });
  });
  document.getElementById('btnLbBack').addEventListener('click', () => showScreen('menu'));

  // Settings
  document.getElementById('btnSettingsBack').addEventListener('click', () => { saveStorage(); showScreen('menu'); });
  document.getElementById('sfxToggle').addEventListener('change', e => { state.settings.sfx = e.target.checked; saveStorage(); });
  document.getElementById('musicToggle').addEventListener('change', e => { state.settings.music = e.target.checked; saveStorage(); });
  document.getElementById('volumeSlider').addEventListener('input', e => { state.settings.volume = +e.target.value; saveStorage(); });
  document.getElementById('animToggle').addEventListener('change', e => { state.settings.animations = e.target.checked; saveStorage(); });
  document.getElementById('particleToggle').addEventListener('change', e => { state.settings.particles = e.target.checked; saveStorage(); });
  document.getElementById('btnFullscreen').addEventListener('click', () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    else document.exitFullscreen().catch(() => {});
  });
  document.getElementById('btnResetScores').addEventListener('click', () => {
    if (confirm('Reset all scores and achievements?')) {
      state.best = 0; state.leaderboard = []; state.achievements = new Set();
      saveStorage();
      showAchievementToast('All data reset.');
    }
  });
  document.querySelectorAll('.theme-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      state.settings.theme = sw.dataset.theme;
      applySettings();
      saveStorage();
    });
  });

  // Menu best scores
  function updateMenuStats() {
    document.getElementById('menuBestScore').textContent = state.best.toLocaleString();
    const bestTile = state.leaderboard.length ? Math.max(...state.leaderboard.map(e => e.tile)) : 0;
    document.getElementById('menuBestTile').textContent = bestTile;
  }
  // Update when menu is shown
  const menuObs = new MutationObserver(() => {
    if (document.getElementById('screen-menu').classList.contains('active')) updateMenuStats();
  });
  menuObs.observe(document.getElementById('screen-menu'), { attributes: true, attributeFilter: ['class'] });
}

/* ── Loading Screen ── */
function runLoadingScreen() {
  const bar = document.getElementById('loadingBar');
  const tip = document.getElementById('loadingTip');
  const tips = [
    'Initializing quantum grid...',
    'Loading neon shaders...',
    'Calibrating merge algorithms...',
    'Charging particle cannons...',
    'Syncing leaderboard...',
    'Ready to fuse!',
  ];
  let progress = 0;
  let tipIdx = 0;

  const interval = setInterval(() => {
    progress += Math.random() * 18 + 5;
    if (progress > 100) progress = 100;
    bar.style.width = progress + '%';
    tip.textContent = tips[Math.min(tipIdx++, tips.length - 1)];

    if (progress >= 100) {
      clearInterval(interval);
      setTimeout(() => {
        showScreen('menu');
        initBgCanvas('menuBgCanvas');
        spawnFloatingCubes();
        setInterval(updateDailyTimer, 1000);
        updateDailyTimer();
      }, 400);
    }
  }, 280);
}

/* ── Init ── */
function init() {
  loadStorage();
  applySettings();
  setupInput();
  setupEvents();
  initBgCanvas('bgCanvas');
  runLoadingScreen();
}

document.addEventListener('DOMContentLoaded', init);
