import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createServer,type ServerResponse} from 'node:http';
import {createHash} from 'node:crypto';
import {Service} from '../main/service.js';
import {Store} from '../main/store.js';
import {ProductRecordsRepository,productRecordsWorkspaceIdentity} from '../main/product-records.js';
import type {RecordBusinessConstraintsInput,BindBusinessImplementationInput} from '../shared/business-rules.js';

// Synthetic rule values and deterministic loopback responses exercise actual
// Service -> Pi -> custom tool -> gateway -> persistence -> Pi serialization.
// They do not establish cloud-model quality or business acceptance.
type Payload={model:string;messages:Array<{role:string;content:unknown;tool_call_id?:string}>;tools?:Array<{function:{name:string}}>};
const sha=(text:string)=>createHash('sha256').update(text).digest('hex');
const toolNames=['record_business_constraints','bind_business_implementation','check_business_rules'];
function stream(response:ServerResponse,model:string,tool?:{id:string;name:string;args:unknown}){
 response.writeHead(200,{'content-type':'text/event-stream'});
 const event=(delta:unknown,finish_reason:string|null)=>response.write('data: '+JSON.stringify({id:'isolated-business-fixture',object:'chat.completion.chunk',created:1,model,choices:[{index:0,delta,finish_reason}]})+'\n\n');
 event({role:'assistant'},null);
 if(tool){event({tool_calls:[{index:0,id:tool.id,type:'function',function:{name:tool.name,arguments:JSON.stringify(tool.args)}}]},null);event({},'tool_calls');}
 else{event({content:'已核对来源与落实版本；候选解释和实际交互仍需人工核对。'},null);event({},'stop');}
 response.end('data: [DONE]\n\n');
}
async function terminal(service:Service,id:string){
 const deadline=Date.now()+15000;
 while(Date.now()<deadline){const run=service.state.runs.find(item=>item.id===id)!;if(['succeeded','failed','interrupted','cancelled','awaiting_plan'].includes(run.status)&&!service.active.size&&!service.starting.size)return run;await new Promise(resolve=>setTimeout(resolve,10));}
 service.cancel(id);throw Error('Isolated Pi business fixture timed out');
}
function toolResult(payload:Payload,id:string){const message=payload.messages.find(item=>item.role==='tool'&&item.tool_call_id===id);assert.ok(message,'Pi must send host tool result back to the HTTP fixture');assert.equal(typeof message.content,'string');return JSON.parse(message.content as string) as Record<string,any>;}

