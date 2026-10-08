import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {buildKnowledgeDocument,buildTemplateDocument,assertRuntimeSucceeded,type RuntimeOptions} from '../main/agent.js';
import {Service} from '../main/service.js';
import {Store} from '../main/store.js';
import type {ExternalActionProposal,State} from '../shared/types.js';
import {ProductRecordsRepository,productRecordsWorkspaceIdentity} from '../main/product-records.js';
import {createHash} from 'node:crypto';

const waitFor=async(predicate:()=>boolean,timeout=3000)=>{const until=Date.now()+timeout;while(Date.now()<until){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('等待运行状态超时');};
const assistant=(stopReason:string,errorMessage?:string)=>({role:'assistant',stopReason,errorMessage,content:[],api:'openai-completions',provider:'baishan',model:'test',usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},timestamp:Date.now()});
function runtime(messages:unknown[],prompt:()=>Promise<void>){return{sessionFile:'session.jsonl',messages,prompt,abort:async()=>{},dispose:()=>{}};}

test('模板结构与知识状态执行确定性校验',()=>{
 const document=buildTemplateDocument({mountId:'m',path:'template.json',title:'标准 PRD',sections:[{id:'details',title:'详情',parentId:'overview',order:2,required:false},{id:'overview',title:'概述',order:1,required:true}]});
 const parsed=JSON.parse(document) as {schemaVersion:number;sections:Array<{id:string}>};assert.equal(parsed.schemaVersion,1);assert.deepEqual(parsed.sections.map(s=>s.id),['overview','details']);
 assert.throws(()=>buildTemplateDocument({mountId:'m',path:'template.json',title:'坏模板',sections:[{id:'a',title:'A',parentId:'b',order:1,required:true},{id:'b',title:'B',parentId:'a',order:2,required:true}]}),/循环/);
 assert.throws(()=>buildKnowledgeDocument({mountId:'m',path:'rule.md',id:'risk-review',kind:'rule',status:'confirmed',title:'高风险复核',scope:'客户准入',summary:'高风险客户需要风控复核。',sourceRefs:['PRD.md#risk']}),/confirmationEvidence/);
 const knowledge=buildKnowledgeDocument({mountId:'m',path:'rule.md',id:'risk-review',kind:'rule',status:'draft',title:'高风险复核',scope:'客户准入',summary:'高风险客户需要风控复核。',sourceRefs:['PRD.md#risk']});assert.match(knowledge,/status: "draft"/);assert.match(knowledge,/PRD\.md#risk/);
});

test('归档会话可以永久删除，活动会话必须先归档',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pm-conversation-delete-'));const store=new Store(path.join(dir,'data'));t.after(async()=>{store.close();await fs.rm(dir,{recursive:true,force:true});});
 const service=new Service(store,()=> 'test-key',()=>{},async()=>runtime([assistant('stop')],async()=>{}) as never);
 await service.workspace(path.join(dir,'workspace'));
 const archivedId=service.conversation(undefined,'待删除');const activeId=service.conversation(undefined,'保留');
 service.conversation(archivedId,undefined,true);
 assert.throws(()=>service.deleteConversation(activeId),/只能删除已归档会话/);
 assert.equal(service.deleteConversation(archivedId),true);
 assert.equal(service.state.conversations.some(item=>item.id===archivedId),false);
 assert.equal(service.state.conversations.some(item=>item.id===activeId),true);
});

test('Pi error、aborted 与非终止消息不能标记成功',()=>{
 assert.throws(()=>assertRuntimeSucceeded(runtime([assistant('error','provider failed')],async()=>{}) as never),/MODEL_RESPONSE_ERROR/);
 assert.throws(()=>assertRuntimeSucceeded(runtime([assistant('aborted')],async()=>{}) as never),/MODEL_RESPONSE_ABORTED/);
 assert.throws(()=>assertRuntimeSucceeded(runtime([assistant('aborted','OpenAI Responses stream ended before a terminal response event')],async()=>{}) as never),/MODEL_RESPONSE_ABORTED: OpenAI Responses stream ended before a terminal response event/);
 assert.throws(()=>assertRuntimeSucceeded(runtime([assistant('length')],async()=>{}) as never),/MODEL_OUTPUT_LIMIT/);
 assert.doesNotThrow(()=>assertRuntimeSucceeded(runtime([assistant('stop')],async()=>{}) as never));
});

