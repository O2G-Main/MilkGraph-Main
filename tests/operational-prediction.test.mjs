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
