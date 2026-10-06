import './game-guide.css';

// One swipeable "how to play" popup shared by every game. On phones it opens by itself on the first visit,
// so the page itself can stay on one screen instead of stacking instructions below the game.
export type GuidePage = { icon?: string; title: string; body: string };
type Options = { id: string; title: string; pages: GuidePage[]; onOpen?: () => void; onClose?: () => void };

const phone = matchMedia('(max-width:760px)');
const seenKey = 'echo-guide-seen';

function seen(id: string) {
  try { return (localStorage.getItem(seenKey) ?? '').split(',').includes(id); }
  catch { return true; } // Storage blocked: don't nag on every visit.
}
function markSeen(id: string) {
  try { const list = new Set((localStorage.getItem(seenKey) ?? '').split(',').filter(Boolean)); list.add(id); localStorage.setItem(seenKey, [...list].join(',')); } catch { /* Optional. */ }
}

export function mountGuide({ id, title, pages, onOpen, onClose }: Options) {
  const icon = (s?: string) => !s ? '' : /^(data:|\/|\.|http)/.test(s) ? `<img src="${s}" alt="">` : `<span>${s}</span>`;
  const root = document.createElement('div');
  root.className = 'guide';
  root.hidden = true;
  root.innerHTML = `<div class="guide-backdrop" data-guide-close></div>
<section class="guide-sheet" role="dialog" aria-modal="true" aria-labelledby="guide-title-${id}">
<header class="guide-head"><div><small>玩法說明</small><h2 id="guide-title-${id}">${title}</h2></div><button class="guide-close" type="button" data-guide-close aria-label="關閉玩法說明"><span aria-hidden="true">✕</span></button></header>
<div class="guide-track" tabindex="0" aria-roledescription="輪播" aria-label="左右滑動看下一頁">${pages.map((p, i) => `<article class="guide-page" aria-roledescription="頁" aria-label="第 ${i + 1} 頁，共 ${pages.length} 頁"><div class="guide-icon" aria-hidden="true">${icon(p.icon)}</div><h3>${p.title}</h3><div class="guide-body">${p.body}</div></article>`).join('')}</div>
<footer class="guide-foot"><button class="guide-prev" type="button" aria-label="上一頁">‹</button><div class="guide-dots" aria-hidden="true">${pages.map(() => '<i></i>').join('')}</div><button class="guide-next" type="button">下一頁 ›</button></footer>
</section>`;
  document.body.append(root);
  const track = root.querySelector<HTMLElement>('.guide-track')!;
  const dots = Array.from(root.querySelectorAll('.guide-dots i'));
  const prev = root.querySelector<HTMLButtonElement>('.guide-prev')!;
  const next = root.querySelector<HTMLButtonElement>('.guide-next')!;
  const close = root.querySelector<HTMLButtonElement>('.guide-close')!;
  let index = 0, opener: HTMLElement | null = null;
  // While a button-driven scroll is animating, ignore the in-between scroll positions so quick taps keep counting.
  let target = -1, settle = 0;
  const go = (i: number, smooth = true) => { index = Math.max(0, Math.min(pages.length - 1, i)); target = smooth ? index : -1; clearTimeout(settle); settle = window.setTimeout(() => target = -1, 700); track.scrollTo({ left: index * track.clientWidth, behavior: smooth ? 'smooth' : 'instant' }); paint(); };
  const paint = () => {
    dots.forEach((d, i) => d.classList.toggle('on', i === index));
    prev.disabled = index === 0;
    next.textContent = index === pages.length - 1 ? '開始玩' : '下一頁 ›';
  };
  track.addEventListener('scroll', () => {
    const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
    if (target >= 0) { if (i === target) target = -1; return; }
    if (i !== index) { index = i; paint(); }
  }, { passive: true });
  track.addEventListener('keydown', e => { if (e.key === 'ArrowRight') go(index + 1); if (e.key === 'ArrowLeft') go(index - 1); });
  prev.onclick = () => go(index - 1);
  next.onclick = () => index === pages.length - 1 ? hide() : go(index + 1);
  root.querySelectorAll<HTMLElement>('[data-guide-close]').forEach(b => b.onclick = hide);
  root.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.stopPropagation(); hide(); }
    if (e.key !== 'Tab') return;
    const focusables = Array.from(root.querySelectorAll<HTMLElement>('button:not(:disabled),.guide-track'));
    const first = focusables[0], last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  function show(from?: HTMLElement) {
    if (!root.hidden) return;
    opener = from ?? (document.activeElement as HTMLElement | null);
    root.hidden = false; document.documentElement.classList.add('guide-shown');
    go(0, false); close.focus({ preventScroll: true }); onOpen?.();
  }
  function hide() {
    if (root.hidden) return;
    root.hidden = true; document.documentElement.classList.remove('guide-shown'); markSeen(id);
    opener?.focus?.({ preventScroll: true }); onClose?.();
  }
  document.querySelectorAll<HTMLElement>('[data-guide-open]').forEach(b => b.addEventListener('click', () => show(b)));
  if (phone.matches && !seen(id)) show();
  return { open: show, close: hide, get isOpen() { return !root.hidden; } };
}

// A small "?" button pages drop into their toolbar to reopen the guide.
export const guideButton = (label = '玩法') => `<button class="guide-open" type="button" data-guide-open aria-haspopup="dialog"><span aria-hidden="true">?</span>${label}</button>`;
