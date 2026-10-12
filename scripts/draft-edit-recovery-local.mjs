// Fixed loopback responses exercise the existing Pi/Service chain. They do not
// measure cloud model quality. Run after the build owner builds dist.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {fileURLToPath,pathToFileURL} from 'node:url';

const repository=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sha=value=>createHash('sha256').update(value).digest('hex');
const wait=async predicate=>{for(let i=0;i<1200;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,25));}throw Error('LOCAL_RECOVERY_TIMEOUT');};
const tool=(id,name,args)=>({index:0,id,type:'function',function:{name,arguments:JSON.stringify(args)}});
const toolResult=(body,id)=>body.messages.findLast(message=>message.role==='tool'&&message.tool_call_id===id)?.content;

export async function runDraftRecoveryLocal({repo=repository,modules,output}={}){
 const compiledModules=!modules;
 if(!modules){const root=path.join(repo,'dist');const [service,store,agent]=await Promise.all([import(pathToFileURL(path.join(root,'main/service.js')).href),import(pathToFileURL(path.join(root,'main/store.js')).href),import(pathToFileURL(path.join(root,'main/agent.js')).href)]);modules={Service:service.Service,Store:store.Store,createRuntime:agent.createRuntime};}
 const testRoot=path.join(repo,'.test-data');await fs.mkdir(testRoot,{recursive:true});output??=await fs.mkdtemp(path.join(testRoot,'draft-edit-recovery-local-'));
 const relative=path.relative(testRoot,path.resolve(output));assert.ok(relative&&!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep));
 const profile=path.join(output,'profile'),workspace=path.join(output,'project');await fs.mkdir(profile,{recursive:true});
 const report={status:'running',output,profile,workspace,cloudExecuted:false,electronStarted:false,built:false,compiledModules,requests:0,checks:[],sourceHashes:{},compiledHashes:{},limitations:['Fixed localhost model responses verify Pi/Service plumbing and safe failure records, not cloud recovery or design quality.']};
 const check=(name,verify)=>{verify();report.checks.push(name);};
 const blocks=Array.from({length:21},(_,index)=>index===7?'<div class="field" id="g-name"><label>姓名</label><input value="PRIVATE_ORIGINAL_NAME"></div>':`<p id="field-${index}">original-${index}</p>`);
 const original=`<!doctype html><html><head><title>本机恢复验证</title></head><body>${blocks.join('\n')}</body></html>`;
 let service,store,runId,target,file,requestError,readCalls=0,editCalls=0,brokerCalls=0,lateRejection;
 const failureOps=()=>store.operationsForRun(runId).filter(op=>['read_draft','edit_draft'].includes(op.tool)&&op.state==='failed');
 const checkpoint=()=>store.get('run-checkpoint:'+runId,null);
 const server=createServer(async(req,res)=>{
  try{
   assert.equal(req.method,'POST');assert.equal(req.url,'/v1/chat/completions');
   const parts=[];for await(const part of req)parts.push(Buffer.from(part));const body=JSON.parse(Buffer.concat(parts).toString());
   const step=report.requests++;assert.ok(step<5,'Unexpected auxiliary model request');
   const base={...target,expectedContentHash:sha(original)};let calls,content;
   if(step===0){
    // Exclude Service's normal authorised startup reads; measure only the
    // interval in which these invalid model tool calls are processed.
    brokerCalls=0;
    const wire=body.tools.find(entry=>entry.function.name==='edit_draft')?.function;
    assert.ok(wire);assert.equal(wire.parameters.type,'object');assert.notEqual(wire.strict,true);assert.equal(wire.parameters.anyOf.length,2);assert.ok(wire.parameters.anyOf.every(branch=>branch.type==='object'&&branch.additionalProperties===false));
    assert.deepEqual(wire.parameters.anyOf[0].properties.edits,{not:{}});assert.deepEqual(wire.parameters.anyOf[1].properties.oldText,{not:{}});assert.deepEqual(wire.parameters.anyOf[1].properties.newText,{not:{}});
    calls=[tool('missing','edit_draft',base),tool('mixed','edit_draft',{...base,oldText:'PRIVATE_OLD',newText:'PRIVATE_NEW',edits:[{oldText:'PRIVATE_OLD',newText:'PRIVATE_NEW'}]}),tool('unknown','read_draft',{...target,unknown:'PRIVATE_UNKNOWN'})].map((value,index)=>({...value,index}));
   }else if(step===1){
    check('native schema failures reach Pi before execute',()=>{for(const [id,name] of [['missing','edit_draft'],['mixed','edit_draft'],['unknown','read_draft']])assert.ok(String(toolResult(body,id)).startsWith(`Validation failed for tool "${name}":\n`));assert.equal(readCalls,0);assert.equal(editCalls,0);assert.equal(brokerCalls,0);assert.equal(service.state.pendingApprovals.length,0);assert.equal(service.state.changes.length,0);});
    check('schema failures checkpointed immediately exactly once and safely',()=>{assert.equal(failureOps().length,3);assert.equal(checkpoint().completedOperations.filter(op=>['read_draft','edit_draft'].includes(op.tool)).length,3);assert.doesNotMatch(JSON.stringify(failureOps()),/PRIVATE_|oldText|newText|unknown|arguments|Received/);});
    service.setPermission('artifact_write','allow');
    calls=[tool('batch21','edit_draft',{...base,edits:blocks.map((block,index)=>({oldText:index===7?block.replace(' id="g-name"',''):block,newText:`<p id="updated-${index}">changed-${index}</p>`}))})];
   }else if(step===2){
    const error=String(toolResult(body,'batch21'));assert.ok(error.startsWith('DRAFT_MATCH_NOT_FOUND: '));const recovery=JSON.parse(error.slice('DRAFT_MATCH_NOT_FOUND: '.length));
    check('native index 7 rejection is atomic and returned with bounded recovery',()=>{assert.equal(recovery.failedEditIndex,7);assert.equal(recovery.failedEditNumber,8);assert.equal(recovery.totalEdits,21);assert.equal(recovery.contentHash,sha(original));assert.deepEqual(recovery.readDraft,{...target,offset:0,limit:8000});assert.doesNotMatch(error,/PRIVATE_|<div|original-0|\.slash-edit-/);assert.equal(service.state.changes.length,0);assert.equal(failureOps().length,4);assert.ok(checkpoint().completedOperations.some(op=>op.result?.startsWith('Error: DRAFT_MATCH_NOT_FOUND:')));});
    assert.equal(await fs.readFile(file,'utf8'),original);calls=[tool('recover-read','read_draft',recovery.readDraft)];
   }else if(step===3){
    const receipt=JSON.parse(String(toolResult(body,'recover-read')));
    check('read_draft exposes current real receipt to Pi',()=>{assert.equal(receipt.source,'applied');assert.equal(receipt.changeId,undefined);assert.equal(receipt.contentHash,sha(original));assert.ok(receipt.content.includes('id="g-name"'));assert.equal(receipt.truncated,false);});
    calls=[tool('small-correct','edit_draft',{...target,expectedContentHash:receipt.contentHash,edits:[{oldText:blocks[0],newText:blocks[0].replace('original-0','updated-0')},{oldText:blocks[7],newText:blocks[7].replace('PRIVATE_ORIGINAL_NAME','PRIVATE_UPDATED_NAME')}]})];
   }else{
    const receipt=JSON.parse(String(toolResult(body,'small-correct')));
    check('correct small batch returns one pending card to Pi',()=>{assert.equal(receipt.status,'pending');assert.equal(service.state.changes.length,1);assert.equal(service.state.changes[0].id,receipt.changeId);assert.equal(service.state.changes[0].status,'pending');assert.equal(service.state.changes[0].before,sha(original));assert.match(service.state.changes[0].content,/id="g-name"/);assert.match(service.state.changes[0].content,/updated-0/);});
    content='本机固定响应验证完成：参数拒绝和第8项匹配失败已记录，重新读取后的小批修改已生成待应用草稿。';
   }
   res.writeHead(200,{'content-type':'text/event-stream'});const envelope={id:'local-recovery-'+step,object:'chat.completion.chunk',created:1,model:body.model};
   res.write('data: '+JSON.stringify({...envelope,choices:[{index:0,delta:{role:'assistant',...(calls?{tool_calls:calls}:{content})},finish_reason:null}]})+'\n\n');
   res.end('data: '+JSON.stringify({...envelope,choices:[{index:0,delta:{},finish_reason:calls?'tool_calls':'stop'}],usage:{prompt_tokens:100,completion_tokens:100,total_tokens:200}})+'\n\ndata: [DONE]\n\n');
  }catch(error){requestError=error;res.writeHead(500);res.end('LOCAL_RECOVERY_ASSERTION_FAILED');}
 });
 try{
  for(const name of ['main/agent.ts','main/draft-input-rejections.ts','main/service.ts','main/draft-edit.ts','shared/draft-edit.ts','src/run-operation-view.ts','src/App.tsx'])report.sourceHashes[name]=sha(await fs.readFile(path.join(repo,name)));
  if(compiledModules)for(const name of ['main/agent.js','main/draft-input-rejections.js','main/service.js','main/draft-edit.js','shared/draft-edit.js'])report.compiledHashes[name]=sha(await fs.readFile(path.join(repo,'dist',name)));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  store=new modules.Store(profile);
  service=new modules.Service(store,()=> 'local-recovery-key',()=>{},async options=>{
   const read=options.readDraft,edit=options.editDraft;options.readDraft=async input=>{readCalls++;return read(input);};options.editDraft=async input=>{editCalls++;return edit(input);};lateRejection=options.draftInputRejected;
   return modules.createRuntime(options);
  },{fetchModelMetadata:async()=>{throw Error('LOCAL_FIXTURE_OFFLINE_METADATA');}});
  await service.workspace(workspace);service.setPermission('workspace_read','allow');service.setPermission('artifact_write','ask');
  const broker=service.capabilityBroker,execute=broker.execute.bind(broker);broker.execute=async(...args)=>{if(['workspace_read','artifact_write'].includes(args[0].capability))brokerCalls++;return execute(...args);};
  target={mountId:service.state.mounts.find(mount=>mount.name==='成果').id,path:'recovery/index.html'};file=path.join(service.state.mounts.find(mount=>mount.id===target.mountId).path,target.path);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,original);
  await fs.mkdir(path.join(profile,'agent'),{recursive:true});await fs.writeFile(path.join(profile,'agent','settings.json'),JSON.stringify({compaction:{enabled:false},retry:{enabled:false}}));
  service.state.models=[{id:'draft-recovery-local',name:'本机草稿恢复验证',provider:'custom',modelId:'local-recovery',protocol:'openai-completions',baseUrl:`http://127.0.0.1:${server.address().port}/v1`,hasKey:true,maxTokens:8000,contextWindow:65536,supportsVision:false}];service.state.defaultModelId='draft-recovery-local';service.save();
  report.conversationId=service.conversation();runId=await service.send(report.conversationId,'验证局部草稿恢复记录。','build','standard');report.runId=runId;
  await wait(()=>service.state.runs.find(run=>run.id===runId)?.finishedAt);if(requestError)throw requestError;
  const run=service.state.runs.find(run=>run.id===runId);assert.equal(run.status,'succeeded',run.error);assert.equal(report.requests,5);
  check('original is unchanged; failures remain in final checkpoint',()=>{assert.equal(failureOps().length,4);assert.equal(checkpoint().completedOperations.filter(op=>['read_draft','edit_draft'].includes(op.tool)&&op.state==='failed').length,4);assert.equal(service.state.pendingApprovals.length,0);assert.equal(readCalls,1);assert.equal(editCalls,2);});assert.equal(await fs.readFile(file,'utf8'),original);
  const beforeOps=store.operationsForRun(runId).length,finished=JSON.stringify(run);lateRejection({tool:'edit_draft',toolCallHash:sha('late'),stage:'pi_schema',reason:'missing_replacement',issueCount:1,state:'failed'});
  check('late rejection cannot reopen completed run or approvals',()=>{assert.equal(store.operationsForRun(runId).length,beforeOps);assert.equal(JSON.stringify(run),finished);assert.equal(service.state.pendingApprovals.length,0);});
  report.status='passed';report.runStatus=run.status;report.changeId=service.state.changes[0].id;report.failures=failureOps().map(op=>({tool:op.tool,state:op.state,result:op.result}));report.originalHash=sha(original);report.readCalls=readCalls;report.editCalls=editCalls;
 }catch(error){report.status='failed';report.error=String(error.stack??error);}
 finally{
  if(service&&runId&&!service.state.runs.find(run=>run.id===runId)?.finishedAt){service.cancel(runId);await wait(()=>service.state.runs.find(run=>run.id===runId)?.finishedAt).catch(()=>{});}
  service?.dispose();if(service)await Promise.allSettled([...service.agentIndex.queues.values()]);store?.close();server.closeAllConnections();await new Promise(resolve=>server.close(()=>resolve()));
  report.closed={service:true,store:true,http:true};await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
 }
 if(report.status!=='passed')throw Error(`${report.error}\nEvidence: ${path.join(output,'report.json')}`);return report;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const report=await runDraftRecoveryLocal();console.log(JSON.stringify({status:report.status,checks:report.checks.length,requests:report.requests,output:report.output,profile:report.profile,workspace:report.workspace,conversationId:report.conversationId,runId:report.runId,cloudExecuted:false}));}catch(error){console.error(String(error));process.exitCode=1;}
}
