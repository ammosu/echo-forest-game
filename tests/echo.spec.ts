import { test, expect, type Page } from '@playwright/test';
import { echoTiming } from '../src/echo-engine';

// Observe actual on-screen cues; drive normal buttons/keys without changing game state.
async function listen(page: Page, length: number) {
  const sequence: number[] = [];
  await page.clock.runFor(650);
  for (let i = 0; i < length; i++) {
    const lit = page.locator('.echo-musician.singing');
    await expect(lit).toHaveCount(1);
    sequence.push(Number(await lit.getAttribute('data-note')));
    const timing = echoTiming(length - 1);
    await page.clock.runFor(timing.flash);
    await expect(page.locator('.echo-musician.singing')).toHaveCount(0);
    await page.clock.runFor(timing.beat - timing.flash);
  }
  await expect(page.locator('.echo-concert')).toHaveAttribute('data-phase', 'answer');
  return sequence;
}

test('eight rounds, wrong answer, replay, keyboard completion and saved best', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.clock.install();
  await page.goto('/echo.html');
  await expect(page.locator('.echo-musician')).toHaveCount(4);
  await page.locator('#action').click();
  await page.keyboard.press('1');
  await expect(page.locator('.echo-concert')).toHaveAttribute('data-phase', 'listen');
  let sequence = await listen(page, 2);
  await page.keyboard.press(String((sequence[0] + 1) % 4 + 1));
  await expect(page.locator('.echo-concert')).toHaveAttribute('data-phase', 'retry');
  await page.locator('#action').click();
  expect(await listen(page, 2)).toEqual(sequence);
  await page.locator('#replay').click();
  expect(await listen(page, 2)).toEqual(sequence);
  for (let round = 1; round <= 8; round++) {
    if (round > 1) {
      await page.locator('#action').click();
      const next = await listen(page, round + 1);
      expect(next.slice(0, -1)).toEqual(sequence);
      sequence = next;
    }
    for (const note of sequence) await page.keyboard.press(String(note + 1));
    await expect(page.locator('.echo-concert')).toHaveAttribute('data-phase', round === 8 ? 'complete' : 'between');
  }
  await page.clock.runFor(1300);
  await expect(page.locator('#message')).toHaveText('森林聽見我們了！');
  await expect(page.locator('#best')).toHaveText('8');
  await page.screenshot({ path: 'tests/evidence/echo-complete.png' });
  await page.reload();
  await expect(page.locator('#best')).toHaveText('8');
  expect(errors).toEqual([]);
});

test('pause cancels playback, resume repeats whole phrase and restart clears old timers', async ({ page }) => {
  await page.clock.install();
  await page.goto('/echo.html');
  await page.locator('#action').click();
  await page.clock.runFor(700);
  await page.keyboard.press('Escape');
  await page.clock.runFor(10000);
  await expect(page.locator('.echo-concert')).toHaveAttribute('data-phase', 'paused');
  await expect(page.locator('.singing')).toHaveCount(0);
  await page.locator('#action').click();
  const sequence = await listen(page, 2);
  await page.keyboard.press(String(sequence[0] + 1));
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.locator('.echo-concert')).toHaveAttribute('data-phase', 'paused');
  await page.locator('#pause').click();
  expect(await listen(page, 2)).toEqual(sequence);
  await page.locator('#replay').click();
  await page.clock.runFor(700);
  await page.locator('#restart').click();
  await listen(page, 2);
  await expect(page.locator('#round')).toHaveText('第 1 / 8 段 · 2 個音');
  await expect(page.locator('#input-count')).toHaveText('已回應 0 / 2 個音');
});

test('mobile touch, muted visual play, blocked storage and reduced motion', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error('Storage blocked'); };
    Storage.prototype.setItem = () => { throw new Error('Storage blocked'); };
  });
  await page.clock.install();
  await page.goto('http://127.0.0.1:5173/echo.html');
  await page.locator('#sound').tap();
  await expect(page.locator('#sound')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#action').tap();
  const sequence = await listen(page, 2);
  for (const note of sequence) await page.locator(`[data-note="${note}"]`).tap();
  await expect(page.locator('.echo-concert')).toHaveAttribute('data-phase', 'between');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.clock.runFor(600);
  await page.screenshot({ path: 'tests/evidence/echo-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 844, height: 390 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await context.close();
});
