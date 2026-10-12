import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import {createPiMcpSession} from '../main/pi-mcp-runtime.js';
import {PiWebAccess,piWebSchemas} from '../main/pi-web-access.js';
import {piPackageStatus} from '../main/pi-packages.js';
const fixture=path.resolve('tests/pi-mcp-adapter-fixture.mjs');
test('fixed six releases plus memory are installed; actual host-managed SDK2 freezes catalog and isolates concurrent results',{timeout:60000},async()=>{
 assert.deepEqual(new Set(piPackageStatus().map(item=>item.id)),new Set(['web','mcp','subagents','lens','plan','observability','memory']));assert(piPackageStatus().every(item=>item.installed));const dispatches:string[]=[];
 const session=await createPiMcpSession({command:process.execPath,args:[fixture],beforeDispatch:(_name,args)=>{dispatches.push(String(args.id));}});
 try{assert.deepEqual(session.names(),['echo.result']);const [slow,fast]=await Promise.all([session.call('echo.result',{id:'slow',delay:60}),session.call('echo.result',{id:'fast',delay:1})]);assert.deepEqual(slow.structuredContent,{id:'slow'});assert.deepEqual(fast.structuredContent,{id:'fast'});assert.equal(dispatches.length,2);const error=await session.call('echo.result',{id:'server-failure',fail:true});assert.equal(error.isError,true);await assert.rejects(session.call('not-listed',{}),/NOT_DECLARED/);await assert.rejects(session.call('echo.result',{delay:1}),/ARGUMENTS_INVALID/);assert.equal(dispatches.length,3);}finally{await session.close();}await assert.rejects(session.call('echo.result',{id:'closed'}),/NOT_SENT/);
});
test('web bridge rejects private targets and provider/proxy injection before a process starts',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-web-test-')),web=new PiWebAccess({directory:dir});try{await assert.rejects(web.call('fetch_content',{url:'http://127.0.0.1/secret'}),/TARGET_DENIED/);assert.throws(()=>piWebSchemas.web_search.parse({query:'public research',provider:'gemini'}));assert.throws(()=>piWebSchemas.source_check.parse({claim:'claim',proxy:'http://127.0.0.1:8888'}));assert.deepEqual(await fs.readdir(dir),[]);}finally{await web.close();await fs.rm(dir,{recursive:true,force:true});}
});
test('actual pi-web-access stdio catalog/cache runs without cloud credentials',{timeout:60000},async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-web-real-')),web=new PiWebAccess({directory:dir});try{await assert.rejects(web.call('get_search_content',{responseId:'no-such-local-result'}),/PI_WEB_TOOL_FAILED/);const config=JSON.parse(await fs.readFile(path.join(dir,'web-search.json'),'utf8'));assert.deepEqual(config.webSearch.allowedProviders,['duckduckgo']);assert.equal(config.image.enabled,false);assert.deepEqual(config.fetch.allowedModes,['raw']);}finally{await web.close();await fs.rm(dir,{recursive:true,force:true});}
});
