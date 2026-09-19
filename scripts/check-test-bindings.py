#!/usr/bin/env python3
"""Assert the dedicated test containers expose ports only on loopback."""
import json
from pathlib import Path
import sys

containers = json.loads(Path(sys.argv[1]).read_text())
assert containers, 'No test containers were found'
ports = 0
for container in containers:
    for bindings in container['NetworkSettings']['Ports'].values():
        for binding in bindings or []:
            assert binding['HostIp'] in ('127.0.0.1', '::1'), 'A test port was exposed beyond loopback'
            ports += 1
assert ports >= 2, 'Expected loopback API and mail ports'
print(f'Verified {ports} published test ports on loopback only.')
