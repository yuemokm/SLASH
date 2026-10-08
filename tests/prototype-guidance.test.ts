import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Files} from '../main/files.js';
import {Store} from '../main/store.js';
import {prepareWorkflow} from '../main/pm-workflows.js';
import {PROTOTYPE_GUIDANCE} from '../main/prototype-guidance.js';
import {BUSINESS_FACT_GUIDANCE} from '../main/business-fact-guidance.js';
import {DEFAULT_SYSTEM_PROMPT,saveSystemPrompt,systemPromptView} from '../main/system-prompt.js';
import {Service} from '../main/service.js';
import type {RuntimeOptions} from '../main/agent.js';

// Persisted fixture from before the advice was added; no production constant import.
const historicalDefault=`# 产品协作方式
你是 slash，产品经理的协作助手。默认用中文 Markdown 回复，表达简洁、清晰，先给结论，再说明必要依据和下一步。

## 资料与判断
先查阅项目资料索引，再按任务关联性读取已授权资料。区分事实、假设与待确认事项，引用真实读取的路径，不编造来源或完成状态。重大业务规则不明确时提问；普通排版和实现细节自行决定。

## 成果交付
按用户范围生成或修改成果，保留版本与来源。PRD 写清目标、角色、流程、字段、规则、异常和验收；原型包含可操作交互与模拟数据；流程图使用可编辑 draw.io XML。避免用大段代码代替实际文件交付。工具或外部服务的结果必须核对后再报告完成。`;

const waitFor=async(predicate:()=>boolean)=>{const until=Date.now()+6000;while(Date.now()<until){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('等待任务状态超时');};

test('prototype workflow uses design advice without imposing it on other workflow kinds',async()=>{
 const files=new Files(()=>[]);
 const prototype=await prepareWorkflow(files,'unused',{kind:'prototype',sources:[]});
 assert.ok(prototype.prompt.includes(PROTOTYPE_GUIDANCE));
 assert.match(prototype.prompt,/用户输入保持优先/);
 for(const kind of ['prd','research'] as const){
  const prepared=await prepareWorkflow(files,'unused',{kind,sources:[]});
  assert.equal(prepared.prompt.includes(PROTOTYPE_GUIDANCE),false);
  if(kind==='research')assert.ok(prepared.prompt.includes(BUSINESS_FACT_GUIDANCE));
 }
});

test('new default includes prototype advice while existing custom collaboration prompt survives reopen',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-design-prompt-'));
 let store=new Store(dir);
 t.after(async()=>{store.close();await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:30});});
 assert.ok(systemPromptView(store).content.includes(PROTOTYPE_GUIDANCE));
 const custom='保留旧项目风格，使用已有红色系统；所有页面正文使用英文。';
 saveSystemPrompt(store,custom);
 store.close();store=new Store(dir);
 const view=systemPromptView(store);
 assert.equal(view.content,custom);
 assert.equal(view.isDefault,false);
 assert.equal(view.defaultContent,DEFAULT_SYSTEM_PROMPT);
 assert.equal(view.content.includes(PROTOTYPE_GUIDANCE),false);
});

test('only exact historical default resolves to latest default without changing persisted content or timestamp',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-historical-prompt-')),store=new Store(dir);
 t.after(async()=>{store.close();await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:30});});
 const saved={content:historicalDefault,updatedAt:'2026-10-04T00:00:00.000Z'};
 store.set('system-prompt:v1',saved);
 assert.equal(systemPromptView(store).content,DEFAULT_SYSTEM_PROMPT);
 assert.equal(systemPromptView(store).isDefault,true);
 assert.equal(systemPromptView(store).updatedAt,saved.updatedAt);
 assert.deepEqual(store.get('system-prompt:v1',null),saved);
 for(const custom of [historicalDefault+' ', '\n'+historicalDefault,historicalDefault.replace(/\n/g,'\r\n'),historicalDefault.replace('普通排版','特殊排版'),historicalDefault+'\n用户补充：保留旧布局。']){
  store.set('system-prompt:v1',{...saved,content:custom});
  const view=systemPromptView(store);
  assert.equal(view.content,custom);
  assert.equal(view.isDefault,false);
  assert.equal(store.get<any>('system-prompt:v1',null).content,custom);
 }
});

test('ordinary new prototype chat receives effective default while historical pending run snapshot remains fixed',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-default-run-')),store=new Store(path.join(dir,'data'));
 const seen:RuntimeOptions[]=[];let imageEntered=false,release=()=>{};
 const service=new Service(store,()=> 'fixture-key',()=>{},async options=>({messages:[{role:'assistant',stopReason:'stop'}],prompt:async()=>{seen.push(options);options.delta('已处理。');},abort:async()=>{},dispose:()=>{}}) as never,{prepareImages:async()=>{imageEntered=true;await new Promise<void>(resolve=>{release=resolve;});return{};}});
 t.after(async()=>{release();service.dispose();store.close();await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:30});});
 await service.workspace(path.join(dir,'project'));
 const saved={content:historicalDefault,updatedAt:'2026-10-04T00:00:00.000Z'};
 store.set('system-prompt:v1',saved);
 const conversation=service.conversation();
 const fresh=await service.send(conversation,'生成交互原型');
 await waitFor(()=>service.state.runs.find(run=>run.id===fresh)?.status==='succeeded');
 assert.equal(service.state.runs.find(run=>run.id===fresh)?.workflow,undefined);
 assert.equal(seen[0].systemPrompt,DEFAULT_SYSTEM_PROMPT);
 assert.equal(store.get('system-prompt:run:'+fresh,null),DEFAULT_SYSTEM_PROMPT);
 assert.deepEqual(store.get('system-prompt:v1',null),saved);
 const pending=await service.send(conversation,'处理原型图片','build','standard',undefined,undefined,undefined,'general',['fixture']);
 await waitFor(()=>imageEntered);
 // Simulate an already accepted pre-upgrade task; execute must use this snapshot,
 // even though the effective preference now resolves to the new default.
 store.set('system-prompt:run:'+pending,historicalDefault);
 release();
 await waitFor(()=>service.state.runs.find(run=>run.id===pending)?.status==='succeeded');
 assert.equal(seen[1].systemPrompt,historicalDefault);
 assert.equal(store.get('system-prompt:run:'+pending,null),historicalDefault);
 assert.equal(service.systemPromptGet().content,DEFAULT_SYSTEM_PROMPT);
 assert.deepEqual(store.get('system-prompt:v1',null),saved);
});
