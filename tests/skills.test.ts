import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {AuthorizedSkills,authorizedSkillDirectories,expandAuthorizedSkillCommand,skillPromptSection} from '../main/skills.js';
import {createAuthorizedReadTool} from '../main/authorized-read.js';
import {Files,hash} from '../main/files.js';
import {createRuntime,type RuntimeOptions} from '../main/agent.js';
import {Service} from '../main/service.js';
import {Store} from '../main/store.js';
import type {SkillLoadReceipt} from '../shared/skills.js';

async function fixture(t:any,cleanup=true){const root=await fs.mkdtemp(path.join(os.tmpdir(),'slash-skills-test-'));if(cleanup)t.after(async()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));await fs.rm(root,{recursive:true,force:true});});const mounts=[{id:'skills',name:'skills',path:path.join(root,'skills'),enabled:true,write:false}];await fs.mkdir(mounts[0].path);const files=new Files(()=>mounts);return{root,mounts,files};}
async function skill(root:string,name:string,description='用于核验测试订单',body='技能正文测试标记',extra=''){const dir=path.join(root,name);await fs.mkdir(dir,{recursive:true});const file=path.join(dir,'SKILL.md');await fs.writeFile(file,`---\nname: ${name}\ndescription: ${description}\n${extra}---\n${body}\n`);return file;}

test('Pi发现只覆盖明确授权的skills目录，元数据与正文加载分离',async t=>{
 const f=await fixture(t);await skill(f.mounts[0].path,'orders');await skill(f.mounts[0].path,'manual','只能用户指定','手动正文','disable-model-invocation: true\n');
 const dirs=authorizedSkillDirectories(f.root,[],f.mounts);assert.deepEqual(dirs,[{mountId:'skills',path:'.'}]);assert.deepEqual(authorizedSkillDirectories(f.root,[],f.mounts,false),[]);
 const catalog=new AuthorizedSkills(f.files,dirs);const discovered=await catalog.discover();assert.equal(discovered.skills.length,2);assert.deepEqual(discovered.diagnostics,[]);assert.match(skillPromptSection(discovered),/用于核验测试订单/);assert.doesNotMatch(skillPromptSection(discovered),/技能正文测试标记|只能用户指定/);
 const loaded=await catalog.load('orders');assert.match(loaded.content,/技能正文测试标记/);assert.equal(loaded.receipt.contentHash,hash(await fs.readFile(path.join(f.mounts[0].path,'orders','SKILL.md'),'utf8')));assert.equal(loaded.receipt.invocation,'tool');assert.ok(loaded.receipt.readAt);
 await assert.rejects(catalog.load('manual'),/SKILL_EXPLICIT_ONLY/);const command=await expandAuthorizedSkillCommand('/skill:manual 检查此订单',name=>catalog.load(name,'command'));assert.match(command,/手动正文/);assert.match(command,/检查此订单/);assert.match(command,/Plan只读/);
});

test('重复名称和非法声明均显示问题而不静默选中技能',async t=>{
 const f=await fixture(t);await skill(f.mounts[0].path,'first');await skill(f.mounts[0].path,'second');await fs.writeFile(path.join(f.mounts[0].path,'second','SKILL.md'),'---\nname: first\ndescription: duplicated\n---\nsecond');await skill(f.mounts[0].path,'bad_name');await fs.mkdir(path.join(f.mounts[0].path,'empty'));await fs.writeFile(path.join(f.mounts[0].path,'empty','SKILL.md'),'---\nname: empty\n---\nmissing description');
 const c=new AuthorizedSkills(f.files,[{mountId:'skills',path:'.'}]);const r=await c.discover();assert.equal(r.skills.length,0);assert.equal(r.diagnostics.filter(d=>d.code==='SKILL_NAME_COLLISION').length,2);assert.ok(r.diagnostics.some(d=>d.code==='SKILL_INVALID'));await assert.rejects(c.load('first'),/SKILL_NOT_FOUND/);
});

test('ZIP外层目录名不覆盖声明name，非阻断描述长度warning保持可用',async t=>{
 const f=await fixture(t);const filename=await skill(f.mounts[0].path,'create-prd-skill-main','x'.repeat(1025));await fs.writeFile(filename,(await fs.readFile(filename,'utf8')).replace('name: create-prd-skill-main','name: create-prd'));
 const c=new AuthorizedSkills(f.files,[{mountId:'skills',path:'.'}]);const r=await c.discover();assert.equal(r.skills[0]?.name,'create-prd');assert.equal(r.skills[0]?.description.length,1024);assert.ok(r.diagnostics.some(d=>d.code==='SKILL_VALIDATION_WARNING'));assert.match((await c.load('create-prd')).content,/技能正文测试标记/);
});

