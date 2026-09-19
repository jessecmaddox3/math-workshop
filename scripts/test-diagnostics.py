#!/usr/bin/env python3
"""Print limited startup diagnostics without local keys, JWTs or mail bodies."""
from pathlib import Path
import re
import sys

path = Path(sys.argv[1])
if path.exists():
    lines = path.read_text(errors='replace').splitlines()[-120:]
    for line in lines:
        if re.search(r'key|token|password|secret|authorization|email|bearer', line, re.I): continue
        line = re.sub(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', '[redacted]', line)
        print(line)
else:
    print('No stack startup log was created.')