async function fixture(t:test.TestContext,mode:'build'|'plan'){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-business-runtime-'));
 const store=new Store(path.join(dir,'data')),requests:Payload[]=[],handlerErrors:Error[]=[],receipts:Record<string,any>[]=[];
 let recordInput:RecordBusinessConstraintsInput,bindInput:BindBusinessImplementationInput,requirementId='';
 const server=createServer(async(request,response)=>{
  try{
   assert.equal(request.method,'POST');assert.equal(request.url,'/v1/chat/completions');
   const chunks:Buffer[]=[];for await(const chunk of request)chunks.push(Buffer.from(chunk));
   const payload=JSON.parse(Buffer.concat(chunks).toString('utf8')) as Payload;requests.push(payload);
   const tools=new Set(payload.tools?.map(item=>item.function.name));
   if(mode==='build'&&!payload.messages.some(item=>item.tool_call_id==='load-business')){assert(!tools.has('record_business_constraints'));assert(tools.has('load_tool_group'));stream(response,payload.model,{id:'load-business',name:'load_tool_group',args:{group:'business_rules'}});return;}
   assert.ok(tools.has('check_business_rules'));
   if(mode==='plan'){assert.equal(tools.has('record_business_constraints'),false);assert.equal(tools.has('bind_business_implementation'),false);}
   else for(const name of toolNames)assert.ok(tools.has(name),'Build tool schema missing '+name);
   const count=payload.messages.filter(item=>item.role==='tool'&&item.tool_call_id!=='load-business').length;
   if(mode==='plan'){
    if(count===0)stream(response,payload.model,{id:'plan-check',name:'check_business_rules',args:{requirementId}});
    else{receipts.push(toolResult(payload,'plan-check'));stream(response,payload.model);}
    return;
   }
   if(count===0)stream(response,payload.model,{id:'business-record',name:toolNames[0],args:recordInput});
   else if(count===1){receipts.push(toolResult(payload,'business-record'));stream(response,payload.model,{id:'business-bind',name:toolNames[1],args:bindInput});}
   else if(count===2){receipts.push(toolResult(payload,'business-bind'));stream(response,payload.model,{id:'business-check',name:toolNames[2],args:{requirementId,mountId:bindInput.bindings[0].mountId,path:bindInput.bindings[0].path}});}
   else{receipts.push(toolResult(payload,'business-check'));stream(response,payload.model);}
  }catch(error){handlerErrors.push(error as Error);if(!response.headersSent)response.writeHead(500);response.end('isolated-fixture-failed');}
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const address=server.address();assert.ok(address&&typeof address!=='string');
 const service=new Service(store,()=> 'local-fixture-placeholder',()=>{});
 t.after(async()=>{
  for(const run of service.state.runs)service.cancel(run.id);
  const deadline=Date.now()+5000;while((service.active.size||service.starting.size)&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(service.active.size+service.starting.size,0,'runtime must settle before Store closes');
  service.dispose();await Promise.allSettled([...(service as any).agentIndex.queues.values()]);store.close();
  server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));
  const relative=path.relative(path.resolve(os.tmpdir()),path.resolve(dir));assert.ok(relative&&!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep));
  await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:30});
 });
 await service.workspace(path.join(dir,'project'));
 service.setPermission('workspace_read','allow');service.setPermission('artifact_write','allow');
 const tree=await service.projectTreeGet();
 const resourceNode=tree.appliedNodes.find(node=>node.role==='resource')!,outputNode=tree.appliedNodes.find(node=>node.role==='output')!;
 const mounted=(relative:string)=>service.state.mounts.find(mount=>path.resolve(mount.path).toLowerCase()===path.resolve(service.state.root,relative).toLowerCase())!;
 const resource=mounted(resourceNode.path!),output=mounted(outputNode.path!);
 assert.ok(resource&&output,'project roles must locate actual mounts');
 const sourcePath='参考资料/机会字段.txt',source='工作表：机会门店主数据\n字段：网点编码；来源：自动计算；新增页面展示：是；前端发起变更：否。\n编码规则：JHWD加10位顺序码。\n';
 const prdPath='PRD/机会门店.md',prd='# 机会门店\n网点编码由系统自动计算，新建页面展示但不可手工编辑。\n本页面仅用于模拟，分配时机待业务确认。\n';
 await fs.writeFile(path.join(resource.path,sourcePath),source);await fs.writeFile(path.join(output.path,prdPath),prd);
 const conversation=service.conversation(undefined,'Isolated business tools '+mode);
 const requirement=await service.recordRequirement(conversation,{title:'机会门店字段',summary:'候选字段规则与成果位置',status:'draft',sources:[{id:'source-1',mountId:resource.id,relativePath:sourcePath,locator:'机会门店字段表'}],assumptions:[],pendingQuestions:[],confirmedFacts:[]});requirementId=requirement.id;
 const candidate={id:'runtime-code-rule',fieldKey:'网点编码',dimension:'change_allowed' as const,rawValue:'否',interpretation:'候选解释：禁止前端修改，业务正确性待人工确认。',stage:'机会门店新建',status:'candidate' as const,sourceRefIds:['source-1'],sourceEvidence:[{sourceRefId:'source-1',locator:'机会门店字段表：网点编码',startLine:1,endLine:2,quote:source.split('\n')[1]}]};
 await service.recordBusinessConstraints(conversation,{requirementId,constraints:[{...candidate,id:'historical-unrelated-rule',fieldKey:'历史字段',dimension:'other'}]});
 recordInput={requirementId,constraints:[candidate]};
 bindInput={requirementId,bindings:[{constraintId:candidate.id,mountId:output.id,path:prdPath,locator:'PRD编码规则',startLine:2,endLine:2,quote:prd.split('\n')[1]}]};
 const entry={id:'isolated-business-model',provider:'local-fixture',name:'Isolated business tool runtime',modelId:'business-tools-fixture',protocol:'openai-completions' as const,baseUrl:`http://127.0.0.1:${address.port}/v1`,hasKey:true};
 service.state.models=[entry];service.state.defaultModelId=entry.id;service.state.model={baseUrl:entry.baseUrl,id:entry.modelId,hasKey:true};service.save();
 const repository=()=>new ProductRecordsRepository(store,{key:productRecordsWorkspaceIdentity(service.state.root).key});
 return{service,store,requests,handlerErrors,receipts,recordInput,bindInput,conversation,source,sourcePath,resource,prd,prdPath,output,requirementId,repository};
}

