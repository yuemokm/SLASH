import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import mammoth from 'mammoth';
import {Document,Packer,Paragraph} from 'docx';
import ExcelJS from 'exceljs';
import {Service} from '../main/service.js';
import {Store} from '../main/store.js';
import {createRuntime,type RuntimeOptions} from '../main/agent.js';
import {OFFICE_TEXT_PARSER_VERSION} from '../main/office-extraction.js';
import {processingReuseIndexKey} from '../main/processing-reuse.js';
import {productRecordsWorkspaceIdentity} from '../main/product-records.js';
import type {ProcessingResult} from '../shared/types.js';

const docx=(text='唯一来源事实')=>Packer.toBuffer(new Document({sections:[{children:[new Paragraph(text)]}]}));
async function fixture(t:test.TestContext,execute?:(o:RuntimeOptions)=>Promise<void>){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-processing-reuse-')),store=new Store(path.join(dir,'data'));
 const service=new Service(store,()=> 'fixture-key',()=>{},async o=>({messages:[{role:'assistant',stopReason:'stop'}],abort:async()=>{},dispose:()=>{},prompt:async()=>{await execute?.(o);o.delta('本地工具夹具完成');}}) as never),instances=[service];
 t.after(async()=>{for(const s of instances){s.dispose();await Promise.allSettled([...(s as any).agentIndex.queues.values()]);}store.close();await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:30});});
 await service.workspace(path.join(dir,'project'));service.setPermission('workspace_read','allow');service.setPermission('artifact_write','allow');
 const resources=service.state.mounts.find(m=>m.name==='资源')!,processMount=service.state.mounts.find(m=>m.name==='过程文件')!,original={mountId:resources.id,path:'参考资料/template.docx'};
 await fs.writeFile(path.join(resources.path,original.path),await docx());
 const copy=await service.copyForProcessing(original),result=await service.processProcessingCopy(copy.id,'extract_text');
 return{dir,store,service,instances,resources,processMount,original,copy,result};
}
async function applied(f:Awaited<ReturnType<typeof fixture>>){await f.service.apply(f.result.changeId);return f.service.state.changes.length;}
async function terminal(service:Service,id:string){for(let i=0;i<500;i++){const run=service.state.runs.find(r=>r.id===id)!;if(['failed','succeeded','awaiting_plan','cancelled'].includes(run.status))return run;await new Promise(r=>setTimeout(r,10));}throw Error('fixture timeout');}

test('actual Service/Pi tool callback reuses applied DOCX across independent copy and restart, no parse/draft/read receipt',async t=>{
 const parser=t.mock.method(mammoth,'convertToHtml'),rawParser=t.mock.method(mammoth,'extractRawText');let requestId='',toolResult:ProcessingResult|undefined;
 const f=await fixture(t,async o=>{const runtime=await createRuntime(o);try{const tool=runtime.agent.state.tools.find(x=>x.name==='process_processing_copy');if(o.mode==='plan'){assert.equal(tool,undefined);await o.log('process_processing_copy',{id:requestId,operation:'extract_text'},()=>o.processProcessingCopy!(requestId,'extract_text'));return;}assert.ok(tool);const response=await tool.execute('local-reuse',{id:requestId,operation:'extract_text'},undefined,undefined,{} as never);toolResult=JSON.parse((response.content[0] as {text:string}).text);}finally{runtime.dispose();}});
 const parses=()=>parser.mock.calls.length+rawParser.mock.calls.length;assert.equal(parses(),1);const count=await applied(f);
 assert.equal(f.store.get<ProcessingResult>('processing-result:'+f.result.changeId,null as never).status,'pending');
 const copy2=await f.service.copyForProcessing(f.original);requestId=copy2.id;assert.notEqual(copy2.id,f.copy.id);assert.notEqual(copy2.copy.path,f.copy.copy.path);
 assert.deepEqual(await fs.readFile(path.join(f.processMount.path,copy2.copy.path)),await fs.readFile(path.join(f.processMount.path,f.copy.copy.path)));
 const run=await terminal(f.service,await f.service.send(f.service.conversation(),'本地工具复用夹具','build','standard'));
 assert.equal(run.status,'succeeded',run.error);assert.equal(toolResult!.changeId,f.result.changeId);assert.equal(toolResult!.copyId,f.copy.id);assert.equal(toolResult!.status,'applied');assert.equal(toolResult!.reuse!.requestedCopyId,copy2.id);assert.equal(run.sourceReads,undefined);assert.equal(f.service.state.changes.length,count);assert.equal(parses(),1);
 const restored=new Service(f.store,()=> 'fixture-key',()=>{});f.instances.push(restored);await restored.initializeDefaultProject();
 const repeat=await restored.processProcessingCopy(f.copy.id,'extract_text');assert.equal(repeat.changeId,f.result.changeId);assert.equal(parses(),1);assert.equal(restored.state.changes.length,count);
 const plan=await terminal(f.service,await f.service.send(f.service.conversation(),'本地Plan夹具','plan','standard'));assert.equal(plan.status,'failed');assert.match(plan.error??'',/PLAN_TOOL_DENIED/);assert.equal(parses(),1);
});

