import assert from 'node:assert/strict';
import {test} from 'node:test';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {officialMcpPreset,mcpRequestSchemas} from '../shared/mcp-connections.js';
import {McpCredentialVault,type McpConnection} from '../main/mcp-credentials.js';
import {McpOAuthBroker} from '../main/mcp-oauth.js';
import {McpElicitationBroker} from '../main/mcp-elicitations.js';
import {readMcpCatalog,pageMcpTools,mcpSingleSubmissionFetch} from '../main/mcp-client.js';
import {auth} from '@modelcontextprotocol/sdk/client/auth.js';
import {mcpCall,ExternalCallError} from '../main/integrations.js';
import type {CredentialCipher,SettingsStore} from '../main/settings.js';
import type {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {fileURLToPath} from 'node:url';
import {McpHost} from '../main/mcp-host.js';
import {connectionSchema} from '../shared/types.js';

const connection=(url='https://example.test/mcp'):McpConnection=>({id:'mcp-test',name:'本机验证',kind:'mcp',command:'',args:[],url,enabled:true,mcpAuth:'oauth'});
function memoryVault(){const data=new Map<string,unknown>();const store:SettingsStore={get:<T>(key:string,fallback:T)=>(data.has(key)?data.get(key):fallback)as T,set:(key,value)=>{data.set(key,value);}};const cipher:CredentialCipher={isEncryptionAvailable:()=>true,encryptString:value=>Buffer.from(value).map(byte=>byte^137),decryptString:value=>Buffer.from(value).map(byte=>byte^137).toString()};return{data,store,cipher,vault:new McpCredentialVault(store,cipher)};}
async function listen(handler:http.RequestListener){const server=http.createServer(handler);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address&&typeof address!=='string');return{base:`http://127.0.0.1:${address.port}`,close:async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}};}
async function until(fn:()=>boolean){for(let i=0;i<200;i++){if(fn())return;await new Promise(resolve=>setTimeout(resolve,10));}assert.fail('fixture deadline exceeded');}

