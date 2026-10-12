"""Official Qwen3-TTS, local CPU clone of the user-approved synthetic voice."""
import argparse, hashlib, json, os, pathlib, time
root=pathlib.Path(__file__).resolve().parent
os.environ.setdefault('HF_HOME',str(root/'tts-local-cache'/'hf'))
os.environ.setdefault('HF_HUB_OFFLINE','1')
parser=argparse.ArgumentParser();parser.add_argument('--input',type=pathlib.Path);parser.add_argument('--output',type=pathlib.Path,default=root/'tts-local-cache'/'sample');parser.add_argument('--threads',type=int,default=4);parser.add_argument('--sample',action='store_true');args=parser.parse_args()
args.output.mkdir(parents=True,exist_ok=True)
import torch,soundfile as sf
from qwen_tts import Qwen3TTSModel
torch.set_num_threads(args.threads);torch.set_num_interop_threads(1)
reference=root/'tts-qwen-audit'/'qwen-clear-warm-design.wav'
request=json.loads((root/'tts-qwen-audit'/'clear-warm-design-request.json').read_text(encoding='utf-8-sig'))
ref_text=request['data'][0]
started=time.perf_counter();print('loading local CPU model',flush=True)
model=Qwen3TTSModel.from_pretrained(str(root/'tts-local-cache'/'Qwen3-TTS-12Hz-0.6B-Base'),device_map='cpu',dtype=torch.float32,attn_implementation='sdpa')
loaded=time.perf_counter();print(f'model ready in {loaded-started:.3f}s',flush=True)
prompt=model.create_voice_clone_prompt(ref_audio=str(reference),ref_text=ref_text,x_vector_only_mode=False)
ready=time.perf_counter();print(f'voice prompt ready in {ready-loaded:.3f}s',flush=True)
if args.sample or not args.input:
 chapters=[{'id':'sample-12s','text':'这是 Slash。把资料放进来，先梳理需求，再生成文档和交互原型，最后在右侧核对结果。'}]
else:
 raw=json.loads(args.input.read_text(encoding='utf-8-sig'));chapters=raw if isinstance(raw,list) else raw.get('chapters',raw.get('scenes',[]))
 if not chapters:raise ValueError('Narration must contain a list, chapters, or scenes')
receipts=[]
for chapter in chapters:
 name=chapter['id'];text=chapter.get('text',chapter.get('narration'))
 if not text:raise ValueError('Missing narration text for '+name)
 output=args.output/(name+'.wav')
 if output.exists():raise FileExistsError('Will not overwrite '+str(output))
 t=time.perf_counter();print('generating',name,len(text),flush=True)
 with torch.inference_mode():wavs,sr=model.generate_voice_clone(text=text,language='Chinese',voice_clone_prompt=prompt,max_new_tokens=300 if args.sample else 2048)
 seconds=time.perf_counter()-t;sf.write(str(output),wavs[0],sr)
 duration=len(wavs[0])/sr
 row={'id':name,'path':str(output),'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'inferenceSeconds':seconds,'audioSeconds':duration,'realTimeFactor':seconds/duration,'text':text,'sampleRate':sr}
 receipts.append(row);print(json.dumps(row,ensure_ascii=False),flush=True)
 (args.output/'generation-result.json').write_text(json.dumps({'model':'Qwen/Qwen3-TTS-12Hz-0.6B-Base','device':'cpu','dtype':'float32','attention':'sdpa','threads':args.threads,'referenceSha256':hashlib.sha256(reference.read_bytes()).hexdigest(),'referenceSynthetic':True,'loadSeconds':loaded-started,'promptSeconds':ready-loaded,'items':receipts},ensure_ascii=False,indent=2),encoding='utf8')
