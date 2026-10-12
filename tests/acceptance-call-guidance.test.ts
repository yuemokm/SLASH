import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createServer,type ServerResponse} from 'node:http';
import {createRuntime,type RuntimeOptions} from '../main/agent.js';
import {Service} from '../main/service.js';
import {Store} from '../main/store.js';
import {taskAcceptanceProposalSchema} from '../shared/task-acceptance.js';

function reply(res:ServerResponse,model:string,tool?:{id:string;name:string;args:unknown}){
 res.writeHead(200,{'content-type':'text/event-stream'});
 const event=(delta:unknown,finish_reason:string|null)=>res.write('data: '+JSON.stringify({id:'call-guidance-local',object:'chat.completion.chunk',created:1,model,choices:[{index:0,delta,finish_reason}]})+'\n\n');
 event({role:'assistant'},null);
 if(tool){event({tool_calls:[{index:0,id:tool.id,type:'function',function:{name:tool.name,arguments:JSON.stringify(tool.args)}}]},null);event({},'tool_calls');}
 else{event({content:'本机调用契约检查结束，未判断业务质量。'},null);event({},'stop');}
 res.end('data: [DONE]\n\n');
}

test('strict proposal keeps sources nested and rejects empty or fabricated output identity',()=>{
 const criterion={id:'c',text:'真实要求',requestIds:['host-request'],outputIds:['host-output'],checker:{kind:'text_assertion',expected:'真实正文'}};
 assert(taskAcceptanceProposalSchema.safeParse({prd:{sourceIds:['host-source']},criteria:[criterion]}).success);
 assert(!taskAcceptanceProposalSchema.safeParse({sourceIds:['host-source'],criteria:[criterion]}).success);
 assert(!taskAcceptanceProposalSchema.safeParse({criteria:[{...criterion,outputIds:[]}]}).success);
 assert(!taskAcceptanceProposalSchema.safeParse({criteria:[{...criterion,outputIds:['']}]}).success);
});

