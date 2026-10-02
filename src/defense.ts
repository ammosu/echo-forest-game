import "./style.css";
import "./defense.css";
import { DefenseEngine, seeds, type PlantKind } from "./defense-engine";
import anboUrl from "../assets/sprites/1x/anbo.png";
const game = new DefenseEngine();
let selected: PlantKind = "shooter",
  best = 0,
  sound = false;
try {
  best = Number(localStorage.getItem("echo-defense-best")) || 0;
} catch {}
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
document.querySelector("#app")!.innerHTML = `
<header class="site-header"><a class="brand" href="./"><span class="brand-tree"></span><span>echo forest<small>回聲森林遊樂場</small></span></a><nav aria-label="遊戲選單"><a class="nav-button" href="./">森林冒險</a><a class="nav-button" href="./race.html">森林賽車</a><span class="nav-current">爆破保衛戰</span></nav></header>
<main class="defense-main"><section class="defense-intro"><div><p class="chapter">第三場冒險・生命樹防線</p><h1>種下希望，炸出一條路。</h1><p>白天的園丁，危急時刻的爆破手。與 Anbo 守住這片森林。</p></div><div class="defense-record">本機最高分<strong id="best">${best.toLocaleString()}</strong></div></section>
<section class="defense-shell" aria-label="森林爆破保衛戰"><div class="defense-toolbar"><strong>森林爆破保衛戰</strong><div><button id="sound" aria-pressed="false">音效關</button><button id="pause" disabled>暫停</button><button id="restart" disabled>重來</button></div></div>
<div class="defense-hud"><span>生命樹 <b id="tree">10</b><small> / 10</small></span><span>體力 <b id="hearts">♥ ♥ ♥</b></span><span class="dew">露珠 <b id="dew">180</b></span><span>得分 <b id="score">0</b></span><span id="wave">準備出發</span></div>
<div class="defense-layout"><div class="defense-field"><canvas id="field" width="1000" height="620" tabindex="0" aria-label="9乘5森林戰場。方向鍵移動，空白鍵放炸彈，1至3選植物，Enter種在腳下，Escape暫停。"></canvas><div id="cover" class="defense-cover"><div><p class="chapter">Echo Forest · Grove Guard</p><h2 id="cover-title">小小守衛，<br>守住大大的森林。</h2><p id="cover-copy">種下射手抵擋怪物，放置炸彈清除枯木。<br>注意十字爆風，也別忘了照顧每一行。</p><button id="start" class="primary">開始守護</button><p class="cover-note">五波攻防 ／ 3 種植物 ／ 連鎖爆破</p></div></div></div>
<aside class="seed-shelf"><h2>口袋裡的種子</h2><p>選種子，再點草地種下</p>${(Object.keys(seeds) as PlantKind[]).map((k, i) => `<button class="seed ${i === 0 ? "selected" : ""}" data-seed="${k}" aria-pressed="${i === 0}"><span class="seed-art ${k}" aria-hidden="true">${["✿", "▥", "♠"][i]}</span><span><strong>${seeds[k].name}</strong><small>${["持續向右射擊", "高耐久，攔住怪物", "冰霧減緩移速"][i]}</small><em>${seeds[k].cost} 露珠 <kbd>${i + 1}</kbd></em></span></button>`).join("")}<button id="bomb" class="bomb-button">● 放炸彈 <kbd>Space</kbd></button><small class="bomb-note">免費・同時最多 3 顆<br>倒數 2 秒・十字兩格爆風</small><button id="next" class="next-button" disabled>提前迎戰</button></aside></div>
<p id="notice" class="defense-notice" role="status">先替每一行安排射手，缺口交給炸彈。</p>
<div class="defense-controls"><div class="direction-pad"><button data-move="0,-1" aria-label="向上移動">▲</button><button data-move="-1,0" aria-label="向左移動">◀</button><button data-move="0,1" aria-label="向下移動">▼</button><button data-move="1,0" aria-label="向右移動">▶</button></div><button id="plant-here">腳下種植 <kbd>Enter</kbd></button><span>方向鍵 / WASD 移動 · 1–3 選種子 · Esc 暫停</span></div></section>
<section class="defense-guide"><article><span>01</span><h2>每一行，都是防線。</h2><p>射手放後方、樹樁擋前方。每 3 秒獲得 15 露珠，擊退怪物也有補給。</p></article><article><span>02</span><h2>放好炸彈，轉個彎。</h2><p>爆風沿十字延伸兩格。繞到斜角躲避，植物不會被己方炸彈傷害。</p></article><article><span>03</span><h2>讓危機，連鎖化解。</h2><p>爆風能引爆另一顆炸彈。炸開枯木可獲得 20 露珠，但枯木會擋住後方爆風。</p></article></section><footer><span>小小像素，大大冒險。</span><span>Echo Forest ✦ 生命樹防線</span></footer></main>`;
const canvas = $<HTMLCanvasElement>("field"),
  ctx = canvas.getContext("2d")!;
