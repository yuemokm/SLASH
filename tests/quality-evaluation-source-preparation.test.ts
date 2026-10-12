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
import {prepareRegisteredEvaluationSources} from '../scripts/quality-evaluation-source-preparation.mjs';
const hash=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
async function fixture(t:test.TestContext,execute?:(o:any)=>Promise<void>){
 const parent=path.join(os.tmpdir(),'slash-evaluation-preparation');await fs.mkdir(parent,{recursive:true});
 const dir=await fs.mkdtemp(path.join(parent,'case-')),store=new Store(path.join(dir,'profile'));
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
 const call=async(input:any)=>{calls++;const p=requestSchema.parse(input);switch(p.type){case 'state':return structuredClone(service.state);case 'copyForProcessing':return service.copyForProcessing(p);case 'processProcessingCopy':return service.processProcessingCopy(p.id,p.operation);case 'apply':applyCalls++;return service.apply(p.id);default:throw Error('UNEXPECTED_OFFICIAL_CALL');}};
 const caseDir=path.join(dir,'receipt');await fs.mkdir(caseDir);const manifest={originals,texts,sources};
 const input={call,manifest,caseDir,sources,sourceMountId:source.id,originalMountId:original.id};
 return{dir,service,store,call,input,manifest,sources,source,original,getCalls:()=>calls,getApplyCalls:()=>applyCalls};
}

test('real Service registers every authorized XLSX using official copy/process/apply, originals and grants remain exact',async t=>{
 const f=await fixture(t),before=JSON.stringify(f.service.state.permissions),result=await prepareRegisteredEvaluationSources(f.input);
 const receipt=JSON.parse(await fs.readFile(result.receipt.path,'utf8'));assert.equal(receipt.status,'prepared');assert.equal(result.receipt.sha256,hash(await fs.readFile(result.receipt.path)));assert.equal(receipt.records.length,2);assert.deepEqual(result.sources.map(s=>s.id),['fields','other','policy']);
 assert.equal(f.getApplyCalls(),2);assert.equal(f.service.state.runs.length,0);assert.equal(receipt.modelSourceReadsClaimed,false);assert.equal(receipt.modelCalls,0);assert.equal(receipt.countsAsArtifact,false);assert.equal(receipt.countsAsFirstDraft,false);assert.equal(JSON.stringify(f.service.state.permissions),before);assert.equal(f.original.write,false);assert.equal(f.source.write,false);assert.equal(f.service.state.changes.length,2);
 for(const r of receipt.records){assert.equal(r.status,'registered_applied_verified');assert.equal(r.actualHashes.originalAfter,r.original.hashBefore);assert.equal(r.actualHashes.userOriginalAfter,r.original.hashBefore);assert.equal(r.actualHashes.output,f.sources.find(s=>s.id===r.sourceId).textSha256);const applied=f.service.state.changes.find(c=>c.id===r.processingReceipt.changeId)!;assert.equal(applied.status,'applied');assert.equal(applied.runId,'user-processing');assert.match(applied.path,/提取文本/);}
 assert.equal(result.sources.find(s=>s.id==='policy').mountId,f.source.id);
});

test('already applied reuse has verified old and requested copy bytes; no second apply or model read is fabricated',async t=>{
 const f=await fixture(t),first=await prepareRegisteredEvaluationSources(f.input),caseDir=path.join(f.dir,'reuse');await fs.mkdir(caseDir);
 const second=await prepareRegisteredEvaluationSources({...f.input,caseDir}),a=JSON.parse(await fs.readFile(first.receipt.path,'utf8')),b=JSON.parse(await fs.readFile(second.receipt.path,'utf8'));
 assert.equal(f.getApplyCalls(),2);assert.equal(f.service.state.changes.length,2);assert.equal(f.service.state.runs.length,0);
 for(let i=0;i<2;i++){assert.equal(b.records[i].processingReceipt.status,'applied');assert.equal(b.records[i].processingReceipt.changeId,a.records[i].processingReceipt.changeId);assert.equal(b.records[i].processingReceipt.reuse.requestedCopyId,b.records[i].copyReceipt.id);assert.notEqual(b.records[i].processingReceipt.copyId,b.records[i].copyReceipt.id);assert.equal(b.records[i].actualHashes.requestedCopy,b.records[i].actualHashes.resultCopy);assert.equal(b.records[i].appliedByHelper,false);}
 const completed=await fs.readFile(first.receipt.path);await assert.rejects(prepareRegisteredEvaluationSources(f.input),/ALREADY_ATTEMPTED/);assert.deepEqual(await fs.readFile(first.receipt.path),completed);
});

