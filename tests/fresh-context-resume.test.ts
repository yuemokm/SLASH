import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {SessionManager} from '@earendil-works/pi-coding-agent';
import {createRuntime,type RuntimeOptions} from '../main/agent.js';
import {Service} from '../main/service.js';
import {Store} from '../main/store.js';
import {requestSchema} from '../shared/types.js';
import {hash} from '../main/files.js';

const assistant={role:'assistant',stopReason:'stop',content:[{type:'text',text:'fixture completion'}]} as const;
async function done(service:Service,id:string){
 for(let i=0;i<1000;i++){const run=service.state.runs.find(r=>r.id===id)!;if(run.finishedAt&&!['queued','running','validating','repairing','cancelling'].includes(run.status))return run;await new Promise(resolve=>setTimeout(resolve,10));}
 throw Error('local fresh resume timeout');
}
async function fixture(t:test.TestContext,execute:(options:RuntimeOptions,attempt:number,text:string)=>Promise<void>){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-fresh-resume-')),store=new Store(path.join(dir,'data'));let attempts=0;
 const options:RuntimeOptions[]=[],prompts:string[]=[];
 const service=new Service(store,()=> 'offline-key',()=>{},async o=>{const attempt=++attempts;options.push(o);return{sessionFile:path.join(dir,`session-${attempt}.jsonl`),messages:[assistant],abort:async()=>{},dispose:()=>{},prompt:async(text:string)=>{prompts.push(text);await execute(o,attempt,text);o.delta('完成。');}} as never;});
 await service.workspace(path.join(dir,'project'));service.setPermission('workspace_read','allow');service.setPermission('artifact_write','allow');
 t.after(async()=>{service.dispose();await Promise.allSettled([...(service as any).agentIndex.queues.values()]);store.close();await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:30});});
 const resource=service.state.mounts.find(m=>m.name==='资源')!,output=service.state.mounts.find(m=>m.name==='成果')!;
 return{dir,store,service,resource,output,options,prompts};
}

test('official resume request schema accepts old calls and explicit bounded summary only',()=>{
 assert.deepEqual(requestSchema.parse({type:'resume',id:'prior-run'}),{type:'resume',id:'prior-run'});
 assert.deepEqual(requestSchema.parse({type:'resume',id:'prior-run',freshContext:{summary:'  原范围、模板与剩余草稿  '}}),{type:'resume',id:'prior-run',freshContext:{summary:'原范围、模板与剩余草稿'}});
 for(const freshContext of [{},{summary:''},{summary:' '.repeat(4)},{summary:'x'.repeat(12001)},{summary:'ok',parentSession:'/private/path'},{summary:'ok',permissionMode:'full_access'}])assert.throws(()=>requestSchema.parse({type:'resume',id:'prior-run',freshContext}));
 assert.throws(()=>requestSchema.parse({type:'resume',id:'prior-run',permissionMode:'full_access'}));
});

