import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Service} from '../main/service.js';
import {Store} from '../main/store.js';
import {requestSchema} from '../shared/types.js';

async function fixture(t:test.TestContext){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-project-actions-'));const store=new Store(path.join(dir,'data'));t.after(async()=>{store.close();await fs.rm(dir,{recursive:true,force:true});});const service=new Service(store,()=>'',()=>{});await service.workspace(path.join(dir,'one'));return{dir,store,service};}

test('项目改名仅改显示名，置顶顺序与名称重启/切换后保存',async t=>{
 const {dir,store,service}=await fixture(t);const first=service.listProjects().currentProjectId!;const root=service.state.root;service.conversation(undefined,'旧会话');
 service.renameProject(first,'审批产品');service.pinProject(first,true);await service.workspace(path.join(dir,'two'));
 assert.equal(service.listProjects().projects[0].id,first);assert.equal(service.listProjects().projects[0].name,'审批产品');assert.equal(service.projectRoot(first),root);
 const restored=new Service(store,()=>'',()=>{});assert.equal(restored.listProjects().projects[0].id,first);assert.equal(restored.listProjects().projects[0].pinned,true);await restored.project({id:first});assert.equal(restored.listProjects().projects.find(item=>item.id===first)?.name,'审批产品');assert.equal(restored.state.conversations[0].title,'旧会话');
 assert.throws(()=>service.renameProject(first,' \n '),/VALIDATION_FAILED/);assert.throws(()=>service.pinProject('missing',true),/PROJECT_NOT_FOUND/);
});

test('删除当前默认项目只隐藏登记，切换后本地文件/会话/版本保留并可重开恢复',async t=>{
 const {dir,store,service}=await fixture(t);const first=service.listProjects().currentProjectId!;const root=service.state.root;const conversation=service.conversation(undefined,'保留会话');service.renameProject(first,'可恢复项目');service.pinProject(first,true);
 await fs.writeFile(path.join(root,'keep.txt'),'用户文件');await fs.mkdir(path.join(store.dir,'versions'),{recursive:true});await fs.writeFile(path.join(store.dir,'versions','snapshot.txt'),'历史版本');
 await service.workspace(path.join(dir,'two'));const second=service.listProjects().currentProjectId!;await service.setDefaultProject({id:first});const next=await service.removeProject(first);
 assert.equal(next.currentProjectId,second);assert.equal(next.defaultProjectId,second);assert.equal(next.projects.some(item=>item.id===first),false);assert.equal(await fs.readFile(path.join(root,'keep.txt'),'utf8'),'用户文件');assert.equal(await fs.readFile(path.join(store.dir,'versions','snapshot.txt'),'utf8'),'历史版本');
 assert.throws(()=>service.projectRoot(first),/PROJECT_NOT_FOUND/);await assert.rejects(service.project({id:first}),/项目不存在/);
 await service.project({path:root});assert.equal(service.state.conversations[0].id,conversation);const reopened=service.listProjects().projects.find(item=>item.id===first)!;assert.equal(reopened.name,'可恢复项目');assert.equal(reopened.pinned,true);assert.equal(reopened.removedAt,undefined);
});

test('最后一个项目删除后进入不同默认目录，重启不重新登记被删路径',async t=>{
 const {store,service}=await fixture(t);await service.workspace(path.join(store.dir,'默认项目'));const all=service.listProjects();const previous=all.projects.find(item=>!item.current)!;await service.removeProject(previous.id);const root=service.state.root;const id=service.listProjects().currentProjectId!;
 const next=await service.removeProject(id);assert.notEqual(next.currentProjectId,id);assert.notEqual(service.state.root,root);assert.equal(next.projects.some(item=>item.id===id),false);
 const restored=new Service(store,()=>'',()=>{});await restored.initializeDefaultProject();assert.notEqual(restored.state.root,root);assert.equal(restored.listProjects().projects.some(item=>item.id===id),false);assert.ok((await fs.stat(root)).isDirectory());
});

test('运行中与校验中项目不能删除，UI计数真实反映保护状态',async t=>{
 const {service}=await fixture(t);const id=service.listProjects().currentProjectId!;
 for(const status of ['queued','running','waiting_user','cancelling','validating']){
  service.state.runs=[{id:'active',conversationId:'conversation',status,startedAt:new Date().toISOString()}];assert.equal(service.listProjects().projects[0].activeRunCount,1);await assert.rejects(service.removeProject(id),/PROJECT_BUSY/);assert.equal(service.listProjects().currentProjectId,id);
 }
 service.state.runs=[];assert.equal(service.listProjects().projects[0].activeRunCount,0);
 assert.equal(requestSchema.parse({type:'projectRename',id,name:'新名称'}).type,'projectRename');assert.equal(requestSchema.parse({type:'projectPin',id,pinned:true}).type,'projectPin');assert.throws(()=>requestSchema.parse({type:'projectRename',id,name:'\n'}));
});
