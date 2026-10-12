import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:http';
import {createAgentSession,DefaultResourceLoader,ModelRuntime,SessionManager,SettingsManager} from '@earendil-works/pi-coding-agent';
import {Type} from '@sinclair/typebox';
import {createPiGoalAuditor} from '../main/pi-goal-auditor.ts';
const root=path.resolve(process.argv[2]);
const source=file=>pathToFileURL(path.join(root,'package','extensions',file)).href;
const {default:goalExtension}=await import(source('goal.ts'));
const {runGoalCompletionAuditor}=await import(source('goal-auditor.ts'));
const {shouldAutoConfirmProposal}=await import(source('goal-questionnaire.ts'));
const {loadGoalSettings,invalidateGoalSettingsCache}=await import(source('goal-settings.ts'));
const {createGoal}=await import(source('goal-record.ts'));
const evidence=[];
function reply(res,text,call){
 res.writeHead(200,{'content-type':'text/event-stream'});
 const base={id:'goal-fixture',object:'chat.completion.chunk',created:1,model:'fixture'};
 const delta=call?{role:'assistant',tool_calls:[{index:0,id:'call-'+Math.random(),type:'function',function:{name:call.name,arguments:JSON.stringify(call.args)}}]}:{role:'assistant',content:text};
 res.write('data: '+JSON.stringify({...base,choices:[{index:0,delta,finish_reason:null}]})+'\n\n');
 res.end('data: '+JSON.stringify({...base,choices:[{index:0,delta:{},finish_reason:call?'tool_calls':'stop'}],usage:{prompt_tokens:20,completion_tokens:5,total_tokens:25}})+'\n\ndata: [DONE]\n\n');
}
async function fixture(t,name,settings={},handler=(payload,res)=>reply(res,'fixture progress')){
 const cwd=await fs.mkdtemp(path.join(root,`${name}-`)),agentDir=path.join(cwd,'agent');
 await fs.mkdir(path.join(cwd,'.pi'),{recursive:true});await fs.mkdir(agentDir);
 process.env.PI_GOAL_GLOBAL_SETTINGS_FILE=path.join(cwd,'empty-global.json');
 process.env.PI_GOAL_SETTINGS_FILE=path.join(cwd,'.pi','pi-goal-x-settings.json');
 await fs.writeFile(process.env.PI_GOAL_SETTINGS_FILE,JSON.stringify({maxAutonomousRuns:0,oracle:{enabled:false},...settings}));invalidateGoalSettingsCache();
 await fs.writeFile(path.join(cwd,'evidence.md'),'AUTHORIZED-EVIDENCE');await fs.writeFile(path.join(root,'private.md'),'FORBIDDEN-EVIDENCE');
 await fs.writeFile(path.join(cwd,'AGENTS.md'),'FOREIGN-CONTEXT');
 await fs.mkdir(path.join(cwd,'.pi','extensions'));await fs.writeFile(path.join(cwd,'.pi','extensions','poison.ts'),'throw Error("FOREIGN_EXTENSION")');
 const requests=[];let reads=0,usage=0,allowed=true,unknown=false;const controller=new AbortController();
 const server=createServer(async(req,res)=>{const chunks=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));const payload=JSON.parse(Buffer.concat(chunks).toString());requests.push(payload);handler(payload,res,requests.length);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const runtime=await ModelRuntime.create({authPath:path.join(agentDir,'auth.json'),modelsPath:null,refreshOnCreate:false});
 runtime.registerProvider('slash-goal-fixture',{api:'openai-completions',baseUrl:`http://127.0.0.1:${server.address().port}/v1`,models:[{id:'fixture',name:'fixture',reasoning:false,input:['text'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:65536,maxTokens:1000,compat:{supportsDeveloperRole:false,supportsStore:false}}]});
 await runtime.setRuntimeApiKey('slash-goal-fixture','LOCAL-ONLY');const model=runtime.getModel('slash-goal-fixture','fixture');
 const guard=()=>{if(!allowed)throw Error('PERMISSION_DENIED');if(unknown)throw Error('SIDE_EFFECT_UNKNOWN');};
 const read={name:'read_file',label:'read',description:'Read gateway-authorized fixture',parameters:Type.Object({path:Type.String()}),execute:async(_id,input)=>{guard();if(path.resolve(cwd,input.path)!==path.join(cwd,'evidence.md'))throw Error('PERMISSION_DENIED');reads++;return{content:[{type:'text',text:await fs.readFile(path.join(cwd,'evidence.md'),'utf8')}],details:{}};}};
 const audited=createPiGoalAuditor({runId:name,cwd,agentDir,modelRuntime:runtime,model,tools:[read,{...read,name:'bash',execute:async()=>{throw Error('BASH_EXECUTED');}}],signal:controller.signal,deadlineAt:Date.now()+20_000,assertCurrent:guard,onUsage:u=>{usage+=u.input+u.output;},acceptCompletion:async()=>allowed&&!unknown},runGoalCompletionAuditor);
 const ctx={cwd,model,modelRuntime:runtime,sessionManager:SessionManager.inMemory(cwd)};
 let core;const manager=SessionManager.create(cwd,path.join(cwd,'sessions'));const piSettings=SettingsManager.inMemory({retry:{enabled:false},compaction:{enabled:false}});
 const loader=new DefaultResourceLoader({cwd,agentDir,settingsManager:piSettings,noExtensions:true,noSkills:true,noContextFiles:true,noPromptTemplates:true,noThemes:true,appendSystemPrompt:[],systemPrompt:'fixture',extensionFactories:[pi=>{goalExtension(pi,{runCompletionAuditor:audited});core=pi._goalCore;}]});await loader.reload();assert.deepEqual(loader.getExtensions().errors,[]);
 let created=await createAgentSession({cwd,agentDir,modelRuntime:runtime,model,settingsManager:piSettings,resourceLoader:loader,sessionManager:manager,noTools:'builtin',customTools:[read]});
 await created.session.bindExtensions({});
 t.after(async()=>{await fs.writeFile(path.join(cwd,'requests.json'),JSON.stringify(requests,null,2));controller.abort();await created.session.abort();await created.session.prompt('/goal-pause').catch(()=>{});created.session.dispose();core.scheduler.shutdown();core.clearContinuationState();core.stopAuditAnimation();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
 const restart=async patch=>{
  const goalFile=path.join(cwd,core.state.goal.activePath),sessionFile=manager.getSessionFile();
  await created.session.extensionRunner.emit({type:'session_shutdown',reason:'quit'});created.session.dispose();
  if(patch){const text=await fs.readFile(goalFile,'utf8'),end=text.indexOf('\n\n#');const state=JSON.parse(text.slice(0,end));patch(state);state.revision++;await fs.writeFile(goalFile+'.fault',JSON.stringify(state,null,2)+text.slice(end));await fs.rename(goalFile+'.fault',goalFile);await fs.rm(path.join(cwd,'.pi','.goals-pool-snapshot.json'),{force:true});}
  await loader.reload();created=await createAgentSession({cwd,agentDir,modelRuntime:runtime,model,settingsManager:piSettings,resourceLoader:loader,sessionManager:SessionManager.open(sessionFile),noTools:'builtin',customTools:[read]});await created.session.bindExtensions({});
 };
 return{cwd,get core(){return core;},get session(){return created.session;},manager,requests,controller,read,ctx,audited,restart,stats:()=>({reads,usage}),deny:()=>{allowed=false;},setUnknown:()=>{unknown=true;}};
}
async function waitFor(check){const start=Date.now();while(!check()){if(Date.now()-start>10_000)throw Error('Fixture timed out');await new Promise(resolve=>setTimeout(resolve,15));}}
await test('published headless proposal policy auto-confirms; unsafe default is recorded',async t=>{
 assert.equal(shouldAutoConfirmProposal({hasUI:false}),true);assert.equal(shouldAutoConfirmProposal({hasUI:true}),false);
 const f=await fixture(t,'policy');assert.equal(loadGoalSettings(f.cwd).maxAutonomousRuns,0);
 await fs.writeFile(process.env.PI_GOAL_SETTINGS_FILE,'{}');invalidateGoalSettingsCache();assert.equal(loadGoalSettings(f.cwd).maxAutonomousRuns,undefined);
 evidence.push({case:'nonUI/default',hasUI:false,autoConfirm:true,unconfiguredMaxRuns:'unlimited'});
});
await test('real extension pause/resume preserves goal identity, objective and on-disk record',async t=>{
 const f=await fixture(t,'pause');await f.session.prompt('/goal-direct preserve partial result');const id=f.core.state.goal.id,pathBefore=f.core.state.goal.activePath;
 await f.session.prompt('/goal-pause');assert.equal(f.core.state.goal.status,'paused');
 await f.session.prompt('/goal-resume');assert.equal(f.core.state.goal.id,id);assert.equal(f.core.state.goal.objective,'preserve partial result');
 await f.session.prompt('/goal-pause');assert.equal(f.core.state.goal.activePath,pathBefore);assert.match(await fs.readFile(path.join(f.cwd,pathBefore),'utf8'),/preserve partial result/);assert.equal(f.requests.length,0);
 evidence.push({case:'pause/resume',id,requests:0,recordPreserved:true});
});
await test('native autonomous scheduler starts two bounded runs and persists exhaustion',async t=>{
 const f=await fixture(t,'bounded',{maxAutonomousRuns:2,disabled:true},(_payload,res,index)=>{index%2===0?reply(res,'progress, more remains'):reply(res,null,{name:'read_file',args:{path:'evidence.md'}});});
 await f.session.prompt('/goal-direct read evidence twice');await waitFor(()=>f.core.state.goal?.status==='paused');
 assert.equal(f.core.state.goal.scheduler.used,2);assert.equal(f.stats().reads,2);assert.equal(f.requests.length,4);assert.match(f.core.state.goal.pauseReason,/allowance exhausted/);
 evidence.push({case:'autonomous allowance',used:2,requests:4,reads:2,status:f.core.state.goal.status});
});
await test('persisted interrupted dispatch is recovered paused without replay; explicit resume retains original goal',async t=>{
 const f=await fixture(t,'restore',{maxAutonomousRuns:0});await f.session.prompt('/goal-direct retain partial draft');await f.session.prompt('persist this fixture checkpoint');const id=f.core.state.goal.id;
 await f.restart(state=>{state.status='active';state.autoContinue=true;state.scheduler.used=1;state.scheduler.phase='claimed';state.scheduler.dispatch={id:'saved-dispatch',kind:'kickoff',claimedAt:Date.now()};state.scheduler.decision={kind:'ready',purpose:'kickoff'};});
 assert.equal(f.core.state.goal.id,id);assert.equal(f.core.state.goal.status,'paused');assert.match(f.core.state.goal.pauseReason,/interrupted/);assert.equal(f.core.state.goal.scheduler.used,1);assert.equal(f.requests.length,1);
 await f.session.prompt('/goal-resume');assert.equal(f.core.state.goal.id,id);assert.equal(f.requests.length,1);
 evidence.push({case:'persisted interrupted restore',goalPreserved:true,requestsBefore:1,requestsAfter:1,replayedDispatch:false,faultMethod:'on-disk claimed dispatch fixture'});
});
await test('native completion flow calls controlled auditor and archives approved goal',async t=>{
 const f=await fixture(t,'complete',{maxAutonomousRuns:1},(_payload,res,index)=>index===1?reply(res,null,{name:'update_goal',args:{status:'complete',completion_summary:'all fixture requirements checked'}}):reply(res,'Fixture completion approved\n<approved/>'));
 await f.session.prompt('/goal-direct completed fixture');await waitFor(()=>f.core.state.goal?.status==='complete'||f.core.state.goal===null);
 assert.equal(f.requests.length,2);assert.ok(f.stats().usage>0);const all=await fs.readdir(path.join(f.cwd,'.pi','goals'));assert.ok(all.some(name=>name.startsWith('archive'))||f.core.state.goal?.status==='complete');
 evidence.push({case:'completion flow',requests:2,auditorUsageCharged:true});
});
await test('real auditor uses only parent gateway tools; native verdict and actual usage retained',async t=>{
 const f=await fixture(t,'audit',{},(payload,res)=>payload.messages.some(m=>m.role==='tool')?reply(res,'Evidence checked\n<approved/>'):reply(res,null,{name:'read_file',args:{path:'evidence.md'}}));
 const goal=createGoal({objective:'check evidence',autoContinue:false,sisyphus:false});const result=await f.audited({ctx:f.ctx,goal,detailedSummary:'evidence',settings:{auditorProjectResources:true}});
 assert.equal(result.approved,true);assert.equal(f.stats().reads,1);assert.equal(f.stats().usage,50);assert.deepEqual(f.requests[0].tools.map(t=>t.function.name),['read_file']);assert.doesNotMatch(JSON.stringify(f.requests),/FORBIDDEN-EVIDENCE|FOREIGN-CONTEXT/);
 evidence.push({case:'controlled auditor',approved:result.approved,tools:['read_file'],usage:50});
});
await test('revocation and unknown external write stop audit before any request',async t=>{
 const f=await fixture(t,'revoked');f.deny();const goal=createGoal({objective:'x',autoContinue:false,sisyphus:false});assert.match((await f.audited({ctx:f.ctx,goal,detailedSummary:'x'})).error,/PERMISSION_DENIED/);assert.equal(f.requests.length,0);
 const g=await fixture(t,'unknown');g.setUnknown();assert.match((await g.audited({ctx:g.ctx,goal,detailedSummary:'x'})).error,/SIDE_EFFECT_UNKNOWN/);assert.equal(g.requests.length,0);
 evidence.push({case:'revocation/unknown',requests:0,replay:false});
});
await test('cancelled native auditor request cannot accept completion or issue later reads',async t=>{
 let entered;const began=new Promise(resolve=>{entered=resolve;});const f=await fixture(t,'cancel',{},(_payload,res)=>{res.writeHead(200,{'content-type':'text/event-stream'});res.flushHeaders();entered();});
 const goal=createGoal({objective:'x',autoContinue:false,sisyphus:false});const pending=f.audited({ctx:f.ctx,goal,detailedSummary:'x'});await began;f.controller.abort();const result=await pending;assert.equal(result.approved,false);assert.match(result.error,/CANCELLED/);assert.equal(f.requests.length,1);assert.equal(f.stats().reads,0);
 evidence.push({case:'cancel audit',requests:1,approved:false});
});
await fs.writeFile(path.join(root,'evidence.json'),JSON.stringify({package:'pi-goal-x@0.32.3',pi:'0.86.1',realProviderCalls:0,method:'real published extension + Pi SDK + local protocol responses',evidence},null,2));
