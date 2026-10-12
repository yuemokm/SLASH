import {createHash} from 'node:crypto';
import path from 'node:path';
import {Type} from '@sinclair/typebox';
import {z} from 'zod';
import type {ToolDefinition} from '@earendil-works/pi-coding-agent';
import {piPackageRoot,startAuxiliaryWorker} from './pi-auxiliary-worker.js';

export type PiPlanReviewReceipt={package:'@plannotator/pi-extension';version:'0.28.8';runId:string;reviewId:string;planHash:string;approved:boolean;feedback:string;reviewedPlan:string;answersOnly:boolean};
export type PiPlanReviewHost={runId:string;mode?:string;openReview:(url:string)=>Promise<void>;onFeedback:(receipt:PiPlanReviewReceipt)=>Promise<void>;onOpened?:(review:{reviewId:string;url:string;runId:string;planHash:string;close:()=>Promise<void>})=>void;signal?:AbortSignal};
const digest=(text:string)=>createHash('sha256').update(text).digest('hex');
/** Reuses the official browser and decision server; deliberately does not install its separate Plan execution policy. */
export async function startPiPlanReview(plan:string,host:PiPlanReviewHost){
 if(host.mode!=='plan')throw Error('PI_PLAN_REVIEW_REQUIRES_PLAN_MODE');
 if(!plan.trim()||Buffer.byteLength(plan)>500_000)throw Error('PI_PLAN_REVIEW_INVALID_PLAN');
 if(host.signal?.aborted)throw Error('CANCELLED');
 const root=piPackageRoot('@plannotator/pi-extension'),planHash=digest(plan);
 const worker=await startAuxiliaryWorker(`
import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer,Server} from 'node:http';
import {randomBytes} from 'node:crypto';
import {createInterface} from 'node:readline';
const packageRoot=${JSON.stringify(root)};
await fs.mkdir(process.env.PLANNOTATOR_DATA_DIR,{recursive:true});
await fs.writeFile(path.join(process.env.PLANNOTATOR_DATA_DIR,'config.json'),JSON.stringify({sharingEnabled:false,aiEnabled:false,feedbackHistory:false,planSave:{enabled:false}}));
const upstreamToken=randomBytes(32).toString('hex');
const officialServers=new WeakSet();const originalListen=Server.prototype.listen,originalEmit=Server.prototype.emit;
Server.prototype.listen=function(...args){officialServers.add(this);return originalListen.apply(this,args);};
Server.prototype.emit=function(name,...args){if(officialServers.has(this)&&(name==='request'||name==='upgrade')){const req=args[0],res=args[1];if(req.headers['x-slash-upstream-token']!==upstreamToken){if(name==='request'){res.writeHead(403);res.end('Host access required');}else res.destroy();return true;}}return originalEmit.call(this,name,...args);};
const {startPlanReviewServer}=await jiti.import(path.join(packageRoot,'server/serverPlan.ts'));
const htmlContent=await fs.readFile(path.join(packageRoot,'plannotator.html'),'utf8');
const input=await new Promise(resolve=>{const rl=createInterface({input:process.stdin});rl.once('line',line=>{rl.close();resolve(JSON.parse(line));});});
const server=await startPlanReviewServer({plan:input.plan,htmlContent,origin:'Slash · 研究型方案评阅',permissionMode:'plan',sharingEnabled:false,planRevisions:true});
Server.prototype.listen=originalListen;
const upstream=new URL(server.url);const token=randomBytes(24).toString('hex');const cookieName='slashReview_'+token.slice(0,12);
// Expose only the official annotation/decision protocol, never its file browsing, AI, sharing or integration routes.
const proxy=createServer(async(req,res)=>{try{
 if(req.method!=='GET'&&req.method!=='POST'){res.writeHead(405);res.end();return;}
 const url=new URL(req.url,'http://127.0.0.1');
 const cookie=String(req.headers.cookie??'');
 if(url.searchParams.get('slashReview')===token){res.setHeader('Set-Cookie',cookieName+'='+token+'; HttpOnly; SameSite=Strict; Path=/');}
 else if(!cookie.split(';').some(v=>v.trim()===cookieName+'='+token)){res.writeHead(403);res.end('Review token required');return;}
 if(req.headers.origin&&req.headers.origin!=='http://127.0.0.1:'+proxy.address().port){res.writeHead(403);res.end();return;}
 const allowedGet=new Set(['/','/favicon.png','/api/plan','/api/plan/revision','/api/plan/versions','/api/plan/version','/api/draft','/api/hooks/status','/api/agents']);
 const allowedPost=new Set(['/api/approve','/api/deny','/api/draft']);
 if(!(req.method==='GET'?allowedGet:allowedPost).has(url.pathname)){res.writeHead(403);res.end('Unavailable in Slash review');return;}
 let body;const headers={'x-slash-upstream-token':upstreamToken};
 if(req.method==='POST'){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>1_000_000)throw Error('Review body too large');}let parsed=JSON.parse(raw||'{}');if(url.pathname!=='/api/draft'){const filtered={planSave:{enabled:false}};for(const key of ['feedback','serverSession','planRevision','revision','draftGeneration','answersOnly'])if(parsed[key]!==undefined)filtered[key]=parsed[key];parsed=filtered;}body=JSON.stringify(parsed);headers['content-type']='application/json';}
 url.searchParams.delete('slashReview');const result=await fetch(new URL(url.pathname+url.search,upstream),{method:req.method,headers,body});
 res.writeHead(result.status,{'Content-Type':result.headers.get('content-type')??'application/json','Content-Security-Policy':"connect-src 'self'; img-src 'self' data: blob:; frame-src 'none'; form-action 'self'"});res.end(Buffer.from(await result.arrayBuffer()));
 }catch(error){res.writeHead(400);res.end('Invalid review request');}});
await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));
emit({type:'ready',reviewId:server.reviewId,upstreamPort:server.port,url:'http://127.0.0.1:'+proxy.address().port+'/?slashReview='+token});
server.onDecision(result=>{setTimeout(()=>emit({type:'decision',result:{approved:result.approved,feedback:result.feedback??'',plan:result.plan??input.plan,answersOnly:result.answersOnly===true}}),100);});
process.stdin.on('end',()=>{server.stop();proxy.close();process.exit(0);});
`);
 let abort:()=>void=()=>{};
 try{
  worker.send({plan});const ready=await worker.next();if(ready.type!=='ready')throw Error('PI_PLAN_REVIEW_START_FAILED');
  abort=()=>{void worker.close();};host.signal?.addEventListener('abort',abort,{once:true});if(host.signal?.aborted)throw Error('CANCELLED');
  const completion=(async()=>{try{const message=await worker.next(0);if(host.signal?.aborted)throw Error('CANCELLED');if(message.type!=='decision'||digest(message.result.plan)!==planHash)throw Error('PI_PLAN_REVIEW_CHANGED');const receipt:PiPlanReviewReceipt={package:'@plannotator/pi-extension',version:'0.28.8',runId:host.runId,reviewId:ready.reviewId,planHash,approved:message.result.approved===true,feedback:String(message.result.feedback).slice(0,100000),reviewedPlan:plan,answersOnly:message.result.answersOnly===true};await host.onFeedback(receipt);return receipt;}finally{host.signal?.removeEventListener('abort',abort);await worker.close();}})();
  // The user may keep reviewing for minutes; worker.next only times out startup/protocol calls.
  completion.catch(()=>{});
  host.onOpened?.({reviewId:String(ready.reviewId),url:String(ready.url),runId:host.runId,planHash,close:async()=>{host.signal?.removeEventListener('abort',abort);await worker.close();}});
  await host.openReview(ready.url);
  return{reviewId:String(ready.reviewId),url:String(ready.url),upstreamPort:Number(ready.upstreamPort),runId:host.runId,planHash,completion,close:async()=>{host.signal?.removeEventListener('abort',abort);await worker.close();}};
 }catch(error){host.signal?.removeEventListener('abort',abort);await worker.close();throw error;}
}
export function createPiPlanReviewTools(host:PiPlanReviewHost):ToolDefinition[]{return[{name:'review_plan',label:'批注研究方案',description:'使用 Plannotator 打开当前研究方案供用户逐段批注。传入已给出依据与取舍的完整方案。仅评阅，不写项目文件、不提升权限、不自动执行或转为 Build；反馈稍后回到本会话。',parameters:Type.Object({plan:Type.String({minLength:1,maxLength:500000})}),execute:async(_id,raw,toolSignal)=>{const input=z.object({plan:z.string().min(1).max(500000)}).strict().parse(raw);const signal=host.signal&&toolSignal?AbortSignal.any([host.signal,toolSignal]):toolSignal??host.signal;const review=await startPiPlanReview(input.plan,{...host,signal});const details={package:'@plannotator/pi-extension',version:'0.28.8',reviewId:review.reviewId,url:review.url,runId:host.runId,planHash:review.planHash,status:'awaiting_user',notice:'评阅已打开；决定与批注稍后回到会话，确认不会自动执行。'};return{content:[{type:'text',text:JSON.stringify(details)}],details};}}];}
