import { courses, course, raceRecordKey } from './racing-courses';
import "./style.css";
import "./race.css";
import { siteHeader } from "./site-nav";
import { mountGuide, guideButton } from "./game-guide";
import {
  RacingEngine,
  type RaceEvent,
  type Control,
  type RaceResult,
} from "./racing-engine";
import { entries, vehicles } from "./racing-data";
import { mascotLabel } from "./mascots";
import { mountJoystick } from "./joystick";
import { localizeDocument, tr } from "./i18n";
import itemArt from "../assets/ui/race-item-echo.png";
import trophyArt from "../assets/ui/race-trophy.png";
import flagIcon from "../assets/ui/race-hud-flag.png";
import lapIcon from "../assets/ui/race-hud-lap.png";
import timerIcon from "../assets/ui/race-hud-timer.png";
import speedIcon from "../assets/ui/race-hud-speed.png";
const portraits = import.meta.glob("../assets/sprites/1x/*.png", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;
const kartSheet = new URL("../assets/generated/anbo-kart-eight-directions.png", import.meta.url).href;
localizeDocument("Echo Forest — Forest Race", "A pixel kart race with Anbo and forest friends. Corner, drift and boost through the three-lap Sunrise Cup!");
const directions = tr(["正面", "右前", "右側", "右後", "背面", "左後", "左側", "左前"], ["Front", "Front right", "Right", "Back right", "Back", "Back left", "Left", "Front left"]);
const courseName = tr(course.name, course.nameEn);
const kartFrame = (i: number) => `${(i % 4) * 100 / 3}% ${Math.floor(i / 4) * 100}%`;
const el = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const time = (seconds: number) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}.${Math.floor((seconds % 1) * 100)
    .toString()
    .padStart(2, "0")}`;
let saved = tr("還沒有紀錄", "No record yet");
try {
  const n = Number(localStorage.getItem(raceRecordKey));
  if (Number.isFinite(n) && n > 0) saved = time(n);
} catch {}
document.getElementById("app")!.innerHTML = `
${siteHeader("race")}
<main class="race-main">
  <section class="intro" aria-labelledby="page-title"><div><p class="chapter"><span></span> ${courseName}${tr('・森林盃', ' · Forest Cup')}</p><h1 id="page-title">${tr('把晨光，甩在身後。', 'Leave the sunrise behind.')}</h1>${guideButton()}<p class="intro-copy">${tr('沿著林間彎道，和夥伴們一起衝向終點。', 'Race your friends through the winding woods to the finish.')}</p></div><div class="race-intro-badge"><span class="checker" aria-hidden="true"></span><div><strong>${tr('3 圈 <span>／ 4 位車手</span>', '3 laps <span>/ 4 racers</span>')}</strong><small>${tr('三座跳台，展翼滑翔森林', 'Three ramps to glide over the forest')}</small></div></div></section>
  <nav class="course-board" aria-label="${tr('選擇賽道', 'Choose a track')}">${courses.map(c => `<a href="?course=${c.id}" class="course-option" ${c.id === course.id ? 'aria-current="page"' : ''}><svg viewBox="-135 -265 510 530" aria-hidden="true"><polygon points="${c.points.map(p => p.join(',')).join(' ')}"/></svg><span><strong>${tr(c.name, c.nameEn)}<small>${tr(c.style, c.styleEn)}</small></strong><span>${tr(c.description, c.descriptionEn)}</span><em>${c.id === course.id ? tr('目前賽道', 'Current track') : tr('選擇這條路線', 'Pick this route')}</em></span></a>`).join('')}</nav>
  <section class="game-shell race-shell is-locked" id="race-shell" aria-label="${tr('森林賽車', 'Forest Race')}">
    <div class="game-toolbar"><div class="trail-name"><span aria-hidden="true">⚑</span> ${courseName} <span class="trail-en">Woodland circuit</span></div><div class="toolbar-actions"><button id="race-look" aria-pressed="false" title="${tr('切換畫面風格', 'Switch visual style')}">✧ <span id="race-look-name">${tr('標準', 'Standard')}</span></button><button id="race-sound" aria-label="${tr('開啟音效', 'Turn sound on')}" aria-pressed="false">♫ <span>${tr('音效關', 'Sound off')}</span></button><button id="race-fullscreen" aria-label="${tr('全螢幕', 'Full screen')}">⛶ <span>${tr('全螢幕', 'Full screen')}</span></button><button id="race-pause" aria-label="${tr('暫停比賽', 'Pause race')}" disabled>Ⅱ <span>${tr('暫停', 'Pause')}</span></button><button id="race-restart" aria-label="${tr('重新比賽', 'Restart race')}" disabled>↻ <span>${tr('重來', 'Restart')}</span></button><button class="race-garage-bar" id="open-kart-bar" aria-label="${tr('賽車工坊', 'Kart workshop')}">⚙ <span>${tr('工坊', 'Garage')}</span></button></div></div>
    <div class="race-stage"><canvas id="race-canvas" tabindex="0" aria-label="${tr('森林賽車，方向鍵轉向，空白鍵甩尾，E 使用道具，Escape 暫停', 'Forest Race. Arrow keys steer, Space drifts, E uses an item, Escape pauses')}"></canvas>
      <div class="race-hud" id="race-hud" hidden><div class="race-position"><span><img src="${flagIcon}" alt="">${tr('目前名次', 'Place')}</span><strong><b id="race-position">4</b><small> / 4</small></strong></div><div class="race-progress"><span><img src="${lapIcon}" alt="">${tr('圈數', 'Lap')} <b id="race-lap">1</b><small> / 3</small></span><strong><img src="${timerIcon}" alt=""><span id="race-time">00:00.00</span></strong></div></div>
      <div class="race-speed" id="race-speed-panel" hidden><div><img src="${speedIcon}" alt=""><b id="race-speed">0</b><span>km/h</span><em id="race-boost-status">${tr(vehicles.moss.name, vehicles.moss.nameEn)}</em></div><div class="drift-meter"><span id="drift-fill"></span></div><small id="drift-hint">${tr('按住空白鍵＋轉向甩尾', 'Hold Space + steer to drift')}</small></div>
      <button class="race-item" id="race-item" disabled hidden aria-label="${tr('使用回聲能量', 'Use echo energy')}"><span id="item-icon"><img src="${itemArt}" alt=""></span><span id="item-label">${tr('尋找道具箱', 'Find an item box')}</span><kbd>E</kbd></button>
      <div class="race-notice" id="race-notice" role="status" aria-live="polite"></div>
      <div class="race-overlay" id="race-overlay"><div class="race-welcome" id="race-welcome"><p class="welcome-label">Echo Forest Kart</p><h2>${tr('下一個彎道，<br>換你領先。', 'Next corner,<br>you take the lead.')}</h2><p>${tr('和安咕、安米、安婕一起出發。<br>甩尾蓄力、抓住加速帶，跑出你的節奏。', 'Race with Angoo, Anmi and Anje.<br>Charge drifts, hit boost pads, find your rhythm.')}</p><div class="race-start-meta"><span>${courseName}</span><span>${tr('三圈決勝', 'Three laps')}</span><span>${tr('單人競速', 'Solo race')}</span></div><button class="primary" id="race-start" disabled>${tr('正在準備賽道…', 'Preparing the track…')}</button><span class="start-hint">${tr('← → 轉向 ／ 空白鍵特技 ／ 空中 ↑ 俯衝、↓ 拉升 ／ E 道具', '← → steer / Space trick / in air ↑ dive, ↓ climb / E item')}</span></div><div class="race-result" id="race-result" hidden></div></div>
    </div>
    <div class="race-touch" aria-label="${tr('賽車觸控操作', 'Race touch controls')}"><div class="touch-stick" id="race-stick"></div><div><button data-race-control="gas" id="touch-gas" aria-label="${tr('油門', 'Gas')}" hidden>${tr('油門', 'Gas')}</button><button data-race-control="brake" id="touch-brake" aria-label="${tr('煞車', 'Brake')}">${tr('煞車', 'Brake')}</button><button data-race-control="drift" class="drift-touch" aria-label="${tr('甩尾', 'Drift')}" title="${tr('地面按住甩尾；起跳時點一下做特技', 'Hold to drift on the ground; tap on takeoff for a trick')}">${tr('甩尾／特技', 'Drift / Trick')}</button><button data-race-control="item" class="item-touch" aria-label="${tr('觸控使用道具', 'Use item')}"><img src="${itemArt}" alt="">${tr('道具', 'Item')}</button></div></div>
    <div class="race-caption"><div><kbd>←</kbd><kbd>→</kbd> ${tr('轉向', 'Steer')} <kbd>Space</kbd> ${tr('甩尾', 'Drift')} <kbd>E</kbd> ${tr('道具', 'Item')} <kbd>↓</kbd> ${tr('煞車', 'Brake')}</div><label><input id="auto-gas" type="checkbox" checked> ${tr('自動油門', 'Auto gas')} <span>${tr('專心過彎就好', 'Just focus on corners')}</span></label></div>
  </section>
  <section class="race-details"><div class="race-racers"><div class="friends-heading"><h2>${tr('一起上場的夥伴', 'Today\'s racers')}</h2><p id="race-standings-label">${tr('你駕駛安寶的苔綠號', 'You drive Anbo\'s Moss Racer')}</p></div><div class="race-entry-list">${entries.map((entry, i) => `<div class="race-entry ${i === 0 ? "you" : ""}" data-racer="${entry.name}"><span class="entry-rank">${i === 0 ? tr("你", "You") : i + 1}</span><img src="${portraits[`../assets/sprites/1x/${entry.characterId}.png`]}" alt="${mascotLabel(entry.name)}"><div><strong>${mascotLabel(entry.name)}</strong><small>${tr(vehicles[entry.vehicleId].name, vehicles[entry.vehicleId].nameEn)}</small></div><span class="vehicle-dot" style="--vehicle:${vehicles[entry.vehicleId].color}"></span></div>`).join("")}</div></div><div class="race-record"><span>${tr('本機最快紀錄', 'Best on this device')}</span><strong id="best-time">${saved}</strong><small>${tr('三圈總時間', '3-lap total')}</small></div><button class="race-garage" id="open-kart"><span class="kart-thumb" style="background-image:url('${kartSheet}');background-position:${kartFrame(1)}" aria-hidden="true"></span><span><strong>${tr('賽車工坊', 'Kart workshop')} <span aria-hidden="true">↗</span></strong><small>${tr('八個角度看看苔綠號', 'See the Moss Racer from 8 angles')}</small></span></button></section>
  <section class="race-tips" aria-label="${tr('駕駛技巧', 'Driving tips')}"><p><span>↝</span><strong>${tr('彎道裡蓄力', 'Charge in corners')}</strong>${tr('按住甩尾並轉向，亮藍後放開，短暫加速。', 'Hold drift and steer; let go when it glows blue for a quick boost.')}</p><p><span>✦</span><strong>${tr('抓住超車時機', 'Time your pass')}</strong>${tr('吃到道具箱後，按 E 啟動回聲能量。', 'After grabbing an item box, press E for echo energy.')}</p><p><span>⚑</span><strong>${tr('選擇飛躍路線', 'Pick your flight line')}</strong>${tr('跳台自動展翼；↑ 俯衝、↓ 拉升。起跳按甩尾做特技，落地加速更久。', 'Ramps open your glider; ↑ dive, ↓ climb. Drift on takeoff for a trick and a longer landing boost.')}</p></section>
  <footer><span>${tr('小小像素，大大冒險。', 'Tiny pixels, big adventure.')}</span><span>Echo Forest <span aria-hidden="true">✦</span> ${tr('數讀房市', 'Housing Decoder')}</span></footer>
