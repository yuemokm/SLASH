import json,pathlib,subprocess,re
root=pathlib.Path(__file__).resolve().parent
rows=json.loads((root/'narration.json').read_text(encoding='utf-8-sig'))
timeline=[]
for row in rows:
    sid=row['id']
    audio=root/'remotion/public/voice-final'/f'{sid}.wav'
    if not audio.exists(): raise RuntimeError(f'Missing final narration: {audio}')
    duration=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',str(audio)]))
    caption_path=root/'remotion/captions'/f'{sid}.wav.json'
    if not caption_path.exists(): raise RuntimeError(f'Missing measured caption timestamps: {caption_path}')
    captions=json.loads(caption_path.read_text(encoding='utf-8'))
    if not captions or max(x['endMs'] for x in captions)>duration*1000+500: raise RuntimeError(f'Caption duration mismatch: {sid}')
    # Hold the last frame so spoken endings and final captions remain visible.
    hold=1.1 if sid=='close' else .75
    frames=round((duration+hold)*30)
    entry={**row,'duration':duration,'frames':frames,'audio':f'voice-final/{sid}.wav','captions':captions}
    if sid=='architecture':
        diagram_start=next((x['startMs'] for x in captions if x['text'].strip().startswith('一次任务是这样跑起来的')),None)
        if diagram_start is None: raise RuntimeError('Missing measured architecture narration transition')
        entry['prefixFrames']=round(diagram_start/1000*30)
    timeline.append(entry)
(root/'timeline-final.json').write_text(json.dumps(timeline,ensure_ascii=False,indent=2),encoding='utf-8')
code="import type {Caption} from '@remotion/captions';\nexport type SceneTiming={id:string;title:string;text:string;duration:number;frames:number;audio:string;captions:Caption[];prefixFrames?:number};\nexport const voiceReady=true;\nexport const timings:SceneTiming[]="+json.dumps(timeline,ensure_ascii=False,indent=2)+';\n'
(root/'remotion/src/timeline.ts').write_text(code,encoding='utf-8')
def stamp(ms):
    t=round(ms); h=t//3600000;m=t//60000%60;s=t//1000%60
    return f'{h:02}:{m:02}:{s:02},{t%1000:03}'
entries=[];offset=0
for row in timeline:
    # SRT uses exactly the same timed caption pages as the video.
    group=[];start=None;end=None
    for caption in row['captions']:
        if start is None: start=caption['startMs']
        group.append(caption['text']);end=caption['endMs']
        if len(''.join(group))>=23 or end-start>=3600 or caption.get('pageBreakAfter'):
            entries.append((offset+start,offset+end,''.join(group).strip()));group=[];start=None
    if group: entries.append((offset+start,offset+end,''.join(group).strip()))
    offset+=row['frames']/30*1000
(root.parent/'slash-product-intro-20261012.srt').write_text('\n\n'.join(f'{i+1}\n{stamp(a)} --> {stamp(b)}\n{s}' for i,(a,b,s) in enumerate(entries)),encoding='utf-8-sig')
print('FINAL DURATION',offset/1000,'seconds',sum(x['frames'] for x in timeline),'frames')