test('Service 保存会话映射并把模型 error 记为 failed',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pm-runtime-error-'));
 let captured:RuntimeOptions|undefined;
 const store=new Store(path.join(dir,'data'));t.after(async()=>{store.close();await fs.rm(dir,{recursive:true,force:true});});
 const service=new Service(store,()=> 'test-key',()=>{},async options=>{captured=options;return runtime([assistant('error','simulated provider error')],async()=>{}) as never;});
 const root=path.join(dir,'workspace');await service.workspace(root);await fs.writeFile(path.join(root,'AGENTS.md'),'# 用户规则\n只使用确认过的业务术语。\n');
 service.state.models=[{id:'model-anthropic',provider:'custom',name:'Claude 兼容',baseUrl:'https://models.example/v1',modelId:'claude-test',protocol:'anthropic-messages',hasKey:true}];service.state.defaultModelId='model-anthropic';service.save();
 const conversationId=service.conversation();const runId=await service.send(conversationId,'测试错误返回');await waitFor(()=>service.state.runs.find(r=>r.id===runId)?.status==='failed');
 const run=service.state.runs.find(r=>r.id===runId);assert.match(run?.error??'',/MODEL_RESPONSE_ERROR/);assert.equal(store.get('session:'+conversationId,''),'session.jsonl');assert.match(captured?.workspaceRules??'',/用户规则/);
 assert.equal(captured?.model.protocol,'anthropic-messages');assert.equal(captured?.model.id,'claude-test');assert.equal(captured?.model.baseUrl,'https://models.example/v1');
});

test('Run 保存任务计划、阶段时间线并在成功后完成计划',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pm-run-plan-'));const store=new Store(path.join(dir,'data'));t.after(async()=>{store.close();await fs.rm(dir,{recursive:true,force:true});});
 const service=new Service(store,()=> 'test-key',()=>{},async()=>runtime([assistant('stop')],async()=>{}) as never);
 await service.workspace(path.join(dir,'workspace'));const conversationId=service.conversation();const runId=await service.send(conversationId,'设计一个订单管理 HTML 交互原型');
 const queued=service.state.runs.find(run=>run.id===runId);assert.ok(['queued','preparing_context','starting_model','generating'].includes(queued?.phase??''));assert.equal(queued?.plan?.source,'heuristic');assert.match(queued?.plan?.steps.join(' ')??'',/HTML/);assert.equal(queued?.attempt,1);
 await waitFor(()=>service.state.runs.find(run=>run.id===runId)?.status==='succeeded');const run=service.state.runs.find(item=>item.id===runId);assert.equal(run?.phase,'completed');assert.equal(run?.plan?.status,'completed');assert.ok(run?.finishedAt);assert.ok(run?.updatedAt);assert.equal(run?.resumable,false);const checkpoint=store.get<{safeToResume:boolean;phase:string;completedOperations:unknown[]}>(`run-checkpoint:${runId}`,null as never);assert.equal(checkpoint.safeToResume,false);assert.equal(checkpoint.phase,'completed');assert.ok(Array.isArray(checkpoint.completedOperations));const manifest=store.get<{sourceRefs?:unknown[];truncations?:unknown[]}>(`context-manifest:${runId}`,null as never);assert.deepEqual(manifest.sourceRefs,[]);assert.deepEqual(manifest.truncations,[]);
});

