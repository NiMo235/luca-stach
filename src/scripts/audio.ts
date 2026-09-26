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

export class FlightAudio {
  onBeat: (() => void) | null = null;

  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private timer: number | null = null;
  private nextTime = 0;
  private step = 0;

  get running(): boolean {
    return this.timer !== null;
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
  }

  stop(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    void this.ctx?.suspend();
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

    /* kick on every quarter */
    if (step % 4 === 0) {
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
      if (this.onBeat) {
        const cb = this.onBeat;
        const delay = Math.max(0, (when - this.ctx.currentTime) * 1000);
        window.setTimeout(cb, delay);
      }
    }

    /* offbeat hats */
    if (step % 4 === 2) {
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

    /* bass pluck */
    const deg = BASS_PATTERN[step];
    if (deg >= 0) {
      const freq = BASS_ROOT * Math.pow(2, deg / 12);
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
  }
}
