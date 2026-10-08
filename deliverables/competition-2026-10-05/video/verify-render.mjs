import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const output = (await fs.readFile('review/final-output-path.txt','utf8')).trim();
const exit = JSON.parse(await fs.readFile('review/render-final-exit.json','utf8'));
if (exit.exitCode !== 0) throw new Error('Render was not successful');
const probe = JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',output],{encoding:'utf8'}));
await fs.writeFile('review/ffprobe-final.json', JSON.stringify(probe,null,2));
const videos=probe.streams.filter(s=>s.codec_type==='video');
if(videos.length!==1 || videos[0].width!==1920 || videos[0].height!==1080 || videos[0].r_frame_rate!=='30/1' || Math.abs(Number(probe.format.duration)-180)>0.1 || probe.streams.some(s=>s.codec_type==='audio')) throw new Error('Unexpected final video format');
const dir='review/rendered-proof'; await fs.mkdir(dir,{recursive:true});
const times=[30,55,86.6,105,110,115,122,178]; const files=[];
for(const t of times){const file=path.join(dir,`frame-${t}s.png`); execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-ss',String(t),'-i',output,'-frames:v','1',file]);files.push(file);}
const inputs=files.flatMap(f=>['-i',f]); const filter=files.map((_,i)=>`[${i}:v]scale=480:270[v${i}]`).join(';')+';'+files.map((_,i)=>`[v${i}]`).join('')+'xstack=inputs=8:layout=0_0|480_0|960_0|1440_0|0_270|480_270|960_270|1440_270[out]';
execFileSync('ffmpeg',['-hide_banner','-loglevel','error',...inputs,'-filter_complex',filter,'-map','[out]','-frames:v','1',path.join(dir,'contact-sheet.png')]);
const bytes=await fs.readFile(output); const check=JSON.parse(await fs.readFile('review/check-final-v2.json','utf8'));
const delivery={output,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,duration:probe.format.duration,width:1920,height:1080,fps:'30/1',audioStreams:0,runtime:'HyperFrames 0.8.128 local render',renderExitCode:exit.exitCode,check:{ok:check.ok,browserSkipped:check.browserSkipped,layoutWarnings:check.layout.warningCount,motionSamples:check.motion.samples},proofFrames:files,visualReview:'Pending actual rendered-frame inspection',notice:'Chinese subtitles; no narration or BGM. 13 specified independent HTML interactions after 3 local feedback revisions; not backend business acceptance.',completedAt:exit.completedAt};
await fs.writeFile('review/DELIVERY.json',JSON.stringify(delivery,null,2));console.log(JSON.stringify(delivery,null,2));
