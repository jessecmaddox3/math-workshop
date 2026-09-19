"""Deterministic attachment race: real browser adapter, panel, IDB and flushOne.
Only the cloud connection is synthetic. An initial unbound flush is held until
attachment queues its transaction, so its passive refresh races local adoption.
No provider traffic or real learner data.
"""
from pathlib import Path
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from threading import Thread
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
import json,importlib.util
root = Path(__file__).resolve().parents[1] / 'public'
spec=importlib.util.spec_from_file_location('save_checks',Path(__file__).with_name('test-saves-browser.py'));helpers=importlib.util.module_from_spec(spec);spec.loader.exec_module(helpers)
storewrap = """export * from './real-progress-store.js';
import {openProgressStore as realOpen} from './real-progress-store.js';
export async function openProgressStore(options){
 const store=await realOpen(options);window.reviewStore=store;
 const load=store.load,attach=store.attach,remove=store.removeProfile;
 store.removeProfile=function(...args){const pending=remove(...args);window.reviewLog.push('remove queued');window.releaseInitialFlush?.();return pending;};
 store.load=async function(id){
  const flushing=new Error().stack.includes('flushOne');const row=await load(id);
  if(window.reviewArm&&flushing&&(!row.binding||window.reviewRemoval)){window.reviewArm=false;window.reviewLog.push('initial flush read unbound');await new Promise(r=>window.releaseInitialFlush=r);}
  return row;
 };
 store.attach=function(...args){
  const result=attach(...args);window.reviewLog.push('attach transaction queued');window.releaseInitialFlush?.();
  return result.then(r=>{window.reviewLog.push('attach committed');return r});
 };
 return store;
}
"""
transport = """export {flushOne} from './real-cloud-transport.js';
export function createCloudConnection(config){
 let active=true,ownerId=null;
 const owner='11111111-1111-4111-8111-111111111111',profile='22222222-2222-4222-8222-222222222222';
 return {get active(){return active},get ownerId(){return ownerId},backend:config.backend,
 disconnect(){active=false;ownerId=null;window.reviewLog.push('DISCONNECT')},
 owns(binding){return active&&binding?.ownerId===owner},async sendCode(){},
 async verifyCode(){ownerId=owner;window.reviewArm=true},async listProfiles(){return []},
 async createProfile(label){return {id:profile,label}},
 async write(binding,inflight){window.reviewLog.push('WRITE');return {status:'saved',remote:{snapshot:inflight.snapshot,revision:inflight.expectedRemoteRevision+1,writeId:inflight.writeId}}}
 }
}
"""
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args): pass
 def do_GET(self):
  path=urlparse(self.path).path
  if path=='/shared/progress-store.js':body=storewrap.encode();typ='text/javascript'
  elif path=='/shared/cloud-transport.js':body=transport.encode();typ='text/javascript'
  elif path=='/shared/real-progress-store.js':body=(root/'shared/progress-store.js').read_bytes();typ='text/javascript'
  elif path=='/shared/real-cloud-transport.js':body=(root/'shared/cloud-transport.js').read_bytes();typ='text/javascript'
  elif path=='/cloud-config.local.json':body=json.dumps({'enabled':True,'url':'https://synthetic.invalid','publishableKey':'sb_publishable_'+'a'*24,'label':'Synthetic'}).encode();typ='application/json'
  else:
   p=root/path.lstrip('/');p=p/'index.html' if p.is_dir() else p
   if not p.is_file():self.send_error(404);return
   body=p.read_bytes();typ='text/javascript' if p.suffix=='.js' else 'application/json' if p.suffix=='.json' else 'text/css' if p.suffix=='.css' else 'text/html'
   if path=='/target/':body=body.replace(b'<script src="./app.js" defer></script>',b'<script src="./target.js" type="module"></script>')
  self.send_response(200);self.send_header('Content-Type',typ);self.end_headers();self.wfile.write(body)
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
Thread(target=server.serve_forever,daemon=True).start()
origin=f'http://127.0.0.1:{server.server_port}'
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch();page=browser.new_page();errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.route('**/*',lambda r:r.continue_() if r.request.url.startswith(origin+'/') else r.abort())
  page.add_init_script("window.reviewLog=[];")
  page.goto(origin+'/target/')
  page.get_by_role('button',name='Learners and backups',exact=True).wait_for()
  page.locator('#auto-advance').uncheck();page.get_by_text('Saved on this device.',exact=False).wait_for()
  if page.locator('#next-card').is_visible():page.locator('#next-card').click()
  helpers.solve_ui(page)
  page.get_by_text('Saved on this device.',exact=False).wait_for()
  page.get_by_role('button',name='Learners and backups',exact=True).click()
  page.get_by_role('button',name='Explore cloud saves',exact=True).click()
  page.locator('#cloud-email').fill('adult@example.invalid');page.get_by_role('button',name='Email me a code',exact=True).click()
  page.locator('#cloud-code').fill('123456');page.get_by_role('button',name='Sign in',exact=True).click()
  page.wait_for_function('!!window.releaseInitialFlush')
  page.get_by_role('button',name='Save Player 1 as a new cloud learner',exact=True).click()
  page.wait_for_function("""async()=>{const r=await window.reviewStore.load((await window.reviewStore.listProfiles())[0].id);return r.remoteRevision===1&&!r.needsUpload}""")
  result=page.evaluate("""async()=>{const r=await window.reviewStore.load((await window.reviewStore.listProfiles())[0].id);return {log:window.reviewLog,inert:document.querySelector('#gameplay').inert,localRevision:r.localRevision,remoteRevision:r.remoteRevision,needsUpload:r.needsUpload,inflight:!!r.inflight,conflict:!!r.conflict,message:document.querySelector('dialog [role=status]').textContent}}""")
  assert result['localRevision']==4 and result['remoteRevision']==1,result
  assert not result['inert'] and not result['needsUpload'] and not result['inflight'] and not result['conflict'],result
  assert 'DISCONNECT' not in result['log'] and 'WRITE' in result['log'],result
  assert not errors,errors
  page.get_by_role('button',name='Close',exact=True).click()
  if page.locator('#next-card').is_visible():page.locator('#next-card').click()
  helpers.solve_ui(page)
  page.wait_for_function("""async()=>{const r=await window.reviewStore.load((await window.reviewStore.listProfiles())[0].id);return r.snapshot.solved===2&&!r.snapshot.autoAdvance&&r.remoteRevision===2&&!r.needsUpload}""")
  assert not page.locator('#gameplay').evaluate('(e)=>e.inert')
  print('PASS attachment survives an initial passive flush, keeps play usable and uploads the next answer.')
  page.get_by_role('button',name='Learners and backups',exact=True).click()
  previous=page.evaluate("async()=>(await window.reviewStore.listProfiles())[0].id")
  page.evaluate("window.reviewRemoval=true;window.reviewArm=true;window.releaseInitialFlush=null")
  page.get_by_role('button',name='Retry cloud saving',exact=True).click()
  page.wait_for_function('!!window.releaseInitialFlush')
  page.once('dialog',lambda d:d.accept())
  page.get_by_role('button',name='Remove this account’s downloaded learners',exact=True).click()
  page.wait_for_function("""async old=>{const profiles=await window.reviewStore.listProfiles();return profiles.length===1&&profiles[0].id!==old&&!document.querySelector('#gameplay').inert}""",arg=previous)
  page.get_by_text('Target Number learner: Player 1. Saved on this device.',exact=False).wait_for()
  if page.locator('#next-card').is_visible():page.locator('#next-card').click()
  helpers.solve_ui(page)
  page.wait_for_function("""async()=>{const r=await window.reviewStore.load((await window.reviewStore.listProfiles())[0].id);return r.snapshot.solved===1&&!r.binding}""")
  assert not errors,errors
  print('PASS account removal during a passive flush selects a fresh learner and saves the next answer locally.')
  browser.close()
finally:
 server.shutdown();server.server_close()
