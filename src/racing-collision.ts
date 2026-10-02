import { track, TRACK_LENGTH, mod } from "./racing-data";

// Sizes are world-space measurements of the rendered models, including bumpers/wheels.
export const ROAD_HALF_WIDTH = 5.5;
export const WORLD_SCALE = 0.35;
export const WORLD_PER_DISTANCE =
  track.reduce((sum, p, i) => {
    const q = track[(i + 1) % track.length];
    return sum + Math.hypot(q.mapX - p.mapX, q.mapY - p.mapY) * WORLD_SCALE;
  }, 0) / TRACK_LENGTH;
export const shapes = {
  kart: { width: 1.05, length: 1.52 },
  stump: { width: 1, length: 1 },
  // Pickups are generous: the glowing box and its orbiting sparkles reach ~1.2.
  item: { width: 1.25, length: 1.25 },
  pad: { width: 1.75, length: 1.75 },
};
export type RacePoint = { distance: number; x: number };
export type Bounds = { width: number; length: number };
export function kartBounds(yaw = 0): Bounds {
  return {
    width:
      shapes.kart.width * Math.abs(Math.cos(yaw)) +
      shapes.kart.length * Math.abs(Math.sin(yaw)),
    length:
      shapes.kart.length * Math.abs(Math.cos(yaw)) +
      shapes.kart.width * Math.abs(Math.sin(yaw)),
  };
}
export function separation(a: Bounds, b: Bounds) {
  return {
    x: (a.width + b.width) / ROAD_HALF_WIDTH,
    z: (a.length + b.length) / WORLD_PER_DISTANCE,
  };
}
export const signedGap = (a: number, b: number) =>
  mod(a - b + TRACK_LENGTH / 2, TRACK_LENGTH) - TRACK_LENGTH / 2;

/** Swept relative AABB: detects crossing between ticks, lateral entry and lap seams. */
export function sweepContact(
  a0: RacePoint,
  a1: RacePoint,
  b0: RacePoint,
  b1: RacePoint,
  a: Bounds,
  b: Bounds,
) {
  const extent = separation(a, b);
  const origin = { x: a0.x - b0.x, z: signedGap(a0.distance, b0.distance) };
  const velocity = {
    x: a1.x - a0.x - (b1.x - b0.x),
    z: a1.distance - a0.distance - (b1.distance - b0.distance),
  };
  let enter = 0,
    leave = 1;
  let normal: "x" | "z" = "z",
    sign = 0;
  if (Math.abs(origin.x) < extent.x && Math.abs(origin.z) < extent.z) {
    normal =
      1 - Math.abs(origin.x) / extent.x < 1 - Math.abs(origin.z) / extent.z
        ? "x"
        : "z";
    return {
      time: 0,
      axis: normal,
      sign: Math.sign(origin[normal]) || -Math.sign(velocity[normal]) || 1,
      extent,
    };
  }
  for (const axis of ["x", "z"] as const) {
    if (Math.abs(velocity[axis]) < 1e-10) {
      if (Math.abs(origin[axis]) >= extent[axis]) return null;
      continue;
    }
    const t0 = (-extent[axis] - origin[axis]) / velocity[axis];
    const t1 = (extent[axis] - origin[axis]) / velocity[axis];
    const near = Math.min(t0, t1),
      far = Math.max(t0, t1);
    if (near >= enter) {
      enter = near;
      normal = axis;
      sign = -Math.sign(velocity[axis]);
    }
    leave = Math.min(leave, far);
    if (enter > leave) return null;
  }
  // Contacts moving away from a touching surface aren't new impacts.
  if (leave <= 0 || enter > 1 || sign === 0) return null;
  return { time: enter, axis: normal, sign, extent };
}

/** Inner face of the wooden guardrail, in normalized road coordinates. */
export const WALL_LANE = 1.95;
export const wallLimit = (bounds: Bounds) =>
  WALL_LANE - bounds.width / ROAD_HALF_WIDTH;

/** Normal impulse in world units. Tangential velocity is unaffected. */
export function collisionImpulse(
  a: number,
  b: number,
  sign: number,
  massA: number,
  massB: number,
) {
  const closing = Math.max(0, -(a - b) * sign);
  const impulse = (1.18 * closing) / (1 / massA + 1 / massB);
  return {
    a: a + (sign * impulse) / massA,
    b: b - (sign * impulse) / massB,
    closing,
    impulse,
  };
}

/** Exact stump test: the trunk is a circle, the kart a rectangle turned by `yaw`
 * (positive yaw points the nose toward +x). The AABB sweep is only a broad phase. */
export function kartHitsStump(car: RacePoint, yaw: number, stump: RacePoint) {
  const dx = (stump.x - car.x) * ROAD_HALF_WIDTH,
    dz = signedGap(stump.distance, car.distance) * WORLD_PER_DISTANCE;
  const sin = Math.sin(yaw),
    cos = Math.cos(yaw);
  const side = dx * cos - dz * sin,
    ahead = dx * sin + dz * cos;
  const nx = side - Math.max(-shapes.kart.width, Math.min(shapes.kart.width, side)),
    nz = ahead - Math.max(-shapes.kart.length, Math.min(shapes.kart.length, ahead));
  return nx * nx + nz * nz < shapes.stump.width * shapes.stump.width;
}
/** Smallest lateral move in `direction` that frees the kart from the stump. */
export function stumpClearX(car: RacePoint, yaw: number, stump: RacePoint, direction: number) {
  let lo = car.x,
    hi = stump.x + direction * ((shapes.kart.length + shapes.stump.width) / ROAD_HALF_WIDTH);
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (kartHitsStump({ distance: car.distance, x: mid }, yaw, stump)) lo = mid;
    else hi = mid;
  }
  return hi;
}
/** Frees the kart with the smallest world-space move: sideways either way, or back. */
export function stumpPushOut(car: RacePoint, yaw: number, stump: RacePoint) {
  const left = stumpClearX(car, yaw, stump, -1),
    right = stumpClearX(car, yaw, stump, 1);
  let near = car.distance,
    far = car.distance - (shapes.kart.length + shapes.stump.width) / WORLD_PER_DISTANCE;
  for (let i = 0; i < 18; i++) {
    const mid = (near + far) / 2;
    if (kartHitsStump({ distance: mid, x: car.x }, yaw, stump)) near = mid;
    else far = mid;
  }
  const options = [
    { x: left, distance: car.distance, cost: Math.abs(left - car.x) * ROAD_HALF_WIDTH },
    { x: right, distance: car.distance, cost: Math.abs(right - car.x) * ROAD_HALF_WIDTH },
    { x: car.x, distance: far, cost: (car.distance - far) * WORLD_PER_DISTANCE },
  ];
  return options.reduce((a, b) => (b.cost < a.cost ? b : a));
}
