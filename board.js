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
  // The top row is 9 units wide, not 8 — cell 25 visually spans 2 units (verified by
  // pixel-scanning the lane-center dash marks), the other 6 top-row cells + cell 24 take 1
  // unit each. Cells 6,5,4,3,2,1 sit at units 0-5, cell 25 spans units 6-8 (centered at 7),
  // and cell 24 sits at unit 8.5.
  const topUnit = (ROW_RIGHT_PCT - ROW_LEFT_PCT) / 9;
  const topUnitPositions = { 6: 0.5, 5: 1.5, 4: 2.5, 3: 3.5, 2: 4.5, 1: 5.5, 25: 7, 24: 8.5 };
  TOP_ORDER.forEach(n => { cells[n] = { x: ROW_LEFT_PCT + topUnit * topUnitPositions[n], y: TOP_Y_PCT }; });

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
    // casa 0 sits well clear of the checkered start line and the gate bracket markings.
    return { x: 79.5, y: c1.y };
  }
  const c = LOOP_CELLS[cellInLap(position)];
  if (!c) return { x: 50, y: 50 };
  return { x: c.x, y: c.y };
}

// ---------- Kart heading per cell ----------
// Kart artwork faces LEFT by default. 0=left, 90=up, 180=right, 270=down (clockwise CSS rotation).
// Direction of travel around the loop: leftward across the top, down the left side, rightward
// across the bottom, up the right side, then leftward across the top again to the finish line.
// NOTE: the 4 corners aren't drawn symmetrically in the artwork — at 2 of them (10->11, 23->24)
// the turn art shows up starting on the first cell of the new direction; at the other 2
// (6->7, 19->20) it shows up one cell EARLY, on the last cell of the old direction. Verified
// directly in-app: 11 and 24 turn correctly as-is, 6 and 19 needed to move into the next
// segment instead.
const HEADING_SEGMENTS = [
  [1, 5, 0],     // top row, moving left
  [6, 10, 270],  // left side, moving down (cell 6 already turns here, not at 7)
  [11, 18, 180], // bottom row, moving right
  [19, 23, 90],  // right side, moving up (cell 19 already turns here, not at 20)
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
