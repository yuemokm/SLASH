import {staticPublishReceiptSchema} from '../shared/prototype-publish-operation.js';
import {TOOL_EXECUTION_POLICIES} from './tool-execution-policy.js';
import type {RecoveryRecord} from '../shared/run-recovery.js';
import type {Store} from './store.js';

export function recoveryEffect(tool:string):RecoveryRecord['effect']{return TOOL_EXECUTION_POLICIES[tool]?.effect??(['read_workflow_sources','load_workspace_rules','pi_subagent','context_compaction','task_acceptance','content_review','prototype_visual_review'].includes(tool)?'read':'unknown');}
export function requiresReconciliation(record:RecoveryRecord){return record.dispatch==='may_have_run'&&record.resolution==='pending'&&record.effect!=='read';}
/** Called only after the owner of a persisted Run is known to be inactive. */
export function classifyInterruptedOperations(store:Store,runId:string){
 for(const operation of store.operationsForRun(runId)){
  const known=store.recoveryForOperation(operation.id);
  if(known&&['succeeded','failed','cancelled'].includes(operation.state)){
   if(known.dispatch!=='settled'&&(operation.state==='succeeded'||known.dispatch==='not_sent'||known.effect==='read'))store.saveRecovery({...known,dispatch:'settled',resolution:operation.state==='succeeded'?'verified_done':'verified_not_done',resolvedBy:'host',updatedAt:new Date().toISOString()});
   continue;
  }
  if(!['executing','outcome_unknown'].includes(operation.state))continue;
  let record=store.recoveryForOperation(operation.id);
  if(!record)record=store.saveRecovery({operationId:operation.id,runId,tool:operation.tool,effect:recoveryEffect(operation.tool),dispatch:'may_have_run',resolution:'pending',evidenceRefs:['legacy:no-dispatch-receipt'],updatedAt:new Date().toISOString()});
  if(requiresReconciliation(record)){
   let typed=false;try{const receipt=staticPublishReceiptSchema.parse(JSON.parse(operation.result));const owner=store.get<{operationId:string;runId:string;tool:string}|null>('operation-binding:'+receipt.binding,null);typed=receipt.tool===operation.tool&&receipt.runId===runId&&receipt.operationId===operation.id&&receipt.hostIdentity?.publishBindingHash===receipt.binding&&receipt.hostIdentity?.recoveryScopeHash===record.scopeHash&&receipt.hostIdentity?.requestHash===record.requestHash&&owner?.operationId===operation.id&&owner.runId===runId&&owner.tool===operation.tool;}catch{}
   if(typed)store.saveRecovery({...record,summary:'应用退出时发布未决；结构回执原样保留，未重新派发',evidenceRefs:[...new Set([...record.evidenceRefs,'operation:'+operation.id])],updatedAt:new Date().toISOString()});
   store.finishOperation(operation.id,runId,operation.tool,'outcome_unknown',typed?operation.result:[operation.result,'应用退出时操作未决；没有重新派发，请核对实际结果'].filter(Boolean).join('\n'));
  }
  else if(operation.state==='executing')store.finishOperation(operation.id,runId,operation.tool,record.dispatch==='settled'&&record.resolution==='verified_done'?'succeeded':'cancelled',[operation.result,record.dispatch==='not_sent'?'应用退出前操作尚未派发；旧审批不复用':'只读操作已中断或已有宿主回执；旧记录保留'].filter(Boolean).join('\n'));
 }
 return store.recoveryForRun(runId);
}
export function assertReconciled(store:Store,runId:string){
 if(store.recoveryForRun(runId).some(requiresReconciliation)||store.operationsForRun(runId).some(operation=>operation.state==='outcome_unknown'&&(!store.recoveryForOperation(operation.id)||requiresReconciliation(store.recoveryForOperation(operation.id)!))))throw Error('RUN_REQUIRES_RECONCILIATION: 此任务存在结果待核对的操作，请先完成核对');
}
