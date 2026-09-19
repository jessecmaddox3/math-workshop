#!/usr/bin/env python3
"""Prepare a NEW disposable Supabase CLI directory. Does not start services."""
from pathlib import Path
import argparse
import json
import re
import shutil
import subprocess
import tomllib

ROOT = Path(__file__).resolve().parents[1]


def set_value(text, section, key, value):
    rendered = 'true' if value is True else 'false' if value is False else str(value) if isinstance(value, int) else json.dumps(value)
    line = f'{key} = {rendered}'
    expression = re.compile(r'(?ms)^\[' + re.escape(section) + r'\]\s*\n(.*?)(?=^\[|\Z)')
    match = expression.search(text)
    if not match:
        return text.rstrip() + f'\n\n[{section}]\n{line}\n'
    body = match.group(1)
    key_re = re.compile(r'(?m)^' + re.escape(key) + r'\s*=.*$')
    body = key_re.sub(line, body) if key_re.search(body) else body.rstrip() + '\n' + line + '\n'
    return text[:match.start(1)] + body + text[match.end(1):]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('directory', type=Path)
    args = parser.parse_args()
    dest = args.directory.resolve()
    dest.mkdir(parents=True, exist_ok=False)
    subprocess.run(['supabase', 'init'], cwd=dest, check=True, capture_output=True)
    config = dest / 'supabase/config.toml'
    text = config.read_text()
    text = re.sub(r'(?m)^project_id\s*=.*$', 'project_id = "math-synthetic-ci"', text)
    settings = {
        'api': {'enabled': True, 'port': 54321},
        'api.tls': {'enabled': True},
        'local_smtp': {'enabled': True, 'port': 54324},
        'auth': {'enabled': True, 'site_url': 'http://127.0.0.1:4195', 'enable_signup': True, 'enable_anonymous_sign_ins': False},
        'auth.email': {'enable_signup': True, 'enable_confirmations': True, 'max_frequency': '1s', 'otp_length': 6, 'otp_expiry': 3600},
        'auth.rate_limit': {'email_sent': 1000, 'sign_in_sign_ups': 1000, 'token_verifications': 1000, 'token_refresh': 1000},
        'auth.email.template.confirmation': {'subject': 'Math Workshop synthetic sign-in code', 'content_path': './supabase/templates/otp.html'},
        'auth.email.template.magic_link': {'subject': 'Math Workshop synthetic sign-in code', 'content_path': './supabase/templates/otp.html'},
    }
    for section, values in settings.items():
        for key, value in values.items():
            text = set_value(text, section, key, value)
    parsed = tomllib.loads(text)
    assert parsed['api']['tls']['enabled'] and parsed['auth']['email']['enable_confirmations']
    assert not parsed['auth']['email'].get('smtp', {}).get('enabled', False), 'External SMTP is forbidden in this harness'
    config.write_text(text)
    templates = dest / 'supabase/templates'; templates.mkdir(exist_ok=True)
    (templates / 'otp.html').write_text('<p>Your Math Workshop test code is <strong>{{ .Token }}</strong>.</p>\n')
    migrations = dest / 'supabase/migrations'; migrations.mkdir(exist_ok=True)
    shutil.copyfile(ROOT / 'cloud/schema.sql', migrations / '20260101000000_learning.sql')
    print('Prepared disposable local-only Auth, REST, TLS, Mailpit and unchanged application migration.')


if __name__ == '__main__':
    main()
