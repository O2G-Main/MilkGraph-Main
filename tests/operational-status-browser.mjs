import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
const base=process.env.BASE_URL??'http://localhost:3105';
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE??'/usr/bin/chromium'});
const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
let failed=false,empty=false;const writes=[],errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{localStorage.setItem('milkgraph-account','USR-superadmin');sessionStorage.setItem('milkgraph-api-role','superadmin');localStorage.setItem('milkgraph-panduan-seen','1');});
const daily=[1,2,3,4].map(n=>({batch_id:`B${n}`,batch_code:`MG${n}`,production_date:'2026-11-01',line_no:1,production_order_id:`PO${n}`,finished_sku_id:'FG1',target_volume_l:5000}));
const predictions=['tidak_terpenuhi','berisiko','terpenuhi'].map((status,i)=>({id:11+i,batch_id:`B${i+1}`,production_date:'2026-11-01',fulfill_status:status,shortage_l:i===2?0:1000,bottleneck_asset_id:'FL-01',risk_reason:'Fakta server',input_facts:{opening_stock_l:2000,planned_supply_l:2000,batch_demand_l:5000},calculated_at:'2026-11-01T03:00:00Z'}));
const recommendations=[{id:101,batch_id:'B1',prediction_id:11,recommendation_type:'naikkan_speed',reason_facts:{sumber_pilihan:'jev'}},{id:102,batch_id:'B2',prediction_id:12,recommendation_type:'geser_jadwal',reason_facts:{sumber_pilihan:'template'}},{id:91,batch_id:'B1',prediction_id:1,recommendation_type:'upgrade_kapasitas',reason_facts:{}}].map(r=>({...r,production_date:'2026-11-01',status:'draft',expected_gain:1000,target_asset_id:'FL-01'}));
await page.route('**/api/v1/**',async route=>{
 const req=route.request(),url=new URL(req.url()),path=url.pathname.split('/api/v1')[1];
 if(req.method()!=='GET'){writes.push(path);return route.fulfill({status:405,json:{}});}
 if(path==='/events')return route.fulfill({contentType:'text/event-stream',body:': QA\n\n'});
 if(path==='/meta')return route.fulfill({json:{event_invalidations:{}}});
 if(path==='/session')return route.fulfill({json:{role:'superadmin',permissions:['plan.decide']}});
 if(path==='/limits')return route.fulfill({json:{maxTransfer:9000,tankMax:95,cipBuffer:0,changeoverMax:2}});
 if(path==='/production/daily')return route.fulfill({json:{production_date:url.searchParams.get('date'),batches:empty?[]:daily,count:empty?0:daily.length}});
 if(path==='/production/predictions')return failed?route.fulfill({status:503,json:{error:{message:'Prediksi gagal'}}}):route.fulfill({json:{items:empty?[]:predictions,count:empty?0:predictions.length}});
 if(path==='/production/recommendations')return route.fulfill({json:{items:empty?[]:recommendations,count:empty?0:recommendations.length}});
 return route.fulfill({json:[]});
});
try{
 await page.goto(base+'/operasional/prediksi?date=2026-11-01');
 await expect(page.getByRole('heading',{name:'Status Pemenuhan',exact:true})).toBeVisible();await expect(page.locator('#desktop-navigation .nav-item.active')).toHaveAttribute('aria-label','Operasional');
 await expect(page.getByText('Dipilih AI',{exact:true})).toBeVisible();await expect(page.getByText('Dipilih aturan BE',{exact:true})).toBeVisible();await expect(page.getByText('Belum dihitung',{exact:true})).toBeVisible();
 await expect(page.getByText('Upgrade kapasitas',{exact:true})).toHaveCount(0);
 const link=page.getByRole('link',{name:'Tinjau rekomendasi untuk batch MG1',exact:true});
 await expect(link).toHaveAttribute('href','/rencana/upgrade?date=2026-11-01&prediction=11&batch=B1');
 for(const width of [320,768,1024,1440]){await page.setViewportSize({width,height:1000});await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);}
 if(process.env.QA_ARTIFACT_DIR)await page.screenshot({path:process.env.QA_ARTIFACT_DIR+'/status-pemenuhan.png',fullPage:true});
 await link.press('Enter');await expect(page).toHaveURL(base+'/rencana/upgrade?date=2026-11-01&prediction=11&batch=B1');
 await expect(page.getByRole('row').filter({hasText:'#101 · Naikkan speed'})).toBeVisible();await expect(page.getByRole('row').filter({hasText:'#91 ·'})).toHaveCount(0);await expect(page.getByRole('row').filter({hasText:'#102 ·'})).toHaveCount(0);
 await page.reload();await expect(page.getByRole('row').filter({hasText:'#101 · Naikkan speed'})).toBeVisible();
 await page.getByRole('button',{name:'Lihat semua rekomendasi untuk pilihan ini'}).click();await expect(page.getByRole('row').filter({hasText:'#91 ·'})).toBeVisible();
 failed=true;await page.goto(base+'/operasional/prediksi?date=2026-11-01');await expect(page.getByText('Gagal memuat prediksi:',{exact:false})).toBeVisible();await expect(page.getByText('Belum dihitung',{exact:true})).toHaveCount(0);
 failed=false;empty=true;await page.getByRole('button',{name:'Perbarui tampilan',exact:true}).click();await expect(page.getByText('Belum ada batch produksi pada tanggal ini.')).toBeVisible();
 assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);console.log('PASS Operational fulfillment: four states including unassessed, BE/AI provenance, latest prediction association, deep-link date/batch/prediction, keyboard, refresh persistence, old result reset, error/empty, four widths; GET-only');
}finally{await browser.close();}
