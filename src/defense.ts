import "./style.css";
import "./defense.css";
import { siteHeader } from "./site-nav";
import { mountGuide, guideButton } from "./game-guide";
import { DefenseEngine, seeds, type PlantKind } from "./defense-engine";
import { DefenseView } from "./defense-view";
import shooterArt from "../assets/ui/seed-shooter.png";
import wallArt from "../assets/ui/seed-wall.png";
import iceArt from "../assets/ui/seed-ice.png";
import bombArt from "../assets/ui/bomb.png";
import treeIcon from "../assets/ui/icon-tree.png";
import heartIcon from "../assets/ui/icon-heart.png";
import dewIcon from "../assets/ui/icon-dew.png";
import starIcon from "../assets/ui/icon-star.png";
import heroArt from "../assets/ui/hero-anbo-tree.png";
import monsterIcon from "../assets/ui/icon-monster.png";
const seedArt: Record<PlantKind, string> = {
  shooter: shooterArt,
  wall: wallArt,
  ice: iceArt,
};
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
${siteHeader("defense")}
<main class="defense-main"><section class="defense-intro"><div><p class="chapter">立體森林・生命樹防線</p><h1>種下希望，炸出一條路。</h1>${guideButton()}<p>白天的園丁，危急時刻的爆破手。與 Anbo 守住這片森林。</p></div><div class="defense-record">本機最高分<strong id="best">${best.toLocaleString()}</strong></div></section>
<section class="defense-shell" aria-label="森林爆破保衛戰"><div class="defense-toolbar"><strong>森林爆破保衛戰 <small class="view-badge">3D</small></strong><div><button id="look" aria-pressed="false" title="切換畫面風格"><span class="look-prefix">畫面：</span><span id="look-name">標準</span></button><button id="sound" aria-pressed="false">音效關</button><button id="speed" aria-pressed="false" title="切換戰鬥速度（F）">▶▶ <span id="speed-name">×1</span></button><button id="pause" disabled>暫停</button><button id="restart" disabled>重來</button></div></div>
<div class="defense-hud"><span class="hud-chip hud-tree"><img src="${treeIcon}" alt=""><span><small>生命樹</small><b id="tree">10</b><i>/ 10</i></span><span class="tree-bar" aria-hidden="true"><span id="tree-fill"></span></span></span><span class="hud-chip"><small>體力</small><span id="hearts" role="img" aria-label="體力 3">${[0, 1, 2].map(() => `<img src="${heartIcon}" alt="">`).join("")}</span></span><span class="hud-chip dew"><img src="${dewIcon}" alt=""><span><small>露珠</small><b id="dew">180</b></span></span><span class="hud-chip"><img src="${starIcon}" alt=""><span><small>得分</small><b id="score">0</b></span></span><span class="hud-wave"><span id="wave">準備出發</span><span class="wave-pips" aria-hidden="true">${[1, 2, 3, 4, 5].map((n) => `<i data-pip="${n}"></i>`).join("")}</span></span></div>
<div class="defense-layout"><div class="defense-field"><canvas id="field" width="1000" height="620" tabindex="0" aria-label="9乘5森林戰場。方向鍵移動，空白鍵放炸彈，1至3選植物，Enter種在腳下，Escape暫停。"></canvas><div id="cover" class="defense-cover" data-state="intro"><div><img class="cover-hero" src="${heroArt}" alt="" aria-hidden="true"><div class="cover-copy"><p class="chapter">Echo Forest · 森林微縮戰場</p><h2 id="cover-title">小小守衛，<br>守住大大的森林。</h2><p id="cover-copy">種下射手抵擋怪物，放置炸彈清除枯木。<br>注意十字爆風，也別忘了照顧每一行。</p><button id="start" class="primary">開始守護</button><p class="cover-note"><img src="${shooterArt}" alt="">五波攻防 <img src="${bombArt}" alt="">連鎖爆破 <img src="${iceArt}" alt="">3 種植物</p><div class="cover-stats"><span><img src="${starIcon}" alt=""><b id="stat-score">0</b><small>得分</small></span><span><img src="${monsterIcon}" alt=""><b id="stat-kills">0</b><small>擊退</small></span><span><img src="${bombArt}" alt=""><b id="stat-chains">0</b><small>連鎖</small></span></div></div></div></div></div>
<aside class="seed-shelf"><h2>口袋裡的種子</h2><p>選種子，再點草地種下</p>${(Object.keys(seeds) as PlantKind[]).map((k, i) => `<button class="seed ${i === 0 ? "selected" : ""}" data-seed="${k}" aria-pressed="${i === 0}"><img class="seed-art" src="${seedArt[k]}" alt="" aria-hidden="true"><span><strong>${seeds[k].name}</strong><small>${["持續向右射擊", "高耐久，攔住怪物", "冰霧減緩移速"][i]}</small><em><img src="${dewIcon}" alt="">${seeds[k].cost}</em></span><kbd>${i + 1}</kbd></button>`).join("")}<button id="bomb" class="bomb-button"><img src="${bombArt}" alt=""><span>放炸彈</span><kbd>Space</kbd></button><small class="bomb-note">免費・同時最多 3 顆<br>倒數 2 秒・十字兩格爆風</small><button id="next" class="next-button" disabled>提前迎戰</button></aside></div>
<div class="field-legend"><span><i class="swatch anbo"></i>金色光圈：Anbo 的位置</span><span><i class="swatch blast"></i>橘色地格：即將爆炸</span><span><img class="legend-monster" src="${monsterIcon}" alt="">最右一列：怪物入口</span></div>
<p id="notice" class="defense-notice" role="status">先替每一行安排射手，缺口交給炸彈。</p>
<div class="defense-controls"><div class="direction-pad"><button data-move="0,-1" aria-label="向上移動">▲</button><button data-move="-1,0" aria-label="向左移動">◀</button><button data-move="0,1" aria-label="向下移動">▼</button><button data-move="1,0" aria-label="向右移動">▶</button></div><button id="plant-here">腳下種植 <kbd>Enter</kbd></button><span>方向鍵 / WASD 移動 · 1–3 選種子 · F 倍速 · Esc 暫停</span></div></section>
<section class="defense-guide"><article><span>01</span><h2>每一行，都是防線。</h2><p>射手放後方、樹樁擋前方。每 3 秒獲得 15 露珠，擊退怪物也有補給。</p></article><article><span>02</span><h2>放好炸彈，轉個彎。</h2><p>爆風沿十字延伸兩格。繞到斜角躲避，植物不會被己方炸彈傷害。</p></article><article><span>03</span><h2>讓危機，連鎖化解。</h2><p>爆風能引爆另一顆炸彈。炸開枯木可獲得 20 露珠，但枯木會擋住後方爆風。</p></article></section><footer><span>小小像素，大大冒險。</span><span>Echo Forest ✦ 生命樹防線</span></footer></main>`;
type Look = "standard" | "hd2d";
/** ?look= wins for sharing a link; otherwise reuse the viewer's last choice. */
function initialLook(): Look {
  const param = new URLSearchParams(location.search).get("look");
  if (param === "hd2d" || param === "standard") return param;
  try {
    return localStorage.getItem("echo-defense-look") === "hd2d"
      ? "hd2d"
      : "standard";
  } catch {
    return "standard";
  }
}
// The guide replaces the tips below the game on phones; opening it mid-battle pauses first.
let pauseForGuide = () => {};
mountGuide({
  id: "defense",
  title: "爆破保衛戰",
  onOpen: () => pauseForGuide(),
  pages: [
    { icon: shooterArt, title: "種下植物，守住每一行", body: `<p>先選種子，再點草地種下；或走到格子上按「腳下種植」。</p><ul><li><b>松果射手</b> 40 露珠：持續向右射擊</li><li><b>樹樁守衛</b> 25 露珠：高耐久，攔住怪物</li><li><b>冰霧蘑菇</b> 50 露珠：冰霧減緩移速</li></ul>` },
    { icon: dewIcon, title: "露珠從哪裡來", body: `<p>開場有 180 露珠，之後<b>每 3 秒 +15</b>。</p><p>擊退怪物 +12，用炸彈炸開枯木 +20。射手放後方、樹樁擋前方，讓每一行都有防線。</p>` },
    { icon: bombArt, title: "炸彈與連鎖", body: `<ul><li>炸彈免費，<b>同時最多 3 顆</b>，倒數 2 秒爆炸。</li><li>爆風沿<b>十字延伸兩格</b>，繞到斜角就能躲開；植物不會被自己的炸彈傷害。</li><li>爆風能引爆另一顆炸彈，形成連鎖；枯木會擋住後方爆風。</li></ul>` },
    { icon: treeIcon, title: "五波攻防", body: `<p>怪物從<b>最右一列</b>出現，走到最左邊會傷害生命樹（共 10 點）。</p><p>Anbo 有 3 點體力，被爆風打中會失去 1 點，閃爍時暫時無敵。撐過五波就勝利，剩下的生命樹與體力會加分。</p><p>地圖上：<b>金色光圈</b>是 Anbo，<b>橘色地格</b>代表即將爆炸。</p>` },
    { icon: heroArt, title: "操作方式", body: `<p><b>手機</b>：方向鍵按鈕移動，點種子再點草地種植，按「放炸彈」。</p><p><b>鍵盤</b>：<kbd>方向鍵</kbd>／<kbd>WASD</kbd> 移動、<kbd>1</kbd>–<kbd>3</kbd> 選種子、<kbd>Enter</kbd> 腳下種植、<kbd>Space</kbd> 放炸彈、<kbd>Esc</kbd> 暫停。</p><p>右上 <b>▶▶</b>（或 <kbd>F</kbd>）切換兩倍速，整場戰鬥一起加快。</p>` },
  ],
});
function mountGame() {
  const canvas = $<HTMLCanvasElement>("field");
  let graphicsLost = false;
  let view: DefenseView;
  try {
    view = new DefenseView(canvas, initialLook());
  } catch {
    $("cover").dataset.state = "error";
    $("cover-title").textContent = "無法開啟立體森林";
    $("cover-copy").textContent =
      "請啟用瀏覽器硬體加速，或使用支援 WebGL 2 的瀏覽器後重新載入。";
    $("start").textContent = "重新載入";
    $("start").onclick = () => location.reload();
    return;
  }
  const phone = matchMedia("(max-width: 700px)");
  function placeBomb() {
    if (phone.matches)
      document.querySelector(".defense-controls")!.append($("bomb"));
    else document.querySelector(".bomb-note")!.before($("bomb"));
  }
  placeBomb();
  phone.addEventListener("change", placeBomb);
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
    if (graphicsLost) return;
    game.start();
    keys.clear();
    held = null;
    $("cover").hidden = true;
    $<HTMLButtonElement>("pause").disabled = false;
    $<HTMLButtonElement>("restart").disabled = false;
    $("pause").textContent = "暫停";
    focus();
    const shell = document.querySelector(".defense-shell")!;
    if (phone.matches || shell.getBoundingClientRect().bottom > innerHeight)
      shell.scrollIntoView({ block: "start" });
    beep(520);
  }
  function pause() {
    if (graphicsLost) return;
    if (!["wave", "build"].includes(game.phase)) return;
    game.paused = !game.paused;
    keys.clear();
    held = null;
    $("pause").textContent = game.paused ? "繼續" : "暫停";
    $("cover").hidden = !game.paused;
    if (game.paused) {
      $("cover").dataset.state = "paused";
      $("cover-title").textContent = "森林，暫時安靜下來。";
      $("cover-copy").textContent = "準備好後，再一起守護生命樹。";
      $("start").textContent = "繼續守護";
      $("start").focus({ preventScroll: true });
    } else focus();
  }
  $("start").onclick = () => (game.paused ? pause() : begin());
  $("restart").onclick = begin;
  $("pause").onclick = pause;
  pauseForGuide = () => {
    if (game.active) pause();
  };
  // Fast-forward runs the whole battle (monsters, plants, fuses, Anji) at double speed.
  let speed = 1;
  try {
    if (localStorage.getItem("echo-defense-speed") === "2") speed = 2;
  } catch {}
  function showSpeed() {
    $("speed-name").textContent = `×${speed}`;
    $("speed").setAttribute("aria-pressed", String(speed === 2));
    $("speed").setAttribute("aria-label", speed === 2 ? "戰鬥兩倍速，切回一般速度" : "一般速度，切換為兩倍速");
  }
  function toggleSpeed() {
    speed = speed === 2 ? 1 : 2;
    try {
      localStorage.setItem("echo-defense-speed", String(speed));
    } catch {}
    showSpeed();
    beep(speed === 2 ? 880 : 440);
  }
  showSpeed();
  $("speed").onclick = () => {
    toggleSpeed();
    if (game.active) focus();
  };
  function showLook() {
    const hd = view.look === "hd2d";
    $("look-name").textContent = hd ? "HD-2D" : "標準";
    $("look").setAttribute("aria-pressed", String(hd));
  }
  showLook();
  $("look").onclick = () => {
    view.setLook(view.look === "hd2d" ? "standard" : "hd2d");
    try {
      localStorage.setItem("echo-defense-look", view.look);
    } catch {}
    showLook();
  };
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
    hover = view.pick(e.clientX, e.clientY);
  });
  canvas.addEventListener("pointerleave", () => (hover = null));
  canvas.addEventListener("pointerdown", (e) => {
    const cell = view.pick(e.clientX, e.clientY);
    if (cell) game.plant(cell.x, cell.y, selected);
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
        "KeyF",
      ].includes(e.code)
    ) {
      e.preventDefault();
      keys.add(e.code);
      if (e.repeat) return;
      if (e.code === "Space") game.bomb();
      if (e.code === "Enter")
        game.plant(game.player.x, game.player.y, selected);
      if (e.code === "Escape") pause();
      if (e.code === "KeyF") toggleSpeed();
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
  let last = performance.now(),
    lastPhase = game.phase,
    lastKills = 0,
    lastBombs = 0,
    lastHearts = 3,
    lastChains = 0,
    freezeUntil = 0,
    streak = 0,
    streakAt = -10000;
  const seenSparks = new WeakSet<object>();
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  /** Big centred text over the field for streaks and chain blasts. */
  function banner(text: string, tier: number) {
    const node = document.createElement("div");
    node.className = `defense-banner t${tier}`;
    node.setAttribute("aria-hidden", "true");
    node.textContent = text;
    canvas.parentElement!.append(node);
    setTimeout(() => node.remove(), 1100);
  }
  function frame(now: number) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (held) game.move(held[0], held[1]);
    else if (keys.has("ArrowLeft") || keys.has("KeyA")) game.move(-1, 0);
    else if (keys.has("ArrowRight") || keys.has("KeyD")) game.move(1, 0);
    else if (keys.has("ArrowUp") || keys.has("KeyW")) game.move(0, -1);
    else if (keys.has("ArrowDown") || keys.has("KeyS")) game.move(0, 1);
    // Hitstop: hold the battle for a few frames after a defeat, a blast or a hurt.
    if (now >= freezeUntil) for (let i = 0; i < speed; i++) game.update(dt);
    if (game.kills > lastKills) {
      streak = now - streakAt < 2500 ? streak + (game.kills - lastKills) : game.kills - lastKills;
      streakAt = now;
      if (streak >= 2) banner(`連破 ×${streak}！`, streak >= 5 ? 3 : streak >= 3 ? 2 : 1);
      freezeUntil = now + (streak >= 3 ? 80 : 50);
      view.kick(0.08 + Math.min(streak, 6) * 0.03, 0.015 + Math.min(streak, 6) * 0.006);
    }
    for (const spark of game.sparks)
      if (!seenSparks.has(spark)) {
        seenSparks.add(spark);
        if (spark.kind === "defeat") spark.power = streak >= 5 ? 2.2 : streak >= 3 ? 1.6 : streak >= 2 ? 1.3 : 1;
      }
    if (game.chains > lastChains) {
      banner(`連鎖爆破 ×${game.chains - lastChains + 1}！`, game.chains - lastChains >= 2 ? 3 : 2);
      freezeUntil = now + 110;
      view.kick(0.45, 0.04);
    } else if (game.bombs.length < lastBombs) view.kick(0.25, 0.02);
    if (game.hearts < lastHearts) {
      freezeUntil = now + 130;
      view.kick(0.4);
      if (!reduced.matches) {
        canvas.parentElement!.classList.remove("hurt");
        void canvas.parentElement!.offsetWidth;
        canvas.parentElement!.classList.add("hurt");
      }
    }
    lastHearts = game.hearts;
    lastChains = game.chains;
    view.render(game, hover, selected);
    $("tree").textContent = String(Math.max(0, game.tree));
    const hearts = Math.max(0, game.hearts);
    $("hearts")
      .querySelectorAll("img")
      .forEach((img, i) => img.classList.toggle("lost", i >= hearts));
    $("hearts").setAttribute("aria-label", `體力 ${hearts}`);
    $("tree-fill").style.width = `${Math.max(0, game.tree) * 10}%`;
    $("tree-fill").classList.toggle("low", game.tree <= 3);
    document.querySelectorAll<HTMLElement>("[data-pip]").forEach((pip) => {
      const n = Number(pip.dataset.pip);
      pip.className =
        n < game.wave || (n === game.wave && game.phase !== "wave")
          ? "done"
          : n === game.wave || (game.phase === "build" && n === game.wave + 1)
            ? "now"
            : "";
    });
    $("dew").textContent = String(game.resources);
    $("score").textContent = String(game.score);
    $("notice").textContent = game.message;
    $("notice").classList.toggle(
      "warn",
      /擊中|受傷|失守|不足|占用|最多|入口/.test(game.message),
    );
    $("wave").textContent =
      game.phase === "build"
        ? `整備 ${Math.ceil(game.timer)} 秒 · 第 ${game.wave + 1} / 5 波`
        : game.phase === "ready"
          ? "準備出發"
          : `第 ${game.wave} / 5 波`;
    $<HTMLButtonElement>("next").disabled =
      game.phase !== "build" || game.paused;
    $<HTMLButtonElement>("bomb").disabled = !game.active;
    $<HTMLButtonElement>("plant-here").disabled = !game.active;
    document
      .querySelectorAll<HTMLButtonElement>("[data-move]")
      .forEach((b) => (b.disabled = !game.active));
    document
      .querySelector(".defense-shell")!
      .classList.toggle("ended", game.phase === "won" || game.phase === "lost");
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
      $("cover").dataset.state = game.phase;
      $("cover-title").textContent =
        game.phase === "won" ? "森林，由你守住了。" : "再種一次希望。";
      $("cover-copy").textContent = game.message;
      $("stat-score").textContent = game.score.toLocaleString();
      $("stat-kills").textContent = String(game.kills);
      $("stat-chains").textContent = String(game.chains);
      $("start").textContent = "再守一場";
      $<HTMLButtonElement>("pause").disabled = true;
      $("start").focus({ preventScroll: true });
      keys.clear();
      held = null;
    }
    lastPhase = game.phase;
    animationFrame = requestAnimationFrame(frame);
  }
  let animationFrame = requestAnimationFrame(frame);
  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    graphicsLost = true;
    game.paused = true;
    keys.clear();
    held = null;
    $("cover").hidden = false;
    $("cover").dataset.state = "error";
    $("cover-title").textContent = "森林畫面暫時中斷";
    $("cover-copy").textContent =
      "請重新載入以恢復立體場景，本機最高分會保留。";
    $("start").textContent = "重新載入";
    $("start").onclick = () => location.reload();
    $<HTMLButtonElement>("pause").disabled = true;
    $<HTMLButtonElement>("restart").disabled = true;
  });
  if (import.meta.env.DEV) {
    Object.assign(window, {
      __defense: game,
      __defenseView: {
        cell: (x: number, y: number) => view.screenCell(x, y),
        snapshot: () => view.diagnostics(),
      },
    });
  }
  if (import.meta.hot)
    import.meta.hot.dispose(() => {
      cancelAnimationFrame(animationFrame);
      view.dispose();
    });
}
mountGame();