test('中断或模型失败的 Run 可从原会话创建带来源引用的继续任务',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pm-run-resume-'));const store=new Store(path.join(dir,'data'));t.after(async()=>{store.close();await fs.rm(dir,{recursive:true,force:true});});let attempt=0;
 const service=new Service(store,()=> 'test-key',()=>{},async()=>{attempt+=1;return runtime([assistant(attempt===1?'error':'stop',attempt===1?'第一次失败':undefined)],async()=>{}) as never;});
 await service.workspace(path.join(dir,'workspace'));const conversationId=service.conversation();const firstId=await service.send(conversationId,'整理客户准入 PRD');await waitFor(()=>service.state.runs.find(run=>run.id===firstId)?.status==='failed');assert.equal(service.state.runs.find(run=>run.id===firstId)?.resumable,true);const checkpoint=store.get<{safeToResume:boolean;phase:string;assistantText:string}>(`run-checkpoint:${firstId}`,null as never);assert.equal(checkpoint.safeToResume,true);assert.equal(checkpoint.phase,'failed');assert.equal(checkpoint.assistantText,'');
 const nextId=await service.resumeRun(firstId);const next=service.state.runs.find(run=>run.id===nextId);assert.equal(next?.resumedFromRunId,firstId);assert.equal(next?.attempt,2);await waitFor(()=>service.state.runs.find(run=>run.id===nextId)?.status==='succeeded');
});

test('工具调用预算为 120 次且第 121 次拒绝执行并记录失败',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pm-runtime-budget-'));
 const store=new Store(path.join(dir,'data'));t.after(async()=>{store.close();await fs.rm(dir,{recursive:true,force:true});});
 let executed=0;const service=new Service(store,()=> 'test-key',()=>{},async options=>runtime([assistant('stop')],async()=>{for(let i=0;i<121;i++)await options.log('budget_probe',{i},async()=>{executed++;return{i};});}) as never);
 await service.workspace(path.join(dir,'workspace'));const conversationId=service.conversation();const runId=await service.send(conversationId,'测试工具预算');await waitFor(()=>service.state.runs.find(r=>r.id===runId)?.status==='failed');
 assert.match(service.state.runs.find(r=>r.id===runId)?.error??'',/TOOL_BUDGET_EXCEEDED: 单次任务最多调用 120 次工具/);assert.equal(executed,120);
 const failed=store.db.prepare("SELECT COUNT(*) AS count FROM operations WHERE run_id=? AND state='failed'").get(runId) as {count:number};assert.equal(failed.count,1);
});

test('启动阶段取消不会派发模型请求或新工具',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pm-runtime-cancel-'));
 let prompted=false;const store=new Store(path.join(dir,'data'));t.after(async()=>{store.close();await fs.rm(dir,{recursive:true,force:true});});
 const service=new Service(store,()=> 'test-key',()=>{},async()=>{await new Promise(resolve=>setTimeout(resolve,30));return runtime([assistant('stop')],async()=>{prompted=true;}) as never;});
 await service.workspace(path.join(dir,'workspace'));const conversationId=service.conversation();const runId=await service.send(conversationId,'立即取消');await assert.rejects(service.workspace(path.join(dir,'other-workspace')),/WORKSPACE_BUSY/);service.cancel(runId);await waitFor(()=>service.state.runs.find(r=>r.id===runId)?.status==='cancelled');
 assert.equal(prompted,false);
});

test('受控子 Agent 真实读取路径继承父 Run 权限并持久化结果',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pm-subagent-run-'));const store=new Store(path.join(dir,'data'));t.after(async()=>{store.close();await fs.rm(dir,{recursive:true,force:true});});
 const service=new Service(store,()=> 'test-key',()=>{},async()=>runtime([assistant('stop')],async()=>{}) as never);
 await service.workspace(path.join(dir,'workspace'));const mount=service.state.mounts.find(item=>item.name==='资源')??service.state.mounts[0];assert.ok(mount);await fs.writeFile(path.join(mount.path,'evidence.md'),'权威依据');
 const conversationId=service.conversation();const runId=await service.send(conversationId,'准备研究');await waitFor(()=>service.state.runs.find(item=>item.id===runId)?.status==='succeeded');
 const result=await service.runSubAgent({parentRunId:runId,tool:'read_file',input:{mountId:mount.id,path:'evidence.md'},capability:'workspace_read',mountId:mount.id});
 assert.equal((result as {content:string}).content,'权威依据');assert.equal(store.get<Array<unknown>>(`sub-agent-results:${runId}`,[]).length,1);
});

