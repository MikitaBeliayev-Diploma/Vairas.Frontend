// Isolated public UI check; this is not proof of backend integration.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
let browser;
before(async () => {
  browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge',
    headless: true,
  });
  await fs.mkdir('test-results', { recursive: true });
});
after(async () => {
  await browser?.close();
});
for (const [name, width, height] of [
  ['desktop', 1440, 900],
  ['tablet', 768, 1024],
  ['mobile', 390, 844],
]) {
  test(`${name}: light/dark layout and preference restoration`, async () => {
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      colorScheme: 'light',
      viewport: { width, height },
    });
    try {
      const page = await context.newPage();
      await page.goto((process.env.LIVE_URL || 'https://localhost:4200') + '/login');
      const lightBackground = await page
        .locator('input')
        .first()
        .evaluate((el) => getComputedStyle(el).backgroundColor);
      await page.getByRole('button', { name: 'Dark theme', exact: true }).click();
      await page.waitForFunction(
        (expected) =>
          getComputedStyle(document.querySelector('input')).backgroundColor !== expected,
        lightBackground,
      );
      await page.waitForFunction(() => document.documentElement.classList.contains('vairas-dark'));
      assert.equal(await page.evaluate(() => localStorage.getItem('vairas.theme')), 'dark');
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        true,
      );
      await page.screenshot({ path: `test-results/theme-${name}-dark.png`, fullPage: true });
      await page.reload();
      await page.getByRole('button', { name: 'Light theme', exact: true }).click();
      await page.waitForFunction(() => !document.documentElement.classList.contains('vairas-dark'));
      assert.equal(await page.evaluate(() => localStorage.getItem('vairas.theme')), 'light');
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        true,
      );
      await page.screenshot({ path: `test-results/theme-${name}-light.png`, fullPage: true });
    } finally {
      await context.close();
    }
  });
}
