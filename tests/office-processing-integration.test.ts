import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import AdmZip from 'adm-zip';
import {Document,Packer,Paragraph} from 'docx';
import ExcelJS from 'exceljs';
import {Service} from '../main/service.js';
import {Store} from '../main/store.js';
import {createRuntime,type RuntimeOptions} from '../main/agent.js';
import type {PmWorkflow,ProcessingCopy} from '../shared/types.js';
import type {EvidenceSearchResult} from '../shared/evidence-search.js';

const digest=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
async function terminal(service:Service,id:string){for(let i=0;i<500;i++){const run=service.state.runs.find(item=>item.id===id)!;if(['failed','succeeded','awaiting_plan','interrupted','cancelled'].includes(run.status))return run;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('fixture run timeout');}
async function fixture(t:test.TestContext,execute?:(options:RuntimeOptions,text:string)=>Promise<void>){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-office-integration-')),store=new Store(path.join(dir,'data')),calls:Array<{text:string;options:RuntimeOptions}>=[];
 const service=new Service(store,()=> 'fixture-key',()=>{},async options=>({messages:[{role:'assistant',stopReason:'stop'}],abort:async()=>{},dispose:()=>{},prompt:async(text:string)=>{calls.push({text,options});await execute?.(options,text);options.delta(options.mode==='plan'?'方案 1：先提取授权副本\n步骤：切换Build后提取Office正文':'已核对副本。');}}) as never);
 const instances=[service];t.after(async()=>{for(const instance of instances){instance.dispose();await Promise.allSettled([...(instance as any).agentIndex.queues.values()]);}store.close();await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:30});});
 await service.workspace(path.join(dir,'project'));service.setPermission('workspace_read','allow');service.setPermission('artifact_write','allow');
 const resources=service.state.mounts.find(m=>m.name==='资源')!,processMount=service.state.mounts.find(m=>m.name==='过程文件')!,conversation=service.conversation();
 return{dir,store,service,instances,calls,resources,processMount,conversation};
}
async function docxBytes(padding=0){const bytes=await Packer.toBuffer(new Document({sections:[{children:[new Paragraph('审批事实：负责人必须复核。')]}]}));if(!padding)return bytes;const zip=new AdmZip(bytes);zip.addFile('word/media/large-fixture.bin',randomBytes(padding));return zip.toBuffer();}
async function xlsxBytes(){const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('审批场景');sheet.addRow(['规则','负责人']);sheet.addRow(['人工复核','业务负责人']);return Buffer.from(await workbook.xlsx.writeBuffer());}
const send=(service:Service,conversation:string,source:PmWorkflow['sources'][number],mode:'build'|'plan'='build')=>service.send(conversation,'核对选择的资料',mode,'standard',undefined,undefined,undefined,'general',undefined,{kind:'research',sources:[source]});

