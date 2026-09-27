/* ------------------------------------------------------------------ */
/* Layout constants for DIE HALLE — 120 × 60 m logistics hall.         */
/* World axes: x = -60 (west) … +60 (east), z = -30 (north) … +30      */
/* (south), y up. North wall carries the dock doors.                   */
/* ------------------------------------------------------------------ */

export const HALL = {
  L: 120, // x extent
  W: 60, // z extent
  H: 13.5, // underside of roof
  X0: -60,
  X1: 60,
  Z0: -30, // north
  Z1: 30, // south
};

/* high-bay warehouse, west block: 4 double rows, 3 aisles, 12 levels */
export const RACKS = {
  x0: -60,
  x1: -32,
  z0: -16,
  z1: 16,
  rowsX: [-58.3, -52.5, -46.7, -40.9], // row centers (double rows)
  aislesX: [-55.4, -49.6, -43.8],
  depth: 2.4, // row depth (two pallet faces)
  levels: 12,
  pitch: 0.95, // beam-to-beam vertical pitch
  baseY: 0.55, // first beam height
  bays: 12,
  uprightH: 12.2,
};
export const RACK_BAY_W = (RACKS.z1 - RACKS.z0) / RACKS.bays; // ~2.667 m

/* dock doors on the north wall (z = -30) */
export const DOORS = [
  { x: -50, w: 5, h: 4.5, open: true }, // TOR 1 — DOCK station, open to the yard
  { x: -30, w: 5, h: 4.5, open: false },
  { x: -10, w: 5, h: 4.5, open: false },
  { x: 10, w: 5, h: 4.5, open: false },
  { x: 46, w: 3.2, h: 3.6, open: false }, // Gefahrgut A
  { x: 55, w: 3.2, h: 3.6, open: false }, // Gefahrgut B
];

/* zones (placeholder volumes in T-101) */
export const GALLERY = { x0: -56, x1: -22, z0: 24.2, z1: 29.4, y: 4 }; // south, visitor gallery
export const MEZZ = { x0: 36, x1: 58, z0: 2, z1: 28, y: 6 }; // east steel mezzanine
export const LEITSTAND = { x0: 40, x1: 54, z0: 17, z1: 27, floorY: 3.2, h: 3.4 }; // east
export const CAGE = { x0: 44, x1: 58, z0: -29, z1: -19 }; // Gefahrgut-Käfig, northeast
export const LOUNGE = { x0: -58, x1: -33, z0: 20.5, z1: 29 }; // Pausenraum, southwest

/* site palette */
export const COL = {
  ink: 0x0a0d0a,
  acid: 0xb4ff39,
  cyan: 0x7dffd8,
  amber: 0xffb35c,
  night: 0x070a0e,
};