test('pending/conflict, old parser, absent trust and forged legacy public extraction cannot seed reuse',async t=>{
 const f=await fixture(t);const pending=await f.service.processProcessingCopy(f.copy.id,'extract_text');assert.notEqual(pending.changeId,f.result.changeId);assert.equal(pending.reuse,undefined);
 f.result=pending;await applied(f);const key='processing-extract-trust:v1:'+pending.changeId,stamp=f.store.get<any>(key,null);
 f.store.set(key,{...stamp,parserVersion:'old-parser'});let miss=await f.service.processProcessingCopy(f.copy.id,'extract_text');assert.equal(miss.reuse,undefined);assert.notEqual(miss.changeId,pending.changeId);
 await f.service.apply(miss.changeId);f.store.set('processing-extract-trust:v1:'+miss.changeId,null);const legacy=await f.service.processProcessingCopy(f.copy.id,'extract_text');assert.equal(legacy.reuse,undefined);
 const snapshot=await f.service.readProcessingCopy(f.copy.id),forged=await f.service.writeProcessedOutput(f.copy.id,'extract_text','forged text',snapshot.contentHash);await f.service.apply(forged.changeId);
 const workspaceId=productRecordsWorkspaceIdentity(f.service.state.root).workspaceId,index=processingReuseIndexKey(workspaceId,snapshot,OFFICE_TEXT_PARSER_VERSION);f.store.set(index,forged.changeId);
 const actual=await f.service.processProcessingCopy(f.copy.id,'extract_text');assert.equal(actual.reuse,undefined);assert.notEqual(actual.changeId,forged.changeId);assert.doesNotMatch(f.service.state.changes.find(c=>c.id===actual.changeId)!.content,/forged text/);
 await f.service.apply(actual.changeId);f.service.state.changes.find(c=>c.id===actual.changeId)!.status='conflict';assert.equal((await f.service.processProcessingCopy(f.copy.id,'extract_text')).reuse,undefined);
});

test('source identity and changed original/copy/output are cold misses; missing old files do not block valid current extraction',async t=>{
 const f=await fixture(t);await applied(f);const originalPath=path.join(f.resources.path,f.original.path),outputPath=path.join(f.processMount.path,f.result.output.path),copyPath=path.join(f.processMount.path,f.copy.copy.path);
 const savedOriginal=await fs.readFile(originalPath),savedCopy=await fs.readFile(copyPath),savedOutput=await fs.readFile(outputPath);
 await fs.writeFile(path.join(f.resources.path,'参考资料/other.docx'),savedOriginal);const other=await f.service.copyForProcessing({mountId:f.resources.id,path:'参考资料/other.docx'});assert.equal((await f.service.processProcessingCopy(other.id,'extract_text')).reuse,undefined);
 for(const target of [originalPath,copyPath,outputPath]){
  await fs.writeFile(target,target===outputPath?'different output':await docx('changed'));const result=await f.service.processProcessingCopy(f.copy.id,'extract_text');assert.equal(result.reuse,undefined);
  await fs.writeFile(originalPath,savedOriginal);await fs.writeFile(copyPath,savedCopy);await fs.writeFile(outputPath,savedOutput);
  // Restore the previously trusted applied candidate; later pending candidates remain ineligible.
  const snapshot=await f.service.readProcessingCopy(f.copy.id);f.store.set(processingReuseIndexKey(productRecordsWorkspaceIdentity(f.service.state.root).workspaceId,snapshot,OFFICE_TEXT_PARSER_VERSION),f.result.changeId);
 }
 const independent=await f.service.copyForProcessing(f.original);await fs.unlink(copyPath);const miss=await f.service.processProcessingCopy(independent.id,'extract_text');assert.equal(miss.reuse,undefined);
});

test('revocation, artifact deny, Plan and cancelled terminal Run reject even a warm cache; unknown IO errors propagate',async t=>{
 const f=await fixture(t);await applied(f);f.service.setPermission('artifact_write','deny');await assert.rejects(f.service.processProcessingCopy(f.copy.id,'extract_text'),/PERMISSION_DENIED/);f.service.setPermission('artifact_write','allow');
 f.resources.enabled=false;await assert.rejects(f.service.processProcessingCopy(f.copy.id,'extract_text'),/PERMISSION_DENIED/);f.resources.enabled=true;
 const run={id:'cancelled-terminal',status:'cancelled',mode:'build'} as any;f.service.state.runs.push(run);await assert.rejects(f.service.processProcessingCopy(f.copy.id,'extract_text',run.id),/CANCELLED/);run.status='running';run.mode='plan';await assert.rejects(f.service.processProcessingCopy(f.copy.id,'extract_text',run.id),/PLAN_TOOL_DENIED/);
 const resolve=f.service.files.resolve.bind(f.service.files);f.service.files.resolve=async(...args)=>{if(args[0]===f.original.mountId)throw Object.assign(Error('unexpected IO'),{code:'EIO'});return resolve(...args);};await assert.rejects(f.service.processProcessingCopy(f.copy.id,'extract_text'),/unexpected IO/);f.service.files.resolve=resolve;
});