test('真实Pi通过本地HTTP连续记录候选规则→绑定成果→核对，网关和持久化保持候选而非业务passed',async t=>{
 const f=await fixture(t,'build');
 const run=await terminal(f.service,await f.service.send(f.conversation,'BUSINESS-RUNTIME-BUILD：记录资料中的编码候选约束、绑定现有PRD，并核对版本。','build','standard'));
 assert.equal(run.status,'succeeded',run.error);assert.deepEqual(f.handlerErrors,[]);assert.equal(f.requests.length,5);assert.equal(f.receipts.length,3);
 const operations=f.store.operationsForRun(run.id);
 for(const name of toolNames){const operation=operations.find(item=>item.tool===name);assert.ok(operation,'gateway operation missing '+name);assert.equal(operation.state,'succeeded');}
 const requirement=f.repository().snapshot().requirements.find(item=>item.id===f.requirementId)!;
 assert.equal(requirement.status,'draft');assert.equal(requirement.confirmedFacts.length,0);assert.equal(requirement.businessConstraints?.length,2);
 const candidate=requirement.businessConstraints!.find(item=>item.id==='runtime-code-rule')!;
 assert.equal(candidate.status,'candidate');assert.equal(candidate.sourceSnapshots[0].contentHash,sha(f.source));
 assert.equal(requirement.implementationRefs?.length,1);assert.equal(requirement.implementationRefs![0].contentHash,sha(f.prd));assert.equal(requirement.implementationRefs![0].sourceConversationId,f.conversation);assert.equal(requirement.implementationRefs![0].artifactId,undefined);
 const checked=f.receipts[2];assert.equal(checked.items.find((item:any)=>item.constraint.id===candidate.id).status,'current');assert.equal(checked.items.find((item:any)=>item.constraint.id===candidate.id).constraint.status,'candidate');assert.equal(checked.counts.current,1);assert.equal(checked.counts.unmapped,1);assert.match(checked.notice,/人工核对/);assert.equal(checked.passed,undefined);
 for(const receipt of f.receipts.slice(0,2)){
  const serialized=JSON.stringify(receipt);assert.ok(serialized.includes(f.requirementId),'receipt must identify requirement');assert.equal(receipt.businessConstraints,undefined);assert.equal(receipt.implementationRefs,undefined);assert.equal(receipt.sourceRefs,undefined);assert.equal(serialized.includes('historical-unrelated-rule'),false,'mutation receipt must not return previous rule history');assert.equal(serialized.includes('sourceEvidence'),false,'mutation receipt must not repeat evidence bodies');
 }
 assert.equal(await fs.readFile(path.join(f.resource.path,f.sourcePath),'utf8'),f.source);assert.equal(await fs.readFile(path.join(f.output.path,f.prdPath),'utf8'),f.prd);assert.equal(f.service.state.changes.length,0);
});

test('真实Pi的Plan仅开放业务核对；记录规则和绑定工具不进入工具清单且宿主拒绝写入',async t=>{
 const f=await fixture(t,'plan'),before=f.repository().snapshot();
 const run=await terminal(f.service,await f.service.send(f.conversation,'BUSINESS-RUNTIME-PLAN：只核对已有候选规则来源。','plan','standard'));
 assert.equal(run.status,'awaiting_plan',run.error);assert.deepEqual(f.handlerErrors,[]);assert.equal(f.requests.length,2);assert.equal(f.receipts.length,1);
 assert.equal(f.store.operationsForRun(run.id).find(item=>item.tool==='check_business_rules')?.state,'succeeded');
 assert.equal(f.store.operationsForRun(run.id).some(item=>['record_business_constraints','bind_business_implementation'].includes(item.tool)),false);
 assert.equal(f.receipts[0].items[0].sourceChecks[0].status,'current');assert.equal(f.receipts[0].items[0].status,'unmapped');
 await assert.rejects(f.service.recordBusinessConstraints(f.conversation,f.recordInput,run.id),/PLAN_TOOL_DENIED/);
 await assert.rejects(f.service.bindBusinessImplementation(f.conversation,f.bindInput,run.id),/PLAN_TOOL_DENIED/);
 assert.deepEqual(f.repository().snapshot(),before);assert.equal(f.service.state.changes.length,0);
});
