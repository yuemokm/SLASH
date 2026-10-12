import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_SUBAGENT_SETTINGS,subagentSettingsSchema} from '../shared/subagent-settings.js';
import {requestSchema,type ModelEntry,type ThinkingLevel} from '../shared/types.js';
import {PiPackageSettings} from '../main/pi-package-settings.js';
import {resolveSubagentModel} from '../main/subagent-model.js';
import type {ThinkingResolution} from '../main/model-thinking.js';
import {CORE_TOOL_NAMES,TOOL_GROUPS,createToolLoadout} from '../main/tool-catalog.js';

const model:ModelEntry={id:'configured-child',provider:'child-provider',name:'child',baseUrl:'http://127.0.0.1:9001/v1',modelId:'child-model',protocol:'openai-completions',hasKey:true,contextWindow:32000,maxTokens:2000};
const modelDefaults={...DEFAULT_SUBAGENT_SETTINGS.profiles[0],enabled:true};
const parent={model:{id:'parent-model',baseUrl:'http://127.0.0.1:9002/v1',protocol:'openai-completions' as const},key:'parent-private-key',thinkingLevel:'off' as const,modelLabel:'parent-provider/parent-model'};
const resolution:ThinkingResolution={capability:{modelId:'child-model',fingerprint:'test',status:'supported',levels:['off','low','high'],defaultLevel:'low',source:'fixture',reason:'fixture native metadata',limits:{contextWindow:32000,maxTokens:2000,source:'configured'} as any},runtime:{reasoning:true,thinkingLevelMap:{high:'high'}}};
const deps={models:()=>[model],credential:()=> 'child-private-key',thinking:async()=>resolution};

test('子 Agent 默认继承既有行为；配置持久化不写凭据也不动原设置',()=>{
 const rows=new Map<string,unknown>();const settings=new PiPackageSettings({get:<T>(key:string,fallback:T)=>(rows.has(key)?rows.get(key):fallback) as T,set:(key,value)=>{rows.set(key,value);}}, {isEncryptionAvailable:()=>true,encryptString:()=>{throw Error('UNEXPECTED_CREDENTIAL_WRITE');},decryptString:()=>{throw Error('UNEXPECTED_CREDENTIAL_READ');}});
 assert.deepEqual(settings.subagents(),DEFAULT_SUBAGENT_SETTINGS);
 const configured={...DEFAULT_SUBAGENT_SETTINGS,tasks:1,concurrency:1,profiles:[{...DEFAULT_SUBAGENT_SETTINGS.profiles[0],modelEntryId:model.id,thinkingLevel:'high' as const,instructions:'先核对资料，再按问题与依据返回。'}]};settings.saveSubagents(configured);assert.deepEqual(settings.subagents(),configured);assert.deepEqual([...rows.keys()],['pi-subagents:settings']);assert(!JSON.stringify([...rows]).includes('private-key'));
 assert.deepEqual(settings.setSubagentsEnabled(false),{...configured,enabled:false});assert.deepEqual(settings.setSubagentsEnabled(true),configured);
 const legacy={enabled:false,modelEntryId:model.id,thinkingLevel:'high',tasks:1,concurrency:1,toolsPerChild:3,durationMs:30000};rows.set('pi-subagents:settings',legacy);const migrated=settings.subagents();assert.equal(migrated.profiles[0].instructions,'');assert.equal(migrated.profiles[0].modelEntryId,model.id);assert.equal(migrated.profiles[0].thinkingLevel,'high');assert.equal(migrated.enabled,false);assert.equal(migrated.toolsPerChild,3);assert.equal(migrated.durationMs,30000);
});
test('子 Agent IPC契约拒绝任意密钥/目录/工具与超出硬上限预算',()=>{
 assert(requestSchema.safeParse({type:'subagentSettingsSave',config:DEFAULT_SUBAGENT_SETTINGS}).success);
 assert(requestSchema.safeParse({type:'subagentSettingsSetEnabled',enabled:false}).success);
 assert(!requestSchema.safeParse({type:'subagentSettingsSetEnabled',enabled:false,modelEntryId:'overwrite'}).success);
 assert.equal(subagentSettingsSchema.parse({instructions:'x'.repeat(6000)}).profiles[0].instructions.length,6000);
 assert(!subagentSettingsSchema.safeParse({instructions:'x'.repeat(6001)}).success);
 for(const extra of [{key:'forged-key'},{cwd:'C:/'},{tools:['powershell']},{tasks:4},{concurrency:3},{toolsPerChild:25},{durationMs:120001},{tasks:1,concurrency:2}])assert(!subagentSettingsSchema.safeParse({...DEFAULT_SUBAGENT_SETTINGS,...extra}).success);
});

