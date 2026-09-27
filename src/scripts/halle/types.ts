/* ------------------------------------------------------------------ */
/* Shared contract between the scroll rig (flightdeck.ts) and the      */
/* world implementation. The hall (halle/) implements this; the old    */
/* corridor (flightworld.ts) kept the same shape until T-106.          */
/* ------------------------------------------------------------------ */

import type * as THREE from 'three';

export interface FlightWorld {
  /** advance & render one frame: p in [0,1], transit intensity 0..1 */
  update(p: number, transit: number, dt: number, now: number): void;
  /** beat pulse from the audio engine (0..1 kick envelope start) */
  pulse(): void;
  /** normalized docked camera drift (-1..1) for panel counter-parallax */
  drift: { x: number; y: number };
  camera: THREE.PerspectiveCamera;
}