test('官方预设使用真实端点、Supabase 默认只读及明确项目范围',()=>{
 assert.equal(officialMcpPreset('vercel').url,'https://mcp.vercel.com');
 const url=new URL(officialMcpPreset('supabase',{projectRef:'abcdefghijklmnopqrst'}).url);assert.equal(url.origin,'https://mcp.supabase.com');assert.equal(url.searchParams.get('read_only'),'true');assert.equal(url.searchParams.get('project_ref'),'abcdefghijklmnopqrst');assert.equal(url.searchParams.has('skip_elicitations'),false);
 assert.throws(()=>officialMcpPreset('supabase',{projectRef:'not/a/project'}));
 assert.equal(mcpRequestSchemas.at(-1)!.safeParse({type:'mcpElicitationRespond',id:'req',action:'accept',content:{ok:true}}).success,true);
});
test('凭据只存加密字段，地址/项目变化即失效，安全存储失败不落明文',()=>{
 const {data,vault,store}=memoryVault(),item=connection();vault.write(item,{tokens:{access_token:'fixture-only-access',token_type:'Bearer'}});assert.equal(JSON.stringify([...data]).includes('fixture-only-access'),false);assert.equal(vault.read(item)?.tokens?.access_token,'fixture-only-access');assert.equal(vault.read({...item,url:item.url+'?project_ref=newproject'}),undefined);assert.equal(vault.read(item),undefined);
 const blocked=new McpCredentialVault(store,{isEncryptionAvailable:()=>false,encryptString:()=>{throw Error();},decryptString:()=>{throw Error();}});assert.throws(()=>blocked.write(item,{tokens:{access_token:'never-write',token_type:'Bearer'}}),/MCP_CREDENTIAL_UNAVAILABLE/);assert.equal(JSON.stringify([...data]).includes('never-write'),false);
});
test('分页读取第二页的工具，重复 cursor 和超限目录不会被当作完整目录',async()=>{
 const seen:unknown[]=[];const client={listTools:async(args?:{cursor?:string})=>{seen.push(args?.cursor);return args?.cursor?{tools:[{name:'page2',inputSchema:{type:'object' as const}}]}:{tools:[{name:'page1',inputSchema:{type:'object' as const}}],nextCursor:'two'};}};
 const result=await readMcpCatalog(client as Pick<Client,'listTools'>);assert.deepEqual(seen,[undefined,'two']);assert.deepEqual(result.tools.map(item=>item.name),['page1','page2']);assert.equal(result.complete,true);
 await assert.rejects(()=>readMcpCatalog({listTools:async()=>({tools:[],nextCursor:'repeat'})} as Pick<Client,'listTools'>),/分页重复/);
 await assert.rejects(()=>readMcpCatalog({listTools:async()=>({tools:Array.from({length:2001},(_,i)=>({name:`t${i}`,inputSchema:{type:'object'}}))})} as Pick<Client,'listTools'>),/2000/);
});
test('目录总预算限制全部分页，旧连接 schema 与 stdio 仍兼容',async()=>{
 let observedTimeout=0;await assert.rejects(()=>readMcpCatalog({listTools:async(_args,options)=>{observedTimeout=options!.timeout!;await new Promise(resolve=>setTimeout(resolve,20));return{tools:[],nextCursor:'next'};}} as Pick<Client,'listTools'>,{budgetMs:5}),/30 秒/);assert.ok(observedTimeout<=5);
 assert.equal(connectionSchema.safeParse({id:'old',name:'旧连接',kind:'mcp',command:process.execPath,args:[],enabled:true}).success,true);
 const result=await mcpCall({id:'stdio-fixture',name:'stdio 本机验证',kind:'mcp',command:process.execPath,args:[fileURLToPath(new URL('./mcp-stdio-fixture.mjs',import.meta.url))],enabled:true},'local_receipt',{});assert.deepEqual(result.structuredContent,{success:true});
});

test('删除/停用/换项目取消等待确认与旧授权，敏感文本回执统一脱敏',async()=>{
 const memory=memoryVault();let items=[connection()];let item=items[0];memory.vault.write(item,{tokens:{access_token:'fixture-only-host-secret',token_type:'Bearer'}});
 const host=new McpHost({store:memory.store,cipher:memory.cipher,connections:()=>items,openExternal:async()=>{throw Error('must not open browser');}});
 try{assert.equal((await host.request({type:'mcpAuthStatus',id:item.id})).status,'authenticated');assert.equal(host.redact('echo fixture-only-host-secret'),'echo [MCP 凭据已隐藏]');const pending=host.elicitations.request(item,{message:'本机确认',requestedSchema:{type:'object',properties:{}}});const disabled={...item,enabled:false};host.changed(item,disabled);items=[disabled];assert.equal((await pending).action,'cancel');const changed={...disabled,enabled:true,url:item.url+'?project_ref=newproject',capabilities:['old'],healthStatus:'healthy' as const};host.changed(disabled,changed);items=[changed];assert.equal((await host.request({type:'mcpAuthStatus',id:item.id})).status,'signed_out');assert.deepEqual(changed.capabilities,[]);assert.equal(changed.healthStatus,'unknown');host.changed(changed,undefined);items=[];await assert.rejects(()=>host.request({type:'mcpAuthLogin',id:item.id}),/不存在/);}finally{host.close();}
});