test('工作空间同路径复用挂载，跨路径隔离并可恢复历史',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pm-workspaces-'));
 const store=new Store(path.join(dir,'data'));t.after(async()=>{store.close();await fs.rm(dir,{recursive:true,force:true});});const service=new Service(store,()=> 'test-key',()=>{});
 const first=path.join(dir,'one'),second=path.join(dir,'two');await service.workspace(first);const mountIds=service.state.mounts.map(m=>m.id);const conversationId=service.conversation(undefined,'空间一会话');
 service.state.connections.push({id:'mcp-1',name:'测试 MCP',kind:'mcp',command:'mcp.exe',args:[],enabled:true});service.save();
 await service.createExternalActionProposal('run-1',conversationId,{kind:'mcp_call',connectionId:'mcp-1',target:'明确站点 A',userAuthorizationExcerpt:'用户要求发布到站点 A',tool:'publish',args:{site:'A'}});
 await service.workspace(first);assert.deepEqual(service.state.mounts.map(m=>m.id),mountIds);assert.equal(service.state.conversations[0]?.id,conversationId);assert.equal(service.listPendingExternalActions().length,1);
 await service.workspace(second);assert.equal(service.state.conversations.length,0);assert.equal(service.state.changes.length,0);assert.equal(service.listPendingExternalActions().length,0);assert.equal(service.state.connections[0]?.id,'mcp-1');
 await service.workspace(first);assert.deepEqual(service.state.mounts.map(m=>m.id),mountIds);assert.equal(service.state.conversations[0]?.id,conversationId);assert.equal(service.listPendingExternalActions()[0]?.target,'明确站点 A');
});

test('项目注册表按工作空间分组并可恢复默认项目',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pm-projects-'));const data=path.join(dir,'data');const store=new Store(data);t.after(async()=>{await fs.rm(dir,{recursive:true,force:true});});const service=new Service(store,()=> 'test-key',()=>{});
 const first=path.join(dir,'one'),second=path.join(dir,'two');await service.workspace(first);const conversation=service.conversation(undefined,'项目一会话');let projects=service.listProjects();assert.equal(projects.currentProjectId,projects.defaultProjectId);assert.equal(projects.projects[0]?.conversationCount,1);assert.deepEqual(projects.projects[0]?.conversations?.map(item=>item.title),['项目一会话']);assert.equal('messages' in (projects.projects[0]?.conversations?.[0]??{}),false);
 await service.workspace(second);projects=service.listProjects();assert.equal(projects.projects.find(item=>item.root===first)?.conversationCount,1);const firstId=projects.projects.find(item=>item.root===first)?.id;assert.ok(firstId);await service.setDefaultProject({id:firstId});assert.equal(path.resolve(service.state.root),path.resolve(first));assert.equal(service.state.conversations[0]?.id,conversation);
 store.close();const store2=new Store(data);const restored=new Service(store2,()=> 'test-key',()=>{});assert.equal(path.resolve(restored.state.root),path.resolve(first));assert.equal(restored.listProjects().defaultProjectId,firstId);store2.close();
});

test('拖入文件按类别复制到当前项目并为冲突文件生成新名称',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pm-project-import-'));const store=new Store(path.join(dir,'data'));t.after(async()=>{store.close();await fs.rm(dir,{recursive:true,force:true});});const service=new Service(store,()=> 'test-key',()=>{});const root=path.join(dir,'workspace'),source=path.join(dir,'brief.md');await service.workspace(root);await fs.writeFile(source,'第一份');let imported=await service.importFiles([source],'reference');assert.equal(imported[0]?.path,path.join('参考资料','brief.md'));assert.equal(await fs.readFile(path.join(root,'资源','参考资料','brief.md'),'utf8'),'第一份');await fs.writeFile(path.join(root,'资源','参考资料','brief.md'),'已有版本');imported=await service.importFiles([source],'reference');assert.equal(imported[0]?.path,path.join('参考资料','brief (1).md'));await assert.rejects(service.importFiles([path.join(root,'资源')],'reference'),/IMPORT_FILE_ONLY/);
});

