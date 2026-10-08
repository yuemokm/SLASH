import assert from 'node:assert/strict';
import test from 'node:test';
import {DecisionRepository} from '../main/decision-center.js';

function memory(){const values=new Map<string,unknown>();return{get<T>(key:string,fallback:T){return values.has(key)?values.get(key) as T:fallback;},set(key:string,value:unknown){values.set(key,value);}};}

test('决策记录持久化来源、影响、后续动作并保留状态历史',()=>{
 const kv=memory();let tick=0;let ids=['decision-1'];const repo=new DecisionRepository(kv,{key:'decisions',id:()=>ids.shift()||'decision-next',clock:()=>`2026-09-27T10:00:0${tick++}.000Z`});
 const created=repo.create({workspaceId:'workspace:1',kind:'design_tradeoff',title:'首期只做管理员导入',description:'控制首期交付范围，降低数据校验成本。',sourceRefs:[{kind:'manual',id:'decision-center',label:'评审会话'}],requirementIds:['req-1'],artifactIds:['artifact-1'],conversationIds:['conversation-1'],impact:'影响导入页面和验收标准。',nextAction:'在 PRD 验收章节补充权限说明。'});
 assert.equal(created.status,'pending');assert.equal(repo.snapshot().revision,1);assert.equal(created.impact,'影响导入页面和验收标准。');
 assert.throws(()=>repo.transition(created.id,'confirmed'),/DECISION_CONFIRMER_REQUIRED/);
 const confirmed=repo.transition(created.id,'confirmed',{actor:'当前用户',note:'评审通过'},1);assert.equal(confirmed.status,'confirmed');assert.equal(confirmed.confirmedBy,'当前用户');assert.equal(confirmed.history.length,1);
 assert.throws(()=>repo.transition(created.id,'rejected'),/INVALID_DECISION_TRANSITION/);
 const reloaded=new DecisionRepository(kv,{key:'decisions',clock:()=>new Date().toISOString()});const listed=reloaded.list('workspace:1');assert.equal(listed.length,1);assert.equal(listed[0].nextAction,'在 PRD 验收章节补充权限说明。');assert.equal(listed[0].history[0].to,'confirmed');
 assert.throws(()=>reloaded.transition(created.id,'needs_verification',{},1),/DECISION_REVISION_CONFLICT/);
});
