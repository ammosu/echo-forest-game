import { test, expect, type Page } from '@playwright/test';
import { CatchGame, createChart } from '../src/catch-engine';
import { build, preview } from 'vite';

type Snapshot = ReturnType<CatchGame['snapshot']>;
const state = (page: Page): Promise<Snapshot> => page.evaluate(() => (window as any).__catchState);

test('whole chart is reachable, scores exact catches once, and completes all three phrases', () => {
  const game = new CatchGame(); game.start();
  const events: string[] = [];
  while (game.phase === 'playing') {
    const next = game.chart.find(n => !n.settled && n.kind === 'note');
    if (next) game.moveTo(next.lane);
    events.push(...game.update(1 / 60).map(e => e.kind));
  }
  expect(game.caught).toBe(48); expect(game.missed).toBe(0); expect(game.noises).toBe(0);
  expect(game.maxCombo).toBe(48); expect(game.stars).toBe(3); expect(game.score).toBe(9050);
  expect(events.filter(e => e === 'complete')).toHaveLength(1);
  expect(game.chart.every(n => n.settled)).toBe(true);
  expect(game.update(.1)).toEqual([]);
  expect(createChart().filter(n => n.kind === 'noise')).toHaveLength(21);
});

test('misses and noise reset streaks; pause freezes; restart resets chart and input', () => {
  const game = new CatchGame(); game.start();
  // Catch the first three normally, deliberately move to the fourth beat's noise.
  while (game.time < 6.1) {
    const next = game.chart.find(n => !n.settled && n.kind === (game.caught >= 3 ? 'noise' : 'note'));
    if (next) game.moveTo(next.lane);
    game.update(1 / 60);
  }
  expect(game.caught).toBe(3); expect(game.noises).toBe(1); expect(game.missed).toBe(1);
  expect(game.combo).toBe(0); expect(game.score).toBe(280);
  game.direction = 1; game.pause(); const paused = game.snapshot();
  game.update(3); expect(game.snapshot()).toEqual(paused); expect(game.direction).toBe(0);
  game.resume(); game.moveTo(-999); for (let i = 0; i < 60; i++) game.update(1 / 60);
  expect(game.x).toBe(0);
  game.start(); expect(game.score).toBe(0); expect(game.time).toBe(0);
  expect(game.chart.every(n => !n.settled)).toBe(true); expect(game.x).toBe(1.5);
});

test('normal keyboard controls complete 48-second song and persist record', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.clock.install(); await page.goto('/catch.html');
  await page.locator('[data-hero="anmi"]').click();
  await page.screenshot({ path: 'tests/evidence/catch-picker.png', fullPage: true });
  await page.locator('#start').click();
  let captured = false;
  for (let step = 0; step < 300; step++) {
    const s = await state(page); if (s.phase === 'complete') break;
    const next = s.upcoming.find(n => n.kind === 'note');
    if (next) await page.keyboard.press(String(next.lane + 1));
    await page.clock.runFor(180);
    if (s.time > 19 && !captured) { await page.screenshot({ path: 'tests/evidence/catch-playing.png', fullPage: true }); captured = true; }
  }
  const result = await state(page);
  expect(result.phase).toBe('complete'); expect(result.caught).toBe(48); expect(result.noises).toBe(0);
  await expect(page.locator('#panel')).toContainText('Anmi');
  await expect(page.locator('.catch-stars')).toHaveAttribute('aria-label', '3 顆星，滿分 3 顆');
  await page.screenshot({ path: 'tests/evidence/catch-complete.png', fullPage: true });
  await page.locator('#choose').click(); await page.locator('[data-hero="anzo"]').click(); await page.locator('#start').click();
  expect((await state(page)).score).toBe(0);
  await page.reload(); await expect(page.locator('#best')).toHaveText('9,050');
  expect(errors).toEqual([]);
});