test('历史恢复生成新草稿并以当前内容作为版本基线',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pm-restore-'));
 const store=new Store(path.join(dir,'data'));t.after(async()=>{store.close();await fs.rm(dir,{recursive:true,force:true});});const service=new Service(store,()=> 'test-key',()=>{});
 await service.workspace(path.join(dir,'workspace'));const output=service.state.mounts.find(m=>m.name==='成果');assert.ok(output);
 const first=await service.files.draft(output.id,'PRD.md','第一版','run-1');service.state.changes.push(first);await service.apply(first.id);
 await fs.writeFile(path.join(output.path,'PRD.md'),'当前人工编辑');
 const restored=await service.restoreVersion(first.id,'run-2');const change=service.state.changes.find(c=>c.id===restored.changeId);assert.equal(change?.status,'pending');assert.equal(change?.content,'第一版');assert.equal(await fs.readFile(path.join(output.path,'PRD.md'),'utf8'),'当前人工编辑');await fs.writeFile(path.join(output.path,'PRD.md'),'恢复草稿生成后的再次编辑');
 await assert.rejects(service.apply(restored.changeId),/VERSION_CONFLICT/);
});

test('文档外部操作提案绑定审批时的内容哈希',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pm-delivery-hash-'));
 const store=new Store(path.join(dir,'data'));t.after(async()=>{store.close();await fs.rm(dir,{recursive:true,force:true});});const service=new Service(store,()=> 'test-key',()=>{});
 await service.workspace(path.join(dir,'workspace'));const output=service.state.mounts.find(m=>m.name==='成果');assert.ok(output);await fs.writeFile(path.join(output.path,'PRD.md'),'待发布版本');
 service.state.connections.push({id:'cli-1',name:'飞书 CLI',kind:'cli',command:'lark.exe',args:[],enabled:true,provider:'feishu'});service.save();const conversationId=service.conversation();
 const proposal=await service.createExternalActionProposal('run-1',conversationId,{kind:'document_delivery',connectionId:'cli-1',target:'飞书文档 123',userAuthorizationExcerpt:'用户要求更新飞书文档 123',mountId:output.id,path:'PRD.md',title:'PRD',provider:'feishu',remoteId:'123'});
 assert.match((proposal.request as {sourceHash:string}).sourceHash,/^[a-f0-9]{64}$/);const approved=service.approveExternalAction(proposal.id);assert.equal((approved.execution as {sourceHash:string}).sourceHash,(proposal.request as {sourceHash:string}).sourceHash);service.completeExternalAction(proposal.id,{operationId:'op-delivery',status:'succeeded',diagnostic:'已收到回执'});const records=store.get<Array<{artifactVersionHash?:string}>>('delivery-records',[]);assert.equal(records[0]?.artifactVersionHash,(proposal.request as {sourceHash:string}).sourceHash);
});

test('手动外部请求只登记待审批提案并写入操作记录',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pm-manual-external-proposal-'));const store=new Store(path.join(dir,'data'));t.after(async()=>{store.close();await fs.rm(dir,{recursive:true,force:true});});const service=new Service(store,()=> 'test-key',()=>{});
 await service.workspace(path.join(dir,'workspace'));service.state.connections.push({id:'mcp-manual',name:'手动 MCP',kind:'mcp',command:'mcp.exe',args:[],enabled:true});service.save();const conversationId=service.conversation();
 const proposal=await service.createManualExternalActionProposal({kind:'mcp_call',connectionId:'mcp-manual',target:'站点 A',userAuthorizationExcerpt:'用户在桌面确认发布',tool:'publish',args:{site:'A'},conversationId});
 assert.equal(proposal.status,'pending');assert.equal(service.listPendingExternalActions(conversationId)[0]?.id,proposal.id);assert.equal(store.operationsForRun(proposal.runId)[0]?.state,'pending');
 service.setPermission('external_action','deny');await assert.rejects(service.createManualExternalActionProposal({kind:'mcp_call',connectionId:'mcp-manual',target:'站点 B',userAuthorizationExcerpt:'用户在桌面确认发布',tool:'publish',args:{site:'B'},conversationId}),/PERMISSION_DENIED/);
});

