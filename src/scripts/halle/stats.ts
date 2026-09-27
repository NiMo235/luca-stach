/* ------------------------------------------------------------------ */
/* Title-card stats: live triangles / parts / fps in the HUD,          */
/* throttled to ~2 updates per second. Reads renderer.info after the   */
/* frame; `parts` is counted once from the built scene.                */
/* ------------------------------------------------------------------ */

import type * as THREE from 'three';

export interface Stats {
  frame(dt: number): void;
}

export function createStats(renderer: THREE.WebGLRenderer, parts: number): Stats {
  const elTris = document.querySelector<HTMLElement>('[data-tc-tris]');
  const elParts = document.querySelector<HTMLElement>('[data-tc-parts]');
  const elFps = document.querySelector<HTMLElement>('[data-tc-fps]');

  let fps = 0;
  let acc = 0;

  return {
    frame(dt) {
      if (dt > 0) {
        const inst = 1 / dt;
        fps = fps === 0 ? inst : fps + (inst - fps) * 0.08;
      }
      acc += dt;
      if (acc < 0.5) return;
      acc = 0;
      const tris = renderer.info.render.triangles;
      if (elTris) elTris.textContent = tris.toLocaleString('en-US');
      if (elParts) elParts.textContent = String(parts);
      if (elFps) elFps.textContent = String(Math.round(fps));
    },
  };
}
