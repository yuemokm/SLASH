import json, pathlib, urllib.request, time, sys

root = pathlib.Path(__file__).resolve().parent
origin = 'https://qwen-qwen3-tts.hf.space'
text = '这是 Slash，一个给产品经理用的 Agent。你可以把资料放进来，先梳理需求，再生成文档和交互原型。比如这份需求文档，生成之后，我们就在右侧预览，看看关键规则有没有遗漏。'
style = '像产品经理向同事展示软件，自然交流，轻松清晰。短句有停顿，语气亲切但专业。避免播音腔、广告腔和逐字朗读。Slash 按英文读，保持自然。'
design='--design' in sys.argv
endpoint='generate_voice_design' if design else 'generate_custom_voice'
stem='clear-warm-design' if design else 'serena-natural'
description='年轻成年女性，约28至30岁，正常中音区，温柔但清亮，轻松自然。不要厚重低沉，不用童音，不甜腻，不撒娇，不用气泡音。像产品经理平常给同事演示软件，自然交谈，清楚但不刻意播报，短句有自然停顿。Slash按英文读。'
payload = {'data': [text, 'Chinese', description] if design else [text, 'Chinese', 'Serena', style, '1.7B']}
(root / (stem+'-request.json')).write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf-8')
req = urllib.request.Request(origin+'/gradio_api/call/'+endpoint,data=json.dumps(payload).encode(),headers={'Content-Type':'application/json'})
with urllib.request.urlopen(req, timeout=45) as response:
    result=json.load(response)
(root / (stem+'-enqueue.json')).write_text(json.dumps(result,indent=2),encoding='utf-8')
print('event_id',result['event_id'],flush=True)
event=''
with urllib.request.urlopen(origin+'/gradio_api/call/'+endpoint+'/'+result['event_id'],timeout=180) as response:
    for raw in response:
        line=raw.decode().strip()
        if line.startswith('event:'): event=line[6:].strip()
        if line.startswith('data:'):
            data=json.loads(line[5:])
            with (root/(stem+'-stream.jsonl')).open('a',encoding='utf-8') as log: log.write(json.dumps({'event':event,'data':data},ensure_ascii=False)+'\n')
            print(event, str(data)[:500],flush=True)
            if event=='error': raise RuntimeError(str(data))
            if event=='complete':
                audio=data[0]
                if not audio: raise RuntimeError(str(data))
                url=audio.get('url') or origin+'/gradio_api/file='+audio['path']
                output=root/('qwen-'+stem+'.wav')
                urllib.request.urlretrieve(url,output)
                print('SAVED',output,flush=True)
                break