test('Agent 外部操作工具只创建提案，不直接调用连接执行器',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pm-agent-external-proposal-'));const store=new Store(path.join(dir,'data'));let executed=0;t.after(async()=>{store.close();await fs.rm(dir,{recursive:true,force:true});});
 const service=new Service(store,()=> 'test-key',()=>{},undefined,{executeExternalAction:async()=>{executed+=1;return{operationId:'unexpected',status:'succeeded',diagnostic:'unexpected execution'};}});await service.workspace(path.join(dir,'workspace'));service.state.connections.push({id:'mcp-agent',name:'Agent MCP',kind:'mcp',command:'mcp.exe',args:[],enabled:true});service.save();service.setPermission('external_action','allow');const conversationId=service.conversation();service.state.runs.push({id:'run-agent',conversationId,status:'running',startedAt:new Date().toISOString()} as State['runs'][number]);
 const propose=(service as unknown as {executeAgentExternalAction:(runId:string,conversationId:string,input:Record<string,unknown>)=>Promise<ExternalActionProposal>}).executeAgentExternalAction;
 const proposal=await propose.call(service,'run-agent',conversationId,{kind:'mcp_call',connectionName:'Agent MCP',target:'站点 A',userAuthorizationExcerpt:'用户明确要求发布',tool:'publish',args:{site:'A'}});
 assert.equal(proposal.status,'pending');assert.equal(executed,0);assert.equal(service.listPendingExternalActions(conversationId)[0]?.id,proposal.id);
});

test('重启把运行任务和外部执行标记为可诊断状态',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pm-restart-'));
 const data=path.join(dir,'data');const store1=new Store(data);
 const startedAt=new Date(Date.now()-1000).toISOString();const state:State={root:path.join(dir,'workspace'),mounts:[],conversations:[{id:'c1',title:'恢复测试',archived:false,messages:[{role:'user',text:'继续',time:startedAt}]}],changes:[],runs:[{id:'r1',conversationId:'c1',status:'running',startedAt}],connections:[],model:{baseUrl:'https://example.invalid/v1',id:'model',hasKey:true}};
 const action:ExternalActionProposal={id:'a1',runId:'r1',conversationId:'c1',kind:'mcp_call',connectionId:'m1',target:'站点',userAuthorizationExcerpt:'用户已指定',status:'executing',request:{kind:'mcp_call',tool:'publish',args:{}},createdAt:startedAt,updatedAt:startedAt,operationId:'op1'};
 store1.set('state',state);store1.set('external-actions',[action]);store1.set('run-output:r1',{text:'已经完成一部分',updatedAt:new Date().toISOString()});store1.set('run-checkpoint:r1',{runId:'r1',attempt:1,phase:'generating',updatedAt:startedAt,assistantText:'已经完成一部分',completedOperations:[],contextManifestRef:'context-manifest:r1',safeToResume:false});store1.close();
 const store2=new Store(data);t.after(async()=>{store2.close();await fs.rm(dir,{recursive:true,force:true});});const service=new Service(store2,()=> 'test-key',()=>{});
 assert.equal(service.state.runs[0]?.status,'interrupted');assert.match(service.state.conversations[0]?.messages.at(-1)?.text??'',/已持久化的部分回复/);assert.equal(service.listPendingExternalActions().length,0);const checkpoint=store2.get<{phase:string;safeToResume:boolean}>('run-checkpoint:r1',null as never);assert.equal(checkpoint.phase,'interrupted');assert.equal(checkpoint.safeToResume,true);const recovered=store2.get<ExternalActionProposal[]>('external-actions',[])[0];assert.equal(recovered?.status,'outcome_unknown');assert.match(recovered?.diagnostic??'',/未自动重试/);
});

