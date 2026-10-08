import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {Store} from '../main/store.js';
import {Service} from '../main/service.js';
import {requestSchema} from '../shared/types.js';

async function fixture(t:test.TestContext){
 await fs.mkdir('.test-data',{recursive:true});const dir=await fs.mkdtemp(path.resolve('.test-data/project-catalog-'));
 const store=new Store(path.join(dir,'profile')),service=new Service(store,()=>'',()=>{});
 t.after(async()=>{store.close();await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});});
 const one=path.join(dir,'项目一'),two=path.join(dir,'项目二');
 await service.workspace(one);const oneId=service.listProjects().currentProjectId!;
 await fs.mkdir(path.join(one,'资源','skills','prd-package','references'),{recursive:true});
 await fs.mkdir(path.join(one,'资源','skills','empty-package'),{recursive:true});
 await fs.writeFile(path.join(one,'资源','skills','prd-package','SKILL.md'),'# skill');
 await fs.writeFile(path.join(one,'资源','skills','prd-package','README.md'),'# readme');
 await fs.writeFile(path.join(one,'资源','skills','prd-package','references','规则.md'),'rule');
 await fs.writeFile(path.join(one,'资源','参考资料','同名.md'),'项目一正文');
 await service.workspace(two);const twoId=service.listProjects().currentProjectId!;
 await fs.writeFile(path.join(two,'资源','参考资料','同名.md'),'项目二正文');
 service.conversation(undefined,'保持当前会话');
 return{dir,store,service,one,two,oneId,twoId};
}
test('总入口只读取登记项目元数据，跨项目分层读取不切换会话、不更新登记或创建文件',async t=>{
 const {store,service,oneId,twoId}=await fixture(t),catalog=service.projectCatalog();
 service.state.runs.push({id:'active',conversationId:service.state.conversations[0].id,status:'running',startedAt:new Date().toISOString()});
 const before=JSON.stringify(service.state),registry=JSON.stringify(store.get('projects:v1',{})),partition=store.db.prepare("SELECT key,value FROM kv WHERE key LIKE 'workspace-state:%'").all();
 const projects=catalog.list();assert.equal(projects.projects.length,2);assert.equal(projects.currentProjectId,twoId);
 const mount=projects.projects.find(item=>item.id===oneId)!.mounts.find(mount=>mount.name==='资源')!;
 const top=await catalog.browse(oneId,mount.id,'skills');
 assert.deepEqual(top.entries.map(entry=>[entry.name,entry.kind]),[['empty-package','directory'],['prd-package','directory']]);
 const packageEntries=await catalog.browse(oneId,mount.id,'skills/prd-package');assert.deepEqual(packageEntries.entries.map(entry=>entry.name).sort(),['README.md','SKILL.md','references'].sort());
 const nested=await catalog.browse(oneId,mount.id,'skills/prd-package/references');assert.equal(nested.entries[0].name,'规则.md');
 assert.deepEqual((await catalog.browse(oneId,mount.id,'skills/empty-package')).entries,[]);
 const read=await catalog.read(oneId,mount.id,'参考资料/同名.md');assert.equal(read.content,'项目一正文');assert.equal(read.projectId,oneId);assert.equal(read.projectName,'项目一');
 assert.equal(JSON.stringify(service.state),before);assert.equal(JSON.stringify(store.get('projects:v1',{})),registry);assert.deepEqual(store.db.prepare("SELECT key,value FROM kv WHERE key LIKE 'workspace-state:%'").all(),partition);
});
test('同名文件归属不同项目，目录授权按实际项目校验且撤权/移除立即拒绝',async t=>{
 const {store,service,oneId,twoId}=await fixture(t),catalog=service.projectCatalog(),projects=catalog.list().projects;
 const a=projects.find(item=>item.id===oneId)!.mounts.find(mount=>mount.name==='资源')!,b=projects.find(item=>item.id===twoId)!.mounts.find(mount=>mount.name==='资源')!;
 assert.equal((await catalog.read(twoId,b.id,'参考资料/同名.md')).content,'项目二正文');
 await assert.rejects(catalog.read(oneId,b.id,'参考资料/同名.md'),/PERMISSION_DENIED/);
 await assert.rejects(catalog.browse(oneId,a.id,'../../'),/PERMISSION_DENIED/);
 await assert.rejects(catalog.browse(oneId,a.id,'C:/Windows'),/INVALID_PATH/);
 const key=String(store.db.prepare("SELECT key FROM kv WHERE key LIKE 'workspace-state:%'").all().map(item=>item.key).find(key=>store.get<{root:string}>(String(key),{root:''}).root.endsWith('项目一')));
 const partition=store.get<{mounts:typeof projects[0]['mounts']}>(key,{mounts:[]});partition.mounts.find(mount=>mount.id===a.id)!.enabled=false;store.set(key,partition);
 await assert.rejects(catalog.read(oneId,a.id,'参考资料/同名.md'),/PERMISSION_DENIED/);
 const registry=store.get<{projects:Array<{id:string;removedAt?:string}>}>('projects:v1',{projects:[]});registry.projects.find(project=>project.id===oneId)!.removedAt=new Date().toISOString();store.set('projects:v1',registry);
 assert.equal(catalog.list().projects.some(project=>project.id===oneId),false);await assert.rejects(catalog.browse(oneId,a.id,''),/PROJECT_NOT_FOUND/);
});
test('目录链接不列出且不能越过所属项目已授权挂载边界',async t=>{
 const {service,dir,one,oneId}=await fixture(t),catalog=service.projectCatalog(),mount=catalog.list().projects.find(item=>item.id===oneId)!.mounts.find(mount=>mount.name==='资源')!;
 const outside=path.join(dir,'未授权');await fs.mkdir(outside);await fs.writeFile(path.join(outside,'secret.md'),'secret');
 await fs.symlink(outside,path.join(one,'资源','skills','escaped'),process.platform==='win32'?'junction':'dir');
 assert.equal((await catalog.browse(oneId,mount.id,'skills')).entries.some(entry=>entry.name==='escaped'),false);
 await assert.rejects(catalog.read(oneId,mount.id,'skills/escaped/secret.md'),/PERMISSION_DENIED/);
});
test('项目浏览IPC要求项目和挂载身份且拒绝未知字段',()=>{
 assert.equal(requestSchema.parse({type:'projectCatalog'}).type,'projectCatalog');
 assert.equal(requestSchema.parse({type:'projectBrowse',projectId:'p',mountId:'m'}).type,'projectBrowse');
 assert.throws(()=>requestSchema.parse({type:'projectBrowse',mountId:'m'}));
 assert.throws(()=>requestSchema.parse({type:'projectReadDocument',projectId:'p',mountId:'m',path:'x',root:'unauthorized'}));
});
test('显式资料读取deny阻止总目录、浏览、读取、定位，异步期间撤权也拒绝返回内容',async t=>{
 const {service,oneId}=await fixture(t),catalog=service.projectCatalog(),mount=catalog.list().projects.find(item=>item.id===oneId)!.mounts.find(mount=>mount.name==='资源')!;
 const running=catalog.read(oneId,mount.id,'参考资料/同名.md');
 service.state.permissions={...service.state.permissions,workspace_read:'deny'};
 await assert.rejects(running,/PERMISSION_DENIED/);
 assert.throws(()=>catalog.list(),/PERMISSION_DENIED/);
 await assert.rejects(catalog.browse(oneId,mount.id,''),/PERMISSION_DENIED/);
 await assert.rejects(catalog.read(oneId,mount.id,'参考资料/同名.md'),/PERMISSION_DENIED/);
 await assert.rejects(catalog.resolve(oneId,mount.id,'参考资料/同名.md'),/PERMISSION_DENIED/);
});
