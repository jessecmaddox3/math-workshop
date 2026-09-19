import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
// Exercise the production asynchronous refresh callback with controlled I/O.
// The fixture exposes closure state but does not reproduce its implementation.
function adapter(){
 const events=[];const context=vm.createContext({structuredClone,Event,document:{dispatchEvent:e=>events.push(e.type),querySelector:()=>({inert:false})}});
 const source=readFileSync(new URL('../public/shared/progress.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
 vm.runInContext(source+`\nglobalThis.fixture={set(values){({profile,record,live,selectionEpoch,store,cloud,message}=values)},refresh:refreshActive,get:()=>({profile,record,live,retired})};`,context);
 // Full snapshots are normalized by the real pure module in production; this
 // lifecycle fixture preserves its shape while concentrating on result ownership.
 context.normalizeSnapshot=(_game,value)=>structuredClone(value);
 return {api:context.fixture,events};
}
const current=(id,revision,solved)=>({profile:{id,label:id},record:{localRevision:revision,snapshot:{solved}},live:{solved},selectionEpoch:1,cloud:{disconnect(){throw Error('Unexpected disconnect')}},message:{textContent:''}});
test('a late old-learner cloud callback cannot change a newly selected learner',async()=>{
 const {api,events}=adapter();let release;
 api.set({...current('Comet',1,7),store:{load:()=>new Promise(resolve=>release=resolve)}});
 const pending=api.refresh({source:'cloud-action'});
 api.set({...current('Orion',1,99),selectionEpoch:2,store:{}});
 release({localRevision:2,snapshot:{solved:7}});await pending;
 assert.equal(api.get().profile.id,'Orion');assert.equal(api.get().live.solved,99);assert.equal(api.get().record.localRevision,1);assert.deepEqual(events,[]);
});
test('own cloud attachment adopts its revision without disconnecting or changing the question',async()=>{
 const {api,events}=adapter();api.set({...current('Comet',1,3),store:{load:async()=>({localRevision:2,snapshot:{solved:3},binding:{ownerId:'synthetic'}})}});
 await api.refresh({source:'cloud-action'});assert.equal(api.get().record.localRevision,2);assert.equal(api.get().retired,false);assert.deepEqual(events,[]);
});
