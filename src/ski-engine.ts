// Downhill slalom on a straight piste: z runs down the fall line (metres from the start), x across it.
export const HALF_WIDTH = 13;
export const COURSE_LENGTH = 1050;
export const GATE_HALF = 2.6;
export const MISS_PENALTY = 3;
export const COUNTDOWN = 3;
export const PLAYER_RADIUS = 0.45;
export const MAX_HEADING = 1.2;
const G = 9.8;
const STEP = 1 / 120;

export type SkiPhase = 'ready' | 'playing' | 'paused' | 'complete';
export type Section = { from: number; to: number; slope: number; name: string; nameEn: string };
export type Gate = { id: number; z: number; x: number; color: 'red' | 'blue'; result?: 'passed' | 'missed' };
export type Note = { id: number; z: number; x: number; h: number; taken: boolean };
export type Obstacle = { id: number; z: number; x: number; r: number; kind: 'tree' | 'rock'; hit: boolean };
export type Patch = { z0: number; z1: number; x0: number; x1: number; kind: 'ice' | 'powder' };
/** A kicker whose lip sits at z; the ramp climbs over the `length` metres before it. */
export type Ramp = { id: number; z: number; x: number; half: number; length: number };
export type SkiEvent = { kind: 'go' | 'gate' | 'miss' | 'note' | 'crash' | 'fence' | 'jump' | 'land' | 'wobble' | 'trick' | 'wipeout' | 'section' | 'complete'; x: number; z: number; value?: number };

export const sections: Section[] = [
  { from: 0, to: 340, slope: 13, name: '林間緩坡', nameEn: 'Forest glide' },
  { from: 340, to: 720, slope: 16, name: '雪松旗門', nameEn: 'Cedar gates' },
  { from: 720, to: COURSE_LENGTH, slope: 19, name: '冰瀑跳台', nameEn: 'Icefall jumps' },
];
export function sectionAt(z: number) { const i = sections.findIndex(s => z < s.to); return i < 0 ? sections.length - 1 : i; }
const slopeAt = (z: number) => sections[sectionAt(z)].slope * Math.PI / 180;

