import { TRACK_LENGTH, clamp, mod } from './racing-data';

/** z is the start of the slope, in the same distance units as the circuit. */
export const ramps = [
  { z: 6500, x: .65, length: 650, height: .85, halfWidth: .28, name: '晨光小跳台' },
  { z: 18600, x: -.65, length: 700, height: 1.05, halfWidth: .28, name: '蕨葉飛躍' },
  { z: 35200, x: .55, length: 750, height: 1.2, halfWidth: .30, name: '花谷大跳台' },
];
export type FlightState = { height: number; velocity: number; airborne: boolean; clean: boolean; jumps: number; landings: number; trick: boolean; trickWindow: number; trickAge: number; gliding: boolean; airAge: number; pitch: number };
export const freshFlight = (): FlightState => ({ height: 0, velocity: 0, airborne: false, clean: false, jumps: 0, landings: 0, trick: false, trickWindow: 0, trickAge: 0, gliding: false, airAge: 0, pitch: 0 });
export function tryTrick(f: FlightState) {
  if (!f.airborne || !f.clean || f.trick || f.trickWindow <= 0) return false;
  f.trick = true; f.trickAge = 0; return true;
}
type Position = { distance: number; x: number };
export function rampSurface(distance: number, lane: number) {
  const z = mod(distance, TRACK_LENGTH);
  const ramp = ramps.find(r => z >= r.z && z < r.z + r.length && Math.abs(lane - r.x) <= r.halfWidth);
  return ramp ? ramp.height * (z - ramp.z) / ramp.length : 0;
}

/** Fixed-step jump and bounded gliding flight; forward lip crossing prevents retriggers while stopped. */
export function stepFlight(f: FlightState, before: Position, car: Position & { speed: number; stun: number }, dt: number, pitchInput = 0): 'launch' | 'land' | null {
  f.gliding ??= false; f.airAge ??= 0; f.pitch ??= 0;
  f.trick ??= false; f.trickWindow ??= 0; f.trickAge ??= 0;
  f.trickWindow = Math.max(0, f.trickWindow - dt);
  if (f.trick && f.airborne) f.trickAge += dt;
  const surface = rampSurface(car.distance, car.x);
  if (!f.airborne) {
    for (const ramp of ramps) {
      const lip = ramp.z + ramp.length + Math.floor(before.distance / TRACK_LENGTH) * TRACK_LENGTH;
      if (before.distance < lip && car.distance >= lip) {
        const t = (lip - before.distance) / (car.distance - before.distance);
        const lane = before.x + (car.x - before.x) * t;
        if (Math.abs(lane - ramp.x) > ramp.halfWidth) continue;
        f.height = ramp.height;
        f.velocity = car.speed >= 1600 && car.stun <= 0 ? 3.5 + clamp(car.speed / 3600, 0, 1.4) * 2 : 0;
        f.airborne = true;
        f.trick = false; f.trickWindow = .22; f.trickAge = 0;
        f.clean = f.velocity > 0;
        f.gliding = f.clean; f.airAge = 0; f.pitch = 0;
        if (f.clean) f.jumps++;
        return f.clean ? 'launch' : null;
      }
    }
    if (f.height > surface + .08) {
      // Driving off the side is a fall, not a rewarded jump.
      f.airborne = true; f.velocity = 0; f.clean = false; f.trick = false; f.trickWindow = 0; f.gliding = false; f.airAge = 0; f.pitch = 0;
    } else {
      f.height = surface;
      return null;
    }
  }
  f.airAge += dt;
  f.pitch += (clamp(pitchInput, -1, 1) - f.pitch) * Math.min(1, dt * 8);
  if (f.gliding && f.airAge > .35 && f.airAge < 2.6 && car.stun <= 0 && car.speed >= 1200) {
    // Pulling back trades speed for lift; diving descends quickly. Lift expires so
    // holding pull-up cannot fly forever, but the canopy stays open until landing.
    const sink = -1.45 + f.pitch * 1.9;
    f.velocity += (sink - f.velocity) * Math.min(1, dt * 5);
    f.height = Math.min(4.5, f.height + f.velocity * dt);
  } else {
    f.height += f.velocity * dt - 6 * dt * dt;
    f.velocity -= 12 * dt;
  }
  if (car.stun > 0) f.clean = false;
  if (f.height <= surface) {
    const reward = f.clean && Math.abs(car.x) <= .9 && car.stun <= 0;
    f.height = surface; f.velocity = 0; f.airborne = false; f.clean = false; f.trickWindow = 0; f.gliding = false; f.airAge = 0; f.pitch = 0;
    if (reward) { f.landings++; return 'land'; }
  }
  return null;
}
