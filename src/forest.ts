import './forest.css';
import { siteHeader } from './site-nav';
import { localizeDocument, tr } from './i18n';

localizeDocument('Forest Map | Echo Forest', 'Open the Echo Forest map and pick an adventure, a kart race, a defense battle, a music game or a ski run.');

const portraits = import.meta.glob('../assets/sprites/1x/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const sprite = (id: string) => portraits[`../assets/sprites/1x/${id}.png`];
const landmarks = import.meta.glob('../assets/ui/forest/landmark-*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const landmark = (id: string) => landmarks[`../assets/ui/forest/landmark-${id}.png`];
const places = [
  { id: 'adventure', title: tr('森林冒險', 'Forest Adventure'), place: tr('晨光小徑', 'Morning Trail'), hero: 'anbo', name: 'Anbo', x: 24, y: 32, kind: tr('跳躍探索', 'Jump & explore'), detail: tr('沿著樹枝與蘑菇向前跳，收集散落的音符，找到森林深處的朋友。', 'Hop along branches and mushrooms, collect the scattered notes and find your friend deep in the forest.'), controls: tr('方向鍵移動，空白鍵跳躍；手機使用觸控按鈕。', 'Arrow keys to move, Space to jump; on phones, use the touch controls.'), href: './adventure.html', icon: '♧' },
  { id: 'race', title: tr('森林賽車', 'Forest Race'), place: tr('風之賽車場', 'Wind Raceway'), hero: 'angoo', name: 'Angoo', x: 73, y: 24, kind: tr('三圈競速', '3-lap race'), detail: tr('選一條喜歡的賽道，甩尾過彎、飛越跳台，再展開滑翔翼追上夥伴。', 'Pick a track, drift through corners, fly off ramps and glide to catch your friends.'), controls: tr('左右轉向、空白鍵甩尾；空中 ↑ 俯衝、↓ 拉升。', 'Left/right to steer, Space to drift; in the air, ↑ dives and ↓ climbs.'), href: './race.html', icon: '⚑' },
  { id: 'defense', title: tr('爆破保衛戰', 'Bomb Defense'), place: tr('生命樹營地', 'Tree of Life Camp'), hero: 'anji', name: 'Anji', x: 49, y: 49, kind: tr('種植守線', 'Plant & defend'), detail: tr('種下植物、安排炸彈，守住生命樹。準備好迎接逐漸變強的五波挑戰。', 'Plant defenders, place bombs and protect the Tree of Life through five ever-tougher waves.'), controls: tr('點選種子與空地種植，用方向鍵移動、空白鍵放炸彈。', 'Tap a seed then a free spot to plant; arrow keys to move, Space to drop a bomb.'), href: './defense.html', icon: '✦' },
  { id: 'echo', title: tr('森林回音', 'Forest Echo'), place: tr('回音樹屋', 'Echo Treehouse'), hero: 'owl', name: 'Owl', x: 22, y: 70, kind: tr('旋律記憶', 'Melody memory'), detail: tr('聽聽朋友的合奏，記住亮起的順序，再把旋律一個音、一個音接回來。', 'Listen to your friends play, remember the order they light up, then play the tune back note by note.'), controls: tr('點選亮過的夥伴，或用畫面標示的數字鍵回答。', 'Tap the friends that lit up, or press the number keys shown on screen.'), href: './echo.html', icon: '♫' },
  { id: 'catch', title: tr('音符接接樂', 'Note Catch'), place: tr('星光演奏台', 'Starlight Stage'), hero: 'anmi', name: 'Anmi', x: 77, y: 70, kind: tr('節奏接物', 'Rhythm catch'), detail: tr('在四條音軌間穿梭，接住金色音符、避開雜音，完成一首森林小曲。', 'Dash between four lanes, catch the golden notes, dodge the noise and finish a little forest song.'), controls: tr('左右移動，或點選音軌、拖曳角色；一局 48 秒。', 'Move left/right, or tap a lane or drag your character; each round is 48 seconds.'), href: './catch.html', icon: '♪' },
  { id: 'ski', title: tr('雪林滑降', 'Snowy Forest Run'), place: tr('雪松山頂', 'Cedar Summit'), hero: 'anje', name: 'Anje', x: 50, y: 17, kind: tr('滑雪下坡', 'Downhill ski'), detail: tr('從雪松山頂一路滑下，穿過紅藍旗門、收集音符，在冰瀑跳台上翻個筋斗。', 'Ski down from the cedar summit, carve through red and blue gates, collect notes and flip off the icefall jumps.'), controls: tr('左右轉彎，↑ 壓低加速、↓ 煞車；空中按空白鍵做特技。', 'Left/right to turn, ↑ to tuck, ↓ to brake; Space in the air for a trick.'), href: './ski.html', icon: '❄' },
];
// A compact illustrated world, rendered without a game engine or WebGL.
const trees = [[55,95,1.2],[135,82,1],[265,63,1.15],[348,90,.8],[458,60,1.1],[525,100,.85],[875,70,1.2],[930,160,1],[85,250,.8],[120,400,1.1],[52,485,1],[325,275,.7],[605,315,.8],[850,350,.8],[916,452,1.2],[338,470,.9],[438,558,1],[595,570,1.3],[860,556,1],[725,546,.7]];
// Softer outlines and three greens keep the backdrop behind the pixel landmarks.
const greens = ['#3d7352', '#467c55', '#3a6d4f'];
const tree = ([x,y,s]: number[], i: number) => `<g transform="translate(${x} ${y}) scale(${(s * .86).toFixed(2)})" opacity="${s < .9 ? .8 : .92}"><ellipse cy="14" rx="27" ry="10" fill="#315e43" opacity=".18"/><path d="M-5 10V-40H5V10" fill="#7d6c4b"/><path d="M0-89L-29-37H-19L-37-9H37L19-37H29Z" fill="${greens[i % 3]}" stroke="#3a6a4c" stroke-width="2" stroke-linejoin="round"/><path d="M0-78L-19-40H0Z" fill="#8aab69" opacity=".85"/></g>`;
document.querySelector('#app')!.innerHTML = `
${siteHeader("map")}
<main class="forest-main"><div class="map-heading"><div><p>${tr('歡迎回到森林', 'Welcome back to the forest')}</p><h1>${tr('今天，想去哪裡玩？', 'Where shall we play today?')}</h1></div><p class="map-help" id="map-help">${tr('點選地圖上的路牌，讓夥伴帶你出發。', 'Tap a signpost on the map and a friend will take you there.')}</p></div>
<div class="forest-layout"><section class="world" aria-label="${tr('森林入口地圖', 'Forest map')}" aria-describedby="map-help">
<svg class="terrain" viewBox="0 0 1000 650" preserveAspectRatio="none" aria-hidden="true">
<defs><pattern id="grass" width="53" height="47" patternUnits="userSpaceOnUse"><path d="M8 31l-3-5m3 5 3-6" stroke="#6b925a" stroke-width="2" opacity=".3"/><circle cx="38" cy="13" r="1.5" fill="#e2df8b" opacity=".6"/></pattern></defs>
<rect width="1000" height="650" fill="#9cb87b"/><path d="M0 130Q140 10 375 155T1000 95V0H0Z" fill="#7e9f69"/><path d="M0 540Q250 440 490 560T1000 500V650H0Z" fill="#88a56a"/><rect width="1000" height="650" fill="url(#grass)"/>
<path d="M440-30C385 80 670 190 657 290S740 365 720 430 510 545 780 690" fill="none" stroke="#7fa98f" stroke-width="62"/><path d="M440-30C385 80 670 190 657 290S740 365 720 430 510 545 780 690" fill="none" stroke="#a3d2bc" stroke-width="52"/><path d="M446 0C410 80 681 198 671 284M700 447Q608 511 658 560" fill="none" stroke="#d5e9c8" stroke-width="3" stroke-dasharray="28 20"/>
<path d="M500 650V525Q445 450 490 330M490 330Q335 235 240 206M490 330Q560 145 730 150M490 330Q380 441 220 460M490 330Q613 465 770 460" fill="none" stroke="#80925d" stroke-width="35" stroke-linecap="round"/><path d="M500 650V525Q445 450 490 330M490 330Q335 235 240 206M490 330Q560 145 730 150M490 330Q380 441 220 460M490 330Q613 465 770 460" fill="none" stroke="#ead8a0" stroke-width="27" stroke-linecap="round"/>
<g transform="translate(616 182) rotate(-25)"><rect x="-18" y="-39" width="36" height="78" rx="4" fill="#ac8355" stroke="#765a3b" stroke-width="3"/><path d="M-17-25H17M-17-11H17M-17 3H17M-17 17H17M-17 31H17" stroke="#e0bb7b" stroke-width="3"/></g>
<g transform="translate(688 451) rotate(18)"><rect x="-42" y="-18" width="84" height="36" rx="4" fill="#ac8355" stroke="#765a3b" stroke-width="3"/><path d="M-28-17V17M-14-17V17M0-17V17M14-17V17M28-17V17" stroke="#e0bb7b" stroke-width="3"/></g>
${trees.map(tree).join('')}
</svg>
<div class="map-landmarks" aria-hidden="true">${places.map(p=>`<img class="landmark" data-landmark="${p.id}" src="${landmark(p.id)}" alt="" style="--x:${p.x}%;--y:${p.y}%">`).join('')}</div>
<div class="map-locations" role="group" aria-label="${tr('選擇遊戲', 'Choose a game')}">${places.map(p=>`<button class="map-pin" data-place="${p.id}" style="--x:${p.x}%;--y:${p.y}%" aria-pressed="false" aria-controls="destination"><img src="${sprite(p.hero)}" alt=""><span>${p.title}</span><small>${p.place}</small><em class="pin-picked" aria-hidden="true">${tr('已選', 'Picked')}</em></button>`).join('')}</div>
<div class="entrance-sign"><span aria-hidden="true">⌂</span> ${tr('森林入口', 'Forest gate')}</div><span class="map-compass" aria-hidden="true">✧<small>${tr('北', 'N')}</small></span>
</section>
<div class="sheet-backdrop" id="sheet-backdrop" aria-hidden="true"></div><aside class="destination" id="destination" aria-labelledby="destination-title"><button class="sheet-close" id="sheet-close" type="button" aria-label="${tr('關閉說明，回到地圖', 'Close and go back to the map')}"><span aria-hidden="true">✕</span></button><div class="destination-top"><span id="destination-kind"></span><span id="destination-icon" aria-hidden="true"></span></div><div class="guide-portrait"><img id="guide-img" alt=""><span id="guide-name"></span></div><div aria-live="polite" aria-atomic="true"><p id="destination-place"></p><h2 id="destination-title"></h2><p id="destination-detail"></p></div><p id="destination-controls"></p><a class="depart" id="depart"><img id="depart-img" alt=""><span class="depart-text">${tr('出發去玩', 'Let\'s play ')}<b id="depart-title"></b></span><span aria-hidden="true">↗</span></a><p class="all-open">${tr('六款遊戲都已開放，選喜歡的就能玩。', 'All six games are open. Pick your favorite!')}</p></aside></div>
<footer class="map-footer"><span>${tr('沿著小徑，遇見一段新的旋律。', 'Follow the trail to a brand-new tune.')}</span><span>Echo Forest · ${tr('森林導覽圖', 'Forest guide map')}</span></footer></main>`;
const el = (id: string) => document.getElementById(id)!;
const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.map-pin'));
function select(id: string) {
  const p = places.find(p => p.id === id) ?? places[0];
  buttons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.place === p.id)));
  el('destination-title').textContent = p.title; el('destination-place').textContent = p.place;
  el('destination-detail').textContent = p.detail; el('destination-controls').textContent = p.controls;
  el('destination-kind').textContent = p.kind; el('destination-icon').textContent = p.icon;
  const img = el('guide-img') as HTMLImageElement; img.src = sprite(p.hero); img.alt = p.name;
  el('guide-name').textContent = tr(`${p.name} 陪你出發`, `${p.name} will go with you`);
  document.querySelectorAll('.landmark').forEach(l => l.classList.toggle('picked', (l as HTMLElement).dataset.landmark === p.id));
  el('depart-title').textContent = p.title; (el('depart-img') as HTMLImageElement).src = sprite(p.hero);
  const link = el('depart') as HTMLAnchorElement;
  // Replay a short pulse so the phone's fixed depart bar visibly follows each new pick.
  link.classList.remove('changed'); void link.offsetWidth; link.classList.add('changed'); link.href = p.href; link.setAttribute('aria-label', tr(`出發去玩${p.title}`, `Let\'s play ${p.title}`));
  try { localStorage.setItem('echo-forest-map-place', p.id); } catch { /* The map works without storage. */ }
}
// On phones the destination card is a popup sheet, so the explanation and the depart button can't be missed below the map.
const phone = matchMedia('(max-width:720px)');
const sheet = el('destination');
let opener: HTMLElement | null = null;
function syncSheet() {
  const open = document.body.classList.contains('sheet-open');
  sheet.toggleAttribute('inert', phone.matches && !open);
  if (phone.matches) { sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', String(open)); } else { sheet.removeAttribute('role'); sheet.removeAttribute('aria-modal'); }
}
function openSheet(from: HTMLElement) {
  if (!phone.matches) return;
  opener = from; document.body.classList.add('sheet-open'); syncSheet(); el('sheet-close').focus({ preventScroll: true });
}
function closeSheet() {
  if (!document.body.classList.contains('sheet-open')) return;
  document.body.classList.remove('sheet-open'); syncSheet(); opener?.focus({ preventScroll: true });
}
el('sheet-close').onclick = closeSheet; el('sheet-backdrop').onclick = closeSheet;
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
phone.addEventListener('change', () => { document.body.classList.remove('sheet-open'); syncSheet(); });
syncSheet();
buttons.forEach((b, i) => {
  b.onclick = () => { select(b.dataset.place!); openSheet(b); };
  b.onkeydown = e => {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!delta) return;
    e.preventDefault(); const next = buttons[(i + delta + buttons.length) % buttons.length]; next.focus(); select(next.dataset.place!);
  };
});
let initial = 'adventure';
try { initial = localStorage.getItem('echo-forest-map-place') ?? initial; } catch { /* Default location. */ }
select(initial);
