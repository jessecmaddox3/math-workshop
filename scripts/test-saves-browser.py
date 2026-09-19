#!/usr/bin/env python3
"""Real built files, actual browser storage, synthetic backups, no outside network."""
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from functools import partial
from threading import Thread
from playwright.sync_api import sync_playwright
import json,re
ROOT=Path(__file__).resolve().parents[1]
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
 def translate_path(self,path):
  if path.startswith('/nested/workshop/'):path=path.removeprefix('/nested/workshop')
  return super().translate_path(path)
def backup(game='target',solved=4,label='Comet'):
 return {'app':'math-workshop','version':1,'game':game,'curriculum':'target-rational-v1' if game=='target' else 'area-original-17-v1','label':label,'snapshot':{'formatVersion':1,'tier':1,'solved':solved,'extras':0,'done':[],'items':{},'autoAdvance':False}}
def upload(page,value):page.get_by_label('Import a backup for this game',exact=True).set_input_files({'name':'synthetic.json','mimeType':'application/json','buffer':json.dumps(value).encode()})
def settings(page):
 if not page.locator('dialog').evaluate('(e)=>e.open'):page.get_by_role('button',name='Learners and backups',exact=True).click()
def solve_ui(page):
 expression=page.evaluate("""async()=>{let {solve}=await import('./solver.js');let numbers=document.querySelector('#start-nums').textContent.split('·').map(Number);return solve(numbers,Number(document.querySelector('#target').textContent))[0]}""")
 tokens=re.findall(r'\d+|[()+×−÷]',expression);at=0;used=set()
 def consume():
  nonlocal at
  t=tokens[at];at+=1
  if t!='(':
   for i in range(page.locator('.num').count()):
    b=page.locator('.num').nth(i);id=b.get_attribute('data-id')
    if id not in used and b.inner_text()==t:used.add(id);return id
   raise AssertionError('No unused leaf '+t)
  a=consume();op=tokens[at];at+=1;b=consume();assert tokens[at]==')';at+=1
  page.locator(f'.num[data-id="{a}"]').click();page.locator(f'.num[data-id="{b}"]').click();page.locator(f'.op[data-op="{op}"]').click()
  return max(page.locator('.num').evaluate_all('(es)=>es.map(e=>e.dataset.id)'),key=int)
 consume()
