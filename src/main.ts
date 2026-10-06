import './style.css';
import './adventure.css';
import { siteHeader } from './site-nav';
import { isEn, localizeDocument, tr } from './i18n';
import { ForestGame, hostOf, playableIds, type GameEvent, type Look } from './game';
import { mountJoystick } from './joystick';
import { mountGuide, guideButton } from './game-guide';
import characters from '../assets/characters.json';
import { mascotLabel, mascotName, mascotTag } from './mascots';
import restBadge from '../assets/ui/adv-rest.png';
import winBadge from '../assets/ui/adv-win.png';

localizeDocument('Echo Forest — Forest Note Adventure', 'Cross Echo Forest with Anbo the Shiba: collect notes, hop over stumps and find Owl at the finish.');
const app = document.querySelector<HTMLDivElement>('#app')!;
// Vite statically includes the source asset directory in production builds.
const mascotAssets = import.meta.glob('../assets/sprites/1x/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const sideAssets = import.meta.glob('../assets/sprites/side/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const front = (id: string) => mascotAssets[`../assets/sprites/1x/${id}.png`];
const side = (id: string, kind: 'run_a' | 'run_b' | 'stand') => sideAssets[`../assets/sprites/side/${id}_${kind}.png`];
// characters.json is Chinese only; English species and instruments live here.
const english: Record<string, [string, string]> = {
  owl: ['Owl', 'a baton and a book'], anji: ['Snowy Owl', 'a little drum'], anje: ['Long-tailed Tit', 'five moon bells'],
  anbo: ['Shiba Inu', 'a tambourine'], ansey: ['Russian Blue', 'a violin'], angoo: ['Red Fox', 'a scarf and a bow'],
  anmi: ['Otter', 'maracas'], anka: ['Capybara', 'a ukulele'], anzo: ['Gecko', 'a thumb piano'],
  anbi: ['White-tailed Deer', 'a triangle'], anleo: ['Asian Lion', 'a hand drum'],
};
const cast = characters.characters.filter(c => playableIds.includes(c.id))
  .map(c => isEn && english[c.id] ? { ...c, species: english[c.id][0], identity: english[c.id][1] } : c)
  .map(c => ({ ...c, name: mascotLabel(c.id), short: mascotName(c.id) }));
const byId = (id: string) => cast.find(c => c.id === id) ?? cast.find(c => c.id === 'anbo')!;
let hero = byId(new URLSearchParams(location.search).get('hero') ?? (() => { try { return localStorage.getItem('echo-adventure-hero') ?? 'anbo'; } catch { return 'anbo'; } })());
app.innerHTML = `
  ${siteHeader("adventure")}
  <main>
    <section class="intro" aria-labelledby="page-title"><div><p class="chapter"><span></span> ${tr('第一章・晨光小徑', 'Chapter 1 · Morning Trail')}</p><h1 id="page-title">${tr('森林裡，出發。', 'Into the forest!')}</h1>${guideButton()}<p class="intro-copy">${tr('跟著 <span class="hero-name">安寶 Anbo</span> 的腳步，找回散落在林間的旋律。', 'Follow <span class="hero-name">Anbo</span> and gather the melody scattered through the trees.')}</p></div><div class="player-badge"><img id="badge-img" src="${front('anbo')}" alt=""/><div><small>${tr('今天的冒險夥伴', 'Today\'s buddy')}</small><strong><span class="hero-name">${mascotLabel('anbo')}</span> <span id="badge-species">${tr('柴犬', 'Shiba Inu')}</span></strong></div></div></section>
    <section class="game-shell is-locked" aria-label="${tr('森林音符冒險', 'Forest note adventure')}">
      <div class="game-toolbar"><div class="trail-name"><span aria-hidden="true">✦</span> ${tr('晨光小徑 <span class="trail-en">Morning trail</span>', 'Morning Trail')}</div><div class="toolbar-actions"><button id="look" aria-pressed="false" title="${tr('切換畫面風格', 'Change the look')}">✧ <span id="look-name">${tr('標準', 'Classic')}</span></button><button id="sound" aria-label="${tr('開啟音效', 'Turn sound on')}" aria-pressed="false">♫ <span>${tr('音效關', 'Sound off')}</span></button><button id="pause" aria-label="${tr('暫停遊戲', 'Pause game')}" disabled>Ⅱ <span>${tr('暫停', 'Pause')}</span></button><button id="restart" aria-label="${tr('重新開始遊戲', 'Restart game')}" disabled>↻ <span>${tr('重來', 'Restart')}</span></button></div></div>
      <div class="stage" id="stage">
        <div id="game" role="application" aria-label="${tr('森林冒險，方向鍵移動，空白鍵跳躍，Escape 暫停', 'Forest Adventure. Arrow keys move, Space jumps, Escape pauses')}" tabindex="0"></div>
        <div class="hud" id="hud" hidden><div class="hud-left"><span id="hearts" role="img" aria-label="${tr('3 顆愛心', '3 hearts')}"><i class="hud-icon heart"></i><i class="hud-icon heart"></i><i class="hud-icon heart"></i></span><span class="hud-notes"><i class="hud-icon note" aria-hidden="true"></i> <b id="note-count">0</b><small> / <span id="note-total">20</span></small></span></div><div class="hud-right"><span class="hud-time"><i class="hud-icon timer" aria-hidden="true"></i><span id="timer">00:00</span></span><span id="checkpoint-label">${tr('目標：找到 ', 'Goal: find ')}<span class="host-name">${mascotName('owl')}</span></span></div></div>
        <div class="overlay" id="overlay">
          <div class="welcome picker" id="welcome"><span class="welcome-label">Echo Forest Adventure ・ ${tr('選擇夥伴', 'Pick a buddy')}</span><div class="picker-hero"><div class="picker-stage"><img id="picker-sprite" src="${side('anbo', 'stand')}" alt=""></div><div><h2 id="picker-title">${tr('今天和誰出發？', 'Who\'s coming along today?')}</h2><p id="picker-meta"></p></div></div><div class="picker-grid" role="radiogroup" aria-label="${tr('選擇冒險角色', 'Choose your adventurer')}">${cast.map(c => `<button class="pick" role="radio" aria-checked="false" data-hero="${c.id}" aria-label="${c.name}${tr('，', ', ')}${c.species}"><img src="${side(c.id, 'stand')}" alt=""><span>${mascotTag(c.id)}</span></button>`).join('')}</div><div class="picker-actions"><button class="primary" id="start" disabled>${tr('正在準備森林…', 'Getting the forest ready…')}</button><span class="start-hint">${tr('← → 選角色 <span>／</span> Enter 出發', '← → pick <span>/</span> Enter to go')}</span></div></div>
          <div class="result-panel" id="result" hidden></div>
        </div>
        <div class="toast" id="toast" role="status" aria-live="polite"></div>
      </div>
      <div class="touch-controls" aria-label="${tr('觸控操作', 'Touch controls')}"><div class="touch-stick" id="adventure-stick"></div><span>${tr('左手推搖桿移動，按住跳躍跳得更高', 'Push the stick to move; hold Jump to jump higher')}</span><button data-control="jump" class="touch-jump" aria-label="${tr('跳躍', 'Jump')}">${tr('跳躍', 'Jump')} ↑</button></div>
      <div class="game-caption"><span><kbd>←</kbd><kbd>→</kbd> ${tr('移動', 'Move')} <i></i><kbd>Space</kbd> ${tr('跳躍', 'Jump')} <i></i><kbd>Esc</kbd> ${tr('暫停', 'Pause')}</span><span class="caption-tip">${tr('小提示：踩上紅蘑菇，會有驚喜。', 'Tip: step on a red mushroom for a surprise.')}</span></div>
    </section>
    <section class="forest-friends" aria-label="${tr('森林夥伴', 'Forest friends')}"><div class="friends-heading"><h2>${tr('森林裡的朋友們', 'Friends of the forest')}</h2><p>${tr('點選朋友，就能換他帶路。', 'Tap a friend to let them lead the way.')}</p></div><div class="friend-list">${cast.map(c => `<button class="friend" data-hero="${c.id}" aria-pressed="false"><img src="${front(c.id)}" alt="${c.species} ${c.name}"/><span>${c.name}</span><small>${tr('本次主角', 'Leading now')}</small></button>`).join('')}</div></section>
    <footer><span>${tr('小小像素，大大冒險。', 'Tiny pixels, big adventure.')}</span><span>Echo Forest <span aria-hidden="true">✦</span> ${tr('數讀房市', 'Housing Decoder')}</span></footer>
  </main>
`;
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const start = el<HTMLButtonElement>('start');
const overlay = el('overlay');
const result = el('result');
const pauseButton = el<HTMLButtonElement>('pause');
const restartButton = el<HTMLButtonElement>('restart');
let toastTimer: ReturnType<typeof setTimeout>;
const formatTime = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
function showToast(message: string) { el('toast').textContent = message; el('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el('toast').classList.remove('visible'), 2600); }
function focusGame() { el('game').focus({ preventScroll: true }); }
const shell = document.querySelector<HTMLElement>('.game-shell')!;
function begin() { shell.classList.remove('is-locked'); el('welcome').hidden = true; result.hidden = true; overlay.hidden = true; el('hud').hidden = false; pauseButton.disabled = false; restartButton.disabled = false; game.start(); focusGame(); }
function handleEvent(event: GameEvent) {
  if (event.type === 'ready') { start.disabled = false; start.textContent = tr('開始冒險　→', 'Start adventure →'); }
  if (event.type === 'error') { start.textContent = tr('素材載入失敗，請重新整理', 'Couldn\'t load the game. Please refresh.'); showToast(event.message); }
  if (event.type === 'tick') { el('timer').textContent = formatTime(event.seconds); el('note-count').textContent = String(event.notes); el('note-total').textContent = String(event.total); }
  if (event.type === 'health') { el('hearts').innerHTML = '<i class="hud-icon heart"></i>'.repeat(event.lives) + '<i class="hud-icon heart empty"></i>'.repeat(3 - event.lives); el('hearts').setAttribute('aria-label', tr(`${event.lives} 顆愛心`, `${event.lives} ${event.lives === 1 ? 'heart' : 'hearts'}`)); }
  if (event.type === 'checkpoint') { el('checkpoint-label').textContent = tr('已點亮中途營地', 'Camp lit up'); showToast(tr('中途營地已點亮！跌倒也能從這裡再出發。', 'Camp lit up! If you fall, you\'ll start again from here.')); }
  if (event.type === 'reset') { el('checkpoint-label').textContent = tr(`目標：找到 ${hostName()}`, `Goal: find ${hostName()}`); }
  if (event.type === 'hint') showToast(event.message);
  if (event.type === 'pause') {
    pauseButton.innerHTML = event.paused ? tr('▶ <span>繼續</span>', '▶ <span>Resume</span>') : tr('Ⅱ <span>暫停</span>', 'Ⅱ <span>Pause</span>');
    pauseButton.setAttribute('aria-label', event.paused ? tr('繼續遊戲', 'Resume game') : tr('暫停遊戲', 'Pause game'));
    shell.classList.toggle('is-locked', event.paused);
    if (event.paused) {
      result.innerHTML = `<img class="result-badge" src="${restBadge}" alt=""><p class="chapter">${tr('在樹蔭下歇一會', 'Resting in the shade')}</p><h2>${tr('森林會等你。', 'The forest will wait.')}</h2><p>${tr('準備好，再一起往前走。', 'When you\'re ready, let\'s keep going.')}</p><button class="primary" id="resume">${tr('繼續冒險 →', 'Keep going →')}</button>`;
      result.hidden = false; overlay.hidden = false; el('resume').onclick = () => { game.setPaused(false); focusGame(); }; el('resume').focus({ preventScroll: true });
    } else { overlay.hidden = true; result.hidden = true; }
  }
  if (event.type === 'end') {
    pauseButton.disabled = true;
    el('hud').hidden = true;
    shell.classList.add('is-locked');
    const won = event.won;
    result.innerHTML = `${won ? `<img class="result-badge" src="${winBadge}" alt="">` : `<img class="result-mascot" src="${front(hero.id)}" alt="${hero.name}"/>`}<p class="chapter">${won ? tr('晨光小徑・完成', 'Morning Trail · Complete') : tr('冒險還沒結束', 'Not over yet')}</p><h2>${won ? tr('森林聽見你了！', 'The forest heard you!') : tr('再試一次吧。', 'Let\'s try again.')}</h2><p>${won ? tr(`你和 ${hero.short} 把旋律帶回了森林，${hostName()} 為你們歡呼！`, `You and ${hero.name} brought the melody home. ${hostName()} is cheering for you!`) : tr('慢慢來，留意腳下的空隙、尖刺和頭頂的刺藤。', 'Take your time and watch for gaps, spikes and the thorny vines overhead.')}</p><div class="result-stats"><span>${tr('收集音符', 'Notes')}<strong>${event.notes} / ${event.total}</strong></span><span>${tr('冒險時間', 'Time')}<strong>${formatTime(event.seconds)}</strong></span></div>${won && event.best ? `<p class="best">${tr(`本機最佳：${event.best.notes} 音符`, `Best on this device: ${event.best.notes} notes`)} · ${formatTime(event.best.seconds)}</p>` : ''}<button class="primary" id="play-again">${won ? tr('再冒險一次', 'Play again') : tr('重新出發', 'Try again')} →</button><button class="text-button" id="change-hero">${tr('換個夥伴冒險', 'Pick another buddy')}</button><a class="text-button" href="./race.html">${tr('去森林賽車看看安寶的小車 ↗', 'See Anbo\'s kart in Forest Race ↗')}</a>`;
    result.hidden = false; overlay.hidden = false; el('play-again').onclick = begin; el('change-hero').onclick = showPicker; el('play-again').focus({ preventScroll: true });
  }
}
const game = new ForestGame(el('game'), handleEvent);
const hostName = () => byId(hostOf(hero.id)).short;
const picks = Array.from(document.querySelectorAll<HTMLButtonElement>('.pick'));
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let stride = 0;
/** Picker preview runs in place while the welcome card is up. */
setInterval(() => { if (el('welcome').hidden || reducedMotion) return; stride = (stride + 1) % 2; el<HTMLImageElement>('picker-sprite').src = side(hero.id, stride ? 'run_b' : 'run_a'); }, 120);
function chooseHero(id: string) {
  if (game.running) { showToast(tr('這趟冒險結束後，就能換夥伴囉。', 'You can switch buddies when this run is over.')); return; }
  hero = byId(id); game.setCharacter(hero.id);
  try { localStorage.setItem('echo-adventure-hero', hero.id); } catch {}
  document.querySelectorAll('.hero-name').forEach(e => e.textContent = hero.name);
  document.querySelectorAll('.host-name').forEach(e => e.textContent = hostName());
  el<HTMLImageElement>('badge-img').src = front(hero.id); el<HTMLImageElement>('badge-img').alt = `${hero.species} ${hero.name}`; el('badge-species').textContent = hero.species;
  el<HTMLImageElement>('picker-sprite').src = side(hero.id, 'stand');
  el('picker-title').textContent = tr(`${hero.name}・${hero.species}`, `${hero.name} · ${hero.species}`);
  el('picker-meta').innerHTML = tr(`帶著${hero.identity}，跳過樹樁、追著音符前進。<br>${hostName()} 正在森林的另一端等你。`, `With ${hero.identity} in tow, hop the stumps and chase the notes.<br>${hostName()} is waiting at the far end of the forest.`);
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
function showLook() { const hd = game.look === 'hd2d'; el('look-name').textContent = hd ? 'HD-2D' : tr('標準', 'Classic'); el('look').setAttribute('aria-pressed', String(hd)); }
game.setLook(initialLook()); showLook();
el('look').onclick = () => { game.setLook(game.look === 'hd2d' ? 'standard' : 'hd2d'); try { localStorage.setItem('echo-adventure-look', game.look); } catch {} showLook(); if (game.running && !game.paused) focusGame(); };
start.onclick = begin;
pauseButton.onclick = () => { game.setPaused(!game.paused); if (!game.paused) focusGame(); };
restartButton.onclick = begin;
el('sound').onclick = () => { const on = game.toggleSound(); el('sound').innerHTML = `♫ <span>${on ? tr('音效開', 'Sound on') : tr('音效關', 'Sound off')}</span>`; el('sound').setAttribute('aria-pressed', String(on)); el('sound').setAttribute('aria-label', on ? tr('關閉音效', 'Turn sound off') : tr('開啟音效', 'Turn sound on')); };
document.querySelectorAll<HTMLButtonElement>('[data-control]').forEach(button => {
  const control = button.dataset.control as 'left' | 'right' | 'jump';
  button.onpointerdown = e => { e.preventDefault(); button.setPointerCapture(e.pointerId); game.setControl(control, true); button.classList.add('held'); };
  const release = () => { game.setControl(control, false); button.classList.remove('held'); };
  button.onpointerup = release; button.onpointercancel = release; button.onlostpointercapture = release;
});
mountJoystick(el('adventure-stick'), x => game.setStick(x), tr('移動搖桿', 'Movement stick'));
mountGuide({ id: 'adventure', title: tr('森林冒險', 'Forest Adventure'), onOpen: () => { game.releaseControls(); if (game.running && !game.paused) game.setPaused(true); }, pages: [
  { icon: side('anbo', 'run_a'), title: tr('移動與跳躍', 'Move and jump'), body: tr('<p><b>手機</b>：左手推搖桿左右移動，推越遠跑越快；右手按「跳躍」，<b>按住跳得更高</b>。</p><p><b>電腦</b>：<kbd>←</kbd><kbd>→</kbd> 或 <kbd>A</kbd><kbd>D</kbd> 移動，<kbd>Space</kbd> 跳躍，<kbd>Esc</kbd> 暫停，<kbd>R</kbd> 重來。</p>', '<p><b>Phone</b>: push the stick with your left thumb to move; push further to run faster. Tap \"Jump\" with your right thumb, and <b>hold it to jump higher</b>.</p><p><b>Computer</b>: <kbd>←</kbd><kbd>→</kbd> or <kbd>A</kbd><kbd>D</kbd> to move, <kbd>Space</kbd> to jump, <kbd>Esc</kbd> to pause, <kbd>R</kbd> to restart.</p>') },
  { icon: '♪', title: tr('收集音符，找到終點', 'Collect notes, reach the end'), body: tr('<p>沿路收集散落的<b>音符</b>，一路往右走到森林另一端，找到等你的朋友就完成冒險。</p><p>經過<b>中途營地</b>的旗子會點亮，之後跌倒就從營地再出發。</p>', '<p>Pick up the <b>notes</b> along the way and head right to the far side of the forest. Find the friend waiting for you to finish.</p><p>The <b>camp</b> flag lights up as you pass it; if you fall later, you start again from there.</p>') },
  { icon: '♥', title: tr('小心危險', 'Watch out'), body: tr('<p>你有 <b>3 顆愛心</b>。碰到<b>紅尖刺</b>（地上、樹樁上，還有頭頂垂下的<b>刺藤</b>）或巡邏的小怪會少一顆心，掉進空隙也是。</p><p>從上方<b>踩住小怪</b>就能打倒它；踩上<b>紅蘑菇</b>會被彈得很高。</p>', '<p>You have <b>3 hearts</b>. Touching <b>red-tipped spikes</b> (on the ground, on stumps, or on <b>vines hanging overhead</b>) or a patrolling critter costs a heart, and so does falling into a gap.</p><p><b>Stomp on a critter</b> from above to knock it out; a <b>red mushroom</b> bounces you up high.</p>') },
  { icon: '✦', title: tr('變大橡實與細樹枝', 'Acorns and thin branches'), body: tr('<p>吃到<b>橡實</b>會變大：被碰到時只會變回原樣，不會少一顆心。</p><p><b>細樹枝</b>只從上面才踩得住，可以從下方直接跳上去。</p>', '<p>Grab an <b>acorn</b> to grow big: if something hits you, you just shrink back instead of losing a heart.</p><p><b>Thin branches</b> only hold you from above, so you can jump right up through them from below.</p>') },
] });
window.addEventListener('blur', () => { game.releaseControls(); if (game.running) game.setPaused(true); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { game.releaseControls(); if (game.running) game.setPaused(true); } });
window.addEventListener('keydown', e => {
  if (e.key === 'Escape' && game.running) { e.preventDefault(); game.setPaused(!game.paused); if (!game.paused) focusGame(); }
  if (e.code === 'KeyR' && game.running && !e.repeat) begin();
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space', 'KeyA', 'KeyD', 'KeyW'].includes(e.code) && game.running && !game.paused && document.activeElement?.tagName !== 'BUTTON') e.preventDefault();
});
