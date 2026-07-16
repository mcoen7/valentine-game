// ─────────────────────────────────────────────
//  Dachshund Bus Jam – color-match mini-game
//  Tap a parked bus to send it to matching-color dachshunds waiting in the queue.
//  Clear the whole lot before the queue overflows.
// ─────────────────────────────────────────────

const BJ_COLORS = [
  { id: 'red',    hex: '#e8587a' },
  { id: 'blue',   hex: '#4fa3e3' },
  { id: 'yellow', hex: '#f0c419' },
  { id: 'green',  hex: '#5cbf6a' },
];
const BJ_COLS = 4;
const BJ_ROWS = 3;
const BJ_TOTAL_BUSES = BJ_COLS * BJ_ROWS; // 12
const BJ_QUEUE_SIZE = 7;
const BJ_SPAWN_INTERVAL = 1400; // ms

let bjState = null;
let bjSpawnTimer = null;

// ── SFX (reuses playTone/playNoise/ensureAudio defined in main.js) ──
function bjSfxDepart() {
  playTone(500, 0.1, 'square', 0.06);
  playTone(700, 0.08, 'sine', 0.05);
}
function bjSfxSpawn() {
  playTone(900 + Math.random() * 200, 0.05, 'sine', 0.03);
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

// ── Setup ──
function initBusJam() {
  stopBusJam();

  const buses = [];
  let idCounter = 0;
  BJ_COLORS.forEach(c => {
    for (let i = 0; i < BJ_TOTAL_BUSES / BJ_COLORS.length; i++) {
      buses.push({ id: idCounter++, color: c.id, departed: false });
    }
  });
  // Shuffle
  for (let i = buses.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [buses[i], buses[j]] = [buses[j], buses[i]];
  }

  const remainingByColor = {};
  BJ_COLORS.forEach(c => { remainingByColor[c.id] = BJ_TOTAL_BUSES / BJ_COLORS.length; });

  bjState = {
    buses,
    queue: new Array(BJ_QUEUE_SIZE).fill(null),
    remainingByColor,
    departedCount: 0,
    gameOver: false,
  };

  document.getElementById('busjam-modal').classList.add('screen-hidden');
  bjRenderLot();
  bjRenderQueue();
  bjUpdateCounter();

  bjSpawnTimer = setInterval(bjSpawnDachshund, BJ_SPAWN_INTERVAL);
  // Seed the queue with a couple of dachshunds right away
  bjSpawnDachshund();
  bjSpawnDachshund();
}

function stopBusJam() {
  if (bjSpawnTimer) {
    clearInterval(bjSpawnTimer);
    bjSpawnTimer = null;
  }
}

function bjColorHex(id) {
  return BJ_COLORS.find(c => c.id === id).hex;
}

// ── Rendering ──
function bjRenderLot() {
  const lot = document.getElementById('busjam-lot');
  lot.innerHTML = '';
  lot.style.gridTemplateColumns = `repeat(${BJ_COLS}, 1fr)`;
  bjState.buses.forEach(bus => {
    const el = document.createElement('div');
    el.className = 'bj-bus';
    el.dataset.id = bus.id;
    el.dataset.color = bus.color;
    el.style.background = `linear-gradient(160deg, ${bjColorHex(bus.color)}, ${bjColorHex(bus.color)}cc)`;
    el.innerHTML = `<span class="bj-bus-emoji">🚌</span>`;
    el.addEventListener('click', () => bjTapBus(bus.id));
    lot.appendChild(el);
  });
}

function bjRenderQueue() {
  const queueEl = document.getElementById('busjam-queue');
  queueEl.innerHTML = '';
  bjState.queue.forEach(slot => {
    const el = document.createElement('div');
    el.className = 'bj-slot' + (slot ? ' filled' : '');
    if (slot) {
      el.dataset.color = slot.color;
      el.style.background = bjColorHex(slot.color);
      el.innerHTML = '🐕';
    }
    queueEl.appendChild(el);
  });
  const filledCount = bjState.queue.filter(Boolean).length;
  queueEl.classList.toggle('bj-danger', filledCount >= BJ_QUEUE_SIZE - 1);
}

function bjUpdateCounter() {
  const left = BJ_TOTAL_BUSES - bjState.departedCount;
  document.getElementById('busjam-counter').textContent = `Buses left: ${left}`;
}

// ── Game logic ──
function bjSpawnDachshund() {
  if (!bjState || bjState.gameOver) return;

  const availableColors = BJ_COLORS.filter(c => bjState.remainingByColor[c.id] > 0);
  if (availableColors.length === 0) return; // all buses gone, win already triggered

  const color = availableColors[Math.floor(Math.random() * availableColors.length)].id;
  const emptyIndex = bjState.queue.findIndex(s => s === null);

  if (emptyIndex === -1) {
    bjGameOver(false);
    return;
  }

  bjState.queue[emptyIndex] = { color };
  bjRenderQueue();
  bjSfxSpawn();
}

function bjTapBus(busId) {
  if (!bjState || bjState.gameOver) return;
  const bus = bjState.buses.find(b => b.id === busId);
  if (!bus || bus.departed) return;

  const hasMatch = bjState.queue.some(s => s && s.color === bus.color);
  const busEl = document.querySelector(`.bj-bus[data-id="${busId}"]`);

  if (!hasMatch) {
    bjSfxWrong();
    if (busEl) {
      busEl.classList.remove('shake');
      void busEl.offsetWidth;
      busEl.classList.add('shake');
    }
    return;
  }

  // Pick up every matching dachshund currently waiting
  bjState.queue = bjState.queue.map(s => (s && s.color === bus.color ? null : s));
  bus.departed = true;
  bjState.remainingByColor[bus.color]--;
  bjState.departedCount++;

  bjRenderQueue();
  bjUpdateCounter();
  bjSfxDepart();

  if (busEl) busEl.classList.add('departed');

  if (bjState.departedCount >= BJ_TOTAL_BUSES) {
    bjGameOver(true);
  }
}

function bjGameOver(won) {
  bjState.gameOver = true;
  stopBusJam();

  const modal = document.getElementById('busjam-modal');
  const title = document.getElementById('busjam-modal-title');
  const text = document.getElementById('busjam-modal-text');

  if (won) {
    bjSfxWin();
    title.textContent = '🎉 Traffic Cleared! 🎉';
    text.textContent = 'Every good pup made it home safe. 💕';
  } else {
    bjSfxLose();
    title.textContent = '🚦 Traffic Jam! 🚦';
    text.textContent = 'The queue overflowed — give it another go!';
  }

  modal.classList.remove('screen-hidden');
}

document.getElementById('busjam-retry-btn').addEventListener('click', initBusJam);
document.getElementById('busjam-modal-menu-btn').addEventListener('click', () => {
  stopBusJam();
  document.getElementById('busjam-modal').classList.add('screen-hidden');
  document.getElementById('busjam-screen').classList.add('screen-hidden');
  document.getElementById('menu-screen').classList.remove('screen-hidden');
});
