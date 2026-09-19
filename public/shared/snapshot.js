import { PUZZLES } from '../areamaze/puzzles.js';
export const CURRICULA = Object.freeze({target:'target-rational-v1',areamaze:'area-original-17-v1'});
const TARGETS=new Set([6,8,10,12,18,20,24,36,48,60].map(n=>`t${n}`));
const AREAS=new Set(PUZZLES.map(p=>p.id));
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const count=v=>Number.isSafeInteger(v)&&v>=0&&v<=1000000?v:0;
export function cleanProgress(game,value) {
  if(!CURRICULA[game])throw new TypeError('Unknown game.');
  const raw=object(value)?value:{};
  const items={};const allowed=game==='target'?TARGETS:AREAS;
  for(const [id,row] of Object.entries(object(raw.items)?raw.items:{})) {
    if(!allowed.has(id)||!object(row))continue;
    const attempts=count(row.attempts),correct=Math.min(count(row.correct),attempts),streak=Math.min(count(row.streak),correct);
    items[id]={attempts,correct,streak,mastered:game==='target'?streak>=2:row.mastered===true&&correct>0};
  }
  return {formatVersion:1,tier:[1,2,3].includes(raw.tier)?raw.tier:1,solved:count(raw.solved),extras:game==='target'?count(raw.extras):0,
    done:game==='areamaze'&&Array.isArray(raw.done)?[...new Set(raw.done.filter(id=>AREAS.has(id)))]:[],items,autoAdvance:raw.autoAdvance!==false};
}
export function normalizeSnapshot(game,value) {
  if(!object(value)||value.formatVersion!==1)throw new TypeError('This saved progress needs a different app version. Keep a recovery export.');
  return cleanProgress(game,value);
}
export function exportSnapshot(game,label,snapshot) {
  return {app:'math-workshop',game,curriculum:CURRICULA[game],version:1,label,snapshot:normalizeSnapshot(game,snapshot)};
}
export function importSnapshot(game,value) {
  if(!object(value)||value.app!=='math-workshop'||value.game!==game||value.curriculum!==CURRICULA[game]||value.version!==1)throw new TypeError('That backup belongs to another game or app version.');
  if(typeof value.label!=='string'||!value.label.trim()||value.label.trim().length>60)throw new TypeError('A backup needs a nickname of 1 to 60 characters.');
  return {label:value.label.trim(),snapshot:normalizeSnapshot(game,value.snapshot)};
}
