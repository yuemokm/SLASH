import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Service} from '../main/service.js';
import {Store} from '../main/store.js';
import {installQualityDraftFault} from '../scripts/quality-draft-fault.mjs';
const hash=(s:string|Buffer)=>createHash('sha256').update(s).digest('hex');
const root=path.resolve('.test-data');

async function fixture(t:test.TestContext,padding=0,targetPath='index.html',draftPath=targetPath){
 const temp=await fs.mkdtemp(path.join(root,'quality-fault-fixture-')),caseDir=path.join(temp,'cases','QE16'),profile=path.join(caseDir,'profile'),workspace=path.join(caseDir,'workspace');await fs.mkdir(workspace,{recursive:true});
 const store=new Store(profile),stats={checks:0,observed:[] as string[]};let prototype:any;
 class FixtureService extends Service{
  // Explicit local checker/prototype evidence fixtures. No browser/model pass claim.
  async checkTaskAcceptance(runId:string){stats.checks++;stats.observed.push(this.state.changes.find(c=>c.runId===runId&&c.status==='pending')?.content??'');return{fixture:true,status:'unknown'} as never;}
  async getPrototypeAcceptance(){return prototype;}
 }
 const service=new FixtureService(store,()=>'',()=>{},async()=>{throw Error('No model calls in fault fixture');});
 let handle:any;t.after(async()=>{handle?.dispose();service.dispose();await Promise.allSettled([...(service as any).agentIndex.queues.values()]);store.close();await fs.rm(temp,{recursive:true,force:true,maxRetries:5,retryDelay:30});});
 await service.workspace(workspace);service.setPermission('workspace_read','allow');service.setPermission('artifact_write','allow');const mount=service.state.mounts.find(m=>m.name==='成果')!;assert.ok(mount,JSON.stringify(service.state.mounts.map(m=>m.name)));
 const oldText='<input id="code" readonly value="JHWD0000000001">',newText='<input id="code" value="JHWD0000000001">',formal='<!doctype html><html><head><link rel="stylesheet" href="style.css"></head><body>'+oldText+'</body></html>',content=formal+'\n<!-- explicit local user-change fixture '+ 'x'.repeat(padding)+' -->';
 const entryPath=path.join(mount.path,targetPath),stylePath=path.join(path.dirname(entryPath),'style.css');await fs.mkdir(path.dirname(entryPath),{recursive:true});await fs.writeFile(entryPath,formal);await fs.writeFile(stylePath,'body{color:#123}');
 const run:any={id:'fixture-run',conversationId:service.conversation(),input:'本地模拟用户修改：保留编码只读',mode:'build',permissionMode:'standard',status:'validating',phase:'validating',startedAt:new Date().toISOString(),generationFinishedAt:new Date().toISOString(),acceptance:{repairRounds:0}};service.state.runs.push(run);(service as any).runControllers.set(run.id,new AbortController());
 const change=await service.files.draft(mount.id,draftPath,content,run.id);service.state.changes.unshift(change);(service as any).beginTaskAcceptance(run);(service as any).registerTaskChange(run.id,change);
 const cases=[{id:'code-readonly',title:'local fixture: code readonly',steps:[{action:'assert',assertion:'readonly',selector:'#code',expected:true}]}],spec={id:'fixture-spec',revision:1,specHash:'a'.repeat(64),required:true,cases,sourceRefs:[]};
 prototype={spec,needsConfirmation:false,latestReport:{reportId:'fixture-report',versionState:'current',evidence:{status:'passed',specHash:spec.specHash,entryHash:hash(formal),manifest:[{path:'index.html',hash:hash(formal)},{path:'style.css',hash:hash('body{color:#123}')}]}}};
 const domain=(service as any).taskDomain(run.id),output=domain.getContract(run.id).outputs.find((o:any)=>o.target.changeId===change.id);domain.freezeBaseline(run.id,{id:'fixture-baseline',outputId:output.id,target:output.target,origin:'previous_verified',cases,specId:spec.id,specRevision:1,specHash:spec.specHash});
 const scope={testRoot:root,caseDir,profile,workspace,runId:run.id,mountId:mount.id,path:targetPath,deadlineAt:Date.now()+60000},domPath=path.join(caseDir,'reviewed-dom.json'),planPath=path.join(caseDir,'reviewed-plan.json');
 const dom:any={schemaVersion:1,observer:'host_browser_dom',fixture:true,notice:'Synthetic DOM evidence for offline gate tests, not a real browser receipt.',artifactHash:hash(content),target:{source:'pending',runId:run.id,mountId:mount.id,path:targetPath,changeId:change.id},node:{selector:'#code',count:1,tag:'input',readonly:true,sourceStartTag:oldText,sourceOffset:content.indexOf(oldText)}};
 const plan:any={schemaVersion:1,identity:'host_fault_injection',reviewedBy:'offline fixture author, not human confirmation',humanConfirmed:false,runId:run.id,mountId:mount.id,path:targetPath,changeId:change.id,expectedContentHash:hash(content),expectedFaultHash:hash(content.replace(oldText,newText)),requiredSpec:{id:spec.id,revision:spec.revision,specHash:spec.specHash,reportId:'fixture-report'},domReceipt:{path:domPath,sha256:''},protectedFiles:[{path:stylePath,sha256:hash('body{color:#123}')}],fault:{kind:'remove_readonly',selector:'#code',oldText,newText,attributeStart:oldText.indexOf(' readonly'),attributeEnd:oldText.indexOf(' readonly')+' readonly'.length}};
 const write=async()=>{const domBytes=JSON.stringify(dom);await fs.writeFile(domPath,domBytes);plan.domReceipt.sha256=hash(domBytes);const bytes=JSON.stringify(plan);await fs.writeFile(planPath,bytes);return{path:planPath,sha256:hash(bytes)};};
 const install=async(options:any={})=>{handle=await installQualityDraftFault({ServicePrototype:FixtureService.prototype,scope,planFile:await write(),...options});return handle;};
 return{service,stats,scope,plan,dom,change,run,prototype,formal,content,mount,oldText,newText,entryPath,stylePath,write,install};
}

