import {PublicationHostGuardError} from './publication-host-lease.js';
import {randomUUID} from 'node:crypto';
import type {Store} from './store.js';
import {digest,validateStaticConfiguration} from './netlify-static-phase.js';
import {staticPublishRecoveryConfigurationSchema,staticPublishReceiptSchema,staticDeploySchema,staticPublishDisposition,type StaticPublishConfiguration,type StaticPublishReceipt,type PublicationHostIdentity,type StaticPublishRecoveryConfiguration} from '../shared/prototype-publish-operation.js';

type PhaseSession={call(name:string,args:Record<string,unknown>,signal?:AbortSignal):Promise<Record<string,unknown>>;close():Promise<void>};
export type StaticPhaseSessionFactory=(input:{configuration:StaticPublishConfiguration|StaticPublishRecoveryConfiguration;restoredDeployId?:string;beforeDispatch:()=>Promise<void>})=>Promise<PhaseSession>;
type Fact={publishUrl?:string;deployId?:string;required?:string[];dispatchUpload?:string;uploaded?:string;statusStarted?:true;statusConfirmed?:true;state?:string;readyAt?:string;readyFromCompletedRevision?:number;diagnostic?:StaticPublishReceipt['diagnostics'][number]};
const tool='host.netlify_static_draft' as const;
export class PrototypePublishOperation {
 private sessions=new Map<string,Promise<PhaseSession>>();
 readonly configuration:StaticPublishConfiguration|StaticPublishRecoveryConfiguration;readonly binding:string;readonly key:string;readonly requestHash:string;
 constructor(private store:Store,input:unknown,private factory:StaticPhaseSessionFactory,private assertCurrent:()=>void|Promise<void>,private hostIdentity?:PublicationHostIdentity){
  this.configuration=(input as {version?:string})?.version==='netlify-static-recovery-v1'?staticPublishRecoveryConfigurationSchema.parse(input):validateStaticConfiguration(input).configuration;this.binding=digest(JSON.stringify([this.configuration.siteId,this.configuration.deliveryBindingHash]));this.key='operation-binding:'+this.binding;this.requestHash=this.configuration.version==='netlify-static-recovery-v1'?this.configuration.requestHash:digest(JSON.stringify(this.configuration));if(hostIdentity&&(hostIdentity.requestHash!==this.requestHash||hostIdentity.publishBindingHash!==this.binding))throw Error('OPERATION_HOST_IDENTITY');
 }
 private identity(receipt:StaticPublishReceipt){if(this.hostIdentity&&JSON.stringify(receipt.hostIdentity)!==JSON.stringify(this.hostIdentity))throw Error('OPERATION_HOST_IDENTITY');if(receipt.binding!==this.binding||receipt.siteId!==this.configuration.siteId||receipt.manifestHash!==(this.configuration.version==='netlify-static-recovery-v1'?this.configuration.manifestHash:this.configuration.manifest.manifestHash)||receipt.connectionHash!==this.configuration.connectionHash||receipt.tool!==tool)throw Error('OPERATION_BINDING_IDENTITY');return receipt;}
 read():StaticPublishReceipt|undefined{const owner=this.store.get<{operationId:string;runId:string;tool:string}|null>(this.key,null);if(!owner)return;const operation=this.store.operationsForRun(owner.runId).find(item=>item.id===owner.operationId);if(!operation||operation.tool!==tool||owner.tool!==tool)throw Error('OPERATION_BINDING_CORRUPT');const receipt=this.identity(staticPublishReceiptSchema.parse(JSON.parse(operation.result)));if(receipt.operationId!==owner.operationId||receipt.runId!==owner.runId)throw Error('OPERATION_BINDING_CORRUPT');return receipt;}
 claim(runId:string,operationId:string=randomUUID()){
  if(this.configuration.version==='netlify-static-recovery-v1')throw Error('RECOVERY_READ_ONLY');
  const now=new Date().toISOString(),initial=staticPublishReceiptSchema.parse({version:'netlify-static-operation-v1',binding:this.binding,operationId,runId,tool,siteId:this.configuration.siteId,manifestHash:this.configuration.manifest.manifestHash,connectionHash:this.configuration.connectionHash,draft:true,...(this.hostIdentity?{hostIdentity:this.hostIdentity}:{}),revision:0,createClaimedAt:now,dispatchedUploads:[],uploaded:[],uploadsComplete:false,statusReadsStarted:0,statusReadsConfirmed:0,diagnostics:[]});
  const result=this.store.claimOperationBinding({key:this.key,operationId,runId,tool,initialResult:JSON.stringify(initial),recovery:{operationId,runId,tool,effect:'unknown',dispatch:'may_have_run',resolution:'pending',scopeHash:this.hostIdentity?.recoveryScopeHash??this.binding,requestHash:this.requestHash,evidenceRefs:[],updatedAt:now}});
  const receipt=this.identity(staticPublishReceiptSchema.parse(JSON.parse(result.operation.result)));if(receipt.runId!==runId)throw Error('SAME_DELIVERY_ALREADY_BOUND');return{claimed:result.claimed,receipt};
 }
 private merge(fact:Fact){
  for(let retry=0;retry<20;retry++){
   const old=this.read();if(!old)throw Error('OPERATION_BINDING_MISSING');
   if(fact.deployId&&old.deployId&&fact.deployId!==old.deployId)throw Error('DEPLOY_IDENTITY_CHANGED');
   if(fact.required&&old.required&&JSON.stringify(fact.required)!==JSON.stringify(old.required))throw Error('REQUIRED_HASHES_CHANGED');
   const next={...old,revision:old.revision+1,deployId:old.deployId??fact.deployId,required:old.required??fact.required,dispatchedUploads:[...new Set([...old.dispatchedUploads,...(fact.dispatchUpload?[fact.dispatchUpload]:[])])],uploaded:[...new Set([...old.uploaded,...(fact.uploaded?[fact.uploaded]:[])])],statusReadsStarted:old.statusReadsStarted+(fact.statusStarted?1:0),statusReadsConfirmed:old.statusReadsConfirmed+(fact.statusConfirmed?1:0),lastKnownState:old.readyObservedAt?'ready':fact.state??old.lastKnownState,publishUrl:old.publishUrl??fact.publishUrl,readyObservedAt:old.readyObservedAt??fact.readyAt,readyFromCompletedRevision:old.readyFromCompletedRevision??fact.readyFromCompletedRevision,diagnostics:fact.diagnostic?[...old.diagnostics,fact.diagnostic].slice(0,20):old.diagnostics};
   next.uploadsComplete=Boolean(next.required&&next.required.every(hash=>next.uploaded.includes(hash)));
   const parsed=this.identity(staticPublishReceiptSchema.parse(next)),ready=staticPublishDisposition(parsed)==='ready';const priorOperation=this.store.operationsForRun(old.runId).find(item=>item.id===old.operationId),priorRecovery=this.store.recoveryForOperation(old.operationId),preserveLegacyDone=priorOperation?.state==='succeeded'&&priorRecovery?.dispatch==='settled'&&priorRecovery.resolution==='verified_done';
   if(this.store.compareAndSwapOperationResult({key:this.key,operationId:old.operationId,runId:old.runId,tool,scopeHash:this.hostIdentity?.recoveryScopeHash??this.binding,requestHash:this.requestHash,expectedResult:JSON.stringify(old),nextResult:JSON.stringify(parsed),state:ready||preserveLegacyDone?'succeeded':parsed.diagnostics.length?'outcome_unknown':'executing',verifiedDone:ready||preserveLegacyDone}))return parsed;
  }
  throw Error('OPERATION_CAS_CONTENTION');
 }
 private diagnostic(phase:'create'|'upload'|'status',error:unknown,signal?:AbortSignal){const code=signal?.aborted?'CANCELLED':error instanceof Error&&['INVALID_RESPONSE','IDENTITY_MISMATCH','HTTP_REJECTED'].includes(error.message)?error.message:'UNCONFIRMED';return this.merge({diagnostic:{phase,code:code as StaticPublishReceipt['diagnostics'][number]['code'],at:new Date().toISOString()}});}
 private session(){let session=this.sessions.get(this.binding);if(!session){const receipt=this.read();session=this.factory({configuration:this.configuration,restoredDeployId:receipt?.deployId,beforeDispatch:async()=>{await this.assertCurrent();const current=this.read();if(!current)throw Error('OPERATION_BINDING_MISSING');}});this.sessions.set(this.binding,session);}return session;}
 private async call(name:string,args:Record<string,unknown>,signal?:AbortSignal){await this.assertCurrent();signal?.throwIfAborted();const raw=await(await this.session()).call(name,args,signal);if(raw.isError||!raw.structuredContent)throw Error('INVALID_RESPONSE');return raw.structuredContent;}
 async create(runId:string,operationId:string=randomUUID(),signal?:AbortSignal){
  if(this.configuration.version==='netlify-static-recovery-v1')throw Error('RECOVERY_READ_ONLY');
  await this.assertCurrent();signal?.throwIfAborted();const configuration=this.configuration;const claim=this.claim(runId,operationId);if(!claim.claimed)return claim.receipt;
  let phase:'create'|'upload'='create';
  try{
   const deploy=staticDeploySchema.parse(await this.call('static_create',{},signal));
   if(deploy.site_id!==this.configuration.siteId||!deploy.required||new Set(deploy.required).size!==deploy.required.length||deploy.required.some(hash=>!configuration.files.some(file=>file.sha1===hash)))throw Error('IDENTITY_MISMATCH');
   this.merge({deployId:deploy.id,required:deploy.required,state:deploy.state});phase='upload';
   for(const hash of deploy.required){
    // Recording dispatch precedes side effect; loss means this upload is never
    // automatically retried. Recovery sessions have no upload capability.
    this.merge({dispatchUpload:hash});
    const uploaded=await this.call('static_upload',{sha1:hash},signal) as {sha1?:string;path?:string;sha256?:string};
    const expected=configuration.files.find(file=>file.sha1===hash)!;if(uploaded.sha1!==hash||uploaded.path!==expected.path||uploaded.sha256!==expected.sha256)throw Error('IDENTITY_MISMATCH');this.merge({uploaded:hash});
   }
   return this.read()!;
  }catch(error){if(error instanceof PublicationHostGuardError)throw error;return this.diagnostic(phase,error,signal);}
 }
 async status(signal?:AbortSignal){await this.assertCurrent();const receipt=this.read();if(!receipt)throw Error('OPERATION_BINDING_MISSING');if(!receipt.deployId||staticPublishDisposition(receipt)==='ready')return receipt;
  // Persist conservatively before any possible dispatch, including cancellation
  // or process death in the following await. Counts are audit facts, not ready.
  this.merge({statusStarted:true});
  try{const deploy=staticDeploySchema.parse(await this.call('static_status',{},signal));if(deploy.id!==receipt.deployId||deploy.site_id!==this.configuration.siteId)throw Error('IDENTITY_MISMATCH');
   const current=this.read()!;const confirmsReady=deploy.state==='ready'&&receipt.uploadsComplete&&current.uploadsComplete&&current.deployId===receipt.deployId&&JSON.stringify(current.required)===JSON.stringify(receipt.required)&&JSON.stringify(current.uploaded)===JSON.stringify(receipt.uploaded);
   return this.merge({statusConfirmed:true,state:deploy.state,publishUrl:confirmsReady?deploy.deploy_ssl_url:undefined,readyAt:confirmsReady?new Date().toISOString():undefined,readyFromCompletedRevision:confirmsReady?receipt.revision:undefined});}
  catch(error){if(error instanceof PublicationHostGuardError)throw error;return this.diagnostic('status',error,signal);}
 }
 async close(){const sessions=[...this.sessions.values()];this.sessions.clear();for(const session of sessions)await(await session).close();}
}
