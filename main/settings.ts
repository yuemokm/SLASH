import {execFile} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {promisify} from 'node:util';
import {modelEntrySchema,modelProtocols,type ConnectionDiscovery,type ModelEntry,type ModelGroup,type ModelProtocol,type PermissionSettings,type State} from '../shared/types.js';
import {resolveModelLimits,type ModelLimitMetadata} from './model-limits.js';
import {thinkingFingerprint} from './model-thinking.js';

export const SETTINGS_SCHEMA_VERSION=2;
export const DEFAULT_BAISHAN_MODEL:ModelEntry={
 id:'baishan-deepseek-v4-flash-0731',
 provider:'baishan',
 name:'Baishan DeepSeek-V4-Flash-0731',
 baseUrl:'https://api.edgefn.net/v1',
 modelId:'DeepSeek-V4-Flash-0731',
 protocol:'openai-completions',
 hasKey:false,
};
export const DEFAULT_PERMISSION_SETTINGS:PermissionSettings={
 workspace_read:'allow',
 web_read:'ask',
 connection_config:'ask',
 process_execute:'ask',
 external_action:'ask',
 artifact_write:'allow',
};

export type SettingsStore={get<T>(key:string,fallback:T):T;set(key:string,value:unknown):void};
export type CredentialCipher={isEncryptionAvailable():boolean;encryptString(value:string):Buffer;decryptString(value:Buffer):string};
type StateAccess={get():State;save():void};

function normalizedUrl(value:string){return value.trim().replace(/\/$/,'');}
function providerForLegacy(model:State['model']){
 if(/edgefn|baishan/i.test(model.baseUrl)||/deepseek-v4-flash-0731/i.test(model.id))return'baishan';
 try{return new URL(model.baseUrl).hostname.replace(/^api\./,'').split('.')[0]||'custom';}catch{return'custom';}
}
function legacyEntry(model:State['model']):ModelEntry{
 const provider=providerForLegacy(model);
 const isDefault=provider==='baishan'&&model.id==='DeepSeek-V4-Flash-0731';
 const suffix=createHash('sha256').update(`${provider}\0${model.baseUrl}\0${model.id}`).digest('hex').slice(0,12);
 return{id:isDefault?DEFAULT_BAISHAN_MODEL.id:`legacy-${suffix}`,provider,name:isDefault?DEFAULT_BAISHAN_MODEL.name:model.id,baseUrl:normalizedUrl(model.baseUrl),modelId:model.id,protocol:'openai-completions',hasKey:model.hasKey};
}
function cleanModel(model:ModelEntry):ModelEntry{
 return{...model,provider:model.provider.trim().toLowerCase(),name:model.name.trim(),baseUrl:normalizedUrl(model.baseUrl),modelId:model.modelId.trim(),protocol:modelProtocols.includes(model.protocol as ModelProtocol)?model.protocol:'openai-completions',hasKey:Boolean(model.hasKey)};
}

