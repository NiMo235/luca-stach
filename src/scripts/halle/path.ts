/* ------------------------------------------------------------------ */
/* Tour path data — pure numbers, no DOM/three usage, so the Node      */
/* collision test (scripts/check-halle-collision.mjs) and the runtime  */
/* tour share one source of truth. 13 keys: station i sits on key 2i   */
/* (docked p = i/6 exactly), odd keys are guides that keep the spline  */
/* clear of racks, gallery, mezzanine and the lounge walls.            */
/* ------------------------------------------------------------------ */

export const POS_KEYS: Array<[number, number, number]> = [
  [-46, 6.8, 24.5], // 01 BOOT — on the visitor gallery, diagonal hall vista
  [-8, 7.0, 16], //       guide: over the loop, south-center
  [30, 4.2, 16], // 02 PROOF — facing the Leitstand glass front
  [-49.6, 5.8, 21.8], //  guide: high over the gallery rail, aligned with aisle B
  [-49.6, 3.4, 13.5], // 03 LOG — inside the high-bay aisle
  [-49.0, 4.5, 20.8], //   guide: leave the rack block due south first
  [10, 6.5, 4], // 04 WORK — crossing, slightly elevated
  [30, 7.5, 10], //       guide: approach over the mezzanine edge
  [45.5, 8.6, 12], // 05 STACK — on the mezzanine
  [-30, 2.7, 12], //      guide: descend north-west of the lounge (open side)
  [-35.6, 2.35, 21.8], // 06 BEYOND — lounge NE corner, looking into the room
  [-24, 3.8, 4], //       guide: leave north through the open side first
  [-38, 3.8, -17], // 07 DOCK — facing the open TOR 1
];

export const LOOK_KEYS: Array<[number, number, number]> = [
  [20, 3.0, -18], // 01 hall length + dock glow to the northeast
  [30, 3.5, 5],
  [46, 3.6, 24], // 02 the Leitstand — glass front + big screen left of the panel
  [-40, 5, 14], //      pan toward the rack block
  [-49.6, 5.2, -10], // 03 straight down the aisle
  [-20, 3, 4],
  [-8, 1.2, -10], // 04 down at the crossing + racks behind
  [40, 6.5, 10],
  [-20, 4, -2], // 05 from the mezzanine across the hall
  [-30, 2.5, 18], //    pan down toward the lounge
  [-52, 1.5, 27.2], // 06 deep into the warm lounge corner
  [-40, 3, -18],
  [-50.5, 2.6, -29.5], // 07 the open TOR 1 and the yard beyond
];

/* breathing amplitude scale per station (lerped between neighbours):
   LOG sits in a 3.1 m aisle, STACK near the mezzanine rail and the
   lounge ceiling is at y≈3.05 — those stations get a damped drift */
export const DRIFT_CAPS = [1, 1, 0.75, 1, 0.6, 0.08, 0.55];

/* max breathing excursion at full dock (tour.ts recipe) — the collision
   test inflates the camera point by these */
export const DRIFT_MAX_X = 1.4;
export const DRIFT_MAX_Y = 1.1;

export const STATIONS = 7;
