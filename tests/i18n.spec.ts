import { expect, test } from '@playwright/test';

// English pages: every visible string is translated and still fits a phone screen without sideways scrolling.
const pages = ['./', './adventure.html', './race.html', './defense.html', './echo.html', './catch.html'];
const han = /\p{Script=Han}/u;

for (const path of pages) {
  test(`english ${path} has no leftover Chinese and fits phones`, async ({ page }) => {
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.goto(`${path}${path.includes('?') ? '&' : '?'}lang=en`);
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      await expect(page.locator('.topbar-lang')).toHaveText('中文');
      await page.waitForTimeout(600);
      const leftovers = await page.evaluate(() => {
        const out: string[] = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const node = walker.currentNode as Text, el = node.parentElement!;
          if (el.closest('.topbar-lang') || !el.checkVisibility()) continue;
          if (/\p{Script=Han}/u.test(node.data)) out.push(node.data.trim());
        }
        document.querySelectorAll('[aria-label],[alt],[title]').forEach(el => {
          for (const a of ['aria-label', 'alt', 'title']) { const v = el.getAttribute(a); if (v && /\p{Script=Han}/u.test(v) && !el.closest('.topbar-lang')) out.push(`${a}=${v}`); }
        });
        return out;
      });
      expect(leftovers, `${path} @ ${viewport.width}`).toEqual([]);
      expect(han.test(await page.title())).toBe(false);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      await page.screenshot({ path: `tests/evidence/en-${viewport.width}-${path.replace(/\W/g, '') || 'map'}.png` });
    }
  });
}

test('language toggle switches, persists across pages and switches back', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.topbar-lang')).toHaveText('EN');
  await page.locator('.topbar-lang').click();
  await expect(page.locator('h1')).toHaveText('Where shall we play today?');
  await page.locator('.topbar-game').first().click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.locator('.topbar-lang').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hant');
  await expect(page.locator('.topbar-lang')).toHaveText('EN');
});
