export interface PublicationIntent {action:'publish'|'revoke';kbId:string;indexId?:string;manifestHash?:string;expectedActive?:string|null;memberIds?:string[]}
export interface PublicationReceipt {action:string;kb_id:string;index_id:string|null;manifest_hash:string|null;expected_active?:string|null;member_ids?:string[]}
export function receiptMatches(receipt:PublicationReceipt,intent:PublicationIntent):boolean {
  if (!receipt || typeof receipt !== 'object' || (receipt.member_ids !== undefined && (!Array.isArray(receipt.member_ids) || !receipt.member_ids.every(id => typeof id === 'string')))) return false;
  return receipt.action===intent.action && receipt.kb_id===intent.kbId && (intent.action==='revoke'||receipt.index_id===intent.indexId&&receipt.manifest_hash===intent.manifestHash)
    && (intent.expectedActive===undefined||receipt.expected_active===intent.expectedActive)
    && (intent.memberIds===undefined||JSON.stringify([...(receipt.member_ids??[])].sort())===JSON.stringify([...intent.memberIds].sort()));
}
export function receiptMatchesOperation(receipt:PublicationReceipt & {operation_id?:string},operation:string,intent:PublicationIntent):boolean {
  return !!receipt && receipt.operation_id===operation && receiptMatches(receipt,intent);
}
