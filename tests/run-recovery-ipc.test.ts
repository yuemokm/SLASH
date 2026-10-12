import test from 'node:test';
import assert from 'node:assert/strict';
import {requestSchema} from '../shared/types.js';
import {runRecoveryViewSchema} from '../shared/run-recovery.js';

const input={type:'runRecoveryReconcile',runId:'run-original',operationId:'operation-original',expectedUpdatedAt:'2026-10-11T00:00:00Z',contextToken:'a'.repeat(64),resolution:'verified_done',evidence:'查看目标文件，确认已保存。'};
test('recovery IPC preserves operation/version/scope binding and rejects shortcuts',()=>{
 assert.deepEqual(requestSchema.parse(input),input);
 assert.deepEqual(requestSchema.parse({type:'runRecoveryGet',runId:'run-original'}),{type:'runRecoveryGet',runId:'run-original'});
 for(const bad of [{...input,contextToken:undefined},{...input,operationId:undefined},{...input,expectedUpdatedAt:undefined},{...input,evidence:'确认完成'},{...input,evidence:'x'.repeat(5001)},{...input,resolution:'pending'},{...input,execute:true},{type:'runRecoveryGet',runId:'run-original',grant:true}])assert.equal(requestSchema.safeParse(bad).success,false);
 assert.equal(requestSchema.safeParse({...input,evidence:'12345678',resolution:'verified_not_done'}).success,true);
});
test('recovery view admits only bounded host summaries, not raw parameters or tokens',()=>{
 const record={operationId:'operation-original',runId:'run-original',tool:'run_process',effect:'process',dispatch:'may_have_run',resolution:'pending',evidenceRefs:[],summary:'运行受控文件转换任务',updatedAt:'2026-10-11T00:00:00Z'};
 const view={runId:'run-original',contextToken:'a'.repeat(64),blocked:true,records:[record]};assert.deepEqual(runRecoveryViewSchema.parse(view),view);
 assert.equal(runRecoveryViewSchema.safeParse({...view,records:[{...record,rawArguments:{token:'PRIVATE'}}]}).success,false);
 assert.equal(runRecoveryViewSchema.safeParse({...view,records:[{...record,summary:'x'.repeat(2001)}]}).success,false);
});
