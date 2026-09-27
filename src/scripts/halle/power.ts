/* ------------------------------------------------------------------ */
/* Power-up-Intro (T-102): die Halle fährt hoch. Beim ersten update()  */
/* nach dem Cold Boot ist die Halle dunkel; über ~3 s gehen Zone für   */
/* Zone die Lichter an (Notstrips → Gänge → High-Bays → Leitstand →    */
/* Lounge). Einmal pro Seitenaufruf; Skip bei erstem Scroll/Klick.     */
/*                                                                     */
/* Der Controller liefert nur Gruppen-Level 0..1 — index.ts wendet sie */
/* auf Lights (Intensität) und die gepulsten Materialfarben an.        */
/* ------------------------------------------------------------------ */

export const POWER_GROUPS = 5;

export interface Power {
  /** seconds-based; call with the time since the first update() frame */
  update(t: number): void;
  /** jump to full power (user scrolled/clicked) */
  skip(): void;
  readonly levels: number[];
  readonly done: boolean;
  /** 0..1 overall — drives the simulation rate ramp */
  readonly progress: number;
}

/* zone delays (s) + fade duration */
const DELAYS = [0.15, 0.75, 1.3, 1.95, 2.55];
const FADE = 0.55;

function smooth(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

export function createPower(): Power & { attachSkip(): void } {
  const levels = new Array<number>(POWER_GROUPS).fill(0);
  let done = false;
  let progress = 0;
  let skipped = false;

  const api = {
    get levels() {
      return levels;
    },
    get done() {
      return done;
    },
    get progress() {
      return progress;
    },
    update(t: number) {
      if (done) return;
      let sum = 0;
      for (let g = 0; g < POWER_GROUPS; g++) {
        levels[g] = skipped ? 1 : smooth((t - DELAYS[g]) / FADE);
        sum += levels[g];
      }
      progress = sum / POWER_GROUPS;
      if (progress >= 1) done = true;
    },
    skip() {
      if (done) return;
      skipped = true;
      for (let g = 0; g < POWER_GROUPS; g++) levels[g] = 1;
      progress = 1;
      done = true;
    },
    attachSkip() {
      const onSkip = () => api.skip();
      window.addEventListener('wheel', onSkip, { passive: true });
      window.addEventListener('touchmove', onSkip, { passive: true });
      window.addEventListener('pointerdown', onSkip, { passive: true });
      window.addEventListener('keydown', onSkip, { passive: true });
    },
  };
  return api;
}
