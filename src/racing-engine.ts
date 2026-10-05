import { raceRecordKey } from './racing-courses';
import { freshFlight, stepFlight, tryTrick, ramps, type FlightState } from './racing-jumps';
import {
  sweepContact,
  wallLimit,
  collisionImpulse,
  WORLD_PER_DISTANCE,
  ROAD_HALF_WIDTH,
  kartBounds,
  shapes,
  signedGap,
  kartHitsStump,
  stumpClearX,
  stumpPushOut,
  type RacePoint,
} from "./racing-collision";
import { RacingView, type RaceLook } from "./racing-view";
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
export interface ImpactState {
  stun: number;
  lateralVelocity: number;
  impact: number;
  impactTime: number;
  impactSide: number;
  impactKind: "wall" | "car" | "stump" | null;
}
type ImpactBody = ImpactState & { distance: number; x: number; speed: number; flight?: FlightState };
const freshImpact = (): ImpactState => ({
  stun: 0,
  lateralVelocity: 0,
  impact: 0,
  impactTime: -10,
  impactSide: 0,
  impactKind: null,
});
export interface RaceSnapshot extends ImpactState {
  flight: FlightState;
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
  opponents: (ImpactState & {
    flight: FlightState;
    name: string;
    distance: number;
    x: number;
    speed: number;
    finished: boolean;
  })[];
  autoGas: boolean;
  zone: string;
  checkpoints: number;
  pickupSerial: number;
  padSerial: number;
}
export type RaceEvent =
  | { type: "ready" }
  | { type: "error"; message: string }
  | { type: "state"; state: RaceSnapshot }
  | { type: "notice"; message: string }
  | { type: "finish"; result: RaceResult };