def main():
 server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT/'public')));Thread(target=server.serve_forever,daemon=True).start();origin=f'http://127.0.0.1:{server.server_port}';failures=[]
 with sync_playwright() as pw:
  browser=pw.chromium.launch()
  def check(name,action,init=None,url=None):
   ctx=browser.new_context(viewport={'width':390,'height':844});outside=[];errors=[]
   ctx.route('**/*',lambda r:r.continue_() if (r.request.url.startswith(origin+'/') or r.request.url.startswith((ROOT/'artifacts').as_uri()+'/')) else (outside.append(r.request.url),r.abort()))
   if init:ctx.add_init_script(init)
   p=ctx.new_page();p.on('pageerror',lambda e:errors.append(str(e)));p.goto(url or origin+'/target/');p.get_by_role('button',name='Learners and backups',exact=True).wait_for()
   try:action(p,ctx);assert not outside,outside;assert not errors,errors;print('PASS',name,flush=True)
   except Exception as e:failures.append(name+': '+str(e));print('FAIL',name,str(e),flush=True)
   ctx.close()
  def local(p,c):
   p.locator('#auto-advance').uncheck();solve_ui(p);p.wait_for_function("document.querySelector('#solved').textContent==='1'");p.get_by_text('Saved on this device.',exact=False).wait_for();p.reload();assert p.locator('#solved').inner_text()=='1';assert not p.locator('#auto-advance').is_checked()
   settings(p)
   with p.expect_download() as download:p.get_by_role('button',name='Export this learner’s progress',exact=True).click()
   data=json.loads(Path(download.value.path()).read_text());assert data['snapshot']['solved']==1;assert 'binding' not in data['snapshot']
   upload(p,backup());p.get_by_text('learner: Comet.',exact=False).wait_for();assert p.locator('#solved').inner_text()=='4'
   settings(p);p.get_by_role('button',name='Play as Player 1',exact=True).click();p.get_by_text('learner: Player 1.',exact=False).wait_for();assert p.locator('#solved').inner_text()=='1'
   p.goto(origin+'/areamaze/');p.get_by_role('button',name='Learners and backups',exact=True).wait_for();assert p.locator('#solved').inner_text()=='0';settings(p);assert p.get_by_role('button',name='Play as Comet',exact=True).count()==0
   upload(p,backup());p.get_by_text('Import failed:',exact=False).wait_for();assert p.locator('#solved').inner_text()=='0'
  check('real solve/save/reload, export/import, learner switch and game isolation',local)
  def temporary(p,c):
   p.get_by_text('Temporary session:',exact=False).wait_for();settings(p);upload(p,backup());p.wait_for_function("document.querySelector('#solved').textContent==='4'")
   settings(p);p.get_by_label('New learner nickname',exact=True).fill('Orion');p.get_by_role('button',name='Add learner',exact=True).click();assert p.locator('#solved').inner_text()=='0'
   settings(p);p.get_by_role('button',name='Play as Comet',exact=True).click();assert p.locator('#solved').inner_text()=='4'
  check('temporary mode keeps imported and switched learners without navigation',temporary,"Object.defineProperty(window,'indexedDB',{get(){throw Error('Synthetic unavailable')}})")
  def no_session(p,c):
   settings(p);p.get_by_label('New learner nickname',exact=True).fill('Comet');p.get_by_role('button',name='Add learner',exact=True).click();p.get_by_text('learner: Comet.',exact=False).wait_for()
  check('learner switching works with sessionStorage unavailable',no_session,"Object.defineProperty(window,'sessionStorage',{get(){throw Error('Synthetic unavailable')}})")
  def future(p,c):
   p.evaluate("""()=>new Promise((resolve,reject)=>{const req=indexedDB.open('math-workshop-target-v1');req.onsuccess=()=>{const db=req.result;const tx=db.transaction('records','readwrite');const store=tx.objectStore('records');store.getAll().onsuccess=e=>{const record=e.target.result[0];record.snapshot={formatVersion:99,unrecognized:{solved:91}};store.put(record);};tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>reject(tx.error)}})""")
   p.reload();p.get_by_role('button',name='Learners and backups',exact=True).wait_for();settings(p)
   with p.expect_download() as result:p.get_by_role('button',name='Export unreadable saved data',exact=True).click()
   raw=json.loads(Path(result.value.path()).read_text());assert raw['snapshot']=={'formatVersion':99,'unrecognized':{'solved':91}};assert 'binding' not in raw
   p.get_by_label('New learner nickname',exact=True).fill('Orion');p.get_by_role('button',name='Add learner',exact=True).click();p.get_by_text('learner: Orion.',exact=False).wait_for();assert p.locator('#gameplay').is_visible()
  check('future-format progress remains exportable and other learners usable',future)
  def offline(p,c):
   settings(p);upload(p,backup());p.get_by_text('learner: Comet.',exact=False).wait_for();p.reload();p.get_by_role('button',name='Learners and backups',exact=True).wait_for();assert p.locator('#solved').inner_text()=='4';settings(p);assert p.get_by_role('button',name='Explore cloud saves',exact=True).count()==0
   p.get_by_role('button',name='Close',exact=True).click()
   for width in [320,390,768,1440]:
    p.set_viewport_size({'width':width,'height':844});assert p.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
    out=ROOT/'artifacts/browser-checks';out.mkdir(exist_ok=True);p.screenshot(path=str(out/f'target-{width}.png'),full_page=True)
  check('exact offline file saves, reloads and never offers cloud networking',offline,url=(ROOT/'artifacts/Target-Number.html').as_uri())
  check('nested repository hosting loads both games',lambda p,c:(p.goto(origin+'/nested/workshop/areamaze/'),p.get_by_role('button',name='Learners and backups',exact=True).wait_for()),url=origin+'/nested/workshop/target/')
  browser.close()
 server.shutdown();server.server_close()
 if failures:raise SystemExit('\n'.join(failures))
if __name__=='__main__':main()
