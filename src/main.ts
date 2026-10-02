import './style.css';
import { ForestGame, type GameEvent } from './game';
import characters from '../assets/characters.json';
import anbo from '../assets/sprites/4x/anbo.png?url';

const app = document.querySelector<HTMLDivElement>('#app')!;
// Vite statically includes the source asset directory in production builds.
const mascotAssets = import.meta.glob('../assets/sprites/1x/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const kartSheet = new URL('../assets/generated/anbo-kart-eight-directions.png', import.meta.url).href;
const directions = ['正面', '右前', '右側', '右後', '背面', '左後', '左側', '左前'];
app.innerHTML = `
  <header class="site-header">
    <a class="brand" href="./" aria-label="Echo Forest 首頁"><span class="brand-tree" aria-hidden="true"></span><span>echo forest<small>回聲森林遊樂場</small></span></a>
    <nav aria-label="遊戲選單"><span class="nav-current">森林冒險</span><a class="nav-button" href="./race.html">森林賽車</a><button class="nav-button" id="open-kart">賽車工坊 <span aria-hidden="true">↗</span></button><a class="nav-button" href="./defense.html">爆破保衛戰</a></nav>
    <span class="edition">一段小小的森林旅程</span>
  </header>
  <main>
    <section class="intro" aria-labelledby="page-title"><div><p class="chapter"><span></span> 第一章・晨光小徑</p><h1 id="page-title">森林裡，出發。</h1><p class="intro-copy">跟著 Anbo 的腳步，找回散落在林間的旋律。</p></div><div class="player-badge"><img src="${anbo}" alt="橘白色柴犬 Anbo"/><div><small>今天的冒險夥伴</small><strong>Anbo <span>柴犬</span></strong></div></div></section>
    <section class="game-shell" aria-label="森林音符冒險">
      <div class="game-toolbar"><div class="trail-name"><span aria-hidden="true">✦</span> 晨光小徑 <span class="trail-en">Morning trail</span></div><div class="toolbar-actions"><button id="sound" aria-label="開啟音效" aria-pressed="false">♫ <span>音效關</span></button><button id="pause" aria-label="暫停遊戲" disabled>Ⅱ <span>暫停</span></button><button id="restart" aria-label="重新開始遊戲" disabled>↻ <span>重來</span></button></div></div>
      <div class="stage" id="stage">
        <div id="game" role="application" aria-label="Anbo 森林冒險，方向鍵移動，空白鍵跳躍，Escape 暫停" tabindex="0"></div>
        <div class="hud" id="hud" hidden><div class="hud-left"><span id="hearts" aria-label="3 顆愛心">♥ ♥ ♥</span><span class="hud-notes">♪ <b id="note-count">0</b><small> / <span id="note-total">20</span></small></span></div><div class="hud-right"><span id="timer">00:00</span><span id="checkpoint-label">尋找森林裡的 Owl</span></div></div>
        <div class="overlay" id="overlay">
          <div class="welcome" id="welcome"><span class="welcome-label">Echo Forest Adventure</span><h2>一隻柴犬，<br>一整座奇遇。</h2><p>跳過樹樁，追著音符前進。<br>Owl 正在森林的另一端等你。</p><button class="primary" id="start" disabled>正在準備森林…</button><span class="start-hint">← → 移動 <span>／</span> 空白鍵跳躍</span></div>
          <div class="result-panel" id="result" hidden></div>
        </div>
        <div class="toast" id="toast" role="status" aria-live="polite"></div>
      </div>
      <div class="touch-controls" aria-label="觸控操作"><div><button data-control="left" aria-label="向左移動">◀</button><button data-control="right" aria-label="向右移動">▶</button></div><span>按住跳躍可以跳得更高</span><button data-control="jump" class="touch-jump" aria-label="跳躍">跳躍 ↑</button></div>
      <div class="game-caption"><span><kbd>←</kbd><kbd>→</kbd> 移動 <i></i><kbd>Space</kbd> 跳躍 <i></i><kbd>Esc</kbd> 暫停</span><span class="caption-tip">小提示：踩上紅蘑菇，會有驚喜。</span></div>
    </section>
    <section class="forest-friends" aria-label="森林夥伴"><div class="friends-heading"><h2>森林裡的朋友們</h2><p>這次由 Anbo 帶路。下一次，換誰冒險？</p></div><div class="friend-list">${characters.characters.map(c => `<div class="friend ${c.id === 'anbo' ? 'selected' : ''}"><img src="${mascotAssets[`../assets/sprites/1x/${c.id}.png`]}" alt="${c.species} ${c.name}"/><span>${c.name}</span>${c.id === 'anbo' ? '<small>本次主角</small>' : ''}</div>`).join('')}</div></section>
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
function begin() { el('welcome').hidden = true; result.hidden = true; overlay.hidden = true; el('hud').hidden = false; pauseButton.disabled = false; restartButton.disabled = false; game.start(); focusGame(); }
function handleEvent(event: GameEvent) {
  if (event.type === 'ready') { start.disabled = false; start.textContent = '開始冒險　→'; }
  if (event.type === 'error') { start.textContent = '素材載入失敗，請重新整理'; showToast(event.message); }
  if (event.type === 'tick') { el('timer').textContent = formatTime(event.seconds); el('note-count').textContent = String(event.notes); el('note-total').textContent = String(event.total); }
  if (event.type === 'health') { el('hearts').textContent = '♥ '.repeat(event.lives) + '♡ '.repeat(3 - event.lives); el('hearts').setAttribute('aria-label', `${event.lives} 顆愛心`); }
  if (event.type === 'checkpoint') { el('checkpoint-label').textContent = '已點亮中途營地'; showToast('中途營地已點亮！跌倒也能從這裡再出發。'); }
  if (event.type === 'reset') { el('checkpoint-label').textContent = '尋找森林裡的 Owl'; }
  if (event.type === 'hint') showToast(event.message);
  if (event.type === 'pause') {
    pauseButton.innerHTML = event.paused ? '▶ <span>繼續</span>' : 'Ⅱ <span>暫停</span>';
    pauseButton.setAttribute('aria-label', event.paused ? '繼續遊戲' : '暫停遊戲');
    if (event.paused) {
      result.innerHTML = `<span class="result-symbol">☾</span><p class="chapter">在樹蔭下歇一會</p><h2>森林會等你。</h2><p>準備好，再一起往前走。</p><button class="primary" id="resume">繼續冒險 →</button>`;
      result.hidden = false; overlay.hidden = false; el('resume').onclick = () => { game.setPaused(false); focusGame(); }; el('resume').focus({ preventScroll: true });
    } else { overlay.hidden = true; result.hidden = true; }
  }
  if (event.type === 'end') {
    pauseButton.disabled = true;
    const won = event.won;
    result.innerHTML = `<img class="result-mascot" src="${anbo}" alt="Anbo"/><p class="chapter">${won ? '晨光小徑・完成' : '冒險還沒結束'}</p><h2>${won ? '森林聽見你了！' : '再試一次吧。'}</h2><p>${won ? '你把旋律帶回了森林，Owl 為你揮旗！' : '慢慢來，留意腳下的空隙與小刺球。'}</p><div class="result-stats"><span>收集音符<strong>${event.notes} / ${event.total}</strong></span><span>冒險時間<strong>${formatTime(event.seconds)}</strong></span></div>${won && event.best ? `<p class="best">本機最佳：${event.best.notes} 音符 · ${formatTime(event.best.seconds)}</p>` : ''}<button class="primary" id="play-again">${won ? '再冒險一次' : '重新出發'} →</button><button class="text-button" id="result-kart">去看看 Anbo 的小車 ↗</button>`;
    result.hidden = false; overlay.hidden = false; el('play-again').onclick = begin; el('result-kart').onclick = openKart; el('play-again').focus({ preventScroll: true });
  }
}
const game = new ForestGame(el('game'), handleEvent);
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
