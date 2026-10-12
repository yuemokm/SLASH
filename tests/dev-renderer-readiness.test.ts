import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createServer, type Server} from 'node:http';
import {test} from 'node:test';
import {waitForRenderer} from '../scripts/renderer-readiness.mjs';

const html='<!doctype html><div id="root"></div><script type="module" src="/src/main.tsx"></script>';
const child=()=>Object.assign(new EventEmitter(),{exitCode:null,signalCode:null});
const budgets={listenTimeoutMs:800,responseTimeoutMs:800,connectTimeoutMs:100,retryDelayMs:15};
async function listen(server:Server){
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 return `http://127.0.0.1:${(server.address() as {port:number}).port}/`;
}
async function close(server:Server){server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}

test('a connected cold HTML response above the old 750ms limit succeeds without restarting it',async()=>{
 let requests=0;
 const server=createServer((_req,res)=>{requests++;setTimeout(()=>res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end(html),1100);});
 try{
  const url=await listen(server);
  await assert.rejects(fetch(url,{signal:AbortSignal.timeout(750)}),{name:'TimeoutError'});
  const process=child(),started=Date.now();
  await waitForRenderer(process,url,{...budgets,responseTimeoutMs:2000});
  assert.ok(Date.now()-started>=1000);assert.equal(requests,2);
  assert.equal(process.listenerCount('exit'),0);assert.equal(process.listenerCount('error'),0);
 }finally{await close(server);}
});

test('HTTP errors are retried and only complete valid HTML is ready',async()=>{
 let requests=0;
 const server=createServer((_req,res)=>{
  requests++;
  if(requests===1){res.writeHead(503).end('Not ready');return;}
  if(requests===2){res.writeHead(200,{'Content-Type':'text/html'}).end('<div>Wrong server</div>');return;}
  res.writeHead(200,{'Content-Type':'text/html'}).end(html);
 });
 try{await waitForRenderer(child(),await listen(server),budgets);assert.equal(requests,3);}finally{await close(server);}
});

test('persistent HTTP status is preserved in the bounded failure diagnostic',async()=>{
 const server=createServer((_req,res)=>res.writeHead(503).end('Not ready'));
 try{await assert.rejects(waitForRenderer(child(),await listen(server),{...budgets,responseTimeoutMs:180}),/last result: HTTP 503/);}finally{await close(server);}
});

test('headers and partial HTML do not count as a complete page',async()=>{
 const server=createServer((_req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.write(html);});
 try{await assert.rejects(waitForRenderer(child(),await listen(server),{...budgets,responseTimeoutMs:180}),/waiting for complete HTML timed out.*current request: HTTP 200; waiting for complete response/);}finally{await close(server);}
});

test('renderer exit interrupts an in-flight HTTP response immediately',async()=>{
 const process=child();
 const server=createServer(()=>setTimeout(()=>process.emit('exit',2,null),30));
 try{await assert.rejects(waitForRenderer(process,await listen(server),budgets),/renderer exited before readiness \(code 2, signal none\)/);}finally{await close(server);}
});

test('renderer spawn failure preserves its actual cause',async()=>{
 const process=child();
 const server=createServer(()=>setTimeout(()=>process.emit('error',Object.assign(new Error('spawn failed'),{code:'ENOENT'})),30));
 try{await assert.rejects(waitForRenderer(process,await listen(server),budgets),/renderer failed before readiness: ENOENT: spawn failed/);}finally{await close(server);}
});

test('cancellation interrupts a pending response and removes lifecycle listeners',async()=>{
 const process=child(),controller=new AbortController();
 const server=createServer(()=>setTimeout(()=>controller.abort(),30));
 try{
  await assert.rejects(waitForRenderer(process,await listen(server),{...budgets,signal:controller.signal}),/renderer readiness cancelled/);
  assert.equal(process.listenerCount('exit'),0);assert.equal(process.listenerCount('error'),0);
 }finally{await close(server);}
});

test('unopened port reports the actual connection failure at the listening deadline',async()=>{
 const server=createServer(),url=await listen(server);await close(server);
 await assert.rejects(waitForRenderer(child(),url,{...budgets,listenTimeoutMs:180}),/waiting for HTTP connection timed out.*ECONNREFUSED/);
});

test('an already signalled renderer cannot be mistaken for a running process',async()=>{
 const process=Object.assign(child(),{signalCode:'SIGTERM'});
 await assert.rejects(waitForRenderer(process,'http://127.0.0.1:1/',budgets),/signal SIGTERM/);
});

test('the connected response gets its own budget after waiting for Vite to listen',async()=>{
 const reserve=createServer(),url=await listen(reserve),port=(reserve.address() as {port:number}).port;
 await close(reserve);
 const server=createServer((_req,res)=>setTimeout(()=>res.writeHead(200,{'Content-Type':'text/html'}).end(html),500));
 const timer=setTimeout(()=>server.listen(port,'127.0.0.1'),180);
 try{await waitForRenderer(child(),url,{...budgets,listenTimeoutMs:400,responseTimeoutMs:800});}
 finally{clearTimeout(timer);await close(server);}
});

test('an already cancelled launch makes no HTTP request',async()=>{
 let requests=0;
 const server=createServer((_req,res)=>{requests++;res.end();}),controller=new AbortController();controller.abort();
 try{await assert.rejects(waitForRenderer(child(),await listen(server),{...budgets,signal:controller.signal}),/renderer readiness cancelled/);assert.equal(requests,0);}finally{await close(server);}
});

test('a closed socket before the complete body is reported and retried within the budget',async()=>{
 const server=createServer((_req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.write(html);setTimeout(()=>res.destroy(),10);});
 try{await assert.rejects(waitForRenderer(child(),await listen(server),{...budgets,responseTimeoutMs:180}),/last result: (ECONNRESET|socket hang up|.*aborted)/);}finally{await close(server);}
});
