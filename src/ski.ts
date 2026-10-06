import './style.css';
import './ski.css';
import { siteHeader } from './site-nav';
import { tr, localizeDocument } from './i18n';
import { mountGuide, guideButton } from './game-guide';
import { mountJoystick } from './joystick';
import { SkiGame, COURSE_LENGTH, MISS_PENALTY, sections, autopilot, type SkiEvent } from './ski-engine';
import { SkiView } from './ski-view';
import characters from '../assets/characters.json';
import { mascotLabel, mascotTag } from './mascots';
import noteIcon from '../assets/ui/catch/note.png';
import starIcon from '../assets/ui/catch/star.png';

const fronts = import.meta.glob('../assets/sprites/1x/{anje,anbo,anmi,anbi}.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const backs = import.meta.glob('../assets/sprites/extras/{anje_ski_back,anbo_back,anmi_back,anbi_back}.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const front = (id: string) => fronts[`../assets/sprites/1x/${id}.png`];
const back = (id: string) => backs[`../assets/sprites/extras/${id === 'anje' ? 'anje_ski' : id}_back.png`];
const cast = ['anje', 'anbo', 'anmi', 'anbi'].map(id => characters.characters.find(c => c.id === id)!).map(c => ({ ...c, name: mascotLabel(c.id) }));
localizeDocument('Echo Forest — Snowy Forest Run', 'Ski down the snowy forest with a friend: carve through gates, collect notes and fly off the icefall jumps.');

const game = new SkiGame();
let hero = cast[0];
let best = 0;
try { const saved = Number(localStorage.getItem('echo-ski-best')); if (Number.isFinite(saved) && saved > 0) best = saved; } catch {}
const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
const sectionName = (i: number) => tr(sections[i].name, sections[i].nameEn);

document.querySelector('#app')!.innerHTML = `
${siteHeader('ski')}
<main class="ski-main"><section class="ski-intro"><div><p class="chapter">${tr('雪林山頂・1,050 公尺滑降', 'Snowy summit · a 1,050 m run')}</p><h1>${tr('穿過旗門，一路滑下山。', 'Carve the gates all the way down.')}</h1>${guideButton()}<p>${tr('左右轉彎、壓低加速，在冰瀑跳台上翻個筋斗。', 'Turn, tuck for speed, and flip off the icefall jumps.')}</p></div><div class="ski-record">${tr('本機最佳時間', 'Best time')}<strong id="best">${best ? fmt(best) : '—'}</strong></div></section>
<section class="ski-shell" aria-label="${tr('雪林滑降遊戲', 'Snowy Forest Run game')}" data-phase="ready">
  <div class="ski-toolbar"><span id="section">${tr('準備出發', 'Ready to go')}</span><div><button id="sound" aria-pressed="true">${tr('♫ 聲音開', '♫ Sound on')}</button><button id="pause" disabled>${tr('暫停', 'Pause')}</button><button id="restart" disabled>${tr('重來', 'Restart')}</button></div></div>
  <div class="ski-hud"><div><small>${tr('時間', 'Time')}</small><strong id="time">0:00.0</strong><em id="penalty"></em></div><div><small>${tr('速度', 'Speed')}</small><strong><span id="speed">0</span><small> km/h</small></strong></div><div><small>${tr('旗門', 'Gates')}</small><strong><span id="gates">0</span><small> / ${game.totalGates}</small></strong></div><div><small>${tr('音符', 'Notes')}</small><strong><span id="notes">0</span><small> / ${game.totalNotes}</small></strong></div></div>
  <div class="ski-stage" id="stage" tabindex="0" aria-label="${tr('滑雪場，左右方向鍵轉彎，上鍵壓低加速，下鍵煞車，空白鍵在空中做特技，Escape 暫停', 'Ski slope. Left and right to turn, up to tuck, down to brake, Space for a trick in the air, Escape to pause')}">
    <canvas id="view" aria-hidden="true"></canvas>
    <div class="ski-countdown" id="countdown" aria-hidden="true"></div>
    <div class="ski-feedback" id="feedback" aria-hidden="true"></div>
    <div class="ski-air" id="air" aria-hidden="true">${tr('空中！按 空白鍵／特技 翻轉', 'Airborne! Space / Trick to flip')}</div>
    <div class="ski-overlay" id="overlay"><div class="ski-panel" id="panel"></div></div>
  </div>
  <div class="ski-progress" role="progressbar" aria-label="${tr('滑降進度', 'Run progress')}" aria-valuemin="0" aria-valuemax="${COURSE_LENGTH}" aria-valuenow="0">${sections.slice(1).map(s => `<span style="left:${s.from / COURSE_LENGTH * 100}%"></span>`).join('')}<i id="progress"></i><b id="progress-dot"></b></div>
  <div class="ski-touch" aria-label="${tr('觸控操作', 'Touch controls')}"><div id="stick"></div><span>${tr('上推壓低 · 下拉煞車／停下時後退', 'Up to tuck · down to brake or back up')}</span><button id="trick" type="button">${tr('特技', 'Trick')}</button></div>
  <div class="ski-caption"><span><kbd>←</kbd> <kbd>→</kbd> ${tr('轉彎', 'turn')} · <kbd>↑</kbd> ${tr('壓低加速', 'tuck')} · <kbd>↓</kbd> ${tr('煞車／後退', 'brake / back up')} · <kbd>Space</kbd> ${tr('空中特技', 'air trick')} · <kbd>Esc</kbd> ${tr('暫停', 'pause')}</span><span>${tr(`漏掉旗門 +${MISS_PENALTY} 秒`, `Missed gate +${MISS_PENALTY}s`)}</span></div>
</section>
<section class="ski-guide"><div><b class="flag"></b><p><strong>${tr('穿過紅藍旗門', 'Ski through the red and blue gates')}</strong>${tr(`從兩支旗桿中間滑過才算數，漏掉一個加 ${MISS_PENALTY} 秒。頭上的金色箭頭指著下一個旗門。`, `Only between the two poles counts; each missed gate adds ${MISS_PENALTY} seconds. The gold arrow points at the next one.`)}</p></div><div><b><img src="${noteIcon}" alt=""></b><p><strong>${tr('收集音符', 'Collect notes')}</strong>${tr('路線上的音符順手就能拿，偏在一旁的要繞過去；跳台後的音符飄在半空中。', 'Notes on the line are easy; the ones off to the side need a detour, and the ones after a jump float in mid-air.')}</p></div><div><b><img src="${starIcon}" alt=""></b><p><strong>${tr('三顆星的滑法', 'A three-star run')}</strong>${tr('60 秒內完賽、旗門全過，再拿七成音符。撞到樹或岩石會跌倒減速。', 'Finish in 60 seconds with every gate and 70% of the notes. Hitting a tree or rock knocks you down.')}</p></div></section>
<p id="announcement" class="ski-sr" role="status" aria-live="polite"></p>
<footer><span>${tr('風在耳邊，雪在腳下。', 'Wind in your ears, snow under your skis.')}</span><span>Echo Forest ✦</span></footer></main>`;

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const stage = el('stage');
const panel = el('panel');
const overlay = el('overlay');
const pause = el<HTMLButtonElement>('pause');
const keys = new Set<string>();
const stickAxis = { x: 0, y: 0 };
let view: SkiView | null = null;
try { view = new SkiView(el<HTMLCanvasElement>('view'), back(hero.id)); view.build(game); }
catch { stage.classList.add('no-webgl'); }

// Sound: short synth tones plus a wind bed that follows your speed.
let audio: AudioContext | undefined;
let wind: { gain: GainNode; filter: BiquadFilterNode; source: AudioBufferSourceNode } | undefined;
let sound = true;
function unlockAudio() {
  if (!sound) return;
  try {
    audio ??= new AudioContext(); void audio.resume().catch(() => {});
    if (!wind) {
      const buffer = audio.createBuffer(1, audio.sampleRate * 2, audio.sampleRate);
      const data = buffer.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const source = audio.createBufferSource(); source.buffer = buffer; source.loop = true;
      const filter = audio.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 400;
      const gain = audio.createGain(); gain.gain.value = 0;
      source.connect(filter); filter.connect(gain); gain.connect(audio.destination); source.start();
      wind = { gain, filter, source };
    }
  } catch { sound = false; updateSound(); }
}
function tone(freq: number, type: OscillatorType = 'sine', volume = .12, length = .3, at = 0) {
  if (!sound || !audio || audio.state !== 'running') return;
  const now = audio.currentTime + at;
  const osc = audio.createOscillator(); const gain = audio.createGain();
  osc.type = type; osc.frequency.setValueAtTime(freq, now);
  gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(volume, now + .01); gain.gain.exponentialRampToValueAtTime(.0001, now + length);
  osc.connect(gain); gain.connect(audio.destination); osc.start(now); osc.stop(now + length + .02);
  osc.onended = () => { osc.disconnect(); gain.disconnect(); };
}
function setWind(level: number) {
  if (!wind || !audio) return;
  const t = audio.currentTime;
  wind.gain.gain.setTargetAtTime(sound ? level * .07 : 0, t, .15);
  wind.filter.frequency.setTargetAtTime(300 + level * 1400, t, .15);
}
function updateSound() { el('sound').textContent = sound ? tr('♫ 聲音開', '♫ Sound on') : tr('♫ 聲音關', '♫ Sound off'); el('sound').setAttribute('aria-pressed', String(sound)); }

function announce(text: string) { el('announcement').textContent = text; }
function release() { keys.clear(); stickAxis.x = stickAxis.y = 0; stick.release(); game.release(); }
function setPhase() {
  document.querySelector('.ski-shell')!.setAttribute('data-phase', game.phase);
  pause.disabled = !['playing', 'paused'].includes(game.phase);
  pause.textContent = game.phase === 'paused' ? tr('繼續', 'Resume') : tr('暫停', 'Pause');
  el<HTMLButtonElement>('restart').disabled = game.phase === 'ready';
}
function showPicker() {
  game.phase = 'ready'; release(); overlay.hidden = false; setPhase(); setWind(0);
  panel.innerHTML = `<p class="chapter">${tr('選一位夥伴，從山頂出發', 'Pick a friend and head down the mountain')}</p><h2>${tr('雪林滑降', 'Snowy Forest Run')}</h2><p class="ski-legend"><span><b class="flag"></b>${tr('穿過旗門', 'Pass the gates')}</span><span><img src="${noteIcon}" alt="">${tr('收集音符', 'Collect notes')}</span><span><b class="tree"></b>${tr('避開樹和岩石', 'Dodge trees and rocks')}</span></p><p>${tr('三段賽道：林間緩坡、雪松旗門、冰瀑跳台。', 'Three parts: forest glide, cedar gates and icefall jumps.')}</p><div class="ski-picks" role="group" aria-label="${tr('選擇滑雪夥伴', 'Pick a friend')}">${cast.map(c => `<button data-hero="${c.id}" aria-pressed="${c.id === hero.id}"><img src="${front(c.id)}" alt=""><span>${mascotTag(c.id)}</span></button>`).join('')}</div><button class="ski-primary" id="start">${tr('出發！', 'Go!')}</button><small>${tr('角色能力相同 · 音效會在出發後播放', 'All friends ski the same · sound starts when you go')}</small>`;
  panel.querySelectorAll<HTMLButtonElement>('[data-hero]').forEach(b => b.onclick = () => {
    hero = cast.find(c => c.id === b.dataset.hero)!; view?.setHero(back(hero.id));
    panel.querySelectorAll('[data-hero]').forEach(p => p.setAttribute('aria-pressed', String(p === b)));
  });
  el('start').onclick = start;
}
function start() {
  unlockAudio(); release(); game.start(); view?.reset(game);
  overlay.hidden = true; feedbackUntil = 0; setPhase(); stage.focus({ preventScroll: true });
  announce(tr('倒數三秒後出發，左右轉彎穿過旗門。', 'Three-second countdown, then turn through the gates.'));
}
function togglePause() {
  if (game.phase === 'playing') {
    game.pause(); release(); setWind(0); overlay.hidden = false;
    panel.innerHTML = tr('<p class="chapter">在山屋歇一會</p><h2>雪會等你。</h2><p>準備好，再往下一個旗門滑。</p><button class="ski-primary" id="resume">繼續滑</button>', '<p class="chapter">A rest at the mountain hut</p><h2>The snow will wait.</h2><p>When you\'re ready, head for the next gate.</p><button class="ski-primary" id="resume">Keep skiing</button>');
    el('resume').onclick = togglePause; el('resume').focus({ preventScroll: true }); announce(tr('遊戲已暫停。', 'Game paused.'));
  } else if (game.phase === 'paused') {
    unlockAudio(); game.resume(); overlay.hidden = true; stage.focus({ preventScroll: true }); announce(tr('繼續滑降。', 'Skiing again.'));
  }
  setPhase();
}
function finish() {
  release(); setWind(0);
  const time = game.finalTime;
  const record = !best || time < best;
  if (record) { best = time; try { localStorage.setItem('echo-ski-best', String(best)); } catch {} }
  el('best').textContent = fmt(best); overlay.hidden = false; setPhase();
  const title = tr(['平安滑到山腳了！', '風一樣的滑雪好手。', '整座雪林都在為你歡呼！'], ['Safely down the mountain!', 'Skiing like the wind.', 'The whole snowy forest is cheering!'])[game.stars - 1];
  panel.innerHTML = `<p class="chapter">${tr('滑降完成', 'Run complete')} · ${hero.name}${record ? tr(' · 新紀錄！', ' · New best!') : ''}</p><div class="ski-stars" aria-label="${tr(`${game.stars} 顆星，滿分 3 顆`, `${game.stars} of 3 stars`)}">${[0, 1, 2].map(i => `<img src="${starIcon}" alt="" class="${i < game.stars ? 'on' : ''}">`).join('')}</div><h2>${title}</h2><div class="ski-results"><span>${tr('完賽時間', 'Final time')}<strong>${fmt(time)}</strong></span><span>${tr('旗門', 'Gates')}<strong>${game.gatesPassed} / ${game.totalGates}</strong></span><span>${tr('音符', 'Notes')}<strong>${game.notes} / ${game.totalNotes}</strong></span></div><p class="ski-next">${nextGoal()}</p><p>${tr(`滑行 ${fmt(Math.max(0, game.time))} + 漏旗 ${game.penalty} 秒 · 跌倒 ${game.crashes} 次 · 特技 ${game.tricks} 個 · 最高 ${Math.round(game.topSpeed * 3.6)} km/h`, `Ski time ${fmt(Math.max(0, game.time))} + ${game.penalty}s missed gates · ${game.crashes} falls · ${game.tricks} tricks · top ${Math.round(game.topSpeed * 3.6)} km/h`)}</p><button class="ski-primary" id="again">${tr('再滑一次', 'Ski again')}</button><button class="ski-secondary" id="choose">${tr('換一位夥伴', 'Change friend')}</button>`;
  el('again').onclick = start; el('choose').onclick = showPicker; el('again').focus({ preventScroll: true });
  announce(tr(`滑降完成，${fmt(time)}，${game.stars} 顆星。`, `Run complete: ${fmt(time)}, ${game.stars} stars.`));
}
function nextGoal() {
  if (game.stars >= 3) return tr('三顆星全拿！試試看能不能再快一點。', 'Three stars! See if you can go even faster.');
  const tips: string[] = [];
  if (game.gatesMissed) tips.push(tr(`少漏 ${game.gatesMissed} 個旗門`, `miss ${game.gatesMissed} fewer gates`));
  const limit = game.stars >= 2 ? 60 : 70;
  if (game.finalTime > limit) tips.push(tr(`再快 ${(game.finalTime - limit).toFixed(1)} 秒`, `${(game.finalTime - limit).toFixed(1)}s faster`));
  const need = Math.ceil(game.totalNotes * .7) - game.notes;
  if (game.stars >= 2 && need > 0) tips.push(tr(`多拿 ${need} 個音符`, `${need} more notes`));
  return tr(`下一顆星：${tips.join('、')}。`, `Next star: ${tips.join(', ')}.`);
}

let feedbackUntil = 0;
function feedback(text: string, kind: string) {
  const f = el('feedback'); f.textContent = text; f.className = `ski-feedback show ${kind}`; feedbackUntil = performance.now() + 900;
}
function onEvent(e: SkiEvent) {
  view?.effect(e, game);
  if (e.kind === 'go') { tone(880, 'triangle', .14, .4); announce(tr('出發！', 'Go!')); }
  if (e.kind === 'gate') { tone(659, 'sine', .1, .25); tone(988, 'sine', .08, .3, .07); feedback(game.combo >= 5 ? tr(`旗門 ${game.combo} 連過！`, `${game.combo} gates in a row!`) : tr('旗門 ✓', 'Gate ✓'), 'good'); }
  if (e.kind === 'miss') { tone(196, 'square', .05, .3); feedback(tr(`漏旗 +${MISS_PENALTY} 秒`, `Missed gate +${MISS_PENALTY}s`), 'bad'); }
  if (e.kind === 'note') tone([523, 587, 659, 784, 880][game.notes % 5], 'sine', .1, .3);
  if (e.kind === 'crash' || e.kind === 'wipeout') { tone(90, 'triangle', .22, .5); feedback(e.kind === 'wipeout' ? tr('翻轉沒完成，摔倒了！', 'Unfinished flip — wipeout!') : tr('撞到了！站起來繼續滑', 'Bonk! Up and keep going'), 'bad'); }
  if (e.kind === 'fence') feedback(tr('碰到護網了', 'Hit the fence'), 'bad');
  if (e.kind === 'jump') { tone(440, 'triangle', .1, .2); tone(660, 'triangle', .1, .3, .08); }
  if (e.kind === 'trick') { tone(784, 'sine', .12, .2); tone(1175, 'sine', .1, .35, .1); feedback(tr('翻轉 +150！', 'Flip +150!'), 'good'); }
  if (e.kind === 'land') feedback(tr('漂亮落地！', 'Clean landing!'), 'good');
  if (e.kind === 'wobble') feedback(tr('落地歪了，減速', 'Wobbly landing'), 'bad');
  if (e.kind === 'section') announce(tr(`第 ${e.value! + 1} 段，${sectionName(e.value!)}。`, `Part ${e.value! + 1}: ${sectionName(e.value!)}.`));
  if (e.kind === 'complete') finish();
}

function render() {
  const s = game;
  el('time').textContent = fmt(Math.max(0, s.time));
  el('penalty').textContent = s.penalty ? `+${s.penalty}s` : '';
  el('speed').textContent = String(Math.round(s.speed * 3.6));
  el('gates').textContent = String(s.gatesPassed); el('notes').textContent = String(s.notes);
  el('section').textContent = s.phase === 'ready' ? tr('準備出發', 'Ready to go') : `${s.section + 1} / 3 · ${sectionName(s.section)}`;
  const progress = Math.min(1, s.z / COURSE_LENGTH);
  el('progress').style.width = `${progress * 100}%`; el('progress-dot').style.left = `${progress * 100}%`;
  document.querySelector('.ski-progress')!.setAttribute('aria-valuenow', String(Math.floor(s.z)));
  const cd = el('countdown');
  if (s.phase === 'playing' && s.time < .6) { cd.textContent = s.time < 0 ? String(Math.ceil(-s.time)) : tr('出發！', 'Go!'); cd.hidden = false; }
  else cd.hidden = true;
  el('air').classList.toggle('show', s.phase === 'playing' && s.airborne && s.spin === 0 && s.airLeft > .3);
  el<HTMLButtonElement>('trick').classList.toggle('ready', s.airborne && s.spin === 0);
  if (performance.now() > feedbackUntil) el('feedback').classList.remove('show');
}

function updateInput() {
  if (game.phase !== 'playing') return;
  const k = (a: string, b: string) => keys.has(a) || keys.has(b);
  const steer = (k('ArrowRight', 'd') ? 1 : 0) - (k('ArrowLeft', 'a') ? 1 : 0);
  game.input = {
    steer: steer || stickAxis.x,
    tuck: k('ArrowUp', 'w') || stickAxis.y < -.45,
    brake: k('ArrowDown', 's') || stickAxis.y > .45,
  };
}
const controlKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'a', 'd', 'w', 's'];
window.addEventListener('keydown', e => {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (key === 'Escape' && !e.repeat) { e.preventDefault(); togglePause(); return; }
  if (game.phase !== 'playing' || document.documentElement.classList.contains('guide-shown')) return;
  if (controlKeys.includes(key)) { e.preventDefault(); keys.add(key); updateInput(); }
  if (key === ' ') { e.preventDefault(); if (!e.repeat) game.trick(); }
});
window.addEventListener('keyup', e => {
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (keys.delete(key)) updateInput();
});
const stick = mountJoystick(el('stick'), (x, y) => { stickAxis.x = x; stickAxis.y = y; updateInput(); }, tr('轉彎搖桿：左右轉彎，上推壓低，下拉煞車', 'Steering stick: left/right to turn, up to tuck, down to brake'), true);
el('trick').addEventListener('pointerdown', e => { e.preventDefault(); game.trick(); });
el('trick').addEventListener('click', () => game.trick());
pause.onclick = togglePause; el('restart').onclick = start;
el('sound').onclick = () => { sound = !sound; if (sound) unlockAudio(); else setWind(0); updateSound(); };

