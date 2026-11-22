#!/usr/bin/env python3
"""Transfer architecture-independent build output, excluding binaries and node_modules."""
import os, sys, tarfile
from pathlib import Path
source, output = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve()
output.parent.mkdir(parents=True, exist_ok=True)
with tarfile.open(output, 'w:gz') as archive:
    record=source / '.dsh-build/client-build-environment.json'
    if not record.is_file():raise RuntimeError('Complete client build record missing')
    archive.add(record,arcname=str(record.relative_to(source)))
    for base in ['packages', 'apps', 'vendor', 'native/system/packages/entry']:
        for directory, dirs, files in os.walk(source / base):
            dirs[:] = [name for name in dirs if name not in ['node_modules', '.git']]
            path = Path(directory)
            if path.name not in ['lib', 'dist']: continue
            archive.add(path, arcname=str(path.relative_to(source)), filter=lambda entry: None if entry.name.endswith(('.node', '.so', '.dylib', '.exe')) else entry)
            dirs.clear()
