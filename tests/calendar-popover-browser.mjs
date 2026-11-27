import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

const root = process.env.BASE_URL ?? 'http://localhost:3100';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? '/usr/bin/chromium-browser', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 812 }, reducedMotion: 'reduce' });
try {
  await page.goto(`${root}/login`);
  await page.getByRole('button', { name: 'Email', exact: true }).click();
  await page.getByRole('option').filter({ hasText: 'bagas.wicaksono@milkgraph.id' }).click();
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await page.waitForURL(`${root}/`);

  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 812 });
    await page.goto(`${root}/produksi`);
    await page.getByRole('button', { name: 'Pilih tanggal produksi' }).click();
    // A six-week month is the tallest calendar and reproduced the clipped footer.
    for (let month = 0; month < 12; month++) {
      if (await page.locator('.cal-grid > *').count() > 35) break;
      await page.getByRole('button', { name: 'Bulan berikutnya' }).click();
    }
    assert.ok(await page.locator('.cal-grid > *').count() > 35, 'No six-week month found');
    const calendar = await page.locator('.field-calendar').evaluate(panel => {
      const footer = panel.querySelector('.cal-foot');
      const p = panel.getBoundingClientRect(), f = footer.getBoundingClientRect();
      return { top: p.top, bottom: p.bottom, footerBottom: f.bottom, viewport: window.innerHeight };
    });
    assert.ok(calendar.footerBottom <= calendar.bottom - 4, `Footer clipped at ${width}px: ${JSON.stringify(calendar)}`);
    assert.ok(calendar.bottom <= calendar.viewport - 4, `Calendar outside viewport at ${width}px`);
    if (process.env.QA_ARTIFACT_DIR && width === 390) await page.screenshot({ path: `${process.env.QA_ARTIFACT_DIR}/calendar-mobile.png` });
    await page.getByRole('button', { name: 'Tutup', exact: true }).click();
    assert.equal(await page.locator('.field-calendar').count(), 0);
  }

  await page.setViewportSize({ width: 390, height: 500 });
  await page.goto(`${root}/produksi`);
  await page.getByRole('button', { name: 'Pilih tanggal produksi' }).click();
  for (let month = 0; month < 12; month++) {
    if (await page.locator('.cal-grid > *').count() > 35) break;
    await page.getByRole('button', { name: 'Bulan berikutnya' }).click();
  }
  await page.getByRole('button', { name: 'Tutup', exact: true }).click();
  assert.equal(await page.locator('.field-calendar').count(), 0);
  console.log('PASS: six-week calendar footer fully visible at 390/768/1440; short viewport remains scrollable');
} finally { await browser.close(); }
