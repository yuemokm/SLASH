import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import ExcelJS from 'exceljs';
import {Store} from '../main/store.js';
import {Service} from '../main/service.js';
import {hash} from '../main/files.js';
import {computerScopeId,computerReference} from '../main/computer-file-scope.js';
import type {RuntimeOptions} from '../main/agent.js';

const gate=()=>{let release!:()=>void;const promise=new Promise<void>(resolve=>release=resolve);return{promise,release};};
async function wait(check:()=>boolean){for(let i=0;i<1500;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('FIXTURE_TIMEOUT');}
async function fixture(t:test.TestContext){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-computer-')),store=new Store(path.join(dir,'profile')),finish=gate();let options!:RuntimeOptions,streaming=false;const wires:string[]=[];
 const service=new Service(store,()=> 'SYNTHETIC_ONLY',()=>{},async o=>{options=o;return{messages:[{role:'assistant',stopReason:'stop'}],get isStreaming(){return streaming;},prepareUserInput:async text=>text,steer:async text=>{wires.push(text);o.nativeInput?.(text,Date.now());},followUp:async text=>{wires.push(text);o.nativeInput?.(text,Date.now());},clearQueue:()=>({steering:[],followUp:[]}),prompt:async()=>{streaming=true;o.inputReady?.();await finish.promise;streaming=false;},abort:async()=>{finish.release();},dispose:()=>{}} as never;},{fetchModelMetadata:async()=>{throw Error('OFFLINE');}});
 await service.workspace(path.join(dir,'project'));service.setPermission('workspace_read','allow');service.setPermission('artifact_write','allow');
 service.state.models=[{id:'fixture',name:'Offline',modelId:'offline',baseUrl:'http://127.0.0.1:1',protocol:'openai-completions',hasKey:true,contextWindow:32768,maxTokens:2048}];service.state.defaultModelId='fixture';service.save();
 const source=path.join(dir,'outside project','参考');await fs.mkdir(source,{recursive:true});const file=path.join(source,'marker.txt');await fs.writeFile(file,'SYNTHETIC_MARKER');const conversation=service.conversation(),scope=computerScopeId(conversation);
 t.after(async()=>{finish.release();for(const run of service.state.runs)service.cancel(run.id);await wait(()=>!service.active.size&&!service.starting.size);service.dispose();await Promise.allSettled([...(service as any).agentIndex.queues.values()]);store.close();await fs.rm(dir,{recursive:true,force:true,maxRetries:6,retryDelay:30});});
 return{service,store,dir,source,file,conversation,scope,wires,options:()=>options,finish,start:async(permission:'standard'|'full_access'='standard',mode:'build'|'plan'='build')=>{const id=await service.send(conversation,'离线电脑权限检查',mode,permission,'fixture');await wait(()=>streaming);return id;}};
}

test('same active Service Run standard → full → read/list/search → standard reject → full works; no persistent/indexed computer mount',async t=>{
 const f=await fixture(t),id=await f.start();await assert.rejects(f.options().files.read(f.scope,f.file),/PERMISSION_DENIED/);
 f.service.setRunPermissionMode(f.conversation,id,'full_access');assert.equal(await f.options().files.read(f.scope,f.file),'SYNTHETIC_MARKER');
 const found=await f.options().files.searchEvidence('',{mountId:f.scope,directory:f.source});assert.equal(found.items.length,1);const ref=found.items[0];assert.equal(path.isAbsolute(ref.path),false);assert.equal(await f.options().files.read(ref.mountId,ref.path),'SYNTHETIC_MARKER');
 assert.equal((await f.options().files.searchEvidence('',{mountId:ref.mountId,directory:path.dirname(ref.path)})).items.length,1);
 assert.equal((await f.options().files.list('',{mountId:f.scope,directory:f.source})).length,1);await assert.rejects(f.options().files.searchEvidence('',{mountId:f.scope}),/DIRECTORY_REQUIRED|ABSOLUTE_PATH_REQUIRED/);
 f.service.setRunPermissionMode(f.conversation,id,'standard');await assert.rejects(f.options().files.read(ref.mountId,ref.path),/PERMISSION_DENIED/);
 f.service.setRunPermissionMode(f.conversation,id,'full_access');assert.equal(await f.options().files.read(ref.mountId,ref.path),'SYNTHETIC_MARKER');assert.equal(f.service.state.mounts.some(m=>m.path===f.source),false);
});

test('external TXT draft uses normalized relative identity; user apply, version conflict and historical revocation stay real',async t=>{
 const f=await fixture(t),id=await f.start('full_access'),output=path.join(f.source,'new.txt');const change=await f.options().log('write_draft',{mountId:f.scope,path:output},async()=>{const c=await f.options().files.draft(f.scope,output,'NEW_EXTERNAL',id);f.options().draft(c);return c;});
 assert.equal(path.isAbsolute(change.path),false);await f.service.apply(change.id);assert.equal(await fs.readFile(output,'utf8'),'NEW_EXTERNAL');
 const edited=await f.options().log('write_draft',{mountId:f.scope,path:output},async()=>{const c=await f.options().files.draft(f.scope,output,'SECOND',id);f.options().draft(c);return c;});await fs.writeFile(output,'USER_CHANGED');await assert.rejects(f.service.apply(edited.id),/VERSION_CONFLICT/);assert.equal(await fs.readFile(output,'utf8'),'USER_CHANGED');
 f.finish.release();await wait(()=>!f.service.active.size&&!f.service.starting.size);f.service.setRunPermissionMode(f.conversation,undefined,'standard');await assert.rejects(f.service.files.read(change.mountId,change.path),/PERMISSION_DENIED/);
 f.service.setRunPermissionMode(f.conversation,undefined,'full_access');assert.equal(await f.service.files.read(change.mountId,change.path),'USER_CHANGED');
});

test('computer XLSX source copy/extract keeps original bytes and verified relative provenance; output remains project process file',async t=>{
 const f=await fixture(t),book=new ExcelJS.Workbook();book.addWorksheet('业务').addRow(['合成字段','规则']);const xlsx=path.join(f.source,'source.xlsx');await book.xlsx.writeFile(xlsx);const before=await fs.readFile(xlsx),id=await f.start('full_access');
 const copy=await f.options().log('copy_for_processing',{mountId:f.scope,path:xlsx},()=>f.options().copyForProcessing!({mountId:f.scope,path:xlsx}));assert.equal(path.isAbsolute((copy as any).source.path),false);assert.equal(await f.service.files.resolve((copy as any).source.mountId,(copy as any).source.path),xlsx);
 const processed=await f.options().log('process_processing_copy',{id:(copy as any).id,operation:'extract_text'},()=>f.options().processProcessingCopy!((copy as any).id,'extract_text')) as any;
 assert.ok(processed.output??processed.receipt?.output,JSON.stringify(processed));const change=f.service.state.changes.find(c=>c.id===processed.changeId)!;assert.ok(change);await f.service.apply(change.id);const text=await f.options().files.read(change.mountId,change.path);assert.match(text,/合成字段/);assert.deepEqual(await fs.readFile(xlsx),before);assert.ok(!change.mountId.startsWith('computer:'));
});

test('Plan write, disabled and explicit readonly/reference protections do not disappear in full access',async t=>{
 const f=await fixture(t),id=await f.start('full_access','plan');assert.equal(await f.options().files.read(f.scope,f.file),'SYNTHETIC_MARKER');await assert.rejects(f.options().log('write_draft',{},()=>f.options().files.draft(f.scope,f.file,'FORBIDDEN',id)),/PLAN|PERMISSION_DENIED/);
 const m=await f.service.mount(f.source,false);await assert.rejects(f.options().files.draft(f.scope,f.file,'FORBIDDEN',id),/PERMISSION_DENIED/);f.service.setMountAccess(m.id,false,false);await assert.rejects(f.options().files.read(f.scope,f.file),/PERMISSION_DENIED/);
});

test('another conversation cannot borrow computer refs, and idle mode change does not revoke other conversation',async t=>{
 const f=await fixture(t),id=await f.start('full_access'),other=f.service.conversation();f.service.setRunPermissionMode(other,undefined,'full_access');const foreign=computerScopeId(other);await assert.rejects(f.options().files.read(foreign,f.file),/PERMISSION_DENIED/);
 f.service.setRunPermissionMode(other,undefined,'standard');assert.equal(await f.options().files.read(f.scope,f.file),'SYNTHETIC_MARKER');
});

test('prepared actual queued input publishes current full scope and real user body only after native delivery',async t=>{
 const f=await fixture(t),id=await f.start();f.service.setRunPermissionMode(f.conversation,id,'full_access');const text=f.file;f.service.enqueueRunInput({runId:id,requestId:randomUUID(),text,delivery:'steer'});await wait(()=>f.wires.length===1);assert.match(f.wires[0],/宿主当前权限：full_access/);assert.match(f.wires[0],new RegExp(f.scope));assert.ok(f.service.state.conversations.find(c=>c.id===f.conversation)!.messages.some(m=>m.text===text));
});

test('internal computer reference rejects altered root, traversal and relative alias',()=>{
 assert.throws(()=>computerReference('computer:c','relative.txt'),/ABSOLUTE_PATH_REQUIRED/);const ref=computerReference('computer:c',path.resolve('marker.txt'))!;assert.throws(()=>computerReference(ref.mountId,'../escape'),/INVALID_PATH/);assert.equal(ref.conversationId,'c');
});

test('downgrade during actual awaited file read rejects the completed bytes; old started tool cannot revive after full is selected again',async t=>{
 const f=await fixture(t),id=await f.start('full_access'),begun=gate(),resume=gate(),readFile=fs.readFile;
 fs.readFile=(async(...args:any[])=>{if(args[0]===f.file){begun.release();await resume.promise;}return (readFile as any)(...args);}) as typeof fs.readFile;
 try{const result=f.options().log('read_file',{mountId:f.scope,path:f.file},()=>f.options().files.read(f.scope,f.file));await begun.promise;f.service.setRunPermissionMode(f.conversation,id,'standard');f.service.setRunPermissionMode(f.conversation,id,'full_access');resume.release();await assert.rejects(result,/PERMISSION_DENIED/);}finally{resume.release();fs.readFile=readFile;}
});

test('global host Files cannot indirectly borrow another conversation through a model tool callback',async t=>{
 const f=await fixture(t),id=await f.start('full_access'),other=f.service.conversation();f.service.setRunPermissionMode(other,undefined,'full_access');
 const ref=computerReference(computerScopeId(other),f.file)!;
 await assert.rejects(f.options().log('read_file',{mountId:'ordinary',path:'derived.txt'},()=>f.service.files.read(ref.mountId,ref.path)),/PERMISSION_DENIED/);
});

test('same physical path shares locks with ordinary mounts and stable conversation refs across Run identities',async t=>{
 const f=await fixture(t),id=await f.start('full_access'),mount=await f.service.mount(f.source,true),ref=computerReference(f.scope,f.file)!;
 const computerResource=(f.service as any).resourceForMount(ref.mountId,ref.path),mountResource=(f.service as any).resourceForMount(mount.id,'marker.txt');assert.deepEqual(computerResource,mountResource);
 const change=await f.options().files.draft(f.scope,f.file,'BLOCKED_BY_EXISTING_LOCK',id);f.service.state.changes.unshift(change);f.service.save();const lock=f.service.acquireShareLock(mountResource,'other-run','write');
 try{await assert.rejects(f.service.apply(change.id),/LOCK|CONFLICT/);assert.equal(await fs.readFile(f.file,'utf8'),'SYNTHETIC_MARKER');}finally{f.service.releaseShareLock(lock.id,'other-run');}
 assert.deepEqual(computerReference(computerScopeId(f.conversation),f.file),ref);
});

test('full access shallow browse exposes immediate empty directories as metadata; recursive default stays files only',async t=>{
 const f=await fixture(t);await fs.mkdir(path.join(f.source,'empty'));await fs.mkdir(path.join(f.source,'nested'));await fs.writeFile(path.join(f.source,'nested','deep.txt'),'DEEP');await f.start('full_access');
 const recursive=await f.options().files.searchEvidence('',{mountId:f.scope,directory:f.source});assert.equal(recursive.items.length,2);
 const browse=await f.options().files.searchEvidence('',{mountId:f.scope,directory:f.source,shallow:true});assert.equal(browse.items.length,3);assert.equal(browse.items.filter(item=>item.entryType==='directory').length,2);assert.equal(browse.coverage.listedFiles,1);assert.equal(browse.coverage.listedDirectories,2);assert.equal(browse.coverage.bodyReadFiles,0);assert.ok(browse.items.every(item=>!item.snippet&&!item.textContentHash));assert.ok(!browse.items.some(item=>item.path.endsWith('deep.txt')));
 const nested=browse.items.find(item=>path.basename(item.path)==='nested')!;assert.equal((await f.options().files.searchEvidence('',{mountId:nested.mountId,directory:nested.path,shallow:true})).items.length,1);
 const filtered=await f.options().files.searchEvidence('empty',{mountId:f.scope,directory:f.source,shallow:true});assert.equal(filtered.items[0]?.entryType,'directory');assert.equal(filtered.coverage.scannedFiles,1);
});

test('mounted directory scope is respected and unbound directory is rejected instead of silently searching project',async t=>{
 const f=await fixture(t),mount=await f.service.mount(f.source,false);await fs.mkdir(path.join(f.source,'sub'));await fs.writeFile(path.join(f.source,'sub','only.txt'),'ONLY');await f.start();
 assert.equal((await f.options().files.searchEvidence('',{mountId:mount.id,directory:'sub',shallow:true})).items.length,1);
 await assert.rejects(f.options().files.searchEvidence('',{directory:f.source}),/SEARCH_DIRECTORY_SCOPE_REQUIRED/);
 await assert.rejects(f.options().files.searchEvidence('',{mountId:mount.id,directory:'../',shallow:true}),/PERMISSION_DENIED/);
 await assert.rejects(f.options().files.searchEvidence('',{mountId:f.scope,directory:f.source,shallow:true}),/PERMISSION_DENIED/);
});

test('legacy host subAgent reads inherit the same active conversation scope; foreign scope, mode downgrade and deny reject',async t=>{
 const f=await fixture(t),id=await f.start('full_access');f.store.set('app-preferences',{subAgentMaxTasks:50});
 const request={parentRunId:id,tool:'search_files',capability:'workspace_read' as const,input:{query:'',directory:f.source,shallow:true}};
 const listed=await f.service.runSubAgent(request) as any;assert.equal(listed.results.items.length,1);const ref=listed.results.items[0];
 const read=await f.service.runSubAgent({parentRunId:id,tool:'read_file',capability:'workspace_read',mountId:ref.mountId,input:{path:ref.path}}) as any;assert.equal(read.content,'SYNTHETIC_MARKER');
 const other=f.service.conversation();f.service.setRunPermissionMode(other,undefined,'full_access');await assert.rejects(f.service.runSubAgent({...request,input:{...request.input,mountId:computerScopeId(other)}}),/PERMISSION_DENIED/);
 f.service.setRunPermissionMode(f.conversation,id,'accept_edits');await assert.rejects(f.service.runSubAgent(request),/PERMISSION_DENIED/);
 f.service.setRunPermissionMode(f.conversation,id,'full_access');f.service.setPermission('workspace_read','deny');await assert.rejects(f.service.runSubAgent(request),/SUB_AGENT_PERMISSION_DENIED/);
});

test('shallow browsing obeys explicit disabled directory and stable pagination scope',async t=>{
 const f=await fixture(t);await fs.mkdir(path.join(f.source,'hidden'));await fs.mkdir(path.join(f.source,'visible'));const hidden=await f.service.mount(path.join(f.source,'hidden'),false);f.service.setMountAccess(hidden.id,false,false);await f.start('full_access');
 const first=await f.options().files.searchEvidence('',{mountId:f.scope,directory:f.source,shallow:true,limit:1});assert.ok(!JSON.stringify(first).includes('hidden'));assert.equal(first.pagination.totalMatches,2);
 const next=await f.options().files.searchEvidence('',{mountId:f.scope,directory:f.source,shallow:true,limit:1,offset:1,resultVersion:first.resultVersion});assert.equal(next.items.length,1);
 await assert.rejects(f.options().files.searchEvidence('',{mountId:f.scope,directory:f.source,shallow:false,offset:1,resultVersion:first.resultVersion}),/SEARCH_RESULTS_CHANGED/);
});
