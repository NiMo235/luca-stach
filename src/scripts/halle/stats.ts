/* ------------------------------------------------------------------ */
/* Title-card stats: triangles / parts / fps in the HUD, throttled to  */
/* ~2 updates per second. Triangles + parts are counted ONCE from the  */
/* built scene geometry (index.ts) — renderer.info would include the   */
/* shadow pass. fps is a smoothed frame-rate estimate.                 */
/* ------------------------------------------------------------------ */

export interface Stats {
  frame(dt: number): void;
}

export function createStats(counts: { tris: number; parts: number }): Stats {
  const elTris = document.querySelector<HTMLElement>('[data-tc-tris]');
  const elParts = document.querySelector<HTMLElement>('[data-tc-parts]');
  const elFps = document.querySelector<HTMLElement>('[data-tc-fps]');

  if (elTris) elTris.textContent = counts.tris.toLocaleString('en-US');
  if (elParts) elParts.textContent = counts.parts.toLocaleString('en-US');

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
      if (elFps) elFps.textContent = String(Math.round(fps));
    },
  };
}
