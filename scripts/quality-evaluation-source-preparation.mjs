// Host preparation, before production start/send. No model call, permission
// changes, original writes, or claimed model sourceReads/business acceptance.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=code=>{throw Error('EVALUATION_PREPARATION_'+code);};
const normalize=p=>path.resolve(p).toLowerCase();
function relative(root,file){const r=path.relative(path.resolve(root),path.resolve(file));if(!r||path.isAbsolute(r)||r==='..'||r.startsWith('..'+path.sep))fail('PATH_OUTSIDE_MOUNT');return r;}
async function bytesAt(root,file){
 const r=relative(root,file);let current=path.resolve(root);
 if((await fs.lstat(current)).isSymbolicLink())fail('SYMLINK');
 for(const part of r.split(path.sep)){current=path.join(current,part);if((await fs.lstat(current)).isSymbolicLink())fail('SYMLINK');}
 relative(await fs.realpath(root),await fs.realpath(file));
 const before=await fs.lstat(file);if(!before.isFile()||before.size>100_000_000||before.nlink>1)fail('FILE_INVALID');
 const data=await fs.readFile(file),after=await fs.lstat(file);
 if(after.isSymbolicLink()||before.ino!==after.ino||before.size!==after.size||before.mtimeMs!==after.mtimeMs||data.length!==before.size)fail('READ_CHANGED');
 return data;
}
const authorization=s=>JSON.stringify({root:s.root,permissions:s.permissions,mounts:s.mounts.map(m=>({id:m.id,path:m.path,enabled:m.enabled,write:m.write}))});
function mount(s,id,write){const m=s.mounts.find(m=>m.id===id&&m.enabled);if(!m||Boolean(m.write)!==write)fail('MOUNT_PERMISSION');return m;}
async function mountedBytes(s,id,p,write){const m=mount(s,id,write);return bytesAt(m.path,path.resolve(m.path,p));}
const sourceRef=(source,mountId,p,preparationRef)=>({id:source.id,name:source.name,mountId,path:p,contentHash:source.textSha256,sourceHash:source.sourceSha256Before,...(preparationRef?{preparationRef}:{})});

