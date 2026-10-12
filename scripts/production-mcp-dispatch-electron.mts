// Run only after the unified build. Synthetic task content; actual built main IPC and local MCP.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {_electron as electron} from 'playwright';
import {Store} from '../main/store.ts';
import {Service} from '../main/service.ts';

assert.ok(process.argv.includes('--execute'),'Use --execute only after the unified check/test/build window.');
const repo=process.cwd(),output=path.join(repo,'.test-data','production-mcp-dispatch-electron-'+randomUUID()),profile=path.join(output,'profile');
await fs.mkdir(output,{recursive:true});
const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const modes=['current','asset','permission','connection','lost'] as const;
const content='# 项目交付说明\n\n整理已有资料后查看成果，逐项核对实际要求和内容。修改时先查看差异，再保存到项目目录。\n\n保留原始资料和版本，后续任务可继续查看。\n';
const evidence:any={schemaVersion:1,status:'failed',output,startedAt:new Date().toISOString(),realElectronIPC:true,realLocalMcpTransport:true,realModelGeneration:false,realUserAcceptance:false,cloudExecuted:false,reviewer:'Agent verifying explicit synthetic task requirements and exact file bytes',scenarios:[],pageErrors:[],runtimeFiles:[]};
await fs.writeFile(path.join(output,'attempt.json'),JSON.stringify({...evidence,status:'preflight',appLaunched:false},null,2));
for(const relative of ['main/main.ts','main/integrations.ts','main/service.ts','main/mcp-client.ts','dist/main/main.js','dist/main/integrations.js','dist/main/service.js','dist/main/mcp-client.js','tests/mcp-dispatch-guard-fixture.mjs']){
 const bytes=await fs.readFile(path.join(repo,relative));evidence.runtimeFiles.push({path:relative,sha256:sha(bytes)});
}
assert.match(await fs.readFile(path.join(repo,'dist/main/integrations.js'),'utf8'),/beforeDispatch/,'Built integration must include the dispatch guard.');
assert.match(await fs.readFile(path.join(repo,'dist/main/main.js'),'utf8'),/taskDelivery\.assertCurrent/,'Built main must pass the persisted task delivery guard.');
console.log(JSON.stringify({status:'preparing_synthetic_runs',output,realModelGeneration:false}));
const store=new Store(profile);let activeMode:string='',syntheticCalls=0;
const service=new Service(store,()=> 'offline-fixture-only',()=>{},async options=>({messages:[{role:'assistant',stopReason:'stop'}],abort:async()=>{},dispose:()=>{},prompt:async()=>{
 syntheticCalls++;const mount=service.state.mounts.find(item=>item.name==='成果')!,change=await options.files.draft(mount.id,activeMode+'.md',content,options.runId);options.draft(change);options.delta('已保存项目交付说明。');
}} as never),{fetchModelMetadata:async()=>{throw Error('OFFLINE_SYNTHETIC_MCP_SEED');}});
const seeds:any[]=[];
try{
 await service.workspace(path.join(output,'project'));
 for(const capability of ['workspace_read','artifact_write','external_action'] as const)service.setPermission(capability,'allow');
 for(const mode of modes){const directory=path.join(output,mode);await fs.mkdir(directory,{recursive:true});service.state.connections.push({id:'dispatch-'+mode,name:'隔离派发 '+mode,kind:'mcp',command:process.execPath,args:[path.join(repo,'tests/mcp-dispatch-guard-fixture.mjs'),directory,mode],enabled:true});}
 service.save();
 for(const mode of modes){
  activeMode=mode;const conversationId=service.conversation(undefined,'真实派发边界 '+mode),runId=await service.send(conversationId,'写项目交付说明：先整理资料、核对内容和修改差异；保留原始资料与版本。');
  const deadline=Date.now()+20000;while(Date.now()<deadline&&(!service.state.runs.find(run=>run.id===runId)?.finishedAt||service.active.has(runId)||service.starting.has(runId)))await pause(20);
  assert.equal(service.state.runs.find(run=>run.id===runId)?.status,'succeeded');const change=service.state.changes.find(item=>item.runId===runId)!;assert.ok(change);if(change.status==='pending')await service.apply(change.id);
  assert.equal(change.status,'applied');const mount=service.state.mounts.find(item=>item.id===change.mountId)!;assert.equal(sha(await fs.readFile(path.join(mount.path,change.path))),sha(content));
  const proposal=await service.createExternalActionProposal(runId,conversationId,{kind:'mcp_call',connectionId:'dispatch-'+mode,target:'本机隔离 MCP 说明页',userAuthorizationExcerpt:'隔离验证明确允许发布本说明；无远端账号或真实云发布',tool:'publish.fixture',args:{content},artifactBinding:{mountId:change.mountId,path:change.path,argumentPath:['content']}});
  seeds.push({mode,runId,conversationId,proposalId:proposal.id,changeId:change.id,mountId:change.mountId,path:change.path,file:path.join(mount.path,change.path),sourceHash:sha(content),directory:path.join(output,mode)});
 }
 assert.equal(syntheticCalls,modes.length);evidence.seedRuns=seeds;evidence.syntheticRuntimeInvocations=syntheticCalls;
}catch(error){evidence.error=String(error);await fs.writeFile(path.join(output,'seed-failure.json'),JSON.stringify(evidence,null,2));throw error;}finally{service.dispose();await Promise.allSettled([...(service as any).agentIndex.queues.values()]);store.close();}
await fs.writeFile(path.join(output,'seed.json'),JSON.stringify(evidence,null,2));
let app:any,page:any;
const request=async(input:any)=>page.evaluate(value=>(window as any).pm.request(value),input);
const call=async(input:any)=>{const result=await request(input);assert.ok(result.ok,result.error);return result.data;};
const calls=async(seed:any)=>(await fs.readFile(path.join(seed.directory,'server-calls.jsonl'),'utf8').catch(()=> '')).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
const catalogReady=async(seed:any)=>{const deadline=Date.now()+10000;while(Date.now()<deadline){if(await fs.access(path.join(seed.directory,'catalog-ready')).then(()=>true,()=>false))return;await pause(20);}throw Error('ACTUAL_MCP_CATALOG_MARKER_MISSING: '+seed.mode);};
try{
 const env={...process.env,PM_SLASH_DATA_DIR:profile,PM_SLASH_TEST_HIDDEN:'1'};delete env.ELECTRON_RUN_AS_NODE;delete env.PM_SLASH_DEV_SERVER_URL;delete env.VITE_DEV_SERVER_URL;
 app=await electron.launch({cwd:repo,args:['.'],env,timeout:60000});page=await app.firstWindow();page.setDefaultTimeout(15000);page.on('pageerror',error=>evidence.pageErrors.push(error.message));await page.locator('.brand').waitFor();assert.equal(await app.evaluate(({app})=>app.getPath('userData')),profile);
 for(const seed of seeds){
  // The actual same-version business fixture is checked item by item, with IDs supplied by the host.
  const view=await call({type:'taskDeliveryGet',runId:seed.runId});assert.equal(view.items.some(item=>item.status==='blocked'),false,JSON.stringify(view.items));
  const actual=await call({type:'read',mountId:seed.mountId,path:seed.path});assert.equal(actual,content,'Read complete fixture content before the per-item review.');
  const decisions=view.items.filter(item=>item.status!=='passed').map(item=>{assert.equal(item.allowedActions.includes('confirm'),true);assert.ok(['business','content_review','human_criterion'].includes(item.kind));return{itemId:item.id,action:'confirm',note:'Agent 实际核对隔离说明全文：整理资料、核对内容、修改先看差异、保留原件与版本均有明确对应段落。该记录不是实际用户签字。',evidence:{...item.requiredEvidence,citations:[],locators:[seed.path+' 第2至4段；实际官方read全文 hash '+seed.sourceHash]}};});
  assert.ok(decisions.length);const reviewed=await call({type:'taskDeliveryReview',runId:seed.runId,reportId:view.reportId,expectedBindingHash:view.bindingHash,decisions});assert.equal(reviewed.allowed,true);
  const entry:any={mode:seed.mode,runId:seed.runId,proposalId:seed.proposalId,sourceHash:seed.sourceHash,reportId:reviewed.reportId,bindingHash:reviewed.bindingHash,reviewer:'Agent',realUserAcceptance:false,decisions};evidence.scenarios.push(entry);
  // Start an official approval and retain its promise in the renderer while the SDK catalog really waits.
  await page.evaluate(id=>{(window as any).__dispatchResult=undefined;(window as any).__dispatchPromise=(window as any).pm.request({type:'externalAction',id,decision:'approve'}).then(result=>{(window as any).__dispatchResult=result;return result;});},seed.proposalId);
  await catalogReady(seed);entry.catalogWaitObservedAt=new Date().toISOString();assert.equal((await calls(seed)).length,0);
  const waiting=(await call({type:'operations',limit:200})).find(item=>item.runId==='manual-mcp'&&item.state==='executing');assert.ok(waiting,'Actual main executeMcp Operation must be executing during the catalog wait.');entry.operationId=waiting.id;
  if(seed.mode==='asset'){await fs.writeFile(seed.file,content+'\n连接等待期间的真实文件变更。\n');entry.changedHash=sha(await fs.readFile(seed.file));assert.notEqual(entry.changedHash,seed.sourceHash);}
  if(seed.mode==='permission'){await call({type:'permissionSet',capability:'external_action',decision:'deny'});assert.equal((await call({type:'state'})).permissions.external_action,'deny');entry.changeVia='official permissionSet';}
  if(seed.mode==='connection'){const connection=(await call({type:'state'})).connections.find(item=>item.id==='dispatch-'+seed.mode);assert.ok(connection);const updated={...connection,args:[...connection.args,'configuration-revision-2']};await call({type:'connection',connection:updated});assert.deepEqual((await call({type:'state'})).connections.find(item=>item.id===connection.id).args,updated.args);entry.changeVia='official connection upsert changes real argument binding; existing fixture process not killed by the script';}
  await fs.writeFile(path.join(seed.directory,'catalog-release'),'release');
  await page.waitForFunction(()=>(window as any).__dispatchResult!==undefined,null,{timeout:20000});const result=await page.evaluate(()=>(window as any).__dispatchResult);assert.equal(result.ok,true,result.error);entry.response=result;
  const received=await calls(seed),operation=(await call({type:'operations',limit:200})).find(item=>item.id===entry.operationId);assert.ok(operation);entry.received=received;entry.receivedCount=received.length;entry.operation=operation;
  if(seed.mode==='current'){assert.equal(received.length,1);assert.equal(received[0].arguments.content,content);assert.equal(sha(received[0].arguments.content),seed.sourceHash);assert.equal(result.data.status,'succeeded');assert.equal(operation.state,'succeeded');}
  else if(seed.mode==='lost'){assert.equal(received.length,1);assert.equal(sha(received[0].arguments.content),seed.sourceHash);assert.equal(result.data.status,'outcome_unknown');assert.equal(operation.state,'outcome_unknown');}
  else{assert.equal(received.length,0);assert.equal(result.data.status,'failed');assert.equal(operation.state,'failed');assert.match(result.data.diagnostic,/MCP_PRE_DISPATCH_REJECTED/);}
  await pause(300);assert.equal((await calls(seed)).length,received.length,'No automatic resend after refusal or lost receipt.');entry.noAutomaticRetry=true;entry.status='passed';
  if(seed.mode==='permission')await call({type:'permissionSet',capability:'external_action',decision:'allow'});
  await page.getByText('真实派发边界 '+seed.mode,{exact:true}).first().click();await page.screenshot({path:path.join(output,seed.mode+'-actual-ipc.png'),fullPage:true});
  await fs.writeFile(path.join(output,'result.pending.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({mode:seed.mode,status:entry.status,received:entry.receivedCount,operation:operation.state}));
 }
 assert.deepEqual(evidence.pageErrors,[]);for(const item of evidence.runtimeFiles)assert.equal(sha(await fs.readFile(path.join(repo,item.path))),item.sha256,'Runtime/source changed during this attempt: '+item.path);evidence.status='passed';
}catch(error){evidence.error=String(error);if(page)await page.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});throw error;}
finally{try{await app?.close();evidence.instanceClosed=true;}catch(error){evidence.instanceCloseError=String(error);evidence.status='failed';}evidence.finishedAt=new Date().toISOString();await fs.writeFile(path.join(output,'result.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({status:evidence.status,output,scenarios:evidence.scenarios.length,instanceClosed:evidence.instanceClosed}));}
