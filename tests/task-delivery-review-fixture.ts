import assert from 'node:assert/strict';
import type {Service} from '../main/service.js';

/** Explicit host review inputs for isolated tests; never edit report statuses
 * or bypass the gate. Every item gets its own current binding and evidence. */
export async function reviewFixtureDelivery(service:Service,runId:string){
 let view=await service.taskDeliveryGet(runId);
 for(const item of view.items.filter(item=>item.status!=='passed'&&item.allowedActions.includes('confirm'))){
  view=await service.reviewTaskDelivery({runId,reportId:view.reportId,expectedBindingHash:view.bindingHash,decisions:[{itemId:item.id,action:'confirm',note:'隔离自动化测试的核对输入：对照本机固定来源与当前用例步骤、预期结果；用例仍未执行，不代表真实用户验收。',evidence:{...item.requiredEvidence,locators:['本机固定审批规则全文与当前测试用例步骤/预期结果逐项对照'],citations:[]}}]});
 }
 assert.equal(view.allowed,true,JSON.stringify(view.items));return view;
}