test('fresh resume inherits contract, template, source receipts and exact pending owner without repeating original input',async t=>{
 const template='# 1. 功能需求\n\n业务字段和操作规范。\n\n# 2. 集成需求\n\n本范围没有外部集成。\n';
 let f!:Awaited<ReturnType<typeof fixture>>,changeId='',first='',frozenHash='';
 f=await fixture(t,async(o,attempt,text)=>{
  const target={mountId:f.output.id,path:'统一PRD.md'};
  if(attempt===1){first=o.runId!;const draft=await o.files.draft(target.mountId,target.path,'保留的七章骨架',first);changeId=draft.id;o.draft!(draft);o.delta('失败前部分回复'.repeat(400));await o.log('already_completed',{},async()=>({ok:true}));frozenHash=(await o.getTaskAcceptance!())!.contract.template!.snapshotHash;throw Error('LOCAL_STREAM_FAILURE');}
  assert.equal(o.freshSession,true);assert.equal(o.sessionFile,f.options[0].sessionFile??path.join(f.dir,'session-1.jsonl'));
  assert.doesNotMatch(text,/DO_NOT_REPEAT_ORIGINAL|失败前部分回复|SOURCE_BODY_MUST_NOT_REPEAT/);assert.match(text,/全部27流程|已有骨架|already_completed/);
  const run=f.service.state.runs.find(r=>r.id===o.runId)!;assert.equal(run.resumedFromRunId,first);assert.equal(run.permissionMode,'standard');assert.equal(run.mode,'build');
  const view=(await o.getTaskAcceptance!())!;assert.equal(view.contract.template!.snapshotHash,frozenHash);assert.ok(view.contract.requests.some(r=>r.text.includes('DO_NOT_REPEAT_ORIGINAL')));assert.ok(view.contract.outputs.some(output=>output.target.path===target.path));assert.ok(view.sources.some(s=>s.path==='参考资料/source.md'&&s.includedCharacters>0),'prior actual read receipt is retained');assert.ok(view.sources.some(s=>s.path==='参考资料/source.md'&&s.includedCharacters===0&&s.locator==='fresh-context-version-precheck'),'new recovery precheck does not claim body in model context');
  const read=await o.readDraft!(target);assert.equal(read.changeId,changeId);assert.equal(read.parentRunId,first);
  const edit=await o.editDraft!({...target,changeId,expectedContentHash:read.contentHash,oldText:'保留的七章骨架',newText:template});assert.equal(edit.changeId,changeId);
 });
 await fs.writeFile(path.join(f.resource.path,'参考资料/template.md'),template);await fs.writeFile(path.join(f.resource.path,'参考资料/source.md'),'SOURCE_BODY_MUST_NOT_REPEAT '+'来源规则'.repeat(1500));
 const original='DO_NOT_REPEAT_ORIGINAL\n'+'不可丢失的原任务要求。'.repeat(2500),conversation=f.service.conversation();
 const initial=await f.service.send(conversation,original,'build','standard',undefined,undefined,undefined,'writing',undefined,{kind:'prd',sources:[{mountId:f.resource.id,path:'参考资料/source.md'}],template:{mountId:f.resource.id,path:'参考资料/template.md'}});
 assert.equal((await done(f.service,initial)).status,'failed');
 const request=requestSchema.parse({type:'resume',id:initial,freshContext:{summary:'全部27流程，沿用已冻结模板；统一PRD已有骨架，继续逐段补齐同一草稿。'}});assert.equal(request.type,'resume');if(request.type!=='resume')throw Error('schema narrowing');
 const resumed=await f.service.resumeRun(request.id,request.freshContext),run=await done(f.service,resumed);assert.equal(run.status,'succeeded',run.error);assert.equal(run.contextResume!.originalInputHash,hash(original));assert.equal(run.contextResume!.parentSessionFile,path.join(f.dir,'session-1.jsonl'));assert.equal(run.piSessionFile,path.join(f.dir,'session-2.jsonl'));assert.ok(f.prompts[1].length<10000);
 assert.equal(f.service.state.changes.length,1);assert.equal(f.service.state.changes[0].id,changeId);assert.equal(f.service.state.changes[0].originRunId,initial);assert.equal(f.service.state.changes[0].runId,resumed);assert.equal(f.service.state.runs.find(r=>r.id===initial)!.input,original);await assert.rejects(fs.stat(path.join(f.output.path,'统一PRD.md')),/ENOENT/);
});

test('old resume stays inherited; fresh resume cannot bypass unknown effects, cancellation or changed workflow sources',async t=>{
 const f=await fixture(t,async()=>{throw Error('LOCAL_FAILURE');}),conversation=f.service.conversation(),source={mountId:f.resource.id,path:'参考资料/source.md'};
 await fs.writeFile(path.join(f.resource.path,source.path),'SOURCE_A');const first=await f.service.send(conversation,'完整原请求继续保留','build','standard',undefined,undefined,undefined,'writing',undefined,{kind:'prd',sources:[source]});await done(f.service,first);
 const old=await f.service.resumeRun(first);await done(f.service,old);assert.match(f.prompts[1],/完整原请求继续保留/);assert.equal(f.options[1].freshSession,false);assert.equal(f.options[1].sessionFile,path.join(f.dir,'session-1.jsonl'));
 const previous=f.service.state.runs.find(r=>r.id===old)!,count=f.service.state.runs.length;
 f.store.operation('unknown-local-op',old,'external_write','outcome_unknown');await assert.rejects(f.service.resumeRun(old,{summary:'继续原任务'}),/RUN_REQUIRES_RECONCILIATION/);assert.equal(f.service.state.runs.length,count);assert.equal(previous.resumable,true);
 f.store.operation('unknown-local-op',old,'external_write','failed','verified no write');previous.status='cancelled';await assert.rejects(f.service.resumeRun(old,{summary:'继续原任务'}),/当前任务不可继续/);previous.status='failed';
 await fs.writeFile(path.join(f.resource.path,source.path),'SOURCE_B');const changed=await f.service.resumeRun(old,{summary:'原来源不变，继续原任务'}),failed=await done(f.service,changed);assert.equal(failed.status,'failed');assert.match(failed.error!,/WORKFLOW_SOURCE_CHANGED/);assert.equal(f.options.length,2,'source changes must fail before runtime creation');
});