const portrait = new Image();
portrait.src = anboUrl;
let hover: { x: number; y: number } | null = null;
const keys = new Set<string>();
let held: number[] | null = null;
let audio: AudioContext | undefined;
function beep(freq: number, duration = 0.08) {
  if (!sound) return;
  try {
    audio ??= new AudioContext();
    void audio.resume();
    const o = audio.createOscillator(),
      g = audio.createGain();
    o.type = "square";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.035, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + duration);
  } catch {}
}
function select(k: PlantKind) {
  selected = k;
  document.querySelectorAll<HTMLButtonElement>("[data-seed]").forEach((b) => {
    const yes = b.dataset.seed === k;
    b.classList.toggle("selected", yes);
    b.setAttribute("aria-pressed", String(yes));
  });
}
function focus() {
  canvas.focus({ preventScroll: true });
}
function begin() {
  game.start();
  keys.clear();
  held = null;
  $("cover").hidden = true;
  $<HTMLButtonElement>("pause").disabled = false;
  $<HTMLButtonElement>("restart").disabled = false;
  $("pause").textContent = "暫停";
  focus();
  beep(520);
}
function pause() {
  if (!["wave", "build"].includes(game.phase)) return;
  game.paused = !game.paused;
  keys.clear();
  held = null;
  $("pause").textContent = game.paused ? "繼續" : "暫停";
  $("cover").hidden = !game.paused;
  if (game.paused) {
    $("cover-title").textContent = "森林，暫時安靜下來。";
    $("cover-copy").textContent = "準備好後，再一起守護生命樹。";
    $("start").textContent = "繼續守護";
    $("start").focus({ preventScroll: true });
  } else focus();
}
$("start").onclick = () => (game.paused ? pause() : begin());
$("restart").onclick = begin;
$("pause").onclick = pause;
$("sound").onclick = () => {
  sound = !sound;
  $("sound").textContent = sound ? "音效開" : "音效關";
  $("sound").setAttribute("aria-pressed", String(sound));
  beep(660);
};
$("bomb").onclick = () => {
  game.bomb();
  beep(180);
};
$("plant-here").onclick = () =>
  game.plant(game.player.x, game.player.y, selected);
$("next").onclick = () => game.nextWave();
document
  .querySelectorAll<HTMLButtonElement>("[data-seed]")
  .forEach((b) => (b.onclick = () => select(b.dataset.seed as PlantKind)));
