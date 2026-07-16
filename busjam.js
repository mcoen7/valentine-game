// ─────────────────────────────────────────────
//  Dachshund Bus Jam – sliding-block color-match puzzle
//  (modeled on Bus Traffic Fever / Parking Jam-style games)
//
//  - A lot of parked buses, each with a direction arrow. A bus can only
//    exit toward its arrow if every cell between it and that edge is empty.
//  - Exiting buses fill a 4-slot dock, merging with same-color buses already
//    docked (their capacity stacks).
//  - A winding queue of dachshunds waits to board. Tapping a dock bus whose
//    color matches the front of the queue sends it in to collect passengers
//    (up to its capacity), draining the queue.
//  - Clear the whole queue to win. If no lot bus can exit AND no dock bus
//    matches the queue's front color, it's a Deadlock — game over.
// ─────────────────────────────────────────────

const BJ_COLOR_HEX = {
  red: '#e8587a',
  blue: '#4fa3e3',
  yellow: '#f0c419',
  green: '#5cbf6a',
  purple: '#9b6bd4',
};
const BJ_COLORS = Object.keys(BJ_COLOR_HEX);

const BJ_LOT_ROWS = 4;
const BJ_LOT_COLS = 4;
const BJ_BUS_CAPACITY = 3;
// One slot per color: a bus can always find room the instant it exits the
// lot (merging into its color's slot if one's already there), so the only
// way to get stuck is the sliding-block puzzle itself — never a dock
// pile-up of colors nobody needs yet.
const BJ_DOCK_SLOTS = BJ_COLORS.length;
const BJ_UNDO_LIMIT = 3;
const BJ_LOOP_COLS = 8;
const BJ_ARROWS = { up: '⬆', down: '⬇', left: '⬅', right: '➡' };

let bjState = null;
let bjInitialSnapshot = null;
let bjHistory = [];
let bjUndosLeft = BJ_UNDO_LIMIT;

// ── SFX (reuses playTone/playNoise from main.js) ──
function bjSfxExit() {
  playTone(500, 0.08, 'square', 0.05);
}
function bjSfxDepart() {
  playTone(600, 0.1, 'sine', 0.06);
  playTone(800, 0.08, 'sine', 0.04);
}
function bjSfxWrong() {
  playTone(180, 0.12, 'sawtooth', 0.06);
}
function bjSfxWin() {
  [523, 659, 784, 1047, 1319].forEach((f, i) => {
    setTimeout(() => playTone(f, 0.35, 'sine', 0.09), i * 110);
  });
}
function bjSfxLose() {
  playTone(300, 0.2, 'sawtooth', 0.08);
  setTimeout(() => playTone(200, 0.3, 'sawtooth', 0.08), 150);
}

// ── Level generation ──
// Direction = nearest edge. This guarantees every bus's straight-line exit
// path is only ever blocked by buses strictly nearer that same edge, so
// clearing rings outside-in is always a valid solve order.
function bjNearestEdgeDir(row, col, rows, cols) {
  const dTop = row, dBottom = rows - 1 - row, dLeft = col, dRight = cols - 1 - col;
  const minD = Math.min(dTop, dBottom, dLeft, dRight);
  const candidates = [];
  if (dTop === minD) candidates.push('up');
  if (dBottom === minD) candidates.push('down');
  if (dLeft === minD) candidates.push('left');
  if (dRight === minD) candidates.push('right');
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function bjShuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function bjGenerateLevel() {
  const rows = BJ_LOT_ROWS, cols = BJ_LOT_COLS;
  const totalCells = rows * cols;

  // Round-robin the palette across cells (then shuffle placement) so every
  // color is guaranteed to appear in the lot at least a few times.
  const colorPool = [];
  for (let i = 0; i < totalCells; i++) colorPool.push(BJ_COLORS[i % BJ_COLORS.length]);
  bjShuffle(colorPool);

  const lot = [];
  const colorCounts = {};
  BJ_COLORS.forEach(c => { colorCounts[c] = 0; });
  let id = 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const dir = bjNearestEdgeDir(r, c, rows, cols);
      const color = colorPool[r * cols + c];
      lot.push({ id: id++, row: r, col: c, dir, color, exited: false });
      colorCounts[color]++;
    }
  }

  // One contiguous block per color, sized to exactly that color's total lot
  // capacity. Because the dock merges same-color buses into a single running
  // total, the loop must never split a color into multiple blocks — merged
  // capacity would then overshoot one run and strand the rest with no bus
  // left to claim it. A single block per color, exactly capacity-sized,
  // keeps every dispatch an exact drain with nothing left over.
  const blocks = BJ_COLORS
    .filter(c => colorCounts[c] > 0)
    .map(c => ({ color: c, size: colorCounts[c] * BJ_BUS_CAPACITY }));
  bjShuffle(blocks);

  const loop = [];
  blocks.forEach(b => {
    for (let i = 0; i < b.size; i++) loop.push({ color: b.color });
  });

  return { lot, loop };
}

