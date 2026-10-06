import './site-nav.css';
import { isEn, setLang, tr } from './i18n';

// One header for every page: the forest map is home, the six games sit beside it.
export type NavPage = 'map' | 'adventure' | 'race' | 'defense' | 'echo' | 'catch' | 'ski';

const sprites = import.meta.glob('../assets/sprites/1x/{anbo,angoo,anji,owl,anmi,anje}.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const games: { id: NavPage; label: string; href: string; hero: string }[] = [
  { id: 'adventure', label: tr('森林冒險', 'Forest Adventure'), href: './adventure.html', hero: 'anbo' },
  { id: 'race', label: tr('森林賽車', 'Forest Race'), href: './race.html', hero: 'angoo' },
  { id: 'defense', label: tr('爆破保衛戰', 'Bomb Defense'), href: './defense.html', hero: 'anji' },
  { id: 'echo', label: tr('森林回音', 'Forest Echo'), href: './echo.html', hero: 'owl' },
  { id: 'catch', label: tr('音符接接樂', 'Note Catch'), href: './catch.html', hero: 'anmi' },
  { id: 'ski', label: tr('雪林滑降', 'Snowy Run'), href: './ski.html', hero: 'anje' },
];

const item = (current: NavPage, id: NavPage, href: string, inner: string, cls: string) =>
  current === id
    ? `<a class="${cls} is-current" href="${href}" aria-current="page">${inner}</a>`
    : `<a class="${cls}" href="${href}">${inner}</a>`;

export function siteHeader(current: NavPage) {
  const game = games.find(g => g.id === current);
  // Phones fold the page links into a dropdown; the button names the page you are on.
  const menuLabel = game
    ? `<img src="${sprites[`../assets/sprites/1x/${game.hero}.png`]}" alt="">${game.label}`
    : `<span class="topbar-map-icon" aria-hidden="true">⌂</span>${tr('森林地圖', 'Forest map')}`;
  return `<header class="topbar"><div class="topbar-inner">
<a class="topbar-brand" href="./" aria-label="${tr('Echo Forest 回到森林地圖', 'Echo Forest, back to the forest map')}"><span class="topbar-tree" aria-hidden="true"></span><span>echo forest<small>${tr('回聲森林遊樂場', 'forest playground')}</small></span></a>
<button class="topbar-menu" type="button" aria-expanded="false" aria-controls="topbar-nav" aria-label="${tr('切換頁面', 'Switch page')}">${menuLabel}<span class="topbar-caret" aria-hidden="true">▾</span></button>
<nav class="topbar-nav" id="topbar-nav" aria-label="${tr('遊戲選單', 'Games')}">
${item(current, 'map', './', `<span class="topbar-map-icon" aria-hidden="true">⌂</span>${tr('森林地圖', 'Forest map')}`, 'topbar-map')}
<div class="topbar-games">${games.map(g => item(current, g.id, g.href, `<img src="${sprites[`../assets/sprites/1x/${g.hero}.png`]}" alt="">${g.label}`, 'topbar-game')).join('')}</div>
</nav>
<button class="topbar-lang" type="button" lang="${tr('en', 'zh-Hant')}" aria-label="${tr('Switch to English', '切換成中文')}">${tr('EN', '中文')}</button>
</div></header>`;
}

// Delegated so pages can render the header however they like.
const setMenu = (open: boolean) => {
  const bar = document.querySelector('.topbar');
  bar?.classList.toggle('menu-open', open);
  bar?.querySelector('.topbar-menu')?.setAttribute('aria-expanded', String(open));
};
document.addEventListener('click', e => {
  const target = e.target as Element;
  if (target.closest?.('.topbar-lang')) setLang(isEn ? 'zh' : 'en');
  if (target.closest?.('.topbar-menu')) setMenu(!document.querySelector('.topbar.menu-open'));
  else if (!target.closest?.('.topbar-nav')) setMenu(false);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.querySelector('.topbar.menu-open')) {
    setMenu(false);
    document.querySelector<HTMLElement>('.topbar-menu')?.focus();
  }
});
