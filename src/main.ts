import './style.css';
import './adventure.css';
import { ForestGame, hostOf, playableIds, type GameEvent, type Look } from './game';
import characters from '../assets/characters.json';
import restBadge from '../assets/ui/adv-rest.png';
import winBadge from '../assets/ui/adv-win.png';

const app = document.querySelector<HTMLDivElement>('#app')!;
// Vite statically includes the source asset directory in production builds.
const mascotAssets = import.meta.glob('../assets/sprites/1x/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const sideAssets = import.meta.glob('../assets/sprites/side/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const front = (id: string) => mascotAssets[`../assets/sprites/1x/${id}.png`];
const side = (id: string, kind: 'run_a' | 'run_b' | 'stand') => sideAssets[`../assets/sprites/side/${id}_${kind}.png`];
const cast = characters.characters.filter(c => playableIds.includes(c.id));
const byId = (id: string) => cast.find(c => c.id === id) ?? cast.find(c => c.id === 'anbo')!;
let hero = byId(new URLSearchParams(location.search).get('hero') ?? (() => { try { return localStorage.getItem('echo-adventure-hero') ?? 'anbo'; } catch { return 'anbo'; } })());
const kartSheet = new URL('../assets/generated/anbo-kart-eight-directions.png', import.meta.url).href;
const directions = ['正面', '右前', '右側', '右後', '背面', '左後', '左側', '左前'];
app.innerHTML = `
  <header class="site-header">
    <a class="brand" href="./" aria-label="Echo Forest 首頁"><span class="brand-tree" aria-hidden="true"></span><span>echo forest<small>回聲森林遊樂場</small></span></a>
    <nav aria-label="遊戲選單"><span class="nav-current">森林冒險</span><a class="nav-button" href="./race.html">森林賽車</a><button class="nav-button" id="open-kart">賽車工坊 <span aria-hidden="true">↗</span></button><a class="nav-button" href="./defense.html">爆破保衛戰</a><a class="nav-button" href="./echo.html">森林回音</a><a class="nav-button" href="./catch.html">音符接接樂</a></nav>
    <span class="edition">一段小小的森林旅程</span>
  </header>
  <main>
    <section class="intro" aria-labelledby="page-title"><div><p class="chapter"><span></span> 第一章・晨光小徑</p><h1 id="page-title">森林裡，出發。</h1><p class="intro-copy">跟著 <span class="hero-name">Anbo</span> 的腳步，找回散落在林間的旋律。</p></div><div class="player-badge"><img id="badge-img" src="${front('anbo')}" alt=""/><div><small>今天的冒險夥伴</small><strong><span class="hero-name">Anbo</span> <span id="badge-species">柴犬</span></strong></div></div></section>
    <section class="game-shell is-locked" aria-label="森林音符冒險">
      <div class="game-toolbar"><div class="trail-name"><span aria-hidden="true">✦</span> 晨光小徑 <span class="trail-en">Morning trail</span></div><div class="toolbar-actions"><button id="look" aria-pressed="false" title="切換畫面風格">✧ <span id="look-name">標準</span></button><button id="sound" aria-label="開啟音效" aria-pressed="false">♫ <span>音效關</span></button><button id="pause" aria-label="暫停遊戲" disabled>Ⅱ <span>暫停</span></button><button id="restart" aria-label="重新開始遊戲" disabled>↻ <span>重來</span></button></div></div>
      <div class="stage" id="stage">
        <div id="game" role="application" aria-label="森林冒險，方向鍵移動，空白鍵跳躍，Escape 暫停" tabindex="0"></div>
        <div class="hud" id="hud" hidden><div class="hud-left"><span id="hearts" role="img" aria-label="3 顆愛心"><i class="hud-icon heart"></i><i class="hud-icon heart"></i><i class="hud-icon heart"></i></span><span class="hud-notes"><i class="hud-icon note" aria-hidden="true"></i> <b id="note-count">0</b><small> / <span id="note-total">20</span></small></span></div><div class="hud-right"><span class="hud-time"><i class="hud-icon timer" aria-hidden="true"></i><span id="timer">00:00</span></span><span id="checkpoint-label">目標：找到 <span class="host-name">Owl</span></span></div></div>
        <div class="overlay" id="overlay">
          <div class="welcome picker" id="welcome"><span class="welcome-label">Echo Forest Adventure ・ 選擇夥伴</span><div class="picker-hero"><div class="picker-stage"><img id="picker-sprite" src="${side('anbo', 'stand')}" alt=""></div><div><h2 id="picker-title">今天和誰出發？</h2><p id="picker-meta"></p></div></div><div class="picker-grid" role="radiogroup" aria-label="選擇冒險角色">${cast.map(c => `<button class="pick" role="radio" aria-checked="false" data-hero="${c.id}" aria-label="${c.name}，${c.species}"><img src="${side(c.id, 'stand')}" alt=""><span>${c.name}</span></button>`).join('')}</div><div class="picker-actions"><button class="primary" id="start" disabled>正在準備森林…</button><span class="start-hint">← → 選角色 <span>／</span> Enter 出發</span></div></div>
          <div class="result-panel" id="result" hidden></div>
        </div>
        <div class="toast" id="toast" role="status" aria-live="polite"></div>
      </div>
      <div class="touch-controls" aria-label="觸控操作"><div><button data-control="left" aria-label="向左移動">◀</button><button data-control="right" aria-label="向右移動">▶</button></div><span>按住跳躍可以跳得更高</span><button data-control="jump" class="touch-jump" aria-label="跳躍">跳躍 ↑</button></div>
      <div class="game-caption"><span><kbd>←</kbd><kbd>→</kbd> 移動 <i></i><kbd>Space</kbd> 跳躍 <i></i><kbd>Esc</kbd> 暫停</span><span class="caption-tip">小提示：踩上紅蘑菇，會有驚喜。</span></div>
    </section>
    <section class="forest-friends" aria-label="森林夥伴"><div class="friends-heading"><h2>森林裡的朋友們</h2><p>點選朋友，就能換他帶路。</p></div><div class="friend-list">${cast.map(c => `<button class="friend" data-hero="${c.id}" aria-pressed="false"><img src="${front(c.id)}" alt="${c.species} ${c.name}"/><span>${c.name}</span><small>本次主角</small></button>`).join('')}</div></section>
    <footer><span>小小像素，大大冒險。</span><span>Echo Forest <span aria-hidden="true">✦</span> 數讀房市</span></footer>
  </main>
  <dialog id="kart-dialog" aria-labelledby="kart-title"><div class="workshop-top"><span>Echo Forest Garage</span><button id="close-kart" aria-label="關閉賽車工坊">✕</button></div><div class="workshop-body"><p class="chapter">下一段旅程</p><h2 id="kart-title">Anbo 的森林小車</h2><p>森林綠車身、黃銅細節，還有熟悉的橘色耳朵。<br>點選角度，看看第一台小車的模樣。</p><div class="kart-turntable"><div class="kart-large" id="kart-large" role="img" aria-label="Anbo 賽車正面"></div><span id="direction-label">正面</span></div><div class="direction-list">${directions.map((name, i) => `<button class="direction ${i === 0 ? 'active' : ''}" data-direction="${i}" aria-pressed="${i === 0}"><span class="kart-thumb" style="background-image:url('${kartSheet}');background-position:${(i % 4) * 100 / 3}% ${Math.floor(i / 4) * 100}%"></span>${name}</button>`).join('')}</div><div class="workshop-note"><span>八方向美術樣張</span><p>三圈晨光盃已開賽，帶著 Anbo 上賽道吧。</p><a href="./race.html" class="race-workshop-link">前往森林賽車 →</a><br><br><a href="${kartSheet}" download="anbo-kart-eight-directions.png">下載完整樣張 ↓</a></div></div></dialog>
`;
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const start = el<HTMLButtonElement>('start');
const overlay = el('overlay');
const result = el('result');
const pauseButton = el<HTMLButtonElement>('pause');
const restartButton = el<HTMLButtonElement>('restart');
const dialog = el<HTMLDialogElement>('kart-dialog');
let toastTimer: ReturnType<typeof setTimeout>;
let modalPaused = false;
const formatTime = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
function showToast(message: string) { el('toast').textContent = message; el('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el('toast').classList.remove('visible'), 2600); }
function focusGame() { el('game').focus({ preventScroll: true }); }
const shell = document.querySelector<HTMLElement>('.game-shell')!;
function begin() { shell.classList.remove('is-locked'); el('welcome').hidden = true; result.hidden = true; overlay.hidden = true; el('hud').hidden = false; pauseButton.disabled = false; restartButton.disabled = false; game.start(); focusGame(); }
function handleEvent(event: GameEvent) {
  if (event.type === 'ready') { start.disabled = false; start.textContent = '開始冒險　→'; }
  if (event.type === 'error') { start.textContent = '素材載入失敗，請重新整理'; showToast(event.message); }
  if (event.type === 'tick') { el('timer').textContent = formatTime(event.seconds); el('note-count').textContent = String(event.notes); el('note-total').textContent = String(event.total); }
  if (event.type === 'health') { el('hearts').innerHTML = '<i class="hud-icon heart"></i>'.repeat(event.lives) + '<i class="hud-icon heart empty"></i>'.repeat(3 - event.lives); el('hearts').setAttribute('aria-label', `${event.lives} 顆愛心`); }
  if (event.type === 'checkpoint') { el('checkpoint-label').textContent = '已點亮中途營地'; showToast('中途營地已點亮！跌倒也能從這裡再出發。'); }
  if (event.type === 'reset') { el('checkpoint-label').textContent = `目標：找到 ${hostName()}`; }
  if (event.type === 'hint') showToast(event.message);
  if (event.type === 'pause') {
    pauseButton.innerHTML = event.paused ? '▶ <span>繼續</span>' : 'Ⅱ <span>暫停</span>';
    pauseButton.setAttribute('aria-label', event.paused ? '繼續遊戲' : '暫停遊戲');
    shell.classList.toggle('is-locked', event.paused);
    if (event.paused) {
      result.innerHTML = `<img class="result-badge" src="${restBadge}" alt=""><p class="chapter">在樹蔭下歇一會</p><h2>森林會等你。</h2><p>準備好，再一起往前走。</p><button class="primary" id="resume">繼續冒險 →</button>`;
      result.hidden = false; overlay.hidden = false; el('resume').onclick = () => { game.setPaused(false); focusGame(); }; el('resume').focus({ preventScroll: true });
    } else { overlay.hidden = true; result.hidden = true; }
  }
  if (event.type === 'end') {
    pauseButton.disabled = true;
    el('hud').hidden = true;
    shell.classList.add('is-locked');
    const won = event.won;
    result.innerHTML = `${won ? `<img class="result-badge" src="${winBadge}" alt="">` : `<img class="result-mascot" src="${front(hero.id)}" alt="${hero.name}"/>`}<p class="chapter">${won ? '晨光小徑・完成' : '冒險還沒結束'}</p><h2>${won ? '森林聽見你了！' : '再試一次吧。'}</h2><p>${won ? `你和 ${hero.name} 把旋律帶回了森林，${hostName()} 為你們歡呼！` : '慢慢來，留意腳下的空隙與小刺球。'}</p><div class="result-stats"><span>收集音符<strong>${event.notes} / ${event.total}</strong></span><span>冒險時間<strong>${formatTime(event.seconds)}</strong></span></div>${won && event.best ? `<p class="best">本機最佳：${event.best.notes} 音符 · ${formatTime(event.best.seconds)}</p>` : ''}<button class="primary" id="play-again">${won ? '再冒險一次' : '重新出發'} →</button><button class="text-button" id="change-hero">換個夥伴冒險</button><button class="text-button" id="result-kart">去看看 Anbo 的小車 ↗</button>`;
    result.hidden = false; overlay.hidden = false; el('play-again').onclick = begin; el('result-kart').onclick = openKart; el('change-hero').onclick = showPicker; el('play-again').focus({ preventScroll: true });
  }
}
const game = new ForestGame(el('game'), handleEvent);
const hostName = () => byId(hostOf(hero.id)).name;
const picks = Array.from(document.querySelectorAll<HTMLButtonElement>('.pick'));
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let stride = 0;
/** Picker preview runs in place while the welcome card is up. */
setInterval(() => { if (el('welcome').hidden || reducedMotion) return; stride = (stride + 1) % 2; el<HTMLImageElement>('picker-sprite').src = side(hero.id, stride ? 'run_b' : 'run_a'); }, 120);
function chooseHero(id: string) {
  if (game.running) { showToast('這趟冒險結束後，就能換夥伴囉。'); return; }
  hero = byId(id); game.setCharacter(hero.id);
  try { localStorage.setItem('echo-adventure-hero', hero.id); } catch {}
  document.querySelectorAll('.hero-name').forEach(e => e.textContent = hero.name);
  document.querySelectorAll('.host-name').forEach(e => e.textContent = hostName());
  el<HTMLImageElement>('badge-img').src = front(hero.id); el<HTMLImageElement>('badge-img').alt = `${hero.species} ${hero.name}`; el('badge-species').textContent = hero.species;
  el<HTMLImageElement>('picker-sprite').src = side(hero.id, 'stand');
  el('picker-title').textContent = `${hero.name}・${hero.species}`;
  el('picker-meta').innerHTML = `帶著${hero.identity}，跳過樹樁、追著音符前進。<br>${hostName()} 正在森林的另一端等你。`;
  picks.forEach(b => { const on = b.dataset.hero === hero.id; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; });
  // Phones show the cast as one swipeable row; keep the chosen card in view without moving the page.
  const chosen = picks.find(b => b.dataset.hero === hero.id), row = chosen?.parentElement;
  if (chosen && row && row.scrollWidth > row.clientWidth) row.scrollLeft = chosen.offsetLeft - (row.clientWidth - chosen.offsetWidth) / 2;
  document.querySelectorAll<HTMLButtonElement>('.friend').forEach(b => { const on = b.dataset.hero === hero.id; b.classList.toggle('selected', on); b.setAttribute('aria-pressed', String(on)); });
}
function showPicker() { result.hidden = true; el('welcome').hidden = false; overlay.hidden = false; picks.find(b => b.dataset.hero === hero.id)?.focus({ preventScroll: true }); }
picks.forEach((b, i) => {
  b.onclick = () => chooseHero(b.dataset.hero!);
  b.ondblclick = () => { if (!start.disabled) begin(); };
  b.onkeydown = (e: KeyboardEvent) => {
    const step = ({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 } as Record<string, number>)[e.key];
    if (step) { e.preventDefault(); const next = picks[(i + step + picks.length) % picks.length]; chooseHero(next.dataset.hero!); next.focus(); }
    if (e.key === 'Enter' && !start.disabled) { e.preventDefault(); begin(); }
  };
});
document.querySelectorAll<HTMLButtonElement>('.friend').forEach(b => b.onclick = () => { chooseHero(b.dataset.hero!); if (!game.running) el('stage').scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' }); });
chooseHero(hero.id);
/** ?look= wins for sharing a link; otherwise reuse the viewer's last choice. */
function initialLook(): Look {
  const param = new URLSearchParams(location.search).get('look');
  if (param === 'hd2d' || param === 'standard') return param;
  try { return localStorage.getItem('echo-adventure-look') === 'hd2d' ? 'hd2d' : 'standard'; } catch { return 'standard'; }
}
function showLook() { const hd = game.look === 'hd2d'; el('look-name').textContent = hd ? 'HD-2D' : '標準'; el('look').setAttribute('aria-pressed', String(hd)); }
game.setLook(initialLook()); showLook();
el('look').onclick = () => { game.setLook(game.look === 'hd2d' ? 'standard' : 'hd2d'); try { localStorage.setItem('echo-adventure-look', game.look); } catch {} showLook(); if (game.running && !game.paused) focusGame(); };
start.onclick = begin;
pauseButton.onclick = () => { game.setPaused(!game.paused); if (!game.paused) focusGame(); };
restartButton.onclick = begin;
el('sound').onclick = () => { const on = game.toggleSound(); el('sound').innerHTML = `♫ <span>音效${on ? '開' : '關'}</span>`; el('sound').setAttribute('aria-pressed', String(on)); el('sound').setAttribute('aria-label', on ? '關閉音效' : '開啟音效'); };
function openKart() { modalPaused = game.running && !game.paused; if (modalPaused) game.setPaused(true); game.releaseControls(); dialog.showModal(); }
el('open-kart').onclick = openKart;
el('close-kart').onclick = () => dialog.close();
dialog.addEventListener('close', () => { if (modalPaused) { game.setPaused(false); focusGame(); } modalPaused = false; });
dialog.addEventListener('click', e => { if (e.target === dialog) { const b = dialog.getBoundingClientRect(); if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom) dialog.close(); } });
el('kart-large').style.backgroundImage = `url('${kartSheet}')`;
document.querySelectorAll<HTMLButtonElement>('[data-direction]').forEach(button => button.onclick = () => {
  const index = Number(button.dataset.direction);
  el('kart-large').style.backgroundPosition = `${(index % 4) * 100 / 3}% ${Math.floor(index / 4) * 100}%`;
  el('kart-large').setAttribute('aria-label', `Anbo 賽車${directions[index]}`); el('direction-label').textContent = directions[index];
  document.querySelectorAll('[data-direction]').forEach(b => { b.classList.toggle('active', b === button); b.setAttribute('aria-pressed', String(b === button)); });
});
document.querySelectorAll<HTMLButtonElement>('[data-control]').forEach(button => {
  const control = button.dataset.control as 'left' | 'right' | 'jump';
  button.onpointerdown = e => { e.preventDefault(); button.setPointerCapture(e.pointerId); game.setControl(control, true); button.classList.add('held'); };
  const release = () => { game.setControl(control, false); button.classList.remove('held'); };
  button.onpointerup = release; button.onpointercancel = release; button.onlostpointercapture = release;
});
window.addEventListener('blur', () => { game.releaseControls(); if (game.running) game.setPaused(true); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { game.releaseControls(); if (game.running) game.setPaused(true); } });
window.addEventListener('keydown', e => {
  if (dialog.open) return;
  if (e.key === 'Escape' && game.running) { e.preventDefault(); game.setPaused(!game.paused); if (!game.paused) focusGame(); }
  if (e.code === 'KeyR' && game.running && !e.repeat) begin();
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space', 'KeyA', 'KeyD', 'KeyW'].includes(e.code) && game.running && !game.paused && document.activeElement?.tagName !== 'BUTTON') e.preventDefault();
});
