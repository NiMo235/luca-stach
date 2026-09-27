/* ------------------------------------------------------------------ */
/* PROOF toy: live ROI model. Two sliders → hours saved per year and   */
/* payback months. The model is deliberately simple and labeled as     */
/* one: 67 % time saved per quote, 250 workdays, 25 k€ build cost,     */
/* 45 €/h labor. Numbers count up briefly on change; the slider state  */
/* is broadcast as `toy:roi` so the flight world can grow the PROOF    */
/* data towers along with the assumptions.                             */
/* ------------------------------------------------------------------ */

const BUILD_COST = 25_000; // €, one-off build
const LABOR_RATE = 45; // €/h
const TIME_SAVED = 0.67; // per quote, per the thesis measurement
const WORKDAYS = 250;

export function initRoi(reduced: boolean): void {
  const root = document.querySelector<HTMLElement>('[data-roi]');
  if (!root) return;
  const quotesEl = root.querySelector<HTMLInputElement>('[data-roi-quotes]');
  const minutesEl = root.querySelector<HTMLInputElement>('[data-roi-minutes]');
  const quotesVal = root.querySelector<HTMLElement>('[data-roi-quotes-val]');
  const minutesVal = root.querySelector<HTMLElement>('[data-roi-minutes-val]');
  const hoursEl = root.querySelector<HTMLElement>('[data-roi-hours]');
  const paybackEl = root.querySelector<HTMLElement>('[data-roi-payback]');
  if (!quotesEl || !minutesEl || !hoursEl || !paybackEl) return;

  let raf = 0;
  const shown = { hours: 0, payback: 0 };

  const render = (hours: number, payback: number) => {
    hoursEl.textContent = String(Math.round(hours));
    paybackEl.textContent = payback > 99 ? '>99' : payback.toFixed(1);
  };

  const update = () => {
    const quotes = Number(quotesEl.value);
    const minutes = Number(minutesEl.value);
    if (quotesVal) quotesVal.textContent = String(quotes);
    if (minutesVal) minutesVal.textContent = String(minutes);

    const hours = (quotes * minutes * TIME_SAVED * WORKDAYS) / 60;
    const savedValue = hours * LABOR_RATE;
    const payback = savedValue > 0 ? (BUILD_COST / savedValue) * 12 : 0;

    window.dispatchEvent(new CustomEvent('toy:roi', { detail: { quotes, minutes } }));

    cancelAnimationFrame(raf);
    if (reduced) {
      render(hours, payback);
      return;
    }
    const from = { ...shown };
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / 450, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      shown.hours = from.hours + (hours - from.hours) * eased;
      shown.payback = from.payback + (payback - from.payback) * eased;
      render(shown.hours, shown.payback);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  };

  quotesEl.addEventListener('input', update);
  minutesEl.addEventListener('input', update);
  update();
}
