import fs from 'node:fs/promises';
import path from 'node:path';
import {Service} from '../main/service.js';
import {Store} from '../main/store.js';
import type {RuntimeOptions} from '../main/agent.js';
import {runControlledProcess} from '../main/capabilities.js';

const [dir,tool,window]=process.argv.slice(2),counter=path.join(dir,'counter.txt');
const store=new Store(path.join(dir,'profile'));
let copyId='';
const service=new Service(store,()=> 'fixture-only',()=>{},async(options:RuntimeOptions)=>({
 messages:[{role:'assistant',stopReason:'stop'}],abort:async()=>{},dispose:()=>{},
 prompt:async()=>{
  const command=`[IO.File]::AppendAllText('${counter.replace(/'/g,"''")}', "effect\`n")`;
  if(tool==='powershell')await options.log(tool,{command,cwd:service.state.root},()=>options.executePowerShell!({command,cwd:service.state.root},signal=>runControlledProcess('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],service.state.root,signal)));
  else if(tool==='run_process')await options.log(tool,{},()=>options.runProcess!({executable:process.execPath,args:['-e',"require('node:fs').appendFileSync(process.argv[1],'effect\\n')",counter],cwd:service.state.root}));
  else await options.log(tool,{id:copyId,operation:'script'},()=>options.processProcessingCopy!(copyId,'script','return "isolated result"'));
 },
} as never),{fetchModelMetadata:async()=>{throw Error('OFFLINE_CRASH_FIXTURE');},runReferenceScript:async()=>{
 await fs.appendFile(counter,'effect\n');
 if(window==='after_effect_modified_copy'){const snapshot=await service.readProcessingCopy(copyId),mount=service.state.mounts.find(item=>item.id===snapshot.copy.copy.mountId)!;await fs.writeFile(path.join(mount.path,snapshot.copy.copy.path),'modified by isolated injected host');process.exit(32);}
 return 'isolated result';
}});
await service.workspace(path.join(dir,'project'));
service.setPermission('workspace_read','allow');service.setPermission('artifact_write','allow');service.setPermission('process_execute','allow');
if(tool==='process_processing_copy'){
 const source=service.state.mounts.find(item=>item.name==='资源')!;
 await fs.writeFile(path.join(source.path,'source.txt'),'original');
 const copy=await service.copyForProcessing({mountId:source.id,path:'source.txt'});copyId=copy.id;
}
const originalMark=(service as any).markRecoveryDispatch.bind(service);
(service as any).markRecoveryDispatch=(...args:unknown[])=>{const current=(service as any).recoveryAttempt.getStore();if(current?.tool===tool&&window==='before_dispatch')process.exit(31);return originalMark(...args);};
const originalFinish=store.finishOperation.bind(store);
store.finishOperation=(id,runId,name,state,result)=>{
 if(name===tool&&state==='succeeded'&&window==='after_effect_before_receipt')process.exit(32);
 originalFinish(id,runId,name,state,result);
 if(name===tool&&state==='succeeded'&&window==='after_receipt')process.exit(33);
};
await service.send(service.conversation(),'isolated crash task');
setTimeout(()=>process.exit(90),20000);
