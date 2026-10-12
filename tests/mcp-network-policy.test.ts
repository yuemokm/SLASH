import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import {readFile} from 'node:fs/promises';
import {auth} from '@modelcontextprotocol/sdk/client/auth.js';
import {networkAddressScope,resolveAuthorizedTarget,createAuthorizedOAuthFetch,type NetworkPolicyOptions} from '../main/network-target-policy.js';
import {McpOAuthBroker,mcpNetworkGrant} from '../main/mcp-oauth.js';
import {McpCredentialVault,type McpConnection} from '../main/mcp-credentials.js';
import {mcpNetworkOriginSchema} from '../shared/mcp-connections.js';
import {connectionSchema} from '../shared/types.js';

const publicResolve=async()=>[{address:'8.8.8.8',family:4 as const}];
const base:NetworkPolicyOptions={connectionId:'one',binding:'binding',resolve:publicResolve};
function item(url='https://mcp.example.test/mcp'):McpConnection{return{id:'one',name:'fixture',kind:'mcp',command:'',args:[],enabled:true,mcpAuth:'oauth',url};}
function vault(){const values=new Map<string,unknown>();return new McpCredentialVault({get:<T>(key:string,fallback:T)=>(values.get(key)??fallback) as T,set:(key,value)=>{values.set(key,value);}},{isEncryptionAvailable:()=>true,encryptString:value=>Buffer.from(value),decryptString:value=>value.toString()});}
async function fixture(handler:http.RequestListener){const server=http.createServer(handler);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const port=(server.address() as import('node:net').AddressInfo).port;return{server,origin:`http://fixture.test:${port}`,close:async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}};}
const localResolve=async()=>[{address:'127.0.0.1',family:4 as const}];

test('IPv4, IPv6 and mapped addresses share private/forbidden classifications',async()=>{
 for(const address of ['10.0.0.1','172.31.1.2','192.168.2.3','fd00::1','fc00::1','::ffff:192.168.2.3','::ffff:c0a8:203'])assert.equal(networkAddressScope(address),'private',address);
 for(const address of ['127.0.0.1','0.0.0.0','169.254.169.254','100.64.0.1','192.0.2.1','198.18.0.1','198.51.100.1','203.0.113.1','255.255.255.255','::1','::','fe80::1','fec0::1','ff02::1','2001:db8::1','2002:a00:1::1','::ffff:7f00:1','::ffff:169.254.169.254'])assert.equal(networkAddressScope(address),'forbidden',address);
 for(const address of ['8.8.8.8','2606:4700:4700::1111','::ffff:8.8.8.8'])assert.equal(networkAddressScope(address),'public',address);
 for(const url of ['https://2130706433/token','https://0x7f000001/token','https://127.1/token','https://[::ffff:7f00:1]/token','https://user:pass@example.test','http://example.test'])await assert.rejects(resolveAuthorizedTarget(url,base),/不安全|未授权/);
});

test('all DNS answers must be authorized; grants bind exact connection/origin and never allow loopback',async()=>{
 await assert.rejects(resolveAuthorizedTarget('https://public.test',{...base,resolve:async()=>[{address:'8.8.8.8',family:4},{address:'10.0.0.1',family:4}]}),/未授权/);
 const grant={connectionId:'one',binding:'binding',allowedOrigins:['https://auth.company.test:8443'],allowPrivate:true,revision:'1'};
 assert.equal((await resolveAuthorizedTarget('https://auth.company.test:8443/token',{...base,grant,resolve:async()=>[{address:'10.0.0.1',family:4}]})).address.address,'10.0.0.1');
 for(const url of ['https://auth.company.test/token','https://other.company.test:8443/token','https://127.0.0.1/token'])await assert.rejects(resolveAuthorizedTarget(url,{...base,grant,resolve:async()=>[{address:'10.0.0.1',family:4}]}),/未授权/);
 await assert.rejects(resolveAuthorizedTarget('https://auth.company.test:8443/token',{...base,grant:{...grant,connectionId:'other'},resolve:localResolve}),/未授权/);
 assert.deepEqual(mcpNetworkGrant(item('https://192.168.1.4:8443/mcp')).allowedOrigins,['https://192.168.1.4:8443']);
 assert.deepEqual(mcpNetworkGrant(item('https://public.test/mcp')).allowedOrigins,[]);
 assert.equal(mcpNetworkOriginSchema.safeParse('https://company.test/a').success,false);
 assert.equal(mcpNetworkOriginSchema.safeParse('https://company.test?secret=yes').success,false);
 assert.equal(connectionSchema.parse({...item(),mcpNetworkAllowedOrigins:['https://auth.company.test/']}).mcpNetworkAllowedOrigins?.[0],'https://auth.company.test');
});

