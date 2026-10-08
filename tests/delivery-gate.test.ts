import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Store} from '../main/store.js';
import {Service} from '../main/service.js';
import {DeliveryGate} from '../main/delivery-gate.js';
import {ProductRecordsRepository,productRecordsWorkspaceIdentity} from '../main/product-records.js';
import type {AppPreferences,Connection,DocumentDeliveryInput,ExternalActionProposal} from '../shared/types.js';

const digest=(value:string)=>createHash('sha256').update(value).digest('hex');

test('模块 PRD 的格式建议不阻断交付，真实空文件仍阻断',async t=>{
 const {store,service,mount,input}=await fixture(t);const gate=makeGate(store,service,[]);
 const content='# 退回模块 PRD\n\n## 规则\n退回时原因必填。\n';await fs.writeFile(path.join(mount.path,input.path),content);
 const result=await gate.check({...input,sourceHash:digest(content)},{contentReviewed:true,destinationConfirmed:true});
 assert.equal(result.allowed,true);assert.equal(result.checks.find(item=>item.id==='quality')?.status,'passed');
 await fs.writeFile(path.join(mount.path,input.path),'');
 const empty=await gate.check({...input,sourceHash:digest('')},{contentReviewed:true,destinationConfirmed:true});
 assert.equal(empty.allowed,false);assert.equal(empty.checks.find(item=>item.id==='quality')?.status,'blocked');
});

function makeGate(store:Store,service:Service,actions:ExternalActionProposal[],preferences:Partial<AppPreferences>={}){
 return new DeliveryGate({
  store,
  files:service.files,
  workspace:()=>({root:service.state.root,connections:service.state.connections}),
  actions:()=>actions,
  records:()=>service.state.root?new ProductRecordsRepository(store,{key:productRecordsWorkspaceIdentity(service.state.root).key}).snapshot():undefined,
  preferences:()=>preferences,
 });
}

async function fixture(t:{after:(fn:()=>Promise<void>)=>void}){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-delivery-gate-'));const store=new Store(path.join(dir,'data'));const service=new Service(store,()=> 'test-key',()=>{});
 t.after(async()=>{store.close();await fs.rm(dir,{recursive:true,force:true});});
 await service.workspace(path.join(dir,'workspace'));const mount=service.state.mounts.find(item=>item.name==='成果');assert.ok(mount);const content='# 产品需求文档\n## 背景与目标\n当前版本内容\n## 用户与角色\n产品经理\n## 业务流程\n提交并审批\n## 页面与字段\n申请单\n## 权限与规则\n按角色控制\n## 异常处理\n提示错误\n## 验收标准\n- [ ] AC-1 页面: pages-fields 可提交\n';await fs.writeFile(path.join(mount.path,'PRD.md'),content);const connection:Connection={id:'cli-1',name:'飞书 CLI',kind:'cli',command:'lark.exe',args:[],enabled:true,provider:'feishu',healthStatus:'healthy',available:true};service.state.connections.push(connection);service.save();
 return{dir,store,service,mount,content,input:{connectionId:connection.id,mountId:mount.id,path:'PRD.md',title:'客户准入 PRD',provider:'feishu' as const,sourceHash:digest(content)}};
}

test('交付预检需要持久化的人为确认，并按目标版本隔离',async t=>{
 const {store,service,mount,input}=await fixture(t);const gate=makeGate(store,service,[]);let result=await gate.check(input);assert.equal(result.allowed,false);assert.equal(result.checks.find(item=>item.id==='checklist')?.status,'blocked');
 result=await gate.check(input,{contentReviewed:true,destinationConfirmed:true});assert.equal(result.allowed,true);assert.equal(result.checklist.contentReviewed,true);assert.equal(result.checklist.destinationConfirmed,true);
 const reopened=new Service(store,()=> 'test-key',()=>{});const gate2=makeGate(store,reopened,[]);const restored=await gate2.check(input);assert.equal(restored.allowed,true);assert.equal(restored.checklist.contentReviewed,true);
 await fs.writeFile(path.join(mount.path,'PRD.md'),'# 交付成果\n\n新的内容\n');const changed=await gate2.check({...input,sourceHash:digest('# 交付成果\n\n新的内容\n')});assert.equal(changed.allowed,false);assert.equal(changed.checklist.contentReviewed,false);assert.equal(changed.checks.find(item=>item.id==='version')?.status,'passed');
});

test('质量门禁关闭时仍不能绕过版本冲突和结果未知',async t=>{
 const {store,service,mount,input}=await fixture(t);const preferences:Partial<AppPreferences>={qualityGateEnabled:false,forceQualityCheckBeforeDelivery:false};const unknownRequest:DocumentDeliveryInput={kind:'document_delivery',mountId:input.mountId,path:input.path,title:input.title,provider:input.provider,sourceHash:input.sourceHash};const actions=[{id:'previous',runId:'run',conversationId:'conversation',kind:'document_delivery',connectionId:input.connectionId,target:'feishu:PRD.md',userAuthorizationExcerpt:'用户确认',status:'outcome_unknown',request:unknownRequest,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()} satisfies ExternalActionProposal];const gate=makeGate(store,service,actions,preferences);let result=await gate.check(input,{contentReviewed:true,destinationConfirmed:true});assert.equal(result.allowed,false);assert.equal(result.checks.find(item=>item.id==='outcome')?.status,'blocked');
 await fs.writeFile(path.join(mount.path,'PRD.md'),'发生外部编辑');result=await gate.check({...input,sourceHash:input.sourceHash},{contentReviewed:true,destinationConfirmed:true});assert.equal(result.checks.find(item=>item.id==='version')?.status,'blocked');assert.equal(result.allowed,false);
});

test('交付门禁只阻断当前成果关联的待确认需求',async t=>{
 const {store,service,mount,input}=await fixture(t);const identity=productRecordsWorkspaceIdentity(service.state.root);const repository=new ProductRecordsRepository(store,{key:identity.key});
 repository.createRequirement({workspaceId:identity.workspaceId,title:'另一个成果的问题',summary:'不应影响当前 PRD。',status:'needs_clarification',sourceRefs:[{id:'unrelated-source',mountId:mount.id,relativePath:'其他成果.md',contentHash:digest('other'),readAt:new Date().toISOString()}],assumptions:[],pendingQuestions:[{id:'unrelated-question',question:'另一个成果的问题',status:'open'}],confirmedFacts:[],sourceConversationIds:[]});
 const gate=makeGate(store,service,[]);let result=await gate.check(input,{contentReviewed:true,destinationConfirmed:true});assert.equal(result.checks.find(item=>item.id==='requirements')?.status,'passed');assert.equal(result.allowed,true);
 repository.createRequirement({workspaceId:identity.workspaceId,title:'当前 PRD 的问题',summary:'会阻断当前交付。',status:'needs_clarification',sourceRefs:[{id:'related-source',mountId:mount.id,relativePath:input.path,contentHash:input.sourceHash,readAt:new Date().toISOString()}],assumptions:[],pendingQuestions:[{id:'related-question',question:'当前成果的问题',status:'open'}],confirmedFacts:[],sourceConversationIds:[]});
 result=await gate.check(input,{contentReviewed:true,destinationConfirmed:true});assert.equal(result.checks.find(item=>item.id==='requirements')?.status,'blocked');assert.equal(result.allowed,false);
});
