import './style.css';
import './echo.css';
import { siteHeader } from './site-nav';
import { tr, localizeDocument } from './i18n';
import { mountGuide, guideButton } from './game-guide';
import { EchoGame, echoTiming } from './echo-engine';
import characters from '../assets/characters.json';
import { mascotLabel } from './mascots';
import forest from '../assets/generated/forest-background.png';
import finaleBadge from '../assets/ui/echo/finale-badge.png';

const images = import.meta.glob('../assets/sprites/1x/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const sprite = (id: string) => images[`../assets/sprites/1x/${id}.png`];
const gems = import.meta.glob('../assets/ui/echo/gem-*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const gem = (i: number) => gems[`../assets/ui/echo/gem-${i + 1}.png`];
const ids = ['anje', 'ansey', 'anka', 'anzo'];
const colors = ['#f3d484', '#bdb4ec', '#a9d5ad', '#91d5df'];
const shapes = ['✦', '◆', '●', '▲'];
const cast = ids.map(id => characters.characters.find(c => c.id === id)!).map(c => ({ ...c, name: mascotLabel(c.id) }));
const instrumentsEn: Record<string, string> = { anje: 'Moon bells', ansey: 'Violin', anka: 'Ukulele', anzo: 'Kalimba' };
const instrument = (c: typeof cast[number]) => tr(c.identity, instrumentsEn[c.id]);
localizeDocument('Echo Forest — Forest Echo', 'Listen to your forest friends play, answer in the same order, and finish the forest echo concert together.');
const game = new EchoGame();
let best = 0;
try { const saved = Number(localStorage.getItem('echo-memory-best')); if (Number.isFinite(saved)) best = Math.max(0, Math.min(8, saved)); } catch {}

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  ${siteHeader("echo")}
  <main class="echo-main">
    <section class="echo-intro"><div><p class="chapter">${tr('林間小舞台・記憶合奏', 'Forest stage · Memory concert')}</p><h1>${tr('森林回音', 'Forest Echo')}</h1>${guideButton()}<p>${tr('聽一段旋律，讓森林聽見你的回應。', 'Hear a tune, then let the forest hear your answer.')}</p></div><div class="echo-best">${tr('最長合奏', 'Longest concert')}<strong><span id="best">${best}</span><small>${tr(' / 8 段', ' / 8 rounds')}</small></strong></div></section>
    <section class="echo-concert" aria-label="${tr('森林回音遊戲', 'Forest Echo game')}" data-phase="ready">
      <div class="echo-toolbar"><span id="round">${tr('準備開演', 'Ready to begin')}</span><div><button id="sound" aria-pressed="true">${tr('♫ 聲音開', '♫ Sound on')}</button><button id="pause" disabled>${tr('暫停', 'Pause')}</button><button id="restart" disabled>${tr('重新開始', 'Restart')}</button></div></div>
      <div class="echo-stage" style="--forest:url('${forest}')">
        
        <div class="echo-conductor"><img src="${sprite('owl')}" alt="${tr('指揮 貓頭鷹老師', 'Conductor Owl')}"><span>${tr('貓頭鷹老師的林間音樂會', 'Owl\'s forest concert')}</span></div>
        <div class="echo-message" role="status" aria-live="polite" aria-atomic="true"><img class="echo-finale" src="${finaleBadge}" alt="" aria-hidden="true"><span id="phase-label">${tr('跟著夥伴，一起演奏', 'Play along with your friends')}</span><h2 id="message">${tr('每一道回音，都是一份默契。', 'Every echo is a little teamwork.')}</h2><p id="detail">${tr('記住亮起的夥伴，再依相同順序點選。從兩個音開始。', 'Remember who lights up, then tap them in the same order. We start with two notes.')}</p></div>
        <div class="echo-musicians">${cast.map((c, i) => `<button class="echo-musician" data-note="${i}" style="--note-color:${colors[i]}" aria-label="${i + 1} ${c.name} ${instrument(c)}" aria-disabled="false"><span class="echo-note" aria-hidden="true"><img src="${gem(i)}" alt=""></span><span class="echo-portrait"><img src="${sprite(c.id)}" alt=""></span><span class="echo-plinth" aria-hidden="true"></span><strong>${c.name}</strong><span class="echo-instrument">${instrument(c)}</span><kbd>${i + 1}</kbd></button>`).join('')}</div>
        <div class="echo-progress" id="progress" aria-label="${tr('尚未開始', 'Not started')}"></div>
      </div>
      <div class="echo-controls"><button class="echo-primary" id="action">${tr('開始合奏', 'Start concert')}</button><button id="replay" disabled>${tr('再聽一次', 'Listen again')}</button><span id="input-count">${tr('開始前，點夥伴試聽聲音', 'Tap a friend to hear their sound first')}</span></div>
    </section>
    <section class="echo-guide" aria-label="${tr('玩法說明', 'How to play')}"><div><span>${tr('聽', 'Listen')}</span><p>${tr('看夥伴依序亮起，<br>記住演奏順序。', 'Watch your friends light up<br>and remember the order.')}</p></div><div><span>${tr('回應', 'Answer')}</span><p>${tr('點選夥伴或按 1–4，<br>照順序把旋律接回來。', 'Tap friends or press 1–4<br>to play the tune back in order.')}</p></div><div><span>${tr('合奏', 'Concert')}</span><p>${tr('每段增加一個音。<br>忘記也沒關係，隨時重聽。', 'Each round adds one note.<br>Forgot? Just listen again.')}</p></div></section>
    <footer><span>${tr('不趕時間，森林會等你。<br>聲音為合成音色；關閉聲音也能跟著燈光玩。', 'No rush — the forest will wait for you.<br>Sounds are synthesized; you can also play with sound off by following the lights.')}</span><span>Echo Forest ✦</span></footer>
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

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Notes answered in a row without a mistake; 5 / 12 / 25 raise the burst tier. */
let streak = 0;
const streakTier = () => streak >= 25 ? 3 : streak >= 12 ? 2 : streak >= 5 ? 1 : 0;
const stageEl = () => document.querySelector<HTMLElement>('.echo-stage')!;
function react(kind: 'punch' | 'shake') {
  if (reducedMotion) return;
  const stage = stageEl(); stage.classList.remove('punch', 'shake'); void stage.offsetWidth; stage.classList.add(kind);
}
function banner(text: string, big = false) {
  const node = document.createElement('div');
  node.className = `echo-banner${big ? ' big' : ''}`; node.setAttribute('aria-hidden', 'true'); node.textContent = text;
  const flash = document.createElement('div'); flash.className = 'echo-flash';
  stageEl().append(flash, node);
  setTimeout(() => { node.remove(); flash.remove(); }, 1300);
}
/** Musicians hop one after another, like a wave through the band. */
function hop() {
  if (reducedMotion) return;
  buttons.forEach((b, i) => later(() => { b.classList.remove('echo-hop'); void b.offsetWidth; b.classList.add('echo-hop'); }, i * 90));
}
/** Touch feedback on a musician: sparks and a check for a right note, a grey shake for a wrong one. */
function burst(index: number, kind: 'correct' | 'round' | 'wrong') {
  const fx = document.createElement('span');
  const tier = kind === 'wrong' ? 0 : streakTier();
  fx.className = `echo-fx ${kind} t${tier}`; fx.setAttribute('aria-hidden', 'true');
  const sparks = reducedMotion ? 0 : kind === 'wrong' ? 5 : (kind === 'round' ? 14 : 8) + tier * 4;
  const rainbow = ['#ff9fb3', '#ffd45a', '#9ff3ff', '#c7a6ff', '#a6f0a0'];
  fx.innerHTML = `<b class="wave"></b>${tier >= 2 ? '<b class="wave second"></b>' : ''}<b class="mark">${kind === 'wrong' ? '×' : kind === 'round' ? '♪♪' : tier ? `♪×${streak}` : '♪'}</b>` +
    Array.from({ length: sparks }, (_, i) => `<i style="--a:${(i / sparks) * 360 + Math.random() * 20}deg;--d:${(kind === 'round' ? 90 : 60) + tier * 15 + Math.random() * 25}px${tier >= 3 ? `;--c:${rainbow[i % rainbow.length]}` : ''}"></i>`).join('');
  buttons[index].append(fx);
  if (kind === 'wrong' && !reducedMotion) { buttons[index].classList.remove('echo-shake'); void buttons[index].offsetWidth; buttons[index].classList.add('echo-shake'); }
  setTimeout(() => { fx.remove(); buttons[index].classList.remove('echo-shake'); }, 800);
}

function message(label: string, heading: string, detail: string) {
  el('phase-label').textContent = label; el('message').textContent = heading; el('detail').textContent = detail;
}

function render() {
  const phase = game.phase;
  document.querySelector('.echo-concert')!.setAttribute('data-phase', phase);
  el('round').textContent = game.round ? tr(`第 ${game.round} / 8 段 · ${game.sequence.length} 個音`, `Round ${game.round} / 8 · ${game.sequence.length} notes`) : tr('準備開演', 'Ready to begin');
  pause.disabled = ['ready', 'complete'].includes(phase);
  pause.textContent = phase === 'paused' ? tr('繼續', 'Resume') : tr('暫停', 'Pause');
  restart.disabled = phase === 'ready';
  replay.disabled = !['answer', 'retry'].includes(phase);
  action.disabled = ['listen', 'answer'].includes(phase);
  action.textContent = tr({ ready: '開始合奏', listen: '夥伴演奏中…', answer: '輪到你了', retry: '再試這一段', between: '接下一段', paused: '繼續合奏', complete: '再合奏一次' }, { ready: 'Start concert', listen: 'Friends are playing…', answer: 'Your turn', retry: 'Try this round again', between: 'Next round', paused: 'Resume concert', complete: 'Play again' })[phase];
  buttons.forEach(b => b.setAttribute('aria-disabled', String(!['ready', 'answer', 'complete'].includes(phase))));
  const count = phase === 'answer' || phase === 'between' || phase === 'complete' ? game.cursor : 0;
  el('input-count').textContent = tr({ ready: '開始前，點夥伴試聽聲音', listen: '先聽旋律，稍後換你', answer: `已回應 ${count} / ${game.sequence.length} 個音`, retry: '按「再試這一段」重聽同一段', between: '準備好就接下一段', paused: '繼續時會從頭重播這一段', complete: '想再挑戰，就再合奏一次' }, { ready: 'Tap a friend to hear their sound first', listen: 'Listen first — your turn is next', answer: `Answered ${count} / ${game.sequence.length} notes`, retry: 'Press \"Try this round again\" to hear it again', between: 'Go to the next round when ready', paused: 'This round replays from the start', complete: 'Up for more? Play again' })[phase];
  el('progress').innerHTML = Array.from({ length: game.sequence.length }, (_, i) => `<span class="${i < count ? 'filled' : ''}">${i < count ? '♪' : '·'}</span>`).join('');
  el('progress').setAttribute('aria-label', tr(`已回應 ${count} / ${game.sequence.length} 個音`, `Answered ${count} / ${game.sequence.length} notes`));
}

function playback() {
  cancel(); game.listen(); render();
  if (game.round === 1 && matchMedia('(max-width:540px)').matches) document.querySelector('.echo-concert')!.scrollIntoView({ block: 'end', behavior: 'instant' });
  const timing = echoTiming(game.round);
  message(tr('先聽聽', 'Listen'), tr('夥伴正在演奏…', 'Your friends are playing…'), tr('記住亮起的順序；第三段起節奏逐漸加快。', 'Remember the order they light up. From round 3 the beat gets faster.'));
  game.sequence.forEach((note, i) => later(() => {
    flash(note, timing.flash);
    el('detail').textContent = `${i + 1} / ${game.sequence.length} · ${cast[note].name} ${shapes[note]}`;
  }, 650 + i * timing.beat));
  later(() => {
    game.phase = 'answer'; render();
    message(tr('換你回應', 'Your turn'), tr('把剛才的旋律，接回來。', 'Play that tune back.'), tr('點選夥伴，或按鍵盤 1、2、3、4。不用趕時間。', 'Tap friends or press 1, 2, 3, 4. Take your time.'));
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
  if (outcome === 'wrong') { streak = 0; react('shake'); }
  else if (outcome !== 'ignored') streak++;
  if (outcome !== 'ignored') burst(index, outcome === 'wrong' ? 'wrong' : outcome === 'correct' ? 'correct' : 'round');
  if (outcome === 'round') { banner(tr(`第 ${game.round} 段完成！`, `Round ${game.round} done!`)); react('punch'); hop(); }
  if (outcome === 'complete') { banner(tr('八段全部完成！', 'All 8 rounds done!'), true); react('punch'); hop(); }
  if (outcome === 'wrong') message(tr('再聽一遍就好', 'Just listen once more'), tr('沒關係，我們一起再試試。', 'That\'s okay, let\'s try again together.'), tr('按「再試這一段」重聽相同旋律，已完成的段落會保留。', 'Press \"Try this round again\" to hear the same tune. Finished rounds are kept.'));
  if (outcome === 'round') {
    saveBest();
    message(tr('接住回音了', 'You caught the echo'), tr('就是這段旋律！', 'That\'s the tune!'), tr('準備好就接下一段，夥伴會再多演奏一個音。', 'Go on when you\'re ready — your friends will add one more note.'));
  }
  if (outcome === 'complete') {
    saveBest();
    message(tr('八段合奏完成', 'Concert complete'), tr('森林聽見我們了！', 'The forest heard us!'), tr('從兩個音到九個音，你把整段回音都接回來了。', 'From two notes to nine, you played back every echo.'));
    later(() => buttons.forEach((_, i) => flash(i)), 700);
  }
}

function togglePause() {
  if (['ready', 'complete'].includes(game.phase)) return;
  if (game.phase === 'paused') {
    unlockAudio();
    if (pausedPhase === 'between') {
      game.phase = 'between'; render(); message(tr('接住回音了', 'You caught the echo'), tr('準備好，再接下一段。', 'Get ready for the next round.'), tr('按「接下一段」，讓夥伴加入一個新音。', 'Press \"Next round\" and your friends will add a new note.'));
    } else playback();
  } else {
    pausedPhase = game.phase; cancel(); game.phase = 'paused'; render();
    message(tr('在樹蔭下歇一會', 'Resting in the shade'), tr('森林會等你。', 'The forest will wait for you.'), tr('繼續時會重新演奏這一段，不用擔心忘記。', 'This round plays again when you resume, so don\'t worry about forgetting.'));
  }
}

action.onclick = () => {
  unlockAudio();
  if (game.phase === 'paused') return togglePause();
  if (game.phase === 'ready' || game.phase === 'complete') { game.start(); streak = 0; }
  else if (game.phase === 'between') game.next();
  else if (game.phase !== 'retry') return;
  playback();
};
restart.onclick = () => { unlockAudio(); game.start(); streak = 0; playback(); };
replay.onclick = () => { if (['answer', 'retry'].includes(game.phase)) { unlockAudio(); playback(); } };
pause.onclick = togglePause;
buttons.forEach((b, i) => b.onclick = () => play(i));
function updateSound() {
  el('sound').textContent = sound ? tr('♫ 聲音開', '♫ Sound on') : tr('♫ 聲音關', '♫ Sound off');
  el('sound').setAttribute('aria-pressed', String(sound));
}
el('sound').onclick = () => { sound = !sound; if (sound) unlockAudio(); else { voices.forEach(v => { try { v.stop(); } catch {} }); voices.clear(); } updateSound(); };
window.addEventListener('keydown', e => {
  if (e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
  if (/^[1-4]$/.test(e.key)) { e.preventDefault(); play(Number(e.key) - 1); }
  if (e.key === 'Escape') { e.preventDefault(); togglePause(); }
});
mountGuide({ id: 'echo', title: tr('森林回音', 'Forest Echo'), onOpen: () => autoPause(), pages: [
  { icon: sprite('owl'), title: tr('聽', 'Listen'), body: tr('<p>貓頭鷹老師指揮時，四位夥伴會<b>依序亮起並發出聲音</b>。</p><p>專心記住誰先、誰後。</p>', '<p>When Owl conducts, four friends <b>light up and play one by one</b>.</p><p>Remember who goes first and who comes next.</p>') },
  { icon: '♫', title: tr('回應', 'Answer'), body: tr('<p>輪到你時，<b>照同樣順序點選夥伴</b>，或按鍵盤 <kbd>1</kbd>–<kbd>4</kbd>。</p><p>開始前可以先點夥伴試聽音色。</p>', '<p>On your turn, <b>tap the friends in the same order</b>, or press <kbd>1</kbd>–<kbd>4</kbd>.</p><p>Before starting, tap a friend to hear their sound.</p>') },
  { icon: gem(0), title: tr('合奏', 'Concert'), body: tr('<p>每完成一段就<b>多加一個音</b>，最多 8 段。</p><p>忘記也沒關係，按「再聽一次」隨時重聽。關閉聲音也能跟著燈光玩。</p>', '<p>Each round you finish <b>adds one more note</b>, up to 8 rounds.</p><p>Forgot? Press \"Listen again\" any time. You can also play with sound off by following the lights.</p>') },
] });
function autoPause() { if (!['ready', 'paused', 'complete'].includes(game.phase)) togglePause(); }
window.addEventListener('blur', autoPause);
document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });
window.addEventListener('pagehide', () => { cancel(); void audio?.close(); });
render();
