import kartUrl from "../assets/generated/anbo-kart-eight-directions.png?url";
import rivalsUrl from "../assets/generated/forest-rival-karts.png?url";
import forestUrl from "../assets/generated/forest-background.png?url";
import propsUrl from "../assets/generated/forest-race-props.png?url";
import {
  entries,
  vehicles,
  track,
  curveAt,
  TRACK_LENGTH,
  SEGMENT_LENGTH,
  LAPS,
  mod,
  clamp,
  itemBoxes,
  boostPads,
  obstacles,
  zoneNames,
} from "./racing-data";

export type RacePhase =
  | "loading"
  | "ready"
  | "countdown"
  | "racing"
  | "finished"
  | "error";
export type Control = "left" | "right" | "gas" | "brake" | "drift" | "item";
export interface RaceResult {
  position: number;
  time: number;
  best: number;
  lapTimes: number[];
  standings: { name: string; time: number | null; finished: boolean }[];
}
export interface RaceSnapshot {
  phase: RacePhase;
  paused: boolean;
  distance: number;
  x: number;
  speed: number;
  seconds: number;
  lap: number;
  position: number;
  curve: number;
  nextCurve: number;
  driftCharge: number;
  drifting: boolean;
  boost: number;
  item: boolean;
  countdown: number;
  lapTimes: number[];
  collisions: number;
  offroad: boolean;
  boostsUsed: number;
  driftBoosts: number;
  opponents: { name: string; distance: number; x: number; finished: boolean }[];
  autoGas: boolean;
  zone: string;
  checkpoints: number;
}
export type RaceEvent =
  | { type: "ready" }
  | { type: "error"; message: string }
  | { type: "state"; state: RaceSnapshot }
  | { type: "notice"; message: string }
  | { type: "finish"; result: RaceResult };
interface Opponent {
  entry: (typeof entries)[number];
  distance: number;
  x: number;
  speed: number;
  finishTime: number | null;
}
interface Projection {
  x: number;
  y: number;
  w: number;
  scale: number;
  index: number;
  distance: number;
}
const W = 640,
  H = 400,
  HORIZON = 115,
  ROAD_WIDTH = 950,
  CAMERA_HEIGHT = 880,
  CAMERA_DEPTH = 0.92,
  CAMERA_BACK = 950;