test('duplicate identities cannot conceal an omitted authorized workbook; validation performs zero official calls',async t=>{
 const f=await fixture(t);await assert.rejects(prepareRegisteredEvaluationSources({...f.input,sources:[f.sources[0],f.sources[0],f.sources[2]]}),/INCOMPLETE_AUTHORIZED_SOURCES/);assert.equal(f.getCalls(),0);assert.equal(f.service.state.changes.length,0);await assert.rejects(fs.access(path.join(f.input.caseDir,'host-preparation.json')),/ENOENT/);
});

test('any prior terminal Run rejects preparation, preserving the old attempt and no source registration',async t=>{
 const f=await fixture(t);f.service.state.runs.push({id:'old-finished',status:'succeeded'} as any);
 await assert.rejects(prepareRegisteredEvaluationSources(f.input),/RUN_ALREADY_EXISTS/);assert.equal(f.service.state.changes.length,0);assert.equal(f.getApplyCalls(),0);assert.equal(f.getCalls(),1);
});

test('read-only original or processing permission is never expanded; missing write grant rejects without copies',async t=>{
 const f=await fixture(t);f.service.setPermission('artifact_write','deny');const before=JSON.stringify(f.service.state.permissions);
 await assert.rejects(prepareRegisteredEvaluationSources(f.input),/PERMISSION_DENIED/);assert.equal(JSON.stringify(f.service.state.permissions),before);assert.equal(f.service.state.changes.length,0);assert.equal(f.original.write,false);assert.equal(f.getApplyCalls(),0);
});

test('a read-only process mount is not silently made writable to complete preparation',async t=>{
 const f=await fixture(t),process=f.service.state.mounts.find(m=>m.name==='过程文件')!;process.write=false;
 await assert.rejects(prepareRegisteredEvaluationSources(f.input),/PROCESSING_TARGET_UNAVAILABLE/);assert.equal(process.write,false);assert.equal(f.original.write,false);assert.equal(f.getApplyCalls(),0);assert.equal(f.service.state.changes.length,0);
});

test('mismatched actual extraction stays failed with the real pending receipt and no completed registration claim',async t=>{
 const f=await fixture(t);const s=f.sources[0];await fs.writeFile(s.textPath,'tampered manifest extraction');s.textSha256=hash('tampered manifest extraction');
 await assert.rejects(prepareRegisteredEvaluationSources(f.input),/EXTRACTION_IDENTITY/);const r=JSON.parse(await fs.readFile(path.join(f.input.caseDir,'host-preparation.failed.json'),'utf8'));assert.equal(r.status,'failed');assert.equal(r.partialRecordsAreNotComplete,true);assert.ok(r.records[0].processingReceipt.changeId);assert.equal(f.service.state.changes[0].status,'pending');assert.equal(f.getApplyCalls(),0);await assert.rejects(fs.access(path.join(f.input.caseDir,'host-preparation.json')),/ENOENT/);
});

test('actual original mutation after copy rejects before extraction/apply, keeping evidence of the real copy',async t=>{
 const f=await fixture(t);let copied=false;const call=async(input:any)=>{const result=await f.call(input);if(input.type==='copyForProcessing'){copied=true;await fs.appendFile(f.sources[0].copyPath,'changed');}return result;};
 await assert.rejects(prepareRegisteredEvaluationSources({...f.input,call}),/SOURCE_CHANGED/);assert.equal(copied,true);assert.equal(f.service.state.changes.length,0);assert.equal(f.getApplyCalls(),0);const r=JSON.parse(await fs.readFile(path.join(f.input.caseDir,'host-preparation.failed.json'),'utf8'));assert.ok(r.records[0].copyReceipt.id);assert.equal(r.status,'failed');
});

test('mid-call revocation rejects before apply; real pending output remains without granting old authorization',async t=>{
 const f=await fixture(t);const call=async(input:any)=>{const result=await f.call(input);if(input.type==='processProcessingCopy')f.service.setPermission('artifact_write','deny');return result;};
 await assert.rejects(prepareRegisteredEvaluationSources({...f.input,call}),/SCOPE_CHANGED/);assert.equal(f.getApplyCalls(),0);assert.equal(f.service.state.permissions.artifact_write,'deny');assert.equal(f.service.state.changes[0].status,'pending');const r=JSON.parse(await fs.readFile(path.join(f.input.caseDir,'host-preparation.failed.json'),'utf8'));assert.equal(r.status,'failed');
});

