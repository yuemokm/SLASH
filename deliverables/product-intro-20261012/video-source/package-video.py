import pathlib,zipfile,json,hashlib,sys,os
root=pathlib.Path(__file__).resolve().parent
preview='--preview' in sys.argv
output=root.parent/('Slash产品介绍-可编辑工程.zip' if preview else 'slash-product-intro-source.zip')
files=[]
for name in ['README.md','BRIEF.md','SCRIPT.md','narration.json',('timeline-preview.json' if preview else 'timeline-final.json'),'prepare-timeline.py','prepare-segment-timeline.py','prepare-preview-timeline.py','package-video.py']:
    p=root/name
    if not p.exists(): raise RuntimeError(f'Missing final project file: {p}')
    files.append((p,pathlib.Path(name)))
for base in ['hyperframes','remotion']:
    candidates=[]
    for folder,dirs,names in os.walk(root/base):
        dirs[:]=[x for x in dirs if x not in ['node_modules','.hyperframes','.source-archive','snapshots','.git','renders','__pycache__']]
        candidates.extend(pathlib.Path(folder)/name for name in names)
    for p in candidates:
        rel=p.relative_to(root)
        if any(x in rel.parts for x in ['node_modules','.hyperframes','.source-archive','snapshots','.git','renders']): continue
        if p.suffix=='.log' or p.name.startswith('whisper-'): continue
        if base=='hyperframes' and p.name.startswith('architecture-') and p.name!='architecture-delivery-manifest.json': continue
        if base=='hyperframes' and p.name in ['AGENTS.md','CLAUDE.md']: continue
        if base=='remotion':
            # Only final sound and the screenshots actually used in the cut.
            if 'voice' in rel.parts: continue
            if p.name=='transcribe.mjs': continue
            if 'screens' in rel.parts and p.name.startswith(('06-','07-')): continue
            if 'captions' in rel.parts and ('sample' in p.name or 'qwen-clear-warm' in p.name): continue
        files.append((p,rel))
facts=root.parent/'assets/FACTS-AND-LIMITS.md'
files.append((facts,pathlib.Path('materials/FACTS-AND-LIMITS.md')))
subtitle=root.parent/('Slash产品介绍-字幕预览.srt' if preview else 'slash-product-intro-20261012.srt')
if not subtitle.exists(): raise RuntimeError(f'Missing final subtitles: {subtitle}')
files.append((subtitle,pathlib.Path('captions')/subtitle.name))
if preview:
    for source,rel in [(root/'VIDEO-DELIVERY.md',pathlib.Path('VIDEO-DELIVERY.md')),
                       (root/'verify-preview.py',pathlib.Path('verify-preview.py')),
                       (root.parent/'video-preview-verification.json',pathlib.Path('materials/video-preview-verification.json'))]:
        if not source.exists(): raise RuntimeError(f'Missing preview delivery evidence: {source}')
        files.append((source,rel))
manifest=[]
with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for p,rel in sorted(files,key=lambda x:str(x[1])):
        data=p.read_bytes();z.writestr(str(rel).replace('\\','/'),data)
        manifest.append({'path':str(rel).replace('\\','/'),'size':len(data),'sha256':hashlib.sha256(data).hexdigest()})
    z.writestr('PROJECT-MANIFEST.json',json.dumps(manifest,ensure_ascii=False,indent=2))
print(output,len(manifest),'files',output.stat().st_size,'bytes')
(root.parent/'source-zip-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
