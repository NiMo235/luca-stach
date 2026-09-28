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

/* T-103: WORK conveyor (Förderloop + Prüfstraße) — an elevated oval
   roller loop between the AGV main loop and the dock lane, plus a
   rejection siding north off the scanner/diverter straight */
export const CONV = {
  x0: -13.5, // west arc center x
  x1: 5.5, // east arc center x
  zN: -20.5, // north straight centerline (scanner + diverter live here)
  zS: -17.5, // south straight centerline
  r: 1.5, // end arc radius
  beltY: 0.95, // belt top
  beltW: 1.1,
  scanX: 0, // scanner portal center on the north straight
  divX: 4.0, // diverter position on the north straight
  stubZ: -23.6, // siding end (Abstellgleis)
};

/* T-103: PROOF quote lanes — two elevated data bands from the hall
   floor into the Leitstand (inbound) and back out (outbound) */
export const QLANE = {
  x0: 8,
  x1: LEITSTAND.x0, // enters the glass front
  zIn: 20.6,
  zOut: 21.4,
  y: 3.55,
};

/* holo hotspot anchors above the zones (station order = tour order).
   details.ts draws the labels at these positions, hotspots.ts floats
   the interactive diamond markers slightly above them */
export const HOTSPOTS = [
  { station: 0, x: -38, y: 8.6, z: 26 }, // BOOT — gallery
  { station: 1, x: 47, y: 8.6, z: 21.5 }, // PROOF — Leitstand
  { station: 2, x: -49.6, y: 12.5, z: 12 }, // LOG — aisle B
  { station: 3, x: 6, y: 10.2, z: 0 }, // WORK — crossing / conveyor
  { station: 4, x: 50, y: 10.8, z: 16 }, // STACK — over the shelf run
  { station: 5, x: -45, y: 7.6, z: 24.5 }, // BEYOND — lounge
  { station: 6, x: -50, y: 8.2, z: -26.5 }, // DOCK — TOR 1
] as const;

/* site palette */
export const COL = {
  ink: 0x0a0d0a,
  acid: 0xb4ff39,
  cyan: 0x7dffd8,
  amber: 0xffb35c,
  night: 0x070a0e,
};