const colors = [
  {
    grass: "#5c8c55",
    grassAlt: "#628f54",
    road: "#a89468",
    roadAlt: "#ad996e",
    edge: "#eee0ad",
    stripe: "#8b6c48",
  },
  {
    grass: "#3e7a63",
    grassAlt: "#458069",
    road: "#8f987a",
    roadAlt: "#949d80",
    edge: "#d6dfb9",
    stripe: "#536e5e",
  },
  {
    grass: "#8eab59",
    grassAlt: "#94b161",
    road: "#bd9d68",
    roadAlt: "#c3a46e",
    edge: "#f6e0a2",
    stripe: "#9a6947",
  },
];
export class RacingEngine {
  phase: RacePhase = "loading";
  paused = false;
  autoGas = true;
  sound = false;
  distance = 0;
  x = 0;
  speed = 0;
  seconds = 0;
  countdown = 3;
  lapTimes: number[] = [];
  driftCharge = 0;
  drifting = false;
  boost = 0;
  item = false;
  collisions = 0;
  boostsUsed = 0;
  driftBoosts = 0;
  controls: Record<Control, boolean> = {
    left: false,
    right: false,
    gas: false,
    brake: false,
    drift: false,
    item: false,
  };
  opponents: Opponent[] = [];
  readonly reducedMotion = matchMedia("(prefers-reduced-motion: reduce)")
    .matches;
  private ctx: CanvasRenderingContext2D;
  private kart = new Image();
  private rivals = new Image();
  private forest = new Image();
  private props = new Image();
  private previous = 0;
  private accumulator = 0;
  private frameId = 0;
  private stateClock = 0;
  private itemQueued = false;
  private previousCount = 4;
  private driftDirection = 0;
  private hitCooldown = 0;
  private lapStart = 0;
  private reachedQuarter = 0;
  private consumed = new Set<string>();
  private audio?: AudioContext;
  private engineOsc?: OscillatorNode;
  private engineGain?: GainNode;
  private readyPromise: Promise<void>;
  private destroyed = false;
  private onKeyDown = (e: KeyboardEvent) => this.key(e, true);
  private onKeyUp = (e: KeyboardEvent) => this.key(e, false);
  private onBlur = () => {
    if (this.active) this.setPaused(true);
    this.release();
  };
  private onVisibility = () => {
    if (document.hidden) this.onBlur();
  };
  constructor(
    public canvas: HTMLCanvasElement,
    private emit: (event: RaceEvent) => void,
  ) {
    canvas.width = W;
    canvas.height = H;
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    this.ctx.imageSmoothingEnabled = false;
    this.opponents = this.freshOpponents();
    this.readyPromise = Promise.all(
      [
        [this.kart, kartUrl],
        [this.rivals, rivalsUrl],
        [this.forest, forestUrl],
        [this.props, propsUrl],
      ].map(
        ([image, url]) =>
          new Promise<void>((resolve, reject) => {
            const img = image as HTMLImageElement;
            img.onload = () => resolve();
            img.onerror = () =>
              reject(new Error("賽車素材載入失敗，請重新整理。"));
            img.src = url as string;
          }),
      ),
    )
      .then(() => {
        if (this.destroyed) return;
        this.phase = "ready";
        this.emit({ type: "ready" });
        this.sendState();
      })
      .catch((e) => {
        this.phase = "error";
        this.emit({ type: "error", message: String(e.message) });
      });
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("visibilitychange", this.onVisibility);
    this.frameId = requestAnimationFrame(this.frame);
    if (import.meta.env.DEV)
      (window as unknown as { __race: unknown }).__race = {
        snapshot: () => this.snapshot(),
      };
  }
  get active() {
    return this.phase === "countdown" || this.phase === "racing";
  }
  private freshOpponents(): Opponent[] {
    return entries
      .slice(1)
      .map((entry, i) => ({
        entry,
        distance: 250 + i * 320,
        x: [-0.48, 0.46, 0][i],
        speed: 0,
        finishTime: null,
      }));
  }
  async start() {
    await this.readyPromise;
    if (this.phase === "error" || this.destroyed) return;
    this.release();
    this.distance = 0;
    this.x = 0;
    this.speed = 0;
    this.seconds = 0;
    this.countdown = 3;
    this.lapTimes = [];
    this.lapStart = 0;
    this.reachedQuarter = 0;
    this.driftCharge = 0;
    this.drifting = false;
    this.boost = 0;
    this.item = false;
    this.collisions = 0;
    this.boostsUsed = 0;
    this.driftBoosts = 0;
    this.hitCooldown = 0;
    this.itemQueued = false;
    this.previousCount = 4;
    this.consumed.clear();
    this.opponents = this.freshOpponents();
    this.phase = "countdown";
    this.paused = false;
    this.accumulator = 0;
    this.audioInit();
    this.sendState();
  }
  setPaused(value: boolean) {
    if (!this.active || this.paused === value) return;
    this.paused = value;
    this.release();
    this.accumulator = 0;
    this.audioVolume();
    this.sendState();
  }
  setControl(control: Control, value: boolean) {
    if (
      control === "item" &&
      value &&
      !this.controls.item &&
      this.phase === "racing" &&
      !this.paused
    )
      this.itemQueued = true;
    this.controls[control] = value;
  }
  release() {
    this.itemQueued = false;
    for (const k of Object.keys(this.controls) as Control[])
      this.controls[k] = false;
    document
      .querySelectorAll("[data-race-control]")
      .forEach((b) => b.classList.remove("held"));
  }
  private key(e: KeyboardEvent, down: boolean) {
    const target = e.target as HTMLElement;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLTextAreaElement
    )
      return;
    if (
      (target?.tagName === "BUTTON" || target?.tagName === "A") &&
      ["Space", "Enter"].includes(e.code)
    )
      return;
    const keys: Record<string, Control> = {
      ArrowLeft: "left",
      KeyA: "left",
      ArrowRight: "right",
      KeyD: "right",
      ArrowUp: "gas",
      KeyW: "gas",
      ArrowDown: "brake",
      KeyS: "brake",
      Space: "drift",
      ShiftLeft: "drift",
      ShiftRight: "drift",
      KeyE: "item",
    };
    if (keys[e.code] && this.active) {
      e.preventDefault();
      this.setControl(keys[e.code], down);
    }
    if (e.code === "Escape" && down && !e.repeat && this.active) {
      e.preventDefault();
      this.setPaused(!this.paused);
    }
  }
  private frame = (time: number) => {
    const dt = this.previous ? Math.min((time - this.previous) / 1000, 0.1) : 0;
    this.previous = time;
    if (!this.paused) {
      this.accumulator += dt;
      while (this.accumulator >= 1 / 120) {
        this.update(1 / 120);
        this.accumulator -= 1 / 120;
      }
    }
    this.draw();
    this.frameId = requestAnimationFrame(this.frame);
  };
  private update(dt: number) {
    if (this.phase === "countdown") {
      this.countdown -= dt;
      const n = Math.ceil(this.countdown);
      if (n !== this.previousCount) {
        this.previousCount = n;
        this.tone(n === 0 ? "go" : "count");
      }
      if (this.countdown <= 0) {
        this.phase = "racing";
        this.countdown = 0;
        this.emit({ type: "notice", message: "出發！循著晨光，跑完三圈。" });
      }
      this.stateClock += dt;
      if (this.stateClock > 0.08) {
        this.sendState();
        this.stateClock = 0;
      }
      return;
    }
    if (this.phase !== "racing") return;
    this.seconds += dt;
    this.boost = Math.max(0, this.boost - dt);
    this.hitCooldown = Math.max(0, this.hitCooldown - dt);
    const ratio = this.speed / vehicles.moss.topSpeed,
      curve = curveAt(this.distance),
      axis = Number(this.controls.right) - Number(this.controls.left);
    const wasDrifting = this.drifting;
    if (
      !this.controls.drift ||
      !axis ||
      this.speed < 1100 ||
      Math.abs(this.x) > 1.06
    ) {
      if (
        wasDrifting && this.driftCharge >= 0.65 &&
        this.speed >= 1100 && Math.abs(this.x) <= 1.06 && !this.controls.brake
      ) {
        this.boost = Math.max(
          this.boost,
          1.1 + Math.min(this.driftCharge, 1.8) * 0.45,
        );
        this.driftBoosts++;
        this.emit({ type: "notice", message: "甩尾加速！" });
        this.tone("boost");
      }
      this.drifting = false;
      this.driftCharge = 0;
      this.driftDirection = 0;
    } else {
      if (!wasDrifting) {
        this.driftDirection = axis;
        this.driftCharge = 0;
      }
      this.drifting = true;
      if (axis !== this.driftDirection) {
        this.driftDirection = axis;
        this.driftCharge = 0;
      }
      // Charge only while negotiating a corner, not by spinning on a straight.
      if (Math.abs(curve) > 0.35)
        this.driftCharge = Math.min(1.8, this.driftCharge + dt);
    }
    const steer =
      axis *
      (this.drifting ? 1.2 : 1.5) *
      Math.min(1, ratio + 0.15) *
      vehicles.moss.handling;
    const centrifugal =
      curve * 0.22 * ratio * ratio * (this.drifting ? 0.7 : 1);
    this.x = clamp(this.x + (steer - centrifugal) * dt, -1.75, 1.75);
    const offroad = Math.abs(this.x) > 1.05;
    let target = this.autoGas || this.controls.gas ? vehicles.moss.topSpeed : 0;
    if (this.boost > 0) target = vehicles.moss.topSpeed * 1.34;
    if (this.controls.brake) target = 0;
    if (offroad) target = Math.min(target, 1450);
    const acceleration = this.controls.brake
      ? 4800
      : this.speed > target
        ? offroad
          ? 4300
          : 1800
        : vehicles.moss.acceleration;
    this.speed += clamp(
      target - this.speed,
      -acceleration * dt,
      acceleration * dt,
    );
    if (this.itemQueued && this.item) {
      this.item = false;
      this.boost = 2.4;
      this.boostsUsed++;
      this.tone("boost");
      this.emit({ type: "notice", message: "回聲能量啟動！" });
    }
    this.itemQueued = false;
    const before = this.distance;
    this.distance += this.speed * dt;
    const crossed = (z: number) => {
      const lap = Math.floor(before / TRACK_LENGTH);
      return [lap, lap + 1].find(
        (l) =>
          before < l * TRACK_LENGTH + z &&
          this.distance >= l * TRACK_LENGTH + z,
      );
    };
    for (let i = 0; i < itemBoxes.length; i++) {
      const p = itemBoxes[i],
        lap = crossed(p.z);
      if (lap !== undefined && Math.abs(this.x - p.x) < 0.32 && !this.item) {
        const key = `item-${lap}-${i}`;
        if (!this.consumed.has(key)) {
          this.consumed.add(key);
          this.item = true;
          this.tone("item");
          this.emit({
            type: "notice",
            message: "獲得回聲能量！按 E 或點道具按鈕加速。",
          });
        }
      }
    }
    for (let i = 0; i < boostPads.length; i++) {
      const p = boostPads[i],
        lap = crossed(p.z);
      if (lap !== undefined && Math.abs(this.x - p.x) < 0.4) {
        this.boost = Math.max(this.boost, 1.1);
        this.tone("boost");
      }
    }
    for (let i = 0; i < obstacles.length; i++) {
      const p = obstacles[i];
      if (crossed(p.z) !== undefined && Math.abs(this.x - p.x) < 0.23)
        this.hit("碰到樹樁！回到賽道繼續追。");
    }
    this.opponents.forEach((o, i) => {
      if (o.finishTime !== null) return;
      const vehicle = vehicles[o.entry.vehicleId];
      const c = curveAt(o.distance);
      const targetX = Math.sin(o.distance / 6500 + i * 2) * 0.53;
      o.x += clamp(targetX - o.x, -dt * 0.65, dt * 0.65);
      let top = vehicle.topSpeed * (1 - Math.min(Math.abs(c), 4) * 0.028);
      // Traffic avoidance alters opponent lanes; no teleporting or lap-based rubber band.
      const nearObstacle = obstacles.find(
        (p) =>
          mod(p.z - o.distance, TRACK_LENGTH) < 1100 &&
          Math.abs(p.x - o.x) < 0.4,
      );
      if (nearObstacle) o.x += Math.sign(o.x - nearObstacle.x || 1) * dt * 0.8;
      if (
        Math.abs(o.distance - this.distance) < 600 &&
        Math.abs(o.x - this.x) < 0.3
      ) {
        o.x += Math.sign(o.x - this.x || i - 1 || 1) * dt * 0.5;
        top *= 0.96;
      }
      o.x = clamp(o.x, -0.82, 0.82);
      o.speed += clamp(top - o.speed, -3000 * dt, vehicle.acceleration * dt);
      o.distance += o.speed * dt;
      if (
        Math.abs(o.distance - this.distance) < 145 &&
        Math.abs(o.x - this.x) < 0.24 &&
        this.speed > o.speed - 250
      ) {
        this.hit("擦到對手了，找機會再超車！");
        this.x = clamp(
          this.x + Math.sign(this.x - o.x || 1) * 0.15,
          -1.75,
          1.75,
        );
      }
      if (o.distance >= TRACK_LENGTH * LAPS) {
        o.distance = TRACK_LENGTH * LAPS;
        o.finishTime = this.seconds;
      }
    });
    // Sequential quarter checkpoints and forward-only distance prevent false laps.
    while (this.distance >= ((this.reachedQuarter + 1) * TRACK_LENGTH) / 4) {
      this.reachedQuarter++;
      if (this.reachedQuarter % 4 === 0) {
        this.lapTimes.push(this.seconds - this.lapStart);
        this.lapStart = this.seconds;
        if (this.reachedQuarter < 12) {
          this.tone("lap");
          this.emit({
            type: "notice",
            message:
              this.reachedQuarter === 8
                ? "最後一圈！把握每一個彎道。"
                : "第二圈！繼續追上前面的夥伴。",
          });
        }
      }
    }
    if (this.reachedQuarter >= LAPS * 4) {
      this.finish();
      return;
    }
    this.audioVolume();
    this.stateClock += dt;
    if (this.stateClock > 0.08) {
      this.sendState();
      this.stateClock = 0;
    }
  }
  private hit(message: string) {
    if (this.hitCooldown > 0) return;
    this.speed *= 0.48;
    this.hitCooldown = 1.5;
    this.boost = 0;
    this.drifting = false;
    this.driftCharge = 0;
    this.collisions++;
    this.tone("hit");
    this.emit({ type: "notice", message });
  }
  private finish() {
    this.distance = TRACK_LENGTH * LAPS;
    this.phase = "finished";
    this.speed = 0;
    this.release();
    this.audioVolume();
    this.tone("finish");
    let best = this.seconds;
    try {
      const prior = Number(localStorage.getItem("echo-forest-race-best-v1"));
      if (Number.isFinite(prior) && prior > 0)
        best = Math.min(prior, this.seconds);
      localStorage.setItem("echo-forest-race-best-v1", String(best));
    } catch {
      /* Storage is optional. */
    }
    const standings = [
      { name: "Anbo", time: this.seconds, finished: true },
      ...this.opponents.map((o) => ({
        name: o.entry.name,
        time: o.finishTime,
        finished: o.finishTime !== null,
        distance: o.distance,
      })),
    ].sort((a, b) => {
      if (a.time !== null && b.time !== null)
        return a.time - b.time || (a.name === "Anbo" ? 1 : b.name === "Anbo" ? -1 : 0);
      if (a.time !== null) return -1;
      if (b.time !== null) return 1;
      return (
        (b as { distance: number }).distance -
        (a as { distance: number }).distance
      );
    });
    this.sendState();
    this.emit({
      type: "finish",
      result: {
        position: this.position(),
        time: this.seconds,
        best,
        lapTimes: [...this.lapTimes],
        standings,
      },
    });
  }
  private position() {
    return (
      1 +
      this.opponents.filter(
        (o) => o.finishTime !== null || o.distance > this.distance,
      ).length
    );
  }
  snapshot(): RaceSnapshot {
    return {
      phase: this.phase,
      paused: this.paused,
      distance: this.distance,
      x: this.x,
      speed: this.speed,
      seconds: this.seconds,
      lap: Math.min(LAPS, Math.floor(this.distance / TRACK_LENGTH) + 1),
      position: this.position(),
      curve: curveAt(this.distance),
      nextCurve: curveAt(this.distance + 2200),
      driftCharge: this.driftCharge,
      drifting: this.drifting,
      boost: this.boost,
      item: this.item,
      countdown: this.countdown,
      lapTimes: [...this.lapTimes],
      collisions: this.collisions,
      offroad: Math.abs(this.x) > 1.05,
      boostsUsed: this.boostsUsed,
      driftBoosts: this.driftBoosts,
      opponents: this.opponents.map((o) => ({
        name: o.entry.name,
        distance: o.distance,
        x: o.x,
        finished: o.finishTime !== null,
      })),
      autoGas: this.autoGas,
      zone: zoneNames[
        track[Math.floor(mod(this.distance, TRACK_LENGTH) / SEGMENT_LENGTH)]
          .zone
      ],
      checkpoints: this.reachedQuarter,
    };
  }
  private sendState() {
    this.emit({ type: "state", state: this.snapshot() });
  }
  private polygon(points: number[], fill: string) {
    const c = this.ctx;
    c.fillStyle = fill;
    c.beginPath();
    c.moveTo(Math.round(points[0]), Math.round(points[1]));
    for (let i = 2; i < points.length; i += 2)
      c.lineTo(Math.round(points[i]), Math.round(points[i + 1]));
    c.closePath();
    c.fill();
  }
  private quad(a: Projection, b: Projection, extra: number, color: string) {
    this.polygon(
      [
        a.x - a.w * extra,
        a.y,
        a.x + a.w * extra,
        a.y,
        b.x + b.w * extra,
        b.y,
        b.x - b.w * extra,
        b.y,
      ],
      color,
    );
  }
  private draw() {
    const c = this.ctx;
    c.imageSmoothingEnabled = false;
    c.fillStyle = "#acd3b0";
    c.fillRect(0, 0, W, H);
    if (!this.forest.complete || !this.forest.naturalWidth) return;
    // The large background is an asset; all road geometry and gameplay objects are live.
    const bgX = -28 - this.x * 9 - Math.sin(this.distance / 14000) * 18;
    c.drawImage(this.forest, bgX, -63, 704, 300);
    const zone =
        track[Math.floor(mod(this.distance, TRACK_LENGTH) / SEGMENT_LENGTH)]
          .zone,
      col = colors[zone];
    c.fillStyle = col.grass;
    c.fillRect(0, HORIZON, W, H - HORIZON);
    const camera = this.distance - CAMERA_BACK,
      base = Math.floor(camera / SEGMENT_LENGTH),
      fraction = mod(camera, SEGMENT_LENGTH) / SEGMENT_LENGTH;
    let lateral = 0,
      dx = -track[mod(base, track.length)].curve * fraction;
    const projections: Projection[] = [];
    for (let n = 0; n < 105; n++) {
      const idx = mod(base + n, track.length),
        z = (n - fraction) * SEGMENT_LENGTH;
      const scale = CAMERA_DEPTH / Math.max(1, z);
      projections.push({
        x: W / 2 + (scale * (lateral - this.x * ROAD_WIDTH) * W) / 2,
        y: HORIZON + scale * CAMERA_HEIGHT * (H - HORIZON),
        w: (scale * ROAD_WIDTH * W) / 2,
        scale,
        index: idx,
        distance: camera + z,
      });
      lateral += dx;
      dx += track[idx].curve;
    }
    for (let n = projections.length - 2; n >= 1; n--) {
      const a = projections[n],
        b = projections[n + 1];
      if (a.y < 0 || b.y > H || a.y <= b.y) continue;
      const palette = colors[track[a.index].zone];
      c.fillStyle =
        Math.floor(a.index / 3) % 2 ? palette.grass : palette.grassAlt;
      c.fillRect(0, Math.round(b.y), W, Math.round(a.y) - Math.round(b.y));
      this.quad(
        a,
        b,
        1.13,
        Math.floor(a.index / 3) % 2 ? palette.edge : palette.stripe,
      );
      this.quad(
        a,
        b,
        1,
        Math.floor(a.index / 3) % 2 ? palette.road : palette.roadAlt,
      );
      if (a.index % 6 < 3) {
        for (const lane of [-1 / 3, 1 / 3])
          this.polygon(
            [
              a.x + a.w * (lane - 0.009),
              a.y,
              a.x + a.w * (lane + 0.009),
              a.y,
              b.x + b.w * (lane + 0.009),
              b.y,
              b.x + b.w * (lane - 0.009),
              b.y,
            ],
            palette.edge,
          );
      }
      if (a.index < 3) {
        for (let j = 0; j < 12; j++)
          this.polygon(
            [
              a.x - a.w + (j * a.w) / 6,
              a.y,
              a.x - a.w + ((j + 1) * a.w) / 6,
              a.y,
              b.x - b.w + ((j + 1) * b.w) / 6,
              b.y,
              b.x - b.w + (j * b.w) / 6,
              b.y,
            ],
            (j + a.index) % 2 ? "#eee8c9" : "#314638",
          );
      }
    }
    // Back-to-front billboard sprites use the same projection as the road.
    for (let n = projections.length - 2; n >= 2; n--) {
      const p = projections[n];
      if (p.y > H + 90 || p.y < HORIZON || p.w < 1) continue;
      if (p.index % 4 === 0) {
        this.tree(
          p.x - p.w * (1.35 + (p.index % 5) * 0.12),
          p.y,
          p.w * 0.54,
          p.index % 3,
          zone,
        );
        this.tree(
          p.x + p.w * (1.5 + (p.index % 3) * 0.14),
          p.y,
          p.w * 0.6,
          (p.index + 1) % 3,
          zone,
        );
      }
      if (p.index % 9 === 0)
        this.flower(
          p.x + p.w * (p.index % 2 ? -1.2 : 1.2),
          p.y,
          p.w * 0.08,
          zone,
        );
      const z = p.index * SEGMENT_LENGTH;
      for (const pad of boostPads)
        if (Math.floor(pad.z / SEGMENT_LENGTH) === p.index) this.pad(p, pad.x);
      for (let i = 0; i < itemBoxes.length; i++) {
        const box = itemBoxes[i],
          lap = Math.floor(p.distance / TRACK_LENGTH);
        if (
          Math.floor(box.z / SEGMENT_LENGTH) === p.index &&
          !this.consumed.has(`item-${lap}-${i}`)
        )
          this.box(p.x + p.w * box.x, p.y, p.w * 0.16);
      }
      for (const obstacle of obstacles)
        if (Math.floor(obstacle.z / SEGMENT_LENGTH) === p.index)
          this.stump(p.x + p.w * obstacle.x, p.y, p.w * 0.2);
      for (const opponent of this.opponents) {
        const ahead = mod(opponent.distance - camera, TRACK_LENGTH);
        if (ahead >= n * SEGMENT_LENGTH && ahead < (n + 1) * SEGMENT_LENGTH) {
          const width = p.w * 0.43;
          this.rival(opponent, p.x + p.w * opponent.x, p.y, width);
        }
      }
      if (z === 0 && p.w > 15) this.finishArch(p);
    }
    if (this.phase !== "loading" && this.phase !== "error") {
      const playerX = W / 2 + this.x * 20,
        playerY = H - 20;
      if (this.boost > 0 && !this.reducedMotion) {
        c.strokeStyle = "#f8e4a177";
        c.lineWidth = 2;
        for (let i = 0; i < 12; i++) {
          const x = (i * 79 + this.seconds * 800) % W;
          c.beginPath();
          c.moveTo(x, 240 + (i % 4) * 28);
          c.lineTo(x + (x - W / 2) * 0.15, 265 + (i % 4) * 28);
          c.stroke();
        }
      }
      c.fillStyle = "#16392c66";
      c.beginPath();
      c.ellipse(playerX, playerY - 8, 42, 9, 0, 0, Math.PI * 2);
      c.fill();
      if (this.boost > 0) {
        c.fillStyle = "#ffe291";
        c.fillRect(
          playerX - 18,
          playerY - 5,
          8,
          10 + Math.sin(this.seconds * 40) * 4,
        );
        c.fillRect(
          playerX + 10,
          playerY - 5,
          8,
          10 + Math.cos(this.seconds * 40) * 4,
        );
      }
      if (this.drifting && !this.reducedMotion) {
        for (let i = 0; i < 5; i++) {
          c.fillStyle = this.driftCharge > 0.65 ? "#8ee9ec" : "#ffd88e";
          c.fillRect(
            playerX - 38 - i * 4 * this.driftDirection,
            playerY - 8 - i * 3,
            3,
            3,
          );
          c.fillRect(
            playerX + 34 - i * 4 * this.driftDirection,
            playerY - 8 - i * 3,
            3,
            3,
          );
        }
      }
      const cw = this.kart.width / 4,
        ch = this.kart.height / 2,
        frame = this.drifting ? (this.driftDirection > 0 ? 3 : 5) : 4;
      c.save();
      c.translate(playerX, playerY);
      c.rotate(
        this.reducedMotion
          ? 0
          : (Number(this.controls.right) - Number(this.controls.left)) * 0.025,
      );
      if (this.hitCooldown > 0.7 && Math.floor(this.seconds * 10) % 2)
        c.globalAlpha = 0.55;
      c.drawImage(
        this.kart,
        (frame % 4) * cw,
        Math.floor(frame / 4) * ch,
        cw,
        ch,
        -57,
        -112 +
          (this.reducedMotion
            ? 0
            : Math.sin(this.seconds * 25) * Math.min(1, this.speed / 3000)),
        114,
        114,
      );
      c.restore();
    }
    this.drawMap();
    if (this.phase === "countdown" && !this.paused) {
      const n = Math.ceil(this.countdown);
      c.textAlign = "center";
      c.font = "bold 76px Outfit, sans-serif";
      c.lineWidth = 6;
      c.strokeStyle = "#214738";
      c.strokeText(String(n), W / 2, 210);
      c.fillStyle = "#ffe6a1";
      c.fillText(String(n), W / 2, 210);
      c.font = "13px sans-serif";
      c.fillStyle = "#fff4d4";
      c.fillText("準備出發", W / 2, 237);
    }
    if (Math.abs(this.x) > 1.05 && this.phase === "racing") {
      c.fillStyle = "#eccd8b";
      c.textAlign = "center";
      c.font = "bold 11px sans-serif";
      c.fillText("草地會減速，轉回賽道！", W / 2, 290);
    }
  }
  private tree(x: number, y: number, size: number, kind: number, zone: number) {
    if (size < 3 || x + size < 0 || x - size > W) return;
    const frame = zone === 2 ? 2 : zone === 1 ? 1 : kind % 2,
      cw = this.props.width / 4;
    this.ctx.drawImage(
      this.props,
      frame * cw,
      0,
      cw,
      this.props.height,
      Math.round(x - size * 0.76),
      Math.round(y - size * 2.02),
      Math.round(size * 1.52),
      Math.round(size * 2.02),
    );
  }
  private flower(x: number, y: number, s: number, zone: number) {
    const c = this.ctx;
    if (s < 2) return;
    c.fillStyle = "#4d794a";
    c.fillRect(x, y - s, s * 0.3, s);
    c.fillStyle = zone === 2 ? "#ffe29a" : "#e8b29b";
    c.fillRect(x - s * 0.5, y - s * 1.4, s * 1.2, s * 0.6);
  }
  private pad(p: Projection, x: number) {
    const c = this.ctx,
      w = p.w * 0.6,
      h = Math.max(3, p.w * 0.12),
      cx = p.x + p.w * x;
    c.fillStyle = "#89c6ad";
    c.fillRect(cx - w / 2, p.y - h, w, h);
    c.strokeStyle = "#f6e7ac";
    c.lineWidth = Math.max(1, p.w * 0.012);
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      c.moveTo(cx - w * 0.3 + i * w * 0.3, p.y - h * 0.2);
      c.lineTo(cx - w * 0.15 + i * w * 0.3, p.y - h * 0.8);
      c.lineTo(cx + i * w * 0.3, p.y - h * 0.2);
      c.stroke();
    }
  }
  private box(x: number, y: number, s: number) {
    const c = this.ctx;
    if (s < 2) return;
    const bob = this.reducedMotion
      ? 0
      : Math.sin(this.seconds * 4 + x) * Math.min(s * 0.07, 3);
    y -= s * 0.2 + bob;
    c.fillStyle = "#214e40";
    c.fillRect(x - s * 0.55, y - s * 1.1, s * 1.1, s * 1.1);
    c.fillStyle = "#d5bd77";
    c.fillRect(x - s * 0.48, y - s, s * 0.96, s * 0.96);
    c.fillStyle = "#ffecac";
    c.fillRect(x - s * 0.4, y - s * 0.94, s * 0.8, s * 0.12);
    c.fillStyle = "#5f7650";
    c.fillRect(x - s * 0.13, y - s * 0.72, s * 0.23, s * 0.25);
    c.fillRect(x - s * 0.2, y - s * 0.31, s * 0.16, s * 0.15);
    c.fillRect(x + s * 0.02, y - s * 0.62, s * 0.1, s * 0.23);
  }
  private stump(x: number, y: number, s: number) {
    const cw = this.props.width / 4;
    this.ctx.drawImage(
      this.props,
      cw * 3,
      0,
      cw,
      this.props.height,
      Math.round(x - s * 0.7),
      Math.round(y - s * 1.87),
      Math.round(s * 1.4),
      Math.round(s * 1.87),
    );
  }
  private rival(o: Opponent, x: number, y: number, w: number) {
    const c = this.ctx;
    if (w < 3 || w > 260) return;
    const cell = this.rivals.width / 3;
    c.fillStyle = "#14362966";
    c.beginPath();
    c.ellipse(x, y - 3, w * 0.36, w * 0.08, 0, 0, Math.PI * 2);
    c.fill();
    c.drawImage(
      this.rivals,
      cell * o.entry.spriteColumn,
      0,
      cell,
      this.rivals.height,
      x - w / 2,
      y - w * 0.98,
      w,
      w,
    );
    if (w > 30) {
      c.font = "bold 9px sans-serif";
      c.textAlign = "center";
      c.fillStyle = "#f3edcd";
      c.fillText(o.entry.name, x, y - w * 0.9 - 4);
    }
  }
  private finishArch(p: Projection) {
    const c = this.ctx,
      w = p.w * 2.15,
      h = p.w * 0.95;
    c.fillStyle = "#665737";
    c.fillRect(p.x - w / 2, p.y - h, p.w * 0.06, h);
    c.fillRect(p.x + w / 2, p.y - h, p.w * 0.06, h);
    c.fillStyle = "#f1d487";
    c.fillRect(p.x - w / 2, p.y - h, w, p.w * 0.15);
    for (let i = 0; i < 12; i++) {
      c.fillStyle = i % 2 ? "#234f3d" : "#eff0cb";
      c.fillRect(p.x - w / 2 + (i * w) / 12, p.y - h, w / 12, p.w * 0.065);
    }
  }
  private drawMap() {
    const c = this.ctx,
      ox = 539,
      oy = 302;
    c.fillStyle = "#173b3299";
    c.fillRect(486, 249, 142, 135);
    c.strokeStyle = "#d8dba2";
    c.lineWidth = 5;
    c.lineJoin = "round";
    c.beginPath();
    track.forEach((p, i) => {
      const x = ox + p.mapX * 0.23,
        y = oy + p.mapY * 0.23;
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    });
    c.closePath();
    c.stroke();
    c.strokeStyle = "#536f51";
    c.lineWidth = 2;
    c.stroke();
    const dot = (distance: number, color: string, r: number) => {
      const p = track[Math.floor(mod(distance, TRACK_LENGTH) / SEGMENT_LENGTH)];
      c.fillStyle = "#183b2e";
      c.beginPath();
      c.arc(ox + p.mapX * 0.23, oy + p.mapY * 0.23, r + 1, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = color;
      c.beginPath();
      c.arc(ox + p.mapX * 0.23, oy + p.mapY * 0.23, r, 0, Math.PI * 2);
      c.fill();
    };
    this.opponents.forEach((o) =>
      dot(o.distance, vehicles[o.entry.vehicleId].color, 2.5),
    );
    dot(this.distance, "#ffe097", 4);
    c.fillStyle = "#e2e5bc";
    c.font = "9px sans-serif";
    c.textAlign = "left";
    c.fillText(
      zoneNames[
        track[Math.floor(mod(this.distance, TRACK_LENGTH) / SEGMENT_LENGTH)]
          .zone
      ],
      494,
      264,
    );
  }
  toggleSound() {
    this.sound = !this.sound;
    if (this.sound) this.audioInit();
    this.audioVolume();
    return this.sound;
  }
  private audioInit() {
    if (!this.sound) return;
    try {
      this.audio ??= new AudioContext();
      if (this.audio.state === "suspended")
        void this.audio.resume().catch(() => {});
      if (!this.engineOsc) {
        this.engineOsc = this.audio.createOscillator();
        this.engineOsc.type = "triangle";
        this.engineGain = this.audio.createGain();
        this.engineGain.gain.value = 0;
        this.engineOsc.connect(this.engineGain);
        this.engineGain.connect(this.audio.destination);
        this.engineOsc.start();
      }
    } catch {
      this.sound = false;
    }
  }
  private audioVolume() {
    if (!this.audio || !this.engineGain || !this.engineOsc) return;
    const on = this.sound && !this.paused && this.phase === "racing";
    this.engineGain.gain.setTargetAtTime(
      on ? 0.024 : 0,
      this.audio.currentTime,
      0.04,
    );
    this.engineOsc.frequency.setTargetAtTime(
      45 + this.speed / 42,
      this.audio.currentTime,
      0.07,
    );
  }
  private tone(type: string) {
    if (!this.sound || !this.audio) return;
    const tones: Record<string, number[]> = {
      count: [440],
      go: [880, 1100],
      item: [660, 880],
      boost: [330, 660, 990],
      hit: [160, 100],
      lap: [523, 659, 784],
      finish: [523, 659, 784, 1047],
    };
    tones[type]?.forEach((f, i) => {
      const a = this.audio!,
        o = a.createOscillator(),
        g = a.createGain(),
        t = a.currentTime + i * 0.075;
      o.type = "triangle";
      o.frequency.value = f;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.05, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
      o.connect(g);
      g.connect(a.destination);
      o.start(t);
      o.stop(t + 0.14);
    });
  }
  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.frameId);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("visibilitychange", this.onVisibility);
    void this.audio?.close();
  }
}
