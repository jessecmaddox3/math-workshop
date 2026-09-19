#!/usr/bin/env python3
"""Exercise real game controllers with synthetic cards and a no-network save contract."""
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from functools import partial
from threading import Thread
from playwright.sync_api import sync_playwright
import json
ROOT=Path(__file__).resolve().parents[1]
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass

def main():
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT/'public')));Thread(target=server.serve_forever,daemon=True).start()
    origin=f'http://127.0.0.1:{server.server_port}';failures=[]
    with sync_playwright() as pw:
        browser=pw.chromium.launch()
        def check(name,fn,game='target',seed=None):
            context=browser.new_context(viewport={'width':320,'height':900});outside=[];errors=[]
            context.route('**/*',lambda r:r.continue_() if r.request.url.startswith(origin+'/') else (outside.append(r.request.url),r.abort()))
            contract="""export const readName=()=>'';export const readLocal=()=>window.testSaved;export const writeLocal=(game,value)=>{window.testSaved=structuredClone(value)};export const sync=()=>{};export const initProgress=async()=>{};export const getAutoAdvance=()=>window.testAutoAdvance??true;export const setAutoAdvance=v=>window.testAutoAdvance=v;"""
            context.route('**/shared/progress.js',lambda r:r.fulfill(status=200,content_type='text/javascript',body=contract))
            solver=(ROOT/'public/target/solver.js').read_text().replace('export function makeCard(', 'export function makeRandomCard(')
            solver+='\nexport const makeCard=()=>structuredClone(window.testCard);\n'
            context.route('**/target/solver.js',lambda r:r.fulfill(status=200,content_type='text/javascript',body=solver))
            context.add_init_script('window.testCard={numbers:[2,3,4],target:24};window.testSaved='+json.dumps(seed or {})+';')
            html=(ROOT/f'public/{game}/index.html').read_text().replace('<script src="./app.js" defer></script>',f'<script type="module" src="./{game}.js"></script>')
            context.route(origin+'/'+game+'/',lambda r:r.fulfill(status=200,content_type='text/html',body=html))
            page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(origin+'/'+game+'/');page.clock.install();page.clock.pause_at('2030-01-01T00:00:00Z')
            try:
                fn(page);assert not outside,outside;assert not errors,errors;print('PASS',name,flush=True)
            except Exception as e:failures.append(name+': '+str(e));print('FAIL',name,str(e),flush=True)
            context.close()
        def combine(p,a,b,op):
            p.locator('.num').nth(a).click();p.locator('.num').nth(b).click();p.locator('.op').filter(has_text=op).click()
        def win(p):combine(p,0,1,'×');combine(p,0,1,'×')
        def bookkeeping(p):
            win(p);p.locator('#skip').click();combine(p,0,1,'+');combine(p,0,1,'+')
            record=p.evaluate('testSaved.items.t24');assert record['attempts']==2 and record['correct']==1 and record['streak']==0,record
        check('wrong completed attempts persist and break per-target streak',bookkeeping)
        def duplicates(p):
            win(p);p.locator('#undo').click();combine(p,0,1,'×');assert p.evaluate('testSaved.items.t24.correct')==1
            p.locator('#reset').click();win(p);assert p.evaluate('testSaved.items.t24.correct')==1
            p.locator('#again').click();combine(p,1,2,'×');combine(p,0,1,'×');assert p.evaluate('testSaved.extras')==1;assert p.evaluate('testSaved.solved')==1
        check('undo and replay do not duplicate credit; alternate route counts once',duplicates)
        def hint(p):
            combine(p,0,1,'+');combine(p,0,1,'+');p.locator('#undo').click();p.clock.fast_forward(45001)
            assert p.locator('#hint').is_visible();assert 'original' in p.locator('#hint').inner_text().lower()
        check('undo rearms an explicitly original-card hint',hint)
        def keyboard(p):
            p.locator('.num').first.focus();p.keyboard.press('Enter');assert p.locator('.num').first.evaluate('(e)=>e===document.activeElement');assert p.locator('.num').first.get_attribute('aria-pressed')=='true'
            assert p.evaluate('document.documentElement.scrollWidth<=innerWidth')
        check('keyboard selection preserves focus and narrow actions fit',keyboard)
        def area_input(p):
            p.locator('#check').click();p.locator('#guess').fill('-1');p.locator('#check').click();assert 'share a side' in p.locator('#feedback').inner_text()
        check('blank area input is not a wrong answer',area_input,'areamaze')
        def area_labels(p):
            # a3 is the sole unfinished level-one puzzle.
            boxes=p.locator('.side.left').evaluate_all('(es)=>es.map(e=>e.getBoundingClientRect().x)');assert boxes and min(boxes)>=0,boxes
            assert p.locator('#maze').get_attribute('aria-label');assert p.evaluate('document.documentElement.scrollWidth<=innerWidth')
        check('area givens visible at 320px with equivalent text',area_labels,'areamaze',{'tier':1,'done':['a1','a2','a4','a5']})
        browser.close()
    server.shutdown();server.server_close()
    if failures:raise SystemExit('\n'.join(failures))
if __name__=='__main__':main()
