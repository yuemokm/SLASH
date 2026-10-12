// Explicit settings update after a successful one-shot image observation.
// ModelSettings performs the update. No credential decryption or model request.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),args=process.argv.slice(2),arg=name=>{const i=args.indexOf(name);assert(i>=0&&args[i+1],'ARGUMENT_REQUIRED');return args[i+1];};
const hash=x=>createHash('sha256').update(x).digest('hex'),read=file=>fs.readFile(file,'utf8').then(JSON.parse);
const snapshot=db=>db.prepare('SELECT key,value FROM kv ORDER BY key').all();
function allowedChange(before,after,id){
 const expected=structuredClone(before),target=expected.models.find(m=>m.id===id),changed=after.models.find(m=>m.id===id);assert(target&&changed,'MODEL_REQUIRED');target.supportsVision=true;target.updatedAt=changed.updatedAt;
 // Zod's settings output may add optional keys whose value is undefined. They
 // are omitted by Store's JSON persistence; compare the exact persisted shape.
 assert.deepEqual(JSON.parse(JSON.stringify(after)),expected,'OTHER_STATE_CHANGED');
}
async function appClosed(profile){
 const command="Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^(electron|slash)(\\.exe)?$' } | Select-Object Name,CommandLine | ConvertTo-Json -Compress";
 const {stdout}=await promisify(execFile)('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,maxBuffer:1024*1024});const value=stdout.trim()?JSON.parse(stdout):[],processes=Array.isArray(value)?value:[value];
 const normalized=x=>String(x??'').replaceAll('\\','/').toLowerCase(),workspace=normalized(root),target=normalized(profile);
 const active=processes.filter(p=>{const c=normalized(p.CommandLine);if(c.includes(target))return true;if(/^slash(?:\.exe)?$/i.test(p.Name))return true;if(c.includes('--type='))return false;if(!c.includes(workspace))return false;return !c.includes('/.test-data/')&&!c.includes('/scripts/sfa-focused-fixture.mjs')&&!c.includes('/scripts/vision-capability-probe.mjs')&&!c.includes('/scripts/prd-focused-review-fixture.mjs');});
 assert.equal(active.length,0,'USER_APPLICATION_RUNNING');return{activeUserApplications:0,isolatedProcessCount:processes.length};
}
async function main(){
 const profile=await fs.realpath(arg('--profile')),entryId=arg('--entry-id'),dir=await fs.realpath(arg('--evidence-case-dir'));assert.equal(profile,path.resolve(process.env.APPDATA,'slash'),'USER_PROFILE_REQUIRED');assert.equal(path.dirname(dir),path.join(root,'.test-data'),'EVIDENCE_SCOPE');
 const manifest=await read(path.join(dir,'manifest.json')),evidence=await read(path.join(dir,'cloud-result.json'));assert.equal(manifest.model.id,entryId);assert.equal(evidence.status,'passed_single_visual_observation');assert.equal(evidence.requests,1);assert.equal(evidence.maxRetries,0);assert.equal(evidence.matchedCells,6);assert.equal(evidence.totalCells,6);assert.equal(evidence.configurationChanged,false);
 const processCheck=await appClosed(profile),file=path.join(profile,'slash.sqlite'),db=new DatabaseSync(file,{readOnly:true});let rows,state;try{rows=snapshot(db);state=JSON.parse(rows.find(r=>r.key==='state').value);}finally{db.close();}
 const current=state.models.find(m=>m.id===entryId);assert(current,'MODEL_REQUIRED');for(const key of ['provider','baseUrl','proxyUrl','modelId','protocol','contextWindow','maxTokens'])assert.equal(current[key],manifest.model[key],'VERIFIED_ROUTE_CHANGED');assert.equal(current.supportsVision,false,'EXPECTED_VISION_DISABLED');
 const cipher={isEncryptionAvailable:()=>false,encryptString:()=>{throw Error('CREDENTIAL_WRITE_DENIED');},decryptString:()=>{throw Error('CREDENTIAL_READ_DENIED');}},memory=new Map(rows.map(r=>[r.key,JSON.parse(r.value)]));let candidate=structuredClone(state);
 const {ModelSettings}=await import(pathToFileURL(path.join(root,'dist/main/settings.js')).href),input={id:current.id,provider:current.provider,name:current.name,baseUrl:current.baseUrl,proxyUrl:current.proxyUrl,modelId:current.modelId,protocol:current.protocol,contextWindow:current.contextWindow,maxTokens:current.maxTokens,supportsVision:true};
 new ModelSettings({get:(key,fallback)=>memory.has(key)?memory.get(key):fallback,set:()=>{throw Error('UNEXPECTED_KV_WRITE');}},cipher,{get:()=>candidate,save:()=>{}}).upsert(input);allowedChange(state,candidate,entryId);
 await appClosed(profile);const {Store}=await import(pathToFileURL(path.join(root,'dist/main/store.js')).href),store=new Store(profile);let after;
 try{const actual=new DatabaseSync(file,{readOnly:true});try{assert.deepEqual(snapshot(actual),rows,'PROFILE_CHANGED_BEFORE_COMMIT');}finally{actual.close();}
  const live=store.get('state',{});new ModelSettings(store,cipher,{get:()=>live,save:()=>store.set('state',live)}).upsert(input);
  const verify=new DatabaseSync(file,{readOnly:true});try{after=snapshot(verify);}finally{verify.close();}
  allowedChange(state,JSON.parse(after.find(r=>r.key==='state').value),entryId);assert.deepEqual(after.filter(r=>r.key!=='state'),rows.filter(r=>r.key!=='state'),'OTHER_KV_OR_CREDENTIALS_CHANGED');
 }finally{store.close();}
 const source=new DatabaseSync(path.join(manifest.sourceProfile,'slash.sqlite'),{readOnly:true});try{assert.equal(JSON.parse(source.prepare('SELECT value FROM kv WHERE key=?').get('state').value).models.find(m=>m.id===entryId).supportsVision,false,'FROZEN_SOURCE_VISION_CHANGED');}finally{source.close();}
 const result={status:'enabled_after_single_visual_observation',profile,entryId,modelId:current.modelId,supportsVision:true,changedFields:['supportsVision','updatedAt'],otherStatePreserved:true,otherKvPreserved:true,encryptedCredentialsPreserved:true,credentialDecrypted:false,sourceProbeProfileVision:false,cloudCalls:0,processCheck,visualEvidenceHash:hash(JSON.stringify(evidence)),observedAt:new Date().toISOString()};await fs.writeFile(path.join(dir,'vision-enabled.json'),JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify(result));
}
await main().catch(error=>{console.error(JSON.stringify({status:'failed',errorCode:String(error?.message??'').match(/^[A-Z][A-Z0-9_]+/)?.[0]??'VISION_UPDATE_FAILED'}));process.exitCode=1;});
