"""Caption timing from the actual sentence WAVs, not an ASR transcript."""
import json,pathlib,re,subprocess,wave
root=pathlib.Path(__file__).resolve().parent
manifest_path=pathlib.Path(__import__('sys').argv[1]).resolve()
manifest=json.loads(manifest_path.read_text(encoding='utf-8-sig'))
scenes=json.loads((root/'narration.json').read_text(encoding='utf-8-sig'))
out=root/'remotion/public/voice-final'
out.mkdir(exist_ok=True)
cap=root/'remotion/captions'
cap.mkdir(exist_ok=True)
if 'segments' in manifest and all('chapterId' in x and 'path' in x for x in manifest['segments']):
    chapters=[{'id':scene['id'],'segments':[
        {'text':x['text'],'audio':x['path']} for x in manifest['segments'] if x['chapterId']==scene['id']
    ]} for scene in scenes]
else:
    chapters=manifest['chapters']
for scene in scenes:
    chapter=next(x for x in chapters if x['id']==scene['id'])
    if not chapter['segments']: raise ValueError('Empty sentence audio chapter')
    spoken_text=''.join(x['text'] for x in chapter['segments'])
    if re.sub(r'\s+','',spoken_text)!=re.sub(r'\s+','',scene['text']):
        raise ValueError('Sentence text does not match final narration: '+scene['id'])
    data=[];captions=[];elapsed=0;params=None
    for segment in chapter['segments']:
        path=pathlib.Path(segment['audio'])
        if not path.is_absolute(): path=manifest_path.parent/path
        with wave.open(str(path),'rb') as wav:
            current=(wav.getnchannels(),wav.getsampwidth(),wav.getframerate())
            if params is not None and current!=params: raise ValueError('Sentence WAV formats differ')
            params=current
            duration=wav.getnframes()/wav.getframerate()
            if duration<=0: raise ValueError('Empty sentence WAV')
            data.append(wav.readframes(wav.getnframes()))
        captions.append({'text':segment['text'],'startMs':elapsed*1000,'endMs':(elapsed+duration)*1000,'timestampMs':None,'confidence':None,'pageBreakAfter':True})
        elapsed+=duration
        pause=.18
        data.append(bytes(round(params[2]*pause)*params[0]*params[1]));elapsed+=pause
    with wave.open(str(out/(scene['id']+'.wav')),'wb') as wav:
        wav.setnchannels(params[0]);wav.setsampwidth(params[1]);wav.setframerate(params[2]);wav.writeframes(b''.join(data))
    (cap/(scene['id']+'.wav.json')).write_text(json.dumps(captions,ensure_ascii=False,indent=2),encoding='utf-8')
    print(scene['id'],len(captions),'actual sentences',round(elapsed,3),'s')
subprocess.run([__import__('sys').executable,str(root/'prepare-timeline.py')],check=True)
