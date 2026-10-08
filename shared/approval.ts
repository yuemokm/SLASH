import type {ApprovalRequest,Run} from './types.js';

export const toolApprovalTimeoutMs=5*60_000;
export type ApprovalResolutionResult=ApprovalRequest&{
 outcome:'resolved'|'already_resolved'|'expired'|'cancelled'|'unavailable';
 message:string;
};

/** A snapshot may arrive after a Run ended or after another window resolved it. */
export function isApprovalActionable(approval:ApprovalRequest,runs:Pick<Run,'id'|'status'|'phase'>[],timestamp=Date.now()){
 if(approval.status!=='pending'||!approval.runId)return false;
 const run=runs.find(item=>item.id===approval.runId);
 const createdAt=Date.parse(approval.createdAt);
 return Boolean(run&&['queued','running','waiting_user'].includes(run.status)&&run.phase!=='cancelling'&&Number.isFinite(createdAt)&&timestamp<createdAt+toolApprovalTimeoutMs);
}

export function approvalResolutionNotice(result:ApprovalResolutionResult){return result.message;}
