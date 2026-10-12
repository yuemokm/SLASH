import {createHash} from 'node:crypto';
import type {OAuthClientInformationMixed,OAuthTokens} from '@modelcontextprotocol/sdk/shared/auth.js';
import type {Connection} from '../shared/types.js';
import type {McpConnectionOptions} from '../shared/mcp-connections.js';
import type {CredentialCipher,SettingsStore} from './settings.js';

export type McpConnection=Connection&McpConnectionOptions;
export type McpCredentials={binding:string;tokens?:OAuthTokens;client?:OAuthClientInformationMixed;redirectUrl?:string;publisher?:{purpose:'netlify-api';token:string;verifiedAt?:string}};
export function mcpBinding(connection:McpConnection){return createHash('sha256').update(JSON.stringify({id:connection.id,kind:connection.kind,url:connection.url?new URL(connection.url).href:'',command:connection.command,args:connection.args,auth:connection.mcpAuth??'none',publisher:connection.mcpPublisher})).digest('hex');}
/** Only ciphertext enters SQLite. Nothing from this vault is placed in State. */
export class McpCredentialVault{
 private secrets=new Set<string>();
 private generations=new Map<string,number>();
 constructor(private store:SettingsStore,private cipher:CredentialCipher){}
 assertAvailable(){if(!this.cipher.isEncryptionAvailable())throw Error('MCP_CREDENTIAL_UNAVAILABLE');}
 private key(id:string){return `mcp-oauth-secret:${id}`;}
 read(connection:McpConnection):McpCredentials|undefined{
  const value=this.store.get<string>(this.key(connection.id),'');if(!value)return;
  if(!this.cipher.isEncryptionAvailable())throw Error('MCP_CREDENTIAL_UNAVAILABLE');
  let record:McpCredentials;try{record=JSON.parse(this.cipher.decryptString(Buffer.from(value,'base64')));}catch{throw Error('MCP_CREDENTIAL_UNAVAILABLE');}
  if(record.binding!==mcpBinding(connection)){this.clear(connection.id);return;}
  this.remember(record);return record;
 }
 write(connection:McpConnection,value:Omit<McpCredentials,'binding'>){
  if(!this.cipher.isEncryptionAvailable())throw Error('MCP_CREDENTIAL_UNAVAILABLE');
  this.store.set(this.key(connection.id),this.cipher.encryptString(JSON.stringify({...value,publisher:this.read(connection)?.publisher,binding:mcpBinding(connection)})).toString('base64'));
  this.remember(value);
 }
 writePublisher(connection:McpConnection,token:string){
  this.assertAvailable();
  if(connection.mcpPublisher?.provider!=='netlify'||!/^\S{10,4096}$/.test(token))throw Error('PUBLISHER_CREDENTIAL_INVALID');
  const old=this.read(connection);
  const record={...old,binding:mcpBinding(connection),publisher:{purpose:'netlify-api' as const,token}};
  this.store.set(this.key(connection.id),this.cipher.encryptString(JSON.stringify(record)).toString('base64'));
  this.remember(record);
  this.invalidateSession(connection.id);
 }
 publisherVerified(connection:McpConnection){return Boolean(this.read(connection)?.publisher?.verifiedAt);}
 confirmPublisherSite(connection:McpConnection,generation:number){
  const record=this.read(connection);
  if(!record?.publisher||this.generation(connection.id)!==generation)throw Error('PUBLISHER_AUTHORIZATION_CHANGED');
  record.publisher.verifiedAt=new Date().toISOString();
  this.store.set(this.key(connection.id),this.cipher.encryptString(JSON.stringify(record)).toString('base64'));
 }
 publisherToken(connection:McpConnection){
  const record=this.read(connection);
  if(record?.publisher?.purpose!=='netlify-api')throw Error('PUBLISHER_CREDENTIAL_MISSING');
  return record.publisher.token;
 }
 clearPublisher(connection:McpConnection){
  const old=this.read(connection);
  this.invalidateSession(connection.id);
  if(old){
   delete old.publisher;
   this.store.set(this.key(connection.id),this.cipher.encryptString(JSON.stringify(old)).toString('base64'));
  }
 }
 generation(id:string){return this.generations.get(id)??0;}
 invalidateSession(id:string){this.generations.set(id,this.generation(id)+1);}
 clear(id:string){this.invalidateSession(id);this.store.set(this.key(id),'');}
 private remember(value:Omit<McpCredentials,'binding'>){if(value.publisher?.token)this.secrets.add(value.publisher.token);for(const record of [value.tokens,value.client])for(const [key,secret]of Object.entries(record??{}))if(['access_token','refresh_token','id_token','client_secret','registration_access_token'].includes(key)&&typeof secret==='string'&&secret.length>=6)this.secrets.add(secret);}
 redact(value:string){for(const secret of this.secrets)value=value.replaceAll(secret,'[MCP 凭据已隐藏]');return value;}
}