canvas.addEventListener("pointermove", (e) => {
  const r = canvas.getBoundingClientRect();
  hover = {
    x: Math.floor((((e.clientX - r.left) / r.width) * 1000 - 110) / 94),
    y: Math.floor((((e.clientY - r.top) / r.height) * 620 - 96) / 94),
  };
});
canvas.addEventListener("pointerleave", () => (hover = null));
canvas.addEventListener("pointerdown", (e) => {
  const r = canvas.getBoundingClientRect();
  const x = Math.floor((((e.clientX - r.left) / r.width) * 1000 - 110) / 94),
    y = Math.floor((((e.clientY - r.top) / r.height) * 620 - 96) / 94);
  game.plant(x, y, selected);
  focus();
});
window.addEventListener("keydown", (e) => {
  if (
    (e.target as HTMLElement).tagName === "BUTTON" &&
    (e.code === "Space" || e.code === "Enter")
  )
    return;
  if (
    [
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "Space",
      "Enter",
      "KeyW",
      "KeyA",
      "KeyS",
      "KeyD",
      "Escape",
      "Digit1",
      "Digit2",
      "Digit3",
    ].includes(e.code)
  ) {
    e.preventDefault();
    keys.add(e.code);
    if (e.repeat) return;
    if (e.code === "Space") game.bomb();
    if (e.code === "Enter") game.plant(game.player.x, game.player.y, selected);
    if (e.code === "Escape") pause();
    if (e.code.startsWith("Digit"))
      select(
        (["shooter", "wall", "ice"] as PlantKind[])[
          Number(e.code.slice(-1)) - 1
        ],
      );
  }
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
function unfocus() {
  keys.clear();
  held = null;
  if (game.active) pause();
}
window.addEventListener("blur", unfocus);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) unfocus();
});
document.querySelectorAll<HTMLButtonElement>("[data-move]").forEach((b) => {
  b.onpointerdown = (e) => {
    e.preventDefault();
    held = b.dataset.move!.split(",").map(Number);
    b.setPointerCapture(e.pointerId);
  };
  b.onpointerup =
    b.onpointercancel =
    b.onlostpointercapture =
      () => (held = null);
});
const X = (x: number) => 157 + x * 94,
  Y = (y: number) => 143 + y * 94;
