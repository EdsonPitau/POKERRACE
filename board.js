// ===================== POKER RACE — BOARD V3 (25-cell loop, 4 laps = 100 casas) =====================
// Calibration measured directly from the real race-screen artwork (2__TELA_CORRIDA.png,
// 3781x2540px) by pixel-scanning the cell-grid boundaries — not eyeballed. Coordinates are
// expressed as FRACTIONS (0..1, via percent helpers) of that image's width/height, so they
// stay correct no matter how large the board is displayed on screen.

const BOARD_IMG_W = 3781;
const BOARD_IMG_H = 2540;

// The 25-cell loop: 8 cells across the top, 9 across the bottom, 4 down each side.
// Row/column reference lines (center of each arm), all in % of board width/height:
const TOP_Y_PCT = 9.3898;
const BOTTOM_Y_PCT = 90.7087;
const LEFT_X_PCT = 6.3079;
const RIGHT_X_PCT = 93.745;

// Outer bounds of the loop (left/right edge of the top & bottom rows; top/bottom edge of the
// left & right columns) — used to evenly space cells along each arm.
const ROW_LEFT_PCT = 0.8728;
const ROW_RIGHT_PCT = 99.1801;
const COL_TOP_PCT = 17.4803;
const COL_BOTTOM_PCT = 82.6772;

// Cell order along each arm, reading in the direction shown on the board artwork.
const TOP_ORDER = [6, 5, 4, 3, 2, 1, 25, 24];       // left -> right
const BOTTOM_ORDER = [11, 12, 13, 14, 15, 16, 17, 18, 19]; // left -> right
const LEFT_ORDER = [7, 8, 9, 10];                    // top -> bottom
const RIGHT_ORDER = [23, 22, 21, 20];                // top -> bottom

function buildLoopCells() {
  const cells = {};
  const wTop = (ROW_RIGHT_PCT - ROW_LEFT_PCT) / TOP_ORDER.length;
  TOP_ORDER.forEach((n, k) => { cells[n] = { x: ROW_LEFT_PCT + wTop * (k + 0.5), y: TOP_Y_PCT }; });

  const wBot = (ROW_RIGHT_PCT - ROW_LEFT_PCT) / BOTTOM_ORDER.length;
  BOTTOM_ORDER.forEach((n, k) => { cells[n] = { x: ROW_LEFT_PCT + wBot * (k + 0.5), y: BOTTOM_Y_PCT }; });

  const hSide = (COL_BOTTOM_PCT - COL_TOP_PCT) / LEFT_ORDER.length;
  LEFT_ORDER.forEach((n, k) => { cells[n] = { x: LEFT_X_PCT, y: COL_TOP_PCT + hSide * (k + 0.5) }; });
  RIGHT_ORDER.forEach((n, k) => { cells[n] = { x: RIGHT_X_PCT, y: COL_TOP_PCT + hSide * (k + 0.5) }; });

  return cells;
}

const LOOP_CELLS = buildLoopCells();
const CELLS_PER_LAP = 25;
const TOTAL_LAPS = 4;

// ---------- Lap / absolute-position helpers ----------
// The game's positions are still 1-100 (100 casas total) — this just maps that absolute
// position onto the 25-cell loop plus a lap number, for display and rendering.
function lapOf(position) {
  if (position <= 0) return 1;
  return Math.min(TOTAL_LAPS, Math.ceil(position / CELLS_PER_LAP));
}
function cellInLap(position) {
  if (position <= 0) return 0;
  const clamped = Math.min(position, CELLS_PER_LAP * TOTAL_LAPS);
  return ((clamped - 1) % CELLS_PER_LAP) + 1;
}

function cellCenterPercent(position) {
  if (position <= 0) {
    // "casa 0" — decorative starting spot, just outside cell 1, clear of the checkered line
    const c1 = LOOP_CELLS[1];
    return { x: c1.x + 3.2, y: c1.y };
  }
  const c = LOOP_CELLS[cellInLap(position)];
  if (!c) return { x: 50, y: 50 };
  return { x: c.x, y: c.y };
}

// ---------- Kart heading per cell ----------
// Kart artwork faces LEFT by default. 0=left, 90=up, 180=right, 270=down (clockwise CSS rotation).
// Direction of travel around the loop: leftward across the top, down the left side, rightward
// across the bottom, up the right side, then leftward across the top again to the finish line.
const HEADING_SEGMENTS = [
  [1, 6, 0],     // top row, moving left
  [7, 10, 270],  // left side, moving down
  [11, 19, 180], // bottom row, moving right
  [20, 23, 90],  // right side, moving up
  [24, 25, 0]    // top row, moving left, back to the finish line
];

function buildHeadings() {
  const H = {};
  for (const [start, end, heading] of HEADING_SEGMENTS) {
    for (let n = start; n <= end; n++) H[n] = heading;
  }
  return H;
}
const CELL_HEADING = buildHeadings();

function cellHeadingDeg(position) {
  if (position <= 0) return 0;
  return CELL_HEADING[cellInLap(position)] != null ? CELL_HEADING[cellInLap(position)] : 0;
}
