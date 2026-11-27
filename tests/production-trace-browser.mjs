import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
const root=process.env.BASE_URL??'http://localhost:3105';
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE??'/usr/bin/chromium'});
const page=await browser.newPage({viewport:{width:1440,height:1000},timezoneId:'America/Los_Angeles',reducedMotion:'reduce'});
let fail=false,empty=false,mismatch=false,many=false;
const errors=[],writes=[];page.on('pageerror',error=>errors.push(error.message));
const base={trace_source:'processing',transaction_id:'PR1',machine_id:'ST-01',activity:'Sterilizing',start_time:'2026-10-31T17:00:00Z',end_time:'2026-10-31T18:30:05Z',volume_l:5000,output_good_packs:null,output_volume_l:null,source_asset_id:'SFP-01; SFP-02',destination_asset_id:'AT-01',downtime_type:null};
const events=[{...base},{...base},{...base,transaction_id:'FM1',trace_source:'filling',machine_id:'FL-01',activity:'Waiting Material',start_time:'2026-10-31T19:00:00Z',end_time:'2026-10-31T19:05:00Z',source_asset_id:'AT-01',destination_asset_id:'FL-01',volume_l:null,output_good_packs:0,output_volume_l:0,downtime_type:'Menunggu pasokan'},{...base,transaction_id:'NO-TIME',start_time:null,end_time:null}];
const group={group_id:'CAM-TEST',product_name:'Susu uji',processing_type:'UHT',sterilizer_id:'ST-01',at_tank_id:'AT-01',jendela_mulai:'2026-11-01T00:00:00+07:00',jendela_selesai:'2026-11-01T02:05:00+07:00',jumlah_tangki_sfp:2,jumlah_lot:1,total:{persiapan_l:5000,sterilisasi_l:5000,pengisian_l:4800}};
await page.addInitScript(()=>{localStorage.setItem('milkgraph-account','USR-superadmin');sessionStorage.setItem('milkgraph-api-role','superadmin');localStorage.setItem('milkgraph-panduan-seen','1');});
await page.route('**/api/v1/**',async route=>{
 const req=route.request(),url=new URL(req.url()),path=url.pathname.split('/api/v1')[1];
 if(req.method()!=='GET'){writes.push(path);return route.fulfill({status:405,json:{}});}
 if(path==='/events')return route.fulfill({contentType:'text/event-stream',body:': QA\n\n'});
 if(path==='/meta')return route.fulfill({json:{event_invalidations:{}}});
 if(path==='/session')return route.fulfill({json:{role:'superadmin',permissions:[]}});
 if(path==='/limits')return route.fulfill({json:{maxTransfer:9000,tankMax:95,cipBuffer:0,changeoverMax:2}});
 if(path==='/trace/history')return route.fulfill({json:{groups:[group]}});
 if(path==='/trace/history/backward')return route.fulfill({json:{...group,title:'Telusur uji',label_data:'historis',steps:[{urut:1,tahap:'pengisian',waktu:'2026-11-01T02:05:00+07:00',dari:'AT-01',ke:'LOT1',volume_l:0,ref:'FM1',keterangan:'Catatan sumber'}],lots:[],note:'Sumber historis',metode:'Rekonstruksi',at_terisi_tercatat_l:5000}});
 if(path==='/production/trace'){
  assert.equal(url.searchParams.get('production_group_id'),'CAM-TEST');
  if(fail)return route.fulfill({status:503,json:{error:{message:'Transaksi gagal'}}});
  return route.fulfill({json:{production_group_id:mismatch?'OTHER':'CAM-TEST',batch_id:'B1',batch_code:'B1',production_date:'2026-11-01',events:empty?[]:many?[...events,...Array.from({length:13},(_,i)=>({...base,transaction_id:`EXTRA-${i}`}))]:events,incomplete_sections:empty?['filling_transactions']:[]}});
 }
 return route.fulfill({json:[]});
});
try{
 await page.goto(root+'/riwayat-produksi?lot=CAM-TEST');
 await expect(page.getByRole('heading',{name:'Detail alur & waktu transaksi',exact:true})).toBeVisible();
 await expect(page.getByText('3 dari 3 transaksi sesuai filter · 3 transaksi unik',{exact:false})).toBeVisible();
 const timeline=page.getByRole('list',{name:'Urutan waktu transaksi produksi'});
 await expect(timeline.locator('li')).toHaveCount(3);await expect(timeline.locator('li').first()).toContainText('1 Nov 2026');await expect(timeline.locator('li').first()).toContainText('00.00.00');
 await expect(timeline.locator('li').first()).toContainText('1 jam 30 menit 5 detik');
 await page.getByRole('button',{name:'Telusur balik',exact:true}).press('Enter');await expect(timeline.locator('li').first()).toContainText('FM1');
 const trigger=page.getByRole('button',{name:'Detail transaksi FM1, Waiting Material',exact:true});await trigger.press('Enter');
 const modal=page.getByRole('dialog',{name:'Detail transaksi FM1',exact:true});await expect(modal).toBeVisible();await expect(modal).toContainText('0 pak');await expect(modal).toContainText('0 L');await expect(modal).toContainText('Menunggu pasokan');await expect(modal).toContainText('AT-01 → LOT1');
 await page.keyboard.press('Escape');await expect(trigger).toBeFocused();
 for(const width of [320,768,1024,1440]){await page.setViewportSize({width,height:1000});await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);await trigger.click();await expect(modal).toBeVisible();assert.ok(await modal.evaluate(el=>el.scrollWidth<=el.clientWidth));await page.keyboard.press('Escape');}
 await page.getByLabel('Filter alat pada transaksi',{exact:true}).click();await page.getByRole('option',{name:'SFP-02',exact:true}).click();await expect(timeline.locator('li')).toHaveCount(2);
 await page.getByLabel('Filter sumber transaksi',{exact:true}).click();await page.getByRole('option',{name:'Filling',exact:true}).click();await expect(page.getByText('Tidak ada transaksi yang cocok dengan filter ini.')).toBeVisible();
 fail=true;await page.getByRole('button',{name:'Muat ulang transaksi'}).click();await expect(page.getByText('Transaksi belum dapat dimuat:',{exact:false})).toBeVisible();
 fail=false;empty=true;await page.getByRole('button',{name:'Coba lagi',exact:true}).click();await expect(page.getByText('Belum ada transaksi rinci yang tercatat',{exact:false})).toBeVisible();await expect(page.getByText('Bagian data belum lengkap:',{exact:false})).toContainText('transaksi filling');
 empty=false;mismatch=true;await page.getByRole('button',{name:'Muat ulang transaksi'}).click();await expect(page.getByText('Data transaksi belum cocok',{exact:false})).toBeVisible();
 mismatch=false;many=true;await page.getByRole('button',{name:'Muat ulang transaksi'}).click();
 await page.getByLabel('Filter alat pada transaksi',{exact:true}).click();await page.getByRole('option',{name:'Semua alat / titik',exact:true}).click();
 await page.getByLabel('Filter sumber transaksi',{exact:true}).click();await page.getByRole('option',{name:'Semua sumber',exact:true}).click();
 await expect(timeline.locator('li')).toHaveCount(12);await page.setViewportSize({width:320,height:1000});await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);
 await page.getByRole('button',{name:/Tampilkan 4 transaksi berikutnya/}).click();await expect(timeline.locator('li')).toHaveCount(16);
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);console.log('PASS trace timeline: GET-only group scope, exact deduplication, WIB seconds, duration, traceback order, missing times, source/asset filters, zero values, reference join, error/empty/mismatch, keyboard and four widths');
}finally{await browser.close();}
