import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve,basename} from 'node:path';
import {canUseWhisperWebGpu,loadWhisperModel,transcribe,toCaptions,disposeWhisperModel} from '@remotion/whisper-webgpu';

const support=await canUseWhisperWebGpu();
if(!support.supported) throw new Error(support.detailedReason);
const files=process.argv.slice(2);
await mkdir('captions',{recursive:true});
await loadWhisperModel({model:'small',onProgress:p=>console.log('load',p.status,p.progress)});
try {
  for(const file of files) {
    const audio=spawnSync('ffmpeg',['-v','error','-i',resolve(file),'-f','f32le','-ac','1','-ar','16000','pipe:1'],{maxBuffer:60*1024*1024});
    if(audio.status!==0) throw new Error(audio.stderr.toString());
    const channelWaveform=new Float32Array(audio.stdout.buffer.slice(audio.stdout.byteOffset,audio.stdout.byteOffset+audio.stdout.byteLength));
    const output=await transcribe({channelWaveform,model:'small',language:'chinese',signal:AbortSignal.timeout(240000)});
    await writeFile('captions/'+basename(file)+'.raw.json',JSON.stringify(output,null,2));
    const {captions}=toCaptions({whisperWebGpuOutput:output});
    await writeFile('captions/'+basename(file)+'.json',JSON.stringify(captions,null,2));
    console.log('DONE',file,output.text);
  }
} finally {await disposeWhisperModel({model:'small'});}
