import base64, datetime, hashlib, io, json, pathlib, subprocess, sys, tarfile
root=pathlib.Path(sys.argv[1]); out=pathlib.Path(sys.argv[2]); out.mkdir(parents=True,exist_ok=True)
sha=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
rows=[]
def get(url):
    return subprocess.check_output(['curl','--fail','--silent','--show-error','--location','--max-time','35',url])
for directory in ['cli','x402-preflight','mcp-starter','defects']:
    pkg=json.loads((root/directory/'package.json').read_text()); name=pkg['name']; version=pkg['version']
    row={'name':name,'version':version,'source_commit':sha,'read_at':datetime.datetime.now(datetime.timezone.utc).isoformat()}
    try:
        metadata=json.loads(get(f'https://registry.npmjs.org/{name}/{version}'))
        latest=json.loads(get(f'https://registry.npmjs.org/{name}/latest'))
        assert metadata['version']==version and latest['version']==version
        tarball=get(metadata['dist']['tarball']); integrity='sha512-'+base64.b64encode(hashlib.sha512(tarball).digest()).decode()
        assert integrity==metadata['dist']['integrity']
        expected=json.loads(subprocess.check_output(['npm','pack','--dry-run','--json','--ignore-scripts','--cache','/private/tmp/scvd-readback-npm-cache'],cwd=root/directory,text=True,stderr=subprocess.DEVNULL))[0]
        expected_paths=sorted(x['path'] for x in expected['files']); files=[]
        with tarfile.open(fileobj=io.BytesIO(tarball),mode='r:gz') as archive:
            actual_paths=sorted(x.name.removeprefix('package/') for x in archive.getmembers() if x.isfile())
            assert actual_paths==expected_paths,(name,'tarball file list differs')
            for path in actual_paths:
                data=archive.extractfile('package/'+path).read(); local=(root/directory/path).read_bytes()
                assert data==local,(name,path,'published bytes differ')
                files.append({'path':path,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
        attestation_url=metadata['dist'].get('attestations',{}).get('url')
        assert attestation_url,'No provenance attestations URL'
        attestations=json.loads(get(attestation_url)); claims=[]
        for item in attestations.get('attestations',[]):
            envelope=item.get('bundle',{}).get('dsseEnvelope',{})
            if envelope.get('payload'):
                claim=json.loads(base64.b64decode(envelope['payload'])); claims.append(claim)
        assert claims,'No readable attestation payload'
        provenance=next(c for c in claims if c.get('predicateType')=='https://slsa.dev/provenance/v1')
        assert any(s.get('digest',{}).get('sha512')==hashlib.sha512(tarball).hexdigest() for s in provenance['subject'])
        definition=provenance['predicate']['buildDefinition']; workflow=definition['externalParameters']['workflow']
        assert workflow['repository']=='https://github.com/seancrecord/scvd-general-store-repo'
        assert workflow['path']=='.github/workflows/publish-npm.yml'
        assert workflow['ref']=='refs/heads/main'
        dependency=definition['resolvedDependencies'][0]
        row['provenance_source_commit']=dependency['digest']['gitCommit']
        for path in actual_paths:
            published_source=subprocess.check_output(['git','show',f"{row['provenance_source_commit']}:{directory}/{path}"],cwd=root)
            assert published_source==(root/directory/path).read_bytes(),(name,path,'source differs from provenance commit')
        row.update(status='passed',latest=latest['version'],integrity=integrity,tarball_url=metadata['dist']['tarball'],attestations_url=attestation_url,attestation_payloads=claims,attestation_signature_verification='not performed; payload and registry integrity read independently',files=files)
        (out/(name+'-metadata.json')).write_text(json.dumps(metadata,indent=2)+'\n')
        (out/(name+'-attestations.json')).write_text(json.dumps(attestations,indent=2)+'\n')
    except Exception as error:
        row.update(status='failed',error=str(error))
    rows.append(row); print(name,row['status'],flush=True)
    (out/'package-readback.json').write_text(json.dumps(rows,indent=2)+'\n')
if not all(x['status']=='passed' for x in rows): sys.exit(1)
