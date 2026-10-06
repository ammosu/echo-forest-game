import './style.css';
import './catch.css';
import { siteHeader } from './site-nav';
import { tr, localizeDocument } from './i18n';
import { mountGuide, guideButton } from './game-guide';
import { CatchGame, CATCH_REACH, inReach } from './catch-engine';
import characters from '../assets/characters.json';
import { mascotLabel, mascotTag } from './mascots';
import forest from '../assets/generated/forest-background.png';
import noteIcon from '../assets/ui/catch/note.png';
import noiseIcon from '../assets/ui/catch/noise.png';
import starIcon from '../assets/ui/catch/star.png';

const sprites = import.meta.glob('../assets/sprites/1x/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const sprite = (id: string) => sprites[`../assets/sprites/1x/${id}.png`];
const cast = ['anbo', 'anmi', 'anka', 'anzo'].map(id => characters.characters.find(c => c.id === id)!).map(c => ({ ...c, name: mascotLabel(c.id) }));
localizeDocument('Echo Forest — Note Catch', 'Move left and right with your forest friends to catch golden notes and finish a three-part morning song.');
const game = new CatchGame();
const phrases = tr(['晨光落下', '林間追光', '一起合奏'], ['Morning light', 'Chasing light', 'All together']);
let hero = cast[0];
let best = 0;
try { const saved = Number(localStorage.getItem('echo-catch-best')); if (Number.isFinite(saved) && saved > 0) best = saved; } catch {}
document.querySelector('#app')!.innerHTML = `
${siteHeader("catch")}
<main class="catch-main"><section class="catch-intro"><div><p class="chapter">${tr('晨光音樂會・48 秒的小小演出', 'Morning concert · a 48-second show')}</p><h1>${tr('接住森林的旋律。', 'Catch the forest\'s melody.')}</h1>${guideButton()}<p>${tr('左右移動，讓每一個音符都找到歸處。', 'Move left and right so every note finds a home.')}</p></div><div class="catch-record">${tr('本機最高分', 'Best score')}<strong id="best">${best.toLocaleString()}</strong></div></section>
<section class="catch-shell" aria-label="${tr('音符接接樂遊戲', 'Note Catch game')}" data-phase="ready">
  <div class="catch-toolbar"><span id="phrase">${tr('準備開演', 'Ready to begin')}</span><div><button id="sound" aria-pressed="true">${tr('♫ 聲音開', '♫ Sound on')}</button><button id="pause" disabled>${tr('暫停', 'Pause')}</button><button id="restart" disabled>${tr('重來', 'Restart')}</button></div></div>
  <div class="catch-hud"><div><small>${tr('合奏分數', 'Score')}</small><strong id="score">0</strong></div><div><small>${tr('接住音符', 'Caught')}</small><strong><span id="caught">0</span><small> / 48</small></strong></div><div><small>${tr('連續接住', 'Combo')}</small><strong id="combo">0</strong></div><div><small>${tr('剩餘時間', 'Time left')}</small><strong id="time">48<small>${tr(' 秒', 's')}</small></strong></div></div>
  <div class="catch-stage" id="stage" style="--forest:url('${forest}');--note:url('${noteIcon}');--noise:url('${noiseIcon}');--catch-zone:${CATCH_REACH * 2 * 25}cqw" tabindex="0" aria-label="${tr('音符舞台，左右方向鍵或 A D 移動，1 到 4 選擇位置，Escape 暫停', 'Note stage. Arrow keys or A D to move, 1 to 4 to pick a spot, Escape to pause')}">
    <div class="catch-sun" aria-hidden="true"></div><div class="catch-lanes" aria-hidden="true">${[1,2,3,4].map(i => `<span><b>${i}</b></span>`).join('')}</div>
    <div id="notes" aria-hidden="true"></div><div id="fx" aria-hidden="true"></div><div class="catch-line" aria-hidden="true"></div>
    <div class="catch-player" id="player" aria-hidden="true"><span id="feedback"></span><b class="catch-ring"></b><em class="catch-hint">${tr('接音點', 'Catch here')}</em><img id="hero" src="${sprite(hero.id)}" alt=""><i></i></div>
    <div class="catch-overlay" id="overlay"><div class="catch-panel" id="panel"></div></div>
  </div>
  <div class="catch-timeline" role="progressbar" aria-label="${tr('樂曲進度', 'Song progress')}" aria-valuemin="0" aria-valuemax="48" aria-valuenow="0"><i id="timeline"></i><span></span><span></span></div>
  <div class="catch-touch" aria-label="${tr('選擇接音符的位置', 'Pick where to catch')}">${[1,2,3,4].map(i => `<button data-lane="${i - 1}" aria-label="${tr(`移到第 ${i} 道`, `Move to lane ${i}`)}">${i}<span>♪</span></button>`).join('')}</div>
  <div class="catch-caption"><span>${tr('← → / A D 移動 · 1–4 選位置 · Esc 暫停', '← → / A D move · 1–4 pick spot · Esc pause')}</span><span>${tr('手機：拖曳舞台，或點下方位置', 'Phone: drag the stage or tap a spot below')}</span></div>
</section>
<section class="catch-guide"><div><b class="gold"><img src="${noteIcon}" alt=""></b><p><strong>${tr('金色音符，接住它', 'Golden notes: catch them')}</strong>${tr('音符落進腳下光圈就算接住，每個 100 分，連擊最高加成 100 分。', 'A note counts when it lands in the ring at your feet. 100 points each, plus up to 100 bonus for combos.')}</p></div><div><b class="noise"><img src="${noiseIcon}" alt=""></b><p><strong>${tr('灰色雜音，讓它飄過', 'Grey noise: let it pass')}</strong>${tr('穿過光圈中央才算碰到，碰到扣 50 分，漏接或碰雜音會中斷連擊。', 'It only hits you through the middle of the ring, costing 50 points. Missing a note or hitting noise breaks your combo.')}</p></div><div><b><img src="${starIcon}" alt=""></b><p><strong>${tr('慢慢熟悉，就能合奏', 'Practice makes music')}</strong>${tr('接住 12 / 28 個得一 / 二星；三星需接住 44 個，且碰雜音不超過 1 次。', 'Catch 12 / 28 for one / two stars. Three stars need 44 caught and no more than 1 noise hit.')}</p></div></section>
<p id="announcement" class="catch-sr" role="status" aria-live="polite"></p>
<footer><span>${tr('一點晨光，一首自己的小曲。', 'A little morning light, a little song of your own.')}</span><span>Echo Forest ✦</span></footer></main>`;

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
function updateSound() { el('sound').textContent = sound ? tr('♫ 聲音開', '♫ Sound on') : tr('♫ 聲音關', '♫ Sound off'); el('sound').setAttribute('aria-pressed', String(sound)); }
function release() { keys.clear(); pointer = null; game.release(); }
function setPhase() {
  document.querySelector('.catch-shell')!.setAttribute('data-phase', game.phase);
  pause.disabled = !['playing','paused'].includes(game.phase);
  pause.textContent = game.phase === 'paused' ? tr('繼續', 'Resume') : tr('暫停', 'Pause');
  el<HTMLButtonElement>('restart').disabled = game.phase === 'ready';
  document.querySelectorAll<HTMLButtonElement>('[data-lane]').forEach(b => b.disabled = game.phase !== 'playing');
}
function showPicker() {
  game.phase = 'ready'; release(); stopAudio(); overlay.hidden = false; setPhase();
  panel.innerHTML = `<p class="chapter">${tr('選一位夥伴，接住晨光', 'Pick a friend and catch the morning light')}</p><h2>${tr('音符接接樂', 'Note Catch')}</h2><p class="catch-legend"><span><img src="${noteIcon}" alt="">${tr('接住金色音符', 'Catch golden notes')}</span><span><img src="${noiseIcon}" alt="">${tr('避開灰色雜音', 'Dodge grey noise')}</span></p><p>${tr('後兩段需要跨格接音，留意旁邊的雜音。', 'In the last two parts you\'ll reach across lanes — watch for noise nearby.')}</p><div class="catch-picks" role="group" aria-label="${tr('選擇演奏夥伴', 'Pick a friend')}">${cast.map(c => `<button data-hero="${c.id}" aria-pressed="${c.id === hero.id}"><img src="${sprite(c.id)}" alt=""><span>${mascotTag(c.id)}</span></button>`).join('')}</div><button class="catch-primary" id="start">${tr('開始演奏', 'Start playing')}</button><small>${tr('角色能力相同 · 音效會在開始後播放', 'All friends play the same · sound starts after you begin')}</small>`;
  panel.querySelectorAll<HTMLButtonElement>('[data-hero]').forEach(b => b.onclick = () => {
    hero = cast.find(c => c.id === b.dataset.hero)!; el<HTMLImageElement>('hero').src = sprite(hero.id);
    panel.querySelectorAll('[data-hero]').forEach(p => p.setAttribute('aria-pressed', String(p === b)));
  });
  el('start').onclick = start;
}
function start() {
  stopAudio(); unlockAudio(); release(); game.start(); feedbackUntil = 0; lastPhrase = -1;
  noteElements.forEach(n => n.remove()); noteElements.clear(); el('fx').replaceChildren(); freezeUntil = 0;
  overlay.hidden = true; setPhase(); render(); stage.focus({ preventScroll: true });
  announce(tr('開始演奏，左右移動接住金色音符。', 'Go! Move left and right to catch golden notes.'));
}
function togglePause() {
  if (game.phase === 'playing') {
    game.pause(); release(); stopAudio(); overlay.hidden = false;
    panel.innerHTML = tr('<p class="chapter">在樹蔭下歇一會</p><h2>旋律會等你。</h2><p>準備好，再接住下一個音符。</p><button class="catch-primary" id="resume">繼續演奏</button>', '<p class="chapter">Resting in the shade</p><h2>The music will wait for you.</h2><p>When you\'re ready, catch the next note.</p><button class="catch-primary" id="resume">Keep playing</button>');
    el('resume').onclick = togglePause; el('resume').focus({ preventScroll: true }); announce(tr('遊戲已暫停。', 'Game paused.'));
  } else if (game.phase === 'paused') {
    unlockAudio(); game.resume(); overlay.hidden = true; stage.focus({ preventScroll: true }); announce(tr('繼續演奏。', 'Playing again.'));
  }
  setPhase();
}
function finish() {
  release(); stopAudio(); best = Math.max(best, game.score);
  try { localStorage.setItem('echo-catch-best', String(best)); } catch {}
  el('best').textContent = best.toLocaleString(); overlay.hidden = false; setPhase();
  const title = tr(['每個音符，都是新的開始。', '晨光聽見你了。', '森林跟著你唱歌。', '整座森林都在合奏！'], ['Every note is a fresh start.', 'The morning light heard you.', 'The forest is singing along.', 'The whole forest is playing with you!'])[game.stars];
  panel.innerHTML = `<p class="chapter">${tr('三段演出完成', 'Show complete')} · ${hero.name}</p><div class="catch-stars" aria-label="${tr(`${game.stars} 顆星，滿分 3 顆`, `${game.stars} of 3 stars`)}">${[0,1,2].map(i => `<img src="${starIcon}" alt="" class="${i < game.stars ? 'on' : ''}">`).join('')}</div><h2>${title}</h2><div class="catch-results"><span>${tr('合奏分數', 'Score')}<strong>${game.score.toLocaleString()}</strong></span><span>${tr('接住音符', 'Caught')}<strong>${game.caught} / ${game.total}</strong></span><span>${tr('最高連擊', 'Best combo')}<strong>${game.maxCombo}</strong></span></div><p class="catch-next">${nextGoal()}</p><p>${tr(`漏接 ${game.missed} 個音符 · 碰到 ${game.noises} 次雜音`, `Missed ${game.missed} notes · hit noise ${game.noises} times`)}</p><button class="catch-primary" id="again">${tr('再演奏一次', 'Play again')}</button><button class="catch-secondary" id="choose">${tr('換一位夥伴', 'Change friend')}</button>`;
  el('again').onclick = start; el('choose').onclick = showPicker; el('again').focus({ preventScroll: true });
  announce(tr(`演出完成，${game.caught} 個音符，${game.score} 分，${game.stars} 顆星。`, `Show complete: ${game.caught} notes, ${game.score} points, ${game.stars} stars.`));
}
function nextGoal() {
  if (game.stars >= 3) return tr('三顆星全拿，整座森林都記住了這首曲子。', 'All three stars — the whole forest will remember this song.');
  const goal = [12, 28, 44][game.stars];
  if (game.caught < goal) return tr(`再多接住 ${goal - game.caught} 個音符，就能拿到第 ${game.stars + 1} 顆星。`, `Catch ${goal - game.caught} more notes to earn star ${game.stars + 1}.`);
  return tr('音符都接到了！碰到雜音不超過 1 次就能拿到第三顆星。', 'You caught enough notes! Hit noise no more than once to earn the third star.');
}
function feedback(text: string, kind: string) {
  el('feedback').textContent = text; el('feedback').className = kind; feedbackUntil = game.time + .65;
}
/** Combo tier: 5 / 10 / 20 in a row each make the catch burst bigger and change its colours. */
const comboTier = () => game.combo >= 20 ? 3 : game.combo >= 10 ? 2 : game.combo >= 5 ? 1 : 0;
const sparkColors = [['#ffd45a', '#fff8d6'], ['#ffd45a', '#fff8d6'], ['#ffd45a', '#9ff3ff', '#fff8d6'], ['#ff9fb3', '#ffd45a', '#9ff3ff', '#c7a6ff', '#a6f0a0']];
let freezeUntil = 0;
/** Hitstop: hold the song for a few frames so a catch or a bump lands with weight. */
function hitstop(ms: number) { freezeUntil = Math.max(freezeUntil, performance.now() + ms); }
function shakeStage(kind: 'shake' | 'punch') {
  if (reducedMotion) return;
  stage.classList.remove('shake', 'punch'); void stage.offsetWidth; stage.classList.add(kind);
}
function milestone(text: string, tier: number) {
  const node = document.createElement('div');
  node.className = `catch-milestone t${tier}`; node.setAttribute('aria-hidden', 'true'); node.textContent = text;
  if (tier >= 2) { const flash = document.createElement('div'); flash.className = 'catch-flash'; el('fx').append(flash); setTimeout(() => flash.remove(), 400); }
  el('fx').append(node); setTimeout(() => node.remove(), 1100);
}
/** Catch burst on the ring: shockwave, sparks and the note popping up; noise gets a grey puff. */
function burst(lane: number, kind: 'catch' | 'noise') {
  const fx = document.createElement('div');
  const tier = kind === 'catch' ? comboTier() : 0;
  fx.className = `catch-fx ${kind} t${tier}${tier ? ' big' : ''}`;
  fx.style.left = `${12.5 + lane * 25}%`;
  const sparks = reducedMotion ? 0 : kind === 'noise' ? 6 : 8 + tier * 4;
  const colors = sparkColors[tier];
  fx.innerHTML = `${kind === 'catch' ? '<b class="flash"></b>' : ''}<b class="wave"></b>${tier >= 2 ? '<b class="wave second"></b>' : ''}${kind === 'catch' ? '<b class="pop"></b>' : ''}` +
    Array.from({ length: sparks }, (_, i) => `<i style="--a:${(i / sparks) * 360 + Math.random() * 20}deg;--d:${80 + tier * 18 + Math.random() * 35}px${kind === 'catch' ? `;--c:${colors[i % colors.length]}` : ''}"></i>`).join('');
  el('fx').append(fx);
  setTimeout(() => fx.remove(), 800);
}
function render() {
  player.style.left = `${12.5 + game.x * 25}%`;
  el('score').textContent = game.score.toLocaleString(); el('caught').textContent = String(game.caught);
  el('combo').textContent = String(game.combo); el('time').innerHTML = `${Math.ceil(game.duration - game.time)}<small>${tr(' 秒', 's')}</small>`;
  el('timeline').style.width = `${game.time / game.duration * 100}%`;
  document.querySelector('.catch-timeline')!.setAttribute('aria-valuenow', String(Math.floor(game.time)));
  if (game.phase !== 'ready' && lastPhrase !== game.phrase) {
    lastPhrase = game.phrase; el('phrase').textContent = `${game.phrase + 1} / 3 · ${phrases[game.phrase]}`;
    announce(tr(`第 ${game.phrase + 1} 樂段，${phrases[game.phrase]}。`, `Part ${game.phrase + 1}: ${phrases[game.phrase]}.`));
  }
  player.classList.toggle('catching', !reducedMotion && game.time < feedbackUntil && el('feedback').className === 'good');
  el('feedback').hidden = game.time >= feedbackUntil;
  // Light a lane only where a note would actually be caught, so the cue never disagrees with the player.
  const inLane = (lane: number) => inReach(game.x, lane);
  document.querySelectorAll('[data-lane]').forEach(b => b.setAttribute('aria-pressed', String(inLane(Number((b as HTMLElement).dataset.lane)))));
  document.querySelectorAll('.catch-lanes>span').forEach((l, i) => l.classList.toggle('active', game.phase === 'playing' && inLane(i)));
  player.classList.toggle('in-lane', [0, 1, 2, 3].some(inLane));
  player.dataset.tier = String(game.phase === 'playing' ? comboTier() : 0);
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
mountGuide({ id: 'catch', title: tr('音符接接樂', 'Note Catch'), onOpen: () => autoPause(), pages: [
  { icon: noteIcon, title: tr('金色音符，接住它', 'Golden notes: catch them'), body: tr('<p>音符落進腳下光圈就算接住，<b>每個 100 分</b>，連擊最高加成 100 分。</p><p>一局 48 秒，共三段旋律。</p>', '<p>A note counts when it lands in the ring at your feet: <b>100 points each</b>, plus up to 100 bonus for combos.</p><p>Each game is 48 seconds, in three parts.</p>') },
  { icon: noiseIcon, title: tr('灰色雜音，讓它飄過', 'Grey noise: let it pass'), body: tr('<p>穿過光圈中央才算碰到，<b>碰到扣 50 分</b>。</p><p>漏接或碰雜音都會中斷連擊。後兩段需要跨格接音，留意旁邊的雜音。</p>', '<p>Noise only hits you through the middle of the ring, and <b>costs 50 points</b>.</p><p>Missing a note or hitting noise breaks your combo. In the last two parts you\'ll reach across lanes — watch for noise nearby.</p>') },
  { icon: sprite('anmi'), title: tr('怎麼移動', 'How to move'), body: tr('<ul><li>手機：<b>拖曳舞台</b>，或點下方 1–4 位置</li><li>鍵盤：<kbd>←</kbd> <kbd>→</kbd> / <kbd>A</kbd> <kbd>D</kbd> 移動，<kbd>1</kbd>–<kbd>4</kbd> 選位置</li><li><kbd>Esc</kbd> 暫停</li></ul>', '<ul><li>Phone: <b>drag the stage</b>, or tap spots 1–4 below</li><li>Keyboard: <kbd>←</kbd> <kbd>→</kbd> / <kbd>A</kbd> <kbd>D</kbd> to move, <kbd>1</kbd>–<kbd>4</kbd> to pick a spot</li><li><kbd>Esc</kbd> to pause</li></ul>') },
  { icon: starIcon, title: tr('慢慢熟悉，就能合奏', 'Practice makes music'), body: tr('<p>接住 <b>12 / 28 個</b>得一 / 二星。</p><p>三星需接住 <b>44 個</b>，且碰雜音不超過 1 次。</p>', '<p>Catch <b>12 / 28</b> for one / two stars.</p><p>Three stars need <b>44 caught</b> and no more than 1 noise hit.</p>') },
] });
function autoPause() { if (game.phase === 'playing') togglePause(); else release(); }
window.addEventListener('blur', autoPause); document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });
let previous = performance.now(); let frame = 0;
function tick(now: number) {
  const dt = Math.max(0, (now - previous) / 1000); previous = now;
  if (game.phase === 'playing' && now < freezeUntil) render();
  else if (game.phase === 'playing') {
    for (const event of game.update(dt)) {
      if (event.kind === 'catch') {
        tone(event.pitch); burst(event.lane, 'catch');
        const tier = comboTier();
        if ([5, 10, 20, 30, 40].includes(game.combo)) {
          milestone(tr(`${game.combo} 連擊！`, `${game.combo} combo!`), tier); hitstop(90); shakeStage('punch');
        } else hitstop(tier >= 2 ? 60 : 40);
        feedback(game.combo >= 5 ? tr(`${game.combo} 連擊！`, `${game.combo} combo!`) : `+${100 + Math.min(10, game.combo - 1) * 10}`, 'good');
      }
      if (event.kind === 'noise') { tone(0, true); burst(event.lane, 'noise'); hitstop(70); shakeStage('shake'); feedback(tr('雜音飄過，繼續加油', 'Oops, noise! Keep going'), 'oops'); }
      if (event.kind === 'miss') feedback(tr('下一個音符等你', 'Next note\'s coming'), 'miss');
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
