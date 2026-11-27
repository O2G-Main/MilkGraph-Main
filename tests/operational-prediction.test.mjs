import { test } from 'node:test';
import assert from 'node:assert/strict';
import { latestPredictions, relatedRecommendations } from '../lib/operational-prediction.ts';
const first={id:1,production_date:'2026-11-01',batch_id:'B1',calculated_at:'2026-11-01T05:00:00Z',fulfill_status:'berisiko'};
test('operational summary uses latest assessment per batch on the selected date',()=>{
 const second={...first,id:2,calculated_at:'2026-11-01T06:00:00Z',fulfill_status:'terpenuhi'};
 assert.deepEqual(latestPredictions([second,first,{...first,id:3,production_date:'2026-11-02'}],'2026-11-01'),[second]);
 assert.equal(latestPredictions([first,{...first,id:4}],'2026-11-01')[0].id,4);
 assert.equal(latestPredictions([first,{...first,id:5,batch_id:null}],'2026-11-01').length,2);
});
test('recommendation suggestions require exact date, batch, prediction and a nonrejected decision',()=>{
 const good={id:1,production_date:first.production_date,batch_id:'B1',prediction_id:1,status:'draft'};
 const rows=[good,{...good,id:2,prediction_id:2},{...good,id:3,batch_id:'B2'},{...good,id:4,status:'rejected'},{...good,id:5,production_date:'2026-11-02'},{...good,id:6,prediction_id:null}];
 assert.deepEqual(relatedRecommendations(first,rows),[good]);
});

const { predictionSummary, predictedShortage, predictionTime } = await import('../lib/operational-prediction.ts');
test('summary counts batches, keeping a whole-day prediction separate',()=>{
 const daily={...first,id:6,batch_id:null};
 const result=predictionSummary([first,daily],['B1','B2','B2']);
 assert.equal(result.assessed,1);
 assert.equal(result.total,2);
 assert.equal(result.missing,1);
 assert.equal(result.daily,1);
 assert.equal(result.counts.berisiko,1);
 assert.equal(predictionSummary([daily],null).assessed,0);
 assert.equal(predictionSummary([daily],null).total,null);
});
test('unknown backend statuses do not disappear from summary and mismatched batch catalog is explicit',()=>{
 const result=predictionSummary([{...first,fulfill_status:'new-status'}],['B2']);
 assert.equal(result.counts.data_tidak_cukup,1);
 assert.equal(result.mismatch,true);
 assert.equal(result.missing,1);
});
test('missing predicted shortage never means zero or not yet calculated',()=>{
 assert.equal(predictedShortage(null),'Tidak disertakan pada hasil ini');
 assert.equal(predictedShortage(undefined),'Tidak disertakan pada hasil ini');
 assert.equal(predictedShortage(0),'0 L');
 assert.equal(predictedShortage(8000),'8.000 L');
 assert.equal(predictedShortage(-1),'Nilai dari server perlu diperiksa');
});
test('timestamps use WIB and invalid time is not presented as a valid calculation',()=>{
 assert.match(predictionTime('2026-11-01T00:00:00Z'),/07[.:]00 WIB/);
 assert.equal(predictionTime('bad-date'),'Waktu perhitungan tidak disertakan');
 assert.equal(predictionTime(null),'Waktu perhitungan tidak disertakan');
});

const { batchTargetVolume } = await import('../lib/operational-prediction.ts');
test('target volume sums PO lines once and preserves missing target information',()=>{
 const line={production_date:'2026-11-01',batch_id:'B1',line_no:1,production_order_id:'PO1',finished_sku_id:'SKU1',target_volume_l:8000};
 const second={...line,line_no:2,production_order_id:'PO2',target_volume_l:2000};
 assert.equal(batchTargetVolume([line,line,second],'B1'),10000);
 assert.equal(batchTargetVolume([line,second],'B2'),null);
 assert.equal(batchTargetVolume([line,{...second,target_volume_l:null}],'B1'),null);
 assert.equal(batchTargetVolume([line,second],null),10000);
});

const { predictionInputs } = await import('../lib/operational-prediction.ts');
test('BE prediction inputs preserve liter units, zero planned supply and small demand without fabricating availability',()=>{
 const fields=predictionInputs({batch_demand_l:0.01,opening_stock_l:210000,planned_supply_l:0});
 assert.deepEqual(fields.map(field=>field.value),['0,01 L','210.000 L','0 L']);
 assert.ok(predictionInputs(null).every(field=>field.value==='Tidak disertakan pada hasil ini'));
 assert.equal(predictionInputs({opening_stock_l:'210000'})[1].value,'Tidak disertakan pada hasil ini');
});
