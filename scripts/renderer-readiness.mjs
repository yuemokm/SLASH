import {get} from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';

// Listening and serving the first HTML are separate phases. A cold Vite request
// can remain connected while dependency discovery runs; restarting it every
// 750ms discards a healthy response. Neither phase can wait indefinitely.
export async function waitForRenderer(child,url,{
 signal,listenTimeoutMs=30_000,responseTimeoutMs=30_000,
 connectTimeoutMs=750,retryDelayMs=100,
}={}){
 const controller=new AbortController();
 let timer,connected=false,lastObservation='no HTTP response received',currentObservation='not connected';
 const abort=reason=>controller.abort(reason);
 const armDeadline=(milliseconds,phase)=>{
  clearTimeout(timer);
  timer=setTimeout(()=>abort(new Error(`renderer did not become ready at ${url}: ${phase} timed out after ${milliseconds}ms; last result: ${lastObservation}; current request: ${currentObservation}`)),milliseconds);
 };
 const onExit=(code,exitSignal)=>abort(new Error(`renderer exited before readiness (code ${code??'none'}, signal ${exitSignal??'none'})`));
 const onError=error=>abort(new Error(`renderer failed before readiness: ${describeError(error)}`));
 const onCancel=()=>abort(new Error('renderer readiness cancelled'));
 child.once('exit',onExit);
 child.once('error',onError);
 signal?.addEventListener('abort',onCancel,{once:true});
 armDeadline(listenTimeoutMs,'waiting for HTTP connection');
 if(signal?.aborted)onCancel();
 if(child.exitCode!==null||child.signalCode!=null)onExit(child.exitCode,child.signalCode);
 try{
  while(true){
   controller.signal.throwIfAborted();
   try{
    currentObservation='connecting HTTP';
    const result=await probeHtml(url,{
     signal:controller.signal,connectTimeoutMs,
     onConnected:()=>{
      currentObservation='HTTP connected; waiting for complete HTML';
      if(!connected){
       connected=true;armDeadline(responseTimeoutMs,'waiting for complete HTML');
      }
     },
     onHeaders:status=>{currentObservation=`HTTP ${status}; waiting for complete response`;},
    });
    lastObservation=result;
    currentObservation='completed';
    if(result==='HTTP 200 with complete Slash HTML')return;
   }catch(error){
    controller.signal.throwIfAborted();
    lastObservation=describeError(error);
    currentObservation='failed';
   }
   await delay(retryDelayMs,undefined,{signal:controller.signal});
  }
 }catch(error){
  if(controller.signal.aborted)throw controller.signal.reason;
  throw error;
 }finally{
  clearTimeout(timer);
  child.off('exit',onExit);
  child.off('error',onError);
  signal?.removeEventListener('abort',onCancel);
 }
}

function describeError(error){
 return `${error?.code?`${error.code}: `:''}${error instanceof Error?error.message:String(error)}`;
}

function probeHtml(url,{signal,connectTimeoutMs,onConnected,onHeaders}){
 return new Promise((resolve,reject)=>{
  let connectionTimer;
  // A direct loopback request is independent of fetch's global dispatcher/proxy.
  const request=get(url,{agent:false,signal,headers:{Accept:'text/html'}},response=>{
   onHeaders(response.statusCode);
   let html='',bytes=0;
   response.setEncoding('utf8');
   response.on('data',chunk=>{
    bytes+=Buffer.byteLength(chunk);
    if(bytes>1_048_576){request.destroy(new Error('HTTP HTML response exceeded 1 MiB'));return;}
    html+=chunk;
   });
   response.once('error',reject);
   response.once('end',()=>{
    if(response.statusCode!==200){resolve(`HTTP ${response.statusCode} ${response.statusMessage??''}`.trim());return;}
    if(!/^text\/html(?:;|$)/i.test(response.headers['content-type']??'')){
     resolve(`HTTP 200 with unexpected Content-Type ${response.headers['content-type']??'(missing)'}`);return;
    }
    const hasRoot=/\bid=["']root["']/.test(html);
    const hasEntry=/<script\b[^>]*\bsrc=["']\/src\/main\.tsx["'][^>]*>/.test(html);
    resolve(hasRoot&&hasEntry?'HTTP 200 with complete Slash HTML':'HTTP 200 missing Slash root or renderer entry');
   });
  });
  request.once('socket',socket=>{
   connectionTimer=setTimeout(()=>request.destroy(new Error(`HTTP connection timed out after ${connectTimeoutMs}ms`)),connectTimeoutMs);
   socket.once('connect',()=>{clearTimeout(connectionTimer);onConnected();});
  });
  request.once('error',reject);
  request.once('close',()=>clearTimeout(connectionTimer));
 });
}
