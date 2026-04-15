'use strict';

// ─── Display geometry ────────────────────────────────────────────────────────
// G2 lens fits ~20 monospace chars wide and ~5 rows tall.
// Adjust COLS / ROWS if your Even Hub SDK reports a different viewport.
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
  speed: 1 + Math.floor(Math.random() * 3), // update every N ticks
  tick:  Math.floor(Math.random() * 3),
  on:    Math.random() > 0.35               // start ~65 % of columns active
}));

// Advance every column by one animation tick.
function stepColumns() {
  columns.forEach(col => {
    // Wake dormant columns randomly
    if (!col.on) {
      if (Math.random() < 0.02) {
        col.on    = true;
        col.speed = 1 + Math.floor(Math.random() * 3);
      }
      return;
    }

    // Throttle by per-column speed
    if (++col.tick < col.speed) return;
    col.tick = 0;

    // Cascade: shift every cell down one row, inject new char at top
    for (let r = ROWS - 1; r > 0; r--) col.cells[r] = col.cells[r - 1];
    col.cells[0] = Math.random() < 0.88 ? rc() : ' ';

    // Randomly deactivate and clear the column (creates the "rain" gaps)
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
  // Build text rows from column cell arrays
  const rows = [];
  for (let r = 0; r < ROWS; r++) {
    rows.push(columns.map(c => c.cells[r]).join(''));
  }

  // Stamp the current time into the exact centre row so it's always visible
  const t   = getTime();                          // e.g. "14:35:07"
  const mid = Math.floor(ROWS / 2);               // middle row index
  const s   = Math.floor((COLS - t.length) / 2);  // centre-align start
  rows[mid] = rows[mid].slice(0, s) + t + rows[mid].slice(s + t.length);

  return rows.join('\n');
}

// ─── Even G2 App export ──────────────────────────────────────────────────────
// Even Hub calls start(glasses) when the app becomes active and
// stop() when the user exits. The glasses.display(text) call sends
// a newline-separated string to the lens display.
module.exports = {
  name: 'Matrix Rain',
  description: 'Falling matrix characters with live clock on your Even G2 lens',

  start(glasses) {
    this._timer = setInterval(() => {
      stepColumns();
      glasses.display(renderFrame());
    }, 150); // ~6-7 fps — smooth on the G2 display
  },

  stop() {
    clearInterval(this._timer);
  }
};
