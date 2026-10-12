import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';

// Run only after the build owner builds dist. No build, real browser, cloud,
// provider login or remote project is started here. The fixture serves real
// OAuth/DCR/PKCE/MCP messages on loopback. A process-local fetch adapter maps
// its HTTPS-looking address to HTTP; TLS and real provider approval are untested.
const root=process.cwd(),output=path.join(root,'.test-data',`mcp-ui-${Date.now()}`),profile=path.join(output,'profile');
await fs.mkdir(profile,{recursive:true});
const report={status:'running',output,cloudExecuted:false,realOAuthExecuted:false,built:false,cases:[],hashes:{},pageErrors:[],counts:{registration:0,codeExchange:0,refresh:0,toolCalls:0,listPages:0},limitations:['Loopback protocol fixture uses a process-local HTTPS-to-HTTP fetch adapter. Real TLS/provider OAuth/Vercel client approval and actual Supabase/Vercel projects remain unverified.']};
let app,page,base,access='fixture-access-initial',refreshNeeded=false,heldTool;
const challenges=new Map();
const server=createServer(async(req,res)=>{
 try{
  let raw='';for await(const chunk of req)raw+=chunk;
  const url=new URL(req.url??'/',base),route=url.pathname;res.setHeader('Content-Type','application/json');
  if(route.includes('oauth-protected-resource'))return res.end(JSON.stringify({resource:base+'/mcp',authorization_servers:[base]}));
  if(route.includes('oauth-authorization-server')||route.includes('openid-configuration'))return res.end(JSON.stringify({issuer:base,authorization_endpoint:base+'/authorize',token_endpoint:base+'/token',registration_endpoint:base+'/register',response_types_supported:['code'],grant_types_supported:['authorization_code','refresh_token'],code_challenge_methods_supported:['S256'],token_endpoint_auth_methods_supported:['none']}));
  if(route==='/register'){report.counts.registration++;const metadata=JSON.parse(raw);assert.equal(metadata.client_name,'Slash');assert.equal(metadata.token_endpoint_auth_method,'none');return res.end(JSON.stringify({...metadata,client_id:'fixture-slash-client'}));}
  if(route==='/authorize'){
   assert.equal(url.searchParams.get('code_challenge_method'),'S256');const code=`fixture-code-${challenges.size}`;challenges.set(code,url.searchParams.get('code_challenge'));const callback=new URL(url.searchParams.get('redirect_uri'));callback.searchParams.set('state',url.searchParams.get('state'));callback.searchParams.set('code',code);res.writeHead(302,{location:callback.href});res.end();return;
  }
  if(route==='/token'){
   const form=new URLSearchParams(raw);assert.equal(form.get('client_id'),'fixture-slash-client');
   if(form.get('grant_type')==='refresh_token'){report.counts.refresh++;assert.equal(form.get('refresh_token'),'fixture-refresh');access='fixture-access-refreshed';}
   else{report.counts.codeExchange++;assert.equal(form.get('grant_type'),'authorization_code');assert.equal(createHash('sha256').update(form.get('code_verifier')).digest('base64url'),challenges.get(form.get('code')));access='fixture-access-initial';}
   return res.end(JSON.stringify({access_token:access,refresh_token:'fixture-refresh',token_type:'Bearer',expires_in:3600}));
  }
  if(route!=='/mcp'){res.writeHead(404);res.end('{}');return;}
  if(req.method!=='POST'){res.writeHead(405);res.end('{}');return;}
  const body=JSON.parse(raw);
  if(!body.method&&body.id==='fixture-elicitation'){
   assert.ok(heldTool);const held=heldTool;heldTool=undefined;const accepted=body.result?.action==='accept';held.res.write('data: '+JSON.stringify({jsonrpc:'2.0',id:held.id,result:{content:[{type:'text',text:'local confirmation received'}],structuredContent:{success:accepted}}})+'\n\n');held.res.end();res.writeHead(202);res.end();return;
  }
  if(req.headers.authorization!==`Bearer ${access}`||(refreshNeeded&&body.method==='initialize')){refreshNeeded=false;res.writeHead(401,{'www-authenticate':`Bearer resource_metadata="${base}/.well-known/oauth-protected-resource/mcp"`});res.end('{}');return;}
  if(body.id===undefined){res.writeHead(202);res.end();return;}
  let result;
  if(body.method==='initialize')result={protocolVersion:body.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'local-mcp-fixture',version:'1'}};
  else if(body.method==='tools/list'){
   report.counts.listPages++;const offset=body.params?.cursor==='page-two'?70:0;result={tools:Array.from({length:offset?50:70},(_,i)=>({name:`tool_${String(offset+i).padStart(3,'0')}`,description:`本机工具 ${offset+i}`,inputSchema:{type:'object',properties:{},additionalProperties:false}})),...(offset?{}:{nextCursor:'page-two'})};
  }else if(body.method==='tools/call'){
   report.counts.toolCalls++;assert.equal(body.params.name,'tool_119');heldTool={res,id:body.id};res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache'});res.write('data: '+JSON.stringify({jsonrpc:'2.0',id:'fixture-elicitation',method:'elicitation/create',params:{mode:'form',message:'本机模拟服务要求确认本次操作；没有真实 SQL 或费用。',requestedSchema:{type:'object',properties:{confirm:{type:'boolean',title:'我已核对本次模拟操作'}},required:['confirm']}}})+'\n\n');return;
  }else throw Error('Unexpected local protocol method');
  res.end(JSON.stringify({jsonrpc:'2.0',id:body.id,result}));
 }catch(error){report.serverFailure=error.message;res.writeHead(500);res.end('LOCAL_MCP_FIXTURE_FAILED');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`https://127.0.0.1:${server.address().port}`;
const wait=async(fn,timeout=15000)=>{const end=Date.now()+timeout;while(Date.now()<end){if(await fn())return;await new Promise(resolve=>setTimeout(resolve,30));}throw Error('LOCAL_MCP_UI_TIMEOUT');};
const call=async request=>{const response=await page.evaluate(value=>window.pm.request(value),request);assert.ok(response.ok,response.error);return response.data;};
const record=(name,data={})=>{report.cases.push({name,status:'passed',...data});console.log('PASS '+name);};
const files=['main/mcp-oauth.ts','main/mcp-client.ts','main/mcp-host.ts','main/mcp-elicitations.ts','main/main.ts','src/ConnectionsPanel.tsx','src/McpConnectionControls.tsx','src/McpElicitationPanel.tsx','shared/types.ts','shared/mcp-connections.ts','dist/main/mcp-oauth.js','dist/main/mcp-client.js','dist/main/main.js'];
const sha=async file=>createHash('sha256').update(await fs.readFile(path.join(root,file))).digest('hex');
try{
 const html=await fs.readFile(path.join(root,'dist/renderer/index.html'),'utf8'),asset=html.match(/src="\.\/([^\"]+\.js)"/)?.[1];assert.ok(asset);files.push('dist/renderer/'+asset);for(const file of files)report.hashes[file]=await sha(file);
 app=await electron.launch({cwd:root,args:['.'],env:{...process.env,PM_SLASH_DATA_DIR:profile,PM_SLASH_TEST_HIDDEN:'1',PM_SLASH_DEV_SERVER_URL:''}});page=await app.firstWindow();page.setDefaultTimeout(15000);page.on('pageerror',error=>report.pageErrors.push(error.message));await page.locator('.brand').waitFor();assert.ok(page.url().startsWith('file:'));
 assert.equal(path.resolve(await app.evaluate(({app})=>app.getPath('userData'))).toLowerCase(),profile.toLowerCase());
 await app.evaluate(({shell},base)=>{
  const original=globalThis.fetch.bind(globalThis),origin=new URL(base).origin;
  globalThis.__mcpFixture={mode:'hold',opened:0,blocked:0};
  globalThis.fetch=async(input,init)=>{const url=new URL(input instanceof Request?input.url:String(input));if(url.origin===origin){url.protocol='http:';return original(url,init);}if(url.protocol==='http:'&&url.hostname==='127.0.0.1')return original(input,init);globalThis.__mcpFixture.blocked++;throw Error('LOCAL_FIXTURE_NETWORK_DENIED');};
  shell.openExternal=async href=>{const url=new URL(href);if(url.origin!==origin)throw Error('LOCAL_FIXTURE_BROWSER_DENIED');globalThis.__mcpFixture.opened++;if(globalThis.__mcpFixture.mode==='complete'){url.protocol='http:';await original(url,{redirect:'follow'});}return;};
 },base);
 await page.getByRole('button',{name:'设置',exact:true}).click();const settings=page.getByRole('dialog',{name:'设置',exact:true});await settings.getByRole('navigation',{name:'设置分类'}).getByRole('button',{name:'连接',exact:true}).click();
 await settings.getByRole('button',{name:'添加连接',exact:true}).click();let form=page.getByRole('dialog',{name:'添加连接',exact:true});await form.getByLabel('服务预设').selectOption('vercel');assert.match(await form.innerText(),/尚未取得审核回执/);assert.equal(await form.getByLabel('服务地址',{exact:true}).inputValue(),'https://mcp.vercel.com');await form.getByLabel('服务预设').selectOption('supabase');await form.getByLabel('限定 Supabase 项目（建议填写）').fill('abcdefghijklmnopqrst');assert.equal(await form.getByLabel('仅允许读取').isChecked(),true);const presetUrl=new URL(await form.getByLabel('服务地址',{exact:true}).inputValue());assert.equal(presetUrl.searchParams.get('project_ref'),'abcdefghijklmnopqrst');assert.equal(presetUrl.searchParams.get('read_only'),'true');await page.screenshot({path:path.join(output,'official-presets.png')});await form.getByRole('button',{name:'取消',exact:true}).click();record('official-presets-scope-and-vercel-review-notice');
 await settings.getByRole('button',{name:'添加连接',exact:true}).click();form=page.getByRole('dialog',{name:'添加连接',exact:true});await form.getByLabel('名称',{exact:true}).fill('本机 MCP 协议验证');await form.getByLabel('连接方式').selectOption('http');await form.getByLabel('服务地址',{exact:true}).fill(base+'/mcp');await form.getByLabel('登录方式').selectOption('oauth');await form.getByRole('button',{name:'保存连接',exact:true}).click();
 const row=settings.locator('.connection-line').filter({hasText:'本机 MCP 协议验证'});await row.waitFor();const saved=(await call({type:'state'})).connections.find(item=>item.name==='本机 MCP 协议验证');assert.ok(saved);assert.equal(saved.mcpAuth,'oauth');
 await row.getByRole('button',{name:'测试',exact:true}).click();await wait(async()=>!await row.getByRole('button',{name:'测试',exact:true}).isDisabled());assert.equal(await app.evaluate(()=>globalThis.__mcpFixture.opened),0);assert.equal(report.counts.registration,0);record('anonymous-test-does-not-start-oauth');
 await row.getByRole('button',{name:'网页登录',exact:true}).click();await wait(async()=>(await app.evaluate(()=>globalThis.__mcpFixture.opened))===1);await row.getByRole('button',{name:'取消登录',exact:true}).click();await wait(async()=>(await call({type:'mcpAuthStatus',id:saved.id})).status==='signed_out');assert.equal(report.counts.codeExchange,0);await page.screenshot({path:path.join(output,'login-cancelled.png')});record('explicit-login-and-cancel');
 await app.evaluate(()=>{globalThis.__mcpFixture.mode='complete';});await row.getByRole('button',{name:'网页登录',exact:true}).click();await wait(async()=>(await call({type:'mcpAuthStatus',id:saved.id})).status==='authenticated');assert.equal(report.counts.codeExchange,1);record('sdk-dcr-pkce-browser-callback');
 refreshNeeded=true;await row.getByRole('button',{name:'测试',exact:true}).click();await wait(async()=>!await row.getByRole('button',{name:'测试',exact:true}).isDisabled());const after=(await call({type:'state'})).connections.find(item=>item.id===saved.id);assert.equal(after.healthStatus,'healthy');assert.equal(after.capabilities.length,120);assert.equal(report.counts.refresh,1);assert.equal(await app.evaluate(()=>globalThis.__mcpFixture.opened),2);const result=JSON.parse(await row.locator('.connection-result').innerText());assert.equal(result.tools.length,25);assert.equal(result.totalTools,120);assert.equal(result.hasMore,true);await page.screenshot({path:path.join(output,'authorized-catalog.png')});record('sdk-refresh-and-bounded-complete-paginated-catalog');
 const pending=await call({type:'mcpCall',connectionId:saved.id,tool:'tool_119',args:{}});assert.equal(pending.status,'pending');const proposalId=pending.receipt?.proposalId;assert.equal(typeof proposalId,'string');assert.equal(proposalId,pending.operationId);const approval=page.evaluate(async id=>window.pm.request({type:'externalAction',id,decision:'approve'}),proposalId);const prompt=page.getByRole('dialog',{name:'服务商要求确认',exact:true});await prompt.waitFor();assert.equal(report.counts.toolCalls,1);await page.screenshot({path:path.join(output,'server-elicitation.png')});await prompt.getByLabel('我已核对本次模拟操作').check();await prompt.getByRole('button',{name:'确认本次操作',exact:true}).click();const completed=await approval;assert.ok(completed.ok,completed.error);assert.equal(completed.data.status,'succeeded');assert.equal(report.counts.toolCalls,1);record('server-confirmation-requires-user-action-on-page-two-tool');
 await row.getByRole('button',{name:'注销本机登录',exact:true}).click();await wait(async()=>(await call({type:'mcpAuthStatus',id:saved.id})).status==='signed_out');record('disconnect-clears-local-login');
 const finalState=JSON.stringify(await call({type:'state'}));assert.doesNotMatch(finalState,/fixture-access-|fixture-refresh|fixture-code-/);assert.deepEqual(report.pageErrors,[]);assert.equal(report.serverFailure,undefined);assert.equal(await app.evaluate(()=>globalThis.__mcpFixture.blocked),0);report.status='passed';
}catch(error){report.status='failed';report.error=error.stack??String(error);process.exitCode=1;if(page)await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});}
finally{
 heldTool?.res.end();if(app){await app.close();report.spawnedAppClosed=true;}server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
 for(const file of files)if(report.hashes[file])assert.equal(await sha(file),report.hashes[file],`Source/dist changed during fixture: ${file}`);
 report.sourceAndDistUnchanged=true;await fs.writeFile(path.join(output,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,output,cases:report.cases.length,counts:report.counts,error:report.error}));
}
