import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Service} from '../main/service.js';
import {Store} from '../main/store.js';
import type {RuntimeOptions} from '../main/agent.js';
import type {PmWorkflow,ProcessingCopy} from '../shared/types.js';

async function terminal(service:Service,id:string){for(let i=0;i<300;i++){const run=service.state.runs.find(r=>r.id===id)!;if(['succeeded','failed','interrupted','awaiting_plan'].includes(run.status))return run;await new Promise(r=>setTimeout(r,10));}throw Error('run timeout');}
async function fixture(t:test.TestContext){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-copy-context-')),store=new Store(path.join(dir,'data')),calls:Array<{text:string;options:RuntimeOptions}>=[];let selectedCopy:ProcessingCopy|undefined,scriptCalls=0;
 const bytes=Buffer.from([0,1,2,255,10,20]);
 const service=new Service(store,()=> 'fixture-key',()=>{},async options=>({messages:[{role:'assistant',stopReason:'stop'}],abort:async()=>{},dispose:()=>{},prompt:async(text:string)=>{
  calls.push({text,options});
  if(options.mode==='plan'){await assert.rejects(options.log('process_processing_copy',{id:selectedCopy!.id,operation:'script'},()=>options.processProcessingCopy!(selectedCopy!.id,'script','return input.bytes.length.toString();')),/PLAN_TOOL_DENIED/);options.delta('方案 1：核对二进制处理方式\n步骤：先确认格式再处理副本');}
  else{await options.log('process_processing_copy',{id:selectedCopy!.id,operation:'script'},()=>options.processProcessingCopy!(selectedCopy!.id,'script','return input.bytes.length.toString();'));options.delta('已生成处理结果草稿。');}
 }}) as never,{runReferenceScript:async input=>{scriptCalls++;assert.deepEqual(Buffer.from(input.contentBase64,'base64'),bytes);assert.equal(input.fileName,path.basename(selectedCopy!.copy.path));return '6';}});
 t.after(async()=>{service.dispose();await Promise.allSettled([...(service as any).agentIndex.queues.values()]);store.close();await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:30});});
 await service.workspace(path.join(dir,'project'));service.setPermission('workspace_read','allow');service.setPermission('artifact_write','allow');const resource=service.state.mounts.find(m=>m.name==='资源')!;await fs.writeFile(path.join(resource.path,'参考资料','original.bin'),bytes);selectedCopy=await service.copyForProcessing({mountId:resource.id,path:'参考资料/original.bin'});const copy=selectedCopy,conversation=service.conversation(),workflow:PmWorkflow={kind:'research',sources:[copy.copy]};
 return{dir,service,store,calls,copy,conversation,workflow,resource,bytes,scriptCalls:()=>scriptCalls};
}

test('登记二进制副本在Build与Plan提供真实metadata，正文0字符；Build后续处理可产出，Plan保持只读',async t=>{
 const {service,store,calls,copy,conversation,workflow,resource,bytes,scriptCalls}=await fixture(t);
 const build=await terminal(service,await service.send(conversation,'处理此副本','build','standard',undefined,undefined,undefined,'general',undefined,workflow));assert.equal(build.status,'succeeded');
 const receipt=build.workflow!.receipts[0];assert.equal(receipt.contentStatus,'metadata_only');assert.equal(receipt.processingCopyId,copy.id);assert.equal(receipt.size,bytes.length);assert.equal(receipt.characters,0);assert.equal(receipt.includedCharacters,0);assert.equal(receipt.truncated,false);assert.equal(receipt.contentHash,copy.source.contentHash);
 assert.match(calls[0].text,/正文尚未提取/);assert.match(calls[0].text,/不能声称已阅读/);assert.match(calls[0].text,new RegExp(copy.id));assert.doesNotMatch(calls[0].text,/'content'|"content":/);assert.equal(service.state.changes.length,1);assert.equal(service.state.changes[0].content,'6');assert.equal(store.operationsForRun(build.id).find(op=>op.tool==='process_processing_copy')?.state,'succeeded');assert.equal(scriptCalls(),1);
 const plan=await terminal(service,await service.send(conversation,'提出处理方案','plan','standard',undefined,undefined,undefined,'general',undefined,workflow));assert.equal(plan.status,'awaiting_plan');assert.equal(plan.workflow!.receipts[0].contentStatus,'metadata_only');assert.equal(calls.length,2);assert.match(calls[1].text,/Plan只读/);assert.equal(scriptCalls(),1);assert.equal(service.state.changes.length,1);assert.deepEqual(await fs.readFile(path.join(resource.path,'参考资料','original.bin')),bytes);
});

test('未登记binary、登记副本篡改/丢失/版本不符/撤销授权均在runtime前拒绝',async t=>{
 const {service,calls,copy,conversation,resource,bytes}=await fixture(t);const mount=service.state.mounts.find(m=>m.id===copy.copy.mountId)!;
 const send=async(source:PmWorkflow['sources'][number])=>terminal(service,await service.send(conversation,'处理此文件','build','standard',undefined,undefined,undefined,'general',undefined,{kind:'research',sources:[source]}));
 await fs.writeFile(path.join(mount.path,'unregistered.bin'),bytes);const unregistered=await send({mountId:mount.id,path:'unregistered.bin'});assert.equal(unregistered.status,'failed');assert.match(unregistered.error??'',/暂不支持此文件的文本解析/);
 const wrongHash=await send({...copy.copy,contentHash:'0'.repeat(64)});assert.equal(wrongHash.status,'failed');assert.match(wrongHash.error??'',/WORKFLOW_SOURCE_CHANGED/);
 await fs.writeFile(path.join(mount.path,copy.copy.path),Buffer.from([9,9]));const changed=await send(copy.copy);assert.equal(changed.status,'failed');assert.match(changed.error??'',/WORKFLOW_SOURCE_CHANGED/);
 await fs.unlink(path.join(mount.path,copy.copy.path));const missing=await send(copy.copy);assert.equal(missing.status,'failed');assert.match(missing.error??'',/ENOENT/);
 await fs.writeFile(path.join(mount.path,copy.copy.path),bytes);mount.enabled=false;service.save();const disabled=await send(copy.copy);assert.equal(disabled.status,'failed');assert.match(disabled.error??'',/PERMISSION_DENIED/);mount.enabled=true;service.save();service.setPermission('workspace_read','deny');const denied=await send(copy.copy);assert.equal(denied.status,'failed');assert.match(denied.error??'',/PERMISSION_DENIED/);assert.equal(calls.length,0);assert.deepEqual(await fs.readFile(path.join(resource.path,'参考资料','original.bin')),bytes);
});
