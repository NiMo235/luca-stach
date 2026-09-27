/* ------------------------------------------------------------------ */
/* Generative techno pulse — zero assets, pure WebAudio.               */
/* 128 BPM 16-step scheduler: sine-burst kick with pitch envelope,     */
/* filtered-noise offbeat hats, occasional minor-scale bass plucks.    */
/* Starts only from a user gesture; suspends when toggled off or when  */
/* the tab is hidden. Fires onBeat so HUD bars + world can sync.       */
/* ------------------------------------------------------------------ */

const BPM = 128;
const STEP = 60 / BPM / 4; // 16th note
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.12;

/* A minor-ish pluck pattern across 16 steps (-1 = rest) */
const BASS_PATTERN = [0, -1, -1, 0, -1, -1, 3, -1, 0, -1, -1, 0, -1, 5, -1, 3];
const BASS_ROOT = 55; // A1

/* user pattern from the BEYOND sequencer: 4 tracks × 8 eighth-steps.
   While set, it replaces the ambient default loop. */
export interface SeqPattern {
  kick: boolean[];
  hat: boolean[];
  bass: boolean[];
  tom: boolean[];
}

export class FlightAudio {
  onBeat: (() => void) | null = null;
  onStateChange: ((running: boolean) => void) | null = null;

  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private timer: number | null = null;
  private nextTime = 0;
  private step = 0;
  private pattern: SeqPattern | null = null;

  get running(): boolean {
    return this.timer !== null;
  }

  get available(): boolean {
    return this.ctx !== null;
  }

  setPattern(p: SeqPattern | null): void {
    this.pattern = p;
  }

  start(): void {
    if (this.running) return;
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.42;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    void this.ctx.resume();
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.06;
    this.timer = window.setInterval(() => this.schedule(), LOOKAHEAD_MS);
    this.schedule();
    this.onStateChange?.(true);
  }

  stop(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    void this.ctx?.suspend();
    this.onStateChange?.(false);
  }

  suspend(): void {
    if (this.running) void this.ctx?.suspend();
  }

  resume(): void {
    if (this.running) void this.ctx?.resume();
  }

  private schedule(): void {
    if (!this.ctx || !this.master) return;
    while (this.nextTime < this.ctx.currentTime + SCHEDULE_AHEAD) {
      this.scheduleStep(this.step, this.nextTime);
      this.nextTime += STEP;
      this.step = (this.step + 1) % 16;
    }
  }

  private scheduleStep(step: number, when: number): void {
    if (!this.ctx || !this.master || !this.noise) return;

    /* sequencer pattern mode: 8 eighth-steps ride on the 16-step grid */
    const pat = this.pattern;
    if (pat) {
      const eighth = step % 2 === 0;
      const i = (step >> 1) % 8;
      if (eighth) {
        if (pat.kick[i]) this.kick(when, true);
        if (pat.hat[i]) this.hat(when);
        if (pat.bass[i]) this.pluck(BASS_ROOT, when);
        if (pat.tom[i]) this.tom(when);
      }
      return;
    }

    /* kick on every quarter */
    if (step % 4 === 0) this.kick(when, true);

    /* offbeat hats */
    if (step % 4 === 2) this.hat(when);

    /* bass pluck */
    const deg = BASS_PATTERN[step];
    if (deg >= 0) this.pluck(BASS_ROOT * Math.pow(2, deg / 12), when);
  }

  private kick(when: number, beat: boolean): void {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, when);
    osc.frequency.exponentialRampToValueAtTime(42, when + 0.11);
    gain.gain.setValueAtTime(0.95, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.26);
    osc.connect(gain).connect(this.master);
    osc.start(when);
    osc.stop(when + 0.3);

    /* sync visuals to the kick */
    if (beat && this.onBeat) {
      const cb = this.onBeat;
      const delay = Math.max(0, (when - this.ctx.currentTime) * 1000);
      window.setTimeout(cb, delay);
    }
  }

  private hat(when: number): void {
    if (!this.ctx || !this.master || !this.noise) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7200;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.22, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.05);
    src.connect(hp).connect(gain).connect(this.master);
    src.start(when);
    src.stop(when + 0.08);
  }

  private pluck(freq: number, when: number): void {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(700, when);
    lp.frequency.exponentialRampToValueAtTime(160, when + 0.16);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(0.3, when + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.22);
    osc.connect(lp).connect(gain).connect(this.master);
    osc.start(when);
    osc.stop(when + 0.25);
  }

  /* sequencer tom: short pitched sine burst */
  private tom(when: number): void {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(210, when);
    osc.frequency.exponentialRampToValueAtTime(105, when + 0.09);
    gain.gain.setValueAtTime(0.5, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.18);
    osc.connect(gain).connect(this.master);
    osc.start(when);
    osc.stop(when + 0.2);
  }
}

/* one shared engine: the HUD audio toggle and the BEYOND sequencer
   drive the same instance, no matter who starts it first */
let shared: FlightAudio | null = null;
export function getSharedAudio(): FlightAudio {
  if (!shared) shared = new FlightAudio();
  return shared;
}
