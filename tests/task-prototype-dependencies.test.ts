import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../main/store.js';
import {Service} from '../main/service.js';
import {isPrototypeSnapshotPath} from '../shared/prototype-acceptance.js';
import type {RuntimeOptions,RuntimeHandle} from '../main/agent.js';
import type {TaskAcceptanceReport} from '../shared/task-acceptance.js';

test('preview dependency format policy excludes documents and preserves supported web assets',()=>{
 for(const name of ['index.htm','INDEX.HTML','assets/app.css','app.js','app.mjs','data.json','a.svg','a.jpg','a.jpeg','a.png','a.gif','a.webp','a.woff','a.woff2','a.ttf','a.ico'])assert.equal(isPrototypeSnapshotPath(name),true,name);
 for(const name of ['PRD.md','约束对照.md','rules.docx','script.ps1','app.css.md','README','data.csv','archive.zip'])assert.equal(isPrototypeSnapshotPath(name),false,name);
 assert.equal(isPrototypeSnapshotPath('../external.js'),true,'format selection does not replace the independent scope guard');
});

test('real Service checks mixed HTML+Markdown drafts using only preview assets; version and base conflicts still reject',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-mixed-prototype-')),store=new Store(path.join(dir,'profile'));
 let target!:{mountId:string;path:string},observed!:TaskAcceptanceReport,manifest:string[]=[],guards=false;
 const service=new Service(store,()=> 'fixture-key',()=>{},async(options:RuntimeOptions)=>({messages:[{role:'assistant',stopReason:'stop'}],abort:async()=>{},dispose:()=>{},prompt:async()=>{
  for(const item of [{path:target.path,content:'<!doctype html><html><head><title>隔离页面</title><link rel="stylesheet" href="assets/app.css"></head><body>草稿页面</body></html>'},{path:'prototype/PRD.md',content:'# 需求草稿\n\n页面规则仍待核对。'},{path:'prototype/约束对照.md',content:'# 约束对照\n\n来源说明待确认。'},{path:'prototype/assets/app.css',content:'body{color:#456}'}])await options.log('write_draft',item,async()=>{const ref={mountId:target.mountId,path:item.path};await options.beforeArtifactWrite!(ref);const change=await options.files.draft(ref.mountId,ref.path,item.content,options.runId!);options.draft!(change);});
  const view=(await options.getTaskAcceptance!())!,html=view.contract.outputs.find(o=>o.kind==='html')!,prototypeTarget=(service as any).taskPrototypeTarget(options.runId,html.target);
  assert.equal(view.contract.outputs.length,4,'documents remain separately checked task outputs');
  assert.equal(prototypeTarget.draft.dependencies.length,1,'only the CSS draft belongs to the preview dependency set');
  const domain=(service as any).prototypes(),snapshot=await domain.snapshotForTask(prototypeTarget,{mode:'build',runId:options.runId});manifest=snapshot.manifest.map((d:any)=>d.path);assert.deepEqual(manifest,['index.html','assets/app.css']);
  observed=await options.checkTaskAcceptance!();assert.ok(observed.results.filter(r=>r.criterionId.startsWith('host:static:')).every(r=>r.status==='passed'));
  const css=service.state.changes.find(c=>c.path==='prototype/assets/app.css')!,original=css.content;css.content+='\n/* changed */';await assert.rejects(domain.snapshotForTask(prototypeTarget,{mode:'build',runId:options.runId}),/PROTOTYPE_DRAFT_CHANGED/);css.content=original;
  const formal=path.join(service.state.mounts.find(m=>m.name==='成果')!.path,css.path);await fs.mkdir(path.dirname(formal),{recursive:true});await fs.writeFile(formal,'external base');await assert.rejects(domain.snapshotForTask(prototypeTarget,{mode:'build',runId:options.runId}),/PROTOTYPE_DRAFT_BASE_CHANGED/);await fs.unlink(formal);guards=true;
  options.delta('保留未保存草稿和独立文档检查。');
 }} as unknown as RuntimeHandle));
 t.after(async()=>{service.dispose();await Promise.allSettled([...(service as any).agentIndex.queues.values()]);await new Promise(r=>setTimeout(r,30));store.close();await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:30});});
 await service.workspace(path.join(dir,'project'));service.setPermission('workspace_read','allow');service.setPermission('artifact_write','allow');target={mountId:service.state.mounts.find(m=>m.name==='成果')!.id,path:'prototype/index.html'};
 const runId=await service.send(service.conversation(),'建立页面、需求及约束对照草稿。','build','standard');let run=service.state.runs.find(r=>r.id===runId)!;for(let n=0;n<500&&!run.finishedAt;n++){await new Promise(r=>setTimeout(r,10));run=service.state.runs.find(r=>r.id===runId)!;}
 assert.equal(run.status,'succeeded',run.error);assert.equal(guards,true);assert.equal(manifest.length,2);assert.ok(observed.results.every(r=>!r.reason?.includes('TASK_ACCEPTANCE_TARGET_CHANGED')));
 const rendering=observed.results.find(r=>r.criterionId.startsWith('host:render:'))!;assert.equal(rendering.status,'unverified','a missing real browser cannot produce a passed DOM assertion');assert.ok(rendering.evidence[0].prototype!.entryHash);
 for(const change of service.state.changes.filter(c=>c.runId===runId)){assert.equal(change.status,'pending');await assert.rejects(fs.stat(path.join(service.state.mounts.find(m=>m.id===change.mountId)!.path,change.path)),/ENOENT/);}
});
