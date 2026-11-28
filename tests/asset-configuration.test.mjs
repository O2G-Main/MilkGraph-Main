import test from 'node:test';
import assert from 'node:assert/strict';
import { configurationChanges, configurationEditable, createConfigurationSaver } from '../lib/api/asset-configuration.ts';
const config={asset_id:'AT-01',asset_name:'Tangki',asset_type:'Aseptic Tank',version:1,updated_at:null,fields:[{key:'capacity_l',label:'Kapasitas',unit:'L',min:0.01,max:1e9,step:0.01,nullable:true},{key:'cip_duration_minutes',label:'CIP',unit:'menit',min:0,max:1e9,step:1,nullable:true}],values:{capacity_l:1000,cip_duration_minutes:30}};
test('per-asset schema validates applicable fields, nulls, real zero and steps',()=>{
 assert.deepEqual(configurationChanges(config,{capacity_l:'',cip_duration_minutes:'0',speed_packph:'4000'}),{capacity_l:null,cip_duration_minutes:0});
 for(const value of ['-1','0','Infinity','1.001'])assert.throws(()=>configurationChanges(config,{capacity_l:value}));
 assert.deepEqual(configurationChanges(config,{capacity_l:'1000'}),{});
 assert.equal(configurationEditable({role:'operator',permissions:['constraint.edit']},'superadmin'),false);
});
test('configuration save uses exact ID/version and verifies backend result',async()=>{
 let writes=0;
 const saver=createConfigurationSaver({get:async path=>path==='/session'?{role:'planner',permissions:['constraint.edit']}:{...config,version:2,values:{...config.values,capacity_l:2000}},send:async(method,path,body)=>{writes++;assert.equal(method,'PATCH');assert.equal(path,'/production/assets/AT-01/configuration');assert.deepEqual(body,{version:1,changes:{capacity_l:2000}});}});
 assert.equal((await saver.save(config,{capacity_l:'2000'},'planner')).version,2);assert.equal(writes,1);assert.equal(saver.pendingVerification,false);
});
test('ambiguous mutation retries only verification, never duplicates the write',async()=>{
 let writes=0,readable=false;
 const saver=createConfigurationSaver({get:async path=>{if(path==='/session')return{role:'planner',permissions:['constraint.edit']};if(!readable)throw Error('offline');return{...config,version:2,values:{...config.values,capacity_l:2000}};},send:async()=>{writes++;throw Error('connection lost');}});
 await assert.rejects(saver.save(config,{capacity_l:'2000'},'planner'));assert.equal(saver.pendingVerification,true);
 readable=true;await saver.save(config,{capacity_l:'2000'},'planner');assert.equal(writes,1);assert.equal(saver.pendingVerification,false);
});
test('stale revision and revoked permission never produce a success',async()=>{
 let writes=0;
 const saver=createConfigurationSaver({get:async()=>({role:'planner',permissions:['constraint.edit']}),send:async()=>{writes++;throw Object.assign(Error('Konfigurasi berubah'),{status:409});}});
 await assert.rejects(saver.save(config,{capacity_l:'2000'},'planner'),/berubah/);assert.equal(saver.pendingVerification,false);
 const denied=createConfigurationSaver({get:async()=>({role:'operator',permissions:[]}),send:async()=>{writes++;}});
 await assert.rejects(denied.save(config,{capacity_l:'2000'},'planner'),/izin/);assert.equal(writes,1);
});
