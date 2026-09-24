"""Read public guidance and retain responses; no buyer, payment or state mutation."""
import datetime, hashlib, html, json, pathlib, subprocess, sys
ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = pathlib.Path(sys.argv[1]).resolve() if len(sys.argv) == 2 else pathlib.Path(__file__).resolve().parent
if len(sys.argv) > 2:
    raise SystemExit('Usage: readback.py [new-output-directory]')
if OUT.joinpath('responses').exists() or OUT.joinpath('readback.json').exists():
    raise SystemExit('Existing capture retained. Supply a new output directory.')
OUT.joinpath('responses').mkdir(parents=True)
source = ROOT.joinpath('src/routes/corpus.ts').read_text()
# Read the single shared declaration rather than maintaining a second expected copy.
block = source.split('const HOST_HISTORY_SCOPE = {', 1)[1].split('\n};', 1)[0]
line = next(line for line in block.splitlines() if line.strip().startswith('description: '))
scope = json.loads(line.strip().removeprefix('description: ').removesuffix(','))
skill_path = 'skills/scvd-x402-verification/SKILL.md'
skill = ROOT.joinpath(skill_path).read_bytes()
base = 'https://scvd.store/corpus/host/weather.parklandarchives.com'
views = [
 ('skill','https://scvd.store/.well-known/agent-skills/scvd-x402-verification/SKILL.md','text/markdown'),
 ('normal',base+'.json','application/json'),
 ('stable',base+'.json?view=stable','application/json'),
 ('html',base,'text/html'),
 ('markdown',base,'text/markdown'),
 ('markdown_path',base+'.md','text/markdown'),
]
records=[]
for name,url,accept in views:
 now=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat()
 sent=now(); body=OUT/'responses'/f'{name}.body'; headers=OUT/'responses'/f'{name}.headers'
 result=subprocess.run(['curl','--silent','--show-error','--max-time','45','--header','Accept: '+accept,'--dump-header',str(headers),'--output',str(body),'--write-out','%{http_code}',url],capture_output=True,text=True)
 received=now()
 b=body.read_bytes() if body.exists() else b''; text=b.decode('utf-8',errors='replace')
 status=int(result.stdout) if result.stdout.isdigit() else None
 match=None
 if result.returncode==0 and status==200:
  if name=='skill': match=b==skill
  elif name in ['normal','stable']:
   try:match=json.loads(text).get('evidence_scope',{}).get('description')==scope
   except json.JSONDecodeError:match=False
  else: match=scope in html.unescape(text)
 records.append(dict(name=name,url=url,accept=accept,sent_at=sent,received_at=received,curl_exit_code=result.returncode,status=status,body=str(body.relative_to(OUT)),headers=str(headers.relative_to(OUT)),headers_sha256=hashlib.sha256(headers.read_bytes()).hexdigest() if headers.exists() else None,bytes=len(b),sha256=hashlib.sha256(b).hexdigest(),matches_source=match))
print(json.dumps({'records':[{k:r[k] for k in ['name','status','bytes','matches_source']} for r in records]},indent=2))
summary={'source_commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'trigger':'Close the remaining public readback for merged PR #904 after the September 24 native cohort.','scope_source':'src/routes/corpus.ts HOST_HISTORY_SCOPE.description','scope':scope,'skill_source':skill_path,'skill_sha256':hashlib.sha256(skill).hexdigest(),'records':records,'all_views_match':all(r['matches_source'] is True for r in records),'limits':['Readback only; no buyer or recipient sessions, payment, or production writes.','Matching text does not attest a complete Worker revision or demonstrate buyer comprehension.','Source snapshot includes #904; the earlier native cohort did not. Prior denominators remain unchanged.']}
OUT.joinpath('readback.json').write_text(json.dumps(summary,indent=2)+'\n')
raise SystemExit(0 if summary['all_views_match'] else 1)
