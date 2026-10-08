import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Files} from '../main/files.js';
import {requestSchema,type Mount} from '../shared/types.js';

test('成果定位选择已有文件，缺文件只返回最近已有授权父目录',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-reveal-'));
 try{
  const root=path.join(dir,'root');await fs.mkdir(path.join(root,'原型'),{recursive:true});
  const mounts:Mount[]=[{id:'m',name:'成果',path:root,enabled:true,write:false}],files=new Files(()=>mounts),realRoot=await fs.realpath(root);
  const file=path.join(root,'原型','作战中心.html');await fs.writeFile(file,'old');
  assert.deepEqual(await files.revealLocation('m','原型/作战中心.html'),{path:path.join(realRoot,'原型','作战中心.html'),kind:'file',fileExists:true});
  await fs.unlink(file);
  assert.deepEqual(await files.revealLocation('m','原型/作战中心.html'),{path:path.join(realRoot,'原型'),kind:'directory',fileExists:false});
  assert.deepEqual(await files.revealLocation('m','原型/尚未创建/子目录/新成果.html'),{path:path.join(realRoot,'原型'),kind:'directory',fileExists:false});
  assert.deepEqual(await files.revealLocation('m','未建目录/新成果.html'),{path:realRoot,kind:'directory',fileExists:false});
  await assert.rejects(fs.stat(path.join(root,'原型','尚未创建')),{code:'ENOENT'});
  await assert.rejects(fs.stat(file),{code:'ENOENT'});
  mounts[0].enabled=false;await assert.rejects(files.revealLocation('m','原型/作战中心.html'),/PERMISSION_DENIED/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('成果定位拒绝越界、URL及指向授权根外的junction，包括缺文件',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-reveal-links-'));
 try{
  const root=path.join(dir,'root'),outside=path.join(dir,'outside');await fs.mkdir(root);await fs.mkdir(outside);await fs.writeFile(path.join(outside,'secret.html'),'secret');await fs.symlink(outside,path.join(root,'link'),'junction');
  const files=new Files(()=>[{id:'m',name:'成果',path:root,enabled:true,write:true}]);
  for(const relative of ['../outside/secret.html','../outside/missing.html',outside,'https://example.com/file','link/secret.html','link/missing/deeper.html'])await assert.rejects(files.revealLocation('m',relative),/PERMISSION_DENIED|INVALID_PATH/);
  await fs.writeFile(path.join(root,'file.html'),'x');await assert.rejects(files.revealLocation('m','file.html/sub/new.html'),/ENOTDIR|父级不是目录/);
  await fs.rm(root,{recursive:true,force:true});await assert.rejects(files.revealLocation('m','new.html'),/ENOENT|REVEAL_UNAVAILABLE/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('成果定位IPC仅接收修改身份，原定位契约保持兼容',()=>{
 assert.ok(requestSchema.safeParse({type:'changeReveal',id:'change-1'}).success);
 assert.equal(requestSchema.safeParse({type:'changeReveal',id:'change-1',path:'C:\\secret'}).success,false);
 assert.equal(requestSchema.safeParse({type:'changeReveal',mountId:'m',path:'x.html'}).success,false);
 assert.ok(requestSchema.safeParse({type:'reveal',mountId:'m',path:'x.html'}).success);
});
