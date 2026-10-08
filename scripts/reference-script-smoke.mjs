import electronPath from 'electron';
import {spawn} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import {createServer} from 'node:http';
import {createSocket} from 'node:dgram';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

// Owner builds first. This launches a standalone Electron main harness against
// the built module, with a fresh profile and explicitly created test files.
const root=process.cwd(),output=path.join(root,'.test-data',`reference-script-${Date.now()}`);
await fs.mkdir(output,{recursive:true});
const original=path.join(output,'参考原件.txt'),copy=path.join(output,'参考原件_处理副本_fixture.txt');
await fs.writeFile(original,'真实参考原件\nimmutable source');await fs.copyFile(original,copy);
const digest=bytes=>createHash('sha256').update(bytes).digest('hex'),before=digest(await fs.readFile(original));
const evidence={status:'running',output,checks:[],httpRequests:0,udpPackets:0,sourceHashBefore:before};
const http=createServer((_request,response)=>{evidence.httpRequests++;response.end('unexpected network');});
const sockets=new Set();http.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
const udp=createSocket('udp4');udp.on('message',()=>evidence.udpPackets++);
await new Promise(resolve=>http.listen(0,'127.0.0.1',resolve));await new Promise(resolve=>udp.bind(0,'127.0.0.1',resolve));
const networkURL=`http://127.0.0.1:${http.address().port}/forbidden`,stun=`stun:127.0.0.1:${udp.address().port}`;
const harness=path.join(output,'harness.mjs');
const moduleURL=pathToFileURL(path.join(root,'dist','main','reference-script.js')).href;
await fs.writeFile(harness,`
import {app,BrowserWindow} from 'electron';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {runReferenceScript,REFERENCE_SCRIPT_LIMITS as limits} from ${JSON.stringify(moduleURL)};
app.setPath('userData',${JSON.stringify(path.join(output,'profile'))});
app.on('window-all-closed',()=>{});
console.log('HARNESS beforeReady');
app.whenReady().then(async()=>{
console.log('HARNESS ready');
const data={contentBase64:(await fs.readFile(${JSON.stringify(copy)})).toString('base64'),fileName:${JSON.stringify(copy)}};
const checks=[],details={};const pass=name=>{checks.push(name);console.log('PASS '+name);};
const run=script=>runReferenceScript({...data,script});
const expectError=async(script,pattern)=>{await assert.rejects(run(script),pattern);assert.equal(BrowserWindow.getAllWindows().length,0);};
try{
 if(process.argv.includes('--expect-refusal')){
  await expectError('return input.text;',/SANDBOX_REQUIRED/);pass('拒绝no-sandbox启动');
 }else{
  const prefs=[];app.on('web-contents-created',(_event,contents)=>{const value=contents.getLastWebPreferences();prefs.push({sandbox:value.sandbox,nodeIntegration:value.nodeIntegration,contextIsolation:value.contextIsolation,preload:value.preload});});
  const basic=JSON.parse(await run('return JSON.stringify({text:input.text,bytes:input.bytes.length,name:input.fileName});'));
  assert.equal(basic.text,'真实参考原件\\nimmutable source');assert.equal(basic.name,'参考原件_处理副本_fixture.txt');assert.ok(basic.bytes>basic.text.length);assert.equal(BrowserWindow.getAllWindows().length,0);pass('仅复制内容作为数据，名称为basename，字符串结果与窗口清理');
  assert.equal(await run('return [typeof require,typeof process,typeof Buffer,typeof window.pm].join(",");'),'undefined,undefined,undefined,undefined');
  assert.ok(prefs.every(value=>value.sandbox===true&&value.nodeIntegration===false&&value.contextIsolation===true&&!value.preload));details.preferences=prefs;assert.equal(await run('alert("fixture dialog");return "dialog disabled";'),'dialog disabled');pass('真实sandbox/noNode/noPreload/contextIsolation，无pm接口与弹窗');
  await expectError('return {not:"string"};',/RESULT_TYPE/);await expectError('return "x".repeat('+ (limits.outputBytes+1) +');',/OUTPUT_LIMIT/);pass('非字符串和输出超过2MiB拒绝');
  await expectError('return (;',/EXECUTION|SyntaxError/);await expectError('throw new Error("fixture failure");',/fixture failure/);pass('语法错误与throw均失败并清理');
  assert.equal(await run('try{new Function("return 1")();return "unsafe-eval";}catch{return "eval blocked";}'),'eval blocked');pass('CSP只允许inline，eval不可用');
  const network=JSON.parse(await run(${JSON.stringify(`
   const results={};
   for(const [name,url] of [['http',networkURL],['file',pathToFileURL(original).href]]){try{await fetch(url);results[name]='unexpected';}catch{results[name]='blocked';}}
   results.socket=await new Promise(resolve=>{try{const socket=new WebSocket(${JSON.stringify(networkURL.replace('http:','ws:'))});socket.onopen=()=>{socket.close();resolve('unexpected');};socket.onerror=()=>resolve('blocked');}catch{resolve('blocked');}});
   results.popup=window.open(${JSON.stringify(networkURL)})===null;
   const iframe=document.createElement('iframe');iframe.src=${JSON.stringify(networkURL)};document.body.append(iframe);
   const fileFrame=document.createElement('iframe');fileFrame.src=${JSON.stringify(pathToFileURL(original).href)};document.body.append(fileFrame);
   const image=document.createElement('img');image.src=${JSON.stringify(networkURL)};document.body.append(image);
   const anchor=document.createElement('a');anchor.href=${JSON.stringify(networkURL)};anchor.download='forbidden.txt';document.body.append(anchor);anchor.click();
   window.location.href=${JSON.stringify(networkURL)};
   await new Promise(resolve=>setTimeout(resolve,200));
   results.location=location.protocol;
   results.frameURL=iframe.contentDocument?.URL||null;
   results.fileFrameText=fileFrame.contentDocument?.body?.textContent||null;
   return JSON.stringify(results);
  `.replace('networkURL',JSON.stringify(networkURL)).replace('pathToFileURL(original).href',JSON.stringify(pathToFileURL(original).href)))}));
  details.network=network;assert.equal(network.http,'blocked');assert.equal(network.file,'blocked');assert.equal(network.socket,'blocked');assert.equal(network.popup,true);assert.equal(network.location,'data:');assert.notEqual(network.frameURL,${JSON.stringify(networkURL)});assert.equal(network.fileFrameText===null||network.fileFrameText==='',true);pass('fetch/file/WebSocket/导航/iframe/newWindow/download无出口');
  const rtc=JSON.parse(await run(${JSON.stringify(`
   const result={global:typeof RTCPeerConnection,transport:typeof WebTransport,frameAttempt:false};
   const frame=document.createElement('iframe');document.body.append(frame);
   const Native=frame.contentWindow?.RTCPeerConnection;
   if(Native){result.frameAttempt=true;const peer=new Native({iceServers:[{urls:${JSON.stringify(stun)}}]});peer.createDataChannel('attempt');try{await peer.setLocalDescription(await peer.createOffer());await new Promise(resolve=>setTimeout(resolve,300));}catch{}peer.close();}
   return JSON.stringify(result);
  `)}));
  details.rtc=rtc;assert.equal(rtc.global,'undefined');assert.equal(rtc.transport,'undefined');pass('WebRTC/WebTransport入口禁用，iframe新realm尝试受网络策略限制');
  const start=Date.now();await expectError('while(true){}',/TIMEOUT/);assert.ok(Date.now()-start>=limits.timeoutMs-100&&Date.now()-start<limits.timeoutMs+5000);pass('真实无限循环被总时限终止');
  const controller=new AbortController();const pending=runReferenceScript({...data,script:'while(true){}',signal:controller.signal});setTimeout(()=>controller.abort(),250);await assert.rejects(pending,/CANCELLED/);assert.equal(BrowserWindow.getAllWindows().length,0);pass('取消销毁正在执行的renderer');
  await assert.rejects(runReferenceScript({...data,script:'return input.text;',contentBase64:Buffer.alloc(limits.inputBytes+1).toString('base64')}),/INPUT_LIMIT/);
  await expectError(' '.repeat(limits.scriptBytes+1),/SCRIPT_LIMIT/);pass('输入和脚本体积上限');
 }
 console.log(JSON.stringify({status:'passed',checks,details}));app.exit(0);
}catch(error){console.error(error.message);app.exit(1);}
}).catch(error=>{console.error(error.message);app.exit(1);});
`);
async function launch(extra=[]){
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const args=extra.length?['--no-sandbox',harness,'--expect-refusal']:[harness];
 return new Promise((resolve,reject)=>{
  const child=spawn(electronPath,args,{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';
  evidence.fixturePids??=[];evidence.fixturePids.push(child.pid);
  const progress=createWriteStream(path.join(output,args.length?'no-sandbox-progress.log':'progress.log'));
  const timer=setTimeout(()=>{
   if(process.platform==='win32')spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
   else child.kill('SIGKILL');
   progress.end();reject(Error('Electron smoke exceeded90秒'));
  },90000);
  child.stdout.on('data',chunk=>{stdout+=chunk;progress.write(chunk);process.stdout.write(chunk);});child.stderr.on('data',chunk=>{stderr+=chunk;progress.write(chunk);});
  child.once('error',error=>{clearTimeout(timer);progress.end();reject(error);});child.once('exit',code=>{clearTimeout(timer);progress.end();if(code!==0)return reject(Error(`Electron smoke exit${code}: ${stderr.slice(-2000)} ${stdout.slice(-500)}`));const result=stdout.trim().split(/\r?\n/).findLast(line=>line.startsWith('{'));resolve(JSON.parse(result));});
 });
}
try{
 evidence.harnessResults=[];
 for(const args of [[],['--no-sandbox']]){const result=await launch(args);evidence.checks.push(...result.checks);evidence.harnessResults.push(result.details);}
 evidence.sourceHashAfter=digest(await fs.readFile(original));assert.equal(evidence.sourceHashAfter,before);assert.equal(digest(await fs.readFile(copy)),before);evidence.checks.push('原件与已复制输入hash均不变');
 assert.equal(evidence.httpRequests,0);assert.equal(evidence.udpPackets,0);evidence.checks.push('受控HTTP/UDP监听未收到请求');evidence.status='passed';
}catch(error){evidence.status='failed';evidence.error=error.message;throw error;}
finally{for(const socket of sockets)socket.destroy();await new Promise(resolve=>http.close(resolve));await new Promise(resolve=>udp.close(resolve));await fs.writeFile(path.join(output,'result.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({status:evidence.status,output,checks:evidence.checks.length,error:evidence.error}));}
