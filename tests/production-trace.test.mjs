import test from 'node:test';
import assert from 'node:assert/strict';
import { traceTimestamp, traceMillis, traceDuration, distinctTraceEvents, orderTraceEvents, traceAssetIds } from '../lib/production-trace.ts';
const row={trace_source:'processing',transaction_id:'PR1',machine_id:'ST-01',activity:'Sterilizing',start_time:'2026-10-31T17:00:00Z',end_time:'2026-10-31T18:30:05Z',volume_l:5000,output_good_packs:null,output_volume_l:null,source_asset_id:'SFP-01; SFP-02',destination_asset_id:'AT-01',downtime_type:null};
test('trace timestamps retain seconds, WIB date rollover, and reject ambiguous times',()=>{
 assert.match(traceTimestamp(row.start_time),/1 Nov 2026.*00[.:]00[.:]00.*WIB/);
 assert.equal(traceMillis('2026-10-31T17:00:00'),null);assert.equal(traceTimestamp('bad'),'Waktu belum tercatat');
 assert.equal(traceDuration(row),'1 jam 30 menit 5 detik');
 assert.equal(traceDuration({...row,end_time:row.start_time}),'0 detik (kejadian sesaat)');
 assert.equal(traceDuration({...row,end_time:null}),'Durasi belum dapat dihitung');
 assert.equal(traceDuration({...row,end_time:'2026-10-31T16:59:59Z'}),'Waktu selesai mendahului mulai');
});
test('join duplicate transactions are collapsed only when complete payloads match',()=>{
 const differing={...row,volume_l:0};const rows=distinctTraceEvents([row,{...row},differing]);assert.equal(rows.length,2);assert.equal(rows[1].volume_l,0);
 assert.equal(distinctTraceEvents([row,{...row,trace_source:'filling'}]).length,2);
});
test('chronology and traceback put missing timestamps last without mutating input',()=>{
 const early={...row,transaction_id:'EARLY',start_time:'2026-10-31T10:00:00Z'},missing={...row,transaction_id:'MISSING',start_time:null};const input=[row,missing,early];
 assert.deepEqual(orderTraceEvents(input).map(x=>x.transaction_id),['EARLY','PR1','MISSING']);assert.deepEqual(orderTraceEvents(input,true).map(x=>x.transaction_id),['PR1','EARLY','MISSING']);assert.equal(input[0],row);
 assert.deepEqual(traceAssetIds(row),['ST-01','SFP-01','SFP-02','AT-01']);
});