test('real Pi fresh session links original file, excludes old messages, preserves original bytes; normal open still retains history',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-native-fresh-')),agentDir=path.join(dir,'agent');await fs.mkdir(agentDir);const payloads:any[]=[];
 const server=createServer(async(req,res)=>{const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));payloads.push(JSON.parse(Buffer.concat(chunks).toString()));res.writeHead(200,{'content-type':'text/event-stream'});const base={id:'offline-pi',object:'chat.completion.chunk',created:1,model:'fixture'};res.write('data: '+JSON.stringify({...base,choices:[{index:0,delta:{role:'assistant',content:'FRESH_DONE'},finish_reason:null}]})+'\n\n');res.end('data: '+JSON.stringify({...base,choices:[{index:0,delta:{},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n');});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:30});});
 const old=SessionManager.create(agentDir,path.join(dir,'sessions'));old.appendMessage({role:'user',content:'OLD_TRANSCRIPT_MARKER '+ 'large prior input '.repeat(2500),timestamp:1});old.appendMessage({...assistant,content:[{type:'text',text:'OLD_RESULT'}],api:'openai-completions',provider:'baishan',model:'fixture',usage:{input:200000,output:1,cacheRead:0,cacheWrite:0,totalTokens:200001,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},timestamp:2} as never);
 const oldFile=old.getSessionFile()!;
 const options={dir:agentDir,workspaceRoot:dir,model:{id:'fixture',protocol:'openai-completions',baseUrl:`http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,contextWindow:65536,maxTokens:12000},key:'offline-key',files:{} as RuntimeOptions['files'],mounts:[],connections:[],runId:'fixture-run',mode:'plan',sessionFile:oldFile,listConnections:()=>[],delta:()=>{}} as RuntimeOptions;
 const normal=await createRuntime(options);try{assert.equal(normal.sessionFile,oldFile);assert.match(JSON.stringify(normal.messages),/OLD_TRANSCRIPT_MARKER/);}finally{normal.dispose();}
 const before=await fs.readFile(oldFile);
 const fresh=await createRuntime({...options,freshSession:true});try{assert.ok(fresh.agent.state.tools.some(tool=>tool.name==='read_file'));assert.ok(!fresh.agent.state.tools.some(tool=>tool.name==='write_draft'));assert.notEqual(fresh.sessionFile,oldFile);assert.doesNotMatch(JSON.stringify(fresh.messages),/OLD_TRANSCRIPT_MARKER/);await fresh.prompt('SHORT_RECOVERY_SUMMARY');assert.equal(payloads.length,1,'no old-history compaction request');assert.doesNotMatch(JSON.stringify(payloads),/OLD_TRANSCRIPT_MARKER|OLD_RESULT|<conversation>/);const entries=(await fs.readFile(fresh.sessionFile!,'utf8')).trim().split('\n').map(line=>JSON.parse(line));assert.equal(entries[0].parentSession,oldFile);assert.ok(entries.some(e=>e.message?.role==='user'&&JSON.stringify(e.message.content).includes('SHORT_RECOVERY_SUMMARY')));assert.equal(hash(await fs.readFile(oldFile)),hash(before));}finally{await fresh.abort();fresh.dispose();}
});
