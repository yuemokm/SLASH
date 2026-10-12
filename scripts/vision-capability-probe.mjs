// Explicit diagnostic modes only. Preparation/local SSE never contact a model.
// The root operator separately chooses --run-cloud after reviewing the fixture.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {readFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {createHash,randomInt,randomUUID} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {DatabaseSync} from 'node:sqlite';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';

const script=fileURLToPath(import.meta.url),root=path.resolve(path.dirname(script),'..'),hash=b=>createHash('sha256').update(b).digest('hex');
const args=process.argv.slice(2),argument=name=>{const i=args.indexOf(name);assert(i>=0&&args[i+1],'ARGUMENT_REQUIRED');return args[i+1];};
const identity=m=>Object.fromEntries(['id','provider','name','baseUrl','proxyUrl','modelId','protocol','supportsVision','contextWindow','maxTokens'].filter(k=>m[k]!==undefined).map(k=>[k,m[k]]));
const colors={red:[220,45,55],green:[20,165,70],blue:[30,85,225],orange:[245,145,15],purple:[145,45,180],cyan:[15,185,205]};
const segments=['abcedf','bc','abdeg','abcdg','bcfg','acdfg','acdefg','abc','abcdefg','abcdfg'];
const prompt='Read only the attached image. It contains six colored cards in 2 rows and 3 columns. Each card has a two-digit number inside a white label. Return only JSON {"rows":[[{"color":"red|green|blue|orange|purple|cyan","number":0}]]} with exactly 2 rows and 3 objects per row, ordered top-to-bottom then left-to-right. Report the actual visible color and number for every card. The example number 0 is only a format placeholder, not an answer. If the image is unavailable, return {"unavailable":true}. No tools or explanation.';
function crc32(bytes){let n=0xffffffff;for(const b of bytes){n^=b;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);}return(n^0xffffffff)>>>0;}
function chunk(type,data){const tag=Buffer.from(type),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([tag,data])));return Buffer.concat([length,tag,data,crc]);}
export function challenge(){
 const names=Object.keys(colors);for(let i=names.length-1;i>0;i--){const j=randomInt(i+1);[names[i],names[j]]=[names[j],names[i]];}
 const expected={rows:Array.from({length:2},(_,r)=>Array.from({length:3},(_,c)=>({color:names[r*3+c],number:randomInt(10,100)})))},width=660,height=420,scan=Buffer.alloc(height*(width*3+1),255);
 for(let y=0;y<height;y++)scan[y*(width*3+1)]=0;
 const rect=(x,y,w,h,rgb)=>{for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++){const offset=yy*(width*3+1)+1+xx*3;for(let i=0;i<3;i++)scan[offset+i]=rgb[i];}};
 const digit=(value,x,y)=>{const boxes={a:[8,0,28,8],b:[36,8,8,28],c:[36,44,8,28],d:[8,72,28,8],e:[0,44,8,28],f:[0,8,8,28],g:[8,36,28,8]};for(const segment of segments[value])rect(x+boxes[segment][0],y+boxes[segment][1],boxes[segment][2],boxes[segment][3],[10,10,10]);};
 expected.rows.forEach((row,r)=>row.forEach((cell,c)=>{const x=30+c*210,y=30+r*195;rect(x,y,180,165,colors[cell.color]);rect(x+35,y+35,110,95,[255,255,255]);digit(Math.floor(cell.number/10),x+42,y+42);digit(cell.number%10,x+94,y+42);}));
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=2;
 const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(scan)),chunk('IEND',Buffer.alloc(0))]);return{png,expected,prompt,width,height};
}
export function score(text,expected){
 let value;try{value=JSON.parse(text);}catch{return{matchedCells:0,totalCells:6,outcome:'unknown_unparseable_answer'};}
 if(!value||Object.keys(value).join()!=='rows'||!Array.isArray(value.rows)||value.rows.length!==2||!value.rows.every(row=>Array.isArray(row)&&row.length===3&&row.every(cell=>cell&&Object.keys(cell).sort().join()==='color,number'&&Object.hasOwn(colors,cell.color)&&Number.isInteger(cell.number)&&cell.number>=10&&cell.number<=99)))return{matchedCells:0,totalCells:6,outcome:'unknown_invalid_answer'};
 let matchedCells=0;for(let r=0;r<2;r++)for(let c=0;c<3;c++)if(value.rows[r][c].color===expected.rows[r][c].color&&value.rows[r][c].number===expected.rows[r][c].number)matchedCells++;
 return{matchedCells,totalCells:6,outcome:matchedCells===6?'observed_pixel_understanding_once':'unknown_wrong_answer'};
}
export function validatePayload(payload,{modelId,prompt,image}){
 assert.equal(payload.model,modelId,'MODEL_CHANGED');assert.equal(payload.stream,true,'STREAM_REQUIRED');assert(!payload.tools?.length&&!payload.functions?.length,'TOOLS_DENIED');
 const allowed=new Set(['model','input','stream','store','max_output_tokens','temperature','top_p','reasoning','text','include','tools','tool_choice','instructions']);
 assert(Object.keys(payload).every(k=>payload[k]===undefined||allowed.has(k)),'PAYLOAD_EXTRA_CONTEXT');assert(payload.instructions===undefined||payload.instructions==='','INSTRUCTIONS_DENIED');
 assert(!payload.include?.length,'HIDDEN_OUTPUT_DENIED');assert(payload.reasoning===undefined,'REASONING_OVERRIDE_DENIED');assert(Number.isInteger(payload.max_output_tokens)&&payload.max_output_tokens>0&&payload.max_output_tokens<=2048,'OUTPUT_BUDGET_CHANGED');
 assert.equal(payload.input.length,1,'EXTRA_MESSAGE_DENIED');const message=payload.input[0];assert.equal(message.role,'user');assert.equal(message.content.length,2);
 assert(Object.keys(message).every(k=>['role','content','type'].includes(k)),'MESSAGE_EXTRA_CONTEXT');
 const text=message.content.find(v=>v.type==='input_text'),picture=message.content.find(v=>v.type==='input_image');assert.deepEqual(text,{type:'input_text',text:prompt});
 assert.equal(picture.image_url,'data:image/png;base64,'+image.toString('base64'),'IMAGE_CHANGED');assert(Object.keys(picture).every(k=>['type','image_url','detail'].includes(k)),'IMAGE_EXTRA_CONTEXT');
}
const moduleUrl=name=>pathToFileURL(path.join(root,'dist',name+'.js')).href;
const json=file=>fs.readFile(file,'utf8').then(JSON.parse),write=(dir,name,value)=>fs.writeFile(path.join(dir,name),JSON.stringify(value,null,2),{flag:'wx'});
async function prepare(){
 const source=await fs.realpath(argument('--source-profile')),entryId=argument('--entry-id'),db=new DatabaseSync(path.join(source,'slash.sqlite'),{readOnly:true});let model,encrypted;
 try{const get=k=>{const row=db.prepare('SELECT value FROM kv WHERE key=?').get(k);return row?JSON.parse(row.value):undefined;};model=get('state')?.models?.find(m=>m.id===entryId);assert(model,'MODEL_REQUIRED');assert.equal(model.protocol,'openai-responses','APPROVED_PROTOCOL_REQUIRED');encrypted=get('model-secret:'+entryId);assert(typeof encrypted==='string'&&encrypted,'ENCRYPTED_CREDENTIAL_REQUIRED');}finally{db.close();}
 const endpoint=new URL(model.baseUrl);assert(endpoint.protocol==='https:'&&!endpoint.username&&!endpoint.password&&!endpoint.search&&!endpoint.hash,'APPROVED_ENDPOINT_REQUIRED');
 const dir=path.join(root,'.test-data','vision-capability-'+randomUUID()),profile=path.join(dir,'cloud-profile');await fs.mkdir(profile,{recursive:true});
 await fs.copyFile(path.join(source,'Local State'),path.join(profile,'Local State'));
 const isolated=new DatabaseSync(path.join(profile,'slash.sqlite'));try{isolated.exec('CREATE TABLE kv(key TEXT PRIMARY KEY,value TEXT NOT NULL)');const insert=isolated.prepare('INSERT INTO kv VALUES(?,?)');insert.run('state',JSON.stringify({models:[{...identity(model),supportsVision:true,hasKey:true}],defaultModelId:entryId}));insert.run('model-secret:'+entryId,JSON.stringify(encrypted));}finally{isolated.close();}encrypted=undefined;
 const c=challenge();await fs.writeFile(path.join(dir,'challenge.png'),c.png,{flag:'wx'});await fs.writeFile(path.join(dir,'prompt.txt'),c.prompt,{flag:'wx'});await write(dir,'expected.local.json',c.expected);
 const protectedFiles=await Promise.all([script,...['main/model-runtime','main/model-proxy','main/settings'].map(n=>path.join(root,'dist',n+'.js')),path.join(root,'package-lock.json')].map(async file=>({file,sha256:hash(await fs.readFile(file))})));
 const manifest={version:1,dir,profile,sourceProfile:source,model:identity(model),temporaryVisionDeclarationOnly:true,sourceVisionUnchanged:true,imageHash:hash(c.png),promptHash:hash(c.prompt),expectedHash:hash(JSON.stringify(c.expected,null,2)),width:c.width,height:c.height,protectedFiles,maxRequests:1,maxRetries:0,timeoutMs:90000,maxOutputTokens:2048,tools:0,plaintextCredentialPersisted:false,historyCopied:false,cloudCalls:0};await write(dir,'manifest.json',manifest);console.log(JSON.stringify({status:'prepared',caseDir:dir,modelId:model.modelId,protocol:model.protocol,cloudCalls:0}));
}
async function frozen(){
 const dir=await fs.realpath(argument('--case-dir'));assert.equal(path.dirname(dir),path.join(root,'.test-data'),'CASE_SCOPE');assert(/^vision-capability-[0-9a-f-]{36}$/.test(path.basename(dir)),'CASE_SCOPE');const m=await json(path.join(dir,'manifest.json'));assert.equal(m.dir,dir);assert.equal(m.profile,path.join(dir,'cloud-profile'));
 for(const p of m.protectedFiles)assert.equal(hash(await fs.readFile(p.file)),p.sha256,'RUNTIME_CHANGED');
 const image=await fs.readFile(path.join(dir,'challenge.png')),request=await fs.readFile(path.join(dir,'prompt.txt'),'utf8'),expected=await json(path.join(dir,'expected.local.json'));assert.equal(hash(image),m.imageHash);assert.equal(hash(request),m.promptHash);assert.equal(hash(JSON.stringify(expected,null,2)),m.expectedHash);return{dir,m,image,request,expected};
}
async function completion(f,{localUrl,key,transport}){
 const {createOpenAICompatibleModelRuntime}=await import(moduleUrl('main/model-runtime'));
 const selected=f.m.model,baseUrl=localUrl??selected.baseUrl,endpoint=new URL(baseUrl),expectedPath=endpoint.pathname.replace(/\/$/,'')+'/responses';
 // The existing adapter's proxy hook overrides request fetch. Inject the same
 // modelProxyFetch through Pi's public fetch option so the one-request guard
 // surrounds the actual proxy transport; model/protocol/endpoint stay identical.
 const configured=await createOpenAICompatibleModelRuntime({entryId:selected.id,baseUrl,id:selected.modelId,protocol:selected.protocol,supportsVision:true,contextWindow:selected.contextWindow,maxTokens:selected.maxTokens},key);
 let requests=0,payloads=0,httpStatus;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),f.m.timeoutMs),started=performance.now();
 try{
  const guarded=async(input,init)=>{const target=new URL(typeof input==='string'||input instanceof URL?input:input.url);assert.equal(target.origin,endpoint.origin,'ENDPOINT_CHANGED');assert.equal(target.pathname,expectedPath,'PATH_CHANGED');assert.equal(init?.method,'POST');assert.equal(++requests,1,'SECOND_REQUEST_DENIED');assert.equal(payloads,1,'PAYLOAD_NOT_CHECKED');const response=await transport(input,{...init,redirect:'error'});httpStatus=response.status;return response;};
  const response=await configured.runtime.completeSimple(configured.model,{messages:[{role:'user',content:[{type:'text',text:f.request},{type:'image',data:f.image.toString('base64'),mimeType:'image/png'}],timestamp:Date.now()}]},{maxTokens:2048,maxRetries:0,timeoutMs:f.m.timeoutMs,signal:controller.signal,fetch:guarded,onPayload:p=>{assert.equal(++payloads,1,'SECOND_PAYLOAD_DENIED');validatePayload(p,{modelId:selected.modelId,prompt:f.request,image:f.image});}});
  const text=response.content.filter(b=>b.type==='text').map(b=>b.text).join('');return{requests,payloads,httpStatus,stopReason:response.stopReason,durationMs:Math.round(performance.now()-started),usage:Object.fromEntries(['input','output','totalTokens'].filter(k=>Number.isFinite(response.usage?.[k])).map(k=>[k,response.usage[k]])),...(response.stopReason==='stop'?score(text,f.expected):{outcome:'unknown_transport_or_truncated'}),maxRetries:0,rawThinkingStored:false,rawResponseStored:false};
 }finally{clearTimeout(timer);}
}
function stream(res,model,text){res.writeHead(200,{'content-type':'text/event-stream'});const item={type:'message',id:'msg-vision-fixture',role:'assistant',content:[{type:'output_text',text,annotations:[]}]};for(const event of [{type:'response.output_item.added',output_index:0,item:{...item,content:[]}},{type:'response.output_text.delta',output_index:0,content_index:0,delta:text},{type:'response.output_item.done',output_index:0,item},{type:'response.completed',response:{id:'vision-fixture',status:'completed',model,output:[item],usage:{input_tokens:10,output_tokens:10,total_tokens:20}}}])res.write('data: '+JSON.stringify(event)+'\n\n');res.end();}
async function preflight(){
 const f=await frozen(),scenarios=[];for(const rejection of [false,true]){
  let count=0;const failures=[];const server=createServer(async(req,res)=>{try{assert.equal(req.url,'/v1/responses');assert.equal(req.method,'POST');assert.equal(++count,1,'SECOND_WIRE_REQUEST');let raw='';for await(const part of req){raw+=part;assert(raw.length<100000,'LOCAL_PAYLOAD_LIMIT');}const p=JSON.parse(raw);validatePayload(p,{modelId:f.m.model.modelId,prompt:f.request,image:f.image});if(rejection)res.writeHead(500,{'content-type':'application/json'}).end('{"error":{"message":"LOCAL_EXPECTED_REJECTION"}}');else stream(res,p.model,JSON.stringify(f.expected));}catch(error){failures.push(error.code??'LOCAL_WIRE_FAILED');res.writeHead(400).end();}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));try{const observed=await completion(f,{localUrl:`http://127.0.0.1:${server.address().port}/v1`,key:'local-fixture-only',transport:globalThis.fetch});assert.deepEqual(failures,[]);assert.equal(count,1);assert.equal(observed.requests,1);assert.equal(observed.maxRetries,0);assert.equal(observed.outcome,rejection?'unknown_transport_or_truncated':'observed_pixel_understanding_once');scenarios.push({name:rejection?'500-does-not-retry':'exact-image-json-wire',...observed,visionUnderstandingVerified:false});}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 }const result={status:'passed_local_protocol_only',cloudCalls:0,localModelRequests:2,scenarios,sourceConfigurationWritten:false};await write(f.dir,'preflight-result.json',result);console.log(JSON.stringify({status:result.status,caseDir:f.dir,cloudCalls:0,scenarios:scenarios.length}));
}
async function cloudChild(){
 const {app,safeStorage}=createRequire(import.meta.url)('electron'),f=await frozen();await app.whenReady();let key;const result={cloudExecuted:true,configurationChanged:false,temporaryVisionDeclarationOnly:true};
 const db=new DatabaseSync(path.join(f.m.profile,'slash.sqlite'),{readOnly:true});
 try{
  const get=(name,fallback)=>{const row=db.prepare('SELECT value FROM kv WHERE key=?').get(name);return row?JSON.parse(row.value):fallback;},state=get('state',{});assert.deepEqual(identity({...state.models[0],supportsVision:f.m.model.supportsVision}),f.m.model,'MODEL_CHANGED');
  const {ModelSettings}=await import(moduleUrl('main/settings'));assert(safeStorage.isEncryptionAvailable(),'ENCRYPTION_UNAVAILABLE');const settings=new ModelSettings({get,set:()=>{throw Error('CONFIG_WRITE_DENIED');}},safeStorage,{get:()=>state,save:()=>{throw Error('CONFIG_WRITE_DENIED');}});key=settings.credential(f.m.model.id);assert(key,'CREDENTIAL_UNAVAILABLE');
  const {modelProxyFetch,closeModelProxyTransports}=await import(moduleUrl('main/model-proxy'));try{Object.assign(result,await completion(f,{key,transport:f.m.model.proxyUrl?modelProxyFetch(f.m.model.proxyUrl):globalThis.fetch}));}finally{await closeModelProxyTransports();}
  const source=new DatabaseSync(path.join(f.m.sourceProfile,'slash.sqlite'),{readOnly:true});try{const saved=JSON.parse(source.prepare('SELECT value FROM kv WHERE key=?').get('state').value).models.find(m=>m.id===f.m.model.id);assert.deepEqual(identity(saved),f.m.model,'SOURCE_CONFIGURATION_CHANGED');}finally{source.close();}
  result.status=result.outcome==='observed_pixel_understanding_once'?'passed_single_visual_observation':'unverified';
 }catch(error){result.status='failed';result.errorCode=String(error?.message??'').match(/^[A-Z][A-Z0-9_]+/)?.[0]??'PROBE_FAILED';}
 finally{key=undefined;db.close();await write(f.dir,'cloud-result.json',result);app.exit(result.status==='failed'?1:0);}
}
async function launch(){
 const f=await frozen();assert.equal((await json(path.join(f.dir,'preflight-result.json'))).status,'passed_local_protocol_only','LOCAL_PREFLIGHT_REQUIRED');await fs.writeFile(path.join(f.dir,'cloud-once.lock'),new Date().toISOString(),{flag:'wx'});
 const env={...process.env};delete env.NODE_OPTIONS;delete env.ELECTRON_RUN_AS_NODE;const child=spawn(path.join(root,'node_modules/electron/dist/electron.exe'),[script,'--electron-cloud','--case-dir',f.dir],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});const counts={stdoutBytes:0,stderrBytes:0};child.stdout.on('data',b=>counts.stdoutBytes+=b.length);child.stderr.on('data',b=>counts.stderrBytes+=b.length);
 const timer=setTimeout(()=>{if(child.exitCode===null){const killer=spawn('taskkill',['/pid',String(child.pid),'/t','/f'],{windowsHide:true,stdio:'ignore'});killer.once('error',()=>{});}},110000);const exit=await new Promise(resolve=>{child.once('error',()=>resolve(1));child.once('exit',resolve);});clearTimeout(timer);await write(f.dir,'launcher.json',{exit,...counts});const result=await json(path.join(f.dir,'cloud-result.json')).catch(()=>({status:'failed',errorCode:'CHILD_WITHOUT_RECEIPT'}));console.log(JSON.stringify({caseDir:f.dir,status:result.status,outcome:result.outcome,requests:result.requests,matchedCells:result.matchedCells,errorCode:result.errorCode}));process.exitCode=exit??1;
}
async function main(){if(args.includes('--prepare-only'))return prepare();if(args.includes('--preflight-only'))return preflight();if(args.includes('--run-cloud'))return launch();if(args.includes('--electron-cloud'))return cloudChild();throw Error('EXPLICIT_MODE_REQUIRED');}
if(process.versions.electron){const dir=path.resolve(argument('--case-dir')),m=JSON.parse(readFileSync(path.join(dir,'manifest.json'),'utf8'));assert(readFileSync(path.join(dir,'cloud-once.lock'),'utf8'));const {app}=createRequire(import.meta.url)('electron');app.setName('slash');app.setPath('userData',m.profile);app.setPath('sessionData',m.profile);void main().catch(()=>app.exit(1));}
else if(path.resolve(process.argv[1]??'')===script)await main().catch(error=>{console.error(JSON.stringify({status:'failed',errorCode:String(error?.message??'').match(/^[A-Z][A-Z0-9_]+/)?.[0]??'PROBE_FAILED'}));process.exitCode=1;});
