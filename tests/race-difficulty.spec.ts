import { test, expect } from '@playwright/test';

test('opponents earn pad boosts on contact, once per lap, and gain speed', async ({ page }) => {
  await page.goto('/race.html');
  await page.getByRole('button', { name: '上場比賽' }).waitFor();
  const result = await page.evaluate(async () => {
    const { RacingEngine } = await import('/src/racing-engine.ts');
    const { boostPads, TRACK_LENGTH } = await import('/src/racing-data.ts');
    const g: any = new RacingEngine(document.createElement('canvas'), () => {});
    g.destroy();
    g.phase = 'racing'; g.autoGas = false;
    g.opponents = g.opponents.slice(0, 1);
    const o = g.opponents[0], pad = boostPads[0];
    // Fixture only positions the car; real collision/acceleration rules award the boost.
    o.distance = pad.z; o.x = 1.3; o.speed = 2000;
    g.update(1 / 120);
    const miss = o.boost;
    o.distance = pad.z; o.x = pad.x;
    g.update(1 / 120);
    const hit = o.boost, before = o.speed;
    for (let i = 0; i < 30; i++) g.update(1 / 120);
    const accelerated = o.speed > before;
    o.boost = 0; o.distance = pad.z; o.x = pad.x;
    g.update(1 / 120);
    const repeated = o.boost;
    o.distance = pad.z + TRACK_LENGTH; o.x = pad.x;
    g.update(1 / 120);
    const nextLap = o.boost;
    for (let i = 0; i < 150; i++) g.update(1 / 120);
    return { miss, hit, accelerated, repeated, nextLap, expired: o.boost };
  });
  expect(result.miss).toBe(0);
  expect(result.hit).toBeCloseTo(1.1);
  expect(result.accelerated).toBe(true);
  expect(result.repeated).toBe(0);
  expect(result.nextLap).toBeCloseTo(1.1);
  expect(result.expired).toBe(0);
});
