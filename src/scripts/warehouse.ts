/* ------------------------------------------------------------------ */
/* WORK toy: click-to-store warehouse. Up to 3 inbound packages wait   */
/* in the queue (priority class A/B/C); pick one, click a free slot,   */
/* it flies in (FLIP, transform-only). OPTIMIZE re-sorts the rack by   */
/* class — A into the top row. Everything instant under reduced        */
/* motion. Copy comes from work.wh.* via the root's data attribute.    */
/* ------------------------------------------------------------------ */

interface WhDict {
  title: string;
  hint: string;
  queueLabel: string;
  slotsLabel: string;
  optimize: string;
  reset: string;
  full: string;
  pkgLabel: string;
}

type PkgClass = 'A' | 'B' | 'C';
const CLASS_RANK: Record<PkgClass, number> = { A: 0, B: 1, C: 2 };

interface Pkg {
  id: number;
  cls: PkgClass;
  el: HTMLButtonElement;
}

const SLOTS = 12;
const QUEUE_MAX = 3;

export function initWarehouse(reduced: boolean): void {
  const root = document.querySelector<HTMLElement>('[data-wh]');
  if (!root) return;
  const queueEl = root.querySelector<HTMLElement>('[data-wh-queue]');
  const gridEl = root.querySelector<HTMLElement>('[data-wh-grid]');
  const countEl = root.querySelector<HTMLElement>('[data-wh-count]');
  const msgEl = root.querySelector<HTMLElement>('[data-wh-msg]');
  const optimizeBtn = root.querySelector<HTMLButtonElement>('[data-wh-optimize]');
  const resetBtn = root.querySelector<HTMLButtonElement>('[data-wh-reset]');
  if (!queueEl || !gridEl) return;

  let dict: WhDict;
  try {
    dict = JSON.parse(root.dataset.i18n ?? '{}') as WhDict;
  } catch {
    return;
  }

  const slots: (Pkg | null)[] = Array.from({ length: SLOTS }, () => null);
  const slotEls: HTMLElement[] = [];
  for (let i = 0; i < SLOTS; i++) {
    const cell = gridEl.querySelector<HTMLElement>(`[data-slot="${i}"]`);
    if (cell) slotEls.push(cell);
  }
  if (slotEls.length !== SLOTS) return;

  let queue: Pkg[] = [];
  let nextId = 1;
  let selected: Pkg | null = null;
  let busy = false;

  const pad = (n: number) => String(n).padStart(2, '0');

  const updateCount = () => {
    const used = slots.filter(Boolean).length;
    if (countEl) countEl.textContent = `${(dict.slotsLabel ?? 'slots').toUpperCase()} ${pad(used)}/${SLOTS}`;
    if (msgEl) msgEl.hidden = used < SLOTS;
  };

  const randomClass = (): PkgClass => {
    const r = Math.random();
    return r < 0.3 ? 'A' : r < 0.75 ? 'B' : 'C';
  };

  const makePkg = (): Pkg => {
    const cls = randomClass();
    const id = nextId++;
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `wh-pkg wh-pkg-${cls.toLowerCase()}`;
    el.textContent = `${cls}-${pad(id)}`;
    el.setAttribute('aria-label', `${dict.pkgLabel ?? 'package'} ${cls}-${pad(id)}`);
    const pkg: Pkg = { id, cls, el };
    el.addEventListener('click', () => select(pkg));
    return pkg;
  };

  const refillQueue = () => {
    while (queue.length < QUEUE_MAX) {
      const pkg = makePkg();
      queue.push(pkg);
      queueEl.appendChild(pkg.el);
    }
  };

  const select = (pkg: Pkg) => {
    if (busy || !queue.includes(pkg)) return;
    selected?.el.classList.remove('is-selected');
    selected = selected === pkg ? null : pkg;
    selected?.el.classList.add('is-selected');
  };

  /* FLIP: measure, re-parent, invert, release — transform only */
  const fly = (el: HTMLElement, target: HTMLElement, done: () => void) => {
    if (reduced) {
      target.appendChild(el);
      done();
      return;
    }
    const r1 = el.getBoundingClientRect();
    target.appendChild(el);
    const r2 = el.getBoundingClientRect();
    const dx = r1.left - r2.left;
    const dy = r1.top - r2.top;
    el.style.transform = `translate(${dx}px, ${dy}px)`;
    requestAnimationFrame(() => {
      el.style.transition = 'transform 0.38s cubic-bezier(0.22, 1, 0.36, 1)';
      el.style.transform = '';
    });
    el.addEventListener(
      'transitionend',
      () => {
        el.style.transition = '';
        done();
      },
      { once: true },
    );
  };

  const store = (slotIdx: number) => {
    if (busy || !selected || slots[slotIdx]) return;
    const pkg = selected;
    selected = null;
    pkg.el.classList.remove('is-selected');
    queue = queue.filter((p) => p !== pkg);
    slots[slotIdx] = pkg;
    busy = true;
    fly(pkg.el, slotEls[slotIdx], () => {
      busy = false;
      refillQueue();
      updateCount();
    });
  };

  const optimize = () => {
    if (busy) return;
    const stored = slots.filter((p): p is Pkg => p !== null);
    if (stored.length < 2) return;
    stored.sort((a, b) => CLASS_RANK[a.cls] - CLASS_RANK[b.cls] || a.id - b.id);
    slots.fill(null);
    stored.forEach((p, i) => (slots[i] = p));
    busy = true;
    let pending = 0;
    stored.forEach((pkg, i) => {
      const place = () => {
        pending++;
        fly(pkg.el, slotEls[i], () => {
          pending--;
          if (pending === 0) busy = false;
        });
      };
      if (reduced) place();
      else window.setTimeout(place, i * 55);
    });
    updateCount();
  };

  const reset = () => {
    if (busy) return;
    slots.fill(null);
    for (const p of queue) p.el.remove();
    queue = [];
    selected = null;
    nextId = 1;
    gridEl.querySelectorAll('.wh-pkg').forEach((el) => el.remove());
    refillQueue();
    updateCount();
  };

  slotEls.forEach((cell, i) => cell.addEventListener('click', () => store(i)));
  optimizeBtn?.addEventListener('click', optimize);
  resetBtn?.addEventListener('click', reset);

  refillQueue();
  updateCount();
}