for(const existing of [false,true])test('real Pi and Service: '+(existing?'existing output reused without another draft':'new draft registers host output before define') ,{timeout:60000},async t=>{
 const tempRoot=path.join(os.tmpdir(),'slash-call-guidance');await fs.mkdir(tempRoot,{recursive:true});
 const dir=await fs.mkdtemp(path.join(tempRoot,'case-')),store=new Store(path.join(dir,'profile'));
 let service:Service,defineCalls=0,draftCalls=0,requestId='',outputId='',sourceMount='',artifactMount='';
 const errors:unknown[]=[],seen:string[]=[];
 const server=createServer(async(req,res)=>{
  try{
   assert.equal(req.url,'/v1/chat/completions');const chunks:Buffer[]=[];for await(const c of req)chunks.push(Buffer.from(c));const p=JSON.parse(Buffer.concat(chunks).toString());
   const tools=p.tools.map((tool:any)=>tool.function),tool=(name:string)=>tools.find((tool:any)=>tool.name===name);
   const result=(id:string)=>{const message=p.messages.find((m:any)=>m.role==='tool'&&m.tool_call_id===id);return message?String(message.content):undefined;};
   const next=(id:string,name:string,args:unknown)=>{seen.push(id);reply(res,p.model,{id,name,args});};
   const policy=p.messages.filter((m:any)=>m.role==='system').map((m:any)=>m.content).join('\n');
   assert.match(policy,/新成果尚无outputIds时先write_draft/);assert.match(policy,/prd\.sourceIds/);assert.match(policy,/不能传顶层sourceIds/);
   if(!result('load')){next('load','load_tool_group',{group:'task_acceptance'});return;}
   assert.match(tool('define_task_acceptance').description,/先write_draft保存完整首稿/);
   assert.match(tool('define_task_acceptance').description,/来源仅放在prd\.sourceIds/);
   assert.equal(tool('define_task_acceptance').parameters.additionalProperties,false);
   assert.equal(tool('define_task_acceptance').parameters.properties.sourceIds,undefined);
   assert(tool('define_task_acceptance').parameters.properties.prd.properties.sourceIds);
   if(!result('requests')){next('requests','get_task_acceptance',{section:'requests'});return;}
   requestId=JSON.parse(result('requests')!).items[0].id;
   if(!result('outputs-before')){next('outputs-before','get_task_acceptance',{section:'outputs'});return;}
   const before=JSON.parse(result('outputs-before')!);assert.equal(before.items.length,existing?1:0);
   if(!existing&&!result('draft')){next('draft','write_draft',{mountId:artifactMount,path:'note.md',content:'# 记录\n\n保留真实请求'});return;}
   if(!result('outputs-current')){next('outputs-current','get_task_acceptance',{section:'outputs'});return;}
   const current=JSON.parse(result('outputs-current')!);assert.equal(current.items.length,1);outputId=current.items[0].id;
   if(existing)assert.equal(outputId,before.items[0].id);
   const criterion={id:'readable-note',text:'保留真实请求',requestIds:[requestId],outputIds:[outputId],checker:{kind:'text_assertion',expected:'保留真实请求'}};
   if(!result('illegal-top')){next('illegal-top','define_task_acceptance',{sourceIds:[],criteria:[criterion]});return;}
   assert.match(result('illegal-top')!,/Validation failed/);
   if(!result('illegal-empty')){next('illegal-empty','define_task_acceptance',{criteria:[{...criterion,outputIds:[]}]});return;}
   assert.match(result('illegal-empty')!,/Validation failed/);
   if(!result('illegal-host-id')){next('illegal-host-id','define_task_acceptance',{criteria:[{...criterion,outputIds:['not-a-host-output']}]});return;}
   assert.match(result('illegal-host-id')!,/TASK_ACCEPTANCE_OUTPUT_NOT_FOUND/);
   if(!result('legal')){next('legal','define_task_acceptance',{prd:{sourceIds:[]},criteria:[criterion]});return;}
   assert.equal(JSON.parse(result('legal')!).criterionCount,1);reply(res,p.model);
  }catch(error){errors.push(error);if(!res.headersSent)res.writeHead(500);res.end('fixture-failed');}
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const addr=server.address();assert(addr&&typeof addr!=='string');
 service=new Service(store,()=> 'local-fixture',()=>{},async(o:RuntimeOptions)=>{
  sourceMount=o.mounts.find(m=>m.name==='资源')!.id;artifactMount=o.mounts.find(m=>m.name==='成果')!.id;
  if(existing){const change=await o.files.draft(artifactMount,'note.md','# 记录\n\n保留真实请求',o.runId);o.draft(change);}
  return createRuntime({...o,model:{id:'local-only-fixture',baseUrl:`http://127.0.0.1:${addr.port}/v1`,protocol:'openai-completions',contextWindow:65536,maxTokens:12000},key:'local-placeholder',connections:[],observability:undefined,
   draft:change=>{draftCalls++;o.draft(change);},defineTaskAcceptance:async input=>{defineCalls++;return o.defineTaskAcceptance!(input);}});
 },{fetchModelMetadata:async()=>{throw Error('OFFLINE_FIXTURE');}});
 t.after(async()=>{service.dispose();await Promise.allSettled([...(service as any).agentIndex.queues.values()]);server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));store.close();await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:30});});
 await service.workspace(path.join(dir,'project'));service.setPermission('workspace_read','allow');service.setPermission('artifact_write','allow');
 const runId=await service.send(service.conversation(),'生成一份笔记，保留真实请求。');
 for(let i=0;i<1500;i++){const run=service.state.runs.find(r=>r.id===runId)!;if(run.finishedAt&&!service.active.has(runId)&&!service.starting.has(runId))break;await new Promise(r=>setTimeout(r,20));}
 assert.deepEqual(errors,[]);const run=service.state.runs.find(r=>r.id===runId)!;assert.equal(run.status,'succeeded',run.error);
 assert(sourceMount);assert.equal(defineCalls,2,'native invalid shape calls never reach Service, missing host ID and legal definition do');assert.equal(draftCalls,existing?0:1);
 assert.equal(service.state.changes.length,1);const view=await service.getTaskAcceptance(runId);assert.equal(view!.contract.outputs.length,1);assert.equal(view!.contract.outputs[0].id,outputId);assert.deepEqual(view!.contract.criteria[0].outputIds,[outputId]);
 assert(!seen.includes('draft')||!existing);
});
