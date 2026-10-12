import {embeddingConnectionSchema,type EmbeddingConnection,type EmbeddingConnectionView} from '../shared/knowledge-desktop.js';
import type {SettingsStore,CredentialCipher} from './settings.js';
import {createOpenAICompatibleEmbeddingProvider} from './knowledge-base.js';

/** A separate credential scope; model and MCP secrets never authorize embedding. */
export class KnowledgeSettings {
 constructor(private store:SettingsStore,private cipher:CredentialCipher){}
 view():EmbeddingConnectionView{return{connection:this.store.get<EmbeddingConnection|undefined>('knowledge-embedding:config',undefined),hasKey:Boolean(this.store.get<string>('knowledge-embedding:secret','')),encryptionAvailable:this.cipher.isEncryptionAvailable()};}
 authorizationRevision(){return this.store.get<number>('knowledge-embedding:revision',0);}
 save(input:{connection:EmbeddingConnection;apiKey?:string;clearKey?:boolean}){
  const connection=embeddingConnectionSchema.parse(input.connection),old=this.view();
  if(input.apiKey&&input.clearKey)throw Error('EMBEDDING_CONFIG_INVALID: 不能同时保存与清除密钥');
  if(input.apiKey&&!this.cipher.isEncryptionAvailable())throw Error('CREDENTIAL_ENCRYPTION_UNAVAILABLE: 系统安全存储不可用，密钥未保存');
  const changed=old.connection?.endpoint!==connection.endpoint;
  if(input.apiKey)this.store.set('knowledge-embedding:secret',this.cipher.encryptString(input.apiKey).toString('base64'));
  else if(input.clearKey||changed)this.store.set('knowledge-embedding:secret','');
  this.store.set('knowledge-embedding:config',connection);
  this.store.set('knowledge-embedding:revision',this.authorizationRevision()+1);
  return this.view();
 }
 provider(){
  const view=this.view();if(!view.connection||!view.hasKey)return undefined;
  if(!this.cipher.isEncryptionAvailable())throw Error('CREDENTIAL_ENCRYPTION_UNAVAILABLE: 无法读取embedding密钥');
  let apiKey:string;try{apiKey=this.cipher.decryptString(Buffer.from(this.store.get<string>('knowledge-embedding:secret',''),'base64'));}catch{throw Error('EMBEDDING_CREDENTIAL_UNAVAILABLE: 密钥无法解密，请重新配置');}
  return createOpenAICompatibleEmbeddingProvider({...view.connection,apiKey});
 }
}
