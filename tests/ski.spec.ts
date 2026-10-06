import { test, expect, type Page } from '@playwright/test';
import { SkiGame, createCourse, autopilot, lineX, COURSE_LENGTH, GATE_HALF, MISS_PENALTY, sections } from '../src/ski-engine';

type State = ReturnType<SkiGame['snapshot']> & { airLeft: number; aim: ReturnType<typeof autopilot> };
const state = (page: Page): Promise<State> => page.evaluate(() => (window as any).__skiState);

function run(game: SkiGame, drive: (g: SkiGame) => void) {
  const events: string[] = [];
  while (game.phase === 'playing' && game.time < 200) { drive(game); events.push(...game.update(1 / 60).map(e => e.kind)); }
  return events;
}

test('course is fixed, keeps a clear racing line and every gate sits on the piste', () => {
  const a = createCourse(), b = createCourse();
  expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  expect(a.gates).toHaveLength(26); expect(a.notes).toHaveLength(60); expect(a.ramps).toHaveLength(2);
  for (const o of a.obstacles) expect(Math.abs(o.x - lineX(a.line, o.z)), `obstacle ${o.id}`).toBeGreaterThan(3.6 + o.r - .01);
  for (const g of a.gates) expect(Math.abs(g.x) + GATE_HALF).toBeLessThan(13);
  expect(sections.map(s => s.to).at(-1)).toBe(COURSE_LENGTH);
});

test('line-following skier clears every gate without falling; tucking earns three stars', () => {
  const steady = new SkiGame(); steady.start();
  const events = run(steady, g => { g.input = autopilot(g); });
  expect(steady.phase).toBe('complete');
  expect(steady.gatesPassed).toBe(26); expect(steady.gatesMissed).toBe(0); expect(steady.crashes).toBe(0);
  expect(steady.jumps).toBe(2); expect(steady.notes).toBeGreaterThanOrEqual(42);
  expect(events.filter(e => e === 'complete')).toHaveLength(1);
  expect(events.filter(e => e === 'section')).toHaveLength(2);
  expect(steady.stars).toBe(2);
  expect(steady.update(.1)).toEqual([]);

  const racer = new SkiGame(); racer.start();
  run(racer, g => { const a = autopilot(g); a.tuck = Math.abs(a.steer) < .5; g.input = a; if (g.airborne && g.airLeft > .8) g.trick(); });
  expect(racer.finalTime).toBeLessThan(60); expect(racer.gatesMissed).toBe(0); expect(racer.crashes).toBe(0);
  expect(racer.tricks).toBe(4); expect(racer.stars).toBe(3);
});

test('countdown holds the start; gates, trees, fences and late flips are judged', () => {
  const game = new SkiGame(); game.start();
  game.input.steer = 1; game.update(2.5);
  expect(game.z).toBe(0); expect(game.time).toBeLessThan(0);

  // Ski straight past the first gate on the wrong side.
  game.time = 1; const gate = game.course.gates[0];
  game.x = gate.x + GATE_HALF + 1; game.z = gate.z - 1; game.speed = 10; game.heading = 0; game.input = { steer: 0, tuck: false, brake: false };
  for (let i = 0; i < 30; i++) game.update(1 / 60);
  expect(gate.result).toBe('missed'); expect(game.gatesMissed).toBe(1); expect(game.finalTime).toBeCloseTo(game.time + MISS_PENALTY);

  const tree = game.course.obstacles.find(o => o.kind === 'tree')!;
  game.x = tree.x; game.z = tree.z - 1.5; game.speed = 15; game.heading = 0;
  const hit = game.update(.2).map(e => e.kind);
  expect(hit).toContain('crash'); expect(game.crashes).toBe(1); expect(game.stun).toBeGreaterThan(0); expect(game.speed).toBeLessThanOrEqual(3.5);
  expect(game.trick()).toBe(false);

  game.stun = 0; game.x = 12.3; game.z = 200; game.heading = .8; game.speed = 14;
  expect(game.update(.1).map(e => e.kind)).toContain('fence');
  expect(game.heading).toBeLessThan(0);

  // Launch off the first kicker and only start the flip just before landing.
  const ramp = game.course.ramps[0];
  game.x = ramp.x; game.z = ramp.z - .5; game.heading = 0; game.speed = 22; game.stun = 0;
  const air = game.update(.05).map(e => e.kind);
  expect(air).toContain('jump'); expect(game.airborne).toBe(true);
  while (game.airLeft > .45) game.update(1 / 60);
  expect(game.trick()).toBe(true);
  const landing: string[] = [];
  while (game.airborne) landing.push(...game.update(1 / 60).map(e => e.kind));
  expect(landing).toContain('wipeout'); expect(game.tricks).toBe(0); expect(game.crashes).toBe(2);

  game.pause(); const paused = game.snapshot();
  game.update(3); expect(game.snapshot()).toEqual(paused);
  game.start(); expect(game.z).toBe(0); expect(game.gatesMissed).toBe(0); expect(game.course.gates.every(g => !g.result)).toBe(true);
});

