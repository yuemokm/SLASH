import {verifyPrivateNetlifySite} from './netlify-static-site.js';
import {PrivateNetlifySessions} from './netlify-static-private.js';
import {PRIVATE_NETLIFY_ADAPTER} from '../shared/netlify-static-private.js';
import {staticPhaseArgumentsSchema} from '../shared/prototype-publish-operation.js';
import {z} from 'zod';
import type {McpRequest} from '../shared/mcp-connections.js';
import type {CredentialCipher,SettingsStore} from './settings.js';
import {McpCredentialVault,mcpBinding,type McpConnection} from './mcp-credentials.js';
import {McpOAuthBroker,mcpNetworkBinding} from './mcp-oauth.js';
import {McpElicitationBroker} from './mcp-elicitations.js';
import {cancelMcpConnection,configureMcpRuntime} from './mcp-client.js';
import {McpSafeError} from './mcp-errors.js';

/** Desktop-only management plane. No runtime web endpoint is created here. */
export class McpHost{
 readonly oauth:McpOAuthBroker;readonly elicitations:McpElicitationBroker;
 private vault:McpCredentialVault;private publisher?:PrivateNetlifySessions;
 constructor(private options:{store:SettingsStore;cipher:CredentialCipher;connections:()=>McpConnection[];openExternal:(url:string)=>Promise<unknown>;allowLocalFixture?:boolean;publicationDirectory?:string}){
  const current=(id:string)=>options.connections().find(item=>item.id===id);
  this.vault=new McpCredentialVault(options.store,options.cipher);
  if(options.publicationDirectory){
   this.publisher=new PrivateNetlifySessions({dir:options.publicationDirectory,vault:this.vault,current});
  }
  this.oauth=new McpOAuthBroker({vault:this.vault,current,openExternal:options.openExternal,allowLocalFixture:options.allowLocalFixture});
  this.elicitations=new McpElicitationBroker({current,openExternal:options.openExternal});
  configureMcpRuntime({oauth:this.oauth,elicitations:this.elicitations,current:id=>{const connection=current(id);return connection?.mcpPublisher?undefined:connection;},redact:value=>this.vault.redact(value)});
 }
 publisherTarget(id:string){
  const connection=this.options.connections().find(item=>item.id===id);
  if(!this.publisher||!connection?.enabled||connection.kind!=='mcp'||connection.mcpPublisher?.provider!=='netlify')return;
  try{
   this.vault.publisherToken(connection);
   if(!this.vault.publisherVerified(connection))return;
  }catch{return;}
  return{adapterId:PRIVATE_NETLIFY_ADAPTER,siteId:connection.mcpPublisher.siteId,factory:this.publisher.factory(connection)};
 }
 publisherInspection(connection:McpConnection){
  if(!connection.mcpPublisher)return;
  const target=this.publisherTarget(connection.id);
  if(!target)throw Error('PUBLISHER_CREDENTIAL_MISSING');
  return{
   tools:[{
    name:'static_create',
    description:'Private host draft publication. Use propose_external_action with prototypeProject.adapterId netlify_static_draft_v1 and the registered task HTML entry; requires user approval. Direct MCP calls are denied.',
    inputSchema:z.toJSONSchema(staticPhaseArgumentsSchema,{target:'draft-7'})
   }],
   scope:'private_host_publication'
  };
 }
 changed(before:McpConnection|undefined,after:McpConnection|undefined){
  if(before&&(!after||mcpNetworkBinding(before)!==mcpNetworkBinding(after))){void this.publisher?.invalidate(before.id);this.oauth.invalidate(before.id);this.elicitations.cancelConnection(before.id);cancelMcpConnection(before.id);}
  else if(after&&!after.enabled){void this.publisher?.invalidate(after.id);this.vault.invalidateSession(after.id);this.oauth.cancel(after.id);this.elicitations.cancelConnection(after.id);cancelMcpConnection(after.id);}
  if(after&&before&&mcpBinding(before)!==mcpBinding(after)){after.capabilities=[];after.healthStatus='unknown';after.lastCheckedAt=undefined;after.healthSummary=undefined;after.capabilityHash=undefined;}
 }
 async request(request:McpRequest){
  if(request.type==='mcpElicitations')return this.elicitations.list();
  if(request.type==='mcpElicitationOpen')return this.elicitations.open(request.id);
  if(request.type==='mcpElicitationRespond')return this.elicitations.respond(request.id,request.action,request.content);
  const connection=this.options.connections().find(item=>item.id===request.id);
  if(request.type.startsWith('mcpPublisher')){
   if(!connection||connection.kind!=='mcp'||!connection.mcpPublisher)throw Error('PUBLISHER_TARGET_MISSING');
   if(request.type!=='mcpPublisherStatus'&&'siteId'in request&&request.siteId!==connection.mcpPublisher.siteId){
    throw Error('PUBLISHER_TARGET_CHANGED');
   }
   if(request.type==='mcpPublisherVerify'){
    return verifyPrivateNetlifySite(connection,this.vault,()=>this.options.connections().find(item=>item.id===connection.id));
   }
   if(request.type==='mcpPublisherCredential'){
    this.vault.writePublisher(connection,request.token);
    await this.publisher?.invalidate(connection.id);
    return{connectionId:connection.id,status:'credential_saved',siteId:connection.mcpPublisher.siteId,verified:false};
   }
   if(request.type==='mcpPublisherDisconnect'){
    this.vault.clearPublisher(connection);
    await this.publisher?.invalidate(connection.id);
    return{connectionId:connection.id,status:'signed_out'};
   }
   try{
    this.vault.publisherToken(connection);
    return{connectionId:connection.id,status:'credential_saved',siteId:connection.mcpPublisher.siteId,verified:this.vault.publisherVerified(connection)};
   }catch{
    return{connectionId:connection.id,status:'signed_out',siteId:connection.mcpPublisher.siteId,verified:false};
   }
  }
  if(connection?.mcpPublisher)throw Error('PUBLISHER_API_PURPOSE_ONLY');
  if(!connection||connection.kind!=='mcp'||!connection.url)throw new McpSafeError('connection_failed','HTTP MCP 连接不存在');
  switch(request.type){
   case 'mcpAuthStatus':return this.oauth.status(connection);
   case 'mcpAuthLogin':return this.oauth.login(connection);
   case 'mcpAuthCancel':return this.oauth.cancel(connection.id);
   case 'mcpAuthDisconnect':this.elicitations.cancelConnection(connection.id);cancelMcpConnection(connection.id);return this.oauth.disconnect(connection.id);
  }
 }
 redact(value:string){return this.vault.redact(value);}
 close(){void this.publisher?.close();for(const connection of this.options.connections())cancelMcpConnection(connection.id);this.oauth.close();this.elicitations.close();configureMcpRuntime(undefined);}
}
