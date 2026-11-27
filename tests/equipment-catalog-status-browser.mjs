import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
const base=process.env.BASE_URL??'http://localhost:3105';
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE??'/usr/bin/chromium'});
const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
const errors=[],writes=[];let failed=false,empty=false;page.on('pageerror',e=>errors.push(e.message));
const master=[{asset_id:'AT-01',asset_name:'Tangki Greenfields',asset_type:'Aseptic Tank',capacity_l:'20000',holding_time_limit_hours:'12',cip_duration_minutes:'0'},{asset_id:'FL-01',asset_name:'Filler Greenfields',asset_type:'Filling Line',capacity_l:'N/A',speed_packph:'12000'},{asset_id:'PIPE-01',asset_name:'Pipa Greenfields',asset_type:'Pipe',capacity_l:'X'}];
await page.addInitScript(()=>{localStorage.setItem('milkgraph-account','USR-superadmin');sessionStorage.setItem('milkgraph-api-role','superadmin');localStorage.setItem('milkgraph-panduan-seen','1');});
await page.route('**/api/v1/**',async route=>{
 const req=route.request(),u=new URL(req.url()),path=u.pathname.split('/api/v1')[1];
 if(req.method()!=='GET'){writes.push(path);return route.fulfill({status:405,json:{}});}
 if(path==='/events')return route.fulfill({contentType:'text/event-stream',body:': QA\n\n'});
 if(path==='/meta')return route.fulfill({json:{event_invalidations:{}}});
 if(path==='/session')return route.fulfill({json:{role:'superadmin',permissions:['downtime.record','constraint.edit']}});
 if(path==='/limits')return route.fulfill({json:{maxTransfer:9000,tankMax:95,cipBuffer:0,changeoverMax:2}});
 if(path==='/master/assets')return failed?route.fulfill({status:503,json:{error:{message:'Master gagal'}}}):route.fulfill({json:empty?[]:master});
 if(path==='/production/assets')return route.fulfill({json:{count:3,items:master.filter(r=>u.searchParams.get('include_pipes')==='true'||r.asset_id!=='PIPE-01').map(r=>({...r,current_status:r.asset_id==='FL-01'?'planned_maintenance':null,current_status_reason:null,current_status_observed_at:null}))}});
 if(path==='/downtime-events/prediction'||path==='/maintenance/recommendation')return route.fulfill({status:404,json:{error:{message:'Belum tersedia'}}});
 if(path==='/master/lines')return route.fulfill({json:{dedications:[],finishedCompatibility:[],productCompatibility:[]}});
 return route.fulfill({json:[]});
});
try{
 await page.goto(base+'/alat');await expect(page.getByRole('heading',{name:'Alat',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Katalog alat',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.getByRole('heading',{name:'Katalog alat Greenfields',exact:true})).toBeVisible();
 await expect(page.getByText('Menampilkan 3 dari 3 entri master.',{exact:false})).toBeVisible();await expect(page.getByRole('heading',{name:'Downtime',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Catat status FL-01'})).toHaveCount(0);
 await page.getByRole('button',{name:'Spesifikasi AT-01',exact:true}).press('Enter');const modal=page.getByRole('dialog',{name:'Spesifikasi AT-01',exact:true});await expect(modal).toContainText('20000');await expect(modal.getByRole('row').filter({hasText:'Durasi CIP (menit)'})).toContainText('0');await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Lihat status FL-01',exact:true}).press('Enter');await expect(page).toHaveURL(base+'/alat?tab=status&asset=FL-01');await expect(page.getByRole('heading',{name:'Status alat',exact:true})).toBeVisible();await expect(page.getByRole('region',{name:'Status alat',exact:true})).toBeFocused();await expect(page.getByRole('button',{name:'Detail FL-01',exact:true})).toBeVisible();await expect(page.getByText('Perawatan terencana',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Alat untuk prediksi',exact:true})).toContainText('FL-01');
 await page.reload();await expect(page.getByRole('button',{name:'Status',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.getByRole('button',{name:'Detail FL-01',exact:true})).toBeVisible();
 for(const width of [320,768,1024,1440]){
  await page.setViewportSize({width,height:1000});await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);
  await page.getByRole('button',{name:'Katalog alat',exact:true}).click();await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);
  await page.getByRole('button',{name:'Status',exact:true}).click();await expect(page.getByRole('heading',{level:1})).toHaveCount(1);
 }
 await page.goto(base+'/kondisi-alat?alat=PIPE-01');await expect(page).toHaveURL(base+'/alat?tab=status&asset=PIPE-01');await expect(page.getByRole('button',{name:'Detail PIPE-01',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Kembali ke Alat',exact:true})).toHaveCount(0);
 await page.goto(base+'/alat');await page.getByLabel('Cari katalog Greenfields',{exact:true}).fill('Filler');await expect(page.getByRole('button',{name:'Spesifikasi FL-01'})).toBeVisible();await expect(page.getByRole('button',{name:'Spesifikasi AT-01'})).toHaveCount(0);
 if(process.env.QA_ARTIFACT_DIR){await page.getByLabel('Cari katalog Greenfields',{exact:true}).fill('');await page.screenshot({path:process.env.QA_ARTIFACT_DIR+'/alat-katalog-greenfields.png',fullPage:true});}
 failed=true;await page.getByRole('button',{name:'Muat ulang katalog'}).click();await expect(page.getByText('Katalog Greenfields gagal dimuat:',{exact:false})).toBeVisible();failed=false;empty=true;await page.getByRole('button',{name:'Coba lagi',exact:true}).click();await expect(page.getByText('Master alat Greenfields belum tersedia di backend.')).toBeVisible();
 assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);console.log('PASS master Greenfields default vs separate Status, spec modal/null/zero, status context+focus+reload, pipe lookup, alias redirect, search, error/empty, one heading, four widths; GET-only');
}finally{await page.unrouteAll({behavior:'ignoreErrors'});await browser.close();}
