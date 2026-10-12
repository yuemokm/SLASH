import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import ExcelJS from 'exceljs';
import {Service} from '../main/service.js';
import {Store} from '../main/store.js';
import {extractOfficeText} from '../main/office-extraction.js';
import {requestSchema} from '../shared/types.js';
import {deriveFirstDraft} from '../scripts/production-agent-trial.mjs';
import {prepareProductionSourceHandoff,assertPreparationSeparatedFromTask} from '../scripts/quality-evaluation-source-handoff.mjs';
import {startProductionTrial} from '../scripts/production-agent-trial.mjs';
import {normalizeProductionPreparedPrompt,verifyProductionSourcePreparation} from '../main/production-agent-source-preparation.js';
import {productionPreparedSourcePromptBlock} from '../shared/production-agent-source-preparation.js';
import {evaluationHash} from '../main/quality-evaluation.js';
const hash=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
async function fixture(t:test.TestContext,execute?:(o:any)=>Promise<void>){
 const parent=path.join(os.tmpdir(),'slash-evaluation-preparation');await fs.mkdir(parent,{recursive:true});
 const dir=await fs.mkdtemp(path.join(parent,'handoff-')),repo=path.join(dir,'repo'),root=path.join(repo,'.test-data','evaluation'),caseDir=path.join(root,'cases','QE05');await fs.mkdir(caseDir,{recursive:true});await fs.mkdir(path.join(repo,'dist','main'),{recursive:true});await fs.mkdir(path.join(repo,'scripts'),{recursive:true});await fs.writeFile(path.join(repo,'dist','main','fixture.js'),'// isolated local fixture runtime');await fs.copyFile('scripts/quality-evaluation-source-preparation.mjs',path.join(repo,'scripts','quality-evaluation-source-preparation.mjs'));const store=new Store(path.join(caseDir,'profile'));
 const service=new Service(store,()=> 'fixture-key',()=>{},async o=>{if(!execute)throw Error('MODEL_CALL_FORBIDDEN');return{messages:[{role:'assistant',stopReason:'stop'}],abort:async()=>{},dispose:()=>{},prompt:async()=>{await execute(o);o.delta('真实宿主Run的本机确定性夹具，不是付费模型成果。');}} as never;});
 t.after(async()=>{service.dispose();await Promise.allSettled([...(service as any).agentIndex.queues.values()]);store.close();await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:30});});
 await service.workspace(path.join(dir,'workspace'));service.setPermission('workspace_read','allow');service.setPermission('artifact_write','allow');service.setPermission('process_execute','deny');service.setPermission('web_read','deny');service.setPermission('external_action','deny');
 const originals=path.join(dir,'originals'),texts=path.join(dir,'texts'),user=path.join(dir,'authorized-originals');for(const p of [originals,texts,user])await fs.mkdir(p);
 const sources:any[]=[];
 for(const [id,name] of [['fields','fields.xlsx'],['other','other.xlsx'],['policy','policy.txt']]){
  let bytes:Buffer;
  if(name.endsWith('.xlsx')){const w=new ExcelJS.Workbook();w.addWorksheet('01正式').addRow(['字段','正式值']);const s=w.addWorksheet('03机会门店');s.addRow(['字段','规则']);s.addRow(['机会门店编码','JHWD+10位顺序码']);bytes=Buffer.from(await w.xlsx.writeBuffer());}
  else bytes=Buffer.from('本轮完整授权资料，保持原件。');
  const sourcePath=path.join(user,name),copyPath=path.join(originals,name),textPath=path.join(texts,name+'.txt');await fs.writeFile(sourcePath,bytes);await fs.writeFile(copyPath,bytes);
  const text=name.endsWith('.xlsx')?await extractOfficeText(bytes,name):bytes.toString();await fs.writeFile(textPath,text);
  sources.push({id,name,sourcePath,copyPath,textPath,sourceSha256Before:hash(bytes),sourceSha256After:hash(bytes),copySha256:hash(bytes),textSha256:hash(text)});
 }
 const original=await service.mount(originals,false),source=await service.mount(texts,false);let calls=0,applyCalls=0;
 const call=async(input:any)=>{calls++;const p=requestSchema.parse(input);switch(p.type){case 'state':return structuredClone(service.state);case 'copyForProcessing':return service.copyForProcessing(p);case 'processProcessingCopy':return service.processProcessingCopy(p.id,p.operation);case 'apply':applyCalls++;return service.apply(p.id);case 'conversation':return service.conversation(p.title);case 'send':return service.send(p.id,p.text,p.mode,p.permissionMode,p.modelEntryId,undefined,undefined,p.taskType,undefined,p.workflow);default:throw Error('UNEXPECTED_OFFICIAL_CALL');}};
 const runtimeHashes={'main/fixture.js':await evaluationHash(path.join(repo,'dist','main','fixture.js'))},manifest={originals,texts,sources,runtimeVersions:runtimeHashes,sourcePreparation:{strategy:'official_registered_xlsx_v1',helperSha256:await evaluationHash(path.join(repo,'scripts','quality-evaluation-source-preparation.mjs'))}};await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest));const model={id:'fixture-model',provider:'openai',modelId:'fixture-model-id',protocol:'openai-completions',baseUrl:'https://fixture.invalid/v1',hasKey:true,contextWindow:65536,maxTokens:12000};service.state.models=[model as any];service.state.defaultModelId=model.id;const output=service.state.mounts.find(m=>m.name==='成果')!;
 const input={repo,call,manifest,caseDir,caseId:'QE05',sources,sourceMountId:source.id,originalMountId:original.id,outputMountId:output.id};
 return{dir,repo,root,caseDir,runtimeHashes,model,output,service,store,call,input,manifest,sources,source,original,getCalls:()=>calls,getApplyCalls:()=>applyCalls};
}

