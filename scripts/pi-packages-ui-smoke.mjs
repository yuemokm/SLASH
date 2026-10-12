import {_electron as electron,request as playwrightRequest} from 'playwright';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash,randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

// Run only after the build owner has compiled dist. Uses a new app profile,
// synthetic reference file and loopback Pi model. No build or cloud requests.
const root=process.cwd(),output=path.join(root,'.test-data',`pi-packages-ui-${Date.now()}`),profile=path.join(output,'profile'),workspace=path.join(output,'synthetic-project');
await fs.mkdir(profile,{recursive:true});
const fixedPackages={'pi-memory':'0.4.2','pi-web-access':'0.37.0','pi-mcp-adapter':'5.1.0','pi-subagents':'0.76.1','pi-lens':'4.4.0','@plannotator/pi-extension':'0.28.8','@langfuse/pi-observability-plugin':'0.1.2'};
const plan='# 方案 1：按来源核对\n\n先由只读子任务读取授权参考资料，返回依据与未验证项。\n\n# 方案 2：补充验收范围\n\n先请用户补充边界，再由父任务通过草稿提出修改。';
const evidence={status:'running',output,profile,workspace,built:false,cloudExecuted:false,checks:[],requests:[],pageErrors:[],screenshots:[],hashes:{},limitations:['Loopback deterministic responses verify actual packages, compiled IPC and desktop UI; cloud search and model quality are not evaluated.','Plan annotation uses the official local review HTTP protocol; the script does not open the user’s browser.']};
let app,page,reference,transportError,observabilityRequests=0,reviewContext;
const sockets=new Set();
const server=createServer(async(req,res)=>{
 try{
  if(req.url.startsWith('/observability')){observabilityRequests++;res.writeHead(200,{'content-type':'application/json'});res.end('{}');return;}
  assert.equal(req.method,'POST');assert.equal(req.url,'/v1/chat/completions');assert.equal(req.headers.authorization,'Bearer local-pi-packages-key');
  let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw),messages=body.messages??[],system=messages.filter(item=>item.role==='system').map(item=>String(item.content)).join('\n');
  const child=system.includes('你是父任务的只读'),tools=messages.filter(item=>item.role==='tool'),names=(body.tools??[]).map(item=>item.function?.name);
  evidence.requests.push({child,model:body.model,toolNames:names,toolReplies:tools.map(item=>({name:item.name,content:item.content})),messageCount:messages.length});
  assert.equal(body.model,'pi-packages-local');assert.ok(names.includes('read_file'));
  if(child){assert.ok(!names.some(name=>['delegate_readonly','write_file','write_draft','powershell','run_process','review_plan','load_tools'].includes(name)));assert.ok(!JSON.stringify(messages).includes('PRIVATE_PARENT_MARKER'));}
  const base={id:'local-'+randomUUID(),object:'chat.completion.chunk',created:1,model:body.model};res.writeHead(200,{'content-type':'text/event-stream'});
  const emit=(delta,finish=null)=>res.write('data: '+JSON.stringify({...base,choices:[{index:0,delta,finish_reason:finish}]})+'\n\n');
  const invoke=(name,args)=>{assert.ok(names.includes(name),`Actual compiled runtime must expose ${name}`);emit({role:'assistant',tool_calls:[{index:0,id:'call-'+randomUUID(),type:'function',function:{name,arguments:JSON.stringify(args)}}]});emit({},'tool_calls');};
  if(child&&!tools.length)invoke('read_file',reference);
  else if(child){assert.match(JSON.stringify(tools),/PI-PACKAGES-REFERENCE/);emit({role:'assistant',content:'LOCAL_CHILD_EVIDENCE：已读取本次授权参考文件，审批必须人工复核；未验证全部资料。'});emit({},'stop');}
  else if(!tools.length)invoke('delegate_readonly',{purpose:'research',task:'只读取指定参考资料并核对审批规则。'+JSON.stringify(reference)});
  else if(!tools.some(item=>String(item.content).includes('awaiting_user'))){assert.match(JSON.stringify(tools),/LOCAL_CHILD_EVIDENCE/);invoke('review_plan',{plan});}
  else{emit({role:'assistant',content:plan+'\n\n只读研究已完成；等待用户批注与明确确认。'});emit({},'stop');}
  res.end('data: [DONE]\n\n');
 }catch(error){transportError=error.stack||String(error);if(!res.headersSent)res.writeHead(500);res.end('LOCAL_FIXTURE_FAILED');}
});
server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const call=async value=>{const response=await page.evaluate(input=>window.pm.request(input),value);assert.ok(response.ok,response.error);return response.data;};
const check=name=>{evidence.checks.push(name);console.log('PASS '+name);};
const waitValue=async(read,predicate,timeout=45000)=>{const end=Date.now()+timeout;while(Date.now()<end){const value=await read();if(predicate(value))return value;assert.equal(transportError,undefined);await new Promise(resolve=>setTimeout(resolve,75));}assert.fail('Timed out waiting for Pi packages fixture');};
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const fixedFiles=['main/pi-subagents.ts','main/pi-packages.ts','main/agent.ts','main/service.ts','src/PiPackagesSettings.tsx','dist/main/pi-subagents.js','dist/main/pi-packages.js','dist/main/agent.js','dist/main/service.js'];
try{
 const html=await fs.readFile(path.join(root,'dist/renderer/index.html'),'utf8'),asset=html.match(/src="\.\/([^\"]+\.js)"/)?.[1];assert.ok(asset);fixedFiles.push(`dist/renderer/${asset}`);
 for(const file of fixedFiles)evidence.hashes[file]=digest(await fs.readFile(path.join(root,file)));
 app=await electron.launch({cwd:root,args:['.'],env:{...process.env,PM_SLASH_DATA_DIR:profile,PM_SLASH_TEST_HIDDEN:'1',PM_SLASH_DEV_SERVER_URL:''}});
 page=await app.firstWindow();page.setDefaultTimeout(15000);page.on('pageerror',error=>evidence.pageErrors.push(error.message));await page.locator('.brand').waitFor();assert.ok(page.url().startsWith('file:'));
 assert.equal(path.resolve(await app.evaluate(({app})=>app.getPath('userData'))).toLowerCase(),profile.toLowerCase());
 await app.evaluate(({shell,BrowserWindow})=>{globalThis.__piPackagesUiOpened=[];shell.openExternal=async href=>{const url=new URL(href);if(url.protocol!=='http:'||url.hostname!=='127.0.0.1')throw Error('UI_SMOKE_EXTERNAL_URL_DENIED');globalThis.__piPackagesUiOpened.push(href);};BrowserWindow.getAllWindows()[0].setSize(1366,900);});
 await call({type:'workspace',path:workspace});await call({type:'permissionSet',capability:'workspace_read',decision:'allow'});
 const state=await call({type:'state'}),mount=state.mounts.find(item=>item.name==='资源');assert.ok(mount);reference={mountId:mount.id,path:'参考资料/pi-package-reference.md'};
 const referenceFile=path.join(mount.path,reference.path),referenceText='PI-PACKAGES-REFERENCE：审批必须人工复核。';await fs.writeFile(referenceFile,referenceText);const referenceHash=digest(await fs.readFile(referenceFile));
 await page.getByRole('button',{name:'设置',exact:true}).click();const settings=page.getByRole('dialog',{name:'设置',exact:true});await settings.getByRole('navigation',{name:'设置分类'}).getByRole('button',{name:'工作空间',exact:true}).click();
 const advanced=settings.locator('[data-setting-id="pi-packages"]');await advanced.locator('summary').click();await advanced.getByRole('heading',{name:'Pi 能力包',exact:true}).waitFor();
 const packages=await call({type:'piPackages'});assert.equal(packages.packages.length,7);assert.deepEqual(new Set(packages.packages.map(item=>item.id)),new Set(['web','mcp','subagents','lens','plan','observability','memory']));assert.equal(packages.observability.enabled,false);assert.equal(packages.observability.mode,'metadata');
 for(const item of packages.packages){assert.equal(item.version,fixedPackages[item.name]);assert.equal(item.installed,true,item.error);const row=advanced.locator('.settings-row').filter({hasText:`${item.name} · ${item.version}`});assert.match(await row.innerText(),/已安装/);}
 const toggle=advanced.getByRole('switch',{name:'启用 Langfuse 运行观测'});assert.equal(await toggle.getAttribute('aria-checked'),'false');
 await advanced.getByLabel('Langfuse 服务地址').fill(`http://127.0.0.1:${server.address().port}/observability`);await advanced.getByLabel('Langfuse 公钥').fill('local-public');await advanced.getByLabel('Langfuse 密钥').fill('local-disabled-secret');await advanced.getByRole('button',{name:'保存观测设置',exact:true}).click();await waitValue(()=>advanced.getByLabel('Langfuse 密钥').inputValue(),value=>value==='');
 const saved=await call({type:'piPackages'});assert.equal(saved.observability.enabled,false);assert.equal(saved.observability.hasSecret,true);assert.ok(!JSON.stringify(saved).includes('local-disabled-secret'));assert.ok(!JSON.stringify(await call({type:'state'})).includes('local-disabled-secret'));
 await page.screenshot({path:path.join(output,'six-packages-settings.png')});evidence.screenshots.push('six-packages-settings.png');evidence.packages=saved;check('真实设置 UI 显示六固定包均已安装；Langfuse 默认关闭，保存关闭后不回传密钥');await settings.getByRole('button',{name:'关闭设置'}).click();
 await call({type:'modelUpsert',model:{provider:'loopback',name:'本机六包验证',baseUrl:`http://127.0.0.1:${server.address().port}/v1`,modelId:'pi-packages-local',protocol:'openai-completions',contextWindow:65536,maxTokens:4096},key:'local-pi-packages-key'});
 const model=(await call({type:'models'})).groups.flatMap(group=>group.models).find(item=>item.modelId==='pi-packages-local');assert.ok(model);
 const conversation=await call({type:'conversation',title:'Pi 六包实际接线验证'}),conversationId=typeof conversation==='string'?conversation:conversation.id;await page.locator('.sidebar').getByRole('button',{name:'Pi 六包实际接线验证',exact:true}).click();
 const sent=await call({type:'send',id:conversationId,text:'PRIVATE_PARENT_MARKER：委派只读任务核对参考文件，再打开方案批注。仅研究，不修改文件。',mode:'plan',permissionMode:'full_access',modelEntryId:model.id}),runId=typeof sent==='string'?sent:sent.runId;
 const finished=await waitValue(()=>call({type:'state'}),value=>['awaiting_plan','failed','cancelled','interrupted'].includes(value.runs.find(item=>item.id===runId)?.status));const run=finished.runs.find(item=>item.id===runId);assert.equal(run.status,'awaiting_plan',run.error);assert.equal(finished.changes.length,0);evidence.runId=runId;
 const opened=await app.evaluate(()=>globalThis.__piPackagesUiOpened);assert.equal(opened.length,0,'Hidden isolated profile must suppress the OS browser');const url=run.piPlanReview?.url;assert.ok(url);assert.equal(run.piPlanReview?.status,'awaiting_user');
 reviewContext=await playwrightRequest.newContext();const reviewPage=await reviewContext.get(url);assert.equal(reviewPage.status(),200);assert.match(await reviewPage.text(),/plannotator/i);const base=new URL(url).origin,payload=await(await reviewContext.get(base+'/api/plan')).json();assert.equal(payload.plan,plan);
 assert.equal((await reviewContext.get(base+'/api/doc?path=C:/')).status(),403);
 const feedback='UI-PLAN-FEEDBACK：请补充来源日期。',decision=await reviewContext.post(base+'/api/deny',{data:{serverSession:payload.serverSession,planRevision:0,feedback,planSave:{enabled:false}}});assert.equal(decision.status(),200);
 const operations=await waitValue(()=>call({type:'operations',limit:200}),rows=>rows.some(row=>row.runId===runId&&row.tool==='review_plan_feedback'&&row.state==='succeeded'));evidence.operations=operations.filter(row=>row.runId===runId);
 for(const name of ['delegate_readonly','read_file','review_plan','review_plan_feedback'])assert.ok(evidence.operations.some(row=>row.tool===name&&row.state==='succeeded'),`Actual Run must record ${name}`);
 const final=await call({type:'state'}),finalRun=final.runs.find(item=>item.id===runId);assert.equal(finalRun.status,'awaiting_plan');assert.equal(finalRun.piPlanReview.status,'needs_changes');assert.equal(finalRun.piChildTasks?.length,1);assert.equal(finalRun.piChildTasks[0].parentRunId,runId);assert.equal(finalRun.piChildTasks[0].state,'succeeded');assert.equal(finalRun.piChildTasks[0].toolCount,1);assert.ok(final.conversations.find(item=>item.id===conversationId).messages.some(item=>item.runId===runId&&item.text.includes(feedback)));assert.equal(final.runs.length,1);assert.equal(final.changes.length,0);evidence.childTasks=finalRun.piChildTasks;
 assert.ok(evidence.requests.some(item=>item.child&&item.toolReplies.some(reply=>String(reply.content).includes('PI-PACKAGES-REFERENCE'))));assert.ok(evidence.requests.some(item=>!item.child&&item.toolReplies.some(reply=>String(reply.content).includes('LOCAL_CHILD_EVIDENCE'))));assert.equal(observabilityRequests,0);assert.equal(digest(await fs.readFile(referenceFile)),referenceHash);assert.equal(transportError,undefined);assert.deepEqual(evidence.pageErrors,[]);
 await page.screenshot({path:path.join(output,'plan-child-feedback.png')});evidence.screenshots.push('plan-child-feedback.png');check('真实独立 Pi child 读取授权文件并回传父 Plan；调度/读取/批注及反馈均记录同一 Run');check('官方批注协议拒绝任意文件读取；反馈后仍等待确认，无自动 Build、草稿或观测上传');
 for(const file of fixedFiles)assert.equal(digest(await fs.readFile(path.join(root,file))),evidence.hashes[file],`Source/build changed during smoke: ${file}`);evidence.status='passed';
}catch(error){evidence.status='failed';evidence.error=error.stack||String(error);if(page)await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});process.exitCode=1;}
finally{await reviewContext?.dispose();if(app){await app.close();evidence.spawnedAppClosed=true;}for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));evidence.observabilityRequests=observabilityRequests;if(transportError)evidence.transportError=transportError;await fs.writeFile(path.join(output,'evidence.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({status:evidence.status,output,checks:evidence.checks,error:evidence.error},null,2));}