export async function prepareRegisteredEvaluationSources({call,manifest,caseDir,sources=manifest.sources,sourceMountId,originalMountId}){
 const receiptPath=path.join(caseDir,'host-preparation.json'),failedPath=path.join(caseDir,'host-preparation.failed.json');
 // A successful or failed host attempt is never overwritten or retried by this
 // helper. Use a separate attempted case directory for a new real attempt.
 for(const f of [receiptPath,failedPath]){try{await fs.access(f);fail('ALREADY_ATTEMPTED');}catch(e){if(e.code!=='ENOENT')throw e;}}
 const receipt={schemaVersion:1,status:'preparing',strategy:'official_registered_xlsx_v1',startedAt:new Date().toISOString(),modelSourceReadsClaimed:false,modelCalls:0,countsAsArtifact:false,countsAsFirstDraft:false,records:[],sources:[]};
 let initial;
 try{
  if(typeof call!=='function'||!Array.isArray(sources)||!Array.isArray(manifest.sources)||sources.length!==manifest.sources.length||new Set(sources.map(s=>s.id)).size!==sources.length||new Set(manifest.sources.map(s=>s.id)).size!==manifest.sources.length||sources.some(s=>!manifest.sources.some(m=>m.id===s.id&&JSON.stringify(m)===JSON.stringify(s))))fail('INCOMPLETE_AUTHORIZED_SOURCES');
  initial=await call({type:'state'});
  if(initial.runs.length)fail('RUN_ALREADY_EXISTS');
  const original=mount(initial,originalMountId,false),text=mount(initial,sourceMountId,false);
  if(normalize(original.path)!==normalize(manifest.originals)||normalize(text.path)!==normalize(manifest.texts))fail('MANIFEST_MOUNT');
  if(initial.permissions?.workspace_read==='deny'||initial.permissions?.artifact_write==='deny')fail('PERMISSION_DENIED');
  const token=authorization(initial);receipt.authorizationBefore=JSON.parse(token);
  const current=async()=>{const s=await call({type:'state'});if(authorization(s)!==token||s.runs.length)fail('SCOPE_CHANGED');return s;};
  const verifySource=async(source,state)=>{if(hash(await bytesAt(path.dirname(source.sourcePath),source.sourcePath))!==source.sourceSha256Before||hash(await mountedBytes(state,originalMountId,relative(original.path,source.copyPath),false))!==source.copySha256||hash(await bytesAt(text.path,source.textPath))!==source.textSha256)fail('SOURCE_CHANGED');};
  // Verify every authorized original and TXT before the first copy mutation.
  for(const source of sources){
   if(source.sourceSha256Before!==source.sourceSha256After||source.copySha256!==source.sourceSha256Before)fail('MANIFEST_SOURCE_HASH');
   const sourceBytes=await bytesAt(path.dirname(source.sourcePath),source.sourcePath);
   const copyBytes=await bytesAt(original.path,source.copyPath),textBytes=await bytesAt(text.path,source.textPath);
   if(hash(sourceBytes)!==source.sourceSha256Before||hash(copyBytes)!==source.copySha256||hash(textBytes)!==source.textSha256)fail('SOURCE_CHANGED');
  }
  await current();
  for(const source of sources){
   const sourceRelative=relative(original.path,source.copyPath),textRelative=relative(text.path,source.textPath);
   if(path.extname(source.name).toLowerCase()!=='.xlsx'){receipt.sources.push(sourceRef(source,sourceMountId,textRelative));continue;}
   const record={sourceId:source.id,original:{mountId:originalMountId,path:sourceRelative,hashBefore:source.sourceSha256Before},status:'preparing'};receipt.records.push(record);
   const copy=await call({type:'copyForProcessing',mountId:originalMountId,path:sourceRelative});record.copyReceipt=copy;
   let state=await current();await verifySource(source,state);
   if(copy.source.mountId!==originalMountId||copy.source.path!==sourceRelative||copy.source.contentHash!==source.sourceSha256Before)fail('COPY_IDENTITY');
   if(hash(await mountedBytes(state,copy.copy.mountId,copy.copy.path,true))!==source.sourceSha256Before)fail('COPY_HASH');
   const result=await call({type:'processProcessingCopy',id:copy.id,operation:'extract_text'});record.processingReceipt=result;state=await current();await verifySource(source,state);
   if(result.source.mountId!==originalMountId||result.source.path!==sourceRelative||result.source.contentHash!==source.sourceSha256Before||result.copyHash!==source.sourceSha256Before||result.operation!=='extract_text'||result.outputHash!==source.textSha256)fail('EXTRACTION_IDENTITY');
   if(result.reuse?result.reuse.requestedCopyId!==copy.id:result.copyId!==copy.id)fail('REUSE_IDENTITY');
   if(hash(await mountedBytes(state,result.copy.mountId,result.copy.path,true))!==result.copyHash)fail('RESULT_COPY_HASH');
   if(result.status==='pending'){
    const draft=state.changes.find(c=>c.id===result.changeId);
    if(!draft||draft.status!=='pending'||draft.mountId!==result.output.mountId||draft.path!==result.output.path||hash(Buffer.from(draft.content))!==source.textSha256)fail('DRAFT_IDENTITY');
    await call({type:'apply',id:result.changeId});record.appliedByHelper=true;
   }else if(result.status==='applied')record.appliedByHelper=false;else fail('RESULT_NOT_APPLIED');
   state=await current();
   const appliedChange=state.changes.find(c=>c.id===result.changeId);
   if(appliedChange?.status!=='applied')fail('APPLY_NOT_CONFIRMED');
   if(appliedChange.runId!=='user-processing'||appliedChange.mountId!==result.output.mountId||appliedChange.path!==result.output.path||hash(Buffer.from(appliedChange.content))!==source.textSha256)fail('HOST_CHANGE_IDENTITY');
   record.preparationChange={id:appliedChange.id,runId:appliedChange.runId,mountId:appliedChange.mountId,path:appliedChange.path,createdAt:appliedChange.createdAt,status:appliedChange.status,contentHash:source.textSha256};
   const outputHash=hash(await mountedBytes(state,result.output.mountId,result.output.path,true));
   const originalAfter=hash(await mountedBytes(state,originalMountId,sourceRelative,false));
   const userOriginalAfter=hash(await bytesAt(path.dirname(source.sourcePath),source.sourcePath));
   if(outputHash!==source.textSha256||originalAfter!==source.sourceSha256Before||userOriginalAfter!==source.sourceSha256Before)fail('FINAL_HASH');
   record.actualHashes={requestedCopy:hash(await mountedBytes(state,copy.copy.mountId,copy.copy.path,true)),resultCopy:hash(await mountedBytes(state,result.copy.mountId,result.copy.path,true)),output:outputHash,originalAfter,userOriginalAfter};
   if(record.actualHashes.requestedCopy!==source.sourceSha256Before||record.actualHashes.resultCopy!==source.sourceSha256Before)fail('FINAL_COPY_HASH');
   await current();record.status='registered_applied_verified';
   receipt.sources.push(sourceRef(source,result.output.mountId,result.output.path,`host-preparation.json#${source.id}`));
  }
  // Recheck all authorized source versions, including text-only sources, after
  // every real call. No subset can be silently promoted to complete.
  const final=await current();for(const source of sources){if(hash(await bytesAt(path.dirname(source.sourcePath),source.sourcePath))!==source.sourceSha256Before||hash(await bytesAt(original.path,source.copyPath))!==source.copySha256||hash(await bytesAt(text.path,source.textPath))!==source.textSha256)fail('FINAL_SOURCE_CHANGED');}
  await current();receipt.authorizationAfter=JSON.parse(authorization(final));receipt.status='prepared';receipt.finishedAt=new Date().toISOString();
  const content=JSON.stringify(receipt,null,2);await fs.writeFile(receiptPath,content,{flag:'wx'});
  return{sources:receipt.sources,receipt:{path:receiptPath,sha256:hash(Buffer.from(content))}};
 }catch(error){receipt.status='failed';receipt.finishedAt=new Date().toISOString();receipt.reason=/^[A-Z][A-Z0-9_]+$/.test(error.message)?error.message:'EVALUATION_PREPARATION_FAILED';receipt.partialRecordsAreNotComplete=true;try{await fs.writeFile(failedPath,JSON.stringify(receipt,null,2),{flag:'wx'});}catch(writeError){if(writeError.code!=='EEXIST')throw writeError;}throw error;}
}
