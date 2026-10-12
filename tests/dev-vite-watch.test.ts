import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createServer} from 'vite';
import actualConfig from '../vite.config.js';

async function waitFor(predicate:()=>boolean){for(let i=0;i<300;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('Vite watcher timeout');}
test('实际Vite配置：测试HTML不重载；合法源码HMR继续发送更新',{timeout:15000},async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'slash-vite-watch-'));
 await fs.mkdir(path.join(root,'src'));await fs.mkdir(path.join(root,'.test-data','fixture'),{recursive:true});
 await fs.writeFile(path.join(root,'index.html'),'<div id="root"></div><script type="module" src="/src/main.ts"></script>');
 const source=path.join(root,'src','main.ts');await fs.writeFile(source,'export const marker="before";if(import.meta.hot)import.meta.hot.accept();');
 const server=await createServer({...actualConfig,root,configFile:false,logLevel:'silent',server:{...actualConfig.server,host:'127.0.0.1',port:0,strictPort:false}});await server.listen();
 const address=server.httpServer!.address();assert(address&&typeof address!=='string');const origin=`http://127.0.0.1:${address.port}`;
 const socket=new WebSocket(origin.replace('http:','ws:')+`/?token=${server.config.webSocketToken}`,'vite-hmr');
 const messages:Array<{type:string;path?:string;updates?:Array<{path:string}>}>=[];socket.addEventListener('message',event=>messages.push(JSON.parse(String(event.data))));
 t.after(async()=>{socket.close();await server.close();assert.equal(path.dirname(root),os.tmpdir());assert.ok(path.basename(root).startsWith('slash-vite-watch-'));await fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:30});});
 await waitFor(()=>messages.some(message=>message.type==='connected'));
 assert.equal((await fetch(origin+'/')).status,200);assert.equal((await fetch(origin+'/src/main.ts')).status,200);
 // Real filesystem writes exercise Vite's watcher and WebSocket transport.
 await fs.writeFile(path.join(root,'.test-data','fixture','generated.html'),'<p>test result</p>');
 await new Promise(resolve=>setTimeout(resolve,350));
 assert.equal(messages.some(message=>message.type==='full-reload'),false,'测试HTML不能触发页面重载');
 await fs.writeFile(source,'export const marker="after";if(import.meta.hot)import.meta.hot.accept();');
 await waitFor(()=>messages.some(message=>message.type==='update'&&message.updates?.some(update=>update.path==='/src/main.ts')||message.type==='full-reload'));
 assert(messages.some(message=>message.type==='update'&&message.updates?.some(update=>update.path==='/src/main.ts')),'合法源码保留真实HMR更新');
 assert.equal(messages.some(message=>message.type==='full-reload'),false);assert.notEqual(server.config.server.hmr,false);
});