test('SDK OAuth fixture 完成 DCR/PKCE/state，状态不泄露凭据，测试不会静默登录',async()=>{
 const memory=memoryVault();let base='',challenge='',opened=0,registration=0,tokenRequests=0;let current=connection();
 const fixture=await listen(async(req,res)=>{
  res.setHeader('Content-Type','application/json');let raw='';for await(const chunk of req)raw+=chunk;
  const route=(req.url??'').split('?')[0];
  if(route.includes('oauth-protected-resource'))return res.end(JSON.stringify({resource:base+'/mcp',authorization_servers:[base]}));
  if(route.includes('oauth-authorization-server')||route.includes('openid-configuration'))return res.end(JSON.stringify({issuer:base,authorization_endpoint:base+'/authorize',token_endpoint:base+'/token',registration_endpoint:base+'/register',response_types_supported:['code'],grant_types_supported:['authorization_code','refresh_token'],code_challenge_methods_supported:['S256'],token_endpoint_auth_methods_supported:['none']}));
  if(route==='/register'){registration++;res.statusCode=201;return res.end(JSON.stringify({...JSON.parse(raw),client_id:'fixture-slash-client'}));}
  if(route==='/token'){tokenRequests++;const body=new URLSearchParams(raw);assert.equal(body.get('code'),'fixture-code');assert.equal(createHash('sha256').update(body.get('code_verifier')!).digest('base64url'),challenge);return res.end(JSON.stringify({access_token:'fixture-only-access-token',refresh_token:'fixture-only-refresh-token',token_type:'Bearer',expires_in:3600}));}
  res.statusCode=401;res.end('{}');
 });base=fixture.base;current=connection(base+'/mcp');
 const broker=new McpOAuthBroker({vault:memory.vault,current:()=>current,allowLocalFixture:true,openExternal:async href=>{
  opened++;const url=new URL(href);challenge=url.searchParams.get('code_challenge')!;assert.equal(url.searchParams.get('code_challenge_method'),'S256');const callback=new URL(url.searchParams.get('redirect_uri')!);callback.searchParams.set('code','fixture-code');callback.searchParams.set('state','invalid');assert.equal((await fetch(callback)).status,400);callback.searchParams.set('state',url.searchParams.get('state')!);assert.equal((await fetch(callback)).status,200);
 }});
 try{
  assert.equal(broker.transportProvider(current),undefined);assert.equal(opened,0);assert.equal(registration,0);
  assert.equal((await broker.login(current)).status,'pending');await until(()=>broker.status(current).status==='authenticated');assert.equal(opened,1);assert.equal(registration,1);assert.equal(tokenRequests,1);assert.equal(JSON.stringify(broker.status(current)).includes('fixture-only'),false);assert.equal(JSON.stringify([...memory.data]).includes('fixture-only-access-token'),false);
  const provider=broker.transportProvider(current);assert.ok(provider);provider.invalidateCredentials?.('tokens');assert.equal(broker.status(current).status,'signed_out','stale successful login must not survive token invalidation');broker.disconnect(current.id);assert.equal(broker.status(current).status,'signed_out');assert.equal(broker.transportProvider(current),undefined);
 }finally{broker.close();await fixture.close();}
});