test('Service 持久化模板预览并强制迁移草稿整组预检应用',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pm-template-service-'));const store=new Store(path.join(dir,'data'));t.after(async()=>{store.close();await fs.rm(dir,{recursive:true,force:true});});const service=new Service(store,()=> 'test-key',()=>{});await service.workspace(path.join(dir,'workspace'));
 const processMount=service.state.mounts.find(m=>m.name==='过程文件'),output=service.state.mounts.find(m=>m.name==='成果');assert.ok(processMount);assert.ok(output);const metadata={mountId:processMount.id,path:'templates/registry.json'};
 const registered=await service.templateRegister('run-register',{metadata,template:{id:'standard-prd',version:'2',title:'标准 PRD',sections:[{id:'overview',title:'产品概述',level:1,required:true},{id:'rules',title:'业务规则',level:2,required:true,parentId:'overview'}]}});await service.apply(registered.changeId);
 const original='# 旧概述 <!-- pm-section:overview -->\n正文 A\n## 旧规则 <!-- pm-section:rules -->\n正文 B\n';await fs.writeFile(path.join(output.path,'A.md'),original);await fs.writeFile(path.join(output.path,'B.md'),original);
 const targets=[{mountId:output.id,path:'A.md'},{mountId:output.id,path:'B.md'}];const preview=await service.templateMigrationPreview({metadata,templateId:'standard-prd',templateVersion:'2',targets});assert.equal(service.listTemplateMigrationPreviews().at(-1)?.previewId,preview.previewId);
 const prepared=await service.templateMigrationDraft('run-migrate',preview.previewId,targets);assert.equal(prepared.drafts.length,2);assert.equal(service.listTemplateMigrationGroups().at(-1)?.changeIds.length,2);await assert.rejects(service.apply(prepared.drafts[0].changeId),/MIGRATION_GROUP_REQUIRED/);
 await fs.writeFile(path.join(output.path,'B.md'),original+'人工修改\n');await assert.rejects(service.applyTemplateMigrationGroup(prepared.groupId),/VERSION_CONFLICT/);assert.equal(await fs.readFile(path.join(output.path,'A.md'),'utf8'),original);assert.equal(service.listTemplateMigrationGroups().at(-1)?.status,'conflict');
 const preview2=await service.templateMigrationPreview({metadata,templateId:'standard-prd',templateVersion:'2',targets:[targets[0]]});const prepared2=await service.templateMigrationDraft('run-migrate-2',preview2.previewId,[targets[0]]);const applied=await service.applyTemplateMigrationGroup(prepared2.groupId);assert.equal(applied.status,'applied');assert.match(await fs.readFile(path.join(output.path,'A.md'),'utf8'),/# 产品概述/);
});

test('Service 规则草稿按工作空间隔离、持久化并在应用时复核哈希',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pm-rules-service-'));const data=path.join(dir,'data'),root=path.join(dir,'workspace');const store1=new Store(data);const service1=new Service(store1,()=> 'test-key',()=>{});await service1.workspace(root);const snapshot=await service1.readWorkspaceRulesForTool();const draft=await service1.draftWorkspaceRules('run-rules',snapshot.contentHash,'# 新规则\n只引用已授权资料。\n');assert.equal(service1.listWorkspaceRuleChanges()[0]?.id,draft.id);store1.close();
 const store2=new Store(data);t.after(async()=>{store2.close();await fs.rm(dir,{recursive:true,force:true});});const service2=new Service(store2,()=> 'test-key',()=>{});assert.equal(service2.listWorkspaceRuleChanges()[0]?.id,draft.id);await fs.writeFile(path.join(root,'AGENTS.md'),'# 外部修改\n');await assert.rejects(service2.applyWorkspaceRuleChange(draft.id),/VERSION_CONFLICT/);assert.equal(service2.listWorkspaceRuleChanges()[0]?.status,'conflict');
});