function rect(x: number, y: number, w: number, h: number, c: string) {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}
function circle(x: number, y: number, r: number, c: string) {
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
function label(s: string, x: number, y: number, size = 16, c = "#f1edc4") {
  ctx.fillStyle = c;
  ctx.font = `600 ${size}px "Noto Sans TC", sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(s, x, y);
}
function plantArt(x: number, y: number, kind: PlantKind) {
  rect(x - 20, y + 17, 40, 10, "#244c38");
  rect(x - 5, y - 4, 10, 27, "#397a43");
  rect(x - 23, y + 7, 20, 8, "#83ad58");
  rect(x + 4, y + 2, 20, 8, "#83ad58");
  if (kind === "shooter") {
    rect(x - 21, y - 27, 36, 32, "#c7a56b");
    rect(x - 25, y - 31, 42, 12, "#755433");
    rect(x + 10, y - 16, 23, 16, "#967039");
    rect(x + 27, y - 13, 6, 10, "#3d3529");
    rect(x - 12, y - 19, 5, 6, "#283d31");
  }
  if (kind === "wall") {
    rect(x - 29, y - 29, 58, 54, "#895e40");
    rect(x - 24, y - 33, 48, 12, "#c49e68");
    rect(x - 15, y - 28, 30, 3, "#7a563a");
    rect(x - 20, y - 13, 5, 33, "#674630");
    rect(x + 13, y - 10, 5, 32, "#674630");
    rect(x - 10, y - 10, 5, 7, "#202f2b");
    rect(x + 7, y - 10, 5, 7, "#202f2b");
  }
  if (kind === "ice") {
    rect(x - 10, y - 7, 20, 31, "#d5e4ce");
    rect(x - 31, y - 14, 62, 17, "#74babb");
    rect(x - 23, y - 27, 46, 18, "#93d4d0");
    rect(x - 12, y - 34, 24, 9, "#93d4d0");
    rect(x - 16, y - 20, 8, 7, "#e3f6dc");
    rect(x + 10, y - 14, 8, 7, "#e3f6dc");
    rect(x - 6, y + 5, 4, 5, "#334e4b");
    rect(x + 4, y + 5, 4, 5, "#334e4b");
  }
}
function draw() {
  ctx.imageSmoothingEnabled = false;
  rect(0, 0, 1000, 620, "#203f37");
  for (let i = 0; i < 25; i++) {
    const x = i * 43;
    rect(x, 0, 30, 35 + (i % 4) * 8, "#2c5845");
    rect(x + 7, 28, 28, 15, "#37654c");
    rect(x, 585, 34, 35, "#30573f");
  }
  label("生命樹", 54, 82, 15, "#c6d79f");
  label("怪物來向  ←", 866, 67, 16, "#e8bf88");
  for (let y = 0; y < 5; y++) {
    rect(107, 93 + y * 94, 852, 94, "#294d3d");
    for (let x = 0; x < 9; x++) {
      rect(
        111 + x * 94,
        97 + y * 94,
        90,
        90,
        (x + y) % 2 ? "#608159" : "#6a8b60",
      );
      rect(113 + x * 94, 99 + y * 94, 86, 3, "#87a06a");
      for (let j = 0; j < 4; j++)
        rect(
          124 + x * 94 + ((j * 19 + y * 7) % 65),
          117 + y * 94 + ((j * 23 + x * 13) % 58),
          3,
          5,
          "#789767",
        );
    }
    rect(949, 99 + y * 94, 7, 87, "#b5a16d");
    label(String(y + 1), 986, Y(y) + 6, 15, "#94ad88");
  }
  rect(40, 271, 27, 128, "#7b5f40");
  rect(25, 290, 53, 18, "#7b5f40");
  circle(53, 218, 45, "#345f44");
  circle(33, 251, 32, "#477b4e");
  circle(77, 250, 30, "#477b4e");
  circle(50, 238, 35, "#6a9857");
  rect(44, 241, 7, 8, "#e6da8b");
  if (
    game.active &&
    hover &&
    hover.x >= 0 &&
    hover.x < 8 &&
    hover.y >= 0 &&
    hover.y < 5
  ) {
    ctx.strokeStyle = "#f5dc97";
    ctx.lineWidth = 3;
    ctx.strokeRect(X(hover.x) - 43, Y(hover.y) - 43, 86, 86);
  }
  for (const b of game.bombs) {
    ctx.strokeStyle = "#efc17c";
    ctx.lineWidth = 2;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ])
      for (let i = 1; i <= 2; i++) {
        const x = b.x + dx * i,
          y = b.y + dy * i;
        if (x < 0 || x > 8 || y < 0 || y > 4) break;
        ctx.strokeRect(X(x) - 38, Y(y) - 38, 76, 76);
        if (game.logs.some((l) => l.x === x && l.y === y)) break;
      }
  }
  for (const l of game.logs) {
    plantArt(X(l.x), Y(l.y), "wall");
    rect(X(l.x) - 24, Y(l.y) - 37, 49, 8, "#a78758");
    label("枯木", X(l.x), Y(l.y) + 43, 12, "#dfdbb6");
  }
  for (const p of game.plants) {
    plantArt(X(p.x), Y(p.y), p.kind);
    rect(X(p.x) - 25, Y(p.y) + 33, 50, 4, "#314c39");
    rect(
      X(p.x) - 25,
      Y(p.y) + 33,
      (50 * p.hp) / seeds[p.kind].hp,
      4,
      "#bae289",
    );
  }
  for (const e of game.enemies) {
    const x = X(e.x),
      y = Y(e.y),
      c = ["#ad83a5", "#cd925d", "#8996a4"][e.kind];
    rect(x - 20, y + 22, 15, 10, "#353d3b");
    rect(x + 6, y + 22, 15, 10, "#353d3b");
    rect(x - 25, y - 16, 50, 42, c);
    rect(x - 17, y - 28, 34, 16, c);
    rect(x - 33, y - 7, 9, 17, c);
    rect(x - 17, y - 12, 10, 10, "#efedc3");
    rect(x + 6, y - 12, 10, 10, "#efedc3");
    rect(x - 16, y - 9, 4, 6, "#3a3745");
    rect(x + 7, y - 9, 4, 6, "#3a3745");
    rect(x - 6, y + 9, 13, 5, "#4d4051");
    if (e.kind === 2) rect(x - 27, y - 26, 54, 9, "#52647b");
    if (e.slow > 0) rect(x - 28, y + 29, 56, 4, "#9ce5ea");
    rect(x - 25, y - 40, 50, 4, "#314437");
    rect(x - 25, y - 40, (50 * e.hp) / e.maxHp, 4, "#dc9e79");
  }
  for (const s of game.shots)
    circle(X(s.x), Y(s.y) - 10, 6, s.kind === "ice" ? "#d0f6f5" : "#f5d284");
  for (const b of game.bombs) {
    const x = X(b.x),
      y = Y(b.y);
    circle(
      x,
      y + 8,
      24,
      b.fuse < 0.65 && Math.floor(b.fuse * 12) % 2 ? "#dd8656" : "#293d46",
    );
    rect(x - 6, y - 23, 12, 10, "#9f9161");
    rect(x + 4, y - 30, 4, 10, "#ebc776");
    circle(x + 6, y - 32, 5, "#ffe298");
    label(b.fuse.toFixed(1), x, y + 13, 16);
  }
  for (const f of game.flames) {
    rect(X(f.x) - 39, Y(f.y) - 39, 78, 78, "#e9964a");
    rect(X(f.x) - 26, Y(f.y) - 31, 52, 64, "#f4c668");
    rect(X(f.x) - 13, Y(f.y) - 20, 26, 40, "#fff1b2");
  }
  const p = game.player;
  if (p.invincible <= 0 || Math.floor(p.invincible * 10) % 2 === 0) {
    const x = X(p.x),
      y = Y(p.y);
    circle(x, y + 27, 25, "#34553d");
    if (portrait.complete && portrait.naturalWidth)
      ctx.drawImage(portrait, x - 30, y - 42, 60, 72);
    else {
      rect(x - 20, y - 25, 40, 50, "#e2b971");
    }
    label("你", x, y - 47, 13, "#fff1be");
  }
  label("生命樹 ← 守住左側", 133, 598, 13, "#bfd0a8");
  label("爆風不傷植物 · 小心保護自己", 766, 598, 13, "#bfd0a8");
}
let last = performance.now(),
  lastPhase = game.phase,
  lastKills = 0,
  lastBombs = 0;
function frame(now: number) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (held) game.move(held[0], held[1]);
  else if (keys.has("ArrowLeft") || keys.has("KeyA")) game.move(-1, 0);
  else if (keys.has("ArrowRight") || keys.has("KeyD")) game.move(1, 0);
  else if (keys.has("ArrowUp") || keys.has("KeyW")) game.move(0, -1);
  else if (keys.has("ArrowDown") || keys.has("KeyS")) game.move(0, 1);
  game.update(dt);
  draw();
  $("tree").textContent = String(Math.max(0, game.tree));
  $("hearts").textContent = "♥ ".repeat(Math.max(0, game.hearts));
  $("dew").textContent = String(game.resources);
  $("score").textContent = String(game.score);
  $("notice").textContent = game.message;
  $("wave").textContent =
    game.phase === "build"
      ? `整備 ${Math.ceil(game.timer)} 秒 · 第 ${game.wave + 1} / 5 波`
      : game.phase === "ready"
        ? "準備出發"
        : `第 ${game.wave} / 5 波`;
  $<HTMLButtonElement>("next").disabled = game.phase !== "build" || game.paused;
  $<HTMLButtonElement>("bomb").disabled = !game.active;
  $<HTMLButtonElement>("plant-here").disabled = !game.active;
  document.querySelectorAll<HTMLButtonElement>("[data-seed]").forEach((b) => {
    b.classList.toggle(
      "unaffordable",
      game.resources < seeds[b.dataset.seed as PlantKind].cost,
    );
  });
  if (game.kills > lastKills) beep(640);
  if (game.bombs.length < lastBombs) beep(85, 0.18);
  lastKills = game.kills;
  lastBombs = game.bombs.length;
  if (
    game.phase !== lastPhase &&
    (game.phase === "won" || game.phase === "lost")
  ) {
    best = Math.max(best, game.score);
    try {
      localStorage.setItem("echo-defense-best", String(best));
    } catch {}
    $("best").textContent = best.toLocaleString();
    $("cover").hidden = false;
    $("cover-title").textContent =
      game.phase === "won" ? "森林，由你守住了。" : "再種一次希望。";
    $("cover-copy").textContent =
      `${game.message} 得分 ${game.score} · 擊退 ${game.kills} 隻 · 連鎖 ${game.chains} 次`;
    $("start").textContent = "再守一場";
    $<HTMLButtonElement>("pause").disabled = true;
    $("start").focus({ preventScroll: true });
    keys.clear();
    held = null;
  }
  lastPhase = game.phase;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
if (import.meta.env.DEV)
  (window as unknown as { __defense: DefenseEngine }).__defense = game;