test('keyboard run reaches the finish, shows results and keeps the best time', async ({ page }) => {
  test.setTimeout(150000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.clock.install(); await page.goto('/ski.html');
  await expect(page.locator('#best')).toHaveText('—');
  await page.locator('[data-hero="anbo"]').click();
  await page.screenshot({ path: 'tests/evidence/ski-picker.png' });
  await page.locator('#start').click();
  await page.clock.runFor(1000);
  expect((await state(page)).z).toBe(0);
  let shots = 0;
  for (let step = 0; step < 2000; step++) {
    const s = await state(page); if (s.phase !== 'playing') break;
    const want = s.aim.steer > .15 ? 'ArrowRight' : s.aim.steer < -.15 ? 'ArrowLeft' : '';
    for (const k of ['ArrowRight', 'ArrowLeft']) await page.keyboard[k === want ? 'down' : 'up'](k);
    await page.keyboard[s.aim.tuck ? 'down' : 'up']('ArrowUp');
    if (s.airborne && s.airLeft > .8 && s.spin === 0) await page.keyboard.press('Space');
    await page.clock.runFor(60);
    if (shots === 0 && s.z > 380) { await page.screenshot({ path: 'tests/evidence/ski-gates.png' }); shots++; }
    if (shots === 1 && s.airborne && s.height > 2) { await page.screenshot({ path: 'tests/evidence/ski-jump.png' }); shots++; }
  }
  for (const k of ['ArrowRight', 'ArrowLeft', 'ArrowUp']) await page.keyboard.up(k);
  const done = await state(page);
  expect(done.phase).toBe('complete'); expect(done.gatesPassed).toBe(26); expect(done.crashes).toBe(0);
  expect(done.tricks).toBeGreaterThanOrEqual(1);
  await expect(page.locator('#panel')).toContainText('Anbo');
  await expect(page.locator('.ski-stars')).toHaveAttribute('aria-label', `${done.stars} 顆星，滿分 3 顆`);
  await page.screenshot({ path: 'tests/evidence/ski-complete.png' });
  const best = await page.locator('#best').textContent();
  expect(best).toMatch(/^1?:\d\d\.\d$/);
  await page.reload(); await expect(page.locator('#best')).toHaveText(best!);
  expect(errors).toEqual([]);
});

test('pause, background, restart and released input', async ({ page }) => {
  await page.clock.install(); await page.goto('/ski.html'); await page.locator('#start').click();
  await page.clock.runFor(3600);
  await page.keyboard.down('ArrowRight'); await page.clock.runFor(400);
  expect((await state(page)).input.steer).toBe(1);
  await page.keyboard.press('Escape');
  const paused = await state(page); expect(paused.phase).toBe('paused'); expect(paused.input.steer).toBe(0);
  await page.clock.runFor(3000); expect((await state(page)).z).toBe(paused.z);
  await page.keyboard.up('ArrowRight'); await page.locator('#resume').click(); await page.clock.runFor(500);
  expect((await state(page)).z).toBeGreaterThan(paused.z);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  expect((await state(page)).phase).toBe('paused');
  await page.locator('#restart').click();
  const fresh = await state(page); expect(fresh.phase).toBe('playing'); expect(fresh.z).toBe(0); expect(fresh.time).toBeLessThan(0);
  await page.locator('#sound').click(); await expect(page.locator('#sound')).toHaveAttribute('aria-pressed', 'false');
});

test('phone: stick steers, tucks and brakes, trick button flips, page fits the screen', async ({ browser }) => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    const context = await browser.newContext({ baseURL: 'http://127.0.0.1:5173', viewport, isMobile: true, hasTouch: true });
    const page = await context.newPage(); await page.clock.install();
    await page.addInitScript(() => localStorage.setItem('echo-guide-seen', 'ski'));
    await page.goto('/ski.html');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    await page.locator('#start').tap(); await page.clock.runFor(3500);
    const stick = page.locator('#stick'); await expect(stick).toBeInViewport();
    await expect(page.locator('#trick')).toBeInViewport();
    const box = (await stick.boundingBox())!;
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    const touch = (x: number, y: number, type: string) => stick.dispatchEvent(type, { pointerId: 7, pointerType: 'touch', clientX: x, clientY: y, isPrimary: true, bubbles: true });
    await touch(cx, cy, 'pointerdown'); await touch(cx + box.width * .4, cy, 'pointermove'); await page.clock.runFor(200);
    let s = await state(page); expect(s.input.steer).toBeGreaterThan(.5); expect(s.input.tuck).toBe(false);
    await touch(cx, cy - box.height * .4, 'pointermove'); await page.clock.runFor(100);
    s = await state(page); expect(s.input.tuck).toBe(true); expect(s.input.steer).toBe(0);
    await touch(cx, cy + box.height * .4, 'pointermove'); await page.clock.runFor(100);
    expect((await state(page)).input.brake).toBe(true);
    await touch(cx, cy + box.height * .4, 'pointerup'); await page.clock.runFor(100);
    s = await state(page); expect(s.input).toEqual({ steer: 0, tuck: false, brake: false });
    if (viewport.width < 500) {
      // Ride the line to the first kicker by holding the stick like a player would, then tap Trick in the air.
      for (let i = 0; i < 1500; i++) {
        s = await state(page); if (s.airborne || s.phase !== 'playing') break;
        await touch(cx, cy, 'pointerdown'); await touch(cx + Math.max(-1, Math.min(1, s.aim.steer)) * box.width * .37, cy, 'pointermove');
        await page.clock.runFor(60);
      }
      await touch(cx, cy, 'pointerup');
      expect((await state(page)).airborne).toBe(true);
      await page.locator('#trick').tap(); await page.clock.runFor(100);
      expect((await state(page)).spin).toBeGreaterThan(0);
      await page.screenshot({ path: 'tests/evidence/ski-mobile.png' });
    } else await page.screenshot({ path: 'tests/evidence/ski-landscape.png' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    await context.close();
  }
});
