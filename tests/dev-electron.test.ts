import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createServer} from 'node:net';
import {test,type TestContext} from 'node:test';

// Execute the real launcher in a fresh fixture root. CLI substitutes exercise
// orchestration only; the actual Vite/Electron UI is verified separately.
async function fixture(t:TestContext){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'slash-dev-launch-'));
 t.after(async()=>{assert.equal(path.dirname(root),os.tmpdir());assert.ok(path.basename(root).startsWith('slash-dev-launch-'));await fs.rm(root,{recursive:true,force:true});});
 await fs.mkdir(path.join(root,'scripts'),{recursive:true});
 for(const name of ['dev-electron.mjs','renderer-readiness.mjs'])await fs.copyFile(path.join(process.cwd(),'scripts',name),path.join(root,'scripts',name));
 const write=async(name:string,text:string)=>{await fs.mkdir(path.dirname(path.join(root,name)),{recursive:true});await fs.writeFile(path.join(root,name),text);};
 await write('node_modules/typescript/bin/tsc',`
const fs=require('node:fs'),path=require('node:path');
fs.appendFileSync('calls.jsonl',JSON.stringify({cli:'tsc',args:process.argv.slice(2)})+'\\n');
if(process.env.FIXTURE_MODE==='tsc-failure')process.exit(2);
if(process.env.FIXTURE_MODE!=='missing-entry'){fs.mkdirSync('dist/main',{recursive:true});fs.writeFileSync('dist/main/main.js','fresh main');}
`);
 await write('node_modules/vite/bin/vite.js',`
const fs=require('node:fs'),http=require('node:http');
const args=process.argv.slice(2);fs.appendFileSync('calls.jsonl',JSON.stringify({cli:'vite',args})+'\\n');
if(args.includes('build'))throw Error('Unexpected production renderer build');
if(process.env.FIXTURE_MODE==='renderer-failure')process.exit(23);
if(process.env.FIXTURE_MODE==='renderer-native-exit')process.exit(-1073740791);
http.createServer((req,res)=>res.writeHead(200,{'content-type':'text/html'}).end('<div id="root"></div><script type="module" src="/src/main.tsx"></script>')).listen(Number(args[args.indexOf('--port')+1]),'127.0.0.1');
`);
 await write('node_modules/electron/cli.js',`
const fs=require('node:fs');
fs.appendFileSync('calls.jsonl',JSON.stringify({cli:'electron',args:process.argv.slice(2),url:process.env.PM_SLASH_DEV_SERVER_URL,main:fs.readFileSync('dist/main/main.js','utf8'),productionRendererExists:fs.existsSync('dist/renderer')})+'\\n');
`);
 return{root,write};
}
async function reserve(){const server=createServer();await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));return{server,port:(server.address() as {port:number}).port};}
async function launch(root:string,port:number,mode='normal'){
 const child=spawn(process.execPath,[path.join(root,'scripts/dev-electron.mjs')],{cwd:root,env:{...process.env,PM_SLASH_DEV_PORT:String(port),FIXTURE_MODE:mode},windowsHide:true});
 let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);
 const code=await new Promise<number|null>((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
 const calls=await fs.readFile(path.join(root,'calls.jsonl'),'utf8').then(text=>text.trim().split('\n').map(line=>JSON.parse(line))).catch(()=>[]);
 return{code,output,calls};
}
test('fresh development launch compiles main and loads Vite without producing a renderer bundle',async t=>{
 const f=await fixture(t),reserved=await reserve();await new Promise<void>(resolve=>reserved.server.close(()=>resolve()));
 const result=await launch(f.root,reserved.port);
 assert.equal(result.code,0,result.output);assert.deepEqual(result.calls.map(call=>call.cli),['tsc','vite','electron']);
 assert.deepEqual(result.calls[0].args,['-p','tsconfig.node.json']);assert.equal(result.calls[2].main,'fresh main');
 assert.equal(result.calls[2].url,`http://127.0.0.1:${reserved.port}`);assert.equal(result.calls[2].productionRendererExists,false);
 assert.match(result.output,/main\/preload ready in \d+ms/);assert.match(result.output,/renderer HTML ready.*in \d+ms/);
 const diagnostic=await fs.readFile(path.join(f.root,'dev-startup.log'),'utf8');
 assert.match(diagnostic,/launcher started: Node v/);assert.match(diagnostic,/starting Vite renderer/);
 assert.match(diagnostic,/TypeScript compiler exited: code 0/);assert.match(diagnostic,/Electron desktop spawned pid=\d+/);
 assert.match(diagnostic,/shutdown requested: code 0/);assert.doesNotMatch(diagnostic,/FIXTURE_MODE|PM_SLASH_DATA_DIR|NODE_OPTIONS/);
});
for(const mode of process.platform==='win32'?['renderer-failure','renderer-native-exit']:['renderer-failure'])test(`${mode} retains the last startup stage and child exit diagnostics`,async t=>{
 const f=await fixture(t),reserved=await reserve();await new Promise<void>(resolve=>reserved.server.close(()=>resolve()));
 const result=await launch(f.root,reserved.port,mode);assert.equal(result.code,1,result.output);
 assert.deepEqual(result.calls.map(call=>call.cli),['tsc','vite']);
 const diagnostic=await fs.readFile(path.join(f.root,'dev-startup.log'),'utf8');
 assert.match(diagnostic,/starting Vite renderer/);assert.match(diagnostic,/Vite renderer exited: code/);
 assert.match(diagnostic,mode==='renderer-failure'?/code 23/:/0xC0000409/);
 assert.match(diagnostic,/renderer exited before readiness/);assert.match(diagnostic,/shutdown requested: code 1/);
});
test('development launch preserves any existing production renderer bytes',async t=>{
 const f=await fixture(t),reserved=await reserve();await new Promise<void>(resolve=>reserved.server.close(()=>resolve()));
 await f.write('dist/renderer/index.html','existing production bundle');
 const result=await launch(f.root,reserved.port);assert.equal(result.code,0,result.output);
 assert.equal(await fs.readFile(path.join(f.root,'dist/renderer/index.html'),'utf8'),'existing production bundle');
});
test('oversized startup diagnostics rotate even when the previous log already exists',async t=>{
 const f=await fixture(t),reserved=await reserve();await new Promise<void>(resolve=>reserved.server.close(()=>resolve()));
 const older='last retained log',oversized='current diagnostic record\n'.repeat(12000);
 await f.write('dev-startup.previous.log',older);await f.write('dev-startup.log',oversized);
 const result=await launch(f.root,reserved.port);assert.equal(result.code,0,result.output);
 assert.equal(await fs.readFile(path.join(f.root,'dev-startup.previous.log'),'utf8'),oversized);
 const diagnostic=await fs.readFile(path.join(f.root,'dev-startup.log'),'utf8');
 assert.match(diagnostic,/launcher started: Node v/);assert.ok(Buffer.byteLength(diagnostic)<262144);
 assert.doesNotMatch(result.output,/could not write startup diagnostics/);
});
for(const mode of ['tsc-failure','missing-entry'])test(`${mode} stops before serving or starting Electron`,async t=>{
 const f=await fixture(t),reserved=await reserve();await new Promise<void>(resolve=>reserved.server.close(()=>resolve()));
 const result=await launch(f.root,reserved.port,mode);assert.equal(result.code,1,result.output);
 assert.deepEqual(result.calls.map(call=>call.cli),['tsc']);assert.match(result.output,mode==='tsc-failure'?/tsc exited with code 2/:/Electron entry is missing/);
});
test('occupied development port is rejected before compilation',async t=>{
 const f=await fixture(t),reserved=await reserve();
 try{const result=await launch(f.root,reserved.port);assert.equal(result.code,1,result.output);assert.deepEqual(result.calls,[]);assert.match(result.output,/development port .* unavailable/);}
 finally{await new Promise<void>(resolve=>reserved.server.close(()=>resolve()));}
});
