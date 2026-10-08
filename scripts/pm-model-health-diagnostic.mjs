import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {_electron as electron} from 'playwright';

// One explicit modelTest through the application, using an existing isolated
// test profile. Credentials remain entirely within the application's IPC path.
const profile=path.resolve(process.argv[2]??''),out=path.resolve(process.argv[3]??'');
const root=path.resolve(process.cwd(),'.test-data');
for(const target of [profile,out]){const relative=path.relative(root,target);assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative),'isolated test paths required');}
await fs.mkdir(out,{recursive:true});
await fs.writeFile(path.join(out,'single-health-request.lock'),'one explicit modelTest request',{flag:'wx'});
const result={startedAt:new Date().toISOString(),profile,healthRequests:0,status:'not_run',transport:[],notice:'One application modelTest, no business rerun. No credential, header, body, raw reply or error body is recorded.'};
const started=Date.now();let app;
try{
 const env={...process.env,PM_SLASH_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;delete env.PM_SLASH_DEV_SERVER_URL;
 app=await electron.launch({cwd:process.cwd(),args:['.'],env,timeout:60000});
 assert.equal(await app.evaluate(({app})=>app.getPath('userData')),profile);
 const page=await app.firstWindow();await page.waitForFunction(()=>Boolean(window.pm?.request));
 const state=await page.evaluate(()=>window.pm.request({type:'state'}));assert.ok(state.ok);
 const model=state.data.models.find(item=>item.id===state.data.defaultModelId);assert.ok(model);assert.equal(model.protocol,'openai-completions');
 result.origin=new URL(model.baseUrl).origin;result.protocol=model.protocol;result.modelId=model.modelId;result.readyMs=Date.now()-started;
 await app.evaluate(()=>{
  globalThis.__healthDiagnostic={events:[],originalFetch:globalThis.fetch};
  const d=globalThis.__healthDiagnostic;
  globalThis.fetch=async(...args)=>{
   const started=Date.now();let identity={};
   try{const url=new URL(typeof args[0]==='string'?args[0]:args[0]?.url??String(args[0]));identity={origin:url.origin,pathname:url.pathname};}catch{}
   const event={...identity,startedAt:new Date(started).toISOString()};d.events.push(event);
   try{const response=await d.originalFetch(...args);Object.assign(event,{status:response.status,headersMs:Date.now()-started});return response;}
   catch(error){event.elapsedMs=Date.now()-started;event.errorName=error?.name;event.causeCodes=[];let current=error;for(let i=0;i<5&&current;i++,current=current.cause){if(typeof current.code==='string')event.causeCodes.push(current.code);if(Array.isArray(current.errors))event.childCodes=current.errors.map(child=>child.code).filter(code=>typeof code==='string');}throw error;}
  };
 });
 result.healthStartedAt=new Date().toISOString();result.healthRequests=1;
 const callStarted=Date.now();const response=await page.evaluate(id=>window.pm.request({type:'modelTest',id}),model.id);result.healthMs=Date.now()-callStarted;
 result.status=response.ok?'passed':'failed';
 if(response.ok)result.replyCharacters=String(response.data?.reply??'').length;
 else result.error=String(response.error??'MODEL_TEST_FAILED');
 result.transport=await app.evaluate(()=>{const d=globalThis.__healthDiagnostic;globalThis.fetch=d.originalFetch;return d.events;});
}catch(error){result.status='diagnostic_failed';result.error=String(error.message);}
finally{if(app)await app.close();result.finishedAt=new Date().toISOString();result.totalMs=Date.now()-started;await fs.writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));}
