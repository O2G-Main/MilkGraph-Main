import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const root = process.env.BASE_URL ?? 'http://127.0.0.1:3100';
const api = process.env.QA_API_URL ?? 'http://127.0.0.1:8081';
const output = process.env.QA_ARTIFACT_DIR ?? `${process.env.TMPDIR ?? '.'}/milkgraph-image-one-qa`;
const liveGet = async path => {
  const response = await fetch(api + '/api/v1' + path, { headers: { 'X-Demo-Role': 'superadmin' } });
  assert.equal(response.status, 200, path);
  return response.json();
};
const [liveCatalog, liveTopology, livePlans] = await Promise.all([liveGet('/production/products'), liveGet('/master/topology'), liveGet('/production/plans')]);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}), headless: true });
const report = [], errors = [], requests = [], blocked = [];
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const page = await context.newPage();
page.setDefaultTimeout(30000);
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (request.url().includes('/api/v1/')) requests.push({ method: request.method(), url: request.url(), body: request.postData() }); });
// Production is read-only: login persona and all operational writes below are explicit local mocks.
await page.route('**/api/v1/**', async route => {
  const request = route.request();
  if (request.url().endsWith('/session/role')) return route.fulfill({ json: { ok: true } });
  if (!['GET', 'OPTIONS'].includes(request.method())) { blocked.push({ method: request.method(), url: request.url() }); return route.fulfill({ status: 403, json: { error: { code: 'QA_BLOCKED', message: 'Unmocked production write blocked' } } }); }
  const url = new URL(request.url());
  const response = await route.fetch({ url: api + url.pathname + url.search });
  return route.fulfill({ response });
});
try {
  await page.goto(root + '/login');
  await page.getByRole('button', { name: 'Email', exact: true }).click();
  await page.getByRole('option').filter({ hasText: 'bagas.wicaksono@milkgraph.id' }).click();
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await page.waitForURL(root + '/');
  await page.getByRole('button', { name: 'Nanti saja', exact: true }).click().catch(() => {});
  report.push('Demo login uses app autofill; session persona POST mocked locally');

  await page.goto(root + '/produk');
  await page.getByText(`${liveCatalog.products.length} dari ${liveCatalog.products.length} produk`, { exact: false }).waitFor();
  await page.getByRole('searchbox').fill('UHT-FC-1000-LOCAL');
  await page.getByRole('searchbox').fill('Chocolate');
  assert.ok(await page.locator('tbody tr').count() > 0);
  await page.getByRole('button', { name: /Lihat detail/ }).first().click();
  await page.getByRole('dialog').waitFor();
  assert.ok((await page.getByRole('dialog').innerText()).includes('Finished SKU'));
  await page.getByRole('button', { name: 'Tutup detail', exact: true }).click();
  const detailButton = page.getByRole('button', { name: /Lihat detail/ }).first();
  await detailButton.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('dialog').waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(), 0);
  assert.ok(await detailButton.evaluate(element => document.activeElement === element));
  await page.getByRole('searchbox').fill('NO-MATCH-QA');
  await page.getByText('Tidak ada produk yang cocok dengan pencarian atau filter.').waitFor();
  report.push(`Live product catalogue: ${liveCatalog.products.length} products, search, SKU relations/detail, empty search`);

  await page.goto(root + '/alat');
  await page.getByRole('button', { name: 'Detail UB-01', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Detail UB-01', exact: true }).click();
  await page.getByRole('dialog').getByText('N/A', { exact: true }).first().waitFor();
  await page.getByRole('dialog').getByRole('button', { name: 'Tutup', exact: true }).click();
  await page.getByRole('button', { name: 'Termasuk pipa', exact: true }).click();
  await page.getByRole('button', { name: 'Detail PIPE-01', exact: true }).waitFor();
  report.push('Live equipment: canonical IDs, original N/A specs, include_pipes catalogue');

  const equipment = await (await fetch(api + '/api/v1/production/assets?include_pipes=true', { headers: { 'X-Demo-Role': 'superadmin' } })).json();
  const equipmentRoute = '**/api/v1/production/assets**';
  let statusWrites = 0;
  await page.route(equipmentRoute, async route => {
    const request = route.request();
    if (request.method() === 'POST') {
      const body = request.postDataJSON();
      assert.deepEqual(body, { status: 'Maintenance', status_reason: 'LOCAL QA ONLY', source: 'manual' });
      const row = equipment.items.find(asset => asset.asset_id === 'UB-01');
      Object.assign(row, { current_status: body.status, current_status_reason: body.status_reason });
      statusWrites++;
      return route.fulfill({ json: { result: row } });
    }
    return route.fulfill({ json: equipment });
  });
  await page.getByRole('button', { name: 'Catat status UB-01', exact: true }).click();
  await page.getByRole('button', { name: 'Simpan status', exact: true }).click();
  await page.getByText('Masukkan status yang valid tanpa karakter kontrol.').waitFor();
  await page.getByRole('dialog').getByLabel('Status baru (wajib)').fill('Maintenance');
  await page.getByRole('dialog').getByLabel('Alasan (opsional)').fill('LOCAL QA ONLY');
  await page.getByRole('button', { name: 'Simpan status', exact: true }).click();
  await page.getByText('Status UB-01 tersimpan dan terverifikasi: Maintenance.').waitFor();
  assert.equal(statusWrites, 1);
  await page.unroute(equipmentRoute);
  report.push('Local-mock equipment mutation: validation, exact POST body, GET readback, single write');

  await page.goto(root + '/alat');
  await page.getByRole('button', { name: 'Konfigurasi lini', exact: true }).click();
  await page.getByRole('heading', { name: 'Kompatibilitas finished SKU', exact: true }).waitFor();
  await page.getByText('FL-01', { exact: true }).first().waitFor();
  await page.goto(root + '/produksi');
  await page.getByRole('button', { name: 'Alur pabrik', exact: true }).click();
  await page.locator('.react-flow__node').first().waitFor();
  assert.equal(await page.locator('.react-flow__node').count(), liveTopology.nodes.length);
  await page.getByRole('button', { name: 'Lihat alat UB-01', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('heading', { name: 'UB-01 · Unloading Bay', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Tutup detail', exact: true }).click();
  await page.getByRole('button', { name: 'Daftar rute', exact: true }).click();
  assert.equal(await page.locator('tbody tr').count(), liveTopology.edges.length);
  await page.getByLabel('Cari alat atau rute', { exact: true }).fill(liveTopology.edges[0].connection_id);
  assert.ok(await page.locator('tbody tr').count() > 0);
  await page.getByRole('button', { name: 'Diagram', exact: true }).click();
  assert.ok(await page.locator('.react-flow__node').count() >= 2);
  await page.getByLabel('Cari alat atau rute', { exact: true }).fill('');
  report.push(`Live Production: line configuration, shared ${liveTopology.nodes.length}-node diagram and ${liveTopology.edges.length} routes`);
  report.push('Keyboard: Enter opens product/asset detail, Escape closes modal, focus returns to trigger');

  await page.goto(root + '/rencana/alur');
  await page.getByText(`Usulan dari server: ${livePlans.count}`, { exact: true }).waitFor();
  await page.locator('.react-flow__node').first().waitFor();
  assert.equal(await page.locator('.react-flow__node').count(), liveTopology.nodes.length);
  for (const route of ['/rencana/upgrade', '/rencana']) {
    await page.goto(root + route);
    await page.getByText('Belum ada data untuk filter ini.').first().waitFor();
  }
  assert.ok(!requests.some(request => request.method === 'POST' && /\/plans\/.*\/check/.test(request.url)));
  report.push(`Live Rencana: ${livePlans.count} proposals and same topology; empty prediction/recommendation states; no legacy mount POST`);

  // Test-only data exercises mutation branches absent in the empty live recommendation dataset.
  let predictionRows = [], recommendationRows = [], predictionWrites = 0, decisionWrites = 0;
  const predictionRoute = '**/api/v1/production/predictions**';
  const recommendationRoute = '**/api/v1/production/recommendations**';
  await page.route(predictionRoute, async route => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      assert.match(body.production_date, /^\d{4}-\d{2}-\d{2}$/);
      assert.deepEqual(Object.keys(body), ['production_date']);
      predictionWrites++;
      predictionRows = [{ id: 99001, production_date: body.production_date, batch_id: null, fulfill_status: 'berisiko', shortage_l: 100, bottleneck_asset_id: 'FL-05', risk_reason: 'LOCAL QA ONLY', input_facts: { fixture: true }, calculated_at: `${body.production_date}T06:00:00+07:00` }];
      recommendationRows = [{ id: 99001, production_date: body.production_date, batch_id: null, prediction_id: 99001, recommendation_type: 'upgrade_kapasitas', target_asset_id: 'FL-05', expected_gain: null, reason_facts: { fixture: true }, status: 'draft' }];
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: { count: predictionRows.length, items: predictionRows } });
  });
  await page.route(recommendationRoute, async route => {
    if (route.request().method() === 'PATCH') {
      assert.deepEqual(route.request().postDataJSON(), { status: 'accepted' });
      recommendationRows[0].status = 'accepted'; decisionWrites++;
      return route.fulfill({ json: { result: recommendationRows[0] } });
    }
    return route.fulfill({ json: { count: recommendationRows.length, items: recommendationRows } });
  });
  await page.goto(root + '/rencana/upgrade');
  await page.getByRole('button', { name: 'Jalankan prediksi', exact: true }).click();
  await page.getByText('Pembacaan ulang selesai: 1 prediksi dan 1 rekomendasi.', { exact: false }).waitFor();
  await page.getByRole('button', { name: 'Terima', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Simpan status', exact: true }).click();
  await page.getByText('Rekomendasi #99001: Diterima.', { exact: false }).waitFor();
  assert.equal(predictionWrites, 1); assert.equal(decisionWrites, 1);
  await page.unroute(predictionRoute); await page.unroute(recommendationRoute);
  report.push('Local-mock planning: prediction POST, decision PATCH, confirmation and GET readback; no production mutations');

  const catalogueRoute = '**/api/v1/production/products';
  await page.route(catalogueRoute, route => route.fulfill({ status: 503, json: { error: { code: 'QA_UNAVAILABLE', message: 'LOCAL QA ERROR' } } }));
  await page.goto(root + '/produk'); await page.reload();
  await page.getByRole('alert').getByText('Gagal memuat katalog: LOCAL QA ERROR', { exact: true }).waitFor();
  await page.unroute(catalogueRoute);
  await page.getByRole('button', { name: 'Coba lagi', exact: true }).click();
  await page.getByText(`${liveCatalog.products.length} dari ${liveCatalog.products.length} produk`, { exact: false }).waitFor();
  report.push('Local-mock catalogue failure renders an error; retry restores actual live data');

  const classifierRoute = '**/api/v1/master/changeover/classify';
  const fromSku = liveCatalog.finished_skus[0].finished_sku_id, toSku = liveCatalog.finished_skus[1].finished_sku_id;
  let classificationWrites = 0;
  await page.route(classifierRoute, route => {
    assert.deepEqual(route.request().postDataJSON(), { from: fromSku, to: toSku });
    classificationWrites++;
    return route.fulfill({ json: { ruleId: 'LOCAL_QA_RULE', precedence: 'LOCAL_QA', activity: 'LOCAL QA CLASSIFICATION', condition: 'LOCAL_QA_ONLY', requiresCip: false } });
  });
  await page.goto(root + '/aturan-produksi');
  await page.getByRole('button', { name: 'Dari finished SKU', exact: true }).click();
  await page.getByRole('option').filter({ hasText: fromSku }).first().click();
  await page.getByRole('button', { name: 'Ke finished SKU', exact: true }).click();
  await page.getByRole('option').filter({ hasText: toSku }).first().click();
  await page.getByRole('button', { name: 'Klasifikasikan', exact: true }).click();
  await page.getByText('LOCAL QA CLASSIFICATION', { exact: true }).waitFor();
  assert.equal(classificationWrites, 1);
  await page.unroute(classifierRoute);
  report.push('Local-mock classifier: canonical finished-SKU IDs, exact POST body, rendered result');

  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    for (const route of ['/produk', '/alat', '/produksi', '/aturan-produksi', '/rencana/alur', '/rencana/upgrade', '/rencana', '/master-data']) {
      await page.goto(root + route);
      await page.getByRole('heading', { level: 1 }).waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => document.querySelector('main') && ![...document.querySelectorAll('main p')].some(element => /^(Memuat|Memeriksa izin)/.test(element.textContent.trim())));
      const layout = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
      assert.ok(layout.content <= width, `${route} ${width}px overflow ${JSON.stringify(layout)}`);
      await page.screenshot({ path: `${output}/${route.slice(1).replaceAll('/', '-')}-${width}.png`, fullPage: true });
    }
    report.push(`Eight pages at ${width}px: no document overflow`);
  }
  await page.route('**/api/v1/session', route => route.fulfill({ json: { role: 'superadmin', permissions: [] } }));
  await page.goto(root + '/alat'); await page.reload();
  await page.getByText('Pencatatan status memerlukan izin downtime.record', { exact: false }).waitFor();
  assert.equal(await page.getByRole('button', { name: /^Catat status / }).count(), 0);
  await page.goto(root + '/rencana/upgrade');
  await page.getByText('Anda tidak memiliki izin menjalankan prediksi.', { exact: true }).waitFor();
  assert.ok(await page.getByRole('button', { name: 'Jalankan prediksi', exact: true }).isDisabled());
  report.push('Local-mock permission denial hides asset writes and disables prediction run');
  assert.deepEqual(blocked, [], 'Unexpected operational writes must never reach production');
  assert.deepEqual(errors, [], 'No browser runtime errors');
  report.push('No browser runtime errors; no unmocked operational writes');
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {});
  await writeFile(`${output}/failure.txt`, `${error.stack}\n\n${await page.locator('body').innerText()}`);
  throw error;
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify({ report, errors, blocked, requests }, null, 2));
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await browser.close();
}
console.log(report.join('\n'));
console.log('ARTIFACTS', output);