test('keyboard, drag, pause/background, restart and input release', async ({ page }) => {
  await page.clock.install(); await page.goto('/catch.html'); await page.locator('#start').click();
  await page.keyboard.down('ArrowRight'); await page.clock.runFor(500); await page.keyboard.up('ArrowRight');
  expect((await state(page)).x).toBe(3);
  await page.keyboard.down('a'); await page.clock.runFor(300); await page.keyboard.press('Escape');
  const paused = await state(page); await page.clock.runFor(5000); expect(await state(page)).toEqual(paused);
  await page.keyboard.up('a'); await page.locator('#resume').click(); await page.clock.runFor(200);
  expect((await state(page)).x).toBeCloseTo(paused.x);
  const box = (await page.locator('#stage').boundingBox())!;
  await page.mouse.move(box.x + box.width * .8, box.y + box.height * .5); await page.mouse.down();
  await page.mouse.move(box.x + box.width * .125, box.y + box.height * .5); await page.clock.runFor(500); await page.mouse.up();
  expect((await state(page)).x).toBe(0);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  expect((await state(page)).phase).toBe('paused');
  await page.locator('#restart').click(); const restarted = await state(page);
  expect(restarted.phase).toBe('playing'); expect(restarted.caught).toBe(0); expect(restarted.time).toBeLessThan(.1);
});

test('phone touch, muted mode, unavailable storage, portrait and landscape', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.addInitScript(() => { Storage.prototype.getItem = () => { throw Error('blocked'); }; Storage.prototype.setItem = () => { throw Error('blocked'); }; });
  await page.clock.install(); await page.goto('http://127.0.0.1:5173/catch.html');
  await page.locator('#sound').tap(); await expect(page.locator('#sound')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#start').tap(); await page.locator('[data-lane="1"]').tap(); await page.clock.runFor(3300);
  expect((await state(page)).caught).toBe(1);
  const box = (await page.locator('#stage').boundingBox())!;
  await page.touchscreen.tap(box.x + box.width * .875, box.y + box.height * .5); await page.clock.runFor(500);
  expect((await state(page)).x).toBe(3);
  await page.screenshot({ path: 'tests/evidence/catch-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 844, height: 390 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#restart').click(); await page.clock.runFor(49000);
  expect((await state(page)).phase).toBe('complete');
  expect((await state(page)).stars).toBeLessThan(3);
  await expect(page.locator('#again')).toBeVisible();
  await context.close();
});

test('production subpath loads assets and omits dev state', async ({ page }) => {
  await build({ logLevel: 'silent' });
  const server = await preview({ logLevel: 'silent', preview: { host: '127.0.0.1', port: 0, open: false } });
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (r.url().startsWith(server.resolvedUrls!.local[0]) && r.status() >= 400) errors.push(r.url()); });
  try {
    await page.goto(`${server.resolvedUrls!.local[0]}catch.html`);
    await page.locator('#start').click(); await expect(page.locator('.falling-note').first()).toBeVisible();
    expect(await page.evaluate(() => typeof (window as any).__catchState)).toBe('undefined');
    expect(await page.locator('#hero').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    await page.keyboard.press('Escape'); await expect(page.locator('#resume')).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await page.goto('about:blank'); await new Promise<void>(resolve => server.httpServer.close(() => resolve()));
  }
});

test('all existing games link to the new game without mobile page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/', '/race.html', '/defense.html', '/echo.html']) {
    await page.goto(path);
    const link = page.getByRole('link', { name: '音符接接樂', exact: true });
    await expect(link).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), path).toBe(true);
    await link.click(); await expect(page.locator('#start')).toBeVisible();
  }
});

test('slower held-direction controls can reach every note at 30 fps', () => {
  const game = new CatchGame(); game.start();
  while (game.phase === 'playing') {
    const next = game.chart.find(n => !n.settled && n.kind === 'note');
    const delta = next ? next.lane - game.x : 0;
    game.direction = Math.abs(delta) > .09 ? Math.sign(delta) : 0;
    if (!game.direction) game.release();
    game.update(1 / 30);
  }
  expect(game.caught).toBe(48);
  expect(game.noises).toBe(0);
  expect(game.stars).toBe(3);
});

test('three stars require both accurate catches and avoiding noise', () => {
  const game = new CatchGame();
  game.caught = 43; expect(game.stars).toBe(2);
  game.caught = 44; game.noises = 1; expect(game.stars).toBe(3);
  game.noises = 2; expect(game.stars).toBe(2);
  game.caught = 28; expect(game.stars).toBe(2);
  game.caught = 12; expect(game.stars).toBe(1);
});
