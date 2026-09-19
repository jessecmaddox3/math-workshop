#!/usr/bin/env python3
"""Real PostgreSQL ownership/CAS checks in a new, temporary Unix-socket cluster.

No DSN, host, production credentials, email, Docker, or existing database is used.
This tests SQL/RLS, not Supabase's email delivery or REST/Auth integration.
Requires PostgreSQL 17 executables on PATH; deletes only its own temporary cluster.
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import os
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
A = '11111111-1111-4111-8111-111111111111'
B = '22222222-2222-4222-8222-222222222222'
PA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
PB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'


def main():
    binaries = {name: shutil.which(name) for name in ('postgres', 'initdb', 'pg_ctl', 'psql')}
    if not all(binaries.values()):
        raise SystemExit('Install PostgreSQL 17 and put postgres, initdb, pg_ctl and psql on PATH.')
    version = subprocess.check_output([binaries['postgres'], '--version'], text=True).strip()
    if not version.startswith('postgres (PostgreSQL) 17.'):
        raise SystemExit(f'This harness is pinned to PostgreSQL 17. Found: {version}')
    # Ignore connection settings inherited from a developer shell.
    env = {key: value for key, value in os.environ.items() if not key.startswith('PG')}
    with tempfile.TemporaryDirectory(prefix='math-rls-') as root:
        base = Path(root)
        data = base / 'data'
        socket = base / 'socket'
        socket.mkdir(mode=0o700)
        subprocess.run([binaries['initdb'], '-D', str(data), '-U', 'test_admin', '-A', 'trust', '--no-locale', '-E', 'UTF8'], env=env, check=True, capture_output=True)
        # Empty listen_addresses binds NO TCP port. The private directory is the only endpoint.
        options = f"-k {socket} -c listen_addresses='' -c fsync=off"
        subprocess.run([binaries['pg_ctl'], '-D', str(data), '-l', str(base / 'server.log'), '-o', options, '-w', 'start'], env=env, check=True, capture_output=True)
        def query(sql, owner=None, role='authenticated', fails=False):
            if owner is not None or role == 'anon':
                assert role in ('authenticated', 'anon') and owner in (A, B, None)
                sql = f"begin; set local role {role}; set local request.jwt.claim.sub = '{owner or ''}';\n{sql.rstrip().rstrip(';')};\ncommit;"
            result = subprocess.run([binaries['psql'], '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', str(socket), '-U', 'test_admin', '-d', 'postgres'], input=sql, env=env, text=True, capture_output=True)
            if fails:
                assert result.returncode != 0, 'A forbidden statement unexpectedly succeeded'
            else:
                assert result.returncode == 0, result.stderr
            return result.stdout.strip()
        try:
            query("""
              create role anon nologin;
              create role authenticated nologin;
              create schema auth;
              create table auth.users(id uuid primary key);
              create function auth.uid() returns uuid language sql stable as
                $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
              grant usage on schema public, auth to anon, authenticated;
              grant execute on function auth.uid() to anon, authenticated;
            """ + f"insert into auth.users values ('{A}'), ('{B}');")
            query((ROOT / 'cloud/schema.sql').read_text())
            for owner, profile in ((A, PA), (B, PB)):
                query(f"insert into learning_profiles(id,label) values ('{profile}','Avery');", owner)
                query(f"insert into learning_saves(profile_id,game_id,curriculum_id,format_version,snapshot,write_id,revision,updated_at) values ('{profile}','target','test-v1',1,'{{\"streak\":2}}',gen_random_uuid(),999,'2000-01-01');", owner)
            assert query('select count(*) from learning_profiles', A) == '1'
            assert query('select count(*) from learning_saves', B) == '1'
            assert query('select revision from learning_saves', A) == '1'
            assert query("select updated_at > '2000-01-02' from learning_saves", A) == 't'
            for table in ('learning_profiles', 'learning_saves'):
                for sql in (f'select * from {table};', f'delete from {table};', f'update {table} set owner_id=owner_id;'):
                    query(sql, role='anon', fails=True)
            query(f"insert into learning_profiles(id,label) values (gen_random_uuid(),'Casey');", role='anon', fails=True)
            query(f"insert into learning_saves(profile_id,game_id,curriculum_id,format_version,snapshot,write_id) values ('{PA}','target','test-v1',1,'{{}}',gen_random_uuid());", role='anon', fails=True)
            # Guessed IDs, bulk modifications and ownership reassignment.
            assert query(f"select count(*) from learning_profiles where id='{PB}'", A) == '0'
            assert query(f"select count(*) from learning_saves where profile_id='{PB}'", A) == '0'
            assert query(f"with x as (update learning_profiles set label='Changed' where id='{PB}' returning *) select count(*) from x", A) == '0'
            assert query(f"with x as (delete from learning_saves where profile_id='{PB}' returning *) select count(*) from x", A) == '0'
            query(f"update learning_profiles set owner_id='{B}';", A, fails=True)
            query(f"update learning_saves set owner_id='{B}',write_id=gen_random_uuid();", A, fails=True)
            query(f"insert into learning_profiles(owner_id,id,label) values ('{B}',gen_random_uuid(),'Forged');", A, fails=True)
            query(f"insert into learning_saves(profile_id,game_id,curriculum_id,format_version,snapshot,write_id) values ('{PB}','target','test-v1',1,'{{}}',gen_random_uuid());", A, fails=True)
            query("update learning_saves set curriculum_id='different',write_id=gen_random_uuid();", A, fails=True)
            query("update learning_saves set snapshot='[]',write_id=gen_random_uuid();", A, fails=True)
            query("update learning_saves set snapshot=jsonb_build_object('large',repeat('x',1048576)),write_id=gen_random_uuid();", A, fails=True)
            query("update learning_saves set snapshot='{}';", A, fails=True)
            # Two real concurrent SQL transactions at the same revision have exactly one winner.
            update = "with saved as (update learning_saves set snapshot='{\"streak\":0}',write_id=gen_random_uuid(),revision=999 where revision=1 returning revision) select count(*) from saved;"
            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(lambda _: query(update, A), range(2)))
            assert sorted(results) == ['0', '1'], results
            assert query("select revision || ':' || (snapshot->>'streak') from learning_saves", A) == '2:0'
            assert query(update, A) == '0'
            assert query('select revision from learning_saves', B) == '1'
            # Deletes cascade only through this owner's composite foreign key.
            query('delete from learning_profiles;', A)
            assert query('select count(*) from learning_saves', A) == '0'
            assert query('select count(*) from learning_saves', B) == '1'
            assert query('select count(*) from learning_profiles', B) == '1'
            print(f'PASS: {version}; real RLS, owner reassignment, cross-owner FK, bounded snapshots, immutable identity, CAS concurrency, reset and isolated cascade.')
            print('Supabase REST/Auth/email integration is a separate check and was not exercised by this harness.')
        finally:
            subprocess.run([binaries['pg_ctl'], '-D', str(data), '-m', 'immediate', '-w', 'stop'], env=env, check=True, capture_output=True)


if __name__ == '__main__':
    main()