test('authorization/cancel/new-copy mutation during fresh validation cannot return the old applied result',async t=>{
 for(const kind of ['revoke','cancel','copy','workspace'] as const){
  const f=await fixture(t);await applied(f);const run={id:'active-'+kind,status:'running',mode:'build'} as any;f.service.state.runs.push(run);let count=0;
  const read=f.service.readProcessingCopy.bind(f.service);f.service.readProcessingCopy=async id=>{const value=await read(id);if(++count===2){if(kind==='revoke')f.service.setPermission('workspace_read','deny');else if(kind==='cancel')run.status='cancelled';else if(kind==='workspace')f.service.state.root=path.join(f.dir,'other');else await fs.writeFile(path.join(f.processMount.path,f.copy.copy.path),await docx('changed during reuse'));}return value;};
  await assert.rejects(f.service.processProcessingCopy(f.copy.id,'extract_text',run.id),/PERMISSION_DENIED|CANCELLED|VERSION_CONFLICT/);
 }
});

test('old chain changed during the final requested-copy read cannot reuse its earlier hash validation',async t=>{
 const f=await fixture(t);await applied(f);const independent=await f.service.copyForProcessing(f.original),read=f.service.readProcessingCopy.bind(f.service);let count=0;
 f.service.readProcessingCopy=async id=>{const value=await read(id);if(++count===3)await fs.writeFile(path.join(f.processMount.path,f.result.output.path),'changed after validation');return value;};
 const actual=await f.service.processProcessingCopy(independent.id,'extract_text');assert.equal(actual.reuse,undefined);assert.notEqual(actual.changeId,f.result.changeId);
});

test('metadata mutation during final stat rejects conflict and changed trusted identity with the same change ID',async t=>{
 for(const kind of ['conflict','identity'] as const){
  const f=await fixture(t);await applied(f);const originalOutput={...f.result.output},alternate={mountId:originalOutput.mountId,path:'alternate.txt'};
  await fs.copyFile(path.join(f.processMount.path,originalOutput.path),path.join(f.processMount.path,alternate.path));
  const resolve=f.service.files.resolve.bind(f.service.files);let outputResolves=0;
  f.service.files.resolve=async(...args)=>{const selected=await resolve(...args);if(args[0]===originalOutput.mountId&&args[1]===originalOutput.path&&++outputResolves===5){
   const change=f.service.state.changes.find(c=>c.id===f.result.changeId)!;
   if(kind==='conflict')change.status='conflict';else{const trustKey='processing-extract-trust:v1:'+change.id,resultKey='processing-result:'+change.id;f.store.set(trustKey,{...f.store.get<any>(trustKey,null),output:alternate});f.store.set(resultKey,{...f.store.get<any>(resultKey,null),output:alternate});change.mountId=alternate.mountId;change.path=alternate.path;}
  }return selected;};
  const actual=await f.service.processProcessingCopy(f.copy.id,'extract_text');assert.ok(outputResolves>=5);assert.equal(actual.reuse,undefined);assert.notEqual(actual.changeId,f.result.changeId);
 }
});

test('XLSX shares bounded built-in reuse; scripts and plain text always execute independently',async t=>{
 const f=await fixture(t);const book=new ExcelJS.Workbook();book.addWorksheet('03').addRows([['字段'],['定位']]);await fs.writeFile(path.join(f.resources.path,'参考资料/table.xlsx'),Buffer.from(await book.xlsx.writeBuffer()));
 const copy=await f.service.copyForProcessing({mountId:f.resources.id,path:'参考资料/table.xlsx'}),result=await f.service.processProcessingCopy(copy.id,'extract_text');await f.service.apply(result.changeId);assert.equal((await f.service.processProcessingCopy(copy.id,'extract_text')).reuse?.requestedCopyId,copy.id);
 const snapshot=await f.service.readProcessingCopy(copy.id),script=await f.service.writeProcessedOutput(copy.id,'script','arbitrary script result',snapshot.contentHash);await f.service.apply(script.changeId);assert.equal((await f.service.processProcessingCopy(copy.id,'extract_text')).changeId,result.changeId);
 let scripts=0;(f.service as any).backend.runReferenceScript=async()=>{scripts++;return 'script';};assert.equal((await f.service.processProcessingCopy(copy.id,'script',undefined,'return "script"')).reuse,undefined);assert.equal((await f.service.processProcessingCopy(copy.id,'script',undefined,'return "script"')).reuse,undefined);assert.equal(scripts,2);
 await fs.writeFile(path.join(f.resources.path,'参考资料/plain.txt'),'plain');const textCopy=await f.service.copyForProcessing({mountId:f.resources.id,path:'参考资料/plain.txt'}),textResult=await f.service.processProcessingCopy(textCopy.id,'extract_text');await f.service.apply(textResult.changeId);assert.notEqual((await f.service.processProcessingCopy(textCopy.id,'extract_text')).changeId,textResult.changeId);
});