test('real undici uses the verified DNS address once, preserves native Request/body/headers, rejects redirects',async()=>{
 let lookups=0,hits=0;
 const local=await fixture(async(req,res)=>{hits++;assert.equal(req.headers.host,new URL(local.origin).host);let body='';for await(const chunk of req)body+=chunk;
  if(req.url==='/redirect'){res.writeHead(302,{Location:'https://127.0.0.1/token'});res.end();return;}
  assert.equal(req.headers['x-fixture'],'kept');res.end(body||'ok');
 });
 const request=createAuthorizedOAuthFetch({...base,fixtureOrigin:local.origin,resolve:async()=>{lookups++;return localResolve();}});
 try{
  const response=await request(new Request(local.origin+'/body',{method:'POST',headers:{'x-fixture':'kept'},body:'fixture-body'}));assert.equal(await response.text(),'fixture-body');assert.equal(lookups,1);assert.equal(hits,1);
  await assert.rejects(request(local.origin+'/redirect'),/重定向/);assert.equal(hits,2);
  // The next call must check DNS again; the accepted first address cannot authorize a later private answer.
  let sequence=0,dispatched=0;const rebound=createAuthorizedOAuthFetch({...base,resolve:async()=>[{address:sequence++?'10.0.0.2':'8.8.8.8',family:4}],fetch:async()=>{dispatched++;return new Response('ok');}});
  assert.equal(await(await rebound('https://public.test')).text(),'ok');await assert.rejects(rebound('https://public.test'),/未授权/);assert.equal(dispatched,1);
 }finally{await local.close();}
});

test('DNS cancellation, response-time revocation and SSE cancellation release real requests',async()=>{
 const dnsAbort=new AbortController();let started!:()=>void;const ready=new Promise<void>(resolve=>{started=resolve;});
 const waiting=resolveAuthorizedTarget('https://public.test',{...base,signal:dnsAbort.signal,resolve:async()=>{started();return new Promise(()=>{});}});const cancelled=assert.rejects(waiting,/取消/);await ready;dnsAbort.abort();await cancelled;
 let revoked=false,release!:()=>void;const slow=createAuthorizedOAuthFetch({...base,assertCurrent:()=>{if(revoked)throw Error('grant-revoked');},fetch:async()=>{await new Promise<void>(resolve=>{release=resolve;});return new Response('late');}});
 const late=slow('https://public.test');const lateRejected=assert.rejects(late,/grant-revoked/);while(!release)await new Promise(resolve=>setImmediate(resolve));revoked=true;release();await lateRejected;
 let socketClosed!:()=>void;const closed=new Promise<void>(resolve=>{socketClosed=resolve;});
 const local=await fixture((req,res)=>{req.socket.once('close',socketClosed);res.writeHead(200,{'Content-Type':'text/event-stream'});res.write('data: ready\n\n');});
 const controller=new AbortController();try{
  const response=await createAuthorizedOAuthFetch({...base,signal:controller.signal,fixtureOrigin:local.origin,resolve:localResolve})(local.origin+'/sse');const reader=response.body!.getReader();assert.match(new TextDecoder().decode((await reader.read()).value),/ready/);
  const next=reader.read();const aborted=assert.rejects(next,/abort|cancel/i);controller.abort();await aborted;await closed;
 }finally{await local.close();}
});

test('SDK refresh uses broker destination policy; malicious metadata is never fetched and grants revoke old providers',async()=>{
 for(const forbidden of ['https://127.0.0.1','https://[::1]','https://192.168.1.1','https://[::ffff:169.254.169.254]']){
  let current=item(),dispatched:string[]=[];const storage=vault();storage.write(current,{client:{client_id:'fixture'},tokens:{access_token:'old',refresh_token:'refresh',token_type:'Bearer'}});
  const broker=new McpOAuthBroker({vault:storage,current:()=>current,resolve:publicResolve,openExternal:async()=>{assert.fail('refresh opened browser');},fetch:async input=>{const url=String(input);dispatched.push(url);if(url.includes('oauth-protected-resource'))return Response.json({resource:current.url,authorization_servers:[forbidden]});return new Response('',{status:404});}});
  try{await assert.rejects(auth(broker.transportProvider(current)!,{serverUrl:current.url!,fetchFn:broker.transportFetch(current)}));assert.ok(dispatched.every(url=>new URL(url).origin===new URL(current.url!).origin));}finally{broker.close();}
 }
 let current=item(),refreshes=0;current.mcpNetworkAllowedOrigins=['https://auth.company.test'];const storage=vault();storage.write(current,{client:{client_id:'fixture'},tokens:{access_token:'old',refresh_token:'refresh',token_type:'Bearer'}});
 const broker=new McpOAuthBroker({vault:storage,current:()=>current,resolve:async host=>[{address:host==='auth.company.test'?'10.0.0.5':'8.8.8.8',family:4}],openExternal:async()=>{assert.fail('refresh opened browser');},fetch:async(input,init)=>{const url=String(input);if(url.includes('oauth-protected-resource'))return Response.json({resource:current.url,authorization_servers:['https://auth.company.test']});if(url.includes('oauth-authorization-server'))return Response.json({issuer:'https://auth.company.test',authorization_endpoint:'https://auth.company.test/authorize',token_endpoint:'https://auth.company.test/token',response_types_supported:['code'],code_challenge_methods_supported:['S256']});if(url.endsWith('/token')){assert.equal(new URLSearchParams(String(init?.body)).get('grant_type'),'refresh_token');refreshes++;return Response.json({access_token:'refreshed',token_type:'Bearer'});}return new Response('',{status:404});}});
 try{const provider=broker.transportProvider(current)!,request=broker.transportFetch(current);assert.equal(await auth(provider,{serverUrl:current.url!,fetchFn:request}),'AUTHORIZED');assert.equal(refreshes,1);current={...current,mcpNetworkAllowedOrigins:[]};await assert.rejects(request('https://auth.company.test/token'),/权限已变更/);await assert.rejects(Promise.resolve().then(()=>provider.tokens()),/取消|变更/);}finally{broker.close();}
});