test('大于10 MB Word与Excel登记副本可进入Build/Plan；Office内置提取生成pending草稿并保留源回执和原件',async t=>{
 let selected:ProcessingCopy|undefined;const f=await fixture(t,async options=>{if(!selected)return;if(options.mode==='plan')await assert.rejects(options.log('process_processing_copy',{id:selected.id,operation:'extract_text'},()=>options.processProcessingCopy!(selected!.id,'extract_text')),/PLAN_TOOL_DENIED/);else await options.log('process_processing_copy',{id:selected.id,operation:'extract_text'},()=>options.processProcessingCopy!(selected!.id,'extract_text'));});
 const office=[{name:'large.docx',bytes:await docxBytes(10_100_000),expected:/审批事实/},{name:'table.xlsx',bytes:await xlsxBytes(),expected:/人工复核/}];
 for(const entry of office){
  assert.ok(entry.name.endsWith('xlsx')||entry.bytes.length>10_000_000);await fs.writeFile(path.join(f.resources.path,'参考资料',entry.name),entry.bytes);
  selected=await f.service.copyForProcessing({mountId:f.resources.id,path:`参考资料/${entry.name}`});const copy=selected;
  await assert.rejects(f.service.files.read(copy.copy.mountId,copy.copy.path),/2 MB|暂不支持/);
  const build=await terminal(f.service,await send(f.service,f.conversation,copy.copy));assert.equal(build.status,'succeeded',build.error);
  const receipt=build.workflow!.receipts[0];assert.equal(receipt.contentStatus,'metadata_only');assert.equal(receipt.characters,0);assert.equal(receipt.includedCharacters,0);assert.equal(receipt.truncated,false);assert.equal(receipt.processingCopyId,copy.id);assert.equal(receipt.size,entry.bytes.length);assert.equal(receipt.contentHash,digest(entry.bytes));
  const prompt=f.calls.at(-1)!.text;assert.match(prompt,/内置extract_text/);assert.match(prompt,/正文尚未提取/);assert.doesNotMatch(prompt,/"content":/);
  const change=f.service.state.changes[0];assert.equal(change.status,'pending');assert.match(change.content,entry.expected);const result=f.store.get<any>(`processing-result:${change.id}`,null);assert.equal(result.source.contentHash,digest(entry.bytes));assert.equal(result.copyHash,digest(entry.bytes));assert.equal(result.operation,'extract_text');assert.equal(await fs.stat(path.join(f.processMount.path,result.output.path)).catch(()=>null),null);
  const changes=f.service.state.changes.length,plan=await terminal(f.service,await send(f.service,f.conversation,copy.copy,'plan'));assert.equal(plan.status,'awaiting_plan');assert.equal(plan.workflow!.receipts[0].characters,0);assert.equal(f.service.state.changes.length,changes);
  await assert.rejects(f.service.files.draft(f.resources.id,`参考资料/${entry.name}`,'overwrite','fixture'),/REFERENCE_READ_ONLY/);assert.deepEqual(await fs.readFile(path.join(f.resources.path,'参考资料',entry.name)),entry.bytes);
 }
 const restored=new Service(f.store,()=> 'fixture-key',()=>{});f.instances.push(restored);await restored.initializeDefaultProject();assert.equal((await restored.readProcessingCopy(selected!.id)).contentHash,selected!.source.contentHash);const result=await restored.processProcessingCopy(selected!.id,'extract_text');assert.match(restored.state.changes.find(change=>change.id===result.changeId)!.content,/人工复核/);
});

test('未登记大Office、改变/丢失/撤权副本与超过100 MB均明确拒绝，不进入模型',async t=>{
 const f=await fixture(t),bytes=await docxBytes(2_100_000);await fs.writeFile(path.join(f.resources.path,'参考资料','source.docx'),bytes);
 const original={mountId:f.resources.id,path:'参考资料/source.docx'},unregistered=await terminal(f.service,await send(f.service,f.conversation,original));assert.equal(unregistered.status,'failed');assert.match(unregistered.error??'',/WORKFLOW_SOURCE_REQUIRES_COPY.*copy_for_processing/);
 const copy=await f.service.copyForProcessing(original),copyPath=path.join(f.processMount.path,copy.copy.path);
 const wrong=await terminal(f.service,await send(f.service,f.conversation,{...copy.copy,contentHash:'0'.repeat(64)}));assert.match(wrong.error??'',/WORKFLOW_SOURCE_CHANGED/);
 await fs.writeFile(copyPath,Buffer.concat([bytes,Buffer.from('changed')]));const changed=await terminal(f.service,await send(f.service,f.conversation,copy.copy));assert.match(changed.error??'',/WORKFLOW_SOURCE_CHANGED/);
 await fs.unlink(copyPath);const missing=await terminal(f.service,await send(f.service,f.conversation,copy.copy));assert.match(missing.error??'',/ENOENT/);
 await fs.writeFile(copyPath,bytes);f.processMount.enabled=false;const revoked=await terminal(f.service,await send(f.service,f.conversation,copy.copy));assert.match(revoked.error??'',/PERMISSION_DENIED/);f.processMount.enabled=true;
 f.service.setPermission('workspace_read','deny');const denied=await terminal(f.service,await send(f.service,f.conversation,copy.copy));assert.match(denied.error??'',/PERMISSION_DENIED/);f.service.setPermission('workspace_read','allow');
 const oversized=path.join(f.processMount.path,'too-large.docx');await fs.writeFile(oversized,'');await fs.truncate(oversized,100_000_001);const limit=await terminal(f.service,await send(f.service,f.conversation,{mountId:f.processMount.id,path:'too-large.docx'}));assert.match(limit.error??'',/PROCESSING_FILE_LIMIT/);await assert.rejects(f.service.copyForProcessing({mountId:f.processMount.id,path:'too-large.docx'}),/PROCESSING_FILE_LIMIT/);
 assert.equal(f.calls.length,0);assert.deepEqual(await fs.readFile(path.join(f.resources.path,original.path)),bytes);
});