test('发现后撤销目录、读取权限或修改技能哈希会拒绝加载',async t=>{
 const f=await fixture(t);const filename=await skill(f.mounts[0].path,'orders');let allow=true;const c=new AuthorizedSkills(f.files,[{mountId:'skills',path:'.'}],()=>{if(!allow)throw Error('PERMISSION_DENIED');});await c.discover();f.mounts[0].enabled=false;await assert.rejects(c.load('orders'),/PERMISSION_DENIED/);f.mounts[0].enabled=true;allow=false;await assert.rejects(c.load('orders'),/PERMISSION_DENIED/);allow=true;await fs.appendFile(filename,'changed');await assert.rejects(c.load('orders'),/SKILL_VERSION_CONFLICT/);
});

test('链接指向授权目录外的技能不会被Pi扫描或读取',async t=>{
 const f=await fixture(t);const outside=path.join(f.root,'outside');await skill(outside,'outside','不应被读取的外部说明','OUTSIDE-SECRET');await fs.symlink(path.join(outside,'outside'),path.join(f.mounts[0].path,'linked'),'junction');
 const c=new AuthorizedSkills(f.files,[{mountId:'skills',path:'.'}]);const r=await c.discover();assert.deepEqual(r.skills,[]);assert.ok(r.diagnostics.some(d=>d.code==='SKILL_SYMLINK_DENIED'));assert.doesNotMatch(JSON.stringify(r),/OUTSIDE-SECRET|不应被读取/);await assert.rejects(c.load('outside'),/SKILL_NOT_FOUND/);
});

