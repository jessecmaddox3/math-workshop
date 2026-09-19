import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanProgress,normalizeSnapshot,exportSnapshot,importSnapshot } from '../public/shared/snapshot.js';
test('malformed game shapes become bounded playable progress',()=>{
  for(const raw of [null,[],4,'text',{}, {tier:999,solved:-9,items:null,done:4},{tier:NaN,solved:Infinity,items:{__proto__:{x:1}}}]){
    for(const game of ['target','areamaze']){const s=cleanProgress(game,raw);assert.equal(s.tier,1);assert.equal(s.solved,0);assert.deepEqual(s.items,{});assert.deepEqual(s.done,[]);}
  }
});
test('only known puzzles and consistent counters survive saved input',()=>{
  const s=cleanProgress('target',{tier:3,solved:4,items:{t24:{attempts:2,correct:9,streak:7},bad:{attempts:2}}});
  assert.deepEqual(s.items,{t24:{attempts:2,correct:2,streak:2,mastered:true}});
  assert.deepEqual(cleanProgress('areamaze',{done:['a1','a1','c6','bad']}).done,['a1','c6']);
  assert.equal(normalizeSnapshot('target',s).tier,3);assert.deepEqual(normalizeSnapshot('target',s),s);
});
test('backup has game and curriculum binding but no cloud identity or auth',()=>{
  const b=exportSnapshot('target','Comet',{...cleanProgress('target',{}),binding:{token:'invented-do-not-export'}});
  assert.equal(importSnapshot('target',b).label,'Comet');assert.ok(!JSON.stringify(b).includes('token'));
  for(const bad of [{...b,game:'areamaze'},{...b,curriculum:'other'},{...b,version:2},{...b,snapshot:{formatVersion:99}}])assert.throws(()=>importSnapshot('target',bad));
});
