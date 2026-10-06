import { test, expect } from '@playwright/test';
import { build, preview } from 'vite';

test('map selection supports keyboard, remembers destination and enters each game', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('.map-pin')).toHaveCount(6);
  await page.locator('[data-place=adventure]').focus(); await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-place=race]')).toBeFocused();
  await expect(page.locator('#destination-title')).toHaveText('森林賽車');
  await page.reload(); await expect(page.locator('[data-place=race]')).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: 'tests/evidence/forest-map.png', fullPage: true });
  for (const [id, path] of [['adventure','/adventure.html'], ['race','/race.html'], ['defense','/defense.html'], ['echo','/echo.html'], ['catch','/catch.html'], ['ski','/ski.html']]) {
    await page.locator(`[data-place=${id}]`).click();
    await page.locator('#depart').click(); await expect(page).toHaveURL(new RegExp(`${path.replaceAll('.', '\\.')}$$`));
    await page.getByRole('link', { name: '森林地圖', exact: true }).click();
    await expect(page.locator(`[data-place=${id}]`)).toHaveAttribute('aria-pressed','true');
  }
  expect(errors).toEqual([]);
});

test('phone map has reachable touch targets with storage blocked and no page overflow', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile:true, hasTouch:true, reducedMotion:'reduce' });
  const page = await context.newPage();
  await page.addInitScript(() => { Storage.prototype.getItem = () => { throw Error('blocked'); }; Storage.prototype.setItem = () => { throw Error('blocked'); }; });
  await page.goto('http://127.0.0.1:5173/');
  const sheet = page.locator('#destination'), close = page.locator('#sheet-close');
  await expect(sheet).toBeHidden();
  for (const pin of await page.locator('.map-pin').all()) {
    await pin.tap(); await expect(pin).toHaveAttribute('aria-pressed', 'true');
    await expect(sheet).toBeInViewport({ ratio: 1 }); await expect(page.locator('#depart')).toBeInViewport();
    await expect(close).toBeFocused();
    if (await pin.getAttribute('data-place') !== 'ski') { await close.tap(); await expect(sheet).toBeHidden(); await expect(pin).toBeFocused(); }
  }
  await expect(page.locator('#destination-title')).toHaveText('雪林滑降');
  await page.screenshot({ path:'tests/evidence/forest-map-mobile.png' });
  await page.locator('#sheet-backdrop').tap({ position: { x: 20, y: 20 } }); await expect(sheet).toBeHidden();
  await page.locator('[data-place=echo]').tap(); await page.keyboard.press('Escape'); await expect(sheet).toBeHidden();
  await page.locator('[data-place=echo]').tap(); await page.locator('#depart').tap(); await expect(page).toHaveURL(/echo\.html$/);
  await page.goBack();
  for (const width of [320,390,844]) {
    await page.setViewportSize({width, height:width === 844 ? 390 : 844});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  for (const path of ['/adventure.html', '/race.html', '/defense.html', '/echo.html', '/catch.html', '/ski.html']) {
    await page.setViewportSize({width:390,height:844}); await page.goto(`http://127.0.0.1:5173${path}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), path).toBe(true);
    await page.locator('.topbar-menu').tap();
    await page.getByRole('link',{name:'森林地圖',exact:true}).tap();
    await expect(page.locator('h1')).toHaveText('今天，想去哪裡玩？');
  }
  await context.close();
});

test('production map works under the Pages subpath with loaded portraits and game links', async ({ page }) => {
  await build({ logLevel: 'silent' });
  const server = await preview({logLevel:'silent', preview:{host:'127.0.0.1',port:0,open:false}});
  const errors: string[]=[];page.on('pageerror', e=>errors.push(e.message));
  try {
    const base = server.resolvedUrls!.local[0]; await page.goto(base);
    await expect(page.locator('.map-pin')).toHaveCount(6);
    expect(await page.locator('.map-pin img').evaluateAll(imgs=>imgs.every(img=>(img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth>0))).toBe(true);
    await page.locator('[data-place=catch]').click();await page.locator('#depart').click();
    await expect(page.locator('#start')).toBeVisible();
    await page.getByRole('link',{name:'森林地圖',exact:true}).click();
    await expect(page).toHaveURL(base);
    expect(errors).toEqual([]);
  } finally { await page.goto('about:blank'); await new Promise<void>(resolve=>server.httpServer.close(()=>resolve())); }
});

test('every page shares the same top bar on desktop and phone, and the old map URL redirects home', async ({ browser }) => {
  const pages: [string, string][] = [['/', '森林地圖'], ['/adventure.html', '森林冒險'], ['/race.html', '森林賽車'], ['/defense.html', '爆破保衛戰'], ['/echo.html', '森林回音'], ['/catch.html', '音符接接樂'], ['/ski.html', '雪林滑降']];
  for (const [w, h, mobile] of [[1280, 900, false], [390, 844, true]] as const) {
    const context = await browser.newContext({ baseURL: 'http://127.0.0.1:5173', viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile });
    const page = await context.newPage();
    const boxes: string[] = [];
    for (const [path, label] of pages) {
      await page.goto(path);
      await expect(page.locator('.topbar [aria-current=page]')).toContainText(label);
      await expect(page.locator('.topbar-game')).toHaveCount(6);
      const b = await page.locator('.topbar').boundingBox();
      boxes.push(`${Math.round(b!.height)}`);
      if (mobile) await page.screenshot({ path: `tests/evidence/nav-mobile-${label}.png`, clip: { x: 0, y: 0, width: w, height: 140 } });
      if (mobile) {
        // Phones fold the page links into one dropdown named after the current page.
        await expect(page.locator('.topbar-menu')).toContainText(label);
        await expect(page.locator('.topbar-game').first()).toBeHidden();
        await page.locator('.topbar-menu').click();
        await expect(page.locator('.topbar-game')).toHaveCount(6);
        await expect(page.locator('.topbar-game').first()).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.locator('.topbar-game').first()).toBeHidden();
      }
    }
    expect(new Set(boxes).size, `${w}px header heights ${boxes}`).toBe(1);
    await context.close();
  }
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:5173/forest.html');
  await expect(page.locator('h1')).toHaveText('今天，想去哪裡玩？');
  await page.close();
});

test('on phones every page fits one screen and each game explains itself in a swipeable popup', async ({ browser }) => {
  for (const [w, h] of [[390, 844], [375, 667]]) {
    const context = await browser.newContext({ baseURL: 'http://127.0.0.1:5173', viewport: { width: w, height: h }, isMobile: true, hasTouch: true, storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    for (const path of ['/', '/adventure.html', '/race.html', '/defense.html', '/echo.html', '/catch.html', '/ski.html']) {
      await page.goto(path);
      const guide = page.locator('.guide');
      if (path !== '/') {
        await expect(guide, `${path} first visit`).toBeVisible();
        await expect(page.locator('.guide-sheet')).toBeInViewport({ ratio: 1 });
        expect(await page.evaluate(() => innerWidth)).toBe(w);
        const pages = await page.locator('.guide-page').count();
        expect(pages).toBeGreaterThanOrEqual(3);
        // Quick double tap still moves two pages; the last page's button starts the game.
        await page.locator('.guide-next').click(); await page.locator('.guide-next').click();
        await expect(page.locator('.guide-dots i').nth(2)).toHaveClass(/on/);
        await page.locator('.guide-close').tap(); await expect(guide).toBeHidden();
        await page.reload(); await expect(guide).toBeHidden();
        await page.locator('[data-guide-open]').tap(); await expect(guide).toBeVisible();
        await page.keyboard.press('Escape'); await expect(guide).toBeHidden();
      }
      expect(await page.evaluate(() => document.documentElement.scrollHeight), `${path} at ${w}×${h}`).toBeLessThanOrEqual(h);
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `${path} width`).toBeLessThanOrEqual(w);
    }
    await context.close();
  }
});
