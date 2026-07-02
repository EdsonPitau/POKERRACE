// ===================== POKER RACE — BOARD (uses the real board artwork as background) =====================
// Calibration below was measured directly from the official board image (pixel-scanned),
// so every coordinate here is expressed as a FRACTION (0..1) of that image's width/height —
// which keeps it correct no matter how large the image is displayed on screen.

const BOARD_IMG_W = 8000;
const BOARD_IMG_H = 6285;
const BOARD_ASPECT = BOARD_IMG_W / BOARD_IMG_H; // width/height — needed to convert a horizontal
                                                  // offset into an equivalent-looking vertical one

// vertical-lane grid calibration (measured): center of column c / row r, in source-image pixels
const GRID_X0 = 400, GRID_COLW = 401;
const GRID_Y0 = 315.9, GRID_ROWH = 403.87;

function cellCenterPercent(num) {
  if (num === 0) {
    // "casa 0" — the starting grid, well clear of cell 1's checkered line, in the decorative gate area
    return { x: 92.5, y: (GRID_Y0 / BOARD_IMG_H) * 100 };
  }
  const c = BOARD_CELLS[num];
  if (!c) return { x: 50, y: 50 };
  const px = GRID_X0 + c.col * GRID_COLW;
  const py = GRID_Y0 + c.row * GRID_ROWH;
  return { x: (px / BOARD_IMG_W) * 100, y: (py / BOARD_IMG_H) * 100 };
}

// The 5 "POKER RACE" card slots at the bottom of the board (community cards in Hold'em mode).
// The card should cover the kart illustration completely, leaving only the "POKER" / "RACE"
// text visible above and below it — re-measured by scanning the artwork's own printed card
// borders pixel-by-pixel (the previous values used the *spacing* between cards, ~800px, instead
// of each card's actual border width, ~560-565px, which made the digital card ~40% too wide and
// bleed past the real card edges into the gaps between cards). Centers were already correct.
const COMMUNITY_SLOTS_PX = [
  { x0: 1889, x1: 2453 },
  { x0: 2804, x1: 3364 },
  { x0: 3720, x1: 4280 },
  { x0: 4631, x1: 5196 },
  { x0: 5547, x1: 6107 }
];
const COMMUNITY_ILLUSTRATION_Y0 = 5254, COMMUNITY_ILLUSTRATION_Y1 = 5881;

function communitySlotsPercent() {
  const marginX = 0.03; // small horizontal margin so the card doesn't touch the card's printed border
  return COMMUNITY_SLOTS_PX.map(s => {
    const fullW = s.x1 - s.x0;
    const x0 = s.x0 + fullW * marginX;
    const w = fullW * (1 - marginX * 2);
    return {
      left: (x0 / BOARD_IMG_W) * 100,
      top: (COMMUNITY_ILLUSTRATION_Y0 / BOARD_IMG_H) * 100,
      width: (w / BOARD_IMG_W) * 100,
      height: ((COMMUNITY_ILLUSTRATION_Y1 - COMMUNITY_ILLUSTRATION_Y0) / BOARD_IMG_H) * 100
    };
  });
}

// ---------- Kart heading per cell (so cars visibly turn at each curve, like the reference) ----------
// Kart artwork faces LEFT by default. 0=left, 90=up, 180=right, 270=down (clockwise CSS rotation).
const HEADING_SEGMENTS = [
  [1, 17, 0],     // top straight, moving left
  [18, 31, 270],  // left side, moving down
  [32, 33, 180],  // bottom-left stub, moving right
  [34, 45, 90],   // inner-left lane, moving up
  [46, 47, 180],  // top inner connector, moving right
  [48, 54, 270],  // inner lane, moving down
  [55, 65, 180],  // bottom straight, moving right
  [66, 72, 90],   // inner-right lane, moving up
  [73, 75, 180],  // top connector, moving right
  [76, 86, 270],  // right lane, moving down
  [87, 89, 180],  // bottom-right stub, moving right
  [90, 100, 90]   // finish lane, moving up
];

function buildHeadings() {
  const H = {};
  for (let i = 0; i < HEADING_SEGMENTS.length; i++) {
    const [start, end, heading] = HEADING_SEGMENTS[i];
    for (let n = start; n <= end; n++) H[n] = heading;
    // Each cell keeps ITS OWN segment's heading — no anticipation. The kart only turns
    // once it actually arrives at the first cell of the new direction, not before.
  }
  return H;
}
const CELL_HEADING = buildHeadings();

function cellHeadingDeg(num) {
  if (num === 0) return 0; // facing left, toward cell 1 / the track
  return CELL_HEADING[num] != null ? CELL_HEADING[num] : 0;
}
