import './style.css';
import './catch.css';
import { CatchGame, CATCH_REACH, inReach } from './catch-engine';
import characters from '../assets/characters.json';
import forest from '../assets/generated/forest-background.png';
import noteIcon from '../assets/ui/catch/note.png';
import noiseIcon from '../assets/ui/catch/noise.png';
import starIcon from '../assets/ui/catch/star.png';

const sprites = import.meta.glob('../assets/sprites/1x/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const sprite = (id: string) => sprites[`../assets/sprites/1x/${id}.png`];
const cast = ['anbo', 'anmi', 'anka', 'anzo'].map(id => characters.characters.find(c => c.id === id)!);
const game = new CatchGame();
const phrases = ['晨光落下', '林間追光', '一起合奏'];
let hero = cast[0];
let best = 0;
try { const saved = Number(localStorage.getItem('echo-catch-best')); if (Number.isFinite(saved) && saved > 0) best = saved; } catch {}
document.querySelector('#app')!.innerHTML = `
<header class="site-header"><a class="brand" href="./forest.html"><span class="brand-tree" aria-hidden="true"></span><span>echo forest<small>回聲森林遊樂場</small></span></a><nav aria-label="遊戲選單"><a class="nav-button" href="./forest.html">森林地圖</a><a class="nav-button" href="./">森林冒險</a><a class="nav-button" href="./race.html">森林賽車</a><a class="nav-button" href="./defense.html">爆破保衛戰</a><a class="nav-button" href="./echo.html">森林回音</a><span class="nav-current" aria-current="page">音符接接樂</span></nav></header>
<main class="catch-main"><section class="catch-intro"><div><p class="chapter">晨光音樂會・48 秒的小小演出</p><h1>接住森林的旋律。</h1><p>左右移動，讓每一個音符都找到歸處。</p></div><div class="catch-record">本機最高分<strong id="best">${best.toLocaleString()}</strong></div></section>
<section class="catch-shell" aria-label="音符接接樂遊戲" data-phase="ready">
  <div class="catch-toolbar"><span id="phrase">準備開演</span><div><button id="sound" aria-pressed="true">♫ 聲音開</button><button id="pause" disabled>暫停</button><button id="restart" disabled>重來</button></div></div>
  <div class="catch-hud"><div><small>合奏分數</small><strong id="score">0</strong></div><div><small>接住音符</small><strong><span id="caught">0</span><small> / 48</small></strong></div><div><small>連續接住</small><strong id="combo">0</strong></div><div><small>剩餘時間</small><strong id="time">48<small> 秒</small></strong></div></div>
  <div class="catch-stage" id="stage" style="--forest:url('${forest}');--note:url('${noteIcon}');--noise:url('${noiseIcon}');--catch-zone:${CATCH_REACH * 2 * 25}cqw" tabindex="0" aria-label="音符舞台，左右方向鍵或 A D 移動，1 到 4 選擇位置，Escape 暫停">
    <div class="catch-sun" aria-hidden="true"></div><div class="catch-lanes" aria-hidden="true">${[1,2,3,4].map(i => `<span><b>${i}</b></span>`).join('')}</div>
    <div id="notes" aria-hidden="true"></div><div id="fx" aria-hidden="true"></div><div class="catch-line" aria-hidden="true"></div>
    <div class="catch-player" id="player" aria-hidden="true"><span id="feedback"></span><b class="catch-ring"></b><em class="catch-hint">接音點</em><img id="hero" src="${sprite(hero.id)}" alt=""><i></i></div>
    <div class="catch-overlay" id="overlay"><div class="catch-panel" id="panel"></div></div>
  </div>
  <div class="catch-timeline" role="progressbar" aria-label="樂曲進度" aria-valuemin="0" aria-valuemax="48" aria-valuenow="0"><i id="timeline"></i><span></span><span></span></div>
  <div class="catch-touch" aria-label="選擇接音符的位置">${[1,2,3,4].map(i => `<button data-lane="${i - 1}" aria-label="移到第 ${i} 道">${i}<span>♪</span></button>`).join('')}</div>
  <div class="catch-caption"><span>← → / A D 移動 · 1–4 選位置 · Esc 暫停</span><span>手機：拖曳舞台，或點下方位置</span></div>
</section>
<section class="catch-guide"><div><b class="gold"><img src="${noteIcon}" alt=""></b><p><strong>金色音符，接住它</strong>音符落進腳下光圈就算接住，每個 100 分，連擊最高加成 100 分。</p></div><div><b class="noise"><img src="${noiseIcon}" alt=""></b><p><strong>灰色雜音，讓它飄過</strong>穿過光圈中央才算碰到，碰到扣 50 分，漏接或碰雜音會中斷連擊。</p></div><div><b><img src="${starIcon}" alt=""></b><p><strong>慢慢熟悉，就能合奏</strong>接住 12 / 28 個得一 / 二星；三星需接住 44 個，且碰雜音不超過 1 次。</p></div></section>
<p id="announcement" class="catch-sr" role="status" aria-live="polite"></p>
<footer><span>一點晨光，一首自己的小曲。</span><span>Echo Forest ✦</span></footer></main>`;

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const stage = el('stage');
const player = el('player');
const panel = el('panel');
const overlay = el('overlay');
const pause = el<HTMLButtonElement>('pause');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const keys = new Set<string>();
let pointer: number | null = null;
let feedbackUntil = 0;
let lastPhrase = -1;
let audio: AudioContext | undefined;
let sound = true;
const voices = new Set<OscillatorNode>();
const noteElements = new Map<number, HTMLElement>();

function announce(text: string) { el('announcement').textContent = text; }
function stopAudio() { voices.forEach(v => { try { v.stop(); } catch {} }); voices.clear(); }
function unlockAudio() {
  if (!sound) return;
  try { audio ??= new AudioContext(); void audio.resume().catch(() => {}); } catch { sound = false; updateSound(); }
}
function tone(pitch: number, noise = false) {
  if (!sound || !audio || audio.state !== 'running') return;
  const now = audio.currentTime;
  const osc = audio.createOscillator(); const gain = audio.createGain();
  osc.type = noise ? 'triangle' : 'sine';
  osc.frequency.setValueAtTime(noise ? 110 : [523.25, 587.33, 659.25, 698.46, 783.99, 880][pitch], now);
  gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(noise ? .025 : .15, now + .01);
  gain.gain.exponentialRampToValueAtTime(.0001, now + .38);
  osc.connect(gain); gain.connect(audio.destination); voices.add(osc);
  osc.onended = () => { voices.delete(osc); osc.disconnect(); gain.disconnect(); };
  osc.start(now); osc.stop(now + .4);
}
function updateSound() { el('sound').textContent = sound ? '♫ 聲音開' : '♫ 聲音關'; el('sound').setAttribute('aria-pressed', String(sound)); }
function release() { keys.clear(); pointer = null; game.release(); }
function setPhase() {
  document.querySelector('.catch-shell')!.setAttribute('data-phase', game.phase);
  pause.disabled = !['playing','paused'].includes(game.phase);
  pause.textContent = game.phase === 'paused' ? '繼續' : '暫停';
  el<HTMLButtonElement>('restart').disabled = game.phase === 'ready';
  document.querySelectorAll<HTMLButtonElement>('[data-lane]').forEach(b => b.disabled = game.phase !== 'playing');
}
function showPicker() {
  game.phase = 'ready'; release(); stopAudio(); overlay.hidden = false; setPhase();
  panel.innerHTML = `<p class="chapter">選一位夥伴，接住晨光</p><h2>音符接接樂</h2><p class="catch-legend"><span><img src="${noteIcon}" alt="">接住金色音符</span><span><img src="${noiseIcon}" alt="">避開灰色雜音</span></p><p>後兩段需要跨格接音，留意旁邊的雜音。</p><div class="catch-picks" role="group" aria-label="選擇演奏夥伴">${cast.map(c => `<button data-hero="${c.id}" aria-pressed="${c.id === hero.id}"><img src="${sprite(c.id)}" alt=""><span>${c.name}</span></button>`).join('')}</div><button class="catch-primary" id="start">開始演奏</button><small>角色能力相同 · 音效會在開始後播放</small>`;
  panel.querySelectorAll<HTMLButtonElement>('[data-hero]').forEach(b => b.onclick = () => {
    hero = cast.find(c => c.id === b.dataset.hero)!; el<HTMLImageElement>('hero').src = sprite(hero.id);
    panel.querySelectorAll('[data-hero]').forEach(p => p.setAttribute('aria-pressed', String(p === b)));
  });
  el('start').onclick = start;
}
function start() {
  stopAudio(); unlockAudio(); release(); game.start(); feedbackUntil = 0; lastPhrase = -1;
  noteElements.forEach(n => n.remove()); noteElements.clear(); el('fx').replaceChildren();
  overlay.hidden = true; setPhase(); render(); stage.focus({ preventScroll: true });
  if (matchMedia('(max-width:750px)').matches) stage.scrollIntoView({ block: 'center', behavior: 'instant' });
  announce('開始演奏，左右移動接住金色音符。');
}
function togglePause() {
  if (game.phase === 'playing') {
    game.pause(); release(); stopAudio(); overlay.hidden = false;
    panel.innerHTML = '<p class="chapter">在樹蔭下歇一會</p><h2>旋律會等你。</h2><p>準備好，再接住下一個音符。</p><button class="catch-primary" id="resume">繼續演奏</button>';
    el('resume').onclick = togglePause; el('resume').focus({ preventScroll: true }); announce('遊戲已暫停。');
  } else if (game.phase === 'paused') {
    unlockAudio(); game.resume(); overlay.hidden = true; stage.focus({ preventScroll: true }); announce('繼續演奏。');
  }
  setPhase();
}
function finish() {
  release(); stopAudio(); best = Math.max(best, game.score);
  try { localStorage.setItem('echo-catch-best', String(best)); } catch {}
  el('best').textContent = best.toLocaleString(); overlay.hidden = false; setPhase();
  const title = ['每個音符，都是新的開始。', '晨光聽見你了。', '森林跟著你唱歌。', '整座森林都在合奏！'][game.stars];
  panel.innerHTML = `<p class="chapter">三段演出完成 · ${hero.name}</p><div class="catch-stars" aria-label="${game.stars} 顆星，滿分 3 顆">${[0,1,2].map(i => `<img src="${starIcon}" alt="" class="${i < game.stars ? 'on' : ''}">`).join('')}</div><h2>${title}</h2><div class="catch-results"><span>合奏分數<strong>${game.score.toLocaleString()}</strong></span><span>接住音符<strong>${game.caught} / ${game.total}</strong></span><span>最高連擊<strong>${game.maxCombo}</strong></span></div><p class="catch-next">${nextGoal()}</p><p>漏接 ${game.missed} 個音符 · 碰到 ${game.noises} 次雜音</p><button class="catch-primary" id="again">再演奏一次</button><button class="catch-secondary" id="choose">換一位夥伴</button>`;
  el('again').onclick = start; el('choose').onclick = showPicker; el('again').focus({ preventScroll: true });
  announce(`演出完成，${game.caught} 個音符，${game.score} 分，${game.stars} 顆星。`);
}
function nextGoal() {
  if (game.stars >= 3) return '三顆星全拿，整座森林都記住了這首曲子。';
  const goal = [12, 28, 44][game.stars];
  if (game.caught < goal) return `再多接住 ${goal - game.caught} 個音符，就能拿到第 ${game.stars + 1} 顆星。`;
  return '音符都接到了！碰到雜音不超過 1 次就能拿到第三顆星。';
}
function feedback(text: string, kind: string) {
  el('feedback').textContent = text; el('feedback').className = kind; feedbackUntil = game.time + .65;
}
/** Catch burst on the ring: shockwave, sparks and the note popping up; noise gets a grey puff. */
function burst(lane: number, kind: 'catch' | 'noise') {
  const fx = document.createElement('div');
  const big = kind === 'catch' && game.combo >= 5;
  fx.className = `catch-fx ${kind}${big ? ' big' : ''}`;
  fx.style.left = `${12.5 + lane * 25}%`;
  const sparks = reducedMotion ? 0 : kind === 'noise' ? 6 : big ? 12 : 8;
  fx.innerHTML = `${kind === 'catch' ? '<b class="flash"></b>' : ''}<b class="wave"></b>${kind === 'catch' ? '<b class="pop"></b>' : ''}` +
    Array.from({ length: sparks }, (_, i) => `<i style="--a:${(i / sparks) * 360 + Math.random() * 20}deg;--d:${(big ? 110 : 80) + Math.random() * 35}px"></i>`).join('');
  el('fx').append(fx);
  setTimeout(() => fx.remove(), 800);
}
function render() {
  player.style.left = `${12.5 + game.x * 25}%`;
  el('score').textContent = game.score.toLocaleString(); el('caught').textContent = String(game.caught);
  el('combo').textContent = String(game.combo); el('time').innerHTML = `${Math.ceil(game.duration - game.time)}<small> 秒</small>`;
  el('timeline').style.width = `${game.time / game.duration * 100}%`;
  document.querySelector('.catch-timeline')!.setAttribute('aria-valuenow', String(Math.floor(game.time)));
  if (game.phase !== 'ready' && lastPhrase !== game.phrase) {
    lastPhrase = game.phrase; el('phrase').textContent = `${game.phrase + 1} / 3 · ${phrases[game.phrase]}`;
    announce(`第 ${game.phrase + 1} 樂段，${phrases[game.phrase]}。`);
  }
  player.classList.toggle('catching', !reducedMotion && game.time < feedbackUntil && el('feedback').className === 'good');
  el('feedback').hidden = game.time >= feedbackUntil;
  // Light a lane only where a note would actually be caught, so the cue never disagrees with the player.
  const inLane = (lane: number) => inReach(game.x, lane);
  document.querySelectorAll('[data-lane]').forEach(b => b.setAttribute('aria-pressed', String(inLane(Number((b as HTMLElement).dataset.lane)))));
  document.querySelectorAll('.catch-lanes>span').forEach((l, i) => l.classList.toggle('active', game.phase === 'playing' && inLane(i)));
  player.classList.toggle('in-lane', [0, 1, 2, 3].some(inLane));
  for (const note of game.chart) {
    const until = note.at - game.time;
    // Missed notes and dodged noise keep falling past the ring so it's visible they went by it.
    const fallingPast = note.result === 'missed' || note.result === 'passed';
    if ((note.settled && !(fallingPast && until > -.4)) || until > game.fallTime || game.phase === 'ready') {
      noteElements.get(note.id)?.remove(); noteElements.delete(note.id); continue;
    }
    let node = noteElements.get(note.id);
    if (!node) {
      node = document.createElement('span'); node.className = `falling-note ${note.kind}`;
      node.textContent = note.kind === 'note' ? '♪' : '×'; node.dataset.noteId = String(note.id);
      node.style.left = `${12.5 + note.lane * 25}%`; el('notes').append(node); noteElements.set(note.id, node);
    }
    node.classList.toggle('gone', fallingPast);
    node.style.top = `${5 + (1 - until / game.fallTime) * 67}%`;
  }
}

function updateDirection() { game.direction = (keys.has('ArrowRight') || keys.has('d') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('a') ? 1 : 0); if (!game.direction) game.target = game.x; }
window.addEventListener('keydown', e => {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (key === 'Escape' && !e.repeat) { e.preventDefault(); togglePause(); return; }
  if (game.phase !== 'playing') return;
  if (['ArrowLeft','ArrowRight','a','d'].includes(key)) { e.preventDefault(); keys.add(key); updateDirection(); }
  if (/^[1-4]$/.test(key)) { e.preventDefault(); keys.clear(); game.direction = 0; game.moveTo(Number(key) - 1); }
});
window.addEventListener('keyup', e => {
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (keys.delete(key)) updateDirection();
});
function point(e: PointerEvent) {
  const box = stage.getBoundingClientRect(); keys.clear(); game.direction = 0;
  game.moveTo(((e.clientX - box.left) / box.width - .125) * 4);
}
stage.onpointerdown = e => {
  if (game.phase !== 'playing' || pointer !== null) return;
  e.preventDefault(); pointer = e.pointerId; stage.setPointerCapture(e.pointerId); point(e); stage.focus({ preventScroll: true });
};
stage.onpointermove = e => { if (e.pointerId === pointer && game.phase === 'playing') point(e); };
stage.onpointerup = e => { if (pointer === e.pointerId) pointer = null; };
stage.onpointercancel = stage.onlostpointercapture = () => {
  // A normal pointerup already cleared the pointer: preserve its destination.
  // A cancelled drag must stop movement so an interrupted touch cannot stick.
  if (pointer !== null) { pointer = null; game.release(); }
};
document.querySelectorAll<HTMLButtonElement>('[data-lane]').forEach(b => b.onclick = () => { keys.clear(); game.direction = 0; game.moveTo(Number(b.dataset.lane)); });
pause.onclick = togglePause; el('restart').onclick = start;
el('sound').onclick = () => { sound = !sound; if (sound) unlockAudio(); else stopAudio(); updateSound(); };
function autoPause() { if (game.phase === 'playing') togglePause(); else release(); }
window.addEventListener('blur', autoPause); document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });
let previous = performance.now(); let frame = 0;
function tick(now: number) {
  const dt = Math.max(0, (now - previous) / 1000); previous = now;
  if (game.phase === 'playing') {
    for (const event of game.update(dt)) {
      if (event.kind === 'catch') { tone(event.pitch); burst(event.lane, 'catch'); feedback(game.combo >= 5 ? `${game.combo} 連擊！` : `+${100 + Math.min(10, game.combo - 1) * 10}`, 'good'); }
      if (event.kind === 'noise') { tone(0, true); burst(event.lane, 'noise'); feedback('雜音飄過，繼續加油', 'oops'); }
      if (event.kind === 'miss') feedback('下一個音符等你', 'miss');
      if (event.kind === 'complete') finish();
    }
    render();
  }
  frame = requestAnimationFrame(tick);
}
showPicker(); render(); frame = requestAnimationFrame(tick);
window.addEventListener('pagehide', () => { autoPause(); cancelAnimationFrame(frame); stopAudio(); void audio?.close(); audio = undefined; });
window.addEventListener('pageshow', e => { if (e.persisted) { previous = performance.now(); frame = requestAnimationFrame(tick); } });
if (import.meta.env.DEV) Object.defineProperty(window, '__catchState', { configurable: true, get: () => game.snapshot() });
