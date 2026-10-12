// An independent host for compiled Service/createRuntime and the real restricted runner.
// Does not import production main.ts or mutate Electron exports.
import {app} from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';

async function runFixture(){
const manifest=JSON.parse(await fs.readFile(process.argv[2],'utf8'));
app.setPath('userData',manifest.profile);app.setPath('sessionData',manifest.profile);app.on('window-all-closed',()=>{});
const sha=value=>createHash('sha256').update(value).digest('hex');
const report={schemaVersion:1,status:'running',cloudExecuted:false,projectBuild:false,fixedResponses:true,checks:[],cases:[],compiledHashes:{},sourceHashes:manifest.sourceHashes,limitations:['Fixed local responses prove transport, version binding and bounded repair, not model visual judgment or business correctness.','No production profile, credential or real project inputs are opened. Evidence excludes request/response text, base64 and thinking.']};
let store,service,browser,server,activeCase;
const stage=async status=>fs.writeFile(path.join(manifest.output,'progress.json'),JSON.stringify({status,cloudExecuted:false}));
const check=(name,condition)=>{if(!condition)report.failedCheck=name;assert.ok(condition,name);report.checks.push({name,status:'passed'});};
const wait=async runId=>{
 const deadline=Date.now()+90000;
 while(Date.now()<deadline){const run=service.state.runs.find(item=>item.id===runId);if(run&&['succeeded','failed','interrupted','cancelled','awaiting_plan'].includes(run.status)&&!service.active.has(runId)&&!service.starting.has(runId))return run;await new Promise(resolve=>setTimeout(resolve,40));}
 service.cancel(runId);throw Error('FIXTURE_RUN_TIMEOUT');
};
const textOf=content=>typeof content==='string'?content:Array.isArray(content)?content.filter(item=>item.type==='text').map(item=>item.text).join('\n'):'';
const toolResult=(packet,id)=>{const value=packet.messages.find(message=>message.role==='tool'&&message.tool_call_id===id);return value?JSON.parse(textOf(value.content)):undefined;};
function send(res,model,body){
 res.writeHead(200,{'content-type':'text/event-stream'});
 const event=(delta,finish_reason)=>res.write('data: '+JSON.stringify({id:'local-visual-fixture',object:'chat.completion.chunk',created:1,model,choices:[{index:0,delta,finish_reason}]})+'\n\n');
 event({role:'assistant'},null);
 if(body.tool){event({tool_calls:[{index:0,id:body.tool.id,type:'function',function:{name:body.tool.name,arguments:JSON.stringify(body.tool.args)}}]},null);event({},'tool_calls');}
 else{event({content:body.text},null);event({},'stop');}
 res.end('data: [DONE]\n\n');
}
const html=gap=>`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>本地模拟表单</title><style>*{box-sizing:border-box}body{margin:0;padding:24px;font:16px Arial}main{max-width:600px}form{display:flex;flex-direction:column;gap:${gap}px}input,button{font:16px Arial;width:200px;max-width:100%;height:44px}button{padding:8px}#status{min-height:28px}</style></head><body><main><h1>本地模拟表单</h1><p id="notice">仅本地模拟，未调用后台</p><form id="entry" novalidate><label for="name">名称</label><input id="name" name="name" maxlength="50"><button id="save" type="submit">模拟提交</button></form><p id="status" aria-live="polite"></p></main><script>document.getElementById('entry').addEventListener('submit',function(event){event.preventDefault();document.getElementById('status').textContent=document.getElementById('name').value.trim()?'模拟提交成功，未调用后台':'请输入名称';});</script></body></html>`;
const businessCases=[
 {id:'preserve-empty-rejection',title:'保留空名称校验',viewport:{width:1440,height:900},steps:[{action:'click',selector:'#save'},{action:'assert',assertion:'text',selector:'#status',expected:'请输入名称',match:'equals'}]},
 {id:'preserve-simulation-submit',title:'保留填写与模拟提交',viewport:{width:390,height:844},steps:[{action:'fill',selector:'#name',value:'本地固定样例'},{action:'click',selector:'#save'},{action:'assert',assertion:'text',selector:'#status',expected:'模拟提交成功，未调用后台',match:'equals'},{action:'assert',assertion:'text',selector:'#notice',expected:'仅本地模拟，未调用后台',match:'equals'}]},
];
const baselineHash=sha(JSON.stringify(businessCases));
async function modelRequest(req,res){
 let phase='request_decode';
 try{
  if(req.url!=='/v1/chat/completions'||req.method!=='POST')throw Error('FIXTURE_UNEXPECTED_HTTP_ROUTE');
  const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>20*1024*1024)throw Error('FIXTURE_REQUEST_LIMIT');chunks.push(chunk);}
  const packet=JSON.parse(Buffer.concat(chunks).toString()),state=activeCase;assert.ok(state);state.requestCount++;
  assert.equal(packet.model,'local-visual-fixture');
  const imageBlocks=packet.messages.flatMap(message=>Array.isArray(message.content)?message.content.filter(block=>block.type==='image_url'):[]);
  if(imageBlocks.length){
   phase='image_envelope';
   assert.equal(packet.tools,undefined);assert.equal(packet.messages.length,1);assert(imageBlocks.length<=3);assert((packet.max_completion_tokens??packet.max_tokens)<=2048);
   assert.equal(state.mode,'build');assert.equal(state.vision,true);
   const prompt=textOf(packet.messages[0].content),match=/<untrusted_visual_evidence>\n([\s\S]+)\n<\/untrusted_visual_evidence>/.exec(prompt);assert.ok(match);
   const identities=JSON.parse(match[1]).screenshots;assert.equal(identities.length,imageBlocks.length);
   const images=imageBlocks.map((block,index)=>{
    phase='image_identity';
    assert.match(block.image_url.url,/^data:image\/png;base64,/);const bytes=Buffer.from(block.image_url.url.split(',')[1],'base64');assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    const receipt=identities[index].receipt;assert.equal(sha(bytes),receipt.contentHash);assert.equal(receipt.entryHash,sha(html(state.gap)));assert.equal(receipt.versionState,'current');assert.ok(receipt.viewport);
    return{entryHash:receipt.entryHash,screenshotHash:sha(bytes),screenshotIdHash:sha(receipt.screenshotId),reportIdHash:sha(receipt.reportId),viewport:receipt.viewport,pixelWidth:bytes.readUInt32BE(16),pixelHeight:bytes.readUInt32BE(20)};
   });
   state.imageRequests++;state.imageObservations.push({request:state.imageRequests,imageCount:images.length,toolsAbsent:true,outputCap:packet.max_completion_tokens??packet.max_tokens,images});
   const findings=state.label==='persistent_candidate_capped_at_two'||state.imageRequests===1?[{screenshotRef:'V1',category:'spacing',confidence:'high',explanation:'输入框与提交按钮距离过近，形成局部视觉拥挤',suggestion:'仅调整表单项间距，保留原有规则与模拟说明',region:{x:.01,y:.05,width:.3,height:.4}}]:[];
   send(res,packet.model,{text:JSON.stringify({findings,limitations:['固定本地审查仅检验链路，不证明模型视觉质量']})});return;
  }
  if(!packet.tools){state.unexpectedTextReview++;throw Error('FIXTURE_UNEXPECTED_TEXT_REVIEW');}
  phase='parent_tools';
  if(state.mode==='plan'){assert(!packet.tools.some(tool=>tool.function.name==='write_draft'));send(res,packet.model,{text:'方案 1：保留本地模拟表单，仅计划调整间距。方案 2：先核对截图，再制定局部修改方案。'});return;}
  const names=new Set(packet.tools.map(tool=>tool.function.name));assert(names.has('write_draft'));assert(names.has('read_draft'));assert(names.has('edit_draft'));
  const latestUser=[...packet.messages].reverse().find(message=>message.role==='user'),latestText=textOf(latestUser?.content),round=/第([12])\/2轮有限修正/.exec(latestText)?.[1];
  if(round){
   const n=Number(round);state.parentRepairRounds.add(n);assert(n<=2);assert.match(latestText,/visualOpinions/);assert.match(latestText,/不得删减业务规则/);
   const readId='repair-read-'+n,editId='repair-edit-'+n,read=toolResult(packet,readId),edited=toolResult(packet,editId);
   if(!read){send(res,packet.model,{tool:{id:readId,name:'read_draft',args:{mountId:state.mountId,path:state.path}}});return;}
   phase='draft_read_receipt';
   assert.equal(read.source,'pending');assert.equal(read.contentHash,sha(html(state.gap)));assert.ok(read.changeId);
   if(!edited){const next=n===1?16:24;state.pendingGap=next;send(res,packet.model,{tool:{id:editId,name:'edit_draft',args:{mountId:state.mountId,path:state.path,changeId:read.changeId,expectedContentHash:read.contentHash,oldText:'gap:'+state.gap+'px',newText:'gap:'+next+'px'}}});return;}
   phase='draft_edit_receipt';assert.equal(edited.contentHash,sha(html(state.pendingGap)));state.gap=state.pendingGap;state.editCalls++;
   send(res,packet.model,{text:'已保留模拟说明和交互规则，仅保存局部间距草稿；业务仍待确认。'});return;
  }
  const written=toolResult(packet,'initial-write');
  if(!written){send(res,packet.model,{tool:{id:'initial-write',name:'write_draft',args:{mountId:state.mountId,path:state.path,content:html(0)}}});return;}
  assert.equal(written.status,'pending');state.writeCalls++;
  send(res,packet.model,{text:'已保存本地模拟表单草稿，尚未应用；等待宿主具体检查。'});
 }catch(error){if(activeCase){activeCase.errorHashes.push(sha(String(error?.stack??error)));activeCase.errorPhases.push(phase);}if(!res.headersSent)res.writeHead(500,{'content-type':'application/json'});res.end('{"error":{"message":"LOCAL_FIXTURE_ASSERTION_FAILED"}}');}
}
async function runCase(label,{vision=true,mode='build'}={}){
 const state={label,vision,mode,path:label+'.html',mountId:service.state.mounts.find(mount=>mount.name==='成果').id,gap:0,requestCount:0,imageRequests:0,imageObservations:[],parentRepairRounds:new Set(),writeCalls:0,editCalls:0,unexpectedTextReview:0,errorHashes:[],errorPhases:[]};activeCase=state;report.currentCase=label;
 const output=service.state.mounts.find(mount=>mount.id===state.mountId),formal=path.join(output.path,state.path),original=html(32);await fs.writeFile(formal,original,{flag:'wx'});
 const target={mountId:state.mountId,path:state.path};
 const saved=await service.savePrototypeAcceptance({...target,title:'固定本地用户业务基线',cases:businessCases,sourceRefs:[]},'build');
 await service.setPrototypeAcceptanceRequired({...target,required:true,mode:'build',expectedRevision:saved.spec.revision,expectedSpecHash:saved.spec.specHash});
 const model=service.state.models[0];model.supportsVision=vision;service.save();
 const conversationId=service.conversation(),runId=await service.send(conversationId,'LOCAL_CASE '+label+'：生成响应式可交互本地表单，仅调整间距，保留名称校验、模拟提交及未调用后台说明。',mode,'standard',model.id);
 const run=await wait(runId),view=mode==='build'?await service.getTaskAcceptance(runId):undefined,latest=view?.latestReport,operations=store.operationsForRun(runId),changes=service.state.changes.filter(change=>change.runId===runId);
 const row={label,status:run.status,acceptanceStatus:latest?.status,automaticStatus:latest?.automaticStatus,versionState:latest?.versionState,repairRounds:run.acceptance?.repairRounds??0,parentRepairRounds:[...state.parentRepairRounds],imageRequests:state.imageRequests,requestCount:state.requestCount,writeCalls:state.writeCalls,editCalls:state.editCalls,imageObservations:state.imageObservations,findings:latest?.visualReview?.findings.length,visualState:latest?.visualReview?.versionState,businessCoverage:latest?.businessCoverage.status,baselineCount:view?.contract.baseline.length??0,baselineCaseHash:view?.contract.baseline[0]?sha(JSON.stringify(view.contract.baseline[0].cases)):undefined,regressionStatuses:latest?.regression.map(item=>item.status)??[],pendingDrafts:changes.filter(change=>change.status==='pending').length,formalUnchanged:sha(await fs.readFile(formal))===sha(original),draftHashes:changes.map(change=>sha(change.content)),operations:{write_draft:operations.filter(item=>item.tool==='write_draft'&&item.state==='succeeded').length,edit_draft:operations.filter(item=>item.tool==='edit_draft'&&item.state==='succeeded').length,visual_review:operations.filter(item=>item.tool==='visual_review'&&item.state==='succeeded').length},errorHashes:state.errorHashes,errorPhases:state.errorPhases};report.cases.push(row);
 check(label+':transport-clean',!state.errorHashes.length&&!state.unexpectedTextReview);check(label+':formal-file-unchanged',row.formalUnchanged);check(label+':repair-at-most-two',row.repairRounds<=2&&state.parentRepairRounds.size<=2);
 if(mode==='plan'){check(label+':plan-readonly-no-images',run.status==='awaiting_plan'&&changes.length===0&&state.imageRequests===0);return;}
 check(label+':run-succeeded',run.status==='succeeded');check(label+':one-unapplied-draft',changes.length===1&&changes[0].status==='pending');check(label+':business-baseline-frozen',view.contract.baseline.length===1&&row.baselineCaseHash===baselineHash);check(label+':business-regression-passed',latest.regression.length===1&&latest.regression.every(item=>item.status==='passed'));check(label+':original-spec-preserved',(await service.getPrototypeAcceptance(target)).spec.specHash===saved.spec.specHash);
 if(!vision){check(label+':unsupported-vision-no-images',state.imageRequests===0&&!latest.visualReview&&latest.visualReviewRequired===true&&latest.status==='unverified');return;}
 check(label+':real-png-no-tools',state.imageObservations.every(item=>item.imageCount>0&&item.toolsAbsent));
 check(label+':fresh-png-and-entry-after-edit',new Set(state.imageObservations.map(item=>item.images[0].entryHash)).size===state.imageRequests&&new Set(state.imageObservations.map(item=>item.images[0].screenshotHash)).size===state.imageRequests);
 check(label+':stored-image-identity',latest.visualReview.images.every(image=>state.imageObservations.at(-1).images.some(observed=>observed.entryHash===image.receipt.entryHash&&observed.screenshotHash===image.receipt.contentHash)));
 if(label==='repair_once_then_unverified')check(label+':one-repair-no-candidate-still-unverified',state.imageRequests===2&&row.repairRounds===1&&row.editCalls===1&&row.findings===0&&latest.status==='unverified'&&latest.businessCoverage.status==='unverified');
 else check(label+':two-repair-cap-retains-candidate',state.imageRequests===3&&row.repairRounds===2&&row.editCalls===2&&row.findings===1&&latest.status==='needs_human');
}

