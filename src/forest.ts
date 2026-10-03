import './forest.css';

const portraits = import.meta.glob('../assets/sprites/1x/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const sprite = (id: string) => portraits[`../assets/sprites/1x/${id}.png`];
const places = [
  { id: 'adventure', title: '森林冒險', place: '晨光小徑', hero: 'anbo', name: 'Anbo', x: 24, y: 32, kind: '跳躍探索', detail: '沿著樹枝與蘑菇向前跳，收集散落的音符，找到森林深處的朋友。', controls: '方向鍵移動，空白鍵跳躍；手機使用觸控按鈕。', href: './', icon: '♧' },
  { id: 'race', title: '森林賽車', place: '風之賽車場', hero: 'angoo', name: 'Angoo', x: 73, y: 24, kind: '三圈競速', detail: '選一條喜歡的賽道，甩尾過彎、飛越跳台，再展開滑翔翼追上夥伴。', controls: '左右轉向、空白鍵甩尾；空中 ↑ 俯衝、↓ 拉升。', href: './race.html', icon: '⚑' },
  { id: 'defense', title: '爆破保衛戰', place: '生命樹營地', hero: 'anji', name: 'Anji', x: 49, y: 49, kind: '種植守線', detail: '種下植物、安排炸彈，守住生命樹。準備好迎接逐漸變強的五波挑戰。', controls: '點選種子與空地種植，用方向鍵移動、空白鍵放炸彈。', href: './defense.html', icon: '✦' },
  { id: 'echo', title: '森林回音', place: '回音樹屋', hero: 'owl', name: 'Owl', x: 22, y: 70, kind: '旋律記憶', detail: '聽聽朋友的合奏，記住亮起的順序，再把旋律一個音、一個音接回來。', controls: '點選亮過的夥伴，或用畫面標示的數字鍵回答。', href: './echo.html', icon: '♫' },
  { id: 'catch', title: '音符接接樂', place: '星光演奏台', hero: 'anmi', name: 'Anmi', x: 77, y: 70, kind: '節奏接物', detail: '在四條音軌間穿梭，接住金色音符、避開雜音，完成一首森林小曲。', controls: '左右移動，或點選音軌、拖曳角色；一局 48 秒。', href: './catch.html', icon: '♪' },
];
// A compact illustrated world, rendered without a game engine or WebGL.
const trees = [[55,95,1.2],[135,82,1],[265,63,1.15],[348,90,.8],[458,60,1.1],[525,100,.85],[875,70,1.2],[930,160,1],[85,250,.8],[120,400,1.1],[52,485,1],[325,275,.7],[605,315,.8],[850,350,.8],[916,452,1.2],[338,470,.9],[438,558,1],[595,570,1.3],[860,556,1],[725,546,.7]];
const tree = ([x,y,s]: number[]) => `<g transform="translate(${x} ${y}) scale(${s})"><ellipse cy="14" rx="27" ry="10" fill="#315e43" opacity=".22"/><path d="M-5 10V-40H5V10" fill="#786746"/><path d="M0-89L-29-37H-19L-37-9H37L19-37H29Z" fill="#376c4d" stroke="#285740" stroke-width="3"/><path d="M0-78L-19-40H0Z" fill="#82a363"/></g>`;
document.querySelector('#app')!.innerHTML = `
<header class="map-header"><a class="map-brand" href="./forest.html" aria-label="Echo Forest 森林地圖"><span aria-hidden="true">♧</span><div>echo forest<small>回聲森林遊樂場</small></div></a><span class="map-edition">五個地方，隨時出發。</span></header>
<main class="forest-main"><div class="map-heading"><div><p>歡迎回到森林</p><h1>今天，想去哪裡玩？</h1></div><p class="map-help" id="map-help">點選地圖上的路牌，讓夥伴帶你出發。</p></div>
<div class="forest-layout"><section class="world" aria-label="森林入口地圖" aria-describedby="map-help">
<svg class="terrain" viewBox="0 0 1000 650" preserveAspectRatio="none" aria-hidden="true">
<defs><pattern id="grass" width="53" height="47" patternUnits="userSpaceOnUse"><path d="M8 31l-3-5m3 5 3-6" stroke="#6b925a" stroke-width="2" opacity=".3"/><circle cx="38" cy="13" r="1.5" fill="#e2df8b" opacity=".6"/></pattern></defs>
<rect width="1000" height="650" fill="#9cb87b"/><path d="M0 130Q140 10 375 155T1000 95V0H0Z" fill="#7e9f69"/><path d="M0 540Q250 440 490 560T1000 500V650H0Z" fill="#88a56a"/><rect width="1000" height="650" fill="url(#grass)"/>
<path d="M440-30C385 80 670 190 657 290S740 365 720 430 510 545 780 690" fill="none" stroke="#638f7e" stroke-width="67"/><path d="M440-30C385 80 670 190 657 290S740 365 720 430 510 545 780 690" fill="none" stroke="#a3d2bc" stroke-width="52"/><path d="M446 0C410 80 681 198 671 284M700 447Q608 511 658 560" fill="none" stroke="#d5e9c8" stroke-width="3" stroke-dasharray="28 20"/>
<path d="M500 650V525Q445 450 490 330M490 330Q335 235 240 206M490 330Q560 145 730 150M490 330Q380 441 220 460M490 330Q613 465 770 460" fill="none" stroke="#80925d" stroke-width="35" stroke-linecap="round"/><path d="M500 650V525Q445 450 490 330M490 330Q335 235 240 206M490 330Q560 145 730 150M490 330Q380 441 220 460M490 330Q613 465 770 460" fill="none" stroke="#ead8a0" stroke-width="27" stroke-linecap="round"/>
<g transform="translate(616 182) rotate(-25)"><rect x="-18" y="-39" width="36" height="78" rx="4" fill="#ac8355" stroke="#765a3b" stroke-width="3"/><path d="M-17-25H17M-17-11H17M-17 3H17M-17 17H17M-17 31H17" stroke="#e0bb7b" stroke-width="3"/></g>
<g transform="translate(688 451) rotate(18)"><rect x="-42" y="-18" width="84" height="36" rx="4" fill="#ac8355" stroke="#765a3b" stroke-width="3"/><path d="M-28-17V17M-14-17V17M0-17V17M14-17V17M28-17V17" stroke="#e0bb7b" stroke-width="3"/></g>
<ellipse cx="727" cy="132" rx="103" ry="58" fill="#69885d"/><ellipse cx="727" cy="132" rx="87" ry="43" fill="none" stroke="#e8d99e" stroke-width="16"/><path d="M801 110l9 5m-13 3 9 5" stroke="#385242" stroke-width="5"/>
<g transform="translate(480 288)"><rect x="-13" y="-43" width="26" height="57" fill="#86603c"/><circle cy="-67" r="45" fill="#497d4d"/><circle cx="-28" cy="-52" r="30" fill="#5f9359"/><circle cx="23" cy="-78" r="30" fill="#81a661"/><path d="M-9 9Q0-14 9 9" fill="#f2d788"/></g>
<g transform="translate(216 416)"><rect x="-28" y="-40" width="56" height="43" fill="#b58b57"/><path d="M-42-40L0-73 42-40Z" fill="#48775b"/><rect x="-10" y="-24" width="20" height="27" rx="10" fill="#f3da98"/><path d="M-20 3V29M20 3V29" stroke="#795b3c" stroke-width="7"/></g>
<g transform="translate(778 428)"><ellipse rx="73" ry="24" fill="#c29b67"/><ellipse cy="-8" rx="73" ry="24" fill="#f0dba0"/><path d="M-56-12V-59Q0-83 56-59V-12" fill="none" stroke="#607b4b" stroke-width="8"/><path d="M-56-59Q0-45 56-59" fill="none" stroke="#f2d877" stroke-width="3"/></g>
${trees.map(tree).join('')}
<g fill="#d58660"><path d="M170 161q20-40 40 0Z"/><path d="M284 214q14-28 28 0Z"/></g><g fill="#f1e1b3"><rect x="186" y="161" width="8" height="15"/><rect x="295" y="214" width="7" height="12"/></g>
</svg>
<div class="map-locations" role="group" aria-label="選擇遊戲">${places.map(p=>`<button class="map-pin" data-place="${p.id}" style="--x:${p.x}%;--y:${p.y}%" aria-pressed="false" aria-controls="destination"><img src="${sprite(p.hero)}" alt=""><span>${p.title}</span><small>${p.place}</small></button>`).join('')}</div>
<div class="entrance-sign"><span aria-hidden="true">⌂</span> 森林入口</div><span class="map-compass" aria-hidden="true">✧<small>北</small></span>
</section>
<aside class="destination" id="destination" aria-labelledby="destination-title"><div class="destination-top"><span id="destination-kind"></span><span id="destination-icon" aria-hidden="true"></span></div><div class="guide-portrait"><img id="guide-img" alt=""><span id="guide-name"></span></div><div aria-live="polite" aria-atomic="true"><p id="destination-place"></p><h2 id="destination-title"></h2><p id="destination-detail"></p></div><p id="destination-controls"></p><a class="depart" id="depart">出發去玩 <span aria-hidden="true">↗</span></a><p class="all-open">五款遊戲都已開放，選喜歡的就能玩。</p></aside></div>
<footer class="map-footer"><span>沿著小徑，遇見一段新的旋律。</span><span>Echo Forest · 森林導覽圖</span></footer></main>`;
const el = (id: string) => document.getElementById(id)!;
const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.map-pin'));
function select(id: string) {
  const p = places.find(p => p.id === id) ?? places[0];
  buttons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.place === p.id)));
  el('destination-title').textContent = p.title; el('destination-place').textContent = p.place;
  el('destination-detail').textContent = p.detail; el('destination-controls').textContent = p.controls;
  el('destination-kind').textContent = p.kind; el('destination-icon').textContent = p.icon;
  const img = el('guide-img') as HTMLImageElement; img.src = sprite(p.hero); img.alt = p.name;
  el('guide-name').textContent = `${p.name} 陪你出發`;
  const link = el('depart') as HTMLAnchorElement; link.href = p.href; link.setAttribute('aria-label', `出發去玩${p.title}`);
  try { localStorage.setItem('echo-forest-map-place', p.id); } catch { /* The map works without storage. */ }
}
buttons.forEach((b, i) => {
  b.onclick = () => select(b.dataset.place!);
  b.onkeydown = e => {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!delta) return;
    e.preventDefault(); const next = buttons[(i + delta + buttons.length) % buttons.length]; next.focus(); select(next.dataset.place!);
  };
});
let initial = 'adventure';
try { initial = localStorage.getItem('echo-forest-map-place') ?? initial; } catch { /* Default location. */ }
select(initial);