/** Snow height below the start, shared by the view so the piste and the physics agree on the slope. */
export function elevation(z: number) {
  let y = 0;
  for (const s of sections) {
    if (z <= s.from) break;
    const run = Math.max(0, Math.min(z, s.to) - s.from);
    y -= run * Math.tan(s.slope * Math.PI / 180);
  }
  // Run-out past the finish keeps falling gently instead of the last pitch.
  if (z > COURSE_LENGTH) y -= (z - COURSE_LENGTH) * .08;
  return y;
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = seed + 0x6d2b79f5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const gateLine: [number, number][] = [
  // Forest glide: wide, generous turns.
  [70, -4], [110, 4], [150, -5], [190, 5], [230, -6], [270, 4], [310, -3],
  // Cedar gates: closer and wider swings.
  [360, 5], [388, -4], [416, 6], [444, -5], [472, 3], [500, -7], [528, 2], [556, -6], [584, 4], [612, -5], [640, 6], [668, -4], [696, 3],
  // Icefall jumps: gates between two kickers.
  [745, -5], [775, 3], [870, 6], [898, -5], [925, 2], [1020, 4],
];
const rampLine: Ramp[] = [
  { id: 0, z: 805, x: 0, half: 4, length: 8 },
  { id: 1, z: 955, x: -1, half: 4, length: 8 },
];
/** Metres after the lip kept clear for landing. */
const LANDING = 48;

/** The racing line: straight segments through every gate centre and straight over each kicker. */
export function racingLine(ramps = rampLine) {
  const points: [number, number][] = [[0, 0], ...gateLine];
  for (const r of ramps) points.push([r.z - r.length - 6, r.x], [r.z + LANDING - 8, r.x]);
  points.push([COURSE_LENGTH + 30, 0]);
  return points.sort((a, b) => a[0] - b[0]);
}
export function lineX(points: [number, number][], z: number) {
  for (let i = 1; i < points.length; i++) {
    const [z1, x1] = points[i];
    if (z <= z1) { const [z0, x0] = points[i - 1]; return x0 + (x1 - x0) * (z - z0) / (z1 - z0); }
  }
  return points[points.length - 1][1];
}

export function createCourse() {
  const rand = mulberry32(20261006);
  const ramps = rampLine.map(r => ({ ...r }));
  const line = racingLine(ramps);
  const gates: Gate[] = gateLine.map(([z, x], id) => ({ id, z, x, color: id % 2 ? 'blue' : 'red' }));
  const inLanding = (z: number, x: number, pad: number) => ramps.some(r => z > r.z - r.length - 10 && z < r.z + LANDING && Math.abs(x - r.x) < r.half + pad);
  const obstacles: Obstacle[] = [];
  for (let z = 40; z < COURSE_LENGTH - 20; z += [9, 6.5, 8][sectionAt(z)]) {
    for (let tries = 0; tries < 6; tries++) {
      const x = (rand() * 2 - 1) * (HALF_WIDTH - 1.4);
      const kind = rand() < .72 ? 'tree' : 'rock';
      const r = kind === 'tree' ? .9 : .75;
      const oz = z + rand() * 3;
      // Keep a clear corridor along the racing line, around gate poles and on every landing.
      if (Math.abs(x - lineX(line, oz)) < 3.6 + r) continue;
      if (gates.some(g => Math.abs(g.z - oz) < 5 && Math.abs(g.x - x) < GATE_HALF + 2.5)) continue;
      if (inLanding(oz, x, 3)) continue;
      if (obstacles.some(o => Math.hypot(o.z - oz, o.x - x) < 3.2)) continue;
      obstacles.push({ id: obstacles.length, z: oz, x, r, kind, hit: false });
      break;
    }
  }
  const notes: Note[] = [];
  for (let z = 34; z < COURSE_LENGTH - 6; z += 16) {
    if (ramps.some(r => z > r.z - r.length - 4 && z < r.z + LANDING)) continue;
    let x = lineX(line, z);
    // Every fourth note sits off the line: worth a detour only when nothing is in the way.
    if (notes.length % 4 === 3) {
      const side = x > 0 ? -2.8 : 2.8;
      if (!obstacles.some(o => Math.hypot(o.z - z, o.x - (x + side)) < o.r + 2.4)) x += side;
    }
    notes.push({ id: notes.length, z, x, h: .8, taken: false });
  }
  for (const r of ramps) for (const d of [13, 24]) notes.push({ id: notes.length, z: r.z + d, x: r.x, h: 3, taken: false });
  notes.sort((a, b) => a.z - b.z).forEach((n, i) => n.id = i);
  const patches: Patch[] = [
    { z0: 120, z1: 200, x0: 7, x1: HALF_WIDTH, kind: 'powder' },
    { z0: 150, z1: 230, x0: -HALF_WIDTH, x1: -8, kind: 'powder' },
    { z0: 520, z1: 565, x0: -HALF_WIDTH, x1: -8.5, kind: 'powder' },
    { z0: 430, z1: 470, x0: -9, x1: 1, kind: 'ice' },
    { z0: 598, z1: 640, x0: -2, x1: 9, kind: 'ice' },
    { z0: 862, z1: 905, x0: -8, x1: 8, kind: 'ice' },
  ];
  return { gates, notes, obstacles, patches, ramps, line };
}
export type Course = ReturnType<typeof createCourse>;

export class SkiGame {
  phase: SkiPhase = 'ready';
  course: Course = createCourse();
  /** Seconds since the start signal; negative during the countdown. */
  time = -COUNTDOWN;
  x = 0; z = 0; heading = 0; speed = 0;
  height = 0; vy = 0; airTime = 0;
  /** Smoothed steering in [-1, 1]; `input` is what the player is holding. */
  steer = 0;
  input = { steer: 0, tuck: false, brake: false };
  spin = 0; stun = 0;
  gatesPassed = 0; gatesMissed = 0; notes = 0; crashes = 0; tricks = 0; jumps = 0;
  combo = 0; maxCombo = 0; score = 0; topSpeed = 0;
  section = 0;

  get airborne() { return this.height > 0 || this.vy > 0; }
  get totalNotes() { return this.course.notes.length; }
  get totalGates() { return this.course.gates.length; }
  get penalty() { return this.gatesMissed * MISS_PENALTY; }
  get finalTime() { return Math.max(0, this.time) + this.penalty; }
  get surface(): Patch['kind'] | 'groomed' {
    return this.course.patches.find(p => this.z >= p.z0 && this.z <= p.z1 && this.x >= p.x0 && this.x <= p.x1)?.kind ?? 'groomed';
  }
  get stars() {
    if (this.phase !== 'complete') return 0;
    if (this.finalTime <= 60 && this.gatesMissed === 0 && this.notes >= Math.ceil(this.totalNotes * .7)) return 3;
    if (this.finalTime <= 70 && this.gatesMissed <= 4) return 2;
    return 1;
  }

  start() {
    this.course = createCourse();
    this.time = -COUNTDOWN; this.x = this.z = this.heading = this.speed = this.height = this.vy = this.airTime = 0;
    this.steer = this.spin = this.stun = 0;
    this.gatesPassed = this.gatesMissed = this.notes = this.crashes = this.tricks = this.jumps = 0;
    this.combo = this.maxCombo = this.score = this.topSpeed = this.section = 0;
    this.release();
    this.phase = 'playing';
  }
  release() { this.input = { steer: 0, tuck: false, brake: false }; }
  pause() { if (this.phase === 'playing') { this.phase = 'paused'; this.release(); } }
  resume() { if (this.phase === 'paused') this.phase = 'playing'; }

  /** Seconds left before touching down if nothing changes. */
  get airLeft() { return this.airborne ? (this.vy + Math.sqrt(this.vy * this.vy + 2 * G * this.height)) / G : 0; }
  /** A spin in the air: finish it before landing for points, or wipe out. */
  trick() {
    if (this.phase !== 'playing' || !this.airborne || this.spin > 0 || this.airLeft < .3) return false;
    this.spin = .001; return true;
  }

  private bump(kind: 'combo' | 'reset') {
    if (kind === 'reset') { this.combo = 0; return; }
    this.combo++; this.maxCombo = Math.max(this.maxCombo, this.combo);
  }

  update(dt: number): SkiEvent[] {
    if (this.phase !== 'playing' || !Number.isFinite(dt) || dt <= 0) return [];
    const events: SkiEvent[] = [];
    let remaining = Math.min(dt, .1);
    while (remaining > 1e-6 && this.phase === 'playing') {
      const step = Math.min(remaining, STEP); remaining -= step;
      this.tick(step, events);
    }
    return events;
  }

  private tick(dt: number, events: SkiEvent[]) {
    const before = this.time;
    this.time += dt;
    if (this.time < 0) return;
    if (before < 0) events.push({ kind: 'go', x: this.x, z: this.z });
    const surface = this.surface;
    const air = this.airborne;
    const target = this.stun > 0 ? 0 : Math.max(-1, Math.min(1, this.input.steer));
    this.steer += (target - this.steer) * Math.min(1, dt * 9);
    const tuck = this.input.tuck && !this.input.brake && this.stun <= 0;
    const brake = this.input.brake && this.stun <= 0;
    // Turning: tucking and ice make it harder, the air nearly impossible.
    const turnRate = 1.9 * (tuck ? .55 : 1) * (surface === 'ice' ? .45 : 1) * (air ? .35 : 1);
    if (Math.abs(this.steer) > .05) this.heading += this.steer * turnRate * dt;
    else if (!air) this.heading -= Math.sign(this.heading) * Math.min(Math.abs(this.heading), .6 * dt);
    if (this.stun > 0) { this.stun -= dt; this.heading *= Math.max(0, 1 - dt * 3); }
    this.heading = Math.max(-MAX_HEADING, Math.min(MAX_HEADING, this.heading));

    if (!air) {
      const slope = slopeAt(this.z);
      const drag = tuck ? .0037 : brake ? .012 : .0062;
      const friction = surface === 'ice' ? .015 : .04;
      let accel = G * Math.sin(slope) * Math.cos(this.heading) - drag * this.speed * this.speed - friction * G * Math.cos(slope);
      accel -= Math.abs(this.steer) * 1.1 * Math.min(1, this.speed / 8);
      if (brake) accel -= 6.5;
      if (surface === 'powder') accel -= 3.2;
      if (this.stun > 0) accel -= 4;
      this.speed = Math.max(0, this.speed + accel * dt);
    }
    this.topSpeed = Math.max(this.topSpeed, this.speed);
    const prevZ = this.z;
    this.x += this.speed * Math.sin(this.heading) * dt;
    this.z += this.speed * Math.cos(this.heading) * dt;

    if (air) {
      this.airTime += dt;
      this.vy -= G * dt; this.height += this.vy * dt;
      if (this.spin > 0) {
        this.spin += dt / .6;
        if (this.spin >= 1) {
          this.spin = 0; this.tricks++; this.score += 150; this.bump('combo');
          events.push({ kind: 'trick', x: this.x, z: this.z, value: this.tricks });
        }
      }
      if (this.height <= 0 && this.vy <= 0) {
        this.height = this.vy = 0;
        if (this.spin > 0) {
          this.spin = 0; this.crash(events, 'wipeout');
        } else if (Math.abs(this.heading) > .75) {
          this.speed *= .72; this.bump('reset');
          events.push({ kind: 'wobble', x: this.x, z: this.z });
        } else {
          events.push({ kind: 'land', x: this.x, z: this.z, value: this.airTime });
        }
        this.airTime = 0;
      }
    }

    // Fences along both edges push you back on the piste.
    const edge = HALF_WIDTH - PLAYER_RADIUS;
    if (Math.abs(this.x) > edge) {
      this.x = Math.sign(this.x) * edge;
      this.heading = -this.heading * .4; this.speed *= .7; this.bump('reset');
      events.push({ kind: 'fence', x: this.x, z: this.z });
    }

    const { gates, notes, obstacles, ramps } = this.course;
    for (const r of ramps) {
      if (!this.airborne && prevZ < r.z && this.z >= r.z && Math.abs(this.x - r.x) <= r.half) {
        this.vy = Math.min(9, this.speed * .3) + 1; this.height = .01; this.airTime = 0; this.jumps++;
        events.push({ kind: 'jump', x: this.x, z: this.z, value: r.id });
      }
    }
    for (const g of gates) {
      if (g.result || !(prevZ < g.z && this.z >= g.z)) continue;
      if (Math.abs(this.x - g.x) <= GATE_HALF) {
        g.result = 'passed'; this.gatesPassed++; this.bump('combo');
        this.score += 50 + Math.min(10, this.combo) * 10;
        events.push({ kind: 'gate', x: g.x, z: g.z, value: g.id });
      } else {
        g.result = 'missed'; this.gatesMissed++; this.bump('reset');
        events.push({ kind: 'miss', x: g.x, z: g.z, value: g.id });
      }
    }
    const centre = this.height + .8;
    for (const n of notes) {
      if (n.taken || Math.abs(n.z - this.z) > 1.1) continue;
      if (Math.abs(n.x - this.x) <= 1.3 && Math.abs(n.h - centre) <= 1.7) {
        n.taken = true; this.notes++; this.score += 100;
        events.push({ kind: 'note', x: n.x, z: n.z, value: n.id });
      }
    }
    if (this.height < 1.2) for (const o of obstacles) {
      if (o.hit || Math.abs(o.z - this.z) > 2) continue;
      if (Math.hypot(o.x - this.x, o.z - this.z) < o.r + PLAYER_RADIUS) { o.hit = true; this.crash(events, 'crash', o.x, o.z); }
    }

    const section = sectionAt(this.z);
    if (section !== this.section && this.z < COURSE_LENGTH) { this.section = section; events.push({ kind: 'section', x: this.x, z: this.z, value: section }); }
    if (this.z >= COURSE_LENGTH) {
      this.phase = 'complete'; this.release();
      events.push({ kind: 'complete', x: this.x, z: this.z, value: this.finalTime });
    }
  }

  private crash(events: SkiEvent[], kind: 'crash' | 'wipeout', x = this.x, z = this.z) {
    this.crashes++; this.stun = 1; this.speed = Math.min(this.speed, 3); this.bump('reset');
    events.push({ kind, x, z });
  }

  snapshot() {
    return {
      phase: this.phase, time: this.time, x: this.x, z: this.z, heading: this.heading, speed: this.speed,
      height: this.height, airborne: this.airborne, spin: this.spin, stun: this.stun, surface: this.surface,
      gatesPassed: this.gatesPassed, gatesMissed: this.gatesMissed, totalGates: this.totalGates,
      notes: this.notes, totalNotes: this.totalNotes, crashes: this.crashes, tricks: this.tricks, jumps: this.jumps,
      combo: this.combo, maxCombo: this.maxCombo, score: this.score, finalTime: this.finalTime, stars: this.stars,
      section: this.section, input: { ...this.input },
    };
  }
}

/** A steady line-follower used by tests: aims a few metres ahead on the racing line. */
export function autopilot(game: SkiGame, lookahead = 9) {
  const line = game.course.line;
  const tx = lineX(line, game.z + lookahead);
  const want = Math.atan2(tx - game.x, lookahead);
  const steer = Math.max(-1, Math.min(1, (want - game.heading) * 3));
  return { steer: Math.abs(steer) < .08 ? 0 : steer, tuck: Math.abs(want) < .18 && Math.abs(game.heading) < .2, brake: false };
}
