#!/usr/bin/env python3
"""Package only built runtime files, using deterministic zip metadata."""
import hashlib
import json
import zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
manifest=json.loads((ROOT/'dist/manifest.json').read_text())
expected={'manifest.json','service-worker.js','sidepanel.html','sidepanel.js','styles.css','magenable-logo-colour.png',*[f'icon-{s}.png' for s in [16,32,48,128]]}
files={p.name for p in (ROOT/'dist').iterdir() if p.is_file()}
if files!=expected:raise SystemExit(f'Unexpected runtime files: {files ^ expected}')
if sorted(manifest['permissions'])!=sorted(['activeTab','scripting','sidePanel','storage']):raise SystemExit('Permission mismatch')
for key in ['host_permissions','optional_host_permissions','content_scripts','externally_connectable']:
    if key in manifest:raise SystemExit('Unexpected manifest capability: '+key)
out=ROOT/'artifacts';out.mkdir(exist_ok=True)
archive=out/f'magenable-pdp-health-check-{manifest["version"]}.zip'
with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for name in sorted(expected):
        info=zipfile.ZipInfo(name,(2026,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o644<<16
        z.writestr(info,(ROOT/'dist'/name).read_bytes())
with zipfile.ZipFile(archive) as z:
    if z.testzip() is not None:raise SystemExit('ZIP integrity failed')
    if set(z.namelist())!=expected:raise SystemExit('ZIP contents mismatch')
digest=hashlib.sha256(archive.read_bytes()).hexdigest()
(out/(archive.name+'.sha256')).write_text(digest+'  '+archive.name+'\n')
print(f'PASS: {archive}; {archive.stat().st_size} bytes; SHA256 {digest}; {len(expected)} runtime-only files')