test('后台刷新复用 SDK refresh grant，不打开浏览器；失效后准确显示需登录',async()=>{
 const memory=memoryVault(),item=connection('https://mcp.fixture.test/mcp');memory.vault.write(item,{redirectUrl:'http://127.0.0.1/callback',client:{client_id:'fixture-client'},tokens:{access_token:'fixture-old-token',refresh_token:'fixture-refresh-token',token_type:'Bearer'}});let browser=0,refresh=0;
 const broker=new McpOAuthBroker({vault:memory.vault,current:()=>item,openExternal:async()=>{browser++;}});
 const provider=broker.transportProvider(item);assert.ok(provider);
 const fetchFn:typeof fetch=async(input,init)=>{const url=String(input);if(url.includes('oauth-protected-resource'))return Response.json({resource:item.url,authorization_servers:['https://auth.fixture.test']});if(url.includes('oauth-authorization-server'))return Response.json({issuer:'https://auth.fixture.test',authorization_endpoint:'https://auth.fixture.test/authorize',token_endpoint:'https://auth.fixture.test/token',response_types_supported:['code'],code_challenge_methods_supported:['S256']});if(url.endsWith('/token')){const body=new URLSearchParams(String(init?.body));assert.equal(body.get('grant_type'),'refresh_token');assert.equal(body.get('refresh_token'),'fixture-refresh-token');refresh++;return Response.json({access_token:'fixture-refreshed-token',refresh_token:'fixture-refresh-token-2',token_type:'Bearer'});}return new Response('',{status:404});};
 assert.equal(await auth(provider,{serverUrl:item.url!,fetchFn}),'AUTHORIZED');assert.equal(refresh,1);assert.equal(browser,0);assert.equal(memory.vault.read(item)?.tokens?.access_token,'fixture-refreshed-token');await provider.invalidateCredentials?.('all');assert.equal(broker.status(item).status,'signed_out');broker.close();
});
test('已创建 provider 的在途刷新在注销/停用后不能复活凭据',async()=>{
 for(const action of ['disconnect','disable'] as const){
  const memory=memoryVault();let current=connection('https://mcp.fixture.test/mcp');memory.vault.write(current,{redirectUrl:'http://127.0.0.1/callback',client:{client_id:'fixture-client'},tokens:{access_token:'fixture-old',refresh_token:'fixture-refresh',token_type:'Bearer'}});let finish:((value:Response)=>void)|undefined;
  const broker=new McpOAuthBroker({vault:memory.vault,current:()=>current,openExternal:async()=>{assert.fail('refresh must not open browser');}}),provider=broker.transportProvider(current);assert.ok(provider);
  const fetchFn:typeof fetch=async input=>{const url=String(input);if(url.includes('oauth-protected-resource'))return Response.json({resource:current.url,authorization_servers:['https://auth.fixture.test']});if(url.includes('oauth-authorization-server'))return Response.json({issuer:'https://auth.fixture.test',authorization_endpoint:'https://auth.fixture.test/authorize',token_endpoint:'https://auth.fixture.test/token',response_types_supported:['code'],code_challenge_methods_supported:['S256']});if(url.endsWith('/token'))return new Promise(resolve=>{finish=resolve;});return new Response('',{status:404});};
  const refresh=auth(provider,{serverUrl:current.url!,fetchFn});const rejected=assert.rejects(refresh,/取消|注销|变更/);await until(()=>!!finish);
  if(action==='disconnect')broker.disconnect(current.id);else{current={...current,enabled:false};broker.cancel(current.id);}
  finish!(Response.json({access_token:'late-refresh-must-not-save',token_type:'Bearer'}));await rejected;
  assert.notEqual(memory.vault.read(current)?.tokens?.access_token,'late-refresh-must-not-save');if(action==='disconnect')assert.equal(memory.vault.read(current),undefined);broker.close();
 }
});

test('登录取消或地址变更后晚到 token 响应不能恢复授权',async()=>{
 const memory=memoryVault();let current=connection('https://mcp.fixture.test/mcp'),callbackUrl:URL|undefined;let finishToken:((value:Response)=>void)|undefined;
 const fetchFn:typeof fetch=async(input,init)=>{const url=String(input);if(url.includes('oauth-protected-resource'))return Response.json({resource:current.url,authorization_servers:['https://auth.fixture.test']});if(url.includes('oauth-authorization-server'))return Response.json({issuer:'https://auth.fixture.test',authorization_endpoint:'https://auth.fixture.test/authorize',registration_endpoint:'https://auth.fixture.test/register',token_endpoint:'https://auth.fixture.test/token',response_types_supported:['code'],code_challenge_methods_supported:['S256']});if(url.endsWith('/register'))return Response.json({...JSON.parse(String(init?.body)),client_id:'fixture-client'});if(url.endsWith('/token'))return new Promise(resolve=>{finishToken=resolve;});return new Response('',{status:404});};
 const broker=new McpOAuthBroker({vault:memory.vault,current:()=>current,fetch:fetchFn,resolve:async()=>[{address:'8.8.8.8',family:4}],openExternal:async href=>{const url=new URL(href);callbackUrl=new URL(url.searchParams.get('redirect_uri')!);callbackUrl.searchParams.set('state',url.searchParams.get('state')!);callbackUrl.searchParams.set('code','fixture-code');await fetch(callbackUrl);}});
 try{await broker.login(current);await until(()=>!!finishToken);const previous=current;current={...current,url:current.url+'?project_ref=changed'};broker.invalidate(current.id);finishToken!(Response.json({access_token:'late-fixture-token',token_type:'Bearer'}));await new Promise(resolve=>setTimeout(resolve,30));assert.equal(broker.status(current).status,'signed_out');assert.equal(memory.vault.read(previous),undefined);assert.equal(memory.vault.read(current),undefined);assert.ok(callbackUrl);await assert.rejects(()=>fetch(callbackUrl!));}finally{broker.close();}
});