// ── Setup ──
function initBusJam() {
  const { lot, loop } = bjGenerateLevel();
  bjState = { lot, dock: new Array(BJ_DOCK_SLOTS).fill(null), loop, gameOver: false };
  bjInitialSnapshot = JSON.parse(JSON.stringify(bjState));
  bjHistory = [];
  bjUndosLeft = BJ_UNDO_LIMIT;
  document.getElementById('busjam-modal').classList.add('screen-hidden');
  bjRenderAll();
}

function stopBusJam() {
  // No timers to clean up in this version; kept for menu-navigation symmetry.
}

function bjRestart() {
  if (!bjInitialSnapshot) return;
  bjState = JSON.parse(JSON.stringify(bjInitialSnapshot));
  bjHistory = [];
  bjUndosLeft = BJ_UNDO_LIMIT;
  document.getElementById('busjam-modal').classList.add('screen-hidden');
  bjRenderAll();
}

function bjSnapshot() {
  bjHistory.push(JSON.parse(JSON.stringify(bjState)));
}

function bjUndo() {
  if (bjState.gameOver || bjUndosLeft <= 0 || bjHistory.length === 0) return;
  bjState = bjHistory.pop();
  bjUndosLeft--;
  bjRenderAll();
}

// ── Rendering ──
function bjRenderAll() {
  bjRenderLoop();
  bjRenderDock();
  bjRenderLot();
  bjUpdateHUD();
}

function bjRenderLoop() {
  const container = document.getElementById('bj-loop');
  container.innerHTML = '';
  // Render back-of-queue first (top) so the front (index 0) ends up in the
  // bottom row, right above the dock — matching where pickup happens.
  const reversed = bjState.loop.slice().reverse();
  for (let i = 0; i < reversed.length; i += BJ_LOOP_COLS) {
    const row = reversed.slice(i, i + BJ_LOOP_COLS);
    const rowEl = document.createElement('div');
    const rowIndex = i / BJ_LOOP_COLS;
    rowEl.className = 'bj-loop-row' + (rowIndex % 2 === 1 ? ' bj-row-rev' : '');
    row.forEach(p => {
      const cell = document.createElement('div');
      cell.className = 'bj-pax';
      cell.style.background = BJ_COLOR_HEX[p.color];
      cell.textContent = '🐕';
      rowEl.appendChild(cell);
    });
    container.appendChild(rowEl);
  }
}

function bjRenderDock() {
  const container = document.getElementById('bj-dock');
  container.innerHTML = '';
  for (let i = 0; i < BJ_DOCK_SLOTS; i++) {
    const slot = bjState.dock[i];
    const el = document.createElement('div');
    el.className = 'bj-dock-slot' + (slot ? ' filled' : ' empty');
    el.dataset.slot = i;
    if (slot) {
      el.style.background = `linear-gradient(160deg, ${BJ_COLOR_HEX[slot.color]}, ${BJ_COLOR_HEX[slot.color]}cc)`;
      el.innerHTML = `<span class="bj-dock-emoji">🚌</span><span class="bj-dock-count">${slot.remaining}</span>`;
      el.addEventListener('click', () => bjDispatch(i));
    } else {
      el.innerHTML = `<span class="bj-dock-plus">+</span>`;
    }
    container.appendChild(el);
  }
}

function bjRenderLot() {
  const container = document.getElementById('bj-lot');
  container.innerHTML = '';
  container.style.gridTemplateColumns = `repeat(${BJ_LOT_COLS}, 1fr)`;
  bjState.lot.forEach(bus => {
    const el = document.createElement('div');
    el.className = 'bj-lotbus' + (bus.exited ? ' bj-exited' : '');
    el.dataset.id = bus.id;
    if (!bus.exited) {
      el.style.background = `linear-gradient(160deg, ${BJ_COLOR_HEX[bus.color]}, ${BJ_COLOR_HEX[bus.color]}cc)`;
      el.innerHTML = `<span class="bj-lotbus-arrow">${BJ_ARROWS[bus.dir]}</span><span class="bj-lotbus-emoji">🚌</span>`;
      el.addEventListener('click', () => bjTapLotBus(bus.id));
    }
    container.appendChild(el);
  });
}

function bjUpdateHUD() {
  document.getElementById('bj-pups-left').textContent = `Pups left: ${bjState.loop.length}`;
  document.getElementById('bj-undo-count').textContent = bjUndosLeft;
  document.getElementById('bj-undo-btn').classList.toggle('bj-disabled', bjUndosLeft <= 0);
}

