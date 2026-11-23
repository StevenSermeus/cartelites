#!/usr/bin/env python3
"""Convert a Convex export ZIP into private offline migration input. No network writes."""
import argparse, hashlib, json, os, pathlib, tempfile, zipfile

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('archive',type=pathlib.Path)
parser.add_argument('output',type=pathlib.Path,help='Private directory outside the repository')
args=parser.parse_args()
repo=pathlib.Path(__file__).resolve().parent.parent
out=args.output.resolve()
if out==repo or repo in out.parents: raise SystemExit('Raw backup output must be outside the repository (contains account and customer data).')
out.mkdir(mode=0o700,parents=True,exist_ok=True)
os.chmod(out,0o700)
with zipfile.ZipFile(args.archive) as archive:
    bad=archive.testzip()
    if bad: raise SystemExit('Corrupt ZIP member: '+bad)
    source={}
    for name in archive.namelist():
        parts=name.split('/')
        if len(parts)!=2 or parts[1]!='documents.jsonl' or parts[0].startswith('_'): continue
        table=parts[0]
        if not table.replace('_','').isalnum(): raise SystemExit('Invalid table name')
        rows=[json.loads(line) for line in archive.read(name).splitlines() if line.strip()]
        ids=[row.get('_id') for row in rows]
        if any(not isinstance(i,str) or not i for i in ids) or len(set(ids))!=len(ids): raise SystemExit('Invalid or duplicate IDs in '+table)
        source[table]=rows
    if not source: raise SystemExit('No Convex table documents found')
    manifest={'archiveSha256':hashlib.sha256(args.archive.read_bytes()).hexdigest(),'tables':{t:len(rows) for t,rows in source.items()}}
    for filename,value in [('export.json',source),('manifest.json',manifest)]:
        fd,temp=tempfile.mkstemp(dir=out)
        try:
            with os.fdopen(fd,'w') as stream: json.dump(value,stream,ensure_ascii=False)
            os.replace(temp,out/filename)
        finally:
            if os.path.exists(temp):os.unlink(temp)
print(json.dumps(manifest,indent=2))