interface Opponent extends ImpactState {
  flight: FlightState;
  boost: number;
  entry: (typeof entries)[number];
  distance: number;
  x: number;
  speed: number;
  finishTime: number | null;
}
export class RacingEngine {
  flight = freshFlight();
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
  pickupSerial = 0;
  padSerial = 0;
  stun = 0;
  lateralVelocity = 0;
  impact = 0;
  impactTime = -10;
  impactSide = 0;
  impactKind: ImpactState["impactKind"] = null;
  private pairContacts = new Map<string, number>();
  controls: Record<Control, boolean> = {
    left: false,
    right: false,
    gas: false,
    brake: false,
    drift: false,
    item: false,
  };
  opponents: Opponent[] = [];
  private view?: RacingView;
  private previous = 0;
  private accumulator = 0;
  private frameId = 0;
  private stateClock = 0;
  private itemQueued = false;
  private trickPressedAt = -10;
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
  private onContextLost = (event: Event) => {
    event.preventDefault();
    this.fail("繪圖環境已中斷，比賽已停止。請重新載入賽道。");
  };
  private fail(message: string) {
    this.paused = true;
    this.release();
    this.phase = "error";
    this.audioVolume();
    this.sendState();
    this.emit({ type: "error", message });
  }
  constructor(
    public canvas: HTMLCanvasElement,
    private emit: (event: RaceEvent) => void,
    private look: RaceLook = "standard",
  ) {
    this.opponents = this.freshOpponents();
    this.readyPromise = Promise.resolve()
      .then(async () => {
        if (this.destroyed) return;
        this.view = new RacingView(canvas, this.look);
        await this.view.ready;
        if (this.destroyed || this.phase === "error") return;
        this.phase = "ready";
        this.emit({ type: "ready" });
        this.sendState();
      })
      .catch(() => {
        if (this.destroyed) return;
        this.fail(
          "無法建立立體賽道。請確認瀏覽器支援 WebGL 2、開啟硬體加速，然後重新載入。",
        );
      });
    canvas.addEventListener("webglcontextlost", this.onContextLost);
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
  get lookName() {
    return this.look;
  }
  setLook(look: RaceLook) {
    this.look = look;
    this.view?.setLook(look);
  }
  get active() {
    return this.phase === "countdown" || this.phase === "racing";
  }
  private freshOpponents(): Opponent[] {
    return entries.slice(1).map((entry, i) => ({
      entry,
      ...freshImpact(),
      flight: freshFlight(),
      distance: 250 + i * 320,
      x: [-0.48, 0.46, 0][i],
      speed: 0,
      finishTime: null,
      boost: 0,
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
    this.pickupSerial = 0;
    this.padSerial = 0;
    Object.assign(this, freshImpact());
    this.flight = freshFlight();
    this.trickPressedAt = -10;
    this.pairContacts.clear();
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
    if (control === 'drift' && value && !this.controls.drift && this.phase === 'racing' && !this.paused && this.stun <= 0) {
      this.trickPressedAt = this.seconds;
      if (tryTrick(this.flight)) this.emit({ type: 'notice', message: '特技成功！穩定落地可獲得更長加速。' });
    }
    if (
      control === "item" &&
      value &&
      !this.controls.item &&
      this.phase === "racing" &&
      !this.paused &&
      this.stun <= 0
    )
      this.itemQueued = true;
    this.controls[control] = value;
  }
  release() {
    this.trickPressedAt = -10;
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
    if (this.phase !== "error")
      this.view?.render(
        this.snapshot(),
        dt,
        Number(this.controls.right) - Number(this.controls.left),
        this.hitCooldown,
        this.consumed,
      );
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
    const playerBefore = { distance: this.distance, x: this.x };
    const opponentsBefore = this.opponents.map((o) => ({
      distance: o.distance,
      x: o.x,
    }));
    this.seconds += dt;
    for (const car of [this, ...this.opponents]) {
      // Normalize fixture/old-state fields as well as new race entries.
      car.flight ??= freshFlight();
      car.stun = Math.max(0, (car.stun ?? 0) - dt);
      car.lateralVelocity = (car.lateralVelocity ?? 0) * Math.exp(-5 * dt);
      car.impact ??= 0;
      car.impactTime ??= -10;
      car.impactSide ??= 0;
      car.impactKind ??= null;
    }
    this.boost = Math.max(0, this.boost - dt);
    this.hitCooldown = Math.max(0, this.hitCooldown - dt);
    const ratio = this.speed / vehicles.moss.topSpeed,
      curve = curveAt(this.distance),
      axis =
        this.stun > 0
          ? 0
          : Number(this.controls.right) - Number(this.controls.left);
    const wasDrifting = this.drifting;
    if (
      this.flight.airborne ||
      !this.controls.drift ||
      !axis ||
      this.speed < 1100 ||
      Math.abs(this.x) > 1.06
    ) {
      if (
        !this.flight.airborne &&
        wasDrifting &&
        this.driftCharge >= 0.65 &&
        this.speed >= 1100 &&
        Math.abs(this.x) <= 1.06 &&
        !this.controls.brake
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
    this.x += ((steer - centrifugal) * (this.flight.airborne ? .65 : 1) + this.lateralVelocity) * dt;
    const playerYaw = axis * (this.drifting ? 0.3 : 0.08);
    const playerBounds = kartBounds(playerYaw);
    this.resolveWall(this, playerBounds, (this.x - playerBefore.x) / dt);
    const offroad = !this.flight.airborne && Math.abs(this.x) > 1.05;
    let target = this.autoGas || this.controls.gas || this.flight.gliding ? vehicles.moss.topSpeed : 0;
    if (this.boost > 0) target = vehicles.moss.topSpeed * 1.34;
    if (this.flight.gliding) target *= 1 - this.flight.pitch * .10;
    const braking = this.controls.brake && !this.flight.gliding;
    if (braking) target = 0;
    if (offroad) target = Math.min(target, 1450);
    const acceleration = braking
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
    if (this.stun > 0) this.speed = 0;
    if (this.itemQueued && this.item && this.stun <= 0) {
      this.item = false;
      this.boost = 2.4;
      this.boostsUsed++;
      this.tone("boost");
      this.emit({ type: "notice", message: "回聲能量啟動！" });
    }
    this.itemQueued = false;
    const before = this.distance;
    this.distance += this.speed * dt;
    const jumpEvent = stepFlight(this.flight, playerBefore, this, dt, Number(this.controls.brake) - Number(this.controls.gas));
    if (jumpEvent === 'launch') {
      this.drifting = false; this.driftCharge = 0;
      if (this.seconds - this.trickPressedAt <= .18) tryTrick(this.flight);
      this.emit({ type: 'notice', message: this.flight.trick ? '特技成功！穩定落地可獲得更長加速。' : '展開滑翔翼！↑ 俯衝、↓ 拉升，起跳可按甩尾做特技。' });
      this.tone('boost');
    } else if (jumpEvent === 'land') {
      this.boost = Math.max(this.boost, this.flight.trick ? 1.4 : .8);
      this.emit({ type: 'notice', message: this.flight.trick ? '特技落地！加速 1.4 秒。' : '漂亮落地！獲得短暫加速。' });
      this.tone('boost');
    }
    const hitProp = (
      p: { z: number; x: number },
      shape: typeof shapes.stump,
    ) => {
      const fixed = { distance: p.z, x: p.x };
      return sweepContact(
        playerBefore,
        this,
        fixed,
        fixed,
        playerBounds,
        shape,
      );
    };
    // Resolve solid obstacles before pickups/checkpoints so blocked travel earns no progress.
    for (const p of obstacles) {
      if (this.flight.height > 1.5) continue;
      const contact = hitProp(p, shapes.stump);
      if (!contact) continue;
      // The box sweep is a broad phase; only a real trunk/body overlap counts.
      const fixed = { distance: p.z, x: p.x };
      const steps = Math.min(
        24,
        Math.max(4, Math.ceil(Math.abs(this.distance - before) / 20)),
      );
      let touched = false;
      for (let k = 1; k <= steps && !touched; k++) {
        const t = contact.time + ((1 - contact.time) * k) / steps;
        touched = kartHitsStump(
          {
            distance: playerBefore.distance + (this.distance - before) * t,
            x: playerBefore.x + (this.x - playerBefore.x) * t,
          },
          playerYaw,
          fixed,
        );
      }
      if (!touched) continue;
      if (contact.axis === "x") {
        // A side scrape nudges the kart away instead of counting as a crash.
        const away = contact.sign || Math.sign(this.x - p.x) || 1;
        this.x = clamp(stumpClearX(this, playerYaw, fixed, away), -1.75, 1.75);
        this.lateralVelocity = away * 0.35;
        this.scrape();
        continue;
      }
      this.hit("碰到樹樁！轉向繞過它再出發。");
      if (contact.sign < 0) {
        const z = playerBefore.distance - signedGap(playerBefore.distance, p.z);
        this.distance = Math.max(
          before,
          Math.min(this.distance, z - contact.extent.z - 0.01),
        );
        this.speed = 0;
      } else {
        this.x = clamp(
          stumpClearX(this, playerYaw, fixed, Math.sign(this.x - p.x || 1)),
          -1.75,
          1.75,
        );
      }
    }
    this.opponents.forEach((o, i) => {
      if (o.finishTime !== null) return;
      const vehicle = vehicles[o.entry.vehicleId];
      const c = curveAt(o.distance);
      o.boost = Math.max(0, (o.boost ?? 0) - dt);
      const upcomingPad = boostPads.find(p => mod(p.z - o.distance, TRACK_LENGTH) < 2200);
      const upcomingRamp = ramps.find((r, index) => (index + i) % 2 === 0 && mod(r.z - o.distance, TRACK_LENGTH) < 2000);
      const onRamp = ramps.find(r => mod(o.distance, TRACK_LENGTH) >= r.z && mod(o.distance, TRACK_LENGTH) < r.z + r.length && Math.abs(o.x - r.x) < r.halfWidth + .1);
      const targetX = (onRamp ?? upcomingRamp)?.x ?? (upcomingPad ? upcomingPad.x : Math.sin(o.distance / 6500 + i * 2) * 0.53);
      if (o.stun <= 0) o.x += clamp(targetX - o.x, -dt * 0.65, dt * 0.65);
      o.x += o.lateralVelocity * dt;
      // Small pace increase after lap one; actual pad contact earns a short boost.
      const pace = o.distance < TRACK_LENGTH ? 1.03 : 1.05;
      let top = vehicle.topSpeed * pace * (1 - Math.min(Math.abs(c), 4) * 0.018) * (o.boost > 0 ? 1.18 : 1);
      // Traffic avoidance alters opponent lanes; no teleporting or lap-based rubber band.
      const nearObstacle = obstacles.find(
        (p) =>
          mod(p.z - o.distance, TRACK_LENGTH) < 1100 &&
          Math.abs(p.x - o.x) < 0.4,
      );
      if (nearObstacle) o.x += Math.sign(o.x - nearObstacle.x || 1) * dt * 0.8;
      if (
        Math.abs(signedGap(o.distance, this.distance)) < 600 &&
        Math.abs(o.x - this.x) < 0.3
      ) {
        o.x += Math.sign(o.x - this.x || i - 1 || 1) * dt * 0.5;
        top *= 0.96;
      }
      this.resolveWall(o, shapes.kart, (o.x - opponentsBefore[i].x) / dt);
      o.speed += clamp(top - o.speed, -3000 * dt, vehicle.acceleration * dt);
      if (o.stun > 0) o.speed = 0;
      o.distance += o.speed * dt;
      const flightEvent = stepFlight(o.flight, opponentsBefore[i], o, dt);
      if (flightEvent === 'launch' && (i + Math.floor(o.distance / TRACK_LENGTH)) % 2 === 0) tryTrick(o.flight);
      if (flightEvent === 'land') o.boost = Math.max(o.boost, o.flight.trick ? 1.4 : .8);
      for (let padIndex = 0; padIndex < boostPads.length; padIndex++) {
        const p = boostPads[padIndex];
        const lap = Math.round((o.distance - p.z) / TRACK_LENGTH);
        const key = `opponent-${i}-pad-${lap}-${padIndex}`;
        const fixed = { distance: p.z, x: p.x };
        if (o.flight.height < .25 && !this.consumed.has(key) && sweepContact(opponentsBefore[i], o, fixed, fixed, shapes.kart, shapes.pad)) {
          this.consumed.add(key);
          o.boost = Math.max(o.boost, 1.1);
        }
      }
      if (o.stun > 0) o.boost = 0;
      for (const p of obstacles) {
        if (o.flight.height > 1.5) continue;
        const fixed = { distance: p.z, x: p.x };
        const contact = sweepContact(
          opponentsBefore[i],
          o,
          fixed,
          fixed,
          shapes.kart,
          shapes.stump,
        );
        if (!contact) continue;
        // AI steers around solid props; it obeys the same body clearance as the player.
        o.x = clamp(
          p.x + Math.sign(o.x - p.x || 1) * (contact.extent.x + 0.001),
          -0.82,
          0.82,
        );
        o.speed *= 0.7;
      }
    });
    // Physical proximity wraps around the circuit, independently of lap standings.
    const contactPair = (
      a: ImpactBody,
      b: ImpactBody,
      a0: RacePoint,
      b0: RacePoint,
      player: boolean,
    ) => {
      if (Math.abs((a.flight?.height ?? 0) - (b.flight?.height ?? 0)) > 1.5) return;
      const contact = sweepContact(
        a0,
        a,
        b0,
        b,
        player ? playerBounds : shapes.kart,
        shapes.kart,
      );
      if (!contact) return;
      if (player) {
        this.boost = 0;
        this.drifting = false;
        this.driftCharge = 0;
      }
      const indexA = a === this ? -1 : this.opponents.indexOf(a as Opponent);
      const indexB = this.opponents.indexOf(b as Opponent);
      const pairKey = `${indexA}:${indexB}`;
      if (this.seconds - (this.pairContacts.get(pairKey) ?? -10) > 0.18) {
        const massA =
          a === this
            ? vehicles.moss.mass
            : vehicles[(a as Opponent).entry.vehicleId].mass;
        const massB = vehicles[(b as Opponent).entry.vehicleId].mass;
        const va =
          contact.axis === "z"
            ? a.speed * WORLD_PER_DISTANCE
            : ((a.x - a0.x) / dt) * ROAD_HALF_WIDTH;
        const vb =
          contact.axis === "z"
            ? b.speed * WORLD_PER_DISTANCE
            : ((b.x - b0.x) / dt) * ROAD_HALF_WIDTH;
        const response = collisionImpulse(va, vb, contact.sign, massA, massB);
        if (response.closing > 0.15) {
          this.pairContacts.set(pairKey, this.seconds);
          if (contact.axis === "z") {
            a.speed = Math.max(0, response.a / WORLD_PER_DISTANCE);
            b.speed = Math.max(0, response.b / WORLD_PER_DISTANCE);
          } else {
            a.lateralVelocity += (response.a - va) / ROAD_HALF_WIDTH;
            b.lateralVelocity += (response.b - vb) / ROAD_HALF_WIDTH;
          }
          this.registerImpact(
            a,
            Math.min(1, Math.abs(response.a - va) / 18),
            "car",
            contact.axis === "x" ? contact.sign : 0,
            contact.axis === "z" && response.a < va - 14,
          );
          this.registerImpact(
            b,
            Math.min(1, Math.abs(response.b - vb) / 18),
            "car",
            contact.axis === "x" ? -contact.sign : 0,
            contact.axis === "z" && response.b < vb - 14,
          );
        }
      }
      const separateSide = (direction: number) => {
        const half = (contact.extent.x + 0.002) / 2;
        const center = clamp((a.x + b.x) / 2, -1.75 + half, 1.75 - half);
        a.x = center + direction * half;
        b.x = center - direction * half;
      };
      if (contact.axis === "x") {
        separateSide(contact.sign);
      } else if (contact.sign < 0) {
        const bWorld = a.distance - signedGap(a.distance, b.distance);
        const limit = bWorld - contact.extent.z - 0.01;
        if (limit < a0.distance) separateSide(Math.sign(a.x - b.x) || 1);
        a.distance = Math.max(a0.distance, Math.min(a.distance, limit));
      } else {
        const aWorld = b.distance - signedGap(b.distance, a.distance);
        const limit = aWorld - contact.extent.z - 0.01;
        if (limit < b0.distance) separateSide(Math.sign(a.x - b.x) || 1);
        b.distance = Math.max(b0.distance, Math.min(b.distance, limit));
      }
    };
    for (let pass = 0; pass < 3; pass++)
      this.opponents.forEach((o, i) => {
        if (o.finishTime === null)
          contactPair(this, o, playerBefore, opponentsBefore[i], true);
        for (let j = i + 1; j < this.opponents.length; j++) {
          const b = this.opponents[j];
          if (o.finishTime === null && b.finishTime === null)
            contactPair(o, b, opponentsBefore[i], opponentsBefore[j], false);
        }
      });
    for (const car of [this, ...this.opponents]) {
      if (car.flight.height > 1.5) continue;
      for (const p of obstacles) {
        const fixed = { distance: p.z, x: p.x };
        if (car === this) {
          // Side impacts from other cars cannot push the player into a trunk.
          if (!kartHitsStump(car, playerYaw, fixed)) continue;
          const out = stumpPushOut(car, playerYaw, fixed);
          car.x = clamp(out.x, -1.75, 1.75);
          car.distance = out.distance;
          continue;
        }
        const overlap = sweepContact(
          car,
          car,
          fixed,
          fixed,
          car === this ? playerBounds : shapes.kart,
          shapes.stump,
        );
        if (!overlap) continue;
        // A side impact from another car cannot push a vehicle inside a stump.
        const direction = Math.sign(car.x - p.x) || (p.x > 0 ? -1 : 1);
        car.x = clamp(
          p.x + direction * (overlap.extent.x + 0.002),
          -1.75,
          1.75,
        );
      }
    }
    for (const car of [this, ...this.opponents])
      this.resolveWall(
        car,
        car === this ? playerBounds : shapes.kart,
        car.lateralVelocity,
      );
    for (const o of this.opponents) {
      if (o.finishTime === null && o.distance >= TRACK_LENGTH * LAPS) {
        o.distance = TRACK_LENGTH * LAPS;
        o.finishTime = this.seconds;
      }
    }
    for (let i = 0; i < itemBoxes.length; i++) {
      const p = itemBoxes[i];
      const contact = this.flight.height < 1.8 && hitProp(p, shapes.item);
      const lap = Math.round((this.distance - p.z) / TRACK_LENGTH);
      const key = `item-${lap}-${i}`;
      if (contact && this.item && !this.consumed.has(key)) {
        // Already carrying energy: the box still breaks and turns into a short boost.
        this.consumed.add(key);
        this.pickupSerial++;
        this.boost = Math.max(this.boost, 1.1);
        this.tone("boost");
        this.emit({ type: "notice", message: "能量已滿，箱子化為加速！" });
      } else if (contact && !this.consumed.has(key)) {
        this.consumed.add(key);
        this.item = true;
        this.pickupSerial++;
        this.tone("item");
        this.emit({
          type: "notice",
          message: "獲得回聲能量！按 E 或點道具按鈕加速。",
        });
      }
    }
    for (let i = 0; i < boostPads.length; i++) {
      const p = boostPads[i],
        lap = Math.round((this.distance - p.z) / TRACK_LENGTH),
        key = `pad-${lap}-${i}`;
      if (this.flight.height < .25 && hitProp(p, shapes.pad) && !this.consumed.has(key)) {
        this.consumed.add(key);
        this.padSerial++;
        this.boost = Math.max(this.boost, 1.1);
        this.tone("boost");
      }
    }
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
  private resolveWall(
    car: ImpactBody,
    bounds: { width: number; length: number },
    lateralSpeed: number,
  ) {
    const limit = wallLimit(bounds);
    if (Math.abs(car.x) <= limit) return;
    const side = Math.sign(car.x);
    car.x = side * limit;
    const closing = Math.max(0, lateralSpeed * side) * ROAD_HALF_WIDTH;
    car.lateralVelocity =
      -side * Math.min(1.2, Math.max(0.18, (closing / ROAD_HALF_WIDTH) * 0.55));
    if (
      closing > 0.65 &&
      car.speed > 250 &&
      this.seconds - car.impactTime > 0.8
    ) {
      const strength = clamp(
        (closing + car.speed * WORLD_PER_DISTANCE * 0.18) / 16,
        0.18,
        1,
      );
      this.registerImpact(car, strength, "wall", -side, true);
      car.speed = 0;
    }
  }
  private registerImpact(
    car: ImpactBody,
    strength: number,
    kind: ImpactState["impactKind"],
    side: number,
    stunned: boolean,
  ) {
    if (car.flight) car.flight.clean = false;
    car.impact = Math.max(0.08, strength);
    car.impactTime = this.seconds;
    car.impactSide = side;
    car.impactKind = kind;
    if (stunned) {
      car.stun = Math.max(car.stun, 0.28 + strength * 0.42);
      car.speed = 0;
    }
    if (car === this) {
      this.boost = 0;
      this.drifting = false;
      this.driftCharge = 0;
      if (this.hitCooldown <= 0) {
        this.collisions++;
        this.hitCooldown = 0.55;
        this.tone("hit");
        this.emit({
          type: "notice",
          message:
            kind === "wall"
              ? "撞到護欄！暈了一下…"
              : stunned
                ? "重撞！暈了一下…"
                : "碰撞推擠！穩住方向。",
        });
      }
    }
  }
  private scrape() {
    this.speed *= 0.92;
    this.driftCharge *= 0.5;
    if (this.hitCooldown > 0) return;
    this.hitCooldown = 0.6;
    this.tone("hit");
    this.emit({ type: "notice", message: "擦過樹樁！" });
  }
  private hit(message: string) {
    // Every physical contact interrupts boost/charge; cooldown only gates repeated penalties.
    this.boost = 0;
    this.drifting = false;
    this.driftCharge = 0;
    if (this.hitCooldown > 0) return;
    this.speed *= 0.48;
    this.hitCooldown = 1.5;
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
      const prior = Number(localStorage.getItem(raceRecordKey));
      if (Number.isFinite(prior) && prior > 0)
        best = Math.min(prior, this.seconds);
      localStorage.setItem(raceRecordKey, String(best));
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
        return (
          a.time - b.time ||
          (a.name === "Anbo" ? 1 : b.name === "Anbo" ? -1 : 0)
        );
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
      flight: { ...this.flight },
      stun: this.stun,
      lateralVelocity: this.lateralVelocity,
      impact: this.impact,
      impactTime: this.impactTime,
      impactSide: this.impactSide,
      impactKind: this.impactKind,
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
      offroad: !this.flight.airborne && Math.abs(this.x) > 1.05,
      boostsUsed: this.boostsUsed,
      driftBoosts: this.driftBoosts,
      opponents: this.opponents.map((o) => ({
        name: o.entry.name,
        flight: { ...o.flight },
        stun: o.stun,
        lateralVelocity: o.lateralVelocity,
        impact: o.impact,
        impactTime: o.impactTime,
        impactSide: o.impactSide,
        impactKind: o.impactKind,
        speed: o.speed,
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
      pickupSerial: this.pickupSerial,
      padSerial: this.padSerial,
    };
  }
  private sendState() {
    this.emit({ type: "state", state: this.snapshot() });
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
    this.canvas.removeEventListener("webglcontextlost", this.onContextLost);
    this.view?.destroy();
    if (import.meta.env.DEV) delete (window as any).__race;
    void this.audio?.close();
  }
}