// ── Game logic ──
function bjIsPathClear(bus) {
  const { row, col, dir } = bus;
  const occupied = (r, c) => bjState.lot.some(b => !b.exited && b.id !== bus.id && b.row === r && b.col === c);
  if (dir === 'up') { for (let r = row - 1; r >= 0; r--) if (occupied(r, col)) return false; }
  if (dir === 'down') { for (let r = row + 1; r < BJ_LOT_ROWS; r++) if (occupied(r, col)) return false; }
  if (dir === 'left') { for (let c = col - 1; c >= 0; c--) if (occupied(row, c)) return false; }
  if (dir === 'right') { for (let c = col + 1; c < BJ_LOT_COLS; c++) if (occupied(row, c)) return false; }
  return true;
}

function bjFindDockSlot(color) {
  let idx = bjState.dock.findIndex(s => s && s.color === color);
  if (idx !== -1) return idx;
  return bjState.dock.findIndex(s => s === null);
}

function bjTapLotBus(id) {
  if (bjState.gameOver) return;
  const bus = bjState.lot.find(b => b.id === id);
  if (!bus || bus.exited) return;
  if (!bjIsPathClear(bus)) { bjShakeLotBus(id); return; }

  const slotIndex = bjFindDockSlot(bus.color);
  if (slotIndex === -1) { bjShakeLotBus(id); return; } // dock full of other colors

  bjSnapshot();
  if (bjState.dock[slotIndex]) {
    bjState.dock[slotIndex].remaining += BJ_BUS_CAPACITY;
  } else {
    bjState.dock[slotIndex] = { color: bus.color, remaining: BJ_BUS_CAPACITY };
  }
  bus.exited = true;
  bjSfxExit();
  bjRenderDock();
  bjUpdateHUD();

  const el = document.querySelector(`.bj-lotbus[data-id="${id}"]`);
  if (el) {
    el.style.pointerEvents = 'none';
    el.classList.add('bj-exit-' + bus.dir);
  }
  setTimeout(() => {
    bjRenderLot();
    bjCheckDeadlock();
  }, 380);
}

function bjDispatch(slotIndex) {
  if (bjState.gameOver) return;
  const slot = bjState.dock[slotIndex];
  if (!slot) return;
  const front = bjState.loop[0];
  if (!front || front.color !== slot.color) { bjShakeDock(slotIndex); return; }

  bjSnapshot();
  let remaining = slot.remaining;
  while (remaining > 0 && bjState.loop.length > 0 && bjState.loop[0].color === slot.color) {
    bjState.loop.shift();
    remaining--;
  }
  bjState.dock[slotIndex] = null;
  bjSfxDepart();
  bjRenderDock();
  bjRenderLoop();
  bjUpdateHUD();

  if (bjState.loop.length === 0) { bjGameOver(true); return; }
  bjCheckDeadlock();
}

function bjCheckDeadlock() {
  if (bjState.gameOver || bjState.loop.length === 0) return;
  const front = bjState.loop[0];
  const dockCanDispatch = bjState.dock.some(s => s && s.color === front.color);
  const lotCanExit = bjState.lot.some(bus => {
    if (bus.exited || !bjIsPathClear(bus)) return false;
    return bjFindDockSlot(bus.color) !== -1;
  });
  if (!dockCanDispatch && !lotCanExit) bjGameOver(false);
}

function bjShakeLotBus(id) {
  bjSfxWrong();
  const el = document.querySelector(`.bj-lotbus[data-id="${id}"]`);
  if (el) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
}

function bjShakeDock(i) {
  bjSfxWrong();
  const el = document.querySelector(`.bj-dock-slot[data-slot="${i}"]`);
  if (el) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
}

function bjGameOver(won) {
  bjState.gameOver = true;
  const modal = document.getElementById('busjam-modal');
  const title = document.getElementById('busjam-modal-title');
  const text = document.getElementById('busjam-modal-text');

  if (won) {
    bjSfxWin();
    title.textContent = '🎉 Traffic Cleared! 🎉';
    text.textContent = 'Every good pup made it home safe. 💕';
  } else {
    bjSfxLose();
    title.textContent = '🚦 Deadlock! 🚦';
    text.textContent = 'No more moves available — give it another go!';
  }
  modal.classList.remove('screen-hidden');
}

document.getElementById('bj-restart-btn').addEventListener('click', bjRestart);
document.getElementById('bj-undo-btn').addEventListener('click', bjUndo);
document.getElementById('busjam-retry-btn').addEventListener('click', initBusJam);
document.getElementById('busjam-modal-menu-btn').addEventListener('click', () => {
  document.getElementById('busjam-modal').classList.add('screen-hidden');
  document.getElementById('busjam-screen').classList.add('screen-hidden');
  document.getElementById('menu-screen').classList.remove('screen-hidden');
});