test('isolated real Service read/edit APIs inject once into pending draft; formal/dependency bytes unchanged',async t=>{
 const f=await fixture(t,17000),h=await f.install();await f.service.checkTaskAcceptance(f.run.id);await f.service.checkTaskAcceptance(f.run.id);
 const receipt=h.getReceipt();assert.equal(receipt.status,'injected');assert.equal(receipt.identity,'host_fault_injection');assert.equal(receipt.humanConfirmed,false);assert.equal(receipt.afterHash,f.plan.expectedFaultHash);assert.equal(receipt.beforeHash,hash(f.content));assert.equal(f.change.id,receipt.changeId);assert.equal(f.stats.checks,2);assert.ok(f.stats.observed.every(s=>s.includes(f.newText)&&!s.includes(f.oldText)));assert.equal(await fs.readFile(path.join(f.mount.path,'index.html'),'utf8'),f.formal);assert.equal(hash(await fs.readFile(path.join(f.mount.path,'style.css'))),f.plan.protectedFiles[0].sha256);assert.equal(receipt.formalUnchanged,true);assert.equal(f.service.store.operationsForRun(f.run.id).filter(o=>o.tool==='edit_draft_diff').length,1);assert.equal((await h.finish()).status,'injected');
});

test('prior formal DOM receipt is rejected even when its node matches the pending HTML',async t=>{
 const f=await fixture(t);f.dom.artifactHash=hash(f.formal);const h=await f.install();await f.service.checkTaskAcceptance(f.run.id);assert.equal(h.getReceipt().status,'not_executed');assert.equal(h.getReceipt().reason,'QUALITY_FAULT_DOM_UNBOUND');assert.equal(f.change.content,f.content);assert.equal(f.stats.checks,1);
});

