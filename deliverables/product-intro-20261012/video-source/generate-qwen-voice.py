import json,pathlib,urllib.request,subprocess,time
from gradio_client import Client, handle_file
root=pathlib.Path(__file__).resolve().parent
audit=root/'tts-qwen-audit'
out=root/'remotion/public/voice-final'
out.mkdir(exist_ok=True)
origin='https://qwen-qwen3-tts.hf.space'
events=[json.loads(x) for x in (audit/'clear-warm-design-stream.jsonl').read_text(encoding='utf-8').splitlines()]
reference=next(x['data'][0] for x in events if x['event']=='complete')
reftext='这是 Slash，一个给产品经理用的 Agent。你可以把资料放进来，先梳理需求，再生成文档和交互原型。比如这份需求文档，生成之后，我们就在右侧预览，看看关键规则有没有遗漏。'
scenes=json.loads((root/'narration.json').read_text(encoding='utf-8'))
timeline=[]
client=Client(origin,verbose=False)
for scene in scenes:
    sid=scene['id']
    path=out/(sid+'.wav')
    payload={'data':[reference,reftext,scene['text'].replace('Pi','派'),'Chinese',False,'1.7B']}
    (audit/(sid+'-clone-request.json')).write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf-8')
    if not path.exists():
        job=client.submit(handle_file(str(audit/'qwen-clear-warm-design.wav')),reftext,scene['text'].replace('Pi','派'),'Chinese',False,'1.7B',api_name='/generate_voice_clone')
        result=job.result(timeout=180)
        (audit/(sid+'-clone-client-result.json')).write_text(json.dumps(result,ensure_ascii=False),encoding='utf-8')
        if not result[0]: raise RuntimeError(str(result))
        path.write_bytes(pathlib.Path(result[0]).read_bytes())
    duration=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',str(path)]))
    timeline.append({**scene,'audio':'voice-final/'+sid+'.wav','duration':duration,'frames':round((duration+0.65)*30),'captions':[]})
    (root/'timeline-qwen.json').write_text(json.dumps(timeline,ensure_ascii=False,indent=2),encoding='utf-8')
    print(sid,duration,'seconds',flush=True)
print('TOTAL',sum(x['frames'] for x in timeline)/30,flush=True)