test('实际Pi系统提示包含技能说明，显式命令经受控读取；Plan未暴露脚本且不扫描data祖先规则',async t=>{
 const f=await fixture(t);await skill(f.mounts[0].path,'orders','验证折扣订单','ORDERS-SKILL-BODY');await fs.writeFile(path.join(f.root,'AGENTS.md'),'FOREIGN-DATA-ANCESTOR');const agentDir=path.join(f.root,'agent');await fs.mkdir(agentDir);await fs.writeFile(path.join(agentDir,'APPEND_SYSTEM.md'),'FOREIGN-APPEND');
 const requests:any[]=[];const server=createServer(async(req,res)=>{let data='';for await(const part of req)data+=part;requests.push(JSON.parse(data));if(requests.length===2){res.writeHead(200,{'content-type':'text/event-stream'});res.end('data: '+JSON.stringify({id:'r',object:'chat.completion.chunk',choices:[{index:0,delta:{tool_calls:[{index:0,id:'call-skill',type:'function',function:{name:'load_skill',arguments:'{"name":"orders"}'}}]},finish_reason:null}]})+'\n\ndata: '+JSON.stringify({id:'r',object:'chat.completion.chunk',choices:[{index:0,delta:{},finish_reason:'tool_calls'}]})+'\n\ndata: [DONE]\n\n');return;}res.writeHead(200,{'content-type':'text/event-stream'});res.end('data: {"id":"r","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"ok"},"finish_reason":null}]}\n\ndata: {"id":"r","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');});await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise<void>(resolve=>server.close(()=>resolve())));
 const loads:SkillLoadReceipt[]=[];const calls:string[]=[];const options={dir:agentDir,workspaceRoot:f.root,key:'local-test-key',model:{id:'test',baseUrl:`http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,protocol:'openai-completions',contextWindow:65536,maxTokens:1024},files:f.files,mounts:f.mounts,connections:[],mode:'plan',systemPrompt:'CUSTOM-PROMPT',workspaceRules:'EXPLICIT-WORKSPACE-RULE',skillDirectories:[{mountId:'skills',path:'.'}],skillLoaded:(receipt:SkillLoadReceipt)=>loads.push(receipt),runId:'test',listConnections:()=>[],log:async(name:string,_:unknown,fn:()=>Promise<unknown>)=>{calls.push(name);return fn();},delta:()=>{}} as unknown as RuntimeOptions;
 const runtime=await createRuntime(options);t.after(()=>runtime.dispose());assert.match(runtime.systemPrompt,/验证折扣订单/);assert.match(runtime.systemPrompt,/load_skill/);assert.match(runtime.systemPrompt,/CUSTOM-PROMPT/);assert.match(runtime.systemPrompt,/EXPLICIT-WORKSPACE-RULE/);assert.doesNotMatch(runtime.systemPrompt,/FOREIGN-DATA-ANCESTOR|FOREIGN-APPEND|ORDERS-SKILL-BODY/);assert.ok(runtime.getActiveToolNames().includes('load_skill'));for(const tool of ['powershell','run_process','process_processing_copy','write_draft'])assert.ok(!runtime.getActiveToolNames().includes(tool));
 await runtime.prompt('/skill:orders 核验订单');assert.equal(requests.length,1);assert.match(JSON.stringify(requests[0].messages),/验证折扣订单/);assert.match(JSON.stringify(requests[0].messages),/ORDERS-SKILL-BODY/);assert.equal(loads.length,1);assert.equal(loads[0].invocation,'command');assert.ok(calls.includes('load_skill'));await assert.rejects(runtime.prepareUserInput!('/skill:unknown'),/SKILL_NOT_FOUND/);assert.equal(requests.length,1);await runtime.prompt('请按需加载订单技能');assert.equal(requests.length,3);assert.equal(loads.length,2);assert.equal(loads[1].invocation,'tool');assert.match(JSON.stringify(requests[2].messages),/ORDERS-SKILL-BODY/);assert.ok(requests[2].messages.some((m:any)=>m.role==='tool'));
});

test('Service保留发现与实际加载证据，Plan网关拒绝技能建议的脚本',async t=>{
 const f=await fixture(t,false),store=new Store(path.join(f.root,'db'));t.after(async()=>{store.close();assert.equal(path.dirname(f.root),path.resolve(os.tmpdir()));await fs.rm(f.root,{recursive:true,force:true});});let executed=false;let options:RuntimeOptions|undefined;
 const service=new Service(store,()=> 'test',()=>{},async o=>{options=o;return{messages:[{role:'assistant',stopReason:'stop'}],prompt:async()=>{const catalog=new AuthorizedSkills(o.files,o.skillDirectories??[],o.assertSkillScope);const discovery=await o.log('discover_skills',{},()=>catalog.discover());o.skillDiscovery?.(discovery);await o.log('load_skill',{name:'orders'},async()=>{const loaded=await catalog.load('orders');o.skillLoaded?.(loaded.receipt);});await assert.rejects(o.log('powershell',{command:'echo should-not-run'},async()=>{executed=true;}),/PLAN_TOOL_DENIED/);o.delta('方案 1：按技能核验订单'+String.fromCharCode(10)+'步骤：读取规则与金额'+String.fromCharCode(10)+'取舍：范围小'+String.fromCharCode(10)+String.fromCharCode(10)+'方案 2：完整核对'+String.fromCharCode(10)+'步骤：研究更多资料'+String.fromCharCode(10)+'取舍：耗时较长');},abort:async()=>{},dispose:()=>{}} as never;});await service.workspace(path.join(f.root,'workspace'));await skill(path.join(service.state.root,'资源','skills'),'orders');service.setPermission('workspace_read','allow');const id=await service.send(service.conversation(),'使用订单技能研究','plan');
 const until=Date.now()+5000;while(!['failed','awaiting_plan'].includes(service.state.runs.find(r=>r.id===id)?.status??'')&&Date.now()<until)await new Promise(r=>setTimeout(r,10));const run=service.state.runs.find(r=>r.id===id)!;assert.notEqual(run.status,'failed',run.error);assert.equal(run.skillDiscovery?.skills.length,1);assert.equal(run.skillLoads?.length,1);assert.equal(executed,false);const manifest=store.get<any>(`context-manifest:${id}`,{});assert.equal(manifest.skillLoads[0].contentHash,run.skillLoads![0].contentHash);service.setPermission('workspace_read','deny');assert.throws(()=>options?.assertSkillScope?.(),/PERMISSION_DENIED/);
});

test('Pi长单行回执提供真实read_file字符分页，续读无损且验证哈希',async t=>{
 const f=await fixture(t),content='prefix\n'+'业务'.repeat(30000);await fs.writeFile(path.join(f.mounts[0].path,'large.md'),content);const tool=createAuthorizedReadTool(f.files,path.join(f.root,'virtual'),async(_,__,fn)=>fn());const result=await tool.execute('t',{mountId:'skills',path:'large.md',offset:2},undefined,undefined,{} as never);const text=(result.content[0] as any).text;assert.doesNotMatch(text,/bash|sed|virtual/);assert.match(text,/characterOffset/);const next=(result.details as any).nextRead;assert.equal(next.characterOffset,7);let reconstructed=content.slice(0,7),offset=next.characterOffset;
 while(offset!==null){const result=await tool.execute('t',{...next,characterOffset:offset},undefined,undefined,{} as never),page=JSON.parse((result.content[0] as any).text);reconstructed+=page.content;offset=page.nextCharacterOffset;}assert.equal(reconstructed,content);await fs.appendFile(path.join(f.mounts[0].path,'large.md'),'new');await assert.rejects(tool.execute('t',next,undefined,undefined,{} as never),/VERSION_CONFLICT/);const line=await tool.execute('t',{mountId:'skills',path:'large.md',offset:1,limit:1},undefined,undefined,{} as never);assert.match((line.content[0] as any).text,/offset=2/);
});
