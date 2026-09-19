import { openProgressStore } from './progress-store.js';
import { createMemoryStore } from './memory-store.js';
import { createCloudPanel } from './cloud-panel.js';
import { CURRICULA,cleanProgress,normalizeSnapshot,exportSnapshot,importSnapshot } from './snapshot.js';
let game,store,profile,record,live,cloud,durable=true,pending=0,retired=false,saveTail=Promise.resolve(),message,dialog,profileList,loading=false,selectionEpoch=0,importEpoch=0,recoveryMode=false,recoveryRaw=null,exportButton,modalMessage,lastMessage='';
const title={target:'Target Number',areamaze:'Area Mazes'};
const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
function download(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=el('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function retire(text){retired=true;cloud?.disconnect();document.querySelector('#gameplay').inert=true;document.dispatchEvent(new Event('progress-retired'));say(text);}
function remember(id){try{sessionStorage.setItem(`math-workshop-${game}-profile`,id);}catch{/* Explicit selection still works in this page. */}}
function remembered(){try{return sessionStorage.getItem(`math-workshop-${game}-profile`);}catch{return null;}}
function say(text){lastMessage=text;if(dialog?.open){message.textContent='';modalMessage.textContent=text;}else{message.textContent=text;if(modalMessage)modalMessage.textContent='';}}
function status(){if(recoveryMode){say('This learner’s saved version cannot be opened here. Export the unreadable data or choose another learner; the original save is unchanged.');return;}if(!retired)say(pending?'Saving on this device…':durable?`${title[game]} learner: ${profile.label}. Saved on this device.`:'Temporary session: browser storage is unavailable. Export progress before leaving.');}
function button(parent,text,action,{needsIdle=true}={}){const b=el('button',text);b.type='button';b.className='ghost';b.addEventListener('click',async()=>{if(b.disabled)return;if(needsIdle&&(pending||loading||retired)){say('Export unsaved progress or reload before changing learners.');return;}b.disabled=true;try{await action();}catch(error){say(error.message||'That action could not be completed.');}finally{b.disabled=false;}});parent.append(b);return b;}
async function showProfiles(){
  profileList.replaceChildren();
  for(const p of await store.listProfiles())button(profileList,`Play as ${p.label}`,()=>selectProfile(p));
}
async function selectProfile(next){
  if(pending||loading||retired)return;
  loading=true;importEpoch++;const epoch=++selectionEpoch;
  document.dispatchEvent(new Event('progress-retired'));document.querySelector('#gameplay').inert=true;
  try{
    const loaded=await store.load(next.id);
    if(epoch!==selectionEpoch)return;
    if(!loaded)throw new Error('That learner was removed in another tab. Choose another one.');
    let snapshot;
    try{snapshot=normalizeSnapshot(game,loaded.snapshot);recoveryMode=false;recoveryRaw=null;}
    catch{snapshot=cleanProgress(game,{});recoveryMode=true;recoveryRaw=structuredClone(loaded.snapshot);}
    profile=next;record=loaded;live=snapshot;remember(profile.id);
    exportButton.textContent=recoveryMode?'Export unreadable saved data':'Export this learner’s progress';
    document.querySelector('#gameplay').hidden=recoveryMode;
    document.dispatchEvent(new Event('progress-loaded'));document.querySelector('#gameplay').inert=false;
    await showProfiles();dialog.close();cloud?.queue();void cloud?.renderConnected().catch(error=>say(error.message));status();
  }catch(error){retire(`${error.message} Export this tab’s copy if needed, then reload.`);}
  finally{if(epoch===selectionEpoch)loading=false;}
}
async function refreshActive({source}={}){
  if(pending||loading||retired||recoveryMode||!profile)return;
  const expected=record.localRevision,id=profile.id,epoch=selectionEpoch,loaded=await store.load(id);
  if(pending||loading||retired||profile.id!==id||selectionEpoch!==epoch||record.localRevision!==expected)return;
  if(!loaded){retire('This learner was removed in another tab. Export this tab’s older copy if needed, then reload.');return;}
  if(loaded.localRevision!==record.localRevision&&source==='cloud-action'){
    const changed=JSON.stringify(loaded.snapshot)!==JSON.stringify(record.snapshot);
    record=loaded;live=normalizeSnapshot(game,loaded.snapshot);
    if(changed){document.dispatchEvent(new Event('progress-retired'));document.dispatchEvent(new Event('progress-loaded'));}
    status();return;
  }
  if(loaded.localRevision!==record.localRevision){retire('Saved progress changed in another tab or cloud action. Export this tab’s copy if needed, then reload to use the current save.');return;}
  record=loaded;
}
export async function initProgress(which){
  game=which;const normalize=value=>normalizeSnapshot(game,value);
  const controls=el('section');controls.className='progress-controls';controls.setAttribute('aria-label','Learners and saved progress');message=el('p','Opening saved progress…');message.setAttribute('role','status');controls.append(message);document.querySelector('.wrap').append(controls);
  try{store=await openProgressStore({dbName:`math-workshop-${game}-v1`,gameId:game,curriculumId:CURRICULA[game],normalize});}
  catch{durable=false;store=createMemoryStore(normalize);}
  let profiles;
  try{profiles=await store.listProfiles();}
  catch{throw new Error('Saved learner records could not be opened. Keep this browser’s data for recovery.');}
  if(!profiles.length)profiles=[await store.createProfile('Player 1',cleanProgress(game,{}))];
  profile=profiles.find(p=>p.id===remembered())||profiles[0];record=await store.load(profile.id);
  if(!record)throw new Error('The selected learner was removed. Reload to choose another learner.');
  try{live=normalize(record.snapshot);}catch{recoveryMode=true;recoveryRaw=structuredClone(record.snapshot);live=cleanProgress(game,{});}
  document.querySelector('#gameplay').hidden=recoveryMode;remember(profile.id);
  dialog=el('dialog');dialog.className='settings';dialog.setAttribute('aria-labelledby','settings-title');const heading=el('h2',`${title[game]}: learners and backups`);heading.id='settings-title';modalMessage=el('p');modalMessage.setAttribute('role','status');dialog.append(heading,modalMessage);dialog.addEventListener('close',()=>say(lastMessage));
  dialog.append(el('p','Each game has its own learners and progress. Nicknames are labels, not accounts. Anyone using this browser can see local learners and exports.'));
  button(controls,'Learners and backups',()=>{dialog.showModal();say(lastMessage);},{needsIdle:false});button(dialog,'Close',()=>dialog.close(),{needsIdle:false});
  profileList=el('div');profileList.className='learner-list';dialog.append(profileList);await showProfiles();
  const form=el('form');const label=el('label','New learner nickname');label.htmlFor='new-learner';const input=el('input');input.id='new-learner';input.required=true;input.maxLength=60;const add=el('button','Add learner');add.type='submit';form.append(label,input,add);dialog.append(form);
  form.addEventListener('submit',async e=>{e.preventDefault();if(pending||loading||retired||add.disabled)return;add.disabled=true;const epoch=selectionEpoch;try{const next=await store.createProfile(input.value,cleanProgress(game,{}));if(epoch===selectionEpoch)await selectProfile(next);else await showProfiles();}catch(error){say(error.message);}finally{add.disabled=false;}});
  const backups=el('section');backups.append(el('h3','Backups for this game'),el('p','Export saves the current learner’s progress and nickname in readable JSON. Keep it private. Import creates a new, separate learner and does not replace an existing one or connect a cloud account.'));
  exportButton=button(backups,recoveryMode?'Export unreadable saved data':'Export this learner’s progress',()=>download(recoveryMode?{app:'math-workshop-raw-recovery',game,label:profile.label,snapshot:recoveryRaw}:exportSnapshot(game,profile.label,live),`math-workshop-${game}-${recoveryMode?'raw-recovery':'backup'}.json`),{needsIdle:false});
  const importLabel=el('label','Import a backup for this game');const upload=el('input');upload.type='file';upload.accept='.json,application/json';importLabel.append(upload);backups.append(importLabel);
  upload.addEventListener('change',async()=>{const file=upload.files[0];const epoch=++importEpoch;upload.value='';if(!file)return;if(pending||loading||retired){say('Export unsaved progress or reload before importing.');return;}
    try{if(file.size>1048576)throw new Error('Choose a backup smaller than 1 MB.');const value=importSnapshot(game,JSON.parse(await file.text()));if(epoch!==importEpoch)return;if(pending||loading||retired)throw new Error('Progress changed while reading the file. Try again.');const p=await store.createProfile(value.label,value.snapshot);if(epoch===importEpoch)await selectProfile(p);else await showProfiles();}catch(error){say(`Import failed: ${error.message}`);}});
  button(backups,'Export recovery copies',async()=>{const copies=await store.listRecovery(profile.id);download({app:'math-workshop-recovery',game,curriculum:CURRICULA[game],version:1,copies:copies.map(c=>({reason:c.reason,createdAt:c.createdAt,backup:exportSnapshot(game,profile.label,c.snapshot)}))},`math-workshop-${game}-recovery.json`);},{needsIdle:false});
  button(backups,'Remove this learner from this game',async()=>{if(!confirm('Remove this learner and recovery copies from this game on this device? Other games and cloud copies remain. Export a backup first if needed.'))return;await store.removeProfile(profile.id);cloud.disconnect();const remaining=await store.listProfiles();await selectProfile(remaining[0]||await store.createProfile('Player 1',cleanProgress(game,{})));cloud.renderConnected();});dialog.append(backups);
  const cloudRoot=el('section');cloudRoot.append(el('h3','Optional cloud saves for this game'));dialog.append(cloudRoot);
  cloud=createCloudPanel(cloudRoot,{store,durable,normalize,gameId:game,curriculumId:CURRICULA[game],
    configURL:new URL('../cloud-config.local.json',document.baseURI),helpURL:'https://github.com/jessecmaddox3/math-workshop/blob/main/docs/cloud-setup.md',
    getProfile:()=>profile,isBusy:()=>pending>0||loading||retired||recoveryMode,onChange:refreshActive,
    onRestore:selectProfile,onProfilesCleared:async()=>{const remaining=await store.listProfiles();await selectProfile(remaining.find(p=>p.id===profile.id)||remaining[0]||await store.createProfile('Player 1',cleanProgress(game,{})));},onMessage:say,describe:s=>`${s.solved} solved; level ${s.tier}`});
  document.body.append(dialog);
  button(controls,'Reload saved progress',()=>{if((pending||retired)&&!confirm('Reload the saved copy? Export this tab’s unsaved progress first if you need it.'))return;location.reload();},{needsIdle:false});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void refreshActive().catch(()=>retire('Saved progress could not be checked. Export a copy before reloading.'));});
  window.addEventListener('beforeunload',e=>{if(pending||retired){e.preventDefault();e.returnValue='';}});
  window.addEventListener('pagehide',()=>cloud.disconnect());status();
}
export const readName=()=>profile?.label||'';
export const readLocal=()=>structuredClone(live);
export function writeLocal(which,value){
  if(which!==game)throw new TypeError('Wrong game save.');
  if(retired||recoveryMode)return;
  live=cleanProgress(game,{...value,autoAdvance:live.autoAdvance});const snapshot=structuredClone(live),id=profile.id;
  pending++;status();
  saveTail=saveTail.then(async()=>{
    if(retired||profile.id!==id)return;
    try{const result=await store.save(id,snapshot,record.localRevision);
      if(result.status!=='saved'){retire('Another tab saved first. Your attempted save is in recovery. Export this tab’s latest progress if needed, then reload.');return;}
      record=result.record;cloud.queue();
    }catch{retire('This change could not be saved. Export this learner’s progress before reloading.');}
  }).finally(()=>{pending--;status();});
}
export const sync=()=>{}; // A cloud upload is queued only after its local transaction commits.
export const getAutoAdvance=()=>live.autoAdvance;
export const setAutoAdvance=value=>{live.autoAdvance=!!value;writeLocal(game,live);};
