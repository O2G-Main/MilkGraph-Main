// Integration test: use an ISOLATED backend/database, never the production API.
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
const app=process.env.BASE_URL??'http://localhost:3105';
const backend=process.env.CONFIG_TEST_API;
if(!backend||!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(backend))throw Error('CONFIG_TEST_API must point to an isolated local test backend');
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE??'/usr/bin/chromium'});
const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[];
page.on('pageerror',error=>errors.push(error.message));
await page.addInitScript(()=>{localStorage.setItem('milkgraph-account','USR-superadmin');sessionStorage.setItem('milkgraph-api-role','superadmin');localStorage.setItem('milkgraph-panduan-seen','1');});
await page.route('**/api/v1/**',async route=>{
 const url=new URL(route.request().url()),path=url.pathname.split('/api/v1')[1];
 if(path==='/events')return route.fulfill({contentType:'text/event-stream',body:': QA\n\n'});
 const response=await route.fetch({url:backend+'/api/v1'+path+url.search});await route.fulfill({response});
});
try{
 await page.goto(app+'/produksi');await page.getByRole('button',{name:'Manajemen proses',exact:true}).click();await page.getByRole('button',{name:'Alat & rute',exact:true}).click();
 await page.getByLabel('Pilih alat proses',{exact:true}).click();await page.getByRole('option',{name:/^FL-01 ·/}).click();
 const edit=page.getByRole('button',{name:'Atur parameter FL-01',exact:true});await edit.press('Enter');
 let modal=page.getByRole('dialog',{name:'Atur parameter FL-01',exact:true});await expect(modal).toBeVisible();
 const speed=modal.getByLabel('Kecepatan kemasan (pak/jam)',{exact:true});await expect(speed).toBeVisible();await expect(modal.getByLabel('Kapasitas (L)',{exact:true})).toHaveCount(0);
 await speed.fill('17000');await modal.getByRole('button',{name:'Simpan konfigurasi alat',exact:true}).click();await expect(modal).toHaveCount(0);await expect(page.getByText('Konfigurasi FL-01 tersimpan dan sudah diverifikasi dari backend.')).toBeVisible();await expect(edit).toBeFocused();
 // A page reload reads the value from PostgreSQL, not local browser state.
 await page.reload();await page.getByRole('button',{name:'Manajemen proses',exact:true}).click();await page.getByRole('button',{name:'Alat & rute',exact:true}).click();await page.getByLabel('Pilih alat proses',{exact:true}).click();await page.getByRole('option',{name:/^FL-01 ·/}).click();await edit.click();await expect(speed).toHaveValue('17000');
 for(const width of [320,768,1024,1440]){await page.setViewportSize({width,height:1000});await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);assert.ok(await modal.evaluate(el=>el.scrollWidth<=el.clientWidth),'modal overflow '+width);}
 // Concurrent writer advances the version; the open form must not overwrite it.
 const latest=await (await page.request.get(backend+'/api/v1/production/assets/FL-01/configuration',{headers:{'X-Demo-Role':'superadmin'}})).json();
 const concurrent=await page.request.patch(backend+'/api/v1/production/assets/FL-01/configuration',{headers:{'X-Demo-Role':'superadmin'},data:{version:latest.version,changes:{speed_packph:18000}}});assert.equal(concurrent.status(),200);
 await speed.fill('19000');await modal.getByRole('button',{name:'Simpan konfigurasi alat',exact:true}).click();await expect(modal.getByRole('alert')).toContainText('sudah berubah');await expect(speed).toHaveValue('19000');
 await page.keyboard.press('Escape');
 await page.getByLabel('Pilih alat proses',{exact:true}).click();await page.getByRole('option',{name:/^AT-01 ·/}).click();await page.getByRole('button',{name:'Atur parameter AT-01',exact:true}).click();modal=page.getByRole('dialog',{name:'Atur parameter AT-01',exact:true});
 await expect(modal.getByLabel('Kapasitas (L)',{exact:true})).toBeVisible();await expect(modal.getByLabel('Kecepatan kemasan (pak/jam)',{exact:true})).toHaveCount(0);
 await modal.getByLabel('Kapasitas (L)',{exact:true}).fill('');await modal.getByLabel('Durasi CIP (menit)',{exact:true}).fill('0');await modal.getByLabel('Batas holding time (jam)',{exact:true}).fill('6');await modal.getByRole('button',{name:'Simpan konfigurasi alat',exact:true}).click();await expect(modal).toHaveCount(0);
 const tank=await(await page.request.get(backend+'/api/v1/production/assets/AT-01/configuration',{headers:{'X-Demo-Role':'superadmin'}})).json();assert.equal(tank.values.capacity_l,null);assert.equal(tank.values.cip_duration_minutes,0);assert.equal(tank.values.holding_time_limit_hours,6);
 if(process.env.QA_ARTIFACT_DIR){await page.screenshot({path:process.env.QA_ARTIFACT_DIR+'/konfigurasi-per-alat.png',fullPage:true});}
 assert.deepEqual(errors,[]);console.log('PASS real isolated BE/PostgreSQL: per-type schema, save/readback/reload, optimistic conflict, null/zero, keyboard/focus, four widths');
}finally{await browser.close();}
