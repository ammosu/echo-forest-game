import './style.css';
import './echo.css';
import { EchoGame, echoTiming } from './echo-engine';
import characters from '../assets/characters.json';
import forest from '../assets/generated/forest-background.png';

const images = import.meta.glob('../assets/sprites/1x/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const sprite = (id: string) => images[`../assets/sprites/1x/${id}.png`];
const ids = ['anje', 'ansey', 'anka', 'anzo'];
const colors = ['#f3d484', '#bdb4ec', '#a9d5ad', '#91d5df'];
const shapes = ['✦', '◆', '●', '▲'];
const cast = ids.map(id => characters.characters.find(c => c.id === id)!);
const game = new EchoGame();
let best = 0;
try { const saved = Number(localStorage.getItem('echo-memory-best')); if (Number.isFinite(saved)) best = Math.max(0, Math.min(8, saved)); } catch {}

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header class="site-header"><a class="brand" href="./forest.html"><span class="brand-tree" aria-hidden="true"></span><span>echo forest<small>回聲森林遊樂場</small></span></a><nav aria-label="遊戲選單"><a class="nav-button" href="./forest.html">森林地圖</a><a class="nav-button" href="./">森林冒險</a><a class="nav-button" href="./race.html">森林賽車</a><a class="nav-button" href="./defense.html">爆破保衛戰</a><span class="nav-current" aria-current="page">森林回音</span><a class="nav-button" href="./catch.html">音符接接樂</a></nav></header>
  <main class="echo-main">
    <section class="echo-intro"><div><p class="chapter">林間小舞台・記憶合奏</p><h1>森林回音</h1><p>聽一段旋律，讓森林聽見你的回應。</p></div><div class="echo-best">最長合奏<strong><span id="best">${best}</span><small> / 8 段</small></strong></div></section>
    <section class="echo-concert" aria-label="森林回音遊戲" data-phase="ready">
      <div class="echo-toolbar"><span id="round">準備開演</span><div><button id="sound" aria-pressed="true">♫ 聲音開</button><button id="pause" disabled>暫停</button><button id="restart" disabled>重新開始</button></div></div>
      <div class="echo-stage" style="--forest:url('${forest}')">
        <div class="echo-moon" aria-hidden="true"></div>
        <div class="echo-conductor"><img src="${sprite('owl')}" alt="指揮 Owl"><span>Owl 的林間音樂會</span></div>
        <div class="echo-message" role="status" aria-live="polite" aria-atomic="true"><span id="phase-label">跟著夥伴，一起演奏</span><h2 id="message">每一道回音，都是一份默契。</h2><p id="detail">記住亮起的夥伴，再依相同順序點選。從兩個音開始。</p></div>
        <div class="echo-musicians">${cast.map((c, i) => `<button class="echo-musician" data-note="${i}" style="--note-color:${colors[i]}" aria-label="${i + 1} ${c.name} ${c.identity}" aria-disabled="false"><span class="echo-note" aria-hidden="true">${shapes[i]}</span><span class="echo-portrait"><img src="${sprite(c.id)}" alt=""></span><span class="echo-plinth" aria-hidden="true"></span><strong>${c.name}</strong><span class="echo-instrument">${c.identity}</span><kbd>${i + 1}</kbd></button>`).join('')}</div>
        <div class="echo-progress" id="progress" aria-label="尚未開始"></div>
      </div>
      <div class="echo-controls"><button class="echo-primary" id="action">開始合奏</button><button id="replay" disabled>再聽一次</button><span id="input-count">開始前，點夥伴試聽聲音</span></div>
    </section>
    <section class="echo-guide" aria-label="玩法說明"><div><span>聽</span><p>看夥伴依序亮起，<br>記住演奏順序。</p></div><div><span>回應</span><p>點選夥伴或按 1–4，<br>照順序把旋律接回來。</p></div><div><span>合奏</span><p>每段增加一個音。<br>忘記也沒關係，隨時重聽。</p></div></section>
    <footer><span>不趕時間，森林會等你。<br>聲音為合成音色；關閉聲音也能跟著燈光玩。</span><span>Echo Forest ✦</span></footer>
  </main>`;

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.echo-musician'));
const action = el<HTMLButtonElement>('action');
const pause = el<HTMLButtonElement>('pause');
const replay = el<HTMLButtonElement>('replay');
const restart = el<HTMLButtonElement>('restart');
let audio: AudioContext | undefined;
let sound = true;
let epoch = 0;
const timers = new Set<ReturnType<typeof setTimeout>>();
const voices = new Set<OscillatorNode>();
let pausedPhase = game.phase;

function later(fn: () => void, ms: number) {
  const token = epoch;
  const timer = setTimeout(() => { timers.delete(timer); if (token === epoch) fn(); }, ms);
  timers.add(timer);
}

function cancel() {
  epoch++;
  timers.forEach(clearTimeout); timers.clear();
  buttons.forEach(b => b.classList.remove('singing'));
  voices.forEach(v => { try { v.stop(); } catch {} }); voices.clear();
}

function unlockAudio() {
  if (!sound) return;
  try { audio ??= new AudioContext(); void audio.resume().catch(() => {}); } catch { sound = false; updateSound(); }
}

function tone(index: number, duration = .48) {
  if (!sound || !audio || audio.state !== 'running') return;
  const now = audio.currentTime;
  const frequencies = [523.25, 659.25, 783.99, 1046.5];
  // Distinct, soft synthetic timbres; no external recordings or audio downloads.
  for (let harmonic = 1; harmonic <= 3; harmonic++) {
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = index === 1 ? 'triangle' : 'sine';
    oscillator.frequency.value = frequencies[index] * harmonic;
    const volume = .09 / (harmonic * harmonic);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + (index === 1 ? .07 : .012));
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    oscillator.connect(gain); gain.connect(audio.destination);
    voices.add(oscillator);
    oscillator.onended = () => { voices.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(now); oscillator.stop(now + duration + .02);
  }
}

const flashes = [0, 0, 0, 0];
function flash(index: number, duration = 470) {
  const flashId = ++flashes[index];
  buttons[index].classList.add('singing'); tone(index, duration / 1000);
  later(() => { if (flashId === flashes[index]) buttons[index].classList.remove('singing'); }, duration);
}

function message(label: string, heading: string, detail: string) {
  el('phase-label').textContent = label; el('message').textContent = heading; el('detail').textContent = detail;
}

function render() {
  const phase = game.phase;
  document.querySelector('.echo-concert')!.setAttribute('data-phase', phase);
  el('round').textContent = game.round ? `第 ${game.round} / 8 段 · ${game.sequence.length} 個音` : '準備開演';
  pause.disabled = ['ready', 'complete'].includes(phase);
  pause.textContent = phase === 'paused' ? '繼續' : '暫停';
  restart.disabled = phase === 'ready';
  replay.disabled = !['answer', 'retry'].includes(phase);
  action.disabled = ['listen', 'answer'].includes(phase);
  action.textContent = ({ ready: '開始合奏', listen: '夥伴演奏中…', answer: '輪到你了', retry: '再試這一段', between: '接下一段', paused: '繼續合奏', complete: '再合奏一次' })[phase];
  buttons.forEach(b => b.setAttribute('aria-disabled', String(!['ready', 'answer', 'complete'].includes(phase))));
  const count = phase === 'answer' || phase === 'between' || phase === 'complete' ? game.cursor : 0;
  el('input-count').textContent = phase === 'ready' ? '開始前，點夥伴試聽聲音' : phase === 'answer' ? `已回應 ${count} / ${game.sequence.length} 個音` : phase === 'paused' ? '繼續時會從頭重播這一段' : '鍵盤 1–4 演奏 · Esc 暫停';
  el('progress').innerHTML = Array.from({ length: game.sequence.length }, (_, i) => `<span class="${i < count ? 'filled' : ''}">${i < count ? '♪' : '·'}</span>`).join('');
  el('progress').setAttribute('aria-label', `已回應 ${count} / ${game.sequence.length} 個音`);
}

function playback() {
  cancel(); game.listen(); render();
  const timing = echoTiming(game.round);
  message('先聽聽', '夥伴正在演奏…', '記住亮起的順序；第三段起節奏逐漸加快。');
  game.sequence.forEach((note, i) => later(() => {
    flash(note, timing.flash);
    el('detail').textContent = `${i + 1} / ${game.sequence.length} · ${cast[note].name} ${shapes[note]}`;
  }, 650 + i * timing.beat));
  later(() => {
    game.phase = 'answer'; render();
    message('換你回應', '把剛才的旋律，接回來。', '點選夥伴，或按鍵盤 1、2、3、4。不用趕時間。');
  }, 650 + game.sequence.length * timing.beat);
}

function saveBest() {
  best = Math.max(best, game.completed); el('best').textContent = String(best);
  try { localStorage.setItem('echo-memory-best', String(best)); } catch {}
}

function play(index: number) {
  if (!['ready', 'answer', 'complete'].includes(game.phase)) return;
  unlockAudio(); flash(index);
  if (game.phase !== 'answer') return;
  const outcome = game.answer(index);
  render();
  if (outcome === 'wrong') message('再聽一遍就好', '沒關係，我們一起再試試。', '按「再試這一段」重聽相同旋律，已完成的段落會保留。');
  if (outcome === 'round') {
    saveBest();
    message('接住回音了', '就是這段旋律！', '準備好就接下一段，夥伴會再多演奏一個音。');
  }
  if (outcome === 'complete') {
    saveBest();
    message('八段合奏完成', '森林聽見我們了！', '從兩個音到九個音，你把整段回音都接回來了。');
    later(() => buttons.forEach((_, i) => flash(i)), 700);
  }
}

function togglePause() {
  if (['ready', 'complete'].includes(game.phase)) return;
  if (game.phase === 'paused') {
    unlockAudio();
    if (pausedPhase === 'between') {
      game.phase = 'between'; render(); message('接住回音了', '準備好，再接下一段。', '按「接下一段」，讓夥伴加入一個新音。');
    } else playback();
  } else {
    pausedPhase = game.phase; cancel(); game.phase = 'paused'; render();
    message('在樹蔭下歇一會', '森林會等你。', '繼續時會重新演奏這一段，不用擔心忘記。');
  }
}

action.onclick = () => {
  unlockAudio();
  if (game.phase === 'paused') return togglePause();
  if (game.phase === 'ready' || game.phase === 'complete') game.start();
  else if (game.phase === 'between') game.next();
  else if (game.phase !== 'retry') return;
  playback();
};
restart.onclick = () => { unlockAudio(); game.start(); playback(); };
replay.onclick = () => { if (['answer', 'retry'].includes(game.phase)) { unlockAudio(); playback(); } };
pause.onclick = togglePause;
buttons.forEach((b, i) => b.onclick = () => play(i));
function updateSound() {
  el('sound').textContent = sound ? '♫ 聲音開' : '♫ 聲音關';
  el('sound').setAttribute('aria-pressed', String(sound));
}
el('sound').onclick = () => { sound = !sound; if (sound) unlockAudio(); else { voices.forEach(v => { try { v.stop(); } catch {} }); voices.clear(); } updateSound(); };
window.addEventListener('keydown', e => {
  if (e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
  if (/^[1-4]$/.test(e.key)) { e.preventDefault(); play(Number(e.key) - 1); }
  if (e.key === 'Escape') { e.preventDefault(); togglePause(); }
});
function autoPause() { if (!['ready', 'paused', 'complete'].includes(game.phase)) togglePause(); }
window.addEventListener('blur', autoPause);
document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });
window.addEventListener('pagehide', () => { cancel(); void audio?.close(); });
render();
