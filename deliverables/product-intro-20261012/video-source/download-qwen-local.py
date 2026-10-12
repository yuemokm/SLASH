import concurrent.futures, hashlib, json, pathlib, time, urllib.request
root=pathlib.Path(__file__).resolve().parent
dest=root/'tts-local-cache'/'Qwen3-TTS-12Hz-0.6B-Base';dest.mkdir(parents=True,exist_ok=True)
api='https://huggingface.co/api/models/Qwen/Qwen3-TTS-12Hz-0.6B-Base?blobs=true'
with urllib.request.urlopen(api,timeout=45) as r: meta=json.load(r)
revision=meta['sha'];(dest/'download-source.json').write_text(json.dumps({'repo':meta['id'],'revision':revision,'started':time.time()},indent=2),encoding='utf8')
items=[s for s in meta['siblings'] if s['rfilename'] not in ['.gitattributes','README.md']]
def one(item):
 name=item['rfilename'];target=dest/name;target.parent.mkdir(parents=True,exist_ok=True);expected=item.get('lfs',{}).get('sha256')
 if target.exists() and (not expected or hashlib.sha256(target.read_bytes()).hexdigest()==expected):return {'file':name,'reused':True,'size':target.stat().st_size}
 temp=target.with_suffix(target.suffix+'.part');url=f'https://huggingface.co/Qwen/Qwen3-TTS-12Hz-0.6B-Base/resolve/{revision}/{name}'
 print('download',name,flush=True)
 with urllib.request.urlopen(url,timeout=90) as response, temp.open('wb') as out:
  while chunk:=response.read(4*1024*1024):out.write(chunk)
 h=hashlib.sha256()
 with temp.open('rb') as stream:
  while chunk:=stream.read(4*1024*1024):h.update(chunk)
 actual=h.hexdigest()
 if expected and actual!=expected:raise RuntimeError('HASH_MISMATCH '+name)
 temp.replace(target);print('complete',name,target.stat().st_size,flush=True);return {'file':name,'size':target.stat().st_size,'sha256':actual,'expectedSha256':expected}
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool: receipts=list(pool.map(one,items))
(dest/'download-complete.json').write_text(json.dumps({'repo':meta['id'],'revision':revision,'finished':time.time(),'files':receipts},indent=2),encoding='utf8')
print('all model files downloaded',flush=True)