test('Office解析使用已验hash字节快照；提取后提交前变化或撤权不登记结果',async t=>{
 const f=await fixture(t),bytes=await xlsxBytes();await fs.writeFile(path.join(f.resources.path,'参考资料','table.xlsx'),bytes);const copy=await f.service.copyForProcessing({mountId:f.resources.id,path:'参考资料/table.xlsx'}),copyPath=path.join(f.processMount.path,copy.copy.path),count=f.service.state.changes.length;
 const originalDraft=f.service.files.draft.bind(f.service.files);f.service.files.draft=async(...args)=>{const draft=await originalDraft(...args);await fs.writeFile(copyPath,Buffer.from('changed during draft'));return draft;};
 await assert.rejects(f.service.processProcessingCopy(copy.id,'extract_text'),/VERSION_CONFLICT/);assert.equal(f.service.state.changes.length,count);await fs.writeFile(copyPath,bytes);
 f.service.files.draft=async(...args)=>{const draft=await originalDraft(...args);f.service.setPermission('artifact_write','deny');return draft;};await assert.rejects(f.service.processProcessingCopy(copy.id,'extract_text'),/PERMISSION_DENIED/);assert.equal(f.service.state.changes.length,count);f.service.files.draft=originalDraft;f.service.setPermission('artifact_write','allow');
 // Changing Files.read cannot affect the Office path: extraction consumes the checked Buffer.
 f.service.files.read=async()=>{throw Error('Office must use snapshot bytes');};const result=await f.service.processProcessingCopy(copy.id,'extract_text');assert.match(f.service.state.changes.find(change=>change.id===result.changeId)!.content,/人工复核/);
});

test('AGENTS索引按真实读取支持范围提示Office副本和未知binary；主/子Agent检索返回可核对coverage',async t=>{
 let mainResult:EvidenceSearchResult|undefined;const f=await fixture(t,async options=>{const runtime=await createRuntime(options);try{const tool=runtime.agent.state.tools.find(item=>item.name==='search_files')!;const response=await tool.execute('fixture-search',{query:'人工复核'},undefined,undefined,{} as never);mainResult=JSON.parse((response.content[0] as {text:string}).text);}finally{runtime.dispose();}});
 await fs.writeFile(path.join(f.resources.path,'参考资料','人工复核.xlsx'),await xlsxBytes());await fs.writeFile(path.join(f.resources.path,'参考资料','人工复核.bin'),Buffer.from([0,255,1]));await fs.writeFile(path.join(f.resources.path,'参考资料','notes.md'),'# 规则\n人工复核必须指定负责人。');await fs.writeFile(path.join(f.resources.path,'参考资料','large.docx'),await docxBytes(2_100_000));
 const run=await terminal(f.service,await f.service.send(f.conversation,'检索审批事实','plan','standard'));assert.equal(run.status,'awaiting_plan',run.error);
 const entries=f.calls[0].options.agentIndex!.split('\n').filter(line=>line.startsWith('{"mountId":')).map(line=>JSON.parse(line));const sheet=entries.find(item=>item.path.endsWith('.xlsx')),large=entries.find(item=>item.path.endsWith('large.docx')),binary=entries.find(item=>item.path.endsWith('.bin'));assert.match(sheet.summary,/copy_for_processing.*extract_text/);assert.match(large.summary,/copy_for_processing.*extract_text/);assert.doesNotMatch(sheet.summary,/read_file/);assert.match(binary.summary,/正文尚未读取.*需先核实格式/);assert.doesNotMatch(binary.summary,/read_file/);
 assert.ok(mainResult?.items.some(item=>item.path.endsWith('notes.md')&&item.matchKind==='body'&&item.locator));assert.ok(mainResult?.items.some(item=>item.path.endsWith('.xlsx')&&item.matchKind==='path'&&!item.snippet));assert.ok(mainResult?.limitations.some(item=>item.path?.endsWith('.xlsx')));assert.equal(typeof mainResult?.coverage.bodyReadFiles,'number');
 const result=await f.service.runSubAgent({parentRunId:run.id,tool:'search_files',capability:'workspace_read',input:{query:'人工复核'}}) as {tool:string;results:EvidenceSearchResult};assert.equal(result.tool,'search_files');assert.ok(result.results.items.length);assert.equal(typeof result.results.coverage.scannedFiles,'number');assert.ok(Array.isArray(result.results.limitations));
 f.service.setPermission('workspace_read','deny');await assert.rejects(f.service.runSubAgent({parentRunId:run.id,tool:'search_files',capability:'workspace_read',input:{query:'人工复核'}}),/SUB_AGENT_PERMISSION_DENIED/);
});
