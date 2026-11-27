import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
const root=process.env.BASE_URL??'http://localhost:3105';
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE??'/usr/bin/chromium'});
const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
let status='planned_maintenance';const writes=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{localStorage.setItem('milkgraph-account','USR-superadmin');sessionStorage.setItem('milkgraph-api-role','superadmin');localStorage.setItem('milkgraph-panduan-seen','1');});
const asset={asset_id:'FL-01',asset_name:'Filler satu',asset_type:'Filling Line',current_status:status,current_status_reason:'user_input',current_status_source:'user_input',current_status_observed_at:'2026-11-01T03:00:00Z'};
const row={production_date:'2026-11-01',batch_id:'B1',batch_code:'MG-20261101-001',sequence_no:1,line_no:1,production_order_id:'PO1',finished_sku_id:'ESL-CH-1000-EXP',filling_line_id:'FL-01',aseptic_tank_id:'AT-01',sterilizer_id:'ST-01',target_volume_l:5000,target_packs:5000,status:'ON_TRACK'};
await page.route('**/api/v1/**',async route=>{
 const req=route.request(),url=new URL(req.url()),path=url.pathname.split('/api/v1')[1];
 if(req.method()!=='GET'){
  writes.push({path,body:req.postDataJSON()});assert.equal(path,'/production/assets/FL-01/status');status=req.postDataJSON().status;return route.fulfill({json:{}});
 }
 if(path==='/events')return route.fulfill({contentType:'text/event-stream',body:': QA\n\n'});
 if(path==='/meta')return route.fulfill({json:{event_invalidations:{}}});
 if(path==='/session')return route.fulfill({json:{role:'superadmin',permissions:['downtime.record','plan.decide','constraint.edit']}});
 if(path==='/limits')return route.fulfill({json:{maxTransfer:9000,tankMax:95,cipBuffer:0,changeoverMax:2}});
 if(path==='/downtime-events/prediction'||path==='/maintenance/recommendation')return route.fulfill({status:404,json:{error:{message:'Belum ada data'}}});
 if(path==='/production/products')return route.fulfill({json:{products:[{sku_id:'ESL-CH',product_name:'ESL Chocolate',product_family:'ESL',flavour:'Chocolate'}],pack_size_codes:[{pack_size_code:'LARGE_A',description:'Ukuran besar A',exact_size_ml:1000},{pack_size_code:'ESL_320',description:'ESL Full Cream atau Chocolate; FL-01 saja',exact_size_ml:320}],product_pack_sizes:[{sku_id:'ESL-CH',pack_size_code:'LARGE_A'},{sku_id:'ESL-CH',pack_size_code:'ESL_320'}],product_market_variants:[{sku_id:'ESL-CH',market_variant:'EXP'},{sku_id:'ESL-CH',market_variant:'LOCAL'}],finished_skus:Array.from({length:16},(_,i)=>({finished_sku_id:`ESL-CH-${i+1000}-EXP`,liquid_sku_id:'ESL-CH',pack_size_code:i%2?'ESL_320':'LARGE_A',market_variant:i%2?'LOCAL':'EXP'}))}});
 if(path==='/production/assets')return route.fulfill({json:{count:1,items:[{...asset,current_status:status}]}});
 if(path==='/master/assets')return route.fulfill({json:[{...asset,speed_packph:'12000',capacity_l:'N/A'}]});
 if(path==='/master/topology')return route.fulfill({json:{nodes:[asset],edges:[]}});
 if(path==='/production/schedule')return route.fulfill({json:{count:1,items:[row]}});
 if(path==='/production/daily')return route.fulfill({json:{production_date:url.searchParams.get('date'),count:1,batches:[{...row,batch_status:'ON_TRACK'}]}});
 if(path==='/production/plans'||path==='/production/predictions'||path==='/production/recommendations')return route.fulfill({json:{count:0,items:[]}});
 if(path==='/schedules/latest')return route.fulfill({json:{schedule_id:'SCH1',version:1,generated_at:'2026-11-01T06:00:00+07:00',window:{start:'2026-11-01T06:00:00+07:00',end:'2026-11-08T06:00:00+07:00'},runs:[],warnings:[],fulfilment:[]}});
 if(path==='/trace/history')return route.fulfill({json:{groups:[]}});
 return route.fulfill({json:[]});
});
async function checkModal(name){
 const modal=page.getByRole('dialog',{name,exact:true});await expect(modal).toBeVisible();
 for(const width of [320,768,1024,1440]){
  await page.setViewportSize({width,height:900});const rect=await modal.boundingBox();assert.ok(rect);assert.ok(Math.abs(rect.width-Math.min(720,width-32))<1,`${name} width ${rect.width} at ${width}`);
  assert.ok(await modal.evaluate(el=>el.scrollWidth<=el.clientWidth),name+' horizontal overflow '+width);
  await modal.evaluate(el=>el.scrollTop=el.scrollHeight);await expect(modal.getByRole('button',{name:'Tutup dialog',exact:true})).toBeInViewport();await modal.evaluate(el=>el.scrollTop=0);
 }
 return modal;
}
try{
 await page.goto(root+'/produk');const productButton=page.getByRole('button',{name:'Lihat detail ESL Chocolate',exact:true});await productButton.press('Enter');
 let modal=await checkModal('ESL Chocolate');await expect(modal).not.toContainText('LARGE_A');await expect(modal).not.toContainText('ESL_320');await expect(modal).toContainText('Ukuran besar A');await expect(modal).toContainText('ESL 320 ml');await expect(modal).toContainText('Ekspor');await expect(modal).toContainText('Lokal');await expect(modal).toContainText('ESL-CH-1000-EXP');
 if(process.env.QA_ARTIFACT_DIR)await page.screenshot({path:process.env.QA_ARTIFACT_DIR+'/modal-produk-konsisten.png'});
 await page.keyboard.press('Escape');await expect(productButton).toBeFocused();
 await page.goto(root+'/alat');await page.getByRole('button',{name:'Detail FL-01',exact:true}).click();modal=await checkModal('Detail FL-01');await expect(modal).toContainText('Perawatan terencana');await expect(modal).toContainText('Input pengguna');await expect(modal).not.toContainText('planned_maintenance');await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Catat status FL-01',exact:true}).click();modal=await checkModal('Catat status FL-01');const field=modal.getByLabel('Status baru (wajib)',{exact:true});await field.fill('planned_maintenance');await expect(field).toHaveValue('planned_maintenance');await modal.getByRole('button',{name:'Simpan status',exact:true}).click();await expect(modal).toHaveCount(0);assert.equal(writes[0].body.status,'planned_maintenance');
 await page.goto(root+'/produksi?tab=kondisi&date=2026-11-01');await page.getByRole('button',{name:/^Lihat alat FL-01/}).first().press('Enter');modal=await checkModal('FL-01 · Filler satu');await expect(modal).toContainText('Input pengguna');await page.keyboard.press('Escape');
 await page.goto(root+'/penjadwalan?date=2026-11-01');await page.getByRole('button',{name:'PO & versi jadwal',exact:true}).click();await checkModal('PO & versi jadwal');await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Lihat target & alokasi',exact:true}).click();await checkModal('Target & alokasi mingguan');await page.keyboard.press('Escape');
 await page.locator('nav[aria-label="Hari produksi"] [aria-current="date"] button').click();await page.getByRole('button',{name:/MG-20261101-001/}).first().click();await checkModal('MG-20261101-001');await page.keyboard.press('Escape');
 assert.deepEqual(errors,[]);assert.equal(writes.length,1);console.log('PASS shared modal width across product/equipment/status/factory/schedule/tools/targets at four widths; readable enums/packaging/markets; legitimate IDs, raw form payloads, scrolling, Escape and focus preserved; writes mocked');
}finally{await page.unrouteAll({behavior:'ignoreErrors'});await browser.close();}