try{
 await stage('waiting_electron_ready');await app.whenReady();await stage('electron_ready');
 const modulePaths={store:'main/store.js',service:'main/service.js',browser:'main/prototype-browser.js',agent:'main/agent.js',visual:'main/prototype-visual-review.js'};
 for(const [name,file]of Object.entries(modulePaths)){const absolute=path.join(manifest.repo,'dist',file);report.compiledHashes[name]=sha(await fs.readFile(absolute));}
 const {Store}=await import(pathToFileURL(path.join(manifest.repo,'dist/main/store.js')).href),{Service}=await import(pathToFileURL(path.join(manifest.repo,'dist/main/service.js')).href);browser=await import(pathToFileURL(path.join(manifest.repo,'dist/main/prototype-browser.js')).href);
 server=createServer((req,res)=>void modelRequest(req,res));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 store=new Store(manifest.profile);const model={id:'local-only',provider:'custom',name:'本地固定模型',baseUrl:'http://127.0.0.1:'+server.address().port+'/v1',modelId:'local-visual-fixture',protocol:'openai-completions',hasKey:true,supportsVision:true,contextWindow:65536,maxTokens:12000};
 store.set('state',{root:'',mounts:[],conversations:[],changes:[],runs:[],connections:[],models:[model],defaultModelId:model.id,model:{id:model.modelId,baseUrl:model.baseUrl,hasKey:true}});
 service=new Service(store,()=> 'local-placeholder-only',()=>{},undefined,{runPrototypeAcceptance:browser.runPrototypeAcceptance},()=> 'local-placeholder-only');await stage('service_created');
 await service.workspace(manifest.workspace);for(const [capability,decision]of Object.entries({workspace_read:'allow',artifact_write:'allow',web_read:'deny',process_execute:'deny',connection_config:'deny',external_action:'deny'}))service.setPermission(capability,decision);
 await stage('repair_once_then_unverified');await runCase('repair_once_then_unverified');await stage('persistent_candidate_capped_at_two');await runCase('persistent_candidate_capped_at_two');await stage('vision_unsupported_no_images');await runCase('vision_unsupported_no_images',{vision:false});await stage('plan_no_images');await runCase('plan_no_images',{mode:'plan'});
 check('real-browser-windows-settled',browser.prototypeBrowserActiveCount()===0);report.status='passed';
}catch(error){report.status='failed';report.error=/^[A-Z][A-Z0-9_]+$/.test(error?.message??'')?error.message:'FIXTURE_ASSERTION_FAILED';report.errorHash=sha(String(error?.stack??error));process.exitCode=1;}
finally{
 if(service){for(const run of service.state.runs)if(['queued','running','validating','waiting_user','cancelling'].includes(run.status))service.cancel(run.id);service.dispose();await Promise.allSettled([...service.agentIndex.queues.values()]);}
 browser?.cancelAllPrototypeAcceptance();server?.closeAllConnections();if(server)await new Promise(resolve=>server.close(resolve));store?.close();await fs.writeFile(path.join(manifest.output,'report.json'),JSON.stringify(report,null,2));app.exit(process.exitCode??0);
}
}
void runFixture().catch(()=>app.exit(1));