test('目录投影有界且游标绑定筛选条件；服务端授权拒绝不重放工具提交',async()=>{
 const tools=Array.from({length:120},(_,index)=>({name:`t${String(index).padStart(3,'0')}`,description:index%2?'write':'read'}));const first=pageMcpTools(tools,'a'.repeat(64),{limit:50});assert.equal(first.tools.length,50);assert.equal(first.totalTools,120);assert.equal(first.hasMore,true);assert.equal(pageMcpTools(tools,'a'.repeat(64),{cursor:first.nextCursor,limit:50}).tools[0].name,'t050');assert.throws(()=>pageMcpTools(tools,'a'.repeat(64),{cursor:first.nextCursor,query:'read'}),/筛选/);
 let requests=0,invalidated='';const fetchFn=mcpSingleSubmissionFetch({invalidateCredentials:scope=>{invalidated=scope;}} as import('@modelcontextprotocol/sdk/client/auth.js').OAuthClientProvider,async()=>{requests++;return new Response('secret remote auth error',{status:401});});
 await assert.rejects(()=>fetchFn('https://fixture.test/mcp',{method:'POST',body:JSON.stringify({method:'tools/call',id:1})}),/结果未知/);assert.equal(requests,1);assert.equal(invalidated,'tokens');const response=await fetchFn('https://fixture.test/mcp',{method:'POST',body:JSON.stringify({method:'tools/list',id:2})});assert.equal(response.status,401);assert.equal(requests,2);
});

test('服务端确认独立等待真实用户；表单约束、URL 开启和连接变化生效',async()=>{
 let current=connection();const opened:string[]=[];const broker=new McpElicitationBroker({current:()=>current,openExternal:async value=>{opened.push(value);}});
 try{
  let resolved=false;const result=broker.request(current,{message:'确认 SQL 费用',requestedSchema:{type:'object',properties:{confirm:{type:'boolean'}},required:['confirm']}}).then(value=>{resolved=true;return value;});await new Promise(resolve=>setTimeout(resolve,10));assert.equal(resolved,false);const id=broker.list()[0].id;
  assert.throws(()=>broker.respond(id,'accept',{confirm:'yes'}),/不符合/);assert.throws(()=>broker.respond(id,'accept',{confirm:true,unexpected:true}),/不符合/);broker.respond(id,'accept',{confirm:true});assert.deepEqual(await result,{action:'accept',content:{confirm:true}});
  const urlResult=broker.request(current,{mode:'url',message:'网页确认',elicitationId:'remote-confirm',url:'https://supabase.com/dashboard/confirm?opaque=fixture'});const view=broker.list()[0];assert.equal(JSON.stringify(view).includes('opaque'),false);assert.throws(()=>broker.respond(view.id,'accept'),/先打开/);await broker.open(view.id);assert.equal(opened.length,1);broker.respond(view.id,'accept');assert.equal((await urlResult).action,'accept');
  assert.equal((await broker.request(current,{message:'请输入密码',requestedSchema:{type:'object',properties:{password:{type:'string'}}}})).action,'decline');
  const changed=broker.request(current,{message:'确认旧项目',requestedSchema:{type:'object',properties:{}}});const changedId=broker.list()[0].id;current={...current,url:current.url+'?project_ref=changed'};assert.throws(()=>broker.respond(changedId,'accept',{}),/连接已变更/);assert.equal((await changed).action,'cancel');
 }finally{broker.close();}
});