test('interactive SDK discovery, registration, authorization and token endpoints cannot expand permissions',async()=>{
 for(const stage of ['discovery','registration','authorization','token'] as const){
  const current=item(),storage=vault(),sent:string[]=[];let browsers=0;
  const forbidden='https://[::ffff:192.168.1.9]';
  const broker=new McpOAuthBroker({vault:storage,current:()=>current,resolve:publicResolve,openExternal:async href=>{browsers++;const authorization=new URL(href),callback=new URL(authorization.searchParams.get('redirect_uri')!);callback.searchParams.set('state',authorization.searchParams.get('state')!);callback.searchParams.set('code','fixture-code');await fetch(callback);},fetch:async(input,init)=>{
   const url=String(input);sent.push(url);
   if(url.includes('oauth-protected-resource'))return Response.json({resource:current.url,authorization_servers:[stage==='discovery'?forbidden:'https://auth.public.test']});
   if(url.includes('oauth-authorization-server'))return Response.json({issuer:'https://auth.public.test',authorization_endpoint:(stage==='authorization'?forbidden:'https://auth.public.test')+'/authorize',registration_endpoint:(stage==='registration'?forbidden:'https://auth.public.test')+'/register',token_endpoint:(stage==='token'?forbidden:'https://auth.public.test')+'/token',response_types_supported:['code'],code_challenge_methods_supported:['S256']});
   if(url.endsWith('/register'))return Response.json({...JSON.parse(String(init?.body)),client_id:'fixture'});
   return new Response('',{status:404});
  }});
  try{await broker.login(current);for(let i=0;i<100&&broker.status(current).status==='pending';i++)await new Promise(resolve=>setTimeout(resolve,10));assert.equal(broker.status(current).status,'error',stage);assert.ok(sent.every(url=>new URL(url).hostname!=='[::ffff:c0a8:109]'),stage);assert.equal(browsers,stage==='token'?1:0);assert.equal(storage.read(current)?.tokens,undefined);}finally{broker.close();}
 }
});

test('real protocol metadata fixture cannot send an internal request',async()=>{
 let blockedHits=0,baseUrl='';const server=http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');if(req.url?.includes('oauth-protected-resource'))res.end(JSON.stringify({resource:baseUrl+'/mcp',authorization_servers:['https://127.0.0.1:1']}));else{blockedHits++;res.end('{}');}});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));baseUrl=`http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
 const current=item(baseUrl+'/mcp'),storage=vault(),broker=new McpOAuthBroker({vault:storage,current:()=>current,allowLocalFixture:true,openExternal:async()=>assert.fail('unsafe authorization opened browser')});
 try{await broker.login(current);for(let i=0;i<100&&broker.status(current).status==='pending';i++)await new Promise(resolve=>setTimeout(resolve,10));assert.equal(broker.status(current).status,'error');assert.equal(blockedHits,0);
 }finally{broker.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('real HTTPS fixture rejects an untrusted certificate without sending an HTTP body',async()=>{
 let requests=0;const [key,cert]=await Promise.all([readFile(new URL('./fixtures/mcp-network-policy.key',import.meta.url)),readFile(new URL('./fixtures/mcp-network-policy.crt',import.meta.url))]);
 const server=https.createServer({key,cert},(_req,res)=>{requests++;res.end('must-not-be-read');});await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`https://fixture.test:${(server.address() as import('node:net').AddressInfo).port}`;
 try{await assert.rejects(createAuthorizedOAuthFetch({...base,fixtureOrigin:origin,resolve:localResolve})(origin+'/token',{method:'POST',body:'fixture-token'}),(error:unknown)=>error instanceof Error&&/SELF_SIGNED|self.signed|certificate/i.test(String((error as Error&{cause?:Error}).cause)));assert.equal(requests,0);}finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
