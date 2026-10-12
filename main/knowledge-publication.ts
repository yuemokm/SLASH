import {randomUUID} from 'node:crypto';
import {knowledgeCloudConfigSchema,type KnowledgeCloudConfig,type KnowledgeCloudView,type KnowledgePublicationRecord,type KnowledgePublicationPreflight} from '../shared/knowledge-publication.js';
import type {KnowledgeExportBundle} from '../shared/knowledge-base.js';
import type {SettingsStore,CredentialCipher} from './settings.js';
import {prepareBundle} from '../knowledge-web/lib/bundle.js';
import {receiptMatchesOperation,type PublicationReceipt} from '../knowledge-web/lib/publication.js';

type Prepared=ReturnType<typeof prepareBundle>;
type Plan={view:KnowledgePublicationPreflight;projectId:string;revision:number;prepared?:Prepared};
class CloudRequestError extends Error{constructor(public status:number,public rejected:boolean){super(`KNOWLEDGE_CLOUD_HTTP_${status}: 云端未确认，请检查目标、管理权限和数据库迁移`);}}
/** Official Supabase REST/RPC only. No SQL, shell, model, or MCP token reuse. */
export class KnowledgePublication {
 private plans=new Map<string,Plan>();
 private busy=false;
 constructor(private store:SettingsStore,private cipher:CredentialCipher,private hooks:{assertAccess:(projectId:string,write:boolean)=>void;bundle:(id:string)=>Promise<KnowledgeExportBundle>;record?:(value:KnowledgePublicationRecord)=>void},private fetcher:typeof fetch=fetch){}
 settings():KnowledgeCloudView{return{config:this.store.get<KnowledgeCloudConfig|undefined>('knowledge-cloud:config',undefined),hasKey:Boolean(this.store.get('knowledge-cloud:secret','')),encryptionAvailable:this.cipher.isEncryptionAvailable(),revision:this.store.get('knowledge-cloud:revision',0)};}
 save(input:{config:KnowledgeCloudConfig;apiKey?:string;clearKey?:boolean}){
  if(this.busy)throw Error('KNOWLEDGE_PUBLICATION_BUSY: 等待当前核对或发布结束');
  const config=knowledgeCloudConfigSchema.parse(input.config),old=this.settings();
  if(input.apiKey&&input.clearKey)throw Error('KNOWLEDGE_CLOUD_CONFIG_INVALID');
  if(input.apiKey&&!this.cipher.isEncryptionAvailable())throw Error('CREDENTIAL_ENCRYPTION_UNAVAILABLE: 系统安全存储不可用');
  if(input.apiKey)this.store.set('knowledge-cloud:secret',this.cipher.encryptString(input.apiKey).toString('base64'));
  else if(input.clearKey||old.config?.supabaseUrl!==config.supabaseUrl)this.store.set('knowledge-cloud:secret','');
  this.store.set('knowledge-cloud:config',config);this.store.set('knowledge-cloud:revision',old.revision+1);this.plans.clear();return this.settings();
 }
 private all(){return this.store.get<KnowledgePublicationRecord[]>('knowledge-cloud:records',[]);}
 records(projectId:string,id:string){this.hooks.assertAccess(projectId,false);return this.all().filter(r=>r.projectId===projectId&&r.knowledgeBaseId===id);}
 private persist(record:KnowledgePublicationRecord){const records=this.all();this.store.set('knowledge-cloud:records',records.some(r=>r.operationId===record.operationId)?records.map(r=>r.operationId===record.operationId?record:r):[record,...records]);this.hooks.record?.(record);}
 private secret(){if(!this.cipher.isEncryptionAvailable())throw Error('CREDENTIAL_ENCRYPTION_UNAVAILABLE');try{return this.cipher.decryptString(Buffer.from(this.store.get('knowledge-cloud:secret',''),'base64'));}catch{throw Error('KNOWLEDGE_CLOUD_CREDENTIAL_UNAVAILABLE: 请重新保存发布专用密钥');}}
 private async request(target:string,route:string,method='GET',body?:unknown){
  const key=this.secret();if(!key)throw Error('KNOWLEDGE_CLOUD_CONFIG_MISSING: 请保存发布专用密钥');
  // Deliberately never expose upstream bodies or errors: they may contain credentials or raw content.
  let response:Response;try{response=await this.fetcher(target.replace(/\/$/,'')+route,{method,headers:{apikey:key,Authorization:'Bearer '+key,'content-type':'application/json'},...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(90000),redirect:'error'});}catch{throw Error('KNOWLEDGE_CLOUD_NETWORK: 未取得云端确认，请核对网络和操作回执');}
  if(!response.ok){
   // Supabase authentication rejection / PostgREST transaction error is proof of no commit.
   // Gateway 5xx, timeout and arbitrary bodies cannot establish rollback.
   let sqlCode='';try{const body=await response.json() as {code?:unknown};if(typeof body.code==='string')sqlCode=body.code;}catch{}
   const rejected=[401,403,404].includes(response.status)||[400,409,422].includes(response.status)&&/^(?:PGRST\d{3}|P0001|(?:22|23|40|42)[A-Z0-9]{3})$/.test(sqlCode);
   throw new CloudRequestError(response.status,rejected);
  }
  try{return await response.json() as unknown;}catch{throw Error('KNOWLEDGE_CLOUD_RESPONSE_INVALID');}
 }
 private async active(target:string,id:string){const rows=await this.request(target,`/rest/v1/knowledge_bases?select=id,active_version,sharing_enabled&id=eq.${encodeURIComponent(id)}`);if(!Array.isArray(rows)||rows.length>1)throw Error('KNOWLEDGE_CLOUD_RESPONSE_INVALID');const row=rows[0];if(!row)return null;if(row.id!==id||!(row.active_version===null||typeof row.active_version==='string'))throw Error('KNOWLEDGE_CLOUD_RESPONSE_INVALID');return row.active_version as string|null;}
 private unresolved(projectId:string,id:string){return this.all().some(r=>r.projectId===projectId&&r.knowledgeBaseId===id&&r.status==='outcome_unknown');}
 private async members(target:string,accounts:string[]){
  const ids=accounts.filter(v=>!v.includes('@')),emails=new Set(accounts.filter(v=>v.includes('@'))),found=new Map<string,string>();
  for(const member of ids){const user=await this.request(target,`/auth/v1/admin/users/${member}`) as {id?:unknown};if(user?.id!==member)throw Error('KNOWLEDGE_MEMBER_NOT_FOUND: 同事尚未注册，请先让其在网页完成注册');}
  if(emails.size)for(let page=1;page<=10;page++){
   const result=await this.request(target,`/auth/v1/admin/users?page=${page}&per_page=1000`) as {users?:Array<{id?:unknown;email?:unknown}>};
   if(!Array.isArray(result?.users))throw Error('KNOWLEDGE_CLOUD_RESPONSE_INVALID');
   for(const user of result.users)if(typeof user.email==='string'&&emails.has(user.email.toLowerCase())&&typeof user.id==='string')found.set(user.email.toLowerCase(),user.id);
   if(found.size===emails.size||result.users.length<1000)break;
  }
  if(found.size!==emails.size)throw Error('KNOWLEDGE_MEMBER_NOT_FOUND: 有同事邮箱未查到已注册账号；请先让其在网页完成注册，再预检（最多查询10000个账号）');
  return [...new Set([...ids,...found.values()])].sort();
 }
 async preflight(projectId:string,id:string,action:'publish'|'revoke'){
  this.hooks.assertAccess(projectId,true);if(this.busy)throw Error('KNOWLEDGE_PUBLICATION_BUSY');if(this.unresolved(projectId,id))throw Error('KNOWLEDGE_PUBLICATION_UNKNOWN: 有结果待核对的操作；不能再次发布或撤销');
  const settings=this.settings(),config=settings.config;if(!config||!settings.hasKey)throw Error('KNOWLEDGE_CLOUD_CONFIG_MISSING: 请先配置发布目标和专用密钥');
  this.busy=true;try{
   let prepared:Prepared|undefined,prior:KnowledgePublicationRecord|undefined;
   if(action==='publish')prepared=prepareBundle(await this.hooks.bundle(id));
   else {prior=this.records(projectId,id).find(r=>r.target===config.supabaseUrl&&r.status!=='failed');if(!prior||prior.action!=='publish'||prior.status!=='succeeded')throw Error('KNOWLEDGE_NOT_PUBLISHED: 此目标没有尚未停止的确认发布记录');}
   const expectedActive=await this.active(config.supabaseUrl,id);
   if(action==='publish'&&expectedActive===prepared!.payload.index_id)throw Error('KNOWLEDGE_VERSION_ALREADY_PUBLISHED: 此版本已发布，更新或恢复分享请先重新构建并启用新版本');
   if(action==='revoke'&&expectedActive!==prior!.indexId)throw Error('KNOWLEDGE_REMOTE_CHANGED: 云端版本已变化，不能撤销另一版本');
   // Query the publication table before permitting any write, including first publication.
   await this.request(config.supabaseUrl,'/rest/v1/knowledge_publications?select=operation_id&limit=1');
   const memberIds=action==='publish'?await this.members(config.supabaseUrl,config.memberIds):[];
   this.hooks.assertAccess(projectId,true);if(settings.revision!==this.settings().revision)throw Error('KNOWLEDGE_CLOUD_CONFIG_CHANGED');
   const token=randomUUID(),view:KnowledgePublicationPreflight={token,knowledgeBaseId:id,action,target:config.supabaseUrl,webUrl:config.webUrl,expectedActive,indexId:prepared?.payload.index_id??prior?.indexId,manifestHash:prepared?.payload.manifest_hash??prior?.manifestHash,memberIds,memberAccounts:action==='publish'?config.memberIds:[],...(prepared?{documents:prepared.summary.documents,chunks:prepared.summary.chunks,coverage:prepared.summary.coverage}:{}),expiresAt:new Date(Date.now()+300000).toISOString(),notice:'目标数据库与已有账号已查询。网页部署、环境变量和实际问答效果仍须维护者验收；预检不会上传资料。'};
   this.plans.set(token,{view,projectId,revision:settings.revision,prepared});return view;
  }finally{this.busy=false;}
 }
 private matches(raw:unknown,record:KnowledgePublicationRecord):raw is Record<string,unknown>{if(!raw||typeof raw!=='object'||Array.isArray(raw))return false;const receipt=raw as Record<string,unknown>;return (record.action!=='revoke'||receipt.index_id===record.expectedActive)&&receiptMatchesOperation(receipt as unknown as PublicationReceipt,record.operationId,{action:record.action,kbId:record.knowledgeBaseId,indexId:record.indexId,manifestHash:record.manifestHash,expectedActive:record.expectedActive,memberIds:record.action==='publish'?record.memberIds:undefined});}
 async commit(projectId:string,id:string,token:string){
  this.hooks.assertAccess(projectId,true);if(this.busy)throw Error('KNOWLEDGE_PUBLICATION_BUSY');if(this.unresolved(projectId,id))throw Error('KNOWLEDGE_PUBLICATION_UNKNOWN: 请先核对原操作，禁止重复发送');
  const plan=this.plans.get(token);if(!plan||plan.projectId!==projectId||plan.view.knowledgeBaseId!==id||plan.revision!==this.settings().revision||Date.parse(plan.view.expiresAt)<Date.now())throw Error('KNOWLEDGE_PREFLIGHT_EXPIRED: 配置或项目变化，请重新预检');
  this.busy=true;try{
   const {view}=plan;
   if(await this.active(view.target,id)!==view.expectedActive)throw Error('KNOWLEDGE_REMOTE_CHANGED: 云端版本已变化，请重新预检');
   if(view.action==='publish'){const current=prepareBundle(await this.hooks.bundle(id));if(current.payload.manifest_hash!==view.manifestHash)throw Error('KNOWLEDGE_SOURCE_CHANGED: 资料或版本变化，请重新构建并预检');}
   this.hooks.assertAccess(projectId,true);if(plan.revision!==this.settings().revision)throw Error('KNOWLEDGE_CLOUD_CONFIG_CHANGED');
   const now=new Date().toISOString(),record:KnowledgePublicationRecord={operationId:randomUUID(),projectId,knowledgeBaseId:id,action:view.action,target:view.target,webUrl:view.webUrl,indexId:view.indexId,manifestHash:view.manifestHash,expectedActive:view.expectedActive,memberIds:view.memberIds,status:'outcome_unknown',createdAt:now,updatedAt:now};
   // Durable uncertainty BEFORE sending. Crash/restart cannot create a second write.
   this.persist(record);this.plans.delete(token);
   try{const receipt=await this.request(view.target,`/rest/v1/rpc/knowledge_${view.action==='publish'?'publish':'revoke'}`,'POST',view.action==='publish'?{p_operation:record.operationId,p_expected_active:view.expectedActive,p_bundle:plan.prepared!.payload,p_members:view.memberIds}:{p_operation:record.operationId,p_kb:id,p_expected_active:view.expectedActive});if(this.matches(receipt,record)){record.status='succeeded';record.receipt=receipt;record.updatedAt=new Date().toISOString();this.persist(record);}}catch(error){if(error instanceof CloudRequestError&&error.rejected){record.status='failed';record.errorCode=`HTTP_${error.status}_REJECTED`;record.updatedAt=new Date().toISOString();this.persist(record);}/* Uncertain delivery remains durable unknown; never retry it. */}
   return record;
  }finally{this.busy=false;}
 }
 async reconcile(projectId:string,id:string,operationId:string){
  this.hooks.assertAccess(projectId,false);if(this.busy)throw Error('KNOWLEDGE_PUBLICATION_BUSY');
  const record=this.records(projectId,id).find(r=>r.operationId===operationId);if(!record)throw Error('KNOWLEDGE_PUBLICATION_NOT_FOUND');if(record.target!==this.settings().config?.supabaseUrl)throw Error('KNOWLEDGE_TARGET_CHANGED: 请先恢复此操作对应的发布目标，不能向新目标核对旧回执');
  this.busy=true;try{const rows=await this.request(record.target,`/rest/v1/knowledge_publications?select=operation_id,kb_id,index_id,manifest_hash,action,expected_active,member_ids,created_at&operation_id=eq.${operationId}`);if(!Array.isArray(rows)||rows.length>1)throw Error('KNOWLEDGE_CLOUD_RESPONSE_INVALID');if(rows.length){if(!this.matches(rows[0],record))throw Error('KNOWLEDGE_RECEIPT_MISMATCH: 回执的目标、版本或成员与本机登记不一致，仍待核对');record.status='succeeded';record.receipt=rows[0];record.updatedAt=new Date().toISOString();this.persist(record);}this.hooks.assertAccess(projectId,false);return record;}finally{this.busy=false;}
 }
}
