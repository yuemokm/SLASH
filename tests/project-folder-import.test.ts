import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {Store} from '../main/store.js';
import {Service} from '../main/service.js';
import {requestSchema} from '../shared/types.js';

async function fixture(t:test.TestContext){
 await fs.mkdir('.test-data',{recursive:true});const dir=await fs.mkdtemp(path.resolve('.test-data/folder-import-')),store=new Store(path.join(dir,'profile')),service=new Service(store,()=>'',()=>{});
 t.after(async()=>{store.close();await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});});
 const a=path.join(dir,'甲'),b=path.join(dir,'乙');await service.workspace(a);const aId=service.listProjects().currentProjectId!;await service.workspace(b);const bId=service.listProjects().currentProjectId!;service.conversation(undefined,'保留乙会话');
 const catalog=service.projectCatalog(),aMount=catalog.list().projects.find(item=>item.id===aId)!.mounts.find(item=>item.name==='资源')!,bMount=service.state.mounts.find(item=>item.name==='资源')!;
 const source=path.join(dir,'brief.md');await fs.writeFile(source,'原件');return{dir,store,service,catalog,a,b,aId,bId,aMount,bMount,source};
}

test('显式跨项目拖入根和子目录，保留原件/重名副本/当前会话，不被当前项目目录冒用',async t=>{
 const {service,store,catalog,a,b,aId,aMount,bMount,source}=await fixture(t),before=JSON.stringify(service.state),registry=JSON.stringify(store.get('projects:v1',{}));
 const target={projectId:aId,mountId:aMount.id,path:'参考资料'};
 const first=await service.importFiles([source,source],'resource',target);assert.equal(first.length,1);assert.equal(first[0].path,path.join('参考资料','brief.md'));
 const second=await service.importFiles([source],'resource',target);assert.equal(second[0].path,path.join('参考资料','brief (1).md'));
 const root=await service.importFiles([source],'resource',{...target,path:''});assert.equal(root[0].path,'brief.md');
 assert.equal(await fs.readFile(source,'utf8'),'原件');assert.equal(await fs.readFile(path.join(a,'资源','参考资料','brief.md'),'utf8'),'原件');assert.equal(await fs.readFile(path.join(a,'资源','参考资料','brief (1).md'),'utf8'),'原件');
 await assert.rejects(fs.stat(path.join(b,'资源','参考资料','brief.md')),/ENOENT/);assert.equal(JSON.stringify(service.state),before);assert.equal(JSON.stringify(store.get('projects:v1',{})),registry);
 await assert.rejects(service.importFiles([source],'resource',{...target,mountId:bMount.id}),/MOUNT_ID_UNKNOWN/);
 assert.equal(await catalog.resolveDirectory(aId,aMount.id,'参考资料'),await fs.realpath(path.join(a,'资源','参考资料')));
 await assert.rejects(catalog.resolveDirectory(aId,aMount.id,'参考资料/brief.md'),/DIRECTORY_REQUIRED/);
});

test('拖入目录消失、只读、链接、越界、deny与项目移除均拒绝且不重建目录',async t=>{
 const {service,store,catalog,a,aId,aMount,source,dir}=await fixture(t),target={projectId:aId,mountId:aMount.id,path:'已删除'};
 await fs.mkdir(path.join(a,'资源','已删除'));await fs.rmdir(path.join(a,'资源','已删除'));
 await assert.rejects(service.importFiles([source],'resource',target),/ENOENT/);await assert.rejects(fs.stat(path.join(a,'资源','已删除')),/ENOENT/);
 await assert.rejects(service.importFiles([source],'resource',{...target,path:'../../'}),/PERMISSION_DENIED/);
 const outside=path.join(dir,'outside');await fs.mkdir(outside);await fs.symlink(outside,path.join(a,'资源','link'),'junction');await assert.rejects(service.importFiles([source],'resource',{...target,path:'link'}),/PERMISSION_DENIED|SYMLINK/);assert.deepEqual(await fs.readdir(outside),[]);
 const row=store.db.prepare("SELECT key FROM kv WHERE key LIKE 'workspace-state:%'").all().find(row=>store.get<{root:string}>(String(row.key),{root:''}).root===a)!;
 const partition=store.get<{mounts:typeof service.state.mounts}>(String(row.key),{mounts:[]});partition.mounts.find(item=>item.id===aMount.id)!.write=false;store.set(String(row.key),partition);
 await assert.rejects(service.importFiles([source],'resource',{...target,path:''}),/PERMISSION_DENIED/);partition.mounts.find(item=>item.id===aMount.id)!.write=true;store.set(String(row.key),partition);
 service.state.permissions={...service.state.permissions,workspace_read:'deny'};await assert.rejects(service.importFiles([source],'resource',{...target,path:''}),/PERMISSION_DENIED/);service.state.permissions={...service.state.permissions,workspace_read:'allow'};
 const registry=store.get<{projects:Array<{id:string;removedAt?:string}>}>('projects:v1',{projects:[]});registry.projects.find(item=>item.id===aId)!.removedAt=new Date().toISOString();store.set('projects:v1',registry);
 await assert.rejects(catalog.resolveDirectory(aId,aMount.id,''),/PROJECT_NOT_FOUND/);await assert.rejects(service.importFiles([source],'resource',{...target,path:''}),/PROJECT_NOT_FOUND/);assert.equal(await fs.readFile(source,'utf8'),'原件');
});

test('文件夹打开和导入IPC绑定项目身份且拒绝任意未知字段',()=>{
 assert.equal(requestSchema.parse({type:'projectOpenDirectory',projectId:'p',mountId:'m'}).type,'projectOpenDirectory');
 assert.throws(()=>requestSchema.parse({type:'projectOpenDirectory',mountId:'m'}));assert.throws(()=>requestSchema.parse({type:'projectOpenDirectory',projectId:'p',mountId:'m',root:'C:/'}));
 assert.equal(requestSchema.parse({type:'importFiles',files:['C:/brief.md'],target:{projectId:'p',mountId:'m',path:''}}).type,'importFiles');assert.throws(()=>requestSchema.parse({type:'importFiles',files:['C:/brief.md'],target:{projectId:'p',mountId:'m',path:'',write:true}}));
});
