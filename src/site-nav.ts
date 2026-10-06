import './site-nav.css';

// One header for every page: the forest map is home, the five games sit beside it.
export type NavPage = 'map' | 'adventure' | 'race' | 'defense' | 'echo' | 'catch';

const sprites = import.meta.glob('../assets/sprites/1x/{anbo,angoo,anji,owl,anmi}.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const games: { id: NavPage; label: string; href: string; hero: string }[] = [
  { id: 'adventure', label: '森林冒險', href: './adventure.html', hero: 'anbo' },
  { id: 'race', label: '森林賽車', href: './race.html', hero: 'angoo' },
  { id: 'defense', label: '爆破保衛戰', href: './defense.html', hero: 'anji' },
  { id: 'echo', label: '森林回音', href: './echo.html', hero: 'owl' },
  { id: 'catch', label: '音符接接樂', href: './catch.html', hero: 'anmi' },
];

const item = (current: NavPage, id: NavPage, href: string, inner: string, cls: string) =>
  current === id
    ? `<a class="${cls} is-current" href="${href}" aria-current="page">${inner}</a>`
    : `<a class="${cls}" href="${href}">${inner}</a>`;

export function siteHeader(current: NavPage) {
  // Keep the active game visible in the phone's sideways strip once the markup is in the page.
  queueMicrotask(() => {
    const strip = document.querySelector<HTMLElement>('.topbar-games');
    const active = strip?.querySelector<HTMLElement>('.is-current');
    if (strip && active && strip.scrollWidth > strip.clientWidth) strip.scrollLeft = active.offsetLeft - (strip.clientWidth - active.offsetWidth) / 2;
  });
  return `<header class="topbar"><div class="topbar-inner">
<a class="topbar-brand" href="./" aria-label="Echo Forest 回到森林地圖"><span class="topbar-tree" aria-hidden="true"></span><span>echo forest<small>回聲森林遊樂場</small></span></a>
<nav class="topbar-nav" aria-label="遊戲選單">
${item(current, 'map', './', '<span class="topbar-map-icon" aria-hidden="true">⌂</span>森林地圖', 'topbar-map')}
<div class="topbar-games">${games.map(g => item(current, g.id, g.href, `<img src="${sprites[`../assets/sprites/1x/${g.hero}.png`]}" alt="">${g.label}`, 'topbar-game')).join('')}</div>
</nav></div></header>`;
}
