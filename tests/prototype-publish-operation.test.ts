import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import AdmZip from 'adm-zip';
import {Store} from '../main/store.ts';
import {capturePrototypeStaticManifest} from '../main/prototype-delivery.ts';
import {PrototypePublishOperation} from '../main/prototype-publish-operation.ts';
import {digest,openStaticPhase,validateStaticConfiguration} from '../main/netlify-static-phase.ts';
import {createPiMcpSession} from '../main/pi-mcp-runtime.ts';
import {staticPublishConfigurationSchema,staticPublishDisposition} from '../shared/prototype-publish-operation.ts';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),loader=pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;
const zip=await fs.readFile(new URL('./fixtures/prototype-publish-synthetic.zip',import.meta.url));
const entries=new AdmZip(zip).getEntries().filter(entry=>!entry.isDirectory&&entry.entryName!=='.env.production');
const snapshot=new Map(entries.map(entry=>{const bytes=entry.getData();return[entry.entryName,{bytes,hash:digest(bytes)}] as const;}));
snapshot.set('assets/duplicate.png',{bytes:Buffer.from(snapshot.get('assets/标志 image.png')!.bytes),hash:snapshot.get('assets/标志 image.png')!.hash});
const manifest=capturePrototypeStaticManifest('index.html',snapshot);
const configuration=staticPublishConfigurationSchema.parse({version:'netlify-static-operation-v1',siteId:'SYNTHETIC_SITE_A',draft:true,deliveryBindingHash:'a'.repeat(64),connectionHash:'b'.repeat(64),manifest,files:manifest.files.map(file=>({...file,sha1:digest(snapshot.get(file.path)!.bytes,'sha1'),base64:snapshot.get(file.path)!.bytes.toString('base64')}))});
const uniqueHashes=[...new Set(configuration.files.map(file=>file.sha1))];
const wait=async(predicate:()=>boolean|Promise<boolean>,budget=7000)=>{const until=Date.now()+budget;while(Date.now()<until){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,20));}throw Error('BOUNDED_OBSERVATION_TIMEOUT');};
const alive=(pid:number)=>{try{process.kill(pid,0);return true;}catch{return false;}};
async function fixture(mode='normal'){
 const directory=await fs.mkdtemp(path.join(root,'run-'+mode+'-')),databaseDirectory=path.join(directory,'host-store'),store=new Store(databaseDirectory),runId=randomUUID(),requests:any[]=[],children:any[]=[],dispatches:any[]=[],sessions:any[]=[];
 const deployId='SYNTHETIC_DEPLOY_'+randomUUID().slice(0,8);let releaseUpload:(()=>void)|undefined,releaseStatus:(()=>void)|undefined;
 const uploadWait=new Promise<void>(resolve=>{releaseUpload=resolve;}),statusWait=new Promise<void>(resolve=>{releaseStatus=resolve;});
 const server=createServer(async(req,res)=>{
  const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));const bytes=Buffer.concat(chunks),pathname=decodeURIComponent(new URL(req.url!,'http://127.0.0.1').pathname);
  requests.push({method:req.method,pathname,bytes:bytes.length,sha256:digest(bytes),base64:bytes.toString('base64')});
  assert.equal(req.headers.authorization,'Bearer LOCAL_SYNTHETIC_NOT_CREDENTIAL');
  if(req.method==='POST'){
   assert.equal(pathname,'/api/v1/sites/'+configuration.siteId+'/deploys');assert.deepEqual(JSON.parse(bytes.toString()),{files:Object.fromEntries(configuration.files.map(file=>['/'+file.path,file.sha1])),draft:true});
   if(mode==='lost_create'){res.writeHead(200);res.write('{"id":"');setTimeout(()=>res.destroy(),5);return;}
   if(mode==='delayed_create')await uploadWait;
   res.end(JSON.stringify({id:mode==='invalid_id'?'../bad':deployId,site_id:mode==='wrong_site'?'OTHER_SITE':configuration.siteId,draft:true,state:'prepared',required:uniqueHashes}));return;
  }
  assert(pathname.startsWith('/api/v1/deploys/'+deployId));
  if(req.method==='PUT'){
   const file=configuration.files.find(file=>pathname.endsWith('/files/'+file.path));assert(file);assert.equal(digest(bytes),file.sha256);assert.equal(bytes.length,file.bytes);
   if(mode==='interleave'||mode==='cancel_upload')await uploadWait;
   if(mode==='lost_upload'){res.writeHead(200);res.write('{');setTimeout(()=>res.destroy(),5);return;}
   res.end('{}');return;
  }
  assert.equal(req.method,'GET');
  // Real server checks the host SQLite receipt already records this dispatch.
  const persisted=JSON.parse(store.operationsForRun(runId)[0].result);assert(persisted.statusReadsStarted>=requests.filter(value=>value.method==='GET').length);
  if(mode==='interleave'||mode==='two_status')await statusWait;
  if(mode==='lost_status'&&requests.filter(value=>value.method==='GET').length===1){res.writeHead(200);res.write('{"id":"');setTimeout(()=>res.destroy(),5);return;}
  if(mode==='status_failure'&&requests.filter(value=>value.method==='GET').length===1){res.writeHead(503);res.end('{}');return;}
  res.end(JSON.stringify({id:deployId,site_id:configuration.siteId,draft:true,state:'ready',deploy_ssl_url:'https://preview.example.org/frozen-draft'}));
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+(server.address() as {port:number}).port;
 const home=path.join(directory,'home');await fs.mkdir(home,{recursive:true});
 const environment={SystemRoot:process.env.SystemRoot!,SystemDrive:process.env.SystemDrive!,PATH:path.dirname(process.execPath),HOME:home,USERPROFILE:home,APPDATA:home,LOCALAPPDATA:home,TEMP:home,TMP:home};
 const factory=async(input:any)=>{
  const index=children.length,evidencePath=path.join(directory,'child-'+index+'.json'),configPath=path.join(directory,'session-'+index+'.json');children.push({evidencePath,configPath});
  await fs.writeFile(configPath,JSON.stringify({configuration:input.configuration,restoredDeployId:input.restoredDeployId,origin,fixtureOrigin:origin,token:'LOCAL_SYNTHETIC_NOT_CREDENTIAL',evidencePath,hostPid:process.pid}));
  const session=await createPiMcpSession({command:process.execPath,args:['--import',loader,path.join(root,'scripts/netlify-static-phase-stdio.mjs'),configPath],cwd:root,env:environment,tools:['static_create','static_upload','static_status'],beforeDispatch:async(name,args)=>{await input.beforeDispatch();dispatches.push({name,args});}});sessions.push(session);return session;
 };
 const domains:PrototypePublishOperation[]=[];const newDomain=()=>{const value=new PrototypePublishOperation(store,configuration,factory,()=>{});domains.push(value);return value;};const domain=newDomain();
 return{directory,databaseDirectory,store,domain,newDomain,runId,requests,children,sessions,configuration,deployId,origin,environment,releaseUpload:()=>releaseUpload!(),releaseStatus:()=>releaseStatus!(),factory,async close(){releaseUpload!();releaseStatus!();for(const value of domains)await value.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));const processes=[];for(const child of children){const metadata=JSON.parse(await fs.readFile(child.evidencePath,'utf8'));assert.notEqual(metadata.pid,process.pid);await wait(()=>!alive(metadata.pid));processes.push({...metadata,processAliveAfterClose:false});}const operations=store.operationsForRun(runId),recovery=store.recoveryForRun(runId);await fs.writeFile(path.join(directory,'evidence.json'),JSON.stringify({scope:'local_http_not_cloud',hostPid:process.pid,requests,dispatches,processes,operations,recovery,httpClosed:!server.listening},null,2));store.close();}};
}
test('schema preserves native web manifest, exact original bytes and rejects expanded targets',()=>{
 assert.equal(configuration.files.length,5);assert.equal(uniqueHashes.length,4);validateStaticConfiguration(configuration);
 assert.throws(()=>validateStaticConfiguration({...configuration,files:[...configuration.files,{...configuration.files[0],path:'.env.production'}]}));
 assert.throws(()=>staticPublishConfigurationSchema.parse({...configuration,draft:false}));
 assert.throws(()=>validateStaticConfiguration({...configuration,files:configuration.files.map((file,index)=>index?file:{...file,base64:'eA=='})}));
});
test('actual Pi stdio is separate from Store host; concurrent same-binding create emits only one POST',{timeout:35000},async()=>{
 const f=await fixture('delayed_create');try{
  const first=f.domain.create(f.runId),other=f.newDomain();await wait(()=>f.requests.some(value=>value.method==='POST'),20_000);
  const duplicates=await Promise.all([f.domain.create(f.runId),other.create(f.runId,randomUUID())]);assert(duplicates.every(receipt=>!receipt.deployId));f.releaseUpload();const created=await first;
  assert.equal(created.uploaded.length,4);assert.equal(created.uploadsComplete,true);assert.equal(f.requests.filter(value=>value.method==='POST').length,1);assert.equal(f.requests.filter(value=>value.method==='PUT').length,4);assert.equal(f.children.length,1);
  assert.equal((await f.sessions[0].call('static_upload',{sha1:uniqueHashes[0]})).isError,true);assert.equal(f.requests.filter(value=>value.method==='PUT').length,4);
  const ready=await f.domain.status();assert.equal(staticPublishDisposition(ready),'ready');assert.equal(f.store.operationsForRun(f.runId)[0].state,'succeeded');assert.equal(f.store.recoveryForRun(f.runId)[0].resolution,'verified_done');
 }finally{await f.close();}
});
test('two real Store HOST processes overlap create but share one atomic binding and one POST',{timeout:45000},async()=>{
 const f=await fixture('delayed_create');const workers:any[]=[];try{
  const start=async(index:number)=>{const directory=path.join(f.directory,'host-'+index);await fs.mkdir(directory);const resultPath=path.join(directory,'result.json'),childEvidencePath=path.join(directory,'child.json'),configPath=path.join(directory,'worker.json');await fs.writeFile(configPath,JSON.stringify({directory,databaseDirectory:f.databaseDirectory,configuration,runId:f.runId,operationId:randomUUID(),origin:f.origin,loader,serverPath:path.join(root,'scripts/netlify-static-phase-stdio.mjs'),env:f.environment,resultPath,childEvidencePath}));
   const child=spawn(process.execPath,['--import',loader,path.join(root,'scripts/host-create-worker.mjs'),configPath],{cwd:root,env:f.environment,stdio:['ignore','pipe','pipe']});let log='';child.stderr.on('data',value=>log+=value);const complete=new Promise<number|null>(resolve=>child.once('exit',async(code)=>{await fs.writeFile(path.join(directory,'stderr.log'),log);resolve(code);}));const value={child,complete,resultPath,childEvidencePath,directory};workers.push(value);return value;};
  const first=await start(1);await wait(()=>f.requests.some(value=>value.method==='POST'),20_000);const second=await start(2);assert.equal(await second.complete,0,await fs.readFile(path.join(second.directory,'stderr.log'),'utf8'));const duplicate=JSON.parse(await fs.readFile(second.resultPath,'utf8'));assert.equal(duplicate.receipt.deployId,undefined);f.releaseUpload();assert.equal(await first.complete,0,await fs.readFile(path.join(first.directory,'stderr.log'),'utf8'));const owner=JSON.parse(await fs.readFile(first.resultPath,'utf8'));assert.equal(owner.receipt.operationId,duplicate.receipt.operationId);assert.equal(owner.receipt.uploadsComplete,true);assert.notEqual(owner.hostPid,duplicate.hostPid);const phase=JSON.parse(await fs.readFile(first.childEvidencePath,'utf8'));assert.notEqual(phase.pid,owner.hostPid);assert.equal(phase.processAliveAfterClose,false);assert.equal(f.requests.filter(value=>value.method==='POST').length,1);assert.equal(f.requests.filter(value=>value.method==='PUT').length,4);
 }finally{f.releaseUpload();for(const worker of workers)await worker.complete;await f.close();}
});
test('early ready during upload cannot settle: ACK preserves progress, a new post-upload GET must verify ready',{timeout:35000},async()=>{
 const f=await fixture('interleave');try{
  const creation=f.domain.create(f.runId);await wait(()=>f.requests.some(value=>value.method==='PUT'));const poll=f.domain.status();await wait(()=>f.requests.some(value=>value.method==='GET'));
  f.releaseStatus();const early=await poll;assert.equal(early.lastKnownState,'ready');assert.equal(early.readyObservedAt,undefined);assert.equal(early.uploadsComplete,false);
  f.releaseUpload();const created=await creation;assert.equal(created.uploaded.length,4);assert.equal(created.uploadsComplete,true);assert.equal(created.readyObservedAt,undefined);assert.notEqual(f.store.operationsForRun(f.runId)[0].state,'succeeded');
  const ready=await f.domain.status();assert.equal(staticPublishDisposition(ready),'ready');assert.equal(ready.readyFromCompletedRevision,created.revision);assert.deepEqual(ready.uploaded,created.uploaded);assert.equal(f.children.length,1);assert.equal(f.requests.filter(value=>value.method==='POST').length,1);assert.equal(f.requests.filter(value=>value.method==='GET').length,2);
 }finally{await f.close();}
});
test('create response loss survives Store reopen: no replacement attempt and no arbitrary-ID GET',{timeout:35000},async()=>{
 const f=await fixture('lost_create');try{
  const value=await f.domain.create(f.runId);assert.equal(staticPublishDisposition(value),'unknown');await f.domain.close();const reopened=new Store(f.databaseDirectory),domain=new PrototypePublishOperation(reopened,configuration,f.factory,()=>{});
  try{assert.equal((await domain.create(f.runId,randomUUID())).operationId,value.operationId);assert.equal((await domain.status()).deployId,undefined);assert.equal(f.requests.length,1);assert.equal(reopened.recoveryForRun(f.runId)[0].dispatch,'may_have_run');}finally{await domain.close();reopened.close();}
 }finally{await f.close();}
});
test('atomic claim+first Operation process window reopens as unknown and never sends create',{timeout:35000},async()=>{
 const f=await fixture();try{
  const operationId=randomUUID(),evidencePath=path.join(f.directory,'claim-worker.json'),config=path.join(f.directory,'claim-worker-config.json');await fs.writeFile(config,JSON.stringify({configuration,databaseDirectory:f.databaseDirectory,runId:f.runId,operationId,evidencePath}));
  const child=spawn(process.execPath,['--import',loader,path.join(root,'scripts/host-claim-window.mjs'),config],{cwd:root,stdio:['ignore','pipe','pipe'],env:{SystemRoot:process.env.SystemRoot!,PATH:path.dirname(process.execPath),HOME:f.directory,USERPROFILE:f.directory}});let output='';child.stderr.on('data',value=>output+=value);const exit=await new Promise<number|null>(resolve=>child.once('exit',resolve));await fs.writeFile(path.join(f.directory,'claim-worker.log'),output);assert.equal(exit,0,output);
  const evidence=JSON.parse(await fs.readFile(evidencePath,'utf8'));assert.equal(evidence.hasInitialReceipt,true);assert.equal(evidence.hasRecovery,true);assert.notEqual(evidence.pid,process.pid);
  const value=await f.domain.create(f.runId,randomUUID());assert.equal(value.operationId,operationId);assert.equal(staticPublishDisposition(value),'unknown');assert.equal(f.requests.length,0);assert.equal(f.children.length,0);
 }finally{await f.close();}
});
test('wrong-site or invalid-ID create cannot cache ID or permit later uploads/status',{timeout:35000},async()=>{
 for(const mode of ['wrong_site','invalid_id']){const f=await fixture(mode);try{const value=await f.domain.create(f.runId);assert.equal(value.deployId,undefined);await f.domain.status();assert.equal((await f.sessions[0].call('static_status',{})).isError,true);assert.equal((await f.sessions[0].call('static_upload',{sha1:uniqueHashes[0]})).isError,true);assert.deepEqual(f.requests.map(value=>value.method),['POST']);}finally{await f.close();}}
});
test('lost upload remains unknown; restored known-ID session is status-only and never auto-resumes uploads',{timeout:35000},async()=>{
 const f=await fixture('lost_upload');try{const value=await f.domain.create(f.runId);assert.equal(value.deployId,f.deployId);assert.equal(value.uploaded.length,0);assert.equal(value.dispatchedUploads.length,1);await f.domain.close();const recovered=f.newDomain();
  await recovered.create(f.runId,randomUUID());const known=await recovered.status();assert.equal(known.readyObservedAt,undefined);assert.equal(known.lastKnownState,'ready');assert.equal(known.uploadsComplete,false);assert.equal(staticPublishDisposition(known),'known');
  assert.equal((await f.sessions.at(-1).call('static_upload',{sha1:uniqueHashes[0]})).isError,true);
  assert.equal(f.requests.filter(value=>value.method==='POST').length,1);assert.equal(f.requests.filter(value=>value.method==='PUT').length,1);assert.equal(f.requests.filter(value=>value.method==='GET').length,1);
 }finally{await f.close();}
});
test('actual MCP cancellation keeps host known ID/unknown upload and only read-only recovery is possible',{timeout:35000},async()=>{
 const f=await fixture('cancel_upload');try{const controller=new AbortController(),creating=f.domain.create(f.runId,randomUUID(),controller.signal);await wait(()=>f.requests.some(value=>value.method==='PUT'),20_000);controller.abort();const cancelled=await creating;assert.equal(cancelled.deployId,f.deployId);assert.equal(cancelled.uploadsComplete,false);assert.equal(cancelled.dispatchedUploads.length,1);assert.equal(cancelled.uploaded.length,0);assert.equal(cancelled.diagnostics.at(-1)?.code,'CANCELLED');await f.domain.close();f.releaseUpload();const recovered=f.newDomain();await recovered.status();assert.equal(f.requests.filter(value=>value.method==='POST').length,1);assert.equal(f.requests.filter(value=>value.method==='PUT').length,1);assert.equal(f.requests.filter(value=>value.method==='GET').length,1);assert.equal(f.requests.some(value=>value.pathname.endsWith('/cancel')),false);}finally{await f.close();}
});
test('GET dispatch is durable before response loss; Store reopen performs only a new bound GET',{timeout:35000},async()=>{
 const f=await fixture('lost_status');try{const created=await f.domain.create(f.runId);assert.equal(created.uploadsComplete,true);const lost=await f.domain.status();assert.equal(lost.statusReadsStarted,1);assert.equal(lost.statusReadsConfirmed,0);assert.equal(lost.readyObservedAt,undefined);assert.deepEqual(lost.uploaded,created.uploaded);await f.domain.close();
  const reopened=new Store(f.databaseDirectory),domain=new PrototypePublishOperation(reopened,configuration,f.factory,()=>{});try{const ready=await domain.status();assert.equal(ready.statusReadsStarted,2);assert.equal(ready.statusReadsConfirmed,1);assert.equal(staticPublishDisposition(ready),'ready');assert.equal(ready.diagnostics.length,1);assert.deepEqual(ready.uploaded,created.uploaded);assert.equal(f.requests.filter(value=>value.method==='POST').length,1);assert.equal(f.requests.filter(value=>value.method==='PUT').length,4);assert.equal(f.requests.filter(value=>value.method==='GET').length,2);}finally{await domain.close();reopened.close();}
 }finally{await f.close();}
});
test('concurrent GET acknowledgements merge both increments even after the first settles ready',{timeout:35000},async()=>{
 const f=await fixture('two_status');try{const created=await f.domain.create(f.runId),before=f.store.recoveryForRun(f.runId)[0];const first=f.domain.status(),second=f.domain.status();await wait(()=>f.requests.filter(value=>value.method==='GET').length===2);assert.equal(f.domain.read()!.statusReadsStarted,2);assert.equal(f.domain.read()!.statusReadsConfirmed,0);f.releaseStatus();await Promise.all([first,second]);const final=f.domain.read()!;assert.equal(final.statusReadsStarted,2);assert.equal(final.statusReadsConfirmed,2);assert.equal(staticPublishDisposition(final),'ready');assert.deepEqual(final.uploaded,created.uploaded);const recovery=f.store.recoveryForRun(f.runId)[0];assert.equal(recovery.scopeHash,before.scopeHash);assert.equal(recovery.requestHash,before.requestHash);assert.equal(recovery.dispatch,'settled');assert.equal(recovery.resolution,'verified_done');assert.equal(recovery.evidenceRefs.length,1);assert.equal(f.children.length,1);}finally{await f.close();}
});
test('read failure retains acknowledged uploads; verified ready can advance earlier unknown without erasing diagnostics',{timeout:35000},async()=>{
 const f=await fixture('status_failure');try{const uploaded=await f.domain.create(f.runId),failed=await f.domain.status();assert.deepEqual(failed.uploaded,uploaded.uploaded);assert.equal(failed.uploadsComplete,true);assert.equal(f.store.operationsForRun(f.runId)[0].state,'outcome_unknown');
  const result=await f.domain.status();assert.equal(staticPublishDisposition(result),'ready');assert.equal(result.diagnostics.length,1);assert.deepEqual(result.uploaded,uploaded.uploaded);assert.equal(result.statusReadsStarted,2);assert.equal(result.statusReadsConfirmed,1);assert.equal(f.store.operationsForRun(f.runId)[0].state,'succeeded');assert.equal(f.requests.filter(value=>value.method==='GET').length,2);
 }finally{await f.close();}
});
test('Store CAS refuses identity mismatch, stale receipt and terminal regression',async()=>{
 const directory=await fs.mkdtemp(path.join(root,'run-store-cas-')),store=new Store(directory),domain=new PrototypePublishOperation(store,configuration,()=>{throw Error('NO_TRANSPORT');},()=>{});try{
  const receipt=domain.claim(randomUUID()).receipt,operation=store.operationsForRun(receipt.runId)[0],arguments_={key:domain.key,operationId:receipt.operationId,runId:receipt.runId,tool:receipt.tool,scopeHash:domain.binding,requestHash:domain.requestHash,expectedResult:operation.result,nextResult:operation.result,state:'outcome_unknown' as const};
  assert.throws(()=>store.compareAndSwapOperationResult({...arguments_,runId:'wrong'}),/IDENTITY/);assert.throws(()=>store.compareAndSwapOperationResult({...arguments_,requestHash:'wrong'}),/IDENTITY/);assert.equal(store.compareAndSwapOperationResult({...arguments_,expectedResult:'{}'}),false);assert.throws(()=>store.compareAndSwapOperationResult({...arguments_,state:'succeeded'}),/TERMINAL/);
  store.finishOperation(receipt.operationId,receipt.runId,receipt.tool,'cancelled',operation.result);assert.equal(store.compareAndSwapOperationResult(arguments_),false);
 }finally{store.close();}
});
