import test from 'node:test';
import assert from 'node:assert/strict';
import {recommendationOrigin,recommendationLink} from '../lib/recommendation-origin.ts';
test('AI provenance is explicit; fallback and missing sources are never presented as AI',()=>{
 assert.equal(recommendationOrigin({reason_facts:{sumber_pilihan:'jev'}}).label,'Dipilih AI');
 assert.equal(recommendationOrigin({reason_facts:{sumber_pilihan:'template'}}).label,'Dipilih aturan BE');
 for(const value of [null,{sumber_pilihan:'unknown'},{}])assert.equal(recommendationOrigin({reason_facts:value}).label,'Sumber pilihan belum disertakan');
});
test('recommendation URL retains exact date, scoped batch, prediction and is refreshable',()=>{
 const u=new URL(recommendationLink('2026-11-01','B&1/2',42),'https://example.test');assert.equal(u.searchParams.get('batch'),'B&1/2');assert.equal(u.searchParams.get('prediction'),'42');assert.equal(u.searchParams.get('date'),'2026-11-01');
 assert.equal(new URL(recommendationLink('2026-11-01',null,42),'https://example.test').searchParams.has('batch'),false);
});
