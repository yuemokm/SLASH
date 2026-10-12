import asyncio,json,subprocess
from pathlib import Path
import edge_tts
root=Path(__file__).resolve().parent
public=root/'remotion'/'public'
(public/'voice').mkdir(parents=True,exist_ok=True)
async def main():
 scenes=json.loads((root/'narration.json').read_text(encoding='utf-8'))
 for scene in scenes:
  dest=public/'voice'/f"{scene['id']}.mp3"
  words=[]
  c=edge_tts.Communicate(scene['text'].replace('Slash','斜杠工作台').replace('Pi SDK','派 SDK'),'zh-CN-XiaoxiaoNeural',rate='+5%',boundary='WordBoundary')
  with dest.open('wb') as f:
   async for chunk in c.stream():
    if chunk['type']=='audio':f.write(chunk['data'])
    elif chunk['type']=='WordBoundary':words.append({'text':chunk['text'],'startMs':chunk['offset']/10000,'endMs':(chunk['offset']+chunk['duration'])/10000})
  duration=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',str(dest)],text=True).strip())
  caps=[];group=[]
  for word in words:
   if group and (sum(len(w['text']) for w in group)+len(word['text'])>33 or word['endMs']-group[0]['startMs']>6000):
    caps.append({'text':''.join(w['text'] for w in group),'startMs':group[0]['startMs'],'endMs':group[-1]['endMs'],'timestampMs':None,'confidence':None});group=[]
   group.append(word)
  if group:caps.append({'text':''.join(w['text'] for w in group),'startMs':group[0]['startMs'],'endMs':group[-1]['endMs'],'timestampMs':None,'confidence':None})
  if not caps:caps=[{'text':scene['text'],'startMs':0,'endMs':duration*1000,'timestampMs':None,'confidence':None}]
  scene.update(audio='voice/'+scene['id']+'.mp3',duration=duration,frames=round((duration+.6)*30),captions=caps)
  (root/'audio-progress.json').write_text(json.dumps(scenes,ensure_ascii=False,indent=2),encoding='utf-8')
  print(scene['id'],round(duration,2),len(caps),flush=True)
 (root/'timeline.json').write_text(json.dumps(scenes,ensure_ascii=False,indent=2),encoding='utf-8')
 print('TOTAL',sum(s['frames'] for s in scenes)/30,flush=True)
asyncio.run(main())
