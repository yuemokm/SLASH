import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createServer,type ServerResponse} from 'node:http';
import {createRuntime,assertRuntimeSucceeded,type RuntimeOptions} from '../main/agent.js';
import {Files} from '../main/files.js';
import {Store} from '../main/store.js';
import {PrototypeAcceptanceDomain,type PrototypeRunner} from '../main/prototype-acceptance.js';
import type {Change} from '../shared/types.js';

// Real Pi schema/tool serialization and real Store/Files/draft domain. The HTTP
// replies and browser observations are fixtures, not a cloud or visual verdict.
type Payload={model:string;tools:Array<{function:{name:string;parameters:Record<string,any>}}>;
 messages:Array<{role:string;content:unknown;tool_call_id?:string}>};
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
const html='<!doctype html><html><body><main id="content">真实pending</main></body></html>';
const rawCase={id:'text',title:'正文',steps:[{action:'assert',assertion:'text',selector:'#content',expected:'真实pending'}]};
function reply(res:ServerResponse,model:string,tool?:{id:string;name:string;args:unknown}){
 res.writeHead(200,{'content-type':'text/event-stream'});const event=(delta:unknown,finish_reason:string|null)=>res.write('data: '+JSON.stringify({id:'local-prototype',object:'chat.completion.chunk',created:1,model,choices:[{index:0,delta,finish_reason}]})+'\n\n');
 event({role:'assistant'},null);if(tool){event({tool_calls:[{index:0,id:tool.id,type:'function',function:{name:tool.name,arguments:JSON.stringify(tool.args)}}]},null);event({},'tool_calls');}else{event({content:'仅完成fixture工具链，业务和真实视觉未验证。'},null);event({},'stop');}res.end('data: [DONE]\n\n');
}
function response(payload:Payload,id:string){const message=payload.messages.find(m=>m.role==='tool'&&m.tool_call_id===id);assert(message,'Pi must deliver tool receipt');assert.equal(typeof message.content,'string');return message.content as string;}
async function fixture(t:test.TestContext,mode:'build'|'plan'){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-prototype-pi-')),root=path.join(dir,'project');await fs.mkdir(root);const store=new Store(path.join(dir,'profile')),mounts=[{id:'out',name:'成果',path:root,enabled:true,write:true}],files=new Files(()=>mounts);
 const entry:Change={id:'pending-id',runId:'owner',mountId:'out',path:'index.html',before:null,content:html,status:'pending',createdAt:new Date().toISOString()},changes=[entry],target={mountId:'out',path:entry.path,draft:{changeId:entry.id,parentRunId:entry.runId,expectedContentHash:sha(html)}};
 let browserCalls=0;const runner:PrototypeRunner=async input=>{browserCalls++;assert.equal(input.snapshot.get(input.entryPath)!.bytes.toString(),html);return{status:'passed',notice:'mock-browser-only',screenshots:input.cases.map(c=>({caseId:c.id,bytes:Buffer.from([137,80,78,71,13,10,26,10,0])})),cases:input.cases.map(c=>({caseId:c.id,status:'passed',steps:c.steps.map((_,stepIndex)=>({stepIndex,status:'passed',observed:'真实pending'}))}))};};
 const ctx={mode:'build' as const,runId:'owner'},domain=new PrototypeAcceptanceDomain({store,files,root:()=>root,authorization:()=>JSON.stringify(mounts),assertRead:()=>{},assertWrite:()=>{},changes:()=>changes,runActive:()=>true,assertRunAccess:id=>{assert.equal(id,'owner');},runner});
 const definition={...target,title:'候选正文用例',cases:[rawCase]};if(mode==='plan')await domain.save(definition,ctx);
 const requests:Payload[]=[],errors:unknown[]=[],results:Record<string,any>={};
 const server=createServer(async(req,res)=>{try{
  assert.equal(req.url,'/v1/chat/completions');const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));const p=JSON.parse(Buffer.concat(chunks).toString()) as Payload;requests.push(p);
  const byName=new Map(p.tools.map(tool=>[tool.function.name,tool.function.parameters]));
  if(mode==='build'&&!p.messages.some(m=>m.tool_call_id==='load-prototype')){assert(!byName.has('define_prototype_acceptance'));assert(byName.has('load_tool_group'));reply(res,p.model,{id:'load-prototype',name:'load_tool_group',args:{group:'prototype'}});return;}
  assert(byName.has('get_prototype_acceptance'));assert(!byName.get('get_prototype_acceptance')!.required?.includes('limit'));
  const count=p.messages.filter(m=>m.role==='tool'&&m.tool_call_id!=='load-prototype'&&m.tool_call_id!=='load-records').length;
  if(mode==='plan'){assert(!byName.has('define_prototype_acceptance'));assert(!byName.has('run_prototype_acceptance'));if(!count)reply(res,p.model,{id:'plan-get',name:'get_prototype_acceptance',args:target});else{results.plan=JSON.parse(response(p,'plan-get'));reply(res,p.model);}return;}
  assert(byName.has('define_prototype_acceptance'));assert(!byName.get('define_prototype_acceptance')!.required?.includes('sourceRefs'));
  if(count===0)reply(res,p.model,{id:'define',name:'define_prototype_acceptance',args:definition});
  else if(count===1){results.define=JSON.parse(response(p,'define'));assert(results.define.runRequest);reply(res,p.model,{id:'wrong-id',name:'run_prototype_acceptance',args:{...results.define.runRequest.input,artifactId:results.define.specId}});}
  else if(count===2){results.error=response(p,'wrong-id');assert.match(results.error,/ARTIFACT_NOT_FOUND/);assert.match(results.error,/specId/);reply(res,p.model,{id:'get',name:'get_prototype_acceptance',args:target});}
  else if(count===3){results.get=JSON.parse(response(p,'get'));assert(results.get.runRequest);reply(res,p.model,{id:'run',name:'run_prototype_acceptance',args:results.get.runRequest.input});}
  else if(count===4){results.run=JSON.parse(response(p,'run'));if(!p.messages.some(m=>m.tool_call_id==='load-records'))reply(res,p.model,{id:'load-records',name:'load_tool_group',args:{group:'product_records'}});else{assert(byName.has('register_artifact'));reply(res,p.model,{id:'register',name:'register_artifact',args:{mountId:'out',relativePath:'index.html',title:'pending',kind:'prototype'}});}}
  else{results.register=response(p,'register');assert.match(results.register,/ENOENT/);assert.match(results.register,/无需先应用或注册/);reply(res,p.model);}
 }catch(error){errors.push(error);if(!res.headersSent)res.writeHead(500);res.end('local-fixture-failed');}});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert(address&&typeof address!=='string');
 const runtime=await createRuntime({dir:path.join(dir,'agent'),workspaceRoot:root,model:{id:'fixture',baseUrl:`http://127.0.0.1:${address.port}/v1`,protocol:'openai-completions',contextWindow:65536,maxTokens:12000},key:'local-placeholder',files,mounts,connections:[],runId:'owner',mode,listConnections:()=>[],delta:()=>{},redact:(text:string)=>text,log:async(_name,args,fn)=>fn(),getPrototypeAcceptance:input=>domain.get(input,{mode,runId:'owner'}),savePrototypeAcceptance:input=>domain.save(input,ctx),runPrototypeAcceptance:input=>domain.run({...input as object,mode:'build'},ctx),registerArtifact:async input=>{await fs.readFile(path.join(root,input.relativePath));throw Error('UNREACHABLE_REGISTER');}} as RuntimeOptions);
 t.after(async()=>{await runtime.abort();runtime.dispose();domain.dispose();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await new Promise(r=>setTimeout(r,20));store.close();await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:30});});
 return{runtime,requests,errors,results,root,entry,target,domain,browserCalls:()=>browserCalls};
}
test('真实Pi省略defaults定义pending→混用specId拒绝→复制宿主runRequest执行，未注册不要求apply',{timeout:30000},async t=>{
 const f=await fixture(t,'build');await f.runtime.prompt('LOCAL-FIXTURE：定义pending具体用例并执行。');assertRuntimeSucceeded(f.runtime);assert.deepEqual(f.errors,[]);assert.equal(f.requests.length,8);assert.equal(f.browserCalls(),1);
 assert.equal(f.results.define.targetState,'current');assert.equal(f.results.define.runRequest.input.artifactId,undefined);assert.equal(f.results.get.spec.cases[0].steps[0].match,'equals');assert.equal(f.results.run.latestReport.evidence.status,'passed');assert.equal(f.entry.content,html);assert.equal(f.entry.status,'pending');await assert.rejects(fs.stat(path.join(f.root,'index.html')),/ENOENT/);
});
test('真实Pi Plan仅查询宿主pending请求，无定义或执行工具且不改变规格/正式文件',{timeout:30000},async t=>{
 const f=await fixture(t,'plan'),before=(await f.domain.get(f.target)).spec;await f.runtime.prompt('LOCAL-PLAN：只查看当前草稿候选用例。');assertRuntimeSucceeded(f.runtime);assert.deepEqual(f.errors,[]);assert.equal(f.requests.length,2);assert.equal(f.browserCalls(),0);assert.equal(f.results.plan.targetState,'current');assert.deepEqual(f.results.plan.spec,before);assert.deepEqual((await f.domain.get(f.target)).spec,before);await assert.rejects(fs.stat(path.join(f.root,'index.html')),/ENOENT/);
});