const startInput=(f:any,reference?:any)=>({repo:f.repo,testDir:f.root,caseId:'QE05',call:f.call,modelEntryId:f.model.id,runtimeHashes:f.runtimeHashes,sourcePreparationBinding:reference});
const readBinding=async(reference:any)=>JSON.parse(await fs.readFile(reference.path,'utf8'));
test('actual runner host entry prepares every source, wx binds before start, then true Service.send keeps task ownership separate',async t=>{
 const order:string[]=[];const f=await fixture(t,async o=>{const target={mountId:o.mounts.find((m:any)=>m.name==='成果').id,path:'QE05/actual-run.md'};await o.log('write_draft',target,async()=>{await o.beforeArtifactWrite(target);o.draft(await o.files.draft(target.mountId,target.path,'独立本机确定性成果，不是付费模型',o.runId));});});
 const manifestBefore=await fs.readFile(path.join(f.root,'manifest.json'));
 await assert.rejects(startProductionTrial(startInput(f)));await assert.rejects(fs.access(path.join(f.caseDir,'production-start.json')),/ENOENT/);
 const call=async(input:any)=>{if(input.type!=='state')order.push(input.type);return f.call(input);};const prepared=await prepareProductionSourceHandoff({...f.input,call}),binding=await readBinding(prepared.bindingEvidence);order.push('binding-wx');
 assert.equal(f.service.state.runs.length,0);assert.equal(f.service.state.changes.length,2);assert.equal(binding.sources.find((s:any)=>s.id==='policy').mountId,f.source.id);assert.equal(binding.preparationChanges.length,2);assert.equal(binding.preparationChanges.every((c:any)=>c.runId==='user-processing'),true);
 const start=await startProductionTrial({...startInput(f,prepared.bindingEvidence),call});order.push('start');const body=JSON.parse(await fs.readFile(start.path,'utf8'));assert.equal(body.sourcePreparationBinding.sha256,prepared.bindingEvidence.sha256);
 const source=prepared.sources[0];const id=await call({type:'conversation',title:'isolated fixture'}),runId=await call({type:'send',id,text:'本机夹具：真实来源登记路径',mode:'build',permissionMode:'standard',modelEntryId:f.model.id,taskType:'writing',workflow:{kind:'prd',sources:[{mountId:source.mountId,path:source.path,contentHash:source.contentHash}]}});
 let run:any;for(let i=0;i<1000;i++){run=f.service.state.runs.find(r=>r.id===runId);if(['succeeded','failed','interrupted','cancelled'].includes(run?.status))break;await new Promise(r=>setTimeout(r,10));}assert.equal(run.status,'succeeded',run.error);
 const outputs=f.service.state.changes.filter(c=>c.runId===runId);assert.equal(outputs.length,1);const draft=outputs[0];await call({type:'apply',id:draft.id});
 const saved=[{path:path.join(f.output.path,draft.path),sha256:hash(await fs.readFile(path.join(f.output.path,draft.path)))}];await assertPreparationSeparatedFromTask({caseDir:f.caseDir,manifest:f.manifest,reference:prepared.bindingEvidence,state:f.service.state,runId,appliedChangeIds:[draft.id],savedOutputs:saved});
 const view=await f.service.getTaskAcceptance(runId);assert.deepEqual(view!.contract.outputs.map(o=>o.target.path),['QE05/actual-run.md']);const first=deriveFirstDraft(run,f.service.state.changes,[]);assert.equal(first.changeId,draft.id);assert.equal(first.createdAt,draft.createdAt);assert.equal(first.ms,Date.parse(draft.createdAt)-Date.parse(run.startedAt));assert(!binding.preparationChanges.some((c:any)=>c.id===first.changeId));
 assert.equal(run.workflow.receipts[0].contentStatus,'spreadsheet_catalog');assert.equal(run.workflow.receipts[0].includedCharacters,0);assert.equal(run.sourceReads[0].includedCharacters,0);assert.deepEqual(await fs.readFile(path.join(f.root,'manifest.json')),manifestBefore);
 assert(order.lastIndexOf('apply')>order.indexOf('send'));assert(order.indexOf('binding-wx')>order.indexOf('processProcessingCopy'));assert(order.indexOf('binding-wx')<order.indexOf('start'));assert(order.indexOf('start')<order.indexOf('send'));
 const wx=await fs.readFile(prepared.bindingEvidence.path);await assert.rejects(prepareProductionSourceHandoff(f.input));assert.deepEqual(await fs.readFile(prepared.bindingEvidence.path),wx);
 const evidence={realService:true,realModel:false,realElectronIPC:false,order,sourceKinds:binding.sources.map((s:any)=>({id:s.id,registeredProcessing:binding.preparationChanges.some((c:any)=>c.path===s.path&&c.mountId===s.mountId)})),preparationChanges:binding.preparationChanges,run:{id:runId,status:run.status,startedAt:run.startedAt},actualOutputs:view!.contract.outputs,firstDraft:first,sourceReads:run.sourceReads,manifestUnchanged:true};await fs.mkdir(path.resolve('.test-data'),{recursive:true});await fs.writeFile(path.resolve('.test-data','source-handoff-real-run-'+runId+'.json'),JSON.stringify(evidence,null,2),{flag:'wx'});
});
test('prior Run rejects actual hook without binding/start, permission expansion or model call',async t=>{
 const f=await fixture(t);f.service.state.runs.push({id:'old-run',status:'succeeded'} as any);await assert.rejects(prepareProductionSourceHandoff(f.input),/RUN_ALREADY_EXISTS/);assert.equal(f.service.state.changes.length,0);await assert.rejects(fs.access(path.join(f.caseDir,'source-preparation-binding.json')),/ENOENT/);await assert.rejects(startProductionTrial(startInput(f)));assert.equal(f.original.write,false);
});
test('partial official processing failure retains applied evidence but never binds or starts',async t=>{
 const f=await fixture(t);const source=f.sources[1];await fs.writeFile(source.textPath,'wrong second extracted text');source.textSha256=hash('wrong second extracted text');await fs.writeFile(path.join(f.root,'manifest.json'),JSON.stringify(f.manifest));await assert.rejects(prepareProductionSourceHandoff(f.input),/EXTRACTION_IDENTITY/);const failure=JSON.parse(await fs.readFile(path.join(f.caseDir,'host-preparation.failed.json'),'utf8'));assert.equal(failure.partialRecordsAreNotComplete,true);assert.equal(f.service.state.changes.filter(c=>c.status==='applied').length,1);assert.equal(f.service.state.runs.length,0);await assert.rejects(fs.access(path.join(f.caseDir,'source-preparation-binding.json')),/ENOENT/);await assert.rejects(startProductionTrial(startInput(f)));
});
test('binding bytes, actual owner, actual source bytes and ordering are independently checked before start',async t=>{
 const f=await fixture(t),prepared=await prepareProductionSourceHandoff(f.input),binding=await readBinding(prepared.bindingEvidence);const originalBytes=await fs.readFile(prepared.bindingEvidence.path);await fs.appendFile(prepared.bindingEvidence.path,' ');await assert.rejects(startProductionTrial(startInput(f,prepared.bindingEvidence)),/BINDING_CHANGED/);await fs.writeFile(prepared.bindingEvidence.path,originalBytes);
 const actual=f.service.state.changes.find(c=>c.id===binding.preparationChanges[0].id)!;actual.runId='invented-model-run';await assert.rejects(startProductionTrial(startInput(f,prepared.bindingEvidence)),/HOST_CHANGE_UNBOUND/);actual.runId='user-processing';
 const source=binding.sources[0],mount=f.service.state.mounts.find(m=>m.id===source.mountId)!;const file=path.join(mount.path,source.path),bytes=await fs.readFile(file);await fs.appendFile(file,'changed');await assert.rejects(startProductionTrial(startInput(f,prepared.bindingEvidence)),/ACTUAL_BYTES_CHANGED/);await fs.writeFile(file,bytes);
 await assert.rejects(verifyProductionSourcePreparation({caseDir:f.caseDir,manifest:f.manifest,reference:prepared.bindingEvidence,state:f.service.state,startAt:'invalid-time'}),/TIME_UNBOUND/);await assert.rejects(verifyProductionSourcePreparation({caseDir:f.caseDir,manifest:f.manifest,reference:prepared.bindingEvidence,state:f.service.state,startAt:new Date(Date.parse(binding.frozenAt)-1).toISOString()}),/TIME_UNBOUND/);
 await assert.rejects(fs.access(path.join(f.caseDir,'production-start.json')),/ENOENT/);
});
test('true preparation owner blocks contamination even when callers label it as a task artifact',async t=>{
 const f=await fixture(t),prepared=await prepareProductionSourceHandoff(f.input),binding=await readBinding(prepared.bindingEvidence);f.service.state.runs.push({id:'fixture-task'} as any);const c=binding.preparationChanges[0],mount=f.service.state.mounts.find(m=>m.id===c.mountId)!;const common={caseDir:f.caseDir,manifest:f.manifest,reference:prepared.bindingEvidence,state:f.service.state,runId:'fixture-task'};
 await assert.rejects(assertPreparationSeparatedFromTask({...common,appliedChangeIds:[c.id],savedOutputs:[]}),/COUNTED_AS_TASK_ARTIFACT/);await assert.rejects(assertPreparationSeparatedFromTask({...common,appliedChangeIds:[],savedOutputs:[{path:path.join(mount.path,c.path),countsAsArtifact:false}]}),/COUNTED_AS_TASK_ARTIFACT/);assert.equal(f.service.state.changes.find(ch=>ch.id===c.id)!.runId,'user-processing');assert.equal(deriveFirstDraft({id:'fixture-task',startedAt:new Date().toISOString()},f.service.state.changes,[]),undefined);
});
test('prompt normalization changes exact generated positions only, keeps business text/hash and rejects changed paths',async t=>{
 const f=await fixture(t),prepared=await prepareProductionSourceHandoff(f.input),binding=await readBinding(prepared.bindingEvidence),ids=binding.sources.map((s:any)=>s.id),scope='QE05/ 内直接保存 md、txt 或自包含 HTML；文件名自定，对照允许放在PRD独立附录',base='必须保留原始规则';
 const variant={sourcePreparationBindingSha256:prepared.bindingEvidence.sha256,preparedSourceIds:ids,outputMountId:binding.outputMountId,outputScope:scope},tail='业务正文重复同一地址 '+binding.sources[0].path+'；规则不改';const prompt=base+productionPreparedSourcePromptBlock(binding,ids,binding.outputMountId,scope)+tail;
 const normalize=(p:string,b=binding,v=variant)=>normalizeProductionPreparedPrompt({prompt:p,basePrompt:base,binding:b,variant:v,selectedIds:ids});const original=normalize(prompt);assert(original.endsWith(tail));assert.notEqual(hash(original),hash(normalize(prompt+'改变业务文字')));
 const other=structuredClone(binding);other.outputMountId='different-output';for(const s of other.sources){s.mountId='different-'+s.id;s.path='actual-other-'+s.id;}const v={...variant,outputMountId:other.outputMountId},p=base+productionPreparedSourcePromptBlock(other,ids,other.outputMountId,scope)+tail;assert.equal(normalize(p,other,v),original);
 await assert.rejects(async()=>normalize(prompt.replace(JSON.stringify(binding.sources[0].path),JSON.stringify('forged-position'))),/PROMPT_UNBOUND/);await assert.rejects(async()=>normalize(prompt,binding,{...variant,preparedSourceIds:ids.slice(1)}),/PROMPT_UNBOUND/);
});