mountGuide({ id: 'ski', title: tr('雪林滑降', 'Snowy Forest Run'), onOpen: () => autoPause(), pages: [
  { icon: back('anje'), title: tr('怎麼滑', 'How to ski'), body: tr('<ul><li>手機：<b>左手搖桿</b>左右轉彎，往上推壓低加速、往下拉煞車</li><li>鍵盤：<kbd>←</kbd> <kbd>→</kbd> 轉彎，<kbd>↑</kbd> 壓低，<kbd>↓</kbd> 煞車</li><li>撞到停下時<b>按住煞車</b>會往回退，配合左右繞開</li><li><kbd>Esc</kbd> 暫停</li></ul>', '<ul><li>Phone: <b>the stick</b> turns left/right, push up to tuck, pull down to brake</li><li>Keyboard: <kbd>←</kbd> <kbd>→</kbd> turn, <kbd>↑</kbd> tuck, <kbd>↓</kbd> brake</li><li>Stopped against something? <b>Hold brake</b> to back up and steer round it</li><li><kbd>Esc</kbd> to pause</li></ul>') },
  { icon: '⚑', title: tr('穿過旗門', 'Pass the gates'), body: tr(`<p>從<b>兩支旗桿中間</b>滑過才算，漏掉一個 <b>+${MISS_PENALTY} 秒</b>。</p><p>金色箭頭指著下一個旗門。壓低速度快，但比較難轉彎。</p>`, `<p>Ski <b>between the two poles</b>; each missed gate adds <b>${MISS_PENALTY} seconds</b>.</p><p>The gold arrow marks the next gate. Tucking is fast but turns slowly.</p>`) },
  { icon: '❄', title: tr('看清楚雪面', 'Read the snow'), body: tr('<p><b>藍色冰面</b>很滑、很難轉；兩側<b>鬆雪</b>會拖慢你。</p><p>撞到樹或岩石會跌倒，碰到橘色護網會減速。</p>', '<p><b>Blue ice</b> is fast but hard to turn on; <b>powder</b> at the sides slows you down.</p><p>Trees and rocks knock you over; the orange fence slows you down.</p>') },
  { icon: starIcon, title: tr('跳台與星星', 'Jumps and stars'), body: tr('<p>飛上跳台後按 <kbd>Space</kbd> 或「特技」翻一圈，<b>+150 分</b>；落地前沒翻完會摔倒。</p><p>三星：<b>60 秒內</b>、旗門全過、拿到七成音符。</p>', '<p>In the air, press <kbd>Space</kbd> or “Trick” for a flip: <b>+150</b>. Land before it finishes and you wipe out.</p><p>Three stars: <b>under 60s</b>, every gate, and 70% of the notes.</p>') },
] });
function autoPause() { if (game.phase === 'playing') togglePause(); else release(); }
window.addEventListener('blur', autoPause); document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });

let previous = performance.now(); let frame = 0;
function tick(now: number) {
  const dt = Math.min(.1, Math.max(0, (now - previous) / 1000)); previous = now;
  if (game.phase === 'playing') {
    updateInput();
    for (const e of game.update(dt)) onEvent(e);
    setWind(game.phase === 'playing' ? Math.min(1, game.speed / 28) : 0);
  }
  render();
  view?.render(game, game.phase === 'paused' ? 0 : dt);
  frame = requestAnimationFrame(tick);
}
showPicker(); render(); frame = requestAnimationFrame(tick);
window.addEventListener('pagehide', () => { autoPause(); cancelAnimationFrame(frame); try { wind?.source.stop(); } catch {} void audio?.close(); audio = undefined; wind = undefined; });
window.addEventListener('pageshow', e => { if (e.persisted) { previous = performance.now(); frame = requestAnimationFrame(tick); } });
if (import.meta.env.DEV) Object.defineProperty(window, '__skiState', { configurable: true, get: () => ({ ...game.snapshot(), airLeft: game.airLeft, aim: autopilot(game) }) });
