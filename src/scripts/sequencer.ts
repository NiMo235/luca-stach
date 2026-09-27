/* ------------------------------------------------------------------ */
/* BEYOND toy: 4×8 step sequencer at 128 BPM. First interaction (cell  */
/* toggle or PLAY) lazily boots the shared audio engine and swaps its  */
/* ambient loop for the user's pattern; STOP hands the scheduler back  */
/* (or shuts audio down if the sequencer was the one who started it).  */
/* Playhead + `toy:seq` world flash tick from a local interval, so a   */
/* failed AudioContext still leaves a fully working silent sequencer.  */
/* ------------------------------------------------------------------ */

import type { FlightAudio, SeqPattern } from './audio';

export const SEQ_TRACKS = ['KICK', 'HAT', 'BASS', 'TOM'] as const;

/* minimal-techno default groove */
export const SEQ_DEFAULT: SeqPattern = {
  kick: [true, false, true, false, true, false, true, false],
  hat: [false, true, false, true, false, true, false, true],
  bass: [true, false, false, false, true, false, false, true],
  tom: [false, false, false, false, false, false, true, false],
};

const STEP_MS = (60 / 128 / 2) * 1000; // eighth note at 128 BPM

interface SeqDict {
  title: string;
  play: string;
  stop: string;
  hint: string;
  ariaLabel: string;
}

export function initSequencer(): void {
  const root = document.querySelector<HTMLElement>('[data-seq]');
  if (!root) return;
  const playBtn = root.querySelector<HTMLButtonElement>('[data-seq-play]');
  const cells = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-seq-cell]'));
  if (!playBtn || cells.length !== SEQ_TRACKS.length * 8) return;

  let dict: SeqDict;
  try {
    dict = JSON.parse(root.dataset.i18n ?? '{}') as SeqDict;
  } catch {
    return;
  }

  /* live pattern — mutated in place; the audio scheduler reads the ref */
  const pattern: SeqPattern = {
    kick: [...SEQ_DEFAULT.kick],
    hat: [...SEQ_DEFAULT.hat],
    bass: [...SEQ_DEFAULT.bass],
    tom: [...SEQ_DEFAULT.tom],
  };
  const trackKey = (t: number): keyof SeqPattern =>
    (['kick', 'hat', 'bass', 'tom'] as const)[t];

  const cellAt = (t: number, s: number) => cells[t * 8 + s];

  let audio: FlightAudio | null = null;
  let ownsAudio = false; // sequencer started the engine (vs. HUD toggle)
  let playing = false;
  let step = 0;
  let timer: number | null = null;

  const reflectCells = () => {
    for (let t = 0; t < SEQ_TRACKS.length; t++) {
      for (let s = 0; s < 8; s++) {
        const on = pattern[trackKey(t)][s];
        const cell = cellAt(t, s);
        cell.classList.toggle('is-on', on);
        cell.setAttribute('aria-pressed', String(on));
      }
    }
  };

  /* audio boots lazily on the first gesture; failure = silent mode */
  const ensureAudio = async (): Promise<FlightAudio | null> => {
    if (audio) return audio;
    try {
      const m = await import('./audio');
      audio = m.getSharedAudio();
      return audio;
    } catch {
      return null;
    }
  };

  const paintPlayhead = () => {
    for (let t = 0; t < SEQ_TRACKS.length; t++) {
      for (let s = 0; s < 8; s++) {
        cellAt(t, s).classList.toggle('is-now', playing && s === step);
      }
    }
  };

  const tickStep = () => {
    paintPlayhead();
    window.dispatchEvent(new CustomEvent('toy:seq', { detail: { step } }));
    step = (step + 1) % 8;
  };

  const start = async () => {
    if (playing) return;
    playing = true;
    playBtn.textContent = dict.stop;
    playBtn.setAttribute('aria-pressed', 'true');
    root.classList.add('is-playing');

    const a = await ensureAudio();
    if (a) {
      a.setPattern(pattern);
      if (!a.running) {
        a.start();
        ownsAudio = a.running; // false when context creation failed
      }
    }
    step = 0;
    tickStep();
    timer = window.setInterval(tickStep, STEP_MS);
  };

  const stop = (releaseAudio = true) => {
    if (!playing) return;
    playing = false;
    if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
    playBtn.textContent = dict.play;
    playBtn.setAttribute('aria-pressed', 'false');
    root.classList.remove('is-playing');
    paintPlayhead();
    if (!releaseAudio) return;
    audio?.setPattern(null);
    /* hand the scheduler back: ambient keeps playing if the HUD toggle
       owns the audio; if the sequencer started it, shut it down */
    if (audio && ownsAudio && audio.running) audio.stop();
    ownsAudio = false;
  };

  playBtn.addEventListener('click', () => {
    if (playing) stop();
    else void start();
  });

  cells.forEach((cell) => {
    cell.addEventListener('click', async () => {
      const t = Number(cell.dataset.track);
      const s = Number(cell.dataset.step);
      const key = trackKey(t);
      pattern[key][s] = !pattern[key][s];
      cell.classList.toggle('is-on', pattern[key][s]);
      cell.setAttribute('aria-pressed', String(pattern[key][s]));
      /* first toggle counts as the audio gesture too — arm the engine
         so PLAY has no async gap */
      await ensureAudio();
    });
  });

  /* HUD toggle was switched off mid-play (flightdeck): fall silent,
     keep the UI consistent */
  window.addEventListener('audio:state', (e) => {
    const running = (e as CustomEvent<{ running: boolean }>).detail?.running;
    if (running !== false) return;
    audio?.setPattern(null); // a restarted HUD toggle should get the ambient loop
    if (playing) stop(false);
    ownsAudio = false;
  });

  reflectCells();
}
