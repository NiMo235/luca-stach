/* ------------------------------------------------------------------ */
/* BOOT toy: the hero terminal becomes a real CLI once the typed       */
/* intro has finished (and in classic mode right away). Responses      */
/* type out with the shared typewriter cadence; reduced motion prints  */
/* instantly. Commands stay English in both locales, responses come    */
/* from hero.terminal.* via the root's data attributes.                */
/* ------------------------------------------------------------------ */

import { makeTypewriter } from './main';

interface TermDict {
  ariaLabel: string;
  hint: string;
  helpTitle: string;
  commands: [string, string][];
  whoami: string[];
  skills: string[];
  contact: string[];
  cv: string;
  cvLink: string;
  social: string;
  socialLink: string;
  sudo: string;
  notFound: string;
}

export function initTerminal(reduced: boolean): void {
  const root = document.querySelector<HTMLElement>('[data-terminal]');
  if (!root) return;
  const out = root.querySelector<HTMLElement>('[data-term-out]');
  const input = root.querySelector<HTMLInputElement>('[data-term-input]');
  if (!out || !input) return;

  let dict: TermDict;
  try {
    dict = JSON.parse(root.dataset.responses ?? '{}') as TermDict;
  } catch {
    return;
  }
  const prompt = root.dataset.prompt ?? 'luca@muensingen:~$';
  const vars: Record<string, string> = {
    email: root.dataset.email ?? '',
    linkedin: root.dataset.linkedin ?? '',
    cv: root.dataset.cv ?? '',
  };
  const cvHref = root.dataset.cvHref ?? '';
  const fill = (s: string) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k] : m));

  const { typeLine } = makeTypewriter(() => reduced);
  let busy = false;

  const printInstant = (text: string, cls = 'text-dim') => {
    const p = document.createElement('p');
    p.className = cls;
    p.textContent = text;
    out.appendChild(p);
  };

  const scrollOut = () => {
    out.scrollTop = out.scrollHeight;
  };

  const respond = async (raw: string) => {
    const cmd = raw.trim().toLowerCase();
    printInstant(`${prompt} ${raw.trim()}`, 'text-faint');
    if (!cmd) return;

    busy = true;
    input.disabled = true;
    try {
      switch (cmd) {
        case 'help': {
          printInstant(dict.helpTitle, 'text-paper');
          for (const [name, desc] of dict.commands) {
            printInstant(`  ${name.padEnd(8)} — ${desc}`);
          }
          break;
        }
        case 'whoami':
          for (const line of dict.whoami) {
            await typeLine(out, fill(line), 'text-dim', 10);
            scrollOut();
          }
          break;
        case 'skills':
          for (const line of dict.skills) {
            await typeLine(out, fill(line), 'text-dim', 10);
            scrollOut();
          }
          break;
        case 'contact':
          for (const line of dict.contact) {
            await typeLine(out, fill(line), 'text-dim', 10);
            scrollOut();
          }
          break;
        case 'social':
        case 'linkedin': {
          const p = await typeLine(out, fill(dict.social), 'text-dim', 10);
          const a = document.createElement('a');
          a.href = `https://${vars.linkedin}`;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.className = 'term-link';
          a.textContent = ` ${dict.socialLink}`;
          p?.appendChild(a);
          break;
        }
        case 'cv': {
          const p = await typeLine(out, fill(dict.cv), 'text-dim', 10);
          if (cvHref) {
            const a = document.createElement('a');
            a.href = cvHref;
            a.download = '';
            a.className = 'term-link';
            a.textContent = ` ${dict.cvLink}`;
            p?.appendChild(a);
            /* download offer: trigger it right away (runs inside the
               Enter keypress gesture) */
            const dl = document.createElement('a');
            dl.href = cvHref;
            dl.download = '';
            dl.style.display = 'none';
            document.body.appendChild(dl);
            dl.click();
            dl.remove();
          }
          break;
        }
        case 'clear':
          out.innerHTML = '';
          break;
        case 'sudo':
          await typeLine(out, dict.sudo, 'text-warm', 10);
          break;
        default:
          printInstant(fill(dict.notFound).replace('{cmd}', cmd) || dict.notFound, 'text-dim');
      }
    } finally {
      busy = false;
      input.disabled = false;
      scrollOut();
      input.focus({ preventScroll: true });
    }
  };

  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || busy) return;
    const value = input.value;
    input.value = '';
    void respond(value);
  });

  /* clicking anywhere in the terminal focuses the hidden input */
  root.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('a')) return;
    input.focus({ preventScroll: true });
  });
}
