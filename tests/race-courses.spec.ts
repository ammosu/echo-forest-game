import { test, expect } from '@playwright/test';

for (const course of ['meadow', 'fern']) test(`${course}: distinct closed course, keyboard three laps, and separate record`, async ({ page }) => {
  await page.clock.install(); await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.goto('/race.html');
  const original = await page.evaluate(async () => (await import('/src/racing-data.ts')).track.map((p: any) => [p.mapX, p.mapY]));
  await page.goto(`/race.html?course=${course}`);
  await page.evaluate(() => localStorage.setItem('echo-forest-race-best-v1', '99'));
  await expect(page.locator('.course-option[aria-current]')).toHaveAttribute('href', `?course=${course}`);
  await expect(page.locator('#best-time')).toHaveText('還沒有紀錄');
  const geometry = await page.evaluate(async () => {
    const { track } = await import('/src/racing-data.ts');
    return track.map((p: any) => [p.mapX, p.mapY]);
  });
  expect(geometry).toHaveLength(240); expect(geometry).not.toEqual(original);
  expect(await page.evaluate(() => (window as any).__raceView.snapshot().seam)).toBeLessThan(.001);
  await page.clock.runFor(60);
  await page.screenshot({ path: `tests/evidence/course-${course}.png`, fullPage: true });
  await page.getByRole('button', { name: '上場比賽' }).click(); await page.clock.runFor(3100);
  const state = () => page.evaluate(() => (window as any).__race.snapshot());
  let s = await state();
  for (let i = 0; i < 900 && s.phase !== 'finished'; i++) {
    const target = 0;
    const desired = s.curve * .22 * (s.speed / 3600) ** 2 - s.lateralVelocity + (target - s.x) * 5;
    await page.keyboard[desired > .18 ? 'down' : 'up']('ArrowRight');
    await page.keyboard[desired < -.18 ? 'down' : 'up']('ArrowLeft');
    if (s.item) await page.keyboard.press('e');
    await page.clock.runFor(100); s = await state();
  }
  expect(s.phase).toBe('finished'); expect(s.checkpoints).toBe(12);
  expect(s.lapTimes).toHaveLength(3);
  expect(await page.evaluate(() => localStorage.getItem('echo-forest-race-best-v1'))).toBe('99');
  expect(await page.evaluate(key => Number(localStorage.getItem(key)), `echo-forest-race-${course}-best-v1`)).toBeCloseTo(s.seconds, 3);
  await page.reload(); await expect(page.locator('#best-time')).not.toHaveText('還沒有紀錄');
});

test('mobile course selection keeps layout within screen and unknown courses fall back', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/race.html?course=missing');
  await expect(page.locator('.course-option[aria-current]')).toHaveAttribute('href', '?course=morning');
  await page.getByRole('link', { name: /蕨葉溪谷/ }).click();
  await expect(page).toHaveURL(/course=fern/);
  await expect(page.locator('.course-option[aria-current]')).toContainText('蕨葉溪谷');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'tests/evidence/course-mobile.png', fullPage: true });
});