export class ModelSettings {
 constructor(private store:SettingsStore,private cipher:CredentialCipher,private state:StateAccess){}
 private secretKey(id:string){return`model-secret:${id}`;}
 initialize(){
  const state=this.state.get();
  const parsedModels=(state.models??[]).map(value=>modelEntrySchema.safeParse(value));
  const invalidModel=parsedModels.find(result=>!result.success);if(invalidModel&&!invalidModel.success)throw Error('SETTINGS_MIGRATION_FAILED: 已保存的模型配置无效：'+invalidModel.error.issues.map(issue=>issue.path.join('.')+' '+issue.message).join('; '));
  const storedModels=parsedModels.filter(result=>result.success).map(result=>result.data);
  const models=(storedModels.length?storedModels:[legacyEntry(state.model)]).map(cleanModel);
  if(new Set(models.map(item=>item.id)).size!==models.length)throw Error('SETTINGS_MIGRATION_FAILED: 模型配置 ID 重复');
  let defaultModelId=models.some(item=>item.id===state.defaultModelId)?state.defaultModelId!:models[0].id;
  const oldEncrypted=this.store.get<string>('key','');
  const migrated=models.find(item=>item.id===defaultModelId)!;
  if(oldEncrypted){
   if(this.cipher.isEncryptionAvailable())try{if(!this.cipher.decryptString(Buffer.from(oldEncrypted,'base64')))throw Error();}catch{throw Error('SETTINGS_MIGRATION_FAILED: 旧模型密钥无法解密，原记录已保留');}
   if(!this.store.get<string>(this.secretKey(migrated.id),''))this.store.set(this.secretKey(migrated.id),oldEncrypted);
   migrated.hasKey=true;
  }
  for(const model of models)model.hasKey=Boolean(this.store.get<string>(this.secretKey(model.id),''));
  const now=new Date().toISOString();
  state.models=models.map(item=>({...item,createdAt:item.createdAt??now,updatedAt:item.updatedAt??now}));
  state.defaultModelId=defaultModelId;
  state.permissions={...DEFAULT_PERMISSION_SETTINGS,...state.permissions};
  this.syncLegacy(state);
  this.store.set('settings_schema_version',SETTINGS_SCHEMA_VERSION);
  this.state.save();
  if(oldEncrypted)this.store.set('key','');
  return this.list();
 }
 private syncLegacy(state=this.state.get()){
  const selected=state.models?.find(item=>item.id===state.defaultModelId)??state.models?.[0]??DEFAULT_BAISHAN_MODEL;
  state.defaultModelId=selected.id;
  state.model={baseUrl:selected.baseUrl,id:selected.modelId,hasKey:selected.hasKey};
 }
 list():ModelGroup[]{
  const groups=new Map<string,ModelEntry[]>();
  for(const model of this.state.get().models??[]){const values=groups.get(model.provider)??[];values.push({...model});groups.set(model.provider,values);}
  return[...groups.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([provider,models])=>({provider,models:models.sort((a,b)=>a.name.localeCompare(b.name))}));
 }
 upsert(input:{id?:string;provider:string;name:string;baseUrl:string;modelId:string;protocol?:ModelProtocol;supportsVision?:boolean;contextWindow?:number|null;maxTokens?:number|null},key?:string){
  const state=this.state.get(),models=state.models??[];
  const existing=input.id?models.find(item=>item.id===input.id):undefined;
  if(input.id&&!existing)throw Error('VALIDATION_FAILED: 模型条目不存在');
  const id=existing?.id??randomUUID(),now=new Date().toISOString();
  const protocol=input.protocol??existing?.protocol??'openai-completions';
  const sameIdentity=existing&&normalizedUrl(existing.baseUrl)===normalizedUrl(input.baseUrl)&&existing.modelId===input.modelId.trim()&&existing.protocol===protocol;
  const contextWindow=input.contextWindow===null?undefined:input.contextWindow??(sameIdentity?existing.contextWindow:undefined);
  const maxTokens=input.maxTokens===null?undefined:input.maxTokens??(sameIdentity?existing.maxTokens:undefined);
  // Complete validation precedes credential mutations, so a rejected limit
  // never changes an existing model's secret or saved configuration.
  const validated=modelEntrySchema.parse({id,provider:input.provider,name:input.name,baseUrl:normalizedUrl(input.baseUrl),modelId:input.modelId,protocol,supportsVision:input.supportsVision,contextWindow,maxTokens,hasKey:false});
  const limitsInput={entryId:id,baseUrl:validated.baseUrl,id:validated.modelId,protocol:validated.protocol,contextWindow,maxTokens};
  const fingerprint=thinkingFingerprint(limitsInput);
  const snapshot=this.store.get<{resolution?:{capability?:{fingerprint?:string};metadataLimits?:ModelLimitMetadata}}|undefined>(`model-thinking:v1:${fingerprint}`,undefined);
  resolveModelLimits(limitsInput,fingerprint,snapshot?.resolution?.capability?.fingerprint===fingerprint?snapshot.resolution.metadataLimits:undefined);
  if(key!==undefined){
   if(!key)throw Error('VALIDATION_FAILED: 密钥不能为空');
   if(!this.cipher.isEncryptionAvailable())throw Error('系统凭据加密不可用');
   this.store.set(this.secretKey(id),this.cipher.encryptString(key).toString('base64'));
  }
  const endpointChanged=Boolean(existing&&normalizedUrl(existing.baseUrl)!==normalizedUrl(input.baseUrl));
  if(endpointChanged&&key===undefined)this.store.set(this.secretKey(id),'');
  const model:ModelEntry={...validated,provider:validated.provider.toLowerCase(),supportsVision:Boolean(input.supportsVision),hasKey:key!==undefined||Boolean(existing?.hasKey&&!endpointChanged),createdAt:existing?.createdAt??now,updatedAt:now};
  state.models=[...models.filter(item=>item.id!==id),model];
  state.defaultModelId=state.defaultModelId??id;
  this.syncLegacy(state);this.state.save();
  return{...model};
 }
 remove(id:string){
  const state=this.state.get(),models=state.models??[];
  if(!models.some(item=>item.id===id))throw Error('VALIDATION_FAILED: 模型条目不存在');
  if(models.length===1)throw Error('VALIDATION_FAILED: 至少保留一个模型配置');
  state.models=models.filter(item=>item.id!==id);
  this.store.set(this.secretKey(id),'');
  if(state.defaultModelId===id)state.defaultModelId=state.models[0]?.id;
  this.syncLegacy(state);this.state.save();
  return this.list();
 }
 setDefault(id:string){
  const state=this.state.get();if(!state.models?.some(item=>item.id===id))throw Error('VALIDATION_FAILED: 模型条目不存在');
  state.defaultModelId=id;this.syncLegacy(state);this.state.save();return id;
 }
 model(id:string){const result=this.state.get().models?.find(item=>item.id===id);if(!result)throw Error('VALIDATION_FAILED: 模型条目不存在');return result;}
 credential(id:string){
  const encrypted=this.store.get<string>(this.secretKey(id),'');
  if(!encrypted)throw Error('未配置密钥');
  if(!this.cipher.isEncryptionAvailable())throw Error('系统凭据加密不可用');
  try{return this.cipher.decryptString(Buffer.from(encrypted,'base64'));}catch{throw Error('模型密钥无法解密，请重新配置');}
 }
 defaultCredential(){const id=this.state.get().defaultModelId;if(!id)return'';try{return this.credential(id);}catch{return'';}}
 redact(value:string){
  let result=value;
  for(const model of this.state.get().models??[])try{const key=this.credential(model.id);if(key)result=result.replaceAll(key,'[REDACTED]');}catch{}
  return result;
 }
}

