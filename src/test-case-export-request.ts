import type {Change} from '../shared/types';

/** Pending previews use change.id; file/historical previews use a content hash. */
export async function testCaseExportIdentity(version:string|undefined,file:{mountId:string;path:string},changes:readonly Change[],previewContent?:string){
 const pending=changes.find(c=>c.id===version&&c.status==='pending'&&c.mountId===file.mountId&&c.path===file.path);
 if(pending){
  if(previewContent===undefined||pending.content!==previewContent)throw Error('草稿在预览后已变化，请重新打开再导出');
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(previewContent));
  return {changeId:pending.id,expectedContentHash:Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('')};
 }
 if(version&&/^[a-f0-9]{64}$/i.test(version))return {expectedContentHash:version};
 throw Error('用例预览身份已失效，请重新打开成果后导出');
}
