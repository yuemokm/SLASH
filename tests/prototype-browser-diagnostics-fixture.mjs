// Isolated Node module mock: exercises the actual production runner/bounded
// callbacks without opening Electron or changing its production timers.
import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createHash} from 'node:crypto';
let scenario='success',phase,releaseProxy;
const never=()=>new Promise(()=>{});
const image={getSize:()=>({width:1100,height:760}),resize(){return this;},toPNG:()=>Buffer.from([137,80,78,71,13,10,26,10,0])};
class FakeWindow {
 constructor(){this.destroyed=false;let paintCount=0;const contents=new EventEmitter();
  Object.assign(contents,{setAudioMuted(){},setWebRTCIPHandlingPolicy(){},setWindowOpenHandler(){},getURL:()=> 'https://fixture.invalid/index.html',forcefullyCrashRenderer:()=>contents.emit('render-process-gone'),capturePage:()=>{phase='screenshot';if(scenario==='capture-issue')contents.emit('console-message',{},3);return ['screenshot','cancel-screenshot','assertion-screenshot'].includes(scenario)?never():Promise.resolve(image);},executeJavaScriptInIsolatedWorld:async(_world,[{code}])=>{
   if(code.includes('new Promise(resolve')){paintCount++;if(paintCount===1){phase='viewport';if(scenario==='viewport')return never();}return;}
   if(code.includes('"operation":"viewport"'))return{ok:true,width:1100,height:760};
   phase='step';if(scenario==='step')return never();if(scenario==='action-error'&&code.includes('"operation":"click"'))return{ok:true,x:20,y:20};return{ok:true,value:scenario!=='assertion-screenshot'};
  }});
  contents.debugger=Object.assign(new EventEmitter(),{attach(){},sendCommand:async(method)=>{if(scenario==='action-error'&&method==='Input.dispatchMouseEvent'){contents.emit('console-message',{},3);contents.debugger.emit('message',{},'Runtime.consoleAPICalled',{type:'error',args:[{type:'object',subtype:'error',description:"HierarchyRequestError: Failed to execute 'appendChild' on 'Node': This node type does not support this method."}]});}}});this.webContents=contents;
 }
 loadURL(){phase='initialization';return scenario==='initialization'||scenario==='total'?never():scenario==='slow-initialization'?new Promise(resolve=>setTimeout(resolve,4000)):Promise.resolve();}
 isDestroyed(){return this.destroyed;}
 destroy(){this.destroyed=true;}
}
const isolated=()=>({setProxy:async()=>{if(scenario==='setup-error')throw Error('synthetic setup error must not leak');if(scenario==='total'){phase='proxy';await new Promise(r=>releaseProxy=r);}},enableNetworkEmulation(){},setPermissionRequestHandler(){},setPermissionCheckHandler(){},setDevicePermissionHandler(){},on(){},removeListener(){},protocol:{handle(){},unhandle(){}},webRequest:{onBeforeRequest(){}},clearStorageData:async()=>{},clearCache:async()=>{}});
mock.module('electron',{namedExports:{app:{isReady:()=>true,commandLine:{hasSwitch:()=>false}},BrowserWindow:FakeWindow,session:{fromPartition:isolated}}});
const {runPrototypeAcceptance,prototypeBrowserActiveCount}=await import('../main/prototype-browser.ts');
const html=Buffer.from('<!doctype html><p id="x">ok</p>'),snapshot=new Map([['index.html',{bytes:html,hash:createHash('sha256').update(html).digest('hex')}]]);
const input=signal=>({entryPath:'index.html',snapshot,cases:[{id:'case',title:'test',steps:[{action:'assert',assertion:'visible',selector:'#x',expected:true}]}],signal});
async function until(expected){for(let n=0;n<100;n++){if(phase===expected)return;await Promise.resolve();}assert.fail('Runner did not reach '+expected);}
for(const target of ['initialization','viewport','step','screenshot'])test('actual runner real timer callback attributes '+target,async t=>{
 scenario=target;phase=undefined;t.mock.timers.enable({apis:['setTimeout']});const pending=runPrototypeAcceptance(input());await until(target);t.mock.timers.tick(target==='initialization'?10000:3000);const r=await pending,c=r.cases[0];
 assert.equal(c.status,'unknown');assert.equal(c.diagnostics.timeoutPhase,target);assert.equal(c.diagnostics.stoppedPhase,target);assert.equal(c.diagnostics.stopReason,'PROTOTYPE_STEP_TIMEOUT');assert.equal(c.diagnostics.phaseTimings.at(-1).phase,target);
 assert.ok(c.diagnostics.phaseTimings.every(p=>Number.isFinite(p.elapsedMs)&&p.elapsedMs>=0));
 if(target==='initialization'||target==='viewport')assert.equal(c.steps[0].status,'not_run');
 if(target==='screenshot')assert.equal(c.steps[0].status,'passed');
});
test('renderer initialization can take longer than an interaction without relaxing step timers',async t=>{
 scenario='slow-initialization';phase=undefined;t.mock.timers.enable({apis:['setTimeout']});const pending=runPrototypeAcceptance(input());await until('initialization');t.mock.timers.tick(3000);await Promise.resolve();assert.equal(phase,'initialization');assert.equal(prototypeBrowserActiveCount(),1);t.mock.timers.tick(1000);const result=await pending;
 assert.equal(result.status,'passed');assert.equal(result.cases[0].diagnostics.stopReason,undefined);assert.equal(result.cases[0].steps[0].status,'passed');assert.equal(prototypeBrowserActiveCount(),0);
});
test('actual total timer expires in active initialization rather than step timer',async t=>{
 scenario='total';phase=undefined;t.mock.timers.enable({apis:['setTimeout']});const request=input();request.cases.push({...request.cases[0],id:'second'});const pending=runPrototypeAcceptance(request);await until('proxy');t.mock.timers.tick(59000);releaseProxy();await until('initialization');t.mock.timers.tick(1000);const result=await pending,c=result.cases[0];
 assert.equal(c.diagnostics.stopReason,'PROTOTYPE_TOTAL_TIMEOUT');assert.equal(c.diagnostics.timeoutPhase,'initialization');assert.equal(c.steps[0].status,'not_run');
 assert.equal(result.cases[1].steps[0].status,'not_run');assert.deepEqual(result.cases[1].diagnostics.phaseTimings,[]);assert.equal(result.cases[1].diagnostics.timeoutPhase,undefined);assert.equal(result.cases[1].diagnostics.stoppedPhase,undefined);assert.equal(prototypeBrowserActiveCount(),0);
});
test('actual screenshot external cancellation preserves passed steps without timeout',async()=>{
 scenario='cancel-screenshot';phase=undefined;const controller=new AbortController(),pending=runPrototypeAcceptance(input(controller.signal));await until('screenshot');controller.abort();const c=(await pending).cases[0];
 assert.equal(c.steps[0].status,'passed');assert.equal(c.diagnostics.stoppedPhase,'screenshot');assert.equal(c.diagnostics.stopReason,'PROTOTYPE_CANCELLED');assert.equal(c.diagnostics.timeoutPhase,undefined);
 assert.equal(prototypeBrowserActiveCount(),0);
});
test('actual setup error has no invented initialization timing',async()=>{
 scenario='setup-error';phase=undefined;const c=(await runPrototypeAcceptance(input())).cases[0];assert.deepEqual(c.diagnostics.phaseTimings,[]);assert.equal(c.diagnostics.stoppedPhase,undefined);assert.equal(c.diagnostics.timeoutPhase,undefined);assert.equal(c.diagnostics.stopReason,'PROTOTYPE_EXECUTION_UNAVAILABLE');assert.equal(c.steps[0].status,'not_run');
});
test('actual successful runner records four bounded phases without changing status',async()=>{
 scenario='success';phase=undefined;const r=await runPrototypeAcceptance(input()),c=r.cases[0];assert.equal(r.status,'passed');assert.equal(c.status,'passed');assert.deepEqual(c.diagnostics.phaseTimings.map(p=>p.phase),['initialization','viewport','step','screenshot']);assert.equal(c.diagnostics.phaseTimings[2].stepIndex,0);assert.equal(c.diagnostics.stopReason,undefined);assert.equal(r.screenshots.length,1);
});
test('actual assertion failure remains observed when screenshot timer later expires',async t=>{
 scenario='assertion-screenshot';phase=undefined;t.mock.timers.enable({apis:['setTimeout','Date']});const pending=runPrototypeAcceptance(input());await until('step');
 for(let n=0;n<58&&phase!=='screenshot';n++){for(let flush=0;flush<20;flush++)await Promise.resolve();t.mock.timers.tick(50);}
 await until('screenshot');t.mock.timers.tick(3000);const c=(await pending).cases[0];
 assert.equal(c.steps[0].status,'failed');assert.equal(c.steps[0].reason,'PROTOTYPE_ASSERTION_MISMATCH');assert.equal(c.status,'unknown');assert.equal(c.diagnostics.stopReason,'PROTOTYPE_STEP_TIMEOUT');assert.equal(c.diagnostics.timeoutPhase,'screenshot');assert.equal(c.diagnostics.stoppedPhase,'screenshot');
});
test('actual issue appearing during capture records screenshot stop without claiming timeout',async()=>{
 scenario='capture-issue';phase=undefined;const c=(await runPrototypeAcceptance(input())).cases[0];assert.equal(c.steps[0].status,'passed');assert.equal(c.status,'unknown');assert.equal(c.reason,'PROTOTYPE_RUNTIME_EXCEPTION');assert.equal(c.diagnostics.stopReason,c.reason);assert.equal(c.diagnostics.stoppedPhase,'screenshot');assert.equal(c.diagnostics.timeoutPhase,undefined);
});
test('actual bounded current guard records revoked authorization without timeout or active window',async()=>{
 scenario='success';phase=undefined;const c=(await runPrototypeAcceptance({...input(),assertCurrent:()=>{if(phase==='initialization')throw Error('revoked');}})).cases[0];assert.equal(c.diagnostics.stopReason,'PROTOTYPE_AUTHORIZATION_CHANGED');assert.equal(c.diagnostics.stoppedPhase,'initialization');assert.equal(c.diagnostics.timeoutPhase,undefined);assert.equal(c.steps[0].status,'not_run');assert.equal(prototypeBrowserActiveCount(),0);
});
test('actual final authorization guard outside phases records no invented stop phase',async()=>{
 scenario='success';phase=undefined;const c=(await runPrototypeAcceptance({...input(),assertCurrent:()=>{if(phase==='screenshot'&&prototypeBrowserActiveCount()===0)throw Error('revoked after cleanup');}})).cases[0];assert.equal(c.status,'unknown');assert.equal(c.steps[0].status,'passed');assert.equal(c.diagnostics.stopReason,'PROTOTYPE_AUTHORIZATION_CHANGED');assert.equal(c.diagnostics.stoppedPhase,undefined);assert.equal(c.diagnostics.timeoutPhase,undefined);assert.equal(c.diagnostics.phaseTimings.length,4);assert.equal(prototypeBrowserActiveCount(),0);
});
test('runtime error during native action is unknown, later steps not run, first phase remains step through screenshot',async()=>{
 scenario='action-error';phase=undefined;const request=input();request.cases[0].steps=[{action:'click',selector:'#x'},...request.cases[0].steps];const r=await runPrototypeAcceptance(request),c=r.cases[0];
 assert.equal(r.status,'unknown');assert.equal(c.steps[0].status,'unknown');assert.equal(c.steps[0].reason,'PROTOTYPE_RUNTIME_EXCEPTION');assert.equal(c.steps[1].status,'not_run');assert.equal(c.diagnostics.stoppedPhase,'step');assert.equal(c.diagnostics.runtimeErrors[0].phase,'step');assert.equal(c.diagnostics.runtimeErrors[0].stepIndex,0);assert.equal(c.diagnostics.runtimeErrors[0].domMethod,'appendChild');assert.equal(prototypeBrowserActiveCount(),0);
});
test('successful run leaves optional runtime errors absent for historical compatibility',async()=>{
 scenario='success';phase=undefined;const r=await runPrototypeAcceptance(input());assert.equal(r.cases[0].diagnostics.runtimeErrors,undefined);
});
