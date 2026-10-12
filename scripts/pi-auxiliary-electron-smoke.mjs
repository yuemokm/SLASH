import {app} from 'electron';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {gunzipSync} from 'node:zlib';




// Run against the separately compiled desktop files. This script never builds or calls cloud services.
const watchdog=setTimeout(()=>{console.error('AUXILIARY_SMOKE_TIMEOUT');app.exit(1);},90000);
console.log('AUXILIARY_SMOKE_START');
process.on('uncaughtException',error=>{console.error('AUXILIARY_UNCAUGHT',error);app.exit(1);});
process.on('unhandledRejection',error=>{console.error('AUXILIARY_UNHANDLED',error);app.exit(1);});
async function run(){
await app.whenReady();
console.log('AUXILIARY_ELECTRON_READY');
const hash=text=>createHash('sha256').update(text).digest('hex');
const evidence={runtime:process.versions.electron,compiled:true,cloudCalls:false,checks:[]};
let review,collector,observability;
try{
 const {analyzePiLensDraft}=await import('../dist/main/pi-lens.js');
 const {startPiPlanReview}=await import('../dist/main/pi-plan-review.js');
 const {createPiObservabilityExtension}=await import('../dist/main/pi-observability.js');
 console.log('AUXILIARY_MODULES_LOADED');
 console.log('AUXILIARY_LENS_START');
 const code='function compute(value) { return eval(value); }';
 const lens=await analyzePiLensDraft({changeId:'electron-smoke',path:'prototype.js',content:code,contentHash:hash(code)});
 assert.ok(lens.report.diagnostics.some(item=>item.rule==='no-global-eval-js'&&item.severity==='error'));evidence.checks.push('pi-lens 4.4.0 published worker: specific AST diagnostic on disposable draft');
 console.log('AUXILIARY_LENS_PASSED');
 const plan='# 方案 1：先验证来源\n\n保留当前研究型 Plan，只评阅与批注。';let returned;
 review=await startPiPlanReview(plan,{runId:'electron-plan',mode:'plan',openReview:async()=>{},onFeedback:async receipt=>{returned=receipt;}});
 assert.equal((await fetch(`http://127.0.0.1:${review.upstreamPort}/api/plan`)).status,403);
 const page=await fetch(review.url);assert.equal(page.status,200);assert.ok((await page.text()).includes('plannotator'));const cookie=page.headers.get('set-cookie').split(';')[0],base=new URL(review.url).origin,headers={cookie,'content-type':'application/json'};
 const payload=await(await fetch(base+'/api/plan',{headers})).json();assert.equal(payload.plan,plan);
 assert.equal((await fetch(base+'/api/doc?path=C:/',{headers})).status,403);
 const decision=await fetch(base+'/api/deny',{method:'POST',headers,body:JSON.stringify({serverSession:payload.serverSession,planRevision:0,feedback:'补充来源日期',planSave:{enabled:false}})});assert.equal(decision.status,200);await review.completion;assert.equal(returned.feedback,'补充来源日期');assert.equal(returned.planHash,hash(plan));assert.equal(returned.runId,'electron-plan');assert.equal(returned.approved,false);await review.close();review=undefined;
 evidence.checks.push('Plannotator 0.28.8 TS/HTML published files: protected loopback review and annotation returns to exact Plan/run');
 console.log('AUXILIARY_PLAN_PASSED');
 const payloads=[];collector=createServer(async(req,res)=>{const chunks=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));let body=Buffer.concat(chunks);if(req.headers['content-encoding']==='gzip')body=gunzipSync(body);payloads.push(body);res.writeHead(200,{'content-type':'application/json'});res.end('{}');});await new Promise(resolve=>collector.listen(0,'127.0.0.1',resolve));
 const handlers=new Map(),diagnostics=[];
 observability=createPiObservabilityExtension({enabled:true,baseUrl:`http://127.0.0.1:${collector.address().port}`,publicKey:'pk-lf-electron-local-mock',secretKey:'sk-lf-electron-local-mock',mode:'metadata',onDiagnostic:value=>diagnostics.push(value)});
 await observability({on:(name,handler)=>handlers.set(name,handler)});assert.deepEqual(diagnostics,[]);assert.ok(handlers.has('message_end'));
 const context={model:{id:'local-mock',provider:'local-mock'},sessionManager:{getSessionId:()=> 'private-session'},cwd:'private-path'};
 for(const [name,event]of [['session_start',{}],['before_agent_start',{prompt:'SECRET_DOCUMENT',images:[{data:'SECRET_IMAGE'}]}],['before_provider_request',{payload:'SECRET_PAYLOAD'}],['message_end',{message:{role:'assistant',content:[{type:'text',text:'SECRET_DOCUMENT'}],stopReason:'stop',usage:{input:42,output:7}}}],['agent_settled',{}]])await handlers.get(name)?.(event,context);
 await observability.close();observability=undefined;assert.ok(payloads.length>0);const exported=Buffer.concat(payloads).toString('utf8');assert.ok(exported.includes('langfuse'));assert.ok(!/SECRET_|private-path|private-session/.test(exported));assert.deepEqual(diagnostics,[]);
 evidence.checks.push('Langfuse 0.1.2 published TS factory and actual OTLP exporter: local protocol mock receives spans; document/image/path omitted');
 console.log(JSON.stringify({...evidence,passed:true},null,2));
}catch(error){console.error(JSON.stringify({...evidence,passed:false,error:String(error?.stack??error)},null,2));process.exitCode=1;}
finally{await review?.close();await observability?.close();if(collector)await new Promise(resolve=>collector.close(()=>resolve()));clearTimeout(watchdog);app.exit(process.exitCode??0);}}

void run().catch(error=>{console.error(error);app.exit(1);});
