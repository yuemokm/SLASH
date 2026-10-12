import {createHash} from 'node:crypto';
import {createAuthorizedOAuthFetch} from './network-target-policy.js';
import {capturePrototypeStaticManifest} from './prototype-delivery.js';
import {staticPublishRecoveryConfigurationSchema,staticDeploySchema,staticPublishConfigurationSchema,staticPhaseArgumentsSchema,staticUploadArgumentsSchema,type StaticPublishConfiguration,type StaticPublishRecoveryConfiguration} from '../shared/prototype-publish-operation.js';

export const digest=(value:Buffer|string,algorithm='sha256')=>createHash(algorithm).update(value).digest('hex');
export function validateStaticConfiguration(input:unknown){
 const configuration=staticPublishConfigurationSchema.parse(input),snapshot=new Map<string,{bytes:Buffer;hash:string}>(),byHash=new Map<string,{path:string;bytes:Buffer}>();
 for(const file of configuration.files){const bytes=Buffer.from(file.base64,'base64');if(bytes.toString('base64')!==file.base64||bytes.length!==file.bytes||digest(bytes)!==file.sha256||digest(bytes,'sha1')!==file.sha1)throw Error('FROZEN_BYTES_CHANGED');snapshot.set(file.path,{bytes,hash:file.sha256});const prior=byHash.get(file.sha1);if(prior&&!prior.bytes.equals(bytes))throw Error('SHA1_COLLISION');if(!prior)byHash.set(file.sha1,{path:file.path,bytes});}
 if(snapshot.size!==configuration.files.length||JSON.stringify(capturePrototypeStaticManifest(configuration.manifest.entryPath,snapshot))!==JSON.stringify(configuration.manifest))throw Error('FROZEN_MANIFEST_CHANGED');
 return{configuration,snapshot,byHash};
}
/** Stateless durable transport: only the child session's verified deploy ID is
 * transient. No Store, ledger, claim, recovery or arbitrary target tool args. */
export function openStaticPhase(input:{configuration:StaticPublishConfiguration|StaticPublishRecoveryConfiguration;origin:string;fixtureOrigin?:string;token:string;restoredDeployId?:string}){
 const recovery=input.configuration.version==='netlify-static-recovery-v1'?staticPublishRecoveryConfigurationSchema.parse(input.configuration):undefined;
 const validated=recovery?undefined:validateStaticConfiguration(input.configuration),configuration=recovery??validated!.configuration,byHash=validated?.byHash??new Map<string,{path:string;bytes:Buffer}>(),origin=new URL(input.origin);
 if(origin.href!==origin.origin+'/'||origin.username||origin.password||origin.origin!=='https://api.netlify.com'&&origin.origin!==input.fixtureOrigin)throw Error('FIXED_TARGET_ONLY');
 const fetchOnce=createAuthorizedOAuthFetch({connectionId:'isolated-netlify-phase',binding:configuration.deliveryBindingHash,fixtureOrigin:input.fixtureOrigin});
 let deployId:string|undefined=recovery?.deployId,required:string[]|undefined,createStarted=Boolean(recovery||input.restoredDeployId);const dispatchedHashes=new Set<string>();
 if(input.restoredDeployId){staticDeploySchema.shape.id.parse(input.restoredDeployId);if(recovery&&input.restoredDeployId!==recovery.deployId)throw Error('IDENTITY_MISMATCH');deployId=input.restoredDeployId;}
 async function request(suffix:string,method:string,body:Buffer|string|undefined,signal?:AbortSignal){
  const response=await fetchOnce(new URL('/api/v1'+suffix,origin),{method,body:Buffer.isBuffer(body)?new Uint8Array(body):body,signal,headers:{Authorization:'Bearer '+input.token,'Content-Type':method==='POST'?'application/json':'application/octet-stream'}});
  let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
  try{if(!response.ok)throw Error('HTTP_REJECTED');if(!response.body)throw Error('INVALID_RESPONSE');reader=response.body.getReader();const chunks:Uint8Array[]=[];let total=0;for(;;){const next=await reader.read();if(next.done)break;total+=next.value.byteLength;if(total>100_000){await reader.cancel();throw Error('INVALID_RESPONSE');}chunks.push(next.value);}return JSON.parse(Buffer.concat(chunks,total).toString('utf8'));}
  finally{reader?.releaseLock();await response.body?.cancel().catch(()=>{});}
 }
 function bound(raw:unknown,expected?:string){const deploy=staticDeploySchema.parse(raw);if(deploy.site_id!==configuration.siteId||expected&&deploy.id!==expected)throw Error('IDENTITY_MISMATCH');return deploy;}
 return{
  async create(args:unknown,signal?:AbortSignal){staticPhaseArgumentsSchema.parse(args);if(configuration.version==='netlify-static-recovery-v1')throw Error('RECOVERY_READ_ONLY');if(createStarted)throw Error('CREATE_ALREADY_CLAIMED');signal?.throwIfAborted();createStarted=true;
   const deploy=bound(await request('/sites/'+encodeURIComponent(configuration.siteId)+'/deploys','POST',JSON.stringify({files:Object.fromEntries(configuration.files.map(file=>['/'+file.path,file.sha1])),draft:true}),signal));
   if(!deploy.required||new Set(deploy.required).size!==deploy.required.length||deploy.required.some(hash=>!byHash.has(hash)))throw Error('INVALID_RESPONSE');
   // Assignment follows site/ID/draft/required validation, never raw.id.
   deployId=deploy.id;required=[...deploy.required];return deploy;
  },
  async upload(args:unknown,signal?:AbortSignal){const selected=staticUploadArgumentsSchema.parse(args);if(!deployId||!required?.includes(selected.sha1)||dispatchedHashes.has(selected.sha1))throw Error('UNBOUND_UPLOAD');signal?.throwIfAborted();dispatchedHashes.add(selected.sha1);const file=byHash.get(selected.sha1)!;await request('/deploys/'+encodeURIComponent(deployId)+'/files/'+file.path.split('/').map(encodeURIComponent).join('/'),'PUT',file.bytes,signal);return{sha1:selected.sha1,path:file.path,sha256:digest(file.bytes)};},
  async status(args:unknown,signal?:AbortSignal){staticPhaseArgumentsSchema.parse(args);if(!deployId)throw Error('UNBOUND_STATUS');return bound(await request('/deploys/'+encodeURIComponent(deployId),'GET',undefined,signal),deployId);},
 };
}