</main>
<dialog id="kart-dialog" aria-labelledby="kart-title"><div class="workshop-top"><span>Echo Forest Garage</span><button id="close-kart" aria-label="${tr('關閉賽車工坊', 'Close kart workshop')}">✕</button></div><div class="workshop-body"><p class="chapter">${tr('賽車工坊', 'Kart workshop')}</p><h2 id="kart-title">${tr('安寶的苔綠號', 'Anbo\'s Moss Racer')}</h2><p>${tr('森林綠車身、黃銅細節，還有熟悉的橘色耳朵。<br>點選角度，看看小車的模樣。', 'Forest-green body, brass trim and those familiar orange ears.<br>Pick an angle to take a look.')}</p><div class="kart-turntable"><div class="kart-large" id="kart-large" role="img" aria-label="${tr('安寶賽車正面', 'Anbo\'s kart, front')}" style="background-image:url('${kartSheet}')"></div><span id="direction-label">${directions[0]}</span></div><div class="direction-list">${directions.map((name, i) => `<button class="direction ${i === 0 ? "active" : ""}" data-direction="${i}" aria-pressed="${i === 0}"><span class="kart-thumb" style="background-image:url('${kartSheet}');background-position:${kartFrame(i)}"></span>${name}</button>`).join("")}</div><div class="workshop-note"><span>${tr('八方向美術樣張', 'Eight-direction art sheet')}</span><p>${tr('看完了？回到賽道，帶著安寶衝線吧。', 'All done? Head back to the track and race Anbo to the finish.')}</p><a href="${kartSheet}" download="anbo-kart-eight-directions.png">${tr('下載完整樣張 ↓', 'Download full sheet ↓')}</a></div></div></dialog>`;
const start = el<HTMLButtonElement>("race-start"),
  pause = el<HTMLButtonElement>("race-pause"),
  restart = el<HTMLButtonElement>("race-restart");
const overlay = el("race-overlay"),
  welcome = el("race-welcome"),
  result = el("race-result"),
  canvas = el<HTMLCanvasElement>("race-canvas");
let noticeTimer: ReturnType<typeof setTimeout>,
  lastPaused = false;
function focus() {
  canvas.focus({ preventScroll: true });
}
async function begin() {
  welcome.hidden = true;
  result.hidden = true;
  overlay.hidden = true;
  el("race-hud").hidden = false;
  el("race-speed-panel").hidden = false;
  el("race-item").hidden = false;
  restart.disabled = false;
  pause.disabled = false;
  lastPaused = false;
  el("race-shell").classList.remove("is-locked", "is-finished");
  clearTimeout(noticeTimer);
  el("race-notice").classList.remove("visible");
  await race.start();
  if (matchMedia("(max-width: 760px)").matches)
    el("race-shell").scrollIntoView({ block: "start" });
  focus();
}
function notice(message: string) {
  el("race-notice").textContent = message;
  el("race-notice").classList.add("visible");
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(
    () => el("race-notice").classList.remove("visible"),
    2400,
  );
}
function finish(r: RaceResult) {
  pause.disabled = true;
  // The result card takes over the stage; live HUD numbers would contradict it.
  el("race-hud").hidden = true;
  el("race-speed-panel").hidden = true;
  el("race-item").hidden = true;
  el("race-shell").classList.add("is-locked", "is-finished");
  el("race-item").setAttribute("disabled", "");
  el("best-time").textContent = time(r.best);
  clearTimeout(noticeTimer);
  el("race-notice").classList.remove("visible");
  result.innerHTML = `<img class="finish-badge ${r.position === 1 ? "is-champion" : ""}" src="${r.position === 1 ? trophyArt : flagIcon}" alt=""><p class="chapter">${courseName}${tr('・三圈完成', ' · 3 laps done')}</p><h2>${r.position === 1 ? tr("冠軍，是你！", "You\'re the champion!") : tr("漂亮地衝過終點！", "What a finish!")}</h2><div class="finish-summary"><span class="finish-place">${r.position}<small> / 4</small></span><div><small>${tr('三圈總時間', '3-lap total')}</small><strong>${time(r.time)}</strong><span>${tr('本機最快', 'Best')} ${time(r.best)}</span></div></div><div class="lap-splits">${r.lapTimes.map((t, i) => `<span>${tr(`第 ${i + 1} 圈`, `Lap ${i + 1}`)}<strong>${time(t)}</strong></span>`).join("")}</div><ol class="finish-standings">${r.standings.map((s) => `<li class="${s.name === "Anbo" ? "is-you" : ""}"><span>${mascotLabel(s.name)}${s.name === "Anbo" ? tr("（你）", " (you)") : ""}</span><span>${s.time !== null ? time(s.time) : tr("尚未完賽", "Still racing")}</span></li>`).join("")}</ol><button class="primary" id="race-again">${tr('再比一場 →', 'Race again →')}</button><a class="text-button" href="./adventure.html">${tr('回森林冒險', 'Back to Forest Adventure')}</a>`;
  result.hidden = false;
  overlay.hidden = false;
  el("race-again").onclick = () => void begin();
  el("race-again").focus({ preventScroll: true });
}
function onEvent(event: RaceEvent) {
  if (event.type === "ready") {
    start.disabled = false;
    start.textContent = tr("上場比賽　→", "Start race  →");
  }
  if (event.type === "error") {
    start.disabled = true;
    pause.disabled = true;
    restart.disabled = true;
    welcome.hidden = true;
    result.classList.add("race-error");
    result.replaceChildren();
    const title = document.createElement("h2");
    title.textContent = tr("賽道暫時無法顯示", "The track can\'t be shown right now");
    const message = document.createElement("p");
    message.textContent = event.message;
    const retry = document.createElement("button");
    retry.className = "primary";
    retry.textContent = tr("重新載入賽道", "Reload track");
    retry.onclick = () => location.reload();
    result.append(title, message, retry);
    result.hidden = false;
    overlay.hidden = false;
  }
  if (event.type === "notice") notice(event.message);
  if (event.type === "finish") finish(event.result);
  if (event.type !== "state") return;
  const s = event.state;
  el("race-position").textContent = String(s.position);
  el("race-lap").textContent = String(s.lap);
  el("race-time").textContent = time(s.seconds);
  el("race-speed").textContent = String(Math.round(s.speed / 30));
  const gliding = s.flight.gliding;
  el('touch-gas').hidden = race.autoGas && !gliding;
  const gasLabel = gliding ? tr('俯衝', 'Dive') : tr('油門', 'Gas'), brakeLabel = gliding ? tr('拉升', 'Climb') : tr('煞車', 'Brake');
  el('touch-gas').textContent = gasLabel;
  el('touch-gas').setAttribute('aria-label', gasLabel);
  el('touch-brake').textContent = brakeLabel;
  el('touch-brake').setAttribute('aria-label', brakeLabel);
  el("drift-fill").style.width = `${(s.driftCharge / 1.8) * 100}%`;
  el("drift-fill").classList.toggle("charged", s.driftCharge >= 0.65);
  el("drift-hint").textContent = gliding
    ? tr("↑ 俯衝加速 · ↓ 拉升延長滑翔", "↑ dive for speed · ↓ climb to glide longer")
    : s.flight.airborne
    ? s.flight.trick ? tr("特技成功，穩住落點！", "Trick! Stick the landing!") : tr("起跳時按一下甩尾鍵做特技", "Tap drift on takeoff for a trick")
    : s.drifting
    ? s.driftCharge >= 0.65
      ? tr("放開甩尾，釋放加速！", "Let go of drift to boost!")
      : tr("彎道蓄力中…", "Charging…")
    : tr("按住空白鍵＋轉向甩尾", "Hold Space + steer to drift");
  el("race-boost-status").textContent =
    s.stun > 0
      ? tr("撞暈中…", "Dizzy…")
      : s.boost > 0
        ? tr("加速中！", "Boosting!")
        : s.offroad
          ? tr("草地減速", "Grass slows you")
          : tr(vehicles.moss.name, vehicles.moss.nameEn);
  el("race-speed-panel").classList.toggle("boosting", s.boost > 0);
  const item = el<HTMLButtonElement>("race-item");
  item.disabled = !s.item || s.paused || s.stun > 0 || s.phase !== "racing";
  item.classList.toggle("has-item", s.item);
  el("item-label").textContent = s.item ? tr("回聲能量", "Echo energy") : tr("尋找道具箱", "Find an item box");
  document
    .querySelectorAll<HTMLButtonElement>('[data-race-control="item"]')
    .forEach((b) => {
      b.disabled = !s.item || s.paused || s.stun > 0 || s.phase !== "racing";
      b.classList.toggle("ready", s.item);
    });
  if (s.phase === "racing" || s.phase === "countdown") {
    const order = [{ name: "Anbo", distance: s.distance }, ...s.opponents].sort(
      (a, b) => b.distance - a.distance,
    );
    order.forEach((o, i) => {
      const row = document.querySelector<HTMLElement>(
        `[data-racer="${o.name}"]`,
      )!;
      row.style.order = String(i);
      row.querySelector(".entry-rank")!.textContent = String(i + 1);
    });
    el("race-standings-label").textContent = tr(`${s.zone}・即時名次`, `${s.zone} · Live standings`);
  }
  if (s.paused !== lastPaused) {
    lastPaused = s.paused;
    el("race-shell").classList.toggle(
      "is-locked",
      s.paused || s.phase === "finished",
    );
    pause.innerHTML = s.paused ? tr("▶ <span>繼續</span>", "▶ <span>Resume</span>") : tr("Ⅱ <span>暫停</span>", "Ⅱ <span>Pause</span>");
    pause.setAttribute("aria-label", s.paused ? tr("繼續比賽", "Resume race") : tr("暫停比賽", "Pause race"));
    if (s.paused) {
      result.innerHTML =
        tr('<span class="result-symbol">☾</span><p class="chapter">在林間暫停一下</p><h2>下一個彎道，等你。</h2><p>比賽與計時都已暫停。</p><button class="primary" id="race-resume">繼續比賽 →</button>', '<span class="result-symbol">☾</span><p class="chapter">A short break in the woods</p><h2>The next corner will wait.</h2><p>The race and the clock are paused.</p><button class="primary" id="race-resume">Resume race →</button>');
      result.hidden = false;
      overlay.hidden = false;
      el("race-resume").onclick = () => {
        race.setPaused(false);
        focus();
      };
      el("race-resume").focus({ preventScroll: true });
    } else if (s.phase !== "finished") {
      result.hidden = true;
      overlay.hidden = true;
      focus();
    }
  }
}
type Look = "standard" | "hd2d";
/** ?look= wins for sharing a link; otherwise reuse the viewer's last choice. */
function initialLook(): Look {
  const param = new URLSearchParams(location.search).get("look");
  if (param === "hd2d" || param === "standard") return param;
  try {
    return localStorage.getItem("echo-race-look") === "hd2d"
      ? "hd2d"
      : "standard";
  } catch {
    return "standard";
  }
}
const race = new RacingEngine(canvas, onEvent, initialLook());
function showLook() {
  const hd = race.lookName === "hd2d";
  el("race-look-name").textContent = hd ? "HD-2D" : tr("標準", "Standard");
  el("race-look").setAttribute("aria-pressed", String(hd));
}
showLook();
el("race-look").onclick = () => {
  race.setLook(race.lookName === "hd2d" ? "standard" : "hd2d");
  try {
    localStorage.setItem("echo-race-look", race.lookName);
  } catch {}
  showLook();
  focus();
};
start.onclick = () => void begin();
restart.onclick = () => void begin();
pause.onclick = () => {
  race.setPaused(!race.paused);
  if (!race.paused) focus();
};
el("race-sound").onclick = () => {
  const on = race.toggleSound();
  el("race-sound").innerHTML = `♫ <span>${on ? tr("音效開", "Sound on") : tr("音效關", "Sound off")}</span>`;
  el("race-sound").setAttribute("aria-pressed", String(on));
  el("race-sound").setAttribute("aria-label", on ? tr("關閉音效", "Turn sound off") : tr("開啟音效", "Turn sound on"));
  focus();
};
el<HTMLInputElement>("auto-gas").onchange = (e) => {
  race.autoGas = (e.target as HTMLInputElement).checked;
  el("touch-gas").hidden = race.autoGas && !race.flight.gliding;
  notice(race.autoGas ? tr("自動油門已開啟", "Auto gas on") : tr("自動油門已關閉，按 ↑ 或 W 加速。", "Auto gas off. Press ↑ or W to speed up."));
  focus();
};
el("race-item").onclick = () => {
  race.setControl("item", true);
  setTimeout(() => race.setControl("item", false), 160);
  focus();
};
document
  .querySelectorAll<HTMLButtonElement>("[data-race-control]")
  .forEach((button) => {
    const key = button.dataset.raceControl as Control;
    button.onpointerdown = (e) => {
      e.preventDefault();
      button.setPointerCapture(e.pointerId);
      race.setControl(key, true);
      button.classList.add("held");
    };
    const release = () => {
      race.setControl(key, false);
      button.classList.remove("held");
    };
    button.onpointerup = release;
    button.onpointercancel = release;
    button.onlostpointercapture = release;
  });
mountJoystick(el("race-stick"), (x) => race.setStick(x), tr("方向搖桿", "Steering stick"));
const fullscreen = el<HTMLButtonElement>("race-fullscreen");
fullscreen.hidden = !document.fullscreenEnabled;
fullscreen.onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await el("race-shell").requestFullscreen();
    focus();
  } catch {
    notice(tr("這個瀏覽器無法切換全螢幕，仍可直接遊玩。", "This browser can\'t go full screen, but you can still play."));
  }
};
window.addEventListener("pagehide", () => race.setPaused(true));
const garage = el<HTMLDialogElement>("kart-dialog");
let garagePaused = false;
const openGarage = () => {
  garagePaused = race.active && !race.paused;
  if (garagePaused) race.setPaused(true);
  garage.showModal();
};
el("open-kart").onclick = openGarage;
el("open-kart-bar").onclick = openGarage;
el("close-kart").onclick = () => garage.close();
garage.addEventListener("close", () => {
  if (garagePaused) race.setPaused(false);
  garagePaused = false;
});
garage.addEventListener("click", (e) => {
  if (e.target !== garage) return;
  const b = garage.getBoundingClientRect();
  if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom) garage.close();
});
// Keep race keys (Escape pause toggle, steering) away from the engine while the garage is open.
for (const type of ["keydown", "keyup"] as const)
  window.addEventListener(type, (e) => { if (garage.open) e.stopImmediatePropagation(); }, true);
document.querySelectorAll<HTMLButtonElement>("[data-direction]").forEach((button) => (button.onclick = () => {
  const index = Number(button.dataset.direction);
  el("kart-large").style.backgroundPosition = kartFrame(index);
  el("kart-large").setAttribute("aria-label", tr(`安寶賽車${directions[index]}`, `Anbo\'s kart, ${directions[index].toLowerCase()}`));
  el("direction-label").textContent = directions[index];
  document.querySelectorAll("[data-direction]").forEach((b) => {
    b.classList.toggle("active", b === button);
    b.setAttribute("aria-pressed", String(b === button));
  });
}));
// On phones the crew, record and driving tips live in this swipeable guide instead of below the track.
mountGuide({
  id: "race", title: tr("森林賽車", "Forest Race"),
  // Like the other games, the race stays paused after the guide closes; the player resumes when ready.
  onOpen: () => { if (race.active && !race.paused) race.setPaused(true); },
  pages: tr([
    { icon: portraits["../assets/sprites/1x/angoo.png"], title: "三圈決勝", body: `<p>和 <b>安咕、安米、安婕</b> 一起跑 <b>3 圈</b>，搶第一個衝線。</p><p>上方可以換賽道：${courses.map(c => c.name).join("、")}。</p>` },
    { icon: "🕹", title: "轉向與油門", body: "<p>手機：左邊<b>搖桿</b>左右推來轉向，推越多轉越急；右邊有<b>煞車</b>。</p><p>鍵盤：<kbd>←</kbd><kbd>→</kbd> 轉向、<kbd>↓</kbd> 煞車。預設<b>自動油門</b>，專心過彎就好。</p>" },
    { icon: "↝", title: "甩尾蓄力", body: "<p>彎道裡<b>按住甩尾並轉向</b>，計量條亮藍後放開，就能短暫加速。</p><p>鍵盤用 <kbd>Space</kbd>。</p>" },
    { icon: itemArt, title: "回聲能量", body: "<p>撞開<b>道具箱</b>拿到回聲能量，按<b>道具</b>鈕或 <kbd>E</kbd> 啟動，抓住超車時機。</p>" },
    { icon: "⚑", title: "跳台與滑翔", body: "<p>衝上跳台會<b>自動展翼</b>：空中 <kbd>↑</kbd> 俯衝、<kbd>↓</kbd> 拉升；手機按住<b>煞車</b>也能拉升。</p><p>起跳時點一下<b>甩尾／特技</b>，落地加速更久。</p>" },
  ], [
    { icon: portraits["../assets/sprites/1x/angoo.png"], title: "Three laps to win", body: `<p>Race <b>Angoo, Anmi and Anje</b> for <b>3 laps</b> and cross the line first.</p><p>Switch tracks up top: ${courses.map(c => c.nameEn).join(", ")}.</p>` },
    { icon: "🕹", title: "Steering and gas", body: "<p>Phone: push the <b>stick</b> on the left to steer. The further you push, the sharper you turn. <b>Brake</b> is on the right.</p><p>Keyboard: <kbd>←</kbd><kbd>→</kbd> steer, <kbd>↓</kbd> brake. <b>Auto gas</b> is on, so just focus on the corners.</p>" },
    { icon: "↝", title: "Drift to charge", body: "<p>In a corner, <b>hold drift and steer</b>. Let go when the meter glows blue for a quick boost.</p><p>On a keyboard, use <kbd>Space</kbd>.</p>" },
    { icon: itemArt, title: "Echo energy", body: "<p>Smash an <b>item box</b> for echo energy, then tap <b>Item</b> or press <kbd>E</kbd> to boost past others.</p>" },
    { icon: "⚑", title: "Ramps and gliding", body: "<p>Ramps <b>open your glider</b>: in the air, <kbd>↑</kbd> dives and <kbd>↓</kbd> climbs. On a phone, hold <b>Brake</b> to climb.</p><p>Tap <b>Drift / Trick</b> on takeoff for a longer landing boost.</p>" },
  ]),
});
