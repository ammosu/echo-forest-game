import { test, expect } from '@playwright/test';
import { build, preview } from 'vite';

test('map selection supports keyboard, remembers destination and enters each game', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/forest.html');
  await expect(page.locator('.map-pin')).toHaveCount(5);
  await page.locator('[data-place=adventure]').focus(); await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-place=race]')).toBeFocused();
  await expect(page.locator('#destination-title')).toHaveText('森林賽車');
  await page.reload(); await expect(page.locator('[data-place=race]')).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: 'tests/evidence/forest-map.png', fullPage: true });
  for (const [id, path] of [['adventure','/'], ['race','/race.html'], ['defense','/defense.html'], ['echo','/echo.html'], ['catch','/catch.html']]) {
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
  await page.goto('http://127.0.0.1:5173/forest.html');
  for (const pin of await page.locator('.map-pin').all()) {
    await pin.tap(); await expect(pin).toHaveAttribute('aria-pressed', 'true');
  }
  await expect(page.locator('#destination-title')).toHaveText('音符接接樂');
  await page.screenshot({ path:'tests/evidence/forest-map-mobile.png', fullPage:true });
  for (const width of [320,390,844]) {
    await page.setViewportSize({width, height:width === 844 ? 390 : 844});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  for (const path of ['/', '/race.html', '/defense.html', '/echo.html', '/catch.html']) {
    await page.setViewportSize({width:390,height:844}); await page.goto(`http://127.0.0.1:5173${path}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), path).toBe(true);
    await page.getByRole('link',{name:'森林地圖',exact:true}).click();
    await expect(page.locator('h1')).toHaveText('今天，想去哪裡玩？');
  }
  await context.close();
});

test('production map works under the Pages subpath with loaded portraits and game links', async ({ page }) => {
  await build({ logLevel: 'silent' });
  const server = await preview({logLevel:'silent', preview:{host:'127.0.0.1',port:0,open:false}});
  const errors: string[]=[];page.on('pageerror', e=>errors.push(e.message));
  try {
    const base = server.resolvedUrls!.local[0]; await page.goto(`${base}forest.html`);
    await expect(page.locator('.map-pin')).toHaveCount(5);
    expect(await page.locator('.map-pin img').evaluateAll(imgs=>imgs.every(img=>(img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth>0))).toBe(true);
    await page.locator('[data-place=catch]').click();await page.locator('#depart').click();
    await expect(page.locator('#start')).toBeVisible();
    await page.getByRole('link',{name:'森林地圖',exact:true}).click();
    await expect(page).toHaveURL(`${base}forest.html`);
    expect(errors).toEqual([]);
  } finally { await page.goto('about:blank'); await new Promise<void>(resolve=>server.httpServer.close(()=>resolve())); }
});