test('a later workbook failure preserves earlier real applied chain but never publishes partial preparation as complete',async t=>{
 const f=await fixture(t);const source=f.sources[1];await fs.writeFile(source.textPath,'wrong second source extraction');source.textSha256=hash('wrong second source extraction');
 await assert.rejects(prepareRegisteredEvaluationSources(f.input),/EXTRACTION_IDENTITY/);const failed=JSON.parse(await fs.readFile(path.join(f.input.caseDir,'host-preparation.failed.json'),'utf8'));assert.equal(failed.status,'failed');assert.equal(failed.records[0].status,'registered_applied_verified');assert.equal(failed.records[1].status,'preparing');assert.equal(failed.partialRecordsAreNotComplete,true);assert.equal(f.getApplyCalls(),1);assert.equal(f.service.state.changes.filter(c=>c.status==='applied').length,1);await assert.rejects(fs.access(path.join(f.input.caseDir,'host-preparation.json')),/ENOENT/);
});

test('real stopped Run uses registered catalog; preparation Changes never count as Run outputs or first draft time',async t=>{
 let artifact:any;const f=await fixture(t,async o=>{artifact={mountId:o.mounts.find((m:any)=>m.name==='成果').id,path:'actual-run.md'};await o.log('write_draft',artifact,async()=>{await o.beforeArtifactWrite(artifact);o.draft(await o.files.draft(artifact.mountId,artifact.path,'独立模型成果夹具',o.runId));});});
 const prepared=await prepareRegisteredEvaluationSources(f.input),preparationIds=f.service.state.changes.map(c=>c.id),source=prepared.sources.find(s=>s.id==='fields');
 const runId=await f.service.send(f.service.conversation(),'读取已登记资料并保存本机夹具成果','build','standard',undefined,undefined,undefined,'writing',undefined,{kind:'prd',sources:[{mountId:source.mountId,path:source.path,contentHash:source.contentHash}]});
 let run:any;for(let i=0;i<1000;i++){run=f.service.state.runs.find(r=>r.id===runId);if(['succeeded','failed','interrupted','cancelled'].includes(run?.status))break;await new Promise(r=>setTimeout(r,10));}
 assert.equal(run.status,'succeeded',run.error);const actual=f.service.state.changes.filter(c=>c.runId===runId);assert.equal(actual.length,1);assert.equal(actual[0].path,'actual-run.md');assert(!preparationIds.includes(actual[0].id));const view=await f.service.getTaskAcceptance(runId);assert.equal(view!.contract.outputs.length,1);assert.equal(view!.contract.outputs[0].target.path,'actual-run.md');
 assert.equal(run.workflow.receipts[0].contentStatus,'spreadsheet_catalog');assert.equal(run.workflow.receipts[0].includedCharacters,0);assert(run.workflow.receipts[0].characters>0);const measured=deriveFirstDraft(run,f.service.state.changes,[]);assert.equal(measured!.changeId,actual[0].id);assert.equal(measured!.createdAt,actual[0].createdAt);assert.equal(measured!.ms,Date.parse(actual[0].createdAt)-Date.parse(run.startedAt));assert(preparationIds.every(id=>Date.parse(f.service.state.changes.find(c=>c.id===id)!.createdAt)<Date.parse(run.startedAt)));assert.equal(run.sourceReads.filter((s:any)=>s.contentStatus==='spreadsheet_catalog')[0].includedCharacters,0);
 const evidenceDir=path.resolve('.test-data');await fs.mkdir(evidenceDir,{recursive:true});const evidencePath=path.join(evidenceDir,'registered-source-run-'+runId+'.json');
 await fs.writeFile(evidencePath,JSON.stringify({realServiceRun:true,realModelGeneration:false,realElectronIPC:false,run:{id:run.id,status:run.status,startedAt:run.startedAt,finishedAt:run.finishedAt,generationStartedAt:run.generationStartedAt,generationDurationMs:run.generationDurationMs},preparationChanges:f.service.state.changes.filter(c=>preparationIds.includes(c.id)).map(c=>({id:c.id,runId:c.runId,path:c.path,createdAt:c.createdAt,status:c.status,contentHash:hash(c.content)})),actualRunOutputs:view!.contract.outputs,firstDraft:measured,workflowReceipts:run.workflow.receipts,notice:'实际Service.send运行，本机确定性runtime；没有付费模型或真人验收。catalog元数据正文0字符，准备Changes不混计该Run成果/首稿。'},null,2),{flag:'wx'});console.log('registered source actual Run evidence: '+evidencePath);
});