test('Windows mixed separators bind the real Service pending target without editing formal bytes', {skip:process.platform!=='win32'},async t=>{
 const f=await fixture(t,0,'QE16/index.html','QE16\\index.html');
 const note=await f.service.files.draft(f.mount.id,'QE16\\修改说明.md','Synthetic pending new document',f.run.id);f.service.state.changes.push(note);
 const other=[{...f.change,id:'different-mount',mountId:'not-authorized'}, {...f.change,id:'different-run',runId:'other-run'}, {...f.change,id:'different-directory',path:'other\\index.html'}];f.service.state.changes.push(...other);
 const h=await f.install();await f.service.checkTaskAcceptance(f.run.id);assert.equal(h.getReceipt().status,'injected');assert.equal(h.getReceipt().changeId,f.change.id);assert.equal(h.getReceipt().afterHash,f.plan.expectedFaultHash);assert.equal(await fs.readFile(f.entryPath,'utf8'),f.formal);assert.equal(hash(await fs.readFile(f.stylePath)),f.plan.protectedFiles[0].sha256);assert.ok(other.every(c=>c.content===f.content));assert.equal(note.content,'Synthetic pending new document');assert.equal(f.service.store.operationsForRun(f.run.id).filter(o=>o.tool==='edit_draft_diff').length,1);
});
test('Windows slash aliases are still two pending cards and fail uniqueness', {skip:process.platform!=='win32'},async t=>{
 const f=await fixture(t,0,'QE16/index.html','QE16\\index.html');f.service.state.changes.push({...f.change,id:'duplicate-alias',path:'QE16/index.html'});
 const h=await f.install();await f.service.checkTaskAcceptance(f.run.id);assert.equal(h.getReceipt().status,'not_executed');assert.equal(h.getReceipt().reason,'QUALITY_FAULT_PENDING_NOT_UNIQUE');assert.equal(f.change.content,f.content);assert.equal(await fs.readFile(f.entryPath,'utf8'),f.formal);
});
test('Windows target matching does not admit traversal, absolute or escaping junction paths', {skip:process.platform!=='win32'},async t=>{
 for(const scenario of ['traversal','absolute','junction'])await t.test(scenario,async t=>{
  const f=await fixture(t,0,'QE16/index.html','QE16\\index.html');let invalid=scenario==='absolute'?f.entryPath:'..\\outside.html';
  if(scenario==='junction'){const outside=path.join(f.scope.caseDir,'outside');await fs.mkdir(outside);await fs.writeFile(path.join(outside,'index.html'),'protected outside fixture');await fs.symlink(outside,path.join(f.mount.path,'escape'),'junction');invalid='escape\\index.html';}
  f.service.state.changes.push({...f.change,id:'invalid-scope-candidate',path:invalid});const h=await f.install();await f.service.checkTaskAcceptance(f.run.id);assert.equal(h.getReceipt().status,'not_executed');assert.equal(h.getReceipt().editAttempted,false);assert.equal(f.change.content,f.content);assert.equal(await fs.readFile(f.entryPath,'utf8'),f.formal);assert.equal(f.service.store.operationsForRun(f.run.id).filter(o=>o.tool==='edit_draft_diff').length,0);
 });
});

test('bad pending hash, duplicate node, absent required spec, missing dependency and arbitrary edits fail closed',async t=>{
 for(const scenario of ['hash','node','spec','dependency','edit'])await t.test(scenario,async t=>{
  const f=await fixture(t);if(scenario==='hash')f.plan.expectedContentHash='0'.repeat(64);if(scenario==='node')f.dom.node.count=2;if(scenario==='spec')f.prototype.spec.required=false;if(scenario==='dependency')f.plan.protectedFiles=[];if(scenario==='edit')f.plan.fault.newText='<input id="code" value="changed-business-value">';const h=await f.install();await f.service.checkTaskAcceptance(f.run.id);assert.equal(h.getReceipt().status,'not_executed');assert.equal(f.change.content,f.content);assert.equal(f.stats.checks,1);
 });
});

test('phase/repair gate never injects; reviewed plan waiting shares cancellation and deadline',async t=>{
 await t.test('already repairing',async t=>{const f=await fixture(t);f.run.acceptance.repairRounds=1;const h=await f.install();await f.service.checkTaskAcceptance(f.run.id);assert.equal((await h.finish()).status,'not_executed');assert.equal(f.change.content,f.content);});
 await t.test('cancelled plan wait',async t=>{const f=await fixture(t),controller=(f.service as any).runControllers.get(f.run.id),h=await f.install({planFile:undefined,preparePlan:async({signal}:any)=>{setTimeout(()=>controller.abort(),10);await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));return undefined;}});await f.service.checkTaskAcceptance(f.run.id);assert.equal(h.getReceipt().status,'not_executed');assert.equal(h.getReceipt().reason,'QUALITY_FAULT_CANCELLED');assert.equal(f.change.content,f.content);});
 await t.test('expired original deadline',async t=>{const f=await fixture(t);f.scope.deadlineAt=Date.now()-1;const h=await f.install();await f.service.checkTaskAcceptance(f.run.id);assert.equal(h.getReceipt().status,'not_executed');assert.equal(h.getReceipt().reason,'QUALITY_FAULT_RUN_NOT_CURRENT');assert.equal(f.change.content,f.content);});
 await t.test('wrong Run never arms',async t=>{const f=await fixture(t),h=await f.install();await f.service.checkTaskAcceptance('other-run');assert.equal((await h.finish()).reason,'QUALITY_FAULT_NO_MATCHING_VALIDATION');assert.equal(f.change.content,f.content);});
});
