/* ------------------------------------------------------------------ */
/* Static collision volumes of the hall (AABBs), shared between the    */
/* Node collision test and — later — any runtime navigation. Derived   */
/* from layout.ts constants so both stay in sync. Units: meters.       */
/* ------------------------------------------------------------------ */

/* explicit .ts extension: this module is also loaded by the Node
   collision test (scripts/check-halle-collision.mjs), which requires
   fully specified ESM specifiers */
import { HALL, RACKS, GALLERY, MEZZ, LEITSTAND, CAGE, LOUNGE } from './layout.ts';

export interface AABB {
  min: [number, number, number];
  max: [number, number, number];
  name: string;
}

const box = (
  name: string,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
): AABB => ({ min: [x0, y0, z0], max: [x1, y1, z1], name });

export function hallColliders(): AABB[] {
  const out: AABB[] = [
    /* shell */
    box('wall-north', HALL.X0 - 0.4, 0, HALL.Z0 - 0.4, HALL.X1 + 0.4, HALL.H + 1, HALL.Z0),
    box('wall-south', HALL.X0 - 0.4, 0, HALL.Z1, HALL.X1 + 0.4, HALL.H + 1, HALL.Z1 + 0.4),
    box('wall-west', HALL.X0 - 0.4, 0, HALL.Z0, HALL.X0, HALL.H + 1, HALL.Z1),
    box('wall-east', HALL.X1, 0, HALL.Z0, HALL.X1 + 0.4, HALL.H + 1, HALL.Z1),
    box('roof', HALL.X0, 13.4, HALL.Z0, HALL.X1, HALL.H + 1.2, HALL.Z1),
  ];

  /* high-bay rows (incl. row-end guards) */
  for (const [i, rx] of RACKS.rowsX.entries()) {
    out.push(
      box(
        `rack-row-${i}`,
        rx - RACKS.depth / 2 - 0.15,
        0,
        RACKS.z0 - 0.6,
        rx + RACKS.depth / 2 + 0.15,
        RACKS.uprightH + 0.3,
        RACKS.z1 + 0.6,
      ),
    );
  }

  /* visitor gallery: deck, balustrade+handrail, stairs */
  out.push(
    box('gallery-deck', GALLERY.x0, GALLERY.y - 0.35, GALLERY.z0, GALLERY.x1, GALLERY.y, GALLERY.z1),
    box('gallery-rail', GALLERY.x0, GALLERY.y, GALLERY.z0 - 0.12, GALLERY.x1, GALLERY.y + 1.25, GALLERY.z0 + 0.18),
    box('gallery-stairs', GALLERY.x1 + 0.3, 0, 25.9, GALLERY.x1 + 7.2, 4.2, 27.7),
  );

  /* mezzanine: deck, railings, stair, skill shelves (T-103: shelves moved
     west, facing the STACK viewpoint) */
  out.push(
    box('mezz-deck', MEZZ.x0, MEZZ.y - 0.35, MEZZ.z0, MEZZ.x1, MEZZ.y, MEZZ.z1),
    box('mezz-rail-w', MEZZ.x0 - 0.08, MEZZ.y, MEZZ.z0, MEZZ.x0 + 0.08, MEZZ.y + 1.25, MEZZ.z1),
    box('mezz-rail-n', MEZZ.x0, MEZZ.y, MEZZ.z0 - 0.08, MEZZ.x1, MEZZ.y + 1.25, MEZZ.z0 + 0.08),
    box('mezz-rail-s', MEZZ.x0, MEZZ.y, MEZZ.z1 - 0.08, MEZZ.x1, MEZZ.y + 1.25, MEZZ.z1 + 0.08),
    box('mezz-stair', 27.9, 0, 4.2, 35.6, 6.2, 5.8),
    box('mezz-shelves', 50.9, MEZZ.y, 3.4, 53.3, MEZZ.y + 3.6, 25.4),
  );

  /* Leitstand as one solid volume */
  out.push(
    box('leitstand', LEITSTAND.x0 - 0.1, 0, LEITSTAND.z0 - 0.1, LEITSTAND.x1 + 0.1, LEITSTAND.floorY + LEITSTAND.h + 0.3, LEITSTAND.z1 + 0.1),
  );

  /* Gefahrgut cage (fence + stock as one volume) */
  out.push(box('cage', CAGE.x0, 0, CAGE.z0, CAGE.x1, 4.3, CAGE.z1));

  /* Pausenraum: walls, roof slab, furniture (DJ pult widened + gym on
     the west wall + podcast table, T-103) */
  out.push(
    box('lounge-wall-s', LOUNGE.x0, 0, LOUNGE.z1 - 0.25, LOUNGE.x1, 3.2, LOUNGE.z1 + 0.1),
    box('lounge-wall-e', LOUNGE.x1 - 0.25, 0, LOUNGE.z0 - 0.1, LOUNGE.x1 + 0.1, 3.2, LOUNGE.z1),
    box('lounge-roof', LOUNGE.x0, 3.05, LOUNGE.z0 - 0.1, LOUNGE.x1, 3.35, LOUNGE.z1 + 0.1),
    box('lounge-sofa', -51.2, 0, 25.4, -47.8, 1.15, 27.3),
    box('lounge-side', -52.5, 0, 23.7, -50.6, 0.95, 26.1),
    box('lounge-table', -49.2, 0, 23.9, -47.6, 0.45, 24.9),
    box('lounge-djdesk', -42.7, 0, 27.2, -38.3, 1.1, 28.4),
    box('lounge-gym', -57.6, 0, 21.4, -55.3, 2.0, 23.3),
    box('lounge-podcast', -40.0, 0, 21.5, -37.1, 1.4, 23.7),
    box('lounge-shelf', -53.2, 0, 28.2, -48.8, 1.75, 28.8),
    box('lounge-bench', -37.2, 0, 27.1, -34.8, 0.6, 27.9),
    box('lounge-floorlamp', -55.7, 0, 27.6, -55.3, 1.7, 28.0),
  );

  /* T-103: WORK conveyor loop + scanner portal + rejection siding,
     pick stations, PROOF quote lanes, dock seals, gallery stelae */
  out.push(
    box('conv-loop', -15.6, 0, -22.3, 7.4, 1.4, -16.1),
    box('conv-portal', -0.5, 0, -21.6, 0.5, 3.3, -19.4),
    box('conv-siding', 3.1, 0, -24.1, 4.9, 1.4, -20.4),
    box('pick-0', -10.9, 0, -16.8, -9.1, 2.0, -15.6),
    box('pick-1', -2.9, 0, -16.8, -1.1, 2.0, -15.6),
    box('pick-2', 3.1, 0, -16.8, 4.9, 2.0, -15.6),
    box('quote-lanes', 7.7, 3.3, 20.1, 40.3, 4.35, 22.0),
    box('gallery-stele-0', -28.2, 4, 27.4, -27.0, 5.8, 28.4),
    box('gallery-stele-1', -25.2, 4, 27.4, -24.0, 5.8, 28.4),
  );
  for (const d of [-50, -30, -10, 10]) {
    out.push(box(`dock-seal-${d}`, d - 2.6, 0, -30.3, d + 3.2, 5.0, -29.4));
  }

  return out;
}
