import { test, expect, type Page } from '@playwright/test';
import { freshFlight, ramps, rampSurface, stepFlight, tryTrick } from '../src/racing-jumps';

function jump(speed: number, lane: number, lap = 0, rampIndex = 0) {
  const f = freshFlight(), ramp = ramps[rampIndex];
  const car = { distance: lap * 48000 + ramp.z - 10, x: lane, speed, stun: 0 };
  const events: string[] = []; let maxHeight = 0, airborneDistance = 0;
  for (let i = 0; i < 1200; i++) {
    const before = { ...car }; car.distance += speed / 120;
    const event = stepFlight(f, before, car, 1 / 120);
    if (event) events.push(event);
    maxHeight = Math.max(maxHeight, f.height);
    if (f.airborne) airborneDistance += car.distance - before.distance;
    if (car.distance > lap * 48000 + ramp.z + ramp.length + 100 && !f.airborne) break;
  }
  return { f, events, maxHeight, airborneDistance };
}

test('ramps launch on each lap, faster approaches fly farther, and ground lane bypasses them', () => {
  const slow = jump(1800, .65), fast = jump(3600, .65);
  expect(fast.events).toEqual(['launch', 'land']);
  ramps.forEach((r, i) => expect(jump(3600, r.x, 0, i).events).toEqual(['launch', 'land']));
  expect(fast.maxHeight).toBeGreaterThan(1.8);
  expect(fast.airborneDistance).toBeGreaterThan(slow.airborneDistance);
  expect(fast.f.height).toBe(0); expect(fast.f.airborne).toBe(false);
  expect(jump(3600, .65, 2).events).toEqual(['launch', 'land']);
  expect(jump(3600, 0).maxHeight).toBe(0);
  expect(jump(800, .65).events).toEqual([]);
  expect(jump(800, .65).f.height).toBe(0);
});

test('stopping on a ramp does not farm jumps; side falls and grass landings earn no boost', () => {
  const ramp = ramps[0], f = freshFlight();
  const car = { distance: ramp.z + ramp.length / 2, x: ramp.x, speed: 0, stun: 0 };
  for (let i = 0; i < 240; i++) stepFlight(f, car, car, 1 / 120);
  expect(f.height).toBeCloseTo(ramp.height / 2); expect(f.jumps).toBe(0);
  car.x = 0;
  for (let i = 0; i < 120; i++) expect(stepFlight(f, car, car, 1 / 120)).toBeNull();
  expect(f.height).toBe(0); expect(f.landings).toBe(0);
  Object.assign(f, { height: 2, velocity: -1, airborne: true, clean: true });
  car.x = 1.3;
  for (let i = 0; i < 120; i++) expect(stepFlight(f, car, car, 1 / 120)).toBeNull();
  expect(f.height).toBe(0); expect(f.landings).toBe(0);
  expect(rampSurface(48000 + ramp.z + 100, ramp.x)).toBeGreaterThan(0);
});