test('匿名 HTTP 仍可调用第二页工具；写入后断线保持结果未知并且只发一次',async()=>{
 let writes=0;const fixture=await listen(async(req,res)=>{
  if(req.method!=='POST'){res.writeHead(405);res.end();return;}
  let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);
  if(body.id===undefined){res.writeHead(202);res.end();return;}
  let result:unknown;
  if(body.method==='initialize')result={protocolVersion:body.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'fixture',version:'1'}};
  else if(body.method==='tools/list')result=body.params?.cursor?{tools:[{name:'write2',inputSchema:{type:'object'}}]}:{tools:[{name:'read1',inputSchema:{type:'object'}}],nextCursor:'page2'};
  else if(body.method==='tools/call'){writes++;req.socket.destroy();return;}
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({jsonrpc:'2.0',id:body.id,result}));
 });
 const memory=memoryVault(),item={...connection(fixture.base+'/mcp'),mcpAuth:'none' as const},host=new McpHost({store:memory.store,cipher:memory.cipher,connections:()=>[item],allowLocalFixture:true,openExternal:async()=>{}});
 try{await assert.rejects(()=>mcpCall(item,'write2',{}),(error:unknown)=>error instanceof ExternalCallError&&error.outcome==='outcome_unknown');assert.equal(writes,1);}finally{host.close();await fixture.close();}
});

test('真实 SDK HTTP transport 收到工具 401/403 后不刷新或重放写入',async()=>{
 for(const status of [401,403]){
  let writes=0,otherAuthCalls=0;const fixture=await listen(async(req,res)=>{
   if(req.method!=='POST'){res.writeHead(405);res.end();return;}let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);assert.equal(req.headers.authorization,'Bearer fixture-no-replay-token');
   if(body.id===undefined){res.writeHead(202);res.end();return;}
   let result:unknown;if(body.method==='initialize')result={protocolVersion:body.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'fixture',version:'1'}};else if(body.method==='tools/list')result={tools:[{name:'write_once',inputSchema:{type:'object'}}]};else if(body.method==='tools/call'){writes++;res.writeHead(status,{'www-authenticate':'Bearer error="invalid_token"'});res.end('fixture-private-provider-error');return;}else{otherAuthCalls++;res.writeHead(404);res.end();return;}res.setHeader('Content-Type','application/json');res.end(JSON.stringify({jsonrpc:'2.0',id:body.id,result}));
  });const memory=memoryVault(),item=connection(fixture.base+'/mcp');memory.vault.write(item,{client:{client_id:'fixture-client'},redirectUrl:'http://127.0.0.1/callback',tokens:{access_token:'fixture-no-replay-token',refresh_token:'fixture-no-replay-refresh',token_type:'Bearer'}});const host=new McpHost({store:memory.store,cipher:memory.cipher,connections:()=>[item],allowLocalFixture:true,openExternal:async()=>{assert.fail('must not open browser');}});
  try{await assert.rejects(()=>mcpCall(item,'write_once',{}),(error:unknown)=>error instanceof ExternalCallError&&error.outcome==='outcome_unknown'&&!error.message.includes('fixture-private'));assert.equal(writes,1);assert.equal(otherAuthCalls,0);if(status===401)assert.equal((await host.request({type:'mcpAuthStatus',id:item.id})).status,'signed_out');}finally{host.close();await fixture.close();}
 }
});
