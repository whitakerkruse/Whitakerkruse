'use strict';

// ─── Display geometry ────────────────────────────────────────────────────────
const COLS = 20;
const ROWS = 5;

// ─── Character pool ──────────────────────────────────────────────────────────
const POOL =
  'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン' +
  '0123456789' +
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz' +
  '$#@%&*+:;=?!';

const rc = () => POOL[Math.floor(Math.random() * POOL.length)];

// ─── Per-column state ────────────────────────────────────────────────────────
const columns = Array.from({ length: COLS }, () => ({
  cells: Array(ROWS).fill(' '),
  speed: 1 + Math.floor(Math.random() * 3),
  tick:  Math.floor(Math.random() * 3),
  on:    Math.random() > 0.35
}));

function stepColumns() {
  columns.forEach(col => {
    if (!col.on) {
      if (Math.random() < 0.02) { col.on = true; col.speed = 1 + Math.floor(Math.random() * 3); }
      return;
    }
    if (++col.tick < col.speed) return;
    col.tick = 0;
    for (let r = ROWS - 1; r > 0; r--) col.cells[r] = col.cells[r - 1];
    col.cells[0] = Math.random() < 0.88 ? rc() : ' ';
    if (Math.random() < 0.025) {
      col.on = false;
      col.cells.fill(' ');
      col.speed = 1 + Math.floor(Math.random() * 3);
    }
  });
}

// ─── Frame renderer ──────────────────────────────────────────────────────────
function getTime() {
  const n = new Date();
  return [n.getHours(), n.getMinutes(), n.getSeconds()]
    .map(v => String(v).padStart(2, '0'))
    .join(':');
}

function renderFrame() {
  const rows = [];
  for (let r = 0; r < ROWS; r++) {
    rows.push(columns.map(c => c.cells[r]).join(''));
  }
  const t   = getTime();
  const mid = Math.floor(ROWS / 2);
  const s   = Math.floor((COLS - t.length) / 2);
  rows[mid] = rows[mid].slice(0, s) + t + rows[mid].slice(s + t.length);
  return rows.join('\n');
}

// ─── Send frame to glasses ───────────────────────────────────────────────────
function pushToGlasses(g, text) {
  if (!g) return;
  const methods = ['displayText', 'display', 'showText', 'setContent', 'write', 'sendText', 'setText'];
  for (const m of methods) {
    if (typeof g[m] === 'function') {
      try { g[m](text); } catch (_) {}
      return;
    }
  }
  if (typeof g === 'function') { try { g(text); } catch (_) {} }
}

// ─── Even G2 App export ──────────────────────────────────────────────────────
module.exports = {
  name: 'matrixrain1.1',
  description: 'Matrix rain animation with live clock on Even G2 glasses',

  start(ctx) {
    const glasses = (ctx && ctx.glasses) ? ctx.glasses : ctx;
    this._timer = setInterval(() => {
      stepColumns();
      pushToGlasses(glasses, renderFrame());
    }, 150);
  },

  stop() {
    clearInterval(this._timer);
  }
};
