import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Service} from '../main/service.js';
import {Store} from '../main/store.js';

test('Service 提交受共享成果写锁保护并在释放后继续',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pm-resource-lock-'));const store=new Store(path.join(dir,'data'));t.after(async()=>{store.close();await fs.rm(dir,{recursive:true,force:true});});
 const service=new Service(store,()=> 'test-key',()=>{});await service.workspace(path.join(dir,'workspace'));const mount=service.state.mounts.find(item=>item.name==='成果');assert.ok(mount);
 const change=await service.files.draft(mount.id,'locked.md','第一版','run-submit');service.state.changes.unshift(change);service.save();
 const lock=service.acquireShareLock({resourceId:mount.id,path:'locked.md'},'other-run','write',5000);
 await assert.rejects(service.apply(change.id),/LOCK_HELD/);assert.equal(change.status,'pending');assert.equal(await fs.readFile(path.join(mount.path,'locked.md'),'utf8').catch(()=>''),'');
 assert.equal(service.releaseShareLock(lock.id,'other-run'),true);await service.apply(change.id);assert.equal(change.status,'applied');assert.equal(service.listShareLocks().length,0);assert.equal(await fs.readFile(path.join(mount.path,'locked.md'),'utf8'),'第一版');
});

test('工作区规则提交使用根目录资源锁',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pm-rule-lock-'));const store=new Store(path.join(dir,'data'));t.after(async()=>{store.close();await fs.rm(dir,{recursive:true,force:true});});
 const root=path.join(dir,'workspace');const service=new Service(store,()=> 'test-key',()=>{});await service.workspace(root);await fs.writeFile(path.join(root,'AGENTS.md'),'# 产品工作规则\n显式创建的人工规则。\n');const snapshot=await service.readWorkspaceRulesForTool();
 const change=await service.draftWorkspaceRules('run-rules',snapshot.contentHash,'# 新规则\n锁保护\n');const lock=service.acquireShareLock({resourceId:root,path:'AGENTS.md'},'other-run','write',5000);
 await assert.rejects(service.applyWorkspaceRuleChange(change.id),/LOCK_HELD/);assert.equal(change.status,'pending');assert.match(await fs.readFile(path.join(root,'AGENTS.md'),'utf8'),/产品工作规则/);
 service.releaseShareLock(lock.id,'other-run');await service.applyWorkspaceRuleChange(change.id);assert.equal(service.listWorkspaceRuleChanges()[0]?.status,'applied');assert.match(await fs.readFile(path.join(root,'AGENTS.md'),'utf8'),/锁保护/);
});

test('模板迁移组在预检前锁定全部成果并报告锁冲突',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pm-migration-lock-'));const store=new Store(path.join(dir,'data'));t.after(async()=>{store.close();await fs.rm(dir,{recursive:true,force:true});});
 const service=new Service(store,()=> 'test-key',()=>{});await service.workspace(path.join(dir,'workspace'));const processMount=service.state.mounts.find(item=>item.name==='过程文件');const output=service.state.mounts.find(item=>item.name==='成果');assert.ok(processMount);assert.ok(output);
 const metadata={mountId:processMount.id,path:'templates/registry.json'};const registered=await service.templateRegister('run-register',{metadata,template:{id:'lock-template',version:'1',title:'锁模板',sections:[{id:'overview',title:'产品概述',level:1,required:true}]}});await service.apply(registered.changeId);
 const original='# 旧概述 <!-- pm-section:overview -->\n正文\n';await fs.writeFile(path.join(output.path,'A.md'),original);const target={mountId:output.id,path:'A.md'};const preview=await service.templateMigrationPreview({metadata,templateId:'lock-template',templateVersion:'1',targets:[target]});const prepared=await service.templateMigrationDraft('run-migrate',preview.previewId,[target]);
 const group=service.listTemplateMigrationGroups().find(item=>item.id===prepared.groupId);assert.ok(group);const lock=service.acquireShareLock({resourceId:output.id,path:'A.md'},'other-run','write',5000);await assert.rejects(service.applyTemplateMigrationGroup(prepared.groupId),/LOCK_HELD/);assert.equal(service.listTemplateMigrationGroups().find(item=>item.id===prepared.groupId)?.status,'pending');assert.equal(await fs.readFile(path.join(output.path,'A.md'),'utf8'),original);
 service.releaseShareLock(lock.id,'other-run');const applied=await service.applyTemplateMigrationGroup(prepared.groupId);assert.equal(applied.status,'applied');
});
