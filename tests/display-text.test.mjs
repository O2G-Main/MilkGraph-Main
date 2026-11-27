import test from 'node:test';
import assert from 'node:assert/strict';
import {displayText} from '../lib/display-text.ts';
test('modal labels render business terms rather than raw enum codes',()=>{
 assert.equal(displayText('LARGE_A'),'Ukuran besar A');assert.equal(displayText('LARGE_B'),'Ukuran besar B');assert.equal(displayText('ESL_320'),'ESL 320 ml');
 assert.equal(displayText('EXP, LOCAL'),'Ekspor, Lokal');assert.equal(displayText('planned_maintenance'),'Perawatan terencana');assert.equal(displayText('AT_RISK'),'Berisiko');
 assert.equal(displayText('source__status'),'Source status');assert.equal(displayText('__'),'Belum tersedia');assert.equal(displayText('N/A'),'Belum tersedia');assert.equal(displayText('X'),'Belum tersedia');
});
test('display conversion preserves legitimate identifiers, links, numbers and ordinary text',()=>{
 for(const input of ['ESL-CH-1000-EXP','AT-01','FM-0008090','0','31 Okt 2026, 17.29.00 WIB','https://example.test/raw_name?q=x_y','demo_user@example.test','Keterangan pengguna.'])assert.equal(displayText(input),input);
});
