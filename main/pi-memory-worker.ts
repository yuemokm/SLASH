import path from 'node:path';
import {piPackageRoot,startAuxiliaryWorker,type AuxiliaryWorker} from './pi-auxiliary-worker.js';

/** Capture the published ExtensionAPI tools, never attach its lifecycle hooks
 * to the host AgentSession. Each transaction owns its module globals. */
export async function startPiMemoryWorker(directory:string):Promise<AuxiliaryWorker>{
 const entry=path.join(piPackageRoot('pi-memory'),'index.ts');
 const worker=await startAuxiliaryWorker(`
import fs from 'node:fs';
import path from 'node:path';
import {createInterface} from 'node:readline';
const base=process.env.PI_MEMORY_DIR;
const allowed=new Set(['memory_read','memory_write','memory_forget','memory_restore']);
const tools=new Map();let hooks=0;
const extension=await jiti.import(${JSON.stringify(entry)});
extension.default({on(){hooks++;},registerTool(tool){if(allowed.has(tool.name))tools.set(tool.name,tool);}});
if(tools.size!==4)throw Error('PI_MEMORY_API_MISMATCH');
function safe(target){
 const rel=path.relative(base,target);if(rel.startsWith('..')||path.isAbsolute(rel))throw Error('PI_MEMORY_PATH_DENIED');
 // The private store itself and package-owned children may not redirect to a
 // personal/global memory directory through a junction or symbolic link.
 for(let current=target;;current=path.dirname(current)){
  try{if(fs.lstatSync(current).isSymbolicLink())throw Error('PI_MEMORY_LINK_DENIED');}catch(error){if(error.code!=='ENOENT')throw error;}
  if(current===base)break;
 }
}
function check(){
 for(const target of [base,path.join(base,'MEMORY.md'),path.join(base,'daily'),path.join(base,'recovery')])safe(target);
 const file=path.join(base,'MEMORY.md');if(fs.existsSync(file)&&fs.statSync(file).size>2000000)throw Error('PI_MEMORY_SIZE_LIMIT');
}
async function invoke(name,args,runId){return tools.get(name).execute('slash-memory',args,undefined,undefined,{sessionManager:{getSessionId:()=>runId??'slash'}});}
emit({type:'ready',hooksDiscarded:hooks,pid:process.pid});
for await(const line of createInterface({input:process.stdin})){
 try{
  const request=JSON.parse(line);check();let value;
  if(request.action==='read')value=await invoke('memory_read',{target:'long_term'});
  else if(request.action==='write'){
   const file=path.join(base,'MEMORY.md'),size=fs.existsSync(file)?fs.statSync(file).size:0;
   if(size+Buffer.byteLength(request.content)+200>2000000)throw Error('PI_MEMORY_SIZE_LIMIT');
   value=await invoke('memory_write',{target:'long_term',mode:'append',content:request.content},request.runId);
  }else if(request.action==='forget')value=await invoke('memory_forget',{target:'long_term',match:request.match});
  else if(request.action==='inspectRecovery'||request.action==='restore'){
   if(!/^[A-Za-z0-9_-]{1,160}$/.test(request.recoveryId))throw Error('PI_MEMORY_RECOVERY_INVALID');
   const file=path.join(base,'recovery',request.recoveryId+'.json');safe(file);
   if(!fs.existsSync(file)||fs.statSync(file).size>2000000)throw Error('PI_MEMORY_RECOVERY_UNAVAILABLE');
   const record=JSON.parse(fs.readFileSync(file,'utf8'));
   if(record.id!==request.recoveryId||record.target!=='long_term'||!Array.isArray(record.removedContent))throw Error('PI_MEMORY_RECOVERY_INVALID');
   if(request.action==='inspectRecovery')value={content:record.removedContent,restoredAt:record.restoredAt};
   else {
    const target=path.join(base,'MEMORY.md'),existing=fs.existsSync(target)?fs.readFileSync(target,'utf8'):'';
    const missing=record.removedContent.filter(entry=>!existing.includes(entry));
    if(Buffer.byteLength(existing)+Buffer.byteLength(missing.join('\\n\\n'))+200>2000000)throw Error('PI_MEMORY_SIZE_LIMIT');
    value=await invoke('memory_restore',{recoveryId:request.recoveryId});
   }
  }else throw Error('PI_MEMORY_ACTION_DENIED');
  if(value?.isError)throw Error('PI_MEMORY_TOOL_FAILED');
  // Never echo upstream write/forget previews: they can include other entries
  // whose original source permission has since been revoked.
  emit({type:'result',value:request.action==='read'||request.action==='inspectRecovery'?value:{details:{removed:value.details?.removed,recoveryId:value.details?.recoveryId,restored:value.details?.restored,restoredAt:value.details?.restoredAt}}});
 }catch(error){emit({type:'error',message:String(error.message)});}
}
`,{PI_MEMORY_DIR:directory,PI_MEMORY_QMD_UPDATE:'off',PI_MEMORY_NO_SEARCH:'1',PI_MEMORY_EXIT_SUMMARY:'0',PI_MEMORY_SUMMARIZE_TRANSITIONS:'0',XDG_CONFIG_HOME:path.join(directory,'qmd-config'),XDG_CACHE_HOME:path.join(directory,'qmd-cache')});
 return worker;
}