type DiscoveryRunner=(executable:string,args:readonly string[])=>Promise<{stdout:string;stderr?:string}>;
const execFileAsync=promisify(execFile);
const defaultRunner:DiscoveryRunner=async(executable,args)=>execFileAsync(executable,[...args],{windowsHide:true,timeout:8_000,maxBuffer:1_000_000});
const cliCatalog=[
 {id:'official-feishu-cli',provider:'feishu',name:'飞书官方 CLI',commands:['lark-cli.exe','lark.exe'],capabilities:['document.create','document.update']},
 {id:'official-dingtalk-cli',provider:'dingtalk',name:'钉钉官方 DWS CLI',commands:['dws.exe'],capabilities:['document.create','document.update','workspace.search']},
] as const;

function knownLocations(command:string){
 const values:string[]=[];
 const appData=process.env.APPDATA,localAppData=process.env.LOCALAPPDATA,userProfile=process.env.USERPROFILE;
 if(appData&&command==='lark-cli.exe')values.push(path.join(appData,'npm','node_modules','@larksuite','cli','bin','lark-cli.exe'));
 if(localAppData)values.push(path.join(localAppData,'Programs',path.basename(command,'.exe'),command));
 if(userProfile&&command==='dws.exe')values.push(path.join(userProfile,'.dws','bin','dws.exe'));
 return values;
}
async function exists(file:string){try{return(await fs.stat(file)).isFile();}catch{return false;}}

export async function discoverInstalledClis(runner:DiscoveryRunner=defaultRunner):Promise<ConnectionDiscovery[]>{
 const results:ConnectionDiscovery[]=[];
 for(const item of cliCatalog){
  let command='',source:'path'|'known-location'='path';
  for(const candidate of item.commands){
   try{const found=(await runner('where.exe',[candidate])).stdout.split(/\r?\n/).map(value=>value.trim()).find(value=>/\.exe$/i.test(value));if(found){command=found;break;}}catch{}
   for(const known of knownLocations(candidate))if(await exists(known)){command=known;source='known-location';break;}
   if(command)break;
  }
  if(!command){results.push({id:item.id,provider:item.provider,name:item.name,command:'',source,capabilities:[...item.capabilities],available:false,diagnostic:'未在 PATH 或常见安装目录找到可执行文件'});continue;}
  let version:string|undefined,diagnostic:string|undefined;
  try{version=(await runner(command,['--version'])).stdout.trim().slice(0,2000)||undefined;}catch(error){diagnostic='已找到可执行文件，但版本检查失败：'+(error instanceof Error?error.message:String(error)).slice(0,500);}
  results.push({id:item.id,provider:item.provider,name:item.name,command,version,source,capabilities:[...item.capabilities],available:true,diagnostic});
 }
 return results;
}
