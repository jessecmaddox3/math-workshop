#!/usr/bin/env python3
"""Real disposable Supabase Auth/REST integration. LOOPBACK ONLY, no cloud login.

Input is the pinned CLI's private status JSON. Only its publishable key enters
the app. Mail stays in local Mailpit. Neither tokens nor message bodies are logged.
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from playwright.sync_api import sync_playwright
import argparse
import json
import re
import ssl
import subprocess
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[1]
import importlib.util
spec=importlib.util.spec_from_file_location('math_browser', ROOT/'scripts/test-saves-browser.py');math_browser=importlib.util.module_from_spec(spec);spec.loader.exec_module(math_browser)
settings=math_browser.settings
solve_ui=math_browser.solve_ui
READ_RECORDS = """() => new Promise((resolve,reject) => {
 const open=indexedDB.open('math-workshop-target-v1');open.onerror=()=>reject(open.error);
 open.onsuccess=()=>{const db=open.result;const tx=db.transaction('records');const req=tx.objectStore('records').getAll();req.onsuccess=()=>resolve(req.result);tx.oncomplete=()=>db.close()};
})"""


def loopback(url):
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in ('http', 'https') or parsed.hostname not in ('localhost', '127.0.0.1', '::1') or parsed.username or parsed.password:
        raise ValueError('This integration harness refuses non-loopback destinations.')
    return url.rstrip('/')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('status_json', type=Path)
    args = parser.parse_args()
    status = json.loads(args.status_json.read_text())
    api, mail = loopback(status['API_URL']), loopback(status['MAILPIT_URL'])
    key = status['PUBLISHABLE_KEY']
    assert api.startswith('https://') and key.startswith('sb_publishable_')
    # TLS exception is restricted to the validated loopback test endpoints.
    tls = ssl._create_unverified_context()
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            raise urllib.error.URLError('Redirects are forbidden in this loopback-only harness.')
    opener = urllib.request.build_opener(NoRedirect(), urllib.request.HTTPSHandler(context=tls))
    def request(method, url, body=None, token=None, app_key=True):
        loopback(url)
        headers = {'Content-Type': 'application/json', 'Prefer': 'return=representation'}
        if app_key: headers['apikey'] = key
        if token: headers['Authorization'] = 'Bearer ' + token
        req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None, method=method, headers=headers)
        try:
            with opener.open(req, timeout=15) as response:
                text = response.read().decode()
                return response.status, json.loads(text) if text else None
        except urllib.error.HTTPError as error:
            text = error.read().decode()
            return error.code, json.loads(text) if text else None
    def mail_ids():
        code, data = request('GET', mail + '/api/v1/messages', app_key=False)
        assert code == 200
        return {item['ID'] for item in data['messages']}
    def code_for(address, seen):
        for _ in range(100):
            code, data = request('GET', mail + '/api/v1/messages', app_key=False)
            assert code == 200
            for item in data['messages']:
                if item['ID'] in seen or not any(to['Address'] == address for to in item['To']): continue
                code, message = request('GET', mail + '/api/v1/message/' + item['ID'], app_key=False)
                assert code == 200
                match = re.search(r'\b([0-9]{6})\b', message.get('Text', '') + ' ' + message.get('HTML', ''))
                if match: return match.group(1)
            time.sleep(0.2)
        raise AssertionError('No fresh local email code arrived for the synthetic recipient.')
    def rows(token, table='learning_saves', filters=''):
        code, data = request('GET', api + '/rest/v1/' + table + '?select=*' + filters, token=token)
        assert code == 200
        return data
    def wait_record(page, predicate):
        for _ in range(100):
            found = page.evaluate(READ_RECORDS)
            matches=[r for r in found if predicate(r)]
            if len(matches)==1:return matches[0]
            page.wait_for_timeout(100)
        raise AssertionError('Expected durable local save state did not arrive.')
    def answer(page):
        if page.locator('dialog').evaluate('(el)=>el.open'):page.get_by_role('button',name='Close',exact=True).click()
        if page.locator('#auto-advance').is_checked():page.locator('#auto-advance').uncheck()
        if page.locator('.num').count()==1:page.locator('#skip').click()
        solve_ui(page)
        page.get_by_text('Saved on this device.',exact=False).wait_for()
    sent_at = {}
    def login(page, address, wrong_first=False):
        settings(page)
        page.get_by_role('button', name='Explore cloud saves', exact=True).click()
        page.fill('#cloud-email', address)
        seen = mail_ids()
        # Separate browsers still share the server's one-second recipient limit.
        # Respect it without weakening the real Auth service's configuration.
        remaining = sent_at.get(address, 0) + 1.25 - time.monotonic()
        if remaining > 0: page.wait_for_timeout(remaining * 1000)
        with page.expect_response(lambda response: response.url.startswith(api + '/auth/v1/otp') and response.request.method == 'POST') as event:
            page.get_by_role('button', name='Email me a code', exact=True).click()
        response = event.value
        if not 200 <= response.status < 300:
            known = {'over_email_send_rate_limit', 'over_request_rate_limit', 'email_address_invalid', 'email_provider_disabled', 'signup_disabled'}
            error_code = response.json().get('error_code')
            raise AssertionError(f'OTP request failed: HTTP {response.status}, code={error_code if error_code in known else "unclassified"}')
        sent_at[address] = time.monotonic()
        page.wait_for_selector('#cloud-code')
        otp = code_for(address, seen)
        if wrong_first:
            page.fill('#cloud-code', '000000' if otp != '000000' else '111111')
            page.get_by_role('button', name='Sign in', exact=True).click()
            page.wait_for_function('document.querySelector(".cloud-status").textContent.includes("incorrect or expired")')
        page.fill('#cloud-code', otp)
        with page.expect_response(lambda response: response.url.startswith(api + '/auth/v1/verify') and response.request.method == 'POST') as event:
            page.get_by_role('button', name='Sign in', exact=True).click()
        session = event.value.json()
        assert event.value.status == 200 and session.get('access_token') and session.get('user', {}).get('id')
        page.get_by_role('button', name='Disconnect cloud saves', exact=True).wait_for()
        return session['access_token'], session['user']['id'], otp

    config_path = ROOT / 'public/cloud-config.local.json'
    if config_path.exists(): raise SystemExit('Refusing to overwrite an existing operator configuration.')
    config_path.write_text(json.dumps({'enabled': True, 'label': 'Disposable local test', 'url': api, 'publishableKey': key}))
    server = None
    try:
        with tempfile.TemporaryFile() as log:
            server = subprocess.Popen(['node', 'scripts/serve.mjs'], cwd=ROOT, stdout=log, stderr=log)
            for _ in range(50):
                try:
                    if request('GET', 'http://127.0.0.1:4195/cloud-config.example.json', app_key=False)[0] == 200: break
                except urllib.error.URLError: time.sleep(0.1)
            with sync_playwright() as p:
                browser = p.chromium.launch()
                errors, blocked, api_paths = [], [], []
                def new_page(label="Comet"):
                    ctx = browser.new_context(ignore_https_errors=True)
                    def guard(route):
                        host = urllib.parse.urlparse(route.request.url).hostname
                        if host not in ('127.0.0.1', 'localhost', '::1'):
                            blocked.append(host); route.abort()
                        else: route.continue_()
                    ctx.route('**/*', guard)
                    page = ctx.new_page()
                    page.add_init_script("""
                      const native=window.fetch.bind(window);window.flushGate={armed:false,started:false};
                      window.fetch=async (...args)=>{
                        const url=String(args[0]);
                        if(window.flushGate.armed && url.includes('/rest/v1/learning_saves')){
                          window.flushGate.armed=false;window.flushGate.started=true;
                          await new Promise(resolve=>{window.flushGate.release=resolve});
                        }
                        return native(...args);
                      };
                    """)
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.on('request', lambda req: api_paths.append(urllib.parse.urlparse(req.url).path) if req.url.startswith(api) else None)
                    page.goto('http://127.0.0.1:4195/target/')
                    page.get_by_role('button',name='Learners and backups',exact=True).wait_for()
                    settings(page);page.get_by_label('New learner nickname',exact=True).fill(label);page.get_by_role('button',name='Add learner',exact=True).click()
                    page.get_by_text('learner: '+label+'.',exact=False).wait_for()
                    settings(page);page.get_by_role('button',name='Play as Player 1',exact=True).click()
                    settings(page);page.once('dialog',lambda dialog:dialog.accept());page.get_by_role('button',name='Remove this learner from this game',exact=True).click()
                    page.get_by_text('learner: '+label+'.',exact=False).wait_for()
                    page.locator('#auto-advance').uncheck();page.get_by_text('Saved on this device.',exact=False).wait_for()
                    return page
                a = new_page()
                assert not api_paths, 'App initialized a cloud request before opt-in'
                answer(a)
                token_a, owner_a, used_code = login(a, 'adult-a@example.invalid', wrong_first=True)
                a.get_by_role('button', name='Save Comet as a new cloud learner', exact=True).click()
                local_a = wait_record(a, lambda r: r['binding'] and not r['needsUpload'])
                saved_a = rows(token_a)[0]
                assert saved_a['snapshot'] == local_a['snapshot'] and saved_a['revision'] == 1
                assert request('POST', api + '/auth/v1/verify', {'email':'adult-a@example.invalid','token':used_code,'type':'email'})[0] >= 400
                for table in ('learning_profiles','learning_saves'):
                    assert request('GET', api + '/rest/v1/' + table + '?select=*')[0] in (401,403)
                b = new_page('Maple')
                token_b, owner_b, _ = login(b, 'adult-b@example.invalid')
                b.get_by_role('button', name='Save Maple as a new cloud learner', exact=True).click()
                wait_record(b, lambda r: r['binding'] and not r['needsUpload'])
                saved_b = rows(token_b)[0]
                assert owner_a != owner_b and rows(token_b, filters='&profile_id=eq.' + saved_a['profile_id']) == []
                assert len(rows(token_a)) == len(rows(token_b)) == 1
                target = api + '/rest/v1/learning_saves?profile_id=eq.' + saved_a['profile_id']
                assert request('PATCH', target, {'snapshot':saved_b['snapshot'],'write_id':str(uuid.uuid4())}, token_b) == (200, [])
                assert request('DELETE', target, token=token_b) == (200, [])
                assert request('POST', api + '/rest/v1/learning_profiles', {'owner_id':owner_a,'label':'Forged'}, token_b)[0] >= 400
                assert request('POST', api + '/rest/v1/learning_saves', {'owner_id':owner_b,'profile_id':saved_a['profile_id'],'game_id':'target','curriculum_id':'target-rational-v1','format_version':1,'snapshot':saved_b['snapshot'],'write_id':str(uuid.uuid4())}, token_b)[0] >= 400
                assert request('PATCH', target, {'owner_id':owner_b,'write_id':str(uuid.uuid4())}, token_a)[0] >= 400
                # Real concurrent PostgREST writes have exactly one CAS winner.
                def competing(_):
                    snapshot = json.loads(json.dumps(saved_a['snapshot']))
                    snapshot['extras'] = 0
                    code, data = request('PATCH', target + '&revision=eq.1', {'snapshot':snapshot,'format_version':1,'write_id':str(uuid.uuid4()),'revision':999}, token_a)
                    assert code == 200
                    return len(data)
                with ThreadPoolExecutor(max_workers=2) as pool:
                    assert sorted(pool.map(competing, range(2))) == [0,1]
                assert rows(token_a)[0]['revision'] == 2
                answer(a)
                wait_record(a, lambda r: bool(r['conflict']))
                settings(a)
                a.get_by_role('button', name='Keep this device’s progress', exact=True).click()
                wait_record(a, lambda r: not r['needsUpload'] and r['remoteRevision'] == 3)
                assert rows(token_a)[0]['revision'] == 3
                # The server commits a real PATCH, then its response is lost.
                dropped = []
                def lose_response(route):
                    if route.request.method == 'PATCH' and not dropped:
                        response = route.fetch(); assert response.status == 200
                        dropped.append(True); route.abort()
                    elif dropped: route.abort()
                    else: route.continue_()
                a.route(api + '/rest/v1/learning_saves*', lose_response)
                answer(a)
                uncertain = wait_record(a, lambda r: r['inflight'] is not None)
                for _ in range(50):
                    if dropped: break
                    a.wait_for_timeout(100)
                assert dropped
                committed = rows(token_a)[0]
                assert committed['write_id'] == uncertain['inflight']['writeId'] and committed['revision'] == 4
                a.reload();a.get_by_role('button',name='Learners and backups',exact=True).wait_for()
                a.unroute(api + '/rest/v1/learning_saves*', lose_response)
                token_a, _, _ = login(a, 'adult-a@example.invalid')
                wait_record(a, lambda r: r['remoteRevision'] == 4 and not r['needsUpload'])
                assert rows(token_a)[0]['revision'] == 4, 'Lost-response retry applied the write twice'
                # A second browser authenticates normally and restores the exact course.
                other = new_page('Local'); login(other, 'adult-a@example.invalid')
                other.get_by_role('button', name='Preview Comet', exact=True).click()
                other.get_by_role('button', name='Restore as a new local learner', exact=True).click()
                restored = wait_record(other, lambda r: r['binding'] is not None)
                assert restored['snapshot'] == rows(token_a)[0]['snapshot']
                # Queue an offline A edit, disconnect, then sign in as B. Never retarget it.
                other.route(api + '/rest/v1/**', lambda route: route.abort())
                answer(other)
                wait_record(other, lambda r: r['needsUpload'])
                settings(other)
                other.get_by_role('button', name='Disconnect cloud saves', exact=True).click()
                other.unroute(api + '/rest/v1/**')
                login(other, 'adult-b@example.invalid')
                pending = next(r for r in other.evaluate(READ_RECORDS) if r['binding'])
                assert pending['binding']['ownerId'] == owner_a and pending['needsUpload']
                assert rows(token_b)[0]['snapshot'] == saved_b['snapshot']
                # A second learner queued while a first upload waits must flush
                # afterward without needing an extra answer or a Retry click.
                switching = new_page('Local'); login(switching, 'adult-a@example.invalid')
                switching.get_by_role('button', name='Preview Comet', exact=True).click()
                switching.get_by_role('button', name='Restore as a new local learner', exact=True).click()
                wait_record(switching, lambda r: r['binding'] is not None)
                settings(switching);switching.get_by_label('New learner nickname',exact=True).fill('Nebula');switching.get_by_role('button',name='Add learner',exact=True).click();switching.get_by_text('learner: Nebula.',exact=False).wait_for()
                settings(switching)
                switching.get_by_role('button', name='Save Nebula as a new cloud learner', exact=True).click()
                for _ in range(100):
                    records = [r for r in switching.evaluate(READ_RECORDS) if r['binding']]
                    if len(records) == 2 and all(r['binding'] and not r['needsUpload'] for r in records): break
                    switching.wait_for_timeout(100)
                assert len(records) == 2 and all(r['binding'] and not r['needsUpload'] for r in records)
                settings(switching)
                switching.get_by_role('button', name='Play as Comet', exact=True).click()
                switching.evaluate('() => { window.flushGate.armed=true; window.flushGate.started=false }')
                answer(switching)
                switching.wait_for_function('window.flushGate.started')
                settings(switching);switching.get_by_role('button', name='Play as Nebula', exact=True).click()
                answer(switching)
                switching.wait_for_timeout(100)
                switching.evaluate('() => { window.flushGate.release() }')
                for _ in range(100):
                    records = [r for r in switching.evaluate(READ_RECORDS) if r['binding']]
                    if all(not r['needsUpload'] for r in records): break
                    switching.wait_for_timeout(100)
                assert all(not r['needsUpload'] for r in records), 'The second learner’s queued save was swallowed'
                assert not errors, errors
                assert not blocked, blocked
                browser.close()
                print(json.dumps({'stack':'Supabase CLI 2.117.0, actual local Auth/PostgREST/Kong/Mailpit', 'default_cloud_requests':0, 'new_and_returning_email_otp':'pass','wrong_and_reused_codes':'pass','two_owner_rls_and_composite_fk':'pass','concurrent_rest_cas':'pass','explicit_conflict_choice':'pass','lost_committed_response_reload_reconciliation':'pass','two_browser_exact_restore':'pass','account_switch_pending_isolation':'pass','profile_switch_during_upload':'pass','external_requests':blocked,'browser_errors':errors}))
    finally:
        if server:
            server.terminate()
            try: server.wait(timeout=10)
            except subprocess.TimeoutExpired: server.kill(); server.wait()
        config_path.unlink(missing_ok=True)


if __name__ == '__main__':
    main()