async function verifyJump(page: Page, touch = false) {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.clock.install(); await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.goto('/race.html');
  await page.getByRole('button', { name: '上場比賽' }).click();
  await page.clock.runFor(3100);
  const state = () => page.evaluate(() => (window as any).__race.snapshot());
  async function steer() {
    const s = await state();
    const lane = s.flight.airborne ? .45 : .65;
    const desired = s.curve * .22 * (s.speed / 3600) ** 2 - s.lateralVelocity + (lane - s.x) * 5;
    await page.keyboard[desired > .2 ? 'down' : 'up']('ArrowRight');
    await page.keyboard[desired < -.2 ? 'down' : 'up']('ArrowLeft');
    await page.clock.runFor(60);
    return state();
  }
  let s = await state();
  for (let i = 0; i < 200 && s.flight.height < 1.5; i++) s = await steer();
  expect(s.flight.airborne).toBe(true); expect(s.flight.gliding).toBe(true); expect(s.flight.jumps).toBe(1);
  const view = await page.evaluate(() => (window as any).__raceView.snapshot());
  expect(view.ramps).toHaveLength(3); expect(view.cars[0].glider).toBe(true);
  expect(view.cars[0].position[1]).toBeCloseTo(s.flight.height, 4);
  if (touch) {
    await expect(page.getByRole('button', { name: '俯衝', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '拉升', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  if (touch) await page.locator('[data-race-control=drift]').tap();
  else await page.keyboard.press('Space');
  expect((await state()).flight.trick).toBe(true);
  await page.clock.runFor(60);
  await page.screenshot({ path: touch ? 'tests/evidence/race-trick-mobile.png' : 'tests/evidence/race-jump.png' });
  await page.keyboard.press('Escape'); const paused = await state();
  await page.clock.runFor(3000); expect(await state()).toEqual(paused);
  await page.keyboard.press('Escape');
  for (let i = 0; i < 60 && s.flight.airborne; i++) s = await steer();
  expect(s.flight.airborne).toBe(false); expect(s.flight.gliding).toBe(false); expect(s.flight.landings).toBe(1);
  expect(await page.evaluate(() => (window as any).__raceView.snapshot().cars[0].glider)).toBe(false);
  expect(s.boost).toBeGreaterThan(1.2);
  if (touch) {
    // Advance the paused test clock through the next throttled HUD update.
    await page.clock.runFor(100);
    await expect(page.getByRole('button', { name: '煞車', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '油門', exact: true })).toBeHidden();
  }
  await page.getByRole('button', { name: '重新比賽', exact: true }).click();
  expect((await state()).flight).toEqual(freshFlight());
  expect((await state()).opponents.every((o: any) => o.flight.jumps === 0 && o.flight.height === 0)).toBe(true);
  expect(errors).toEqual([]);
}
test('keyboard trick matches 3D height, freezes on pause, lands with boost, and resets', async ({ page }) => verifyJump(page));
test('phone touch triggers the same timed trick and landing reward', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:5173', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  try { await verifyJump(await context.newPage(), true); } finally { await context.close(); }
});

test('airborne cars clear ground traffic and cannot collect ground boost pads', async ({ page }) => {
  await page.goto('/race.html'); await page.getByRole('button', { name: '上場比賽' }).waitFor();
  const result = await page.evaluate(async () => {
    const { RacingEngine } = await import('/src/racing-engine.ts');
    const { boostPads, obstacles } = await import('/src/racing-data.ts');
    const g: any = new RacingEngine(document.createElement('canvas'), () => {});
    g.destroy(); g.phase = 'racing'; g.speed = 3600;
    const pad = boostPads[0];
    g.distance = pad.z; g.x = pad.x;
    g.flight = { height: 3, velocity: 0, airborne: true, clean: true, jumps: 1, landings: 0 };
    g.opponents = g.opponents.slice(0, 1);
    Object.assign(g.opponents[0], { distance: pad.z, x: pad.x, speed: 1000 });
    g.update(1 / 120);
    const traffic = { collisions: g.collisions, boost: g.boost, height: g.flight.height };
    g.opponents = []; g.distance = obstacles[0].z; g.x = obstacles[0].x;
    const before = g.distance;
    g.update(1 / 120);
    return { traffic, clearedStump: g.distance > before, collisions: g.collisions };
  });
  expect(result.traffic.collisions).toBe(0); expect(result.traffic.boost).toBe(0);
  expect(result.traffic.height).toBeGreaterThan(1.5);
  expect(result.clearedStump).toBe(true); expect(result.collisions).toBe(0);
});


test('tricks accept only one fresh press in the takeoff window', () => {
  const f = freshFlight();
  expect(tryTrick(f)).toBe(false);
  Object.assign(f, { airborne: true, clean: true, height: 1, trickWindow: .22 });
  expect(tryTrick(f)).toBe(true); expect(tryTrick(f)).toBe(false);
  const late = freshFlight(); Object.assign(late, { airborne: true, clean: true, height: 2, trickWindow: .1 });
  stepFlight(late, { distance: 8000, x: 0 }, { distance: 8100, x: 0, speed: 3000, stun: 0 }, .11);
  expect(tryTrick(late)).toBe(false);
});


test('glider pitch trades airtime for descent; pulling up cannot sustain endless flight', () => {
  function glide(pitch: number) {
    const f = freshFlight(), r = ramps[0];
    const car = { distance: r.z + r.length - 5, x: r.x, speed: 3600, stun: 0 };
    let time = 0, maxHeight = 0;
    for (let i = 0; i < 720; i++) {
      const before = { ...car }; car.distance += car.speed / 120;
      stepFlight(f, before, car, 1 / 120, pitch);
      time += 1 / 120; maxHeight = Math.max(maxHeight, f.height);
      if (f.jumps > 0 && !f.airborne) return { time, maxHeight, f };
    }
    throw new Error('Glider did not land');
  }
  const dive = glide(-1), neutral = glide(0), lift = glide(1);
  expect(dive.time).toBeLessThan(neutral.time);
  expect(lift.time).toBeGreaterThan(neutral.time);
  expect(lift.time).toBeLessThan(5);
  expect(lift.maxHeight).toBeLessThanOrEqual(4.5);
  expect(lift.f.gliding).toBe(false);
  expect(lift.f.pitch).toBe(0);
});


test('engine maps gas/brake to dive/lift in flight and keeps ground braking', async ({ page }) => {
  await page.goto('/race.html'); await page.getByRole('button', { name: '上場比賽' }).waitFor();
  const result = await page.evaluate(async () => {
    const { RacingEngine } = await import('/src/racing-engine.ts');
    const { freshFlight } = await import('/src/racing-jumps.ts');
    return ['dive', 'lift', 'ground', 'manualBoost'].map(mode => {
      const g: any = new RacingEngine(document.createElement('canvas'), () => {});
      g.destroy(); g.phase = 'racing'; g.opponents = []; g.distance = 8000; g.speed = 3600;
      g.flight = freshFlight();
      if (mode !== 'ground') Object.assign(g.flight, { height: 3, velocity: -1, airborne: true, gliding: true, clean: true, airAge: .5 });
      if (mode === 'manualBoost') { g.autoGas = false; g.boost = 1; }
      else g.setControl(mode === 'dive' ? 'gas' : 'brake', true);
      for (let i = 0; i < 60; i++) g.update(1 / 120);
      return { speed: g.speed, height: g.flight.height, pitch: g.flight.pitch };
    });
  });
  expect(result[0].pitch).toBeLessThan(-.9);
  expect(result[1].pitch).toBeGreaterThan(.9);
  expect(result[1].height).toBeGreaterThan(result[0].height);
  expect(result[0].speed).toBeGreaterThan(result[1].speed);
  expect(result[1].speed).toBeGreaterThan(3000);
  expect(result[2].speed).toBeLessThan(1500);
  expect(result[3].speed).toBeGreaterThan(4000);
});