test('具名配置校验拒绝重复身份/名称和失效默认项；旧提示词完整迁移且窄开关保留所有配置',()=>{
 const legacy={enabled:true,modelEntryId:model.id,thinkingLevel:'high',instructions:'保留旧工作指令',tasks:2,concurrency:1,toolsPerChild:7,durationMs:31000};
 const value=subagentSettingsSchema.parse(legacy);assert.equal(value.profiles[0].name,'通用助手');assert.equal(value.profiles[0].instructions,legacy.instructions);assert.equal(value.profiles[0].thinkingLevel,'high');assert.equal(value.profiles[0].modelEntryId,model.id);assert.equal(value.durationMs,31000);
 const extra={...value.profiles[0],id:'researcher',name:'资料研究'};const multiple={...value,profiles:[...value.profiles,extra]};assert(subagentSettingsSchema.safeParse(multiple).success);
 assert(!subagentSettingsSchema.safeParse({...multiple,profiles:[value.profiles[0],{...extra,id:value.profiles[0].id}]}).success);
 assert(!subagentSettingsSchema.safeParse({...multiple,profiles:[value.profiles[0],{...extra,name:value.profiles[0].name}]}).success);
 assert(!subagentSettingsSchema.safeParse({...multiple,defaultAgentId:'missing'}).success);
});
test('继承配置使用父任务模型/强度；指定配置使用实际模型能力与凭据',async()=>{
 assert.equal(await resolveSubagentModel(modelDefaults,parent,deps),parent);
 const selected=await resolveSubagentModel({...modelDefaults,modelEntryId:model.id,thinkingLevel:'high'},parent,deps);
 assert.equal(selected.model.id,model.modelId);assert.equal(selected.model.baseUrl,model.baseUrl);assert.equal(selected.model.entryId,model.id);assert.equal(selected.key,'child-private-key');assert.equal(selected.thinkingLevel,'high');assert.equal(selected.model.thinkingRuntime?.reasoning,true);assert.equal(selected.modelLabel,'child-provider/child-model');assert.equal(parent.key,'parent-private-key');
 assert.equal((await resolveSubagentModel({...modelDefaults,modelEntryId:model.id},parent,deps)).thinkingLevel,'low');
});
test('失效模型/撤销凭据/不支持思考明确拒绝且不回退父模型',async()=>{
 const configured={...modelDefaults,modelEntryId:model.id,thinkingLevel:'high' as const};
 await assert.rejects(resolveSubagentModel(configured,parent,{...deps,models:()=>[]}),/SUBAGENT_MODEL_UNAVAILABLE/);
 await assert.rejects(resolveSubagentModel(configured,parent,{...deps,credential:()=>''}),/SUBAGENT_MODEL_CREDENTIAL_MISSING/);
 await assert.rejects(resolveSubagentModel({...configured,thinkingLevel:'max'},parent,deps),/SUBAGENT_THINKING_UNAVAILABLE/);
 await assert.rejects(resolveSubagentModel({...configured,enabled:false},parent,deps),/SUBAGENTS_DISABLED/);
});
test('同模型手动强度仍核对原生能力，关闭思考可用于不支持推理的模型',async()=>{
 const noThinking={...deps,thinking:async()=>({...resolution,capability:{...resolution.capability,status:'unsupported' as const,levels:[]}})};
 await assert.rejects(resolveSubagentModel({...modelDefaults,thinkingLevel:'high'},parent,noThinking),/SUBAGENT_THINKING_UNAVAILABLE/);
 const chosen=await resolveSubagentModel({...modelDefaults,modelEntryId:model.id,thinkingLevel:'off'},parent,noThinking);assert.equal(chosen.thinkingLevel,'off');
 const cannotDisable={...deps,thinking:async()=>({...resolution,capability:{...resolution.capability,levels:['low','high'] as ThinkingLevel[]}})};
 await assert.rejects(resolveSubagentModel({...modelDefaults,modelEntryId:model.id,thinkingLevel:'off'},parent,cannotDisable),/SUBAGENT_THINKING_UNAVAILABLE/);
});
test('停用子 Agent 的Build仍通过工具注册检查，关闭能力无法重新加载，其他缺工具仍拒绝',()=>{
 const names=[...CORE_TOOL_NAMES,...Object.values(TOOL_GROUPS).flat(),'load_tool_group'].filter(name=>name!=='delegate_readonly');
 let active:string[]=[];const loadout=createToolLoadout(()=>names,value=>{active=value;},['delegated_research']);loadout.apply();assert(active.includes('write_draft'));assert(!active.includes('delegate_readonly'));
 assert.throws(()=>loadout.load({group:'delegated_research'}),/TOOL_GROUP_DISABLED/);assert.equal(loadout.load({group:'prototype'}).status,'loaded');assert(active.includes('run_prototype_acceptance'));
 assert.throws(()=>createToolLoadout(()=>names.filter(name=>name!=='powershell'),()=>{},['delegated_research']),/REGISTRY_MISMATCH/);
});
