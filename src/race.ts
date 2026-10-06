import { courses, course, raceRecordKey } from './racing-courses';
import "./style.css";
import "./race.css";
import { siteHeader } from "./site-nav";
import {
  RacingEngine,
  type RaceEvent,
  type Control,
  type RaceResult,
} from "./racing-engine";
import { entries, vehicles } from "./racing-data";
import { mountJoystick } from "./joystick";
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
const directions = ["正面", "右前", "右側", "右後", "背面", "左後", "左側", "左前"];
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
let saved = "還沒有紀錄";
try {
  const n = Number(localStorage.getItem(raceRecordKey));
  if (Number.isFinite(n) && n > 0) saved = time(n);
} catch {}
document.getElementById("app")!.innerHTML = `
${siteHeader("race")}
<main class="race-main">
  <section class="intro" aria-labelledby="page-title"><div><p class="chapter"><span></span> ${course.name}・森林盃</p><h1 id="page-title">把晨光，甩在身後。</h1><p class="intro-copy">沿著林間彎道，和夥伴們一起衝向終點。</p></div><div class="race-intro-badge"><span class="checker" aria-hidden="true"></span><div><strong>3 圈 <span>／ 4 位車手</span></strong><small>三座跳台，展翼滑翔森林</small></div></div></section>
  <nav class="course-board" aria-label="選擇賽道">${courses.map(c => `<a href="?course=${c.id}" class="course-option" ${c.id === course.id ? 'aria-current="page"' : ''}><svg viewBox="-135 -265 510 530" aria-hidden="true"><polygon points="${c.points.map(p => p.join(',')).join(' ')}"/></svg><span><strong>${c.name}<small>${c.style}</small></strong><span>${c.description}</span><em>${c.id === course.id ? '目前賽道' : '選擇這條路線'}</em></span></a>`).join('')}</nav>
  <section class="game-shell race-shell is-locked" id="race-shell" aria-label="森林賽車">
    <div class="game-toolbar"><div class="trail-name"><span aria-hidden="true">⚑</span> ${course.name} <span class="trail-en">Woodland circuit</span></div><div class="toolbar-actions"><button id="race-look" aria-pressed="false" title="切換畫面風格">✧ <span id="race-look-name">標準</span></button><button id="race-sound" aria-label="開啟音效" aria-pressed="false">♫ <span>音效關</span></button><button id="race-fullscreen" aria-label="全螢幕">⛶ <span>全螢幕</span></button><button id="race-pause" aria-label="暫停比賽" disabled>Ⅱ <span>暫停</span></button><button id="race-restart" aria-label="重新比賽" disabled>↻ <span>重來</span></button></div></div>
    <div class="race-stage"><canvas id="race-canvas" tabindex="0" aria-label="森林賽車，方向鍵轉向，空白鍵甩尾，E 使用道具，Escape 暫停"></canvas>
      <div class="race-hud" id="race-hud" hidden><div class="race-position"><span><img src="${flagIcon}" alt="">目前名次</span><strong><b id="race-position">4</b><small> / 4</small></strong></div><div class="race-progress"><span><img src="${lapIcon}" alt="">圈數 <b id="race-lap">1</b><small> / 3</small></span><strong><img src="${timerIcon}" alt=""><span id="race-time">00:00.00</span></strong></div></div>
      <div class="race-speed" id="race-speed-panel" hidden><div><img src="${speedIcon}" alt=""><b id="race-speed">0</b><span>km/h</span><em id="race-boost-status">苔綠號</em></div><div class="drift-meter"><span id="drift-fill"></span></div><small id="drift-hint">按住空白鍵＋轉向甩尾</small></div>
      <button class="race-item" id="race-item" disabled hidden aria-label="使用回聲能量"><span id="item-icon"><img src="${itemArt}" alt=""></span><span id="item-label">尋找道具箱</span><kbd>E</kbd></button>
      <div class="race-notice" id="race-notice" role="status" aria-live="polite"></div>
      <div class="race-overlay" id="race-overlay"><div class="race-welcome" id="race-welcome"><p class="welcome-label">Echo Forest Kart</p><h2>下一個彎道，<br>換你領先。</h2><p>和 Angoo、Anmi、Anje 一起出發。<br>甩尾蓄力、抓住加速帶，跑出你的節奏。</p><div class="race-start-meta"><span>${course.name}</span><span>三圈決勝</span><span>單人競速</span></div><button class="primary" id="race-start" disabled>正在準備賽道…</button><span class="start-hint">← → 轉向 ／ 空白鍵特技 ／ 空中 ↑ 俯衝、↓ 拉升 ／ E 道具</span></div><div class="race-result" id="race-result" hidden></div></div>
    </div>
    <div class="race-touch" aria-label="賽車觸控操作"><div class="touch-stick" id="race-stick"></div><div><button data-race-control="gas" id="touch-gas" aria-label="油門" hidden>油門</button><button data-race-control="brake" id="touch-brake" aria-label="煞車">煞車</button><button data-race-control="drift" class="drift-touch" aria-label="甩尾" title="地面按住甩尾；起跳時點一下做特技">甩尾／特技</button><button data-race-control="item" class="item-touch" aria-label="觸控使用道具"><img src="${itemArt}" alt="">道具</button></div></div>
    <div class="race-caption"><div><kbd>←</kbd><kbd>→</kbd> 轉向 <kbd>Space</kbd> 甩尾 <kbd>E</kbd> 道具 <kbd>↓</kbd> 煞車</div><label><input id="auto-gas" type="checkbox" checked> 自動油門 <span>專心過彎就好</span></label></div>
  </section>
  <section class="race-details"><div class="race-racers"><div class="friends-heading"><h2>一起上場的夥伴</h2><p id="race-standings-label">你駕駛 Anbo 的苔綠號</p></div><div class="race-entry-list">${entries.map((entry, i) => `<div class="race-entry ${i === 0 ? "you" : ""}" data-racer="${entry.name}"><span class="entry-rank">${i === 0 ? "你" : i + 1}</span><img src="${portraits[`../assets/sprites/1x/${entry.characterId}.png`]}" alt="${entry.name}"><div><strong>${entry.name}</strong><small>${vehicles[entry.vehicleId].name}</small></div><span class="vehicle-dot" style="--vehicle:${vehicles[entry.vehicleId].color}"></span></div>`).join("")}</div></div><div class="race-record"><span>本機最快紀錄</span><strong id="best-time">${saved}</strong><small>三圈總時間</small></div><button class="race-garage" id="open-kart"><span class="kart-thumb" style="background-image:url('${kartSheet}');background-position:${kartFrame(1)}" aria-hidden="true"></span><span><strong>賽車工坊 <span aria-hidden="true">↗</span></strong><small>八個角度看看苔綠號</small></span></button></section>
  <section class="race-tips" aria-label="駕駛技巧"><p><span>↝</span><strong>彎道裡蓄力</strong>按住甩尾並轉向，亮藍後放開，短暫加速。</p><p><span>✦</span><strong>抓住超車時機</strong>吃到道具箱後，按 E 啟動回聲能量。</p><p><span>⚑</span><strong>選擇飛躍路線</strong>跳台自動展翼；↑ 俯衝、↓ 拉升。起跳按甩尾做特技，落地加速更久。</p></section>
  <footer><span>小小像素，大大冒險。</span><span>Echo Forest <span aria-hidden="true">✦</span> 數讀房市</span></footer>
</main>
<dialog id="kart-dialog" aria-labelledby="kart-title"><div class="workshop-top"><span>Echo Forest Garage</span><button id="close-kart" aria-label="關閉賽車工坊">✕</button></div><div class="workshop-body"><p class="chapter">賽車工坊</p><h2 id="kart-title">Anbo 的苔綠號</h2><p>森林綠車身、黃銅細節，還有熟悉的橘色耳朵。<br>點選角度，看看小車的模樣。</p><div class="kart-turntable"><div class="kart-large" id="kart-large" role="img" aria-label="Anbo 賽車正面" style="background-image:url('${kartSheet}')"></div><span id="direction-label">正面</span></div><div class="direction-list">${directions.map((name, i) => `<button class="direction ${i === 0 ? "active" : ""}" data-direction="${i}" aria-pressed="${i === 0}"><span class="kart-thumb" style="background-image:url('${kartSheet}');background-position:${kartFrame(i)}"></span>${name}</button>`).join("")}</div><div class="workshop-note"><span>八方向美術樣張</span><p>看完了？回到賽道，帶著 Anbo 衝線吧。</p><a href="${kartSheet}" download="anbo-kart-eight-directions.png">下載完整樣張 ↓</a></div></div></dialog>`;
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
  result.innerHTML = `<img class="finish-badge ${r.position === 1 ? "is-champion" : ""}" src="${r.position === 1 ? trophyArt : flagIcon}" alt=""><p class="chapter">${course.name}・三圈完成</p><h2>${r.position === 1 ? "冠軍，是你！" : "漂亮地衝過終點！"}</h2><div class="finish-summary"><span class="finish-place">${r.position}<small> / 4</small></span><div><small>三圈總時間</small><strong>${time(r.time)}</strong><span>本機最快 ${time(r.best)}</span></div></div><div class="lap-splits">${r.lapTimes.map((t, i) => `<span>第 ${i + 1} 圈<strong>${time(t)}</strong></span>`).join("")}</div><ol class="finish-standings">${r.standings.map((s) => `<li class="${s.name === "Anbo" ? "is-you" : ""}"><span>${s.name}${s.name === "Anbo" ? "（你）" : ""}</span><span>${s.time !== null ? time(s.time) : "尚未完賽"}</span></li>`).join("")}</ol><button class="primary" id="race-again">再比一場 →</button><a class="text-button" href="./adventure.html">回森林冒險</a>`;
  result.hidden = false;
  overlay.hidden = false;
  el("race-again").onclick = () => void begin();
  el("race-again").focus({ preventScroll: true });
}
function onEvent(event: RaceEvent) {
  if (event.type === "ready") {
    start.disabled = false;
    start.textContent = "上場比賽　→";
  }
  if (event.type === "error") {
    start.disabled = true;
    pause.disabled = true;
    restart.disabled = true;
    welcome.hidden = true;
    result.classList.add("race-error");
    result.replaceChildren();
    const title = document.createElement("h2");
    title.textContent = "賽道暫時無法顯示";
    const message = document.createElement("p");
    message.textContent = event.message;
    const retry = document.createElement("button");
    retry.className = "primary";
    retry.textContent = "重新載入賽道";
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
  el('touch-gas').textContent = gliding ? '俯衝' : '油門';
  el('touch-gas').setAttribute('aria-label', gliding ? '俯衝' : '油門');
  el('touch-brake').textContent = gliding ? '拉升' : '煞車';
  el('touch-brake').setAttribute('aria-label', gliding ? '拉升' : '煞車');
  el("drift-fill").style.width = `${(s.driftCharge / 1.8) * 100}%`;
  el("drift-fill").classList.toggle("charged", s.driftCharge >= 0.65);
  el("drift-hint").textContent = gliding
    ? "↑ 俯衝加速 · ↓ 拉升延長滑翔"
    : s.flight.airborne
    ? s.flight.trick ? "特技成功，穩住落點！" : "起跳時按一下甩尾鍵做特技"
    : s.drifting
    ? s.driftCharge >= 0.65
      ? "放開甩尾，釋放加速！"
      : "彎道蓄力中…"
    : "按住空白鍵＋轉向甩尾";
  el("race-boost-status").textContent =
    s.stun > 0
      ? "撞暈中…"
      : s.boost > 0
        ? "加速中！"
        : s.offroad
          ? "草地減速"
          : "苔綠號";
  el("race-speed-panel").classList.toggle("boosting", s.boost > 0);
  const item = el<HTMLButtonElement>("race-item");
  item.disabled = !s.item || s.paused || s.stun > 0 || s.phase !== "racing";
  item.classList.toggle("has-item", s.item);
  el("item-label").textContent = s.item ? "回聲能量" : "尋找道具箱";
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
    el("race-standings-label").textContent = `${s.zone}・即時名次`;
  }
  if (s.paused !== lastPaused) {
    lastPaused = s.paused;
    el("race-shell").classList.toggle(
      "is-locked",
      s.paused || s.phase === "finished",
    );
    pause.innerHTML = s.paused ? "▶ <span>繼續</span>" : "Ⅱ <span>暫停</span>";
    pause.setAttribute("aria-label", s.paused ? "繼續比賽" : "暫停比賽");
    if (s.paused) {
      result.innerHTML =
        '<span class="result-symbol">☾</span><p class="chapter">在林間暫停一下</p><h2>下一個彎道，等你。</h2><p>比賽與計時都已暫停。</p><button class="primary" id="race-resume">繼續比賽 →</button>';
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
  el("race-look-name").textContent = hd ? "HD-2D" : "標準";
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
  el("race-sound").innerHTML = `♫ <span>音效${on ? "開" : "關"}</span>`;
  el("race-sound").setAttribute("aria-pressed", String(on));
  el("race-sound").setAttribute("aria-label", on ? "關閉音效" : "開啟音效");
  focus();
};
el<HTMLInputElement>("auto-gas").onchange = (e) => {
  race.autoGas = (e.target as HTMLInputElement).checked;
  el("touch-gas").hidden = race.autoGas && !race.flight.gliding;
  notice(race.autoGas ? "自動油門已開啟" : "自動油門已關閉，按 ↑ 或 W 加速。");
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
mountJoystick(el("race-stick"), (x) => race.setStick(x), "方向搖桿");
const fullscreen = el<HTMLButtonElement>("race-fullscreen");
fullscreen.hidden = !document.fullscreenEnabled;
fullscreen.onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await el("race-shell").requestFullscreen();
    focus();
  } catch {
    notice("這個瀏覽器無法切換全螢幕，仍可直接遊玩。");
  }
};
window.addEventListener("pagehide", () => race.setPaused(true));
const garage = el<HTMLDialogElement>("kart-dialog");
let garagePaused = false;
el("open-kart").onclick = () => {
  garagePaused = race.active && !race.paused;
  if (garagePaused) race.setPaused(true);
  garage.showModal();
};
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
  el("kart-large").setAttribute("aria-label", `Anbo 賽車${directions[index]}`);
  el("direction-label").textContent = directions[index];
  document.querySelectorAll("[data-direction]").forEach((b) => {
    b.classList.toggle("active", b === button);
    b.setAttribute("aria-pressed", String(b === button));
  });
}));
