import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {Type} from '@sinclair/typebox';
import {z} from 'zod';
import type {ToolDefinition} from '@earendil-works/pi-coding-agent';
import {isolatedPiEnvironment,piPackageRoot} from './pi-auxiliary-worker.js';

export type PiLensDraft={changeId:string;path:string;content:string;contentHash:string};
export type PiLensHost={getDraft:(input:{changeId:string;expectedContentHash:string})=>Promise<PiLensDraft>;signal?:AbortSignal};
const digest=(text:string)=>createHash('sha256').update(text).digest('hex');
/** Analyze a disposable materialization, never the project/reference filesystem. */
export async function analyzePiLensDraft(draft:PiLensDraft,signal?:AbortSignal){
 if(signal?.aborted)throw Error('CANCELLED');
 if(digest(draft.content)!==draft.contentHash)throw Error('PI_LENS_DRAFT_CHANGED');
 if(!/\.(?:html?|css|[cm]?js|jsx|tsx?)$/i.test(draft.path))throw Error('PI_LENS_UNSUPPORTED_DRAFT');
 if(Buffer.byteLength(draft.content)>2_000_000)throw Error('PI_LENS_DRAFT_TOO_LARGE');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'slash-pi-lens-'));
 try{
  const file=path.join(root,'draft'+path.extname(draft.path));await fs.writeFile(file,draft.content);
  await fs.writeFile(path.join(root,'lens.json'),JSON.stringify({format:{enabled:false},autofix:{enabled:false},tests:{enabled:false},lsp:{enabled:false},opengrep:{enabled:false},knip:{enabled:false},jscpd:{enabled:false},madge:{enabled:false},gitleaks:{enabled:false},govulncheck:{enabled:false},deadCode:{enabled:false},actionableWarnings:{autoFix:{enabled:false}}}));
  const worker=path.join(piPackageRoot('pi-lens'),'dist','mcp','worker.js');
  const flags={'no-autoformat':true,'no-autofix':true,'no-tests':true,'no-lsp':true,'no-opengrep':true,'no-knip':true,'no-jscpd':true,'no-madge':true,'no-gitleaks':true,'no-govulncheck':true,'no-dead-code':true};
  const report=await new Promise<any>((resolve,reject)=>{
   const child=spawn(process.execPath,[worker,`--file=${file}`,`--cwd=${root}`,`--flags=${JSON.stringify(flags)}`],{cwd:root,env:isolatedPiEnvironment(root),windowsHide:true,stdio:['ignore','pipe','pipe']});let output='',stderr='',settled=false;
   const finish=(error?:Error,value?:unknown)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);if(error)reject(error);else resolve(value);};
   const abort=()=>{child.kill();finish(Error('CANCELLED'));};const timer=setTimeout(()=>{child.kill();finish(Error('PI_LENS_TIMEOUT'));},45000);signal?.addEventListener('abort',abort,{once:true});
   child.stdout.on('data',chunk=>{output+=String(chunk);if(output.length>8_000_000){child.kill();finish(Error('PI_LENS_OUTPUT_TOO_LARGE'));}});child.stderr.on('data',chunk=>{stderr=(stderr+String(chunk)).slice(-2000);});child.on('error',error=>finish(error));child.on('exit',code=>{if(code!==0)return finish(Error(`PI_LENS_FAILED: ${stderr}`));try{finish(undefined,JSON.parse(output));}catch{finish(Error('PI_LENS_INVALID_REPORT'));}});if(signal?.aborted)abort();
  });
  if(digest(await fs.readFile(file,'utf8'))!==draft.contentHash)throw Error('PI_LENS_UNEXPECTED_MUTATION');
  // All paths returned by the package refer to the disposable copy; do not expose them as project sources.
  const sanitized=JSON.parse(JSON.stringify(report).replaceAll(root.replaceAll('\\','\\\\'),'[draft-copy]').replaceAll(root,'[draft-copy]'));
  return{package:'pi-lens',version:'4.4.0',target:{changeId:draft.changeId,path:draft.path,contentHash:draft.contentHash},report:sanitized,limitations:['仅静态代码诊断；未执行项目脚本、LSP、视觉或业务验收。'],originalUntouched:true};
 }finally{await fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:150});}
}
export function createPiLensTools(host:PiLensHost):ToolDefinition[]{return[{name:'check_draft_code',label:'检查草稿代码',description:'通过 pi-lens 检查现有待保存原型代码草稿，需精确草稿 ID 和内容哈希。只分析临时副本，不修改原件，不代替视觉与业务验收。',parameters:Type.Object({changeId:Type.String(),expectedContentHash:Type.String({pattern:'^[a-f0-9]{64}$'})}),execute:async(_id,raw,signal)=>{const input=z.object({changeId:z.string().min(1),expectedContentHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(raw);const draft=await host.getDraft(input);if(draft.changeId!==input.changeId||draft.contentHash!==input.expectedContentHash)throw Error('PI_LENS_DRAFT_CHANGED');const value=await analyzePiLensDraft(draft,signal??host.signal);return{content:[{type:'text',text:JSON.stringify(value)}],details:value};}}];}