test('产品记录仅绑定授权文件真实哈希且评审解决状态重新读取当前版本',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pm-record-service-'));const store=new Store(path.join(dir,'data'));t.after(async()=>{store.close();await fs.rm(dir,{recursive:true,force:true});});const service=new Service(store,()=> 'test-key',()=>{});await service.workspace(path.join(dir,'workspace'));const output=service.state.mounts.find(m=>m.name==='成果'),reference=service.state.mounts.find(m=>m.name==='资源');assert.ok(output);assert.ok(reference);
 await fs.writeFile(path.join(output.path,'PRD.md'),'第一版');await fs.writeFile(path.join(reference.path,'source.md'),'真实来源');const requirement=await service.recordRequirement('conversation-1',{title:'准入需求',summary:'建立准入流程',status:'needs_clarification',sources:[{id:'source-1',mountId:reference.id,relativePath:'source.md'}],assumptions:[],pendingQuestions:[{id:'question-1',question:'是否启用风控复核？'}],confirmedFacts:[]});assert.equal(requirement.sourceRefs[0]?.contentHash,createHash('sha256').update('真实来源').digest('hex'));
 const updatedRequirement=await service.updateRequirementEvidence('conversation-1',requirement.id,{sources:[{id:'source-1',mountId:reference.id,relativePath:'source.md'}],assumptions:[],pendingQuestions:[{id:'question-1',question:'是否启用风控复核？',status:'answered',answer:'启用'}],confirmedFacts:[{id:'fact-1',text:'高风险客户启用风控复核',sourceRefIds:['source-1'],confirmedBy:'user'}]});const confirmed=service.transitionRequirement(requirement.id,'confirmed','用户在当前会话明确确认启用风控复核');assert.equal(updatedRequirement.pendingQuestions[0]?.status,'answered');assert.equal(confirmed.status,'confirmed');
 const artifact=await service.registerArtifact('conversation-1',{mountId:output.id,relativePath:'PRD.md',kind:'document',title:'PRD'});assert.equal(artifact.currentVersionHash,createHash('sha256').update('第一版').digest('hex'));await fs.writeFile(path.join(output.path,'PRD.md'),'第二版');const review=await service.createReview('conversation-1',{artifactId:artifact.id,title:'PRD 评审'});assert.equal(review.artifactVersionHash,createHash('sha256').update('第二版').digest('hex'));
 const issue=service.addReviewIssue(review.id,{title:'缺少异常路径',description:'补充退回处理',locator:'异常处理',basis:'需求卡',impact:'验收用例缺失'});await fs.writeFile(path.join(output.path,'PRD.md'),'第三版：已补异常路径');const resolved=await service.transitionReviewIssue(review.id,issue.id,'resolved',{resolution:'已补充'});assert.equal(resolved.resolvedInHash,createHash('sha256').update('第三版：已补异常路径').digest('hex'));
 const records=await service.listProductRecords({type:'all',query:'PRD',limit:10});assert.equal(records.artifacts.length,1);const designPackage=service.createDesignPackage({title:'准入设计包',artifactIds:[artifact.id],requirementIds:[requirement.id]});const renamed=service.updateDesignPackage(designPackage.id,{title:'客户准入设计包',artifactIds:[]});assert.equal(renamed.title,'客户准入设计包');assert.deepEqual(renamed.artifactIds,[]);
 const identity=productRecordsWorkspaceIdentity(service.state.root);const snapshot=new ProductRecordsRepository(store,{key:identity.key}).snapshot();assert.equal(snapshot.requirements[0]?.workspaceId,identity.workspaceId);assert.equal(snapshot.artifacts[0]?.workspaceId,identity.workspaceId);assert.equal(snapshot.reviews[0]?.artifactVersionHash,review.artifactVersionHash);
 await assert.rejects(service.registerArtifact('conversation-1',{mountId:output.id,relativePath:'../AGENTS.md',kind:'document',title:'越界'}),/PERMISSION_DENIED|INVALID_PATH/);
});
