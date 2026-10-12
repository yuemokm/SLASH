from gradio_client import Client,handle_file
import pathlib,json
root=pathlib.Path(__file__).resolve().parent
reference='这是 Slash，一个给产品经理用的 Agent。'
text='这是 Slash，一个给产品经理用的 Agent。给它参考资料，就可以让它帮你整理需求、写需求文档，或者改原型。生成之后，我们就在右侧预览，看看关键规则有没有遗漏。'
request={'referenceText':reference,'text':text,'language':'中英混合','cut':'按中文句号。切','speed':1,'referenceAudio':'reference-clear-warm-4.4s.wav'}
(root/'request.json').write_text(json.dumps(request,ensure_ascii=False,indent=2),encoding='utf-8')
client=Client('https://lj1995-gpt-sovits-proplus.hf.space',verbose=False)
job=client.submit(handle_file(str(root/'reference-clear-warm-4.4s.wav')),reference,'中英混合',text,'中英混合','按中文句号。切',15,1,1,False,1,False,[],api_name='/get_tts_wav')
result=job.result(timeout=180)
(root/'result.json').write_text(json.dumps(result,ensure_ascii=False),encoding='utf-8')
src=result if isinstance(result,str) else result[0]
(root/'sovits-clear-warm-sample.wav').write_bytes(pathlib.Path(src).read_bytes())
print('SAVED',root/'sovits-clear-warm-sample.wav',flush=True)
