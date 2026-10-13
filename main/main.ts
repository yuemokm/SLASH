import {isTestCasePath} from '../shared/test-cases.js';
import {installStartupRecovery} from './startup-window.js';
import {exportAcceptedPrototype} from './prototype-export.js';
import {app,BrowserWindow,ipcMain,dialog,safeStorage,shell} from 'electron';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import http from 'node:http';
import {createHash,randomUUID} from 'node:crypto';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {McpHost} from './mcp-host.js';
import {inspectMcp,pageMcpTools} from './mcp-client.js';
import {safeMcpMessage} from './mcp-errors.js';
import {mcpBinding} from './mcp-credentials.js';
import {requestSchema,type AppPreferences,type Connection,type ConnectionDiscovery,type DeliveryPreflight,type DeliveryRecord,type ExternalActionProposal,type ExternalResult,type OperationStatus,type ApprovalRequest,type PermissionCapability,type PermissionDecision} from '../shared/types.js';
import {Store} from './store.js';
import {PiPackageSettings} from './pi-package-settings.js';
import {piPackageStatus} from './pi-packages.js';
import {Service} from './service.js';
import {runReferenceScript} from './reference-script.js';
import {runPrototypeAcceptance,cancelAllPrototypeAcceptance,PROTOTYPE_BROWSER_VERSION} from './prototype-browser.js';
import {isHiddenTestProfile} from './test-profile.js';
import {deterministicDiff} from './pm-workflows.js';
import {classifyReceipt,ExternalCallError,mcpCall,runCli,validateExecutable} from './integrations.js';
import {selectionBridge} from './preview.js';
import {designCatalog,designSourceUrl} from './design-systems.js';
import {exportMarkdownToWord,listFileVersions,packageHtmlProject,prepareRestoreDraft,readFileVersion,writeAuthorizedBuffer,type ArtifactFileRef} from './artifacts.js';
import {ProductRecordsRepository,productRecordsWorkspaceIdentity} from './product-records.js';
import {DecisionRepository,decisionRepositoryKey} from './decision-center.js';
import {processDrawio} from './flow.js';
import {QUALITY_CHECKER_VERSION,qualityCheckForArtifact,evaluateQualityGate} from './quality.js';
import {requirementRelatedToPath,requirementImplementsPath,businessPathKey} from './business-rules.js';
import {QualityReportRepository} from './quality-history.js';
import {connectNetworkShare,createNetworkShareInvitation,inspectNetworkShareTarget,parseNetworkShareInvitation,disconnectNetworkShare,reconnectNetworkShare,inspectSharePermissions,manageLocalShare} from './network-share.js';
import {discoverInstalledClis,ModelSettings} from './settings.js';
import {buildWritableShareScript,describeShareFolder,inspectSharingSetup} from './sharing-setup.js';
import {createOpenAICompatibleModelRuntime} from './model-runtime.js';
import {testModelTextConnection} from './model-connection-test.js';
import {discoverModels} from './model-discovery.js';
import {AttachmentRepository} from './image-attachments.js';
import {VisionBridge} from './vision.js';
import {MemoryVisionCache} from '../shared/vision.js';
import {capabilityHash,summarizeConnectionFailure,summarizeConnectionHealth} from './connection-health.js';
import {DeliveryGate} from './delivery-gate.js';
import type {ConnectionHealthSnapshot} from '../shared/types.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const exec=promisify(execFile);
const configuredDataDir=process.env.PM_SLASH_DATA_DIR?.trim();
const userDataDir=path.resolve(configuredDataDir||path.join(app.getPath('appData'),'slash'));
app.setPath('userData',userDataDir);

type ExternalExecution=
 | {kind:'document_delivery';connectionId:string;mountId:string;path:string;title:string;provider:'feishu'|'dingtalk';remoteId?:string;sourceHash:string}
 | (import('../shared/types.js').McpCallInput&{connectionId:string});
type ExternalService=Service&{
 listExternalActions:(filter?:{conversationId?:string;mountId?:string;path?:string;sourceHash?:string})=>ExternalActionProposal[];
 listPendingExternalActions:(conversationId?:string)=>ExternalActionProposal[];
 approveExternalAction:(id:string,input?:Record<string,unknown>)=>{proposal:ExternalActionProposal;execution:ExternalExecution};
 rejectExternalAction:(id:string,reason?:string)=>ExternalActionProposal;
 markExternalActionExecuting:(id:string,operationId:string)=>ExternalActionProposal;
 completeExternalAction:(id:string,result:{operationId:string;status:'succeeded'|'failed'|'outcome_unknown';receipt?:unknown;diagnostic?:string})=>ExternalActionProposal;
 createManualExternalActionProposal:(input:ExternalExecution & {target:string;userAuthorizationExcerpt?:string;conversationId?:string})=>Promise<ExternalActionProposal>;
 assertExternalActionAllowed:()=>void;
 discoverConnections:()=>Promise<ConnectionDiscovery[]>;
 listPendingApprovals:(conversationId?:string)=>ApprovalRequest[];
 resolveApproval:(id:string,decision:'allow_once'|'allow'|'deny',reason?:string)=>ApprovalRequest;
 setPermission:(capability:PermissionCapability,decision:PermissionDecision)=>void;
 listShareLocks:()=>unknown[];
};

let win:BrowserWindow;
let windowClosing=false;
let service:Service;
let store:Store;
let deliveryGate:DeliveryGate;
let modelSettings:ModelSettings;
let piPackageSettings:PiPackageSettings;
let mcpHost:McpHost;
let attachmentRepository:AttachmentRepository;
let visionRequest:(input:{model:any;prompt:string;images:readonly any[];signal:AbortSignal;credential?:unknown})=>Promise<unknown>;
const visionCache=new MemoryVisionCache(100,10*60_000);
const previews=new Map<string,{mountId:string;file:string;base:string}>();
let port=0;

function redact(value:string){const safe=mcpHost?.redact(value)??value;return modelSettings?.redact(safe)??safe;}
function receiptText(value:unknown){let text='';try{text=JSON.stringify(value);}catch{text=String(value);}return redact(text).slice(0,200_000);}
function snapshotImpact(store:Store,root:string,artifactId:string){const snapshot=new ProductRecordsRepository(store,{key:productRecordsWorkspaceIdentity(root).key}).snapshot();return{requirements:snapshot.requirements.filter(req=>snapshot.artifacts.some(a=>a.id===artifactId&&requirementRelatedToPath(req,a.mountId,a.relativePath))).map(req=>req.id),links:snapshot.artifactLinks.filter(link=>link.fromArtifactId===artifactId||link.toArtifactId===artifactId).map(link=>link.id),reviews:snapshot.reviews.filter(review=>review.artifactId===artifactId).map(review=>review.id)};}
async function buildImpactGraph(store:Store,root:string,artifactId:string,query:{direction?:'outgoing'|'incoming'|'both';includeCandidates?:boolean;maxDepth?:number}){
 const identity=productRecordsWorkspaceIdentity(root);const repository=new ProductRecordsRepository(store,{key:identity.key});const snapshot=repository.snapshot();const origin=snapshot.artifacts.find(item=>item.id===artifactId);
 if(!origin)throw Error('ARTIFACT_NOT_FOUND');
 const impact=repository.queryImpact(artifactId,query);const artifactIds=new Set([artifactId,...impact.hits.map(hit=>hit.artifactId)]);const visible=new Set<string>();
 for(const artifact of snapshot.artifacts.filter(item=>artifactIds.has(item.id)))try{await service.files.resolve(artifact.mountId,artifact.relativePath);visible.add(artifact.id);}catch{}
 if(!visible.has(artifactId))throw Error('PERMISSION_DENIED: 成果不在当前授权目录内');
 const nodes:Array<Record<string,unknown>>=[];const edges:Array<Record<string,unknown>>=[];
 const hitById=new Map(impact.hits.map(hit=>[hit.artifactId,hit]));
 for(const artifact of snapshot.artifacts.filter(item=>visible.has(item.id)))nodes.push({id:artifact.id,kind:'artifact',title:artifact.title,path:artifact.relativePath,status:artifact.state,certainty:artifact.id===artifactId?'confirmed':hitById.get(artifact.id)?.certainty??'confirmed',depth:artifact.id===artifactId?0:hitById.get(artifact.id)?.depth??1,metadata:{mountId:artifact.mountId,versionHash:artifact.currentVersionHash}});
 const artifactByPath=new Map(snapshot.artifacts.filter(item=>visible.has(item.id)).map(item=>[`${item.mountId}:${businessPathKey(item.relativePath)}`,item.id]));
 for(const link of impact.links)if(visible.has(link.fromArtifactId)&&visible.has(link.toArtifactId))edges.push({id:link.id,from:link.fromArtifactId,to:link.toArtifactId,relation:link.relation,certainty:link.certainty,rationale:link.rationale,locator:link.locator});
 for(const requirement of snapshot.requirements){const refs=[...new Set([...requirement.sourceRefs.map(ref=>artifactByPath.get(`${ref.mountId}:${businessPathKey(ref.relativePath)}`)),...(requirement.implementationRefs??[]).map(ref=>artifactByPath.get(`${ref.mountId}:${businessPathKey(ref.path)}`))].filter((id):id is string=>Boolean(id)))];if(!refs.length)continue;const nodeId=`requirement:${requirement.id}`;nodes.push({id:nodeId,kind:'requirement',title:requirement.title,status:requirement.status,depth:Math.min(...refs.map(id=>id===artifactId?1:(hitById.get(id)?.depth??1)+1)),certainty:'confirmed',metadata:{summary:requirement.summary}});for(const id of refs)edges.push({id:`requirement-link:${requirement.id}:${id}`,from:id,to:nodeId,relation:requirementImplementsPath(requirement,snapshot.artifacts.find(item=>item.id===id)!.mountId,snapshot.artifacts.find(item=>item.id===id)!.relativePath)?'requirement_implementation':'requirement_source',certainty:'candidate',rationale:requirementImplementsPath(requirement,snapshot.artifacts.find(item=>item.id===id)!.mountId,snapshot.artifacts.find(item=>item.id===id)!.relativePath)?'已记录规则落实位置；版本与业务仍需核对':'需求卡引用该成果作为来源'});}
 for(const review of snapshot.reviews.filter(item=>visible.has(item.artifactId))){const nodeId=`review:${review.id}`;nodes.push({id:nodeId,kind:'review',title:review.title,status:review.status,depth:(hitById.get(review.artifactId)?.depth??0)+1,certainty:'confirmed',metadata:{artifactId:review.artifactId,issueCount:review.issues.length}});edges.push({id:`review-link:${review.id}`,from:review.artifactId,to:nodeId,relation:'review',certainty:'confirmed'});}
 const actions=(service as ExternalService).listExternalActions();for(const action of actions){if(action.kind!=='document_delivery')continue;const execution=action.request as Extract<ExternalExecution,{kind:'document_delivery'}>;const sourceId=[...visible].find(id=>{const item=snapshot.artifacts.find(artifact=>artifact.id===id);return item?.mountId===execution.mountId&&item.relativePath===execution.path;});if(!sourceId)continue;const nodeId=`delivery:${action.id}`;nodes.push({id:nodeId,kind:'delivery',title:action.target,status:action.status,depth:(hitById.get(sourceId)?.depth??0)+1,certainty:'confirmed',metadata:{actionId:action.id,provider:execution.provider,sourceHash:execution.sourceHash}});edges.push({id:`delivery-link:${action.id}`,from:sourceId,to:nodeId,relation:'delivery',certainty:'confirmed'});}
 return{workspaceId:identity.workspaceId,revision:snapshot.revision,originArtifactId:artifactId,nodes,edges};
}
function quotePowerShell(value:string){return "'"+value.replaceAll("'","''")+"'";}
async function powershell(script:string,timeout=20_000){return exec('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout,maxBuffer:2_000_000});}
async function fileVersion(file:string){return createHash('sha256').update(await fs.readFile(file)).digest('hex');}
type VisionEvidence={summary:string;ocr:{fullText:string;items:Array<{text:string;confidence?:number;box?:[number,number,number,number]}>};layout:{regions:Array<{type:string;label?:string;box?:[number,number,number,number]}>};semantics:{scene?:string;objects:string[];interactions:string[]};visual:{notes:string[]};uncertainty:string[]};
function normalizeVisionEvidence(raw:string):VisionEvidence{
 const fallback:VisionEvidence={summary:raw.trim(),ocr:{fullText:'',items:[]},layout:{regions:[]},semantics:{scene:'',objects:[],interactions:[]},visual:{notes:[]},uncertainty:['视觉模型未返回标准 JSON，已保留原始摘要']};
 const cleaned=raw.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
 try{
  const candidate=cleaned.startsWith('{')?cleaned:cleaned.slice(cleaned.indexOf('{'),cleaned.lastIndexOf('}')+1);
  const parsed=JSON.parse(candidate) as Record<string,any>;
  const ocr=parsed.ocr??{}; const layout=parsed.layout??{}; const semantics=parsed.semantics??{}; const visual=parsed.visual??{};
  return {summary:String(parsed.summary??raw).trim(),ocr:{fullText:String(ocr.full_text??ocr.fullText??''),items:Array.isArray(ocr.items)?ocr.items.filter(Boolean).map((item:any)=>({text:String(item.text??''),confidence:typeof item.confidence==='number'?item.confidence:undefined,box:Array.isArray(item.box)&&item.box.length===4?item.box as [number,number,number,number]:undefined})):[]},layout:{regions:Array.isArray(layout.regions)?layout.regions.filter(Boolean).map((item:any)=>({type:String(item.type??'unknown'),label:item.label?String(item.label):undefined,box:Array.isArray(item.box)&&item.box.length===4?item.box as [number,number,number,number]:undefined})):[]},semantics:{scene:semantics.scene?String(semantics.scene):'',objects:Array.isArray(semantics.objects)?semantics.objects.map(String):[],interactions:Array.isArray(semantics.interactions)?semantics.interactions.map(String):[]},visual:{notes:Array.isArray(visual.notes)?visual.notes.map(String):[]},uncertainty:Array.isArray(parsed.uncertainty)?parsed.uncertainty.map(String):[]};
 }catch{return fallback;}
}
function visionPrompt(prompt?:string){return `${prompt||'请分析这张图片'}\n请只输出 JSON，不要 Markdown 代码块，结构必须为：{"summary":"...","ocr":{"full_text":"...","items":[]},"layout":{"regions":[]},"semantics":{"scene":"","objects":[],"interactions":[]},"visual":{"notes":[]},"uncertainty":[]}。只记录看得见的内容，不要臆测。`}
function extractVisionText(payload:Record<string,any>):string|undefined{
 if(typeof payload.output_text==='string')return payload.output_text;
 if(Array.isArray(payload.choices)){const content=payload.choices[0]?.message?.content;return Array.isArray(content)?content.map((item:any)=>item?.text||'').join(''):typeof content==='string'?content:undefined;}
 if(Array.isArray(payload.content))return payload.content.map((item:any)=>item?.text||'').join('');
 if(Array.isArray(payload.output))return payload.output.flatMap((item:any)=>Array.isArray(item?.content)?item.content.map((part:any)=>part?.text||''):[]).join('');
 return undefined;
}
function formatVisionEvidence(value:VisionEvidence){
 const lines=[`摘要：${value.summary||'未提取到摘要'}`];
 if(value.ocr.fullText)lines.push(`OCR：${value.ocr.fullText}`);
 if(value.ocr.items.length)lines.push(`OCR 区块：${value.ocr.items.slice(0,20).map(item=>item.text).filter(Boolean).join('；')}`);
 if(value.layout.regions.length)lines.push(`版面区域：${value.layout.regions.slice(0,20).map(item=>item.label?`${item.type}（${item.label}）`:item.type).join('、')}`);
 if(value.semantics.scene)lines.push(`场景：${value.semantics.scene}`);
 if(value.semantics.objects.length)lines.push(`关键对象：${value.semantics.objects.slice(0,20).join('、')}`);
 if(value.semantics.interactions.length)lines.push(`交互线索：${value.semantics.interactions.slice(0,20).join('；')}`);
 if(value.visual.notes.length)lines.push(`视觉备注：${value.visual.notes.slice(0,20).join('；')}`);
 if(value.uncertainty.length)lines.push(`不确定性：${value.uncertainty.slice(0,20).join('；')}`);
 return lines.join('\n');
}
async function analyzeImage(pathname:string,prompt:string|undefined,modelEntryId?:string){
 const target=path.resolve(pathname);const stat=await fs.stat(target);if(!stat.isFile())throw Error('VISION_INPUT_INVALID: 图片不是文件');if(stat.size>12_000_000)throw Error('VISION_INPUT_TOO_LARGE: 图片超过 12 MB');
 const ext=path.extname(target).toLowerCase();const mime=ext==='.png'?'image/png':ext==='.webp'?'image/webp':ext==='.gif'?'image/gif':'image/jpeg';if(!['.png','.jpg','.jpeg','.webp','.gif'].includes(ext))throw Error('VISION_INPUT_UNSUPPORTED: 仅支持 PNG、JPEG、WEBP 或 GIF');
 const preferences=store.get<AppPreferences>('app-preferences',{} as AppPreferences);const models=service.state.models??[];const requested=modelEntryId?models.find(item=>item.id===modelEntryId):undefined;const configuredVision=preferences.visionModelId?models.find(item=>item.id===preferences.visionModelId):undefined;
 const autoFallback=preferences.visionAutoFallback!==false;const preferred=[requested,configuredVision].filter((item,index,array):item is NonNullable<typeof item>=>Boolean(item)&&array.findIndex(candidate=>candidate?.id===item?.id)===index);let entry=preferred.find(item=>item.supportsVision===true);if(!entry&&autoFallback)entry=models.find(item=>item.supportsVision===true&&item.hasKey)||models.find(item=>item.supportsVision===true);if(!entry)throw Error(requested&&!autoFallback&&requested.supportsVision!==true?'VISION_MODEL_NOT_CAPABLE: 当前模型不支持图片输入，请开启视觉辅助回退或配置图片辅助模型':'VISION_MODEL_MISSING: 请在设置中添加并标记一个支持图片输入的模型');
 const key=(()=>{try{return modelSettings.credential(entry!.id);}catch{return entry!.id===service.state.defaultModelId?modelSettings.defaultCredential():'';}})();if(!key)throw Error(`VISION_CREDENTIAL_MISSING: 模型 ${entry.name} 尚未配置密钥`);
 const imageHash=await fileVersion(target);const promptHash=createHash('sha256').update(prompt||'').digest('hex').slice(0,16);const cacheKey=`vision:${imageHash}:${entry.id}:${entry.modelId}:${promptHash}`;const cached=store.get<{model:string;modelEntryId:string;evidence:string;structured:VisionEvidence;source:string}>(cacheKey,undefined as unknown as {model:string;modelEntryId:string;evidence:string;structured:VisionEvidence;source:string});if(cached)return{...cached,evidence:formatVisionEvidence(cached.structured),source:path.basename(target),cached:true};
 const data=(await fs.readFile(target)).toString('base64');const instruction=visionPrompt(prompt);let endpoint:string;let headers:Record<string,string>={'content-type':'application/json'};let body:Record<string,unknown>;
 if(entry.protocol==='anthropic-messages'){const base=entry.baseUrl.replace(/\/$/,'');endpoint=base.endsWith('/messages')?base:`${base}/messages`;headers={...headers,'x-api-key':key,'anthropic-version':'2023-06-01'};body={model:entry.modelId,max_tokens:3000,temperature:0.1,messages:[{role:'user',content:[{type:'text',text:instruction},{type:'image',source:{type:'base64',media_type:mime,data}}]}]};}
 else if(entry.protocol==='openai-responses'){const base=entry.baseUrl.replace(/\/$/,'');endpoint=base.endsWith('/responses')?base:`${base}/responses`;headers={...headers,authorization:`Bearer ${key}`};body={model:entry.modelId,input:[{role:'user',content:[{type:'input_text',text:instruction},{type:'input_image',image_url:`data:${mime};base64,${data}`}]}],temperature:0.1,max_output_tokens:3000};}
 else {const base=entry.baseUrl.replace(/\/$/,'');endpoint=base.endsWith('/chat/completions')?base:`${base}/chat/completions`;headers={...headers,authorization:`Bearer ${key}`};body={model:entry.modelId,messages:[{role:'user',content:[{type:'text',text:instruction},{type:'image_url',image_url:{url:`data:${mime};base64,${data}`}}]}],temperature:0.1,max_tokens:3000};}
 const response=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify(body)});if(!response.ok)throw Error(`VISION_REQUEST_FAILED: HTTP ${response.status}`);const payload=await response.json() as Record<string,any>;const text=extractVisionText(payload);if(!text?.trim())throw Error('VISION_EMPTY_RESULT: 视觉模型未返回证据');const structured=normalizeVisionEvidence(text);const result={model:entry.name,modelEntryId:entry.id,evidence:formatVisionEvidence(structured),structured,source:path.basename(target)};store.set(cacheKey,result);return{...result,cached:false};
}
/** Compatibility IPC for callers that still expect an immediate text report.
 * New conversation sends persist an attachment and let Service decide whether
 * to pass native image content or attach untrusted evidence. */
async function analyzeImageWithBridge(pathname:string,prompt:string|undefined,modelEntryId?:string){
 const ref=await attachmentRepository.importPath(pathname,service.state.root);
 const models=(service.state.models??[]).map(item=>({id:item.id,name:item.name,modelId:item.modelId,provider:item.provider,baseUrl:item.baseUrl,protocol:item.protocol,hasKey:item.hasKey,supportsVision:item.supportsVision}));
 const selected=service.state.models?.find(item=>item.id===modelEntryId)||service.state.models?.find(item=>item.id===service.state.defaultModelId)||{id:'legacy',name:service.state.model.id,modelId:service.state.model.id,provider:'default',supportsVision:false};
 const bridge=new VisionBridge({repository:attachmentRepository,workspaceRoot:service.state.root,requestVision:visionRequest,cache:visionCache});
 const result=await bridge.prepare({attachments:[ref],selectedModel:selected,models,prompt,preferences:store.get<AppPreferences>('app-preferences',{} as AppPreferences)});
 return{model:result.model?.name||selected.name||selected.modelId,evidence:result.evidence?formatVisionEvidence(result.evidence):result.raw||'图片已验证，将作为原生图片输入传给会话。',structured:result.evidence,attachmentId:ref.id,source:ref.name,cached:result.cached};
}
async function writableOutputRef(file:string):Promise<ArtifactFileRef>{
 const target=path.resolve(file);
 for(const mount of service.state.mounts.filter(item=>item.enabled&&item.write)){
  const root=await fs.realpath(mount.path);const relative=path.relative(root,target);
  if(relative!==''&&relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative)){await service.files.resolve(mount.id,relative,true);return{mountId:mount.id,path:relative};}
 }
 throw Error('PERMISSION_DENIED: 导出目标必须位于已授权的可写目录');
}

function safePreviewPath(item:{mountId:string;file:string;base:string},segments:string[]){
 const decoded=segments.map(segment=>decodeURIComponent(segment)).join(path.sep)||path.basename(item.file);
 if(!decoded||path.isAbsolute(decoded)||decoded.includes('\0'))throw Error('INVALID_PREVIEW_PATH');
 const target=path.normalize(path.join(item.base,decoded));
 const relative=path.relative(item.base,target);
 if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('INVALID_PREVIEW_PATH');
 return target;
}

const server=http.createServer(async(req,res)=>{
 try{
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
  const url=new URL(req.url||'','http://127.0.0.1');
  const [,token,...parts]=url.pathname.split('/');
  const item=previews.get(token);
  if(!item||req.headers.host!==`127.0.0.1:${port}`){res.writeHead(403);res.end();return;}
  const relativeFile=safePreviewPath(item,parts);
  const file=await service.files.resolve(item.mountId,relativeFile);
  const extension=path.extname(file).toLowerCase();
  res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.htm':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.woff':'font/woff','.woff2':'font/woff2'} as Record<string,string>)[extension]||'application/octet-stream');
  res.setHeader('Content-Security-Policy',"default-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'");
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Cache-Control','no-store');
  if(req.method==='HEAD'){res.writeHead(200);res.end();return;}
  const body=await fs.readFile(file);
  if(extension==='.html'||extension==='.htm'){
   const html=body.toString('utf8');
   res.end(html.includes('</body>')?html.replace('</body>',selectionBridge+'</body>'):html+selectionBridge);
  }else res.end(body);
 }catch{res.writeHead(404);res.end('文件不可访问');}
});

function persistConnectionHealth(connection:Connection,snapshot:ConnectionHealthSnapshot){
 const current=service.state.connections.find(item=>item.id===connection.id);
 if(!current||!current.enabled||mcpBinding(current)!==mcpBinding(connection))return;
 current.healthStatus=snapshot.status;
 current.lastCheckedAt=snapshot.checkedAt;
 current.healthSummary=snapshot.summary;
 current.capabilityHash=capabilityHash(snapshot);
 if(snapshot.version)current.executableVersion=snapshot.version;
 if(connection.kind==='mcp')current.capabilities=[...snapshot.capabilities];
 const key=`connection-health-history:${connection.id}`;
 const history=store.get<ConnectionHealthSnapshot[]>(key,[]);
 store.set(key,[snapshot,...history].slice(0,30));
 service.save();
}

async function inspectConnection(connection:Connection,options:{query?:string;cursor?:string;limit?:number}={}){
 try{
  if(connection.kind==='cli'){
   validateExecutable(connection.command);
   const result=await exec(connection.command,[...connection.args,'--version'],{windowsHide:true,timeout:15_000,maxBuffer:1_000_000});
   const inspection={kind:'cli' as const,version:result.stdout.trim().slice(0,2000),notice:'可执行文件版本检查通过；登录状态和业务写入仍需分别验证'};
   const health=summarizeConnectionHealth(connection.id,inspection);
   persistConnectionHealth(connection,health);
   return{...inspection,health};
  }
   const inspection=await inspectMcp(connection);
   const health=summarizeConnectionHealth(connection.id,inspection);
   persistConnectionHealth(connection,health);
   const page=pageMcpTools(inspection.tools,inspection.catalogHash,options);
   return{...inspection,...page,health:{...health,capabilities:health.capabilities.slice(0,50),capabilityCount:health.capabilities.length,hasMore:health.capabilities.length>50}};
 }catch(error){
  const health=summarizeConnectionFailure(connection.id,error);
  persistConnectionHealth(connection,health);
  if(connection.kind==='mcp')throw Error(safeMcpMessage(error));throw error;
 }
}
async function testConnection(id:string){
 const connection=service.state.connections.find(item=>item.id===id&&item.enabled);
 if(!connection)throw Error('连接不存在或已禁用');
 return inspectConnection(connection);
}

async function testConfiguredModel(id:string){
 const model=modelSettings.model(id),key=modelSettings.credential(id);
 const input={entryId:model.id,provider:model.provider,name:model.name,baseUrl:model.baseUrl,proxyUrl:model.proxyUrl,id:model.modelId,protocol:model.protocol,contextWindow:model.contextWindow,maxTokens:model.maxTokens};
 const capabilities=await service.modelRuntimeCapabilities(input);
 const result=await testModelTextConnection({...input,contextWindow:capabilities.capability.limits!.contextWindow,maxTokens:capabilities.capability.limits!.maxTokens,thinkingRuntime:capabilities.runtime},key);
 return{modelId:model.id,model:model.modelId,...result};
}

function connectionFor(id:string,kind:Connection['kind']){
 const connection=service.state.connections.find(item=>item.id===id&&item.enabled&&item.kind===kind);
 if(!connection)throw Error(kind==='cli'?'请选择已启用的官方 CLI 连接':'MCP 连接不存在或已禁用');
 return connection;
}

/** Build the delivery checklist shown in the renderer. Every check is
 * deterministic and scoped to the current file version. The approval handler
 * below repeats the security-sensitive checks immediately before execution. */
async function deliveryPreflight(input:Parameters<DeliveryGate['check']>[0]):Promise<DeliveryPreflight>{return deliveryGate.check(input);}

async function executeDelivery(input:{connectionId:string;mountId:string;path:string;title:string;provider:'dingtalk'|'feishu';remoteId?:string;sourceHash:string;dryRun:boolean},operationId=randomUUID()):Promise<ExternalResult>{
 (service as ExternalService).assertExternalActionAllowed();
 if(!input.dryRun){const gate=await deliveryGate.check(input);if(!gate.allowed)throw Error(`QUALITY_GATE_BLOCKED: ${gate.checks.filter(item=>item.status==='blocked').map(item=>item.detail).join('；')}`);}
 const connection=connectionFor(input.connectionId,'cli');
 if(!connection.provider)throw Error('此 CLI 连接尚未设置服务商，请先编辑连接');
 if(connection.provider!==input.provider)throw Error('所选连接与交付服务商不一致');
 validateExecutable(connection.command);
 const source=await service.files.resolve(input.mountId,input.path);
 const currentHash=await fileVersion(source);
 if(currentHash!==input.sourceHash)throw Error('VERSION_CONFLICT: 文件内容已变化，请重新打开并预览后再发布');
 const content=await service.files.read(input.mountId,input.path);
 if(createHash('sha256').update(content).digest('hex')!==input.sourceHash)throw Error('VERSION_CONFLICT: 发布正文与核对版本不一致');
 const taskDelivery=input.dryRun?undefined:await service.prepareTaskDelivery({mountId:input.mountId,path:input.path,expectedContentHash:input.sourceHash});
 const args=input.provider==='dingtalk'
  ?(input.remoteId?['doc','+update','--node',input.remoteId,'--command','overwrite','--content','-','--format','json']:['doc','+create','--name',input.title,'--content','-','--format','json'])
  :(input.remoteId?['docs','+update','--doc',input.remoteId,'--mode','overwrite','--markdown','-']:['docs','+create','--title',input.title,'--markdown','-']);
 if(input.dryRun)args.push('--dry-run');
 await taskDelivery?.assertCurrent();
 store.operation(operationId,'manual-delivery',input.provider,input.dryRun?'preview':'executing');
 try{
  const receipt=await runCli(connection.command,[...connection.args,...args],content,service.state.root);
  if(input.dryRun){store.operation(operationId,'manual-delivery',input.provider,'preview',receiptText(receipt));return{operationId,status:'preview',receipt,diagnostic:'仅执行 CLI 预览，没有发布远端文档'};}
  const outcome=classifyReceipt(receipt);
  store.operation(operationId,'manual-delivery',input.provider,outcome.status,receiptText(receipt));
  return{operationId,...outcome,receipt};
 }catch(error){
  const status:Extract<OperationStatus,'failed'|'outcome_unknown'>=error instanceof ExternalCallError?error.outcome:'outcome_unknown';
  const diagnostic=redact(error instanceof Error?error.message:String(error));
  store.operation(operationId,'manual-delivery',input.provider,status,diagnostic);
  return{operationId,status,diagnostic};
 }
}

async function executeMcp(input:{connectionId:string;tool:string;args:Record<string,unknown>},operationId=randomUUID(),beforeDispatch?:()=>Promise<void>):Promise<ExternalResult>{
 const connection=connectionFor(input.connectionId,'mcp');
 if(connection.mcpPublisher)throw Error('PUBLISHER_HOST_ONLY');
 await beforeDispatch?.();
 store.operation(operationId,'manual-mcp',input.tool,'executing');
 try{
  const receipt=await mcpCall(connection,input.tool,input.args,beforeDispatch);
  const outcome=classifyReceipt(receipt);
  store.operation(operationId,'manual-mcp',input.tool,outcome.status,receiptText(receipt));
  return{operationId,...outcome,receipt};
 }catch(error){
  const status:Extract<OperationStatus,'failed'|'outcome_unknown'>=error instanceof ExternalCallError?error.outcome:'outcome_unknown';
  const diagnostic=redact(error instanceof Error?error.message:String(error));
  store.operation(operationId,'manual-mcp',input.tool,status,diagnostic);
  return{operationId,status,diagnostic};
 }
}

async function queueManualExternalAction(input:ExternalExecution & {target:string;userAuthorizationExcerpt?:string;conversationId?:string}):Promise<ExternalResult>{
 const external=service as ExternalService;
 const proposal=await external.createManualExternalActionProposal(input);
 return{operationId:proposal.id,status:'pending',receipt:{proposalId:proposal.id},diagnostic:'外部操作已登记，等待审批卡确认后执行'};
}

async function queryShare(name:string){
 try{const result=await powershell(`$s=Get-SmbShare -Name ${quotePowerShell(name)} -ErrorAction Stop; [ordered]@{name=$s.Name;path=$s.Path}|ConvertTo-Json -Compress`);return JSON.parse(result.stdout) as {name:string;path:string};}catch{return undefined;}
}
async function queryMapping(drive:string){
 try{const result=await powershell(`$m=Get-SmbMapping -LocalPath ${quotePowerShell(drive)} -ErrorAction Stop; [ordered]@{localPath=$m.LocalPath;remotePath=$m.RemotePath;status=[string]$m.Status}|ConvertTo-Json -Compress`);return JSON.parse(result.stdout) as {localPath:string;remotePath:string;status:string};}catch{return undefined;}
}

async function probeMappedShareWrite(drive:string){
 const probe=path.join(drive+'\\',`.slash-write-check-${randomUUID()}.tmp`);
 let handle:import('node:fs/promises').FileHandle|undefined;
 try{
  handle=await fs.open(probe,'wx');
  await handle.writeFile('Slash SMB write check\n');
 }finally{
  await handle?.close().catch(()=>{});
  await fs.unlink(probe).catch(()=>{});
 }
}

async function boot(){
 await app.whenReady();
 const devServerUrl=process.env.PM_SLASH_DEV_SERVER_URL?.trim();
 store=new Store(userDataDir);
 attachmentRepository=new AttachmentRepository(userDataDir);
  service=new Service(store,()=>modelSettings?.defaultCredential()??'',event=>{
   // Queue cleanup still persists and journals state after the renderer closes.
   // Only delivery to a destroyed/closing UI is skipped.
   if(windowClosing||!win||win.isDestroyed()||win.webContents.isDestroyed())return;
   win.webContents.send('pm:event',event);
  },undefined,{
  runReferenceScript,
  runPrototypeAcceptance,
  expectedPrototypeRunnerVersion:PROTOTYPE_BROWSER_VERSION,
  discoverConnections:discoverInstalledClis,
  openPlanReview:async value=>{const url=new URL(value);if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.pathname!=='/'||!/^\w{48}$/.test(url.searchParams.get('slashReview')??''))throw Error('PI_PLAN_REVIEW_URL_INVALID');if(!await isHiddenTestProfile(configuredDataDir,path.resolve(here,'../..','.test-data'),process.env.PM_SLASH_TEST_HIDDEN))await shell.openExternal(url.toString());},
  inspectConnection:async(connection,options)=>mcpHost?.publisherInspection(connection)??inspectConnection(connection,options),
  prototypePublicationTarget:id=>mcpHost?.publisherTarget(id),
  connectionChanged:(before,after)=>mcpHost?.changed(before,after),
   executeExternalAction:execution=>execution.kind==='document_delivery'
   ?executeDelivery({...execution,dryRun:false})
   :executeMcp(execution),
   prepareImages:async input=>{
    const refs=await Promise.all(input.attachmentIds.map(id=>attachmentRepository.get(id,input.workspaceRoot)));
    const models=(service.state.models??[]).map(item=>({id:item.id,name:item.name,modelId:item.modelId,provider:item.provider,baseUrl:item.baseUrl,protocol:item.protocol,hasKey:item.hasKey,supportsVision:item.supportsVision}));
    const selected=service.state.models?.find(item=>item.id===input.selectedModel.entryId);
    const bridge=new VisionBridge({repository:attachmentRepository,workspaceRoot:input.workspaceRoot,requestVision:visionRequest,cache:visionCache});
    const prepare=await bridge.prepare({attachments:refs,selectedModel:{...input.selectedModel,baseUrl:selected?.baseUrl,name:selected?.name},models,prompt:input.prompt,signal:input.signal,preferences:store.get<AppPreferences>('app-preferences',{} as AppPreferences)});
    const evidence=prepare.evidence?formatVisionEvidence(prepare.evidence):prepare.raw;
    return{images:prepare.images?Array.from(prepare.images):undefined,evidenceText:evidence,attachments:prepare.attachments};
   },
   redact,
  },id=>{try{return modelSettings?.credential(id);}catch{return undefined;}});
  // Keep a usable default project available before the renderer asks for state.
  // Existing workspaces are restored by Service; a first run gets a private
 // folder under the app data directory and the normal six mount folders.
 await service.initializeDefaultProject();
 deliveryGate=new DeliveryGate({
  store,
  files:service.files,
  businessProvenance:()=>service.createBusinessProvenanceResolver(),
  prototypeAcceptance:(mountId,path)=>service.prototypeAcceptanceDeliveryCheck(mountId,path),
  taskAcceptance:async(mountId,path,sourceHash)=>(await service.prepareTaskDelivery({mountId,path,expectedContentHash:sourceHash})).view,
  workspace:()=>({root:service.state.root,connections:service.state.connections}),
  actions:()=> (service as ExternalService).listExternalActions(),
  records:()=>service.state.root?new ProductRecordsRepository(store,{key:productRecordsWorkspaceIdentity(service.state.root).key}).snapshot():undefined,
  preferences:()=>store.get<Partial<AppPreferences>>('app-preferences',{}),
 });
 modelSettings=new ModelSettings(store,safeStorage,{get:()=>service.state,save:()=>service.save()});
 modelSettings.initialize();
 piPackageSettings=new PiPackageSettings(store,safeStorage);service.configurePiPackageSettings(piPackageSettings);
 mcpHost=new McpHost({store,cipher:safeStorage,publicationDirectory:userDataDir,connections:()=>service.state.connections,openExternal:url=>shell.openExternal(url)});
 visionRequest=async ({model,prompt,images,signal})=>{
   const entry=service.state.models?.find(item=>item.id===model.id)??service.state.models?.find(item=>item.modelId===model.modelId&&item.baseUrl===model.baseUrl&&item.protocol===model.protocol);
   const key=entry?modelSettings.credential(entry.id):'';
   if(!key||!model.baseUrl||!model.modelId)throw Error('VISION_CREDENTIAL_MISSING');
   const input={entryId:entry?.id,baseUrl:model.baseUrl,proxyUrl:entry?.proxyUrl,id:model.modelId,protocol:(model.protocol as import('../shared/types.js').ModelProtocol)||'openai-completions',contextWindow:entry?.contextWindow,maxTokens:entry?.maxTokens};
   const capabilities=await service.modelRuntimeCapabilities(input);
   const configured=await createOpenAICompatibleModelRuntime({...input,contextWindow:capabilities.capability.limits!.contextWindow,maxTokens:capabilities.capability.limits!.maxTokens,thinkingRuntime:capabilities.runtime,supportsVision:true},key);
   return configured.runtime.complete(configured.model,{messages:[{role:'user',content:[{type:'text',text:prompt},...images],timestamp:Date.now()}]},{maxTokens:Math.min(3000,configured.model.maxTokens),maxRetries:0,signal});
  };
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',()=>{port=(server.address() as {port:number}).port;resolve()}));
 const globalSkillFolderAuthorizations=new Set<string>();
 ipcMain.handle('pm:request',async(event,input)=>{
  try{
   if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)throw Error('非法调用来源');
   const request=requestSchema.parse(input);
   switch(request.type){
    case 'state':return{ok:true,data:service.stateSnapshot()};
    case 'knowledgeList':return{ok:true,data:await service.knowledgeList()};
    case 'knowledgeGet':return{ok:true,data:await service.knowledgeGet(request.id)};
    case 'knowledgeCreate':return{ok:true,data:await service.knowledgeCreate({title:request.title,sources:request.sources})};
    case 'knowledgeSetSources':return{ok:true,data:await service.knowledgeSetSources(request.id,request.sources)};
    case 'knowledgeInspectLocal':return{ok:true,data:await service.knowledgeInspectLocal(request.id)};
    case 'knowledgeRevealSource':shell.showItemInFolder(await service.knowledgeSource(request.id,request.chunkId));return{ok:true,data:{revealed:true}};
    case 'knowledgeRemove':return{ok:true,data:await service.knowledgeRemove(request.id)};
    case 'piPackages':return{ok:true,data:{packages:piPackageStatus(),observability:piPackageSettings.view()}};
    case 'subagentSettingsGet':return{ok:true,data:piPackageSettings.subagents()};
    case 'subagentSettingsSetEnabled':{
     const config=piPackageSettings.subagents();
     const invalid=request.enabled?config.profiles.find(profile=>profile.modelEntryId&&!service.state.models?.some(model=>model.id===profile.modelEntryId&&model.hasKey)):undefined;
     if(invalid)throw Error(`SUBAGENT_MODEL_UNAVAILABLE: ${invalid.name} 的模型不可用，请在设置中重新选择`);
     return{ok:true,data:piPackageSettings.setSubagentsEnabled(request.enabled)};
    }
    case 'subagentSettingsSave':{
     const invalid=request.config.enabled?request.config.profiles.find(profile=>profile.modelEntryId&&!service.state.models?.some(model=>model.id===profile.modelEntryId&&model.hasKey)):undefined;
     if(invalid)throw Error(`SUBAGENT_MODEL_UNAVAILABLE: ${invalid.name} 的模型不可用，请先重新选择或配置密钥`);
     return{ok:true,data:piPackageSettings.saveSubagents(request.config)};
    }
    case 'piPlanReviewCancel':return{ok:true,data:await service.cancelPiPlanReview(request.runId)};
    case 'piPlanReviewOpen':return{ok:true,data:await service.openPiPlanReview(request.runId)};
    case 'piObservabilitySave':{
     if(service.state.permissions?.connection_config==='deny')throw Error('PERMISSION_DENIED: 连接配置已禁用');
     await service.stopPiObservability();return{ok:true,data:piPackageSettings.save(request.config)};
    }
    case 'eventReplay':return{ok:true,data:store.replayEvents(request.streamId,request.afterSequence,request.limit)};
    case 'deliveryRecords':return{ok:true,data:store.get<DeliveryRecord[]>('delivery-records',[]).filter(item=>!request.runId||item.runId===request.runId)};
    case 'contextManifest':return{ok:true,data:store.get(`context-manifest:${request.runId}`,null)};
    case 'runCheckpoint':return{ok:true,data:store.get(`run-checkpoint:${request.runId}`,null)};
    case 'taskAcceptanceGet':return{ok:true,data:await service.getTaskAcceptance(request.runId)};
    case 'taskAcceptanceRecheck':{const{type,...input}=request;return{ok:true,data:await service.recheckTaskAcceptance(input)};}
    case 'taskDeliveryGet':return{ok:true,data:await service.taskDeliveryGet(request.runId,request.reportId)};
    case 'taskDeliveryReview':{const{type,...input}=request;return{ok:true,data:await service.reviewTaskDelivery(input)};}
    case 'taskAcceptanceOptional':{const{type,...input}=request;return{ok:true,data:await service.declareTaskAcceptanceOptional(input)};}
    case 'skillCommands':return{ok:true,data:await service.skillCommands()};
    case 'globalSkills':{const{type,...input}=request;if(input.action==='importFolder'&&!globalSkillFolderAuthorizations.has(path.resolve(input.path)))throw Error('GLOBAL_SKILL_FOLDER_AUTHORIZATION_REQUIRED: 请通过选择目录授权技能来源');return{ok:true,data:await service.globalSkillsRequest(input)};}
    case 'globalSkillsChooseFolder':{const folder=(await dialog.showOpenDialog(win,{title:'选择全局技能目录',properties:['openDirectory']})).filePaths[0];if(folder)globalSkillFolderAuthorizations.add(path.resolve(folder));return{ok:true,data:folder};}
    case 'appPreferences':{const defaults:AppPreferences={qualityGateEnabled:true,forceQualityCheckBeforeDelivery:true,maxParallelTasks:4,maxParallelConcurrency:2,subAgentMaxDepth:1,subAgentMaxTasks:8,shareLockTtlMs:120000,modelRouting:{strategy:'task_type',taskTypes:{research:'',analysis:'',writing:'',coding:'',review:'',general:''}},subAgentTools:['read_file','search_files','read_workspace_rules','list_artifact_versions','list_product_records','query_artifact_impact','read_web_page','list_connections'],visionAutoFallback:true};const current={...defaults,...(store.get<Partial<AppPreferences>>('app-preferences',{})),...(request.patch||{}),modelRouting:{...defaults.modelRouting,...(store.get<Partial<AppPreferences>>('app-preferences',{}).modelRouting||{}),...((request.patch as Partial<AppPreferences>|undefined)?.modelRouting||{})}};if(request.patch)store.set('app-preferences',current);return{ok:true,data:current};}
    case 'visionAttach':return{ok:true,data:await attachmentRepository.importPath(request.path,service.state.root)};
    case 'visionAnalyze':return{ok:true,data:await analyzeImageWithBridge(request.path,request.prompt,request.modelEntryId)};
    case 'windowTheme':{const colors={reference:{color:'#f6f7f8',symbolColor:'#20242b'},graphite:{color:'#151a20',symbolColor:'#f0ece5'},sand:{color:'#eee3d2',symbolColor:'#3d3027'}} as const;win?.setTitleBarOverlay?.({...colors[request.theme],height:36});win?.setBackgroundColor(colors[request.theme].color);return{ok:true,data:null};}
     case 'workspace':
     case 'mount':{
     const folder=request.path||(await dialog.showOpenDialog(win,{properties:['openDirectory','createDirectory']})).filePaths[0];
     if(!folder)return{ok:true,data:null};
      return{ok:true,data:request.type==='workspace'?await service.workspace(folder):await service.mount(folder,request.write)};
     }
     case 'systemPromptGet':return{ok:true,data:service.systemPromptGet()};
    case 'systemPromptSave':return{ok:true,data:service.systemPromptSave(request.content)};
    case 'systemPromptReset':return{ok:true,data:service.systemPromptReset()};
    case 'projectTreeGet':return{ok:true,data:await service.projectTreeGet()};
    case 'projectTreeSave':return{ok:true,data:await service.projectTreeSave(request.workspaceId,request.nodes,request.expectedRevision)};
    case 'projectTreeApply':return{ok:true,data:await service.projectTreeApply(request.workspaceId,request.expectedRevision)};
    case 'projects':return{ok:true,data:service.listProjects()};
    case 'projectCatalog':return{ok:true,data:service.projectCatalog().list()};
    case 'projectBrowse':return{ok:true,data:await service.projectCatalog().browse(request.projectId,request.mountId,request.path)};
    case 'projectReadDocument':return{ok:true,data:await service.projectCatalog().read(request.projectId,request.mountId,request.path)};
    case 'projectRevealFile':shell.showItemInFolder(await service.projectCatalog().resolve(request.projectId,request.mountId,request.path));return{ok:true,data:null};
    case 'projectOpenDirectory':{const target=await service.projectCatalog().resolveDirectory(request.projectId,request.mountId,request.path),error=await shell.openPath(target);if(error)throw Error(`DIRECTORY_OPEN_FAILED: ${error}`);return{ok:true,data:null};}
     case 'project':{
      let folder=request.path;
      if(!folder&&!request.id)folder=(await dialog.showOpenDialog(win,{title:'选择项目文件夹',properties:['openDirectory','createDirectory']})).filePaths[0];
      if(!folder&&!request.id)return{ok:true,data:null};
      const root=await service.project({id:request.id,path:folder});
      return{ok:true,data:{root,...service.listProjects()}};
     }
     case 'projectDefault':return{ok:true,data:await service.setDefaultProject({id:request.id,path:request.path})};
    case 'projectRename':return{ok:true,data:service.renameProject(request.id,request.name)};
    case 'projectPin':return{ok:true,data:service.pinProject(request.id,request.pinned)};
    case 'projectRemove':return{ok:true,data:await service.removeProject(request.id)};
    case 'projectReveal':{const error=await shell.openPath(service.projectRoot(request.id));if(error)throw Error(error);return{ok:true,data:null};}
    case 'modelThinkingCapability':return{ok:true,data:await service.modelThinkingCapability(request)};
    case 'mountAccess':{
     service.setMountAccess(request.id,request.write,request.enabled);break;
    }
    case 'conversation':return{ok:true,data:service.conversation(request.id,request.title,request.archived)};
    case 'conversationDelete':return{ok:true,data:service.deleteConversation(request.id)};
    case 'designCatalog':return{ok:true,data:designCatalog()};
    case 'designSourceOpen':await shell.openExternal(designSourceUrl(request.id,request.target));return{ok:true,data:true};
    case 'send':return{ok:true,data:await service.send(request.id,request.text,request.mode,request.permissionMode,request.modelEntryId,undefined,undefined,request.taskType,request.attachmentIds,request.workflow,request.thinkingLevel,undefined,undefined,request.designReferences)};
    case 'runInputEnqueue':{const{type,...input}=request;return{ok:true,data:service.enqueueRunInput(input)};}
    case 'runInputMutate':{const{type,...input}=request;return{ok:true,data:service.mutateRunInput(input)};}
    case 'runPermissionModeSet':return{ok:true,data:service.setRunPermissionMode(request.conversationId,request.runId,request.permissionMode)};
    case 'runInputClearQueued':return{ok:true,data:service.clearRunInputs({runId:request.runId})};
    case 'planDraft':return{ok:true,data:await service.savePlanDraft(request.id,request.selectedOptionIds,request.customText)};
    case 'planConfirm':return{ok:true,data:await service.confirmPlan(request.id,request.selectedOptionIds,request.customText,request.permissionMode,request.modelEntryId,request.thinkingLevel)};
    case 'resume':return{ok:true,data:await service.resumeRun(request.id,request.freshContext)};
    case 'runRecoveryGet':return{ok:true,data:await service.listRunRecovery(request.runId)};
    case 'runRecoveryReconcile':{const{type,...input}=request;return{ok:true,data:await service.reconcileRunOperation(input)};}
    case 'cancel':service.cancel(request.id);break;
     case 'files':{const ids=new Set(service.state.mounts.map(m=>m.id));return{ok:true,data:(await service.files.list(request.query)).filter(file=>ids.has(file.mountId))};}
     case 'importFiles':return{ok:true,data:await service.importFiles(request.files??request.paths??[],request.category,request.target)};
    case 'read':return{ok:true,data:await service.files.read(request.mountId,request.path)};
    case 'fileProtection':return{ok:true,data:await service.files.protection(request.mountId,request.path)};
    case 'copyForProcessing':return{ok:true,data:await service.copyForProcessing(request)};
    case 'processProcessingCopy':return{ok:true,data:await service.processProcessingCopy(request.id,request.operation,undefined,request.operation==='script'?request.script:undefined)};
    case 'readDocument':{
     const file=await service.files.resolve(request.mountId,request.path);
     const extension=path.extname(file).toLowerCase();
     if(extension==='.docx')return{ok:true,data:await service.readWordDocument(request.mountId,request.path)};
     const version=await fileVersion(file);
     const content=await service.files.read(request.mountId,request.path);
     return{ok:true,data:{content,version,format:/\.md$/i.test(extension)?'markdown':'text'}};
    }
    case 'apply':await service.apply(request.id,request.source??'ipc');break;
    case 'preview':{
     const file=await service.files.resolve(request.mountId,request.path);
     const token=randomUUID();const base=path.dirname(request.path);
     previews.set(token,{mountId:request.mountId,file:request.path,base});
     return{ok:true,data:{url:`http://127.0.0.1:${port}/${token}/${encodeURIComponent(path.basename(request.path))}`,version:await fileVersion(file)}};
    }
    case 'reveal':shell.showItemInFolder(await service.files.resolve(request.mountId,request.path));break;
    case 'changeReveal':{
     const change=service.state.changes.find(item=>item.id===request.id);if(!change)throw Error('CHANGE_NOT_FOUND: 修改草稿不存在');
     const location=await service.files.revealLocation(change.mountId,change.path);
     if(location.kind==='file')shell.showItemInFolder(location.path);
     else{const error=await shell.openPath(location.path);if(error)throw Error(`REVEAL_FAILED: ${error}`);}
     return{ok:true,data:{fileExists:location.fileExists,notice:location.fileExists?undefined:change.status==='pending'&&change.before===null?'草稿尚未保存到项目，已打开最近存在的项目文件夹。':'文件当前不存在，已打开最近存在的项目文件夹。'}};
    }
    case 'model':{
     const selected=service.state.models?.find(item=>item.id===service.state.defaultModelId);
     const saved=modelSettings.upsert({id:selected?.id,provider:selected?.provider??'baishan',name:selected?.name??(request.id==='DeepSeek-V4-Flash-0731'?'Baishan DeepSeek-V4-Flash-0731':request.id),baseUrl:request.baseUrl,modelId:request.id,protocol:'openai-completions'},request.key);
     modelSettings.setDefault(saved.id);break;
    }
    case 'testModel':{
     if(!service.state.defaultModelId)throw Error('未配置默认模型');return{ok:true,data:await testConfiguredModel(service.state.defaultModelId)};
    }
    case 'models':return{ok:true,data:{groups:modelSettings.list(),defaultModelId:service.state.defaultModelId}};
    case 'modelDiscover':{
     const key=modelSettings.connectionCredential(request);
     // Do not echo draft credentials or an untrusted upstream error body into the renderer.
     try{return{ok:true,data:await discoverModels(request,key??'')};}
     catch(error){const message=error instanceof Error?error.message:'获取模型列表失败';throw Error(key?message.replaceAll(key,'[REDACTED]'):message);}
    }
    case 'modelBatchAdd':return{ok:true,data:modelSettings.batchAdd(request)};
    case 'modelUpsert':return{ok:true,data:await modelSettings.upsertWithCapabilities(request.model,request.key,id=>service.modelThinkingCapability({modelEntryId:id,refresh:true}))};
    case 'modelRemove':return{ok:true,data:{groups:modelSettings.remove(request.id),defaultModelId:service.state.defaultModelId}};
    case 'modelDefault':return{ok:true,data:{defaultModelId:modelSettings.setDefault(request.id)}};
    case 'modelTest':return{ok:true,data:await testConfiguredModel(request.id)};
    case 'connection':{
     const connection={...request.connection,name:request.connection.name.trim(),command:request.connection.command.trim(),url:request.connection.url?.trim()||undefined};
     if(connection.kind==='cli')validateExecutable(connection.command);
     mcpHost.changed(service.state.connections.find(item=>item.id===connection.id),connection);
     service.state.connections=service.state.connections.filter(item=>item.id!==connection.id);service.state.connections.push(connection);service.save();break;
    }
    case 'connectionRemove':mcpHost.changed(service.state.connections.find(item=>item.id===request.id),undefined);service.state.connections=service.state.connections.filter(item=>item.id!==request.id);service.save();break;
    case 'prototypePublicationStatus':{
     const action=(service as ExternalService).listExternalActions().find(item=>item.id===request.id);
     if(!action?.operationId||!service.isHostPrototypePublication(request.id))throw Error('PUBLICATION_HOST_ACTION_IDENTITY');
     return{ok:true,data:await service.executePrototypePublication(request.id,action.operationId,'status')};
    }
    case 'mcpPublisherVerify':
    case 'mcpPublisherStatus':
    case 'mcpPublisherCredential':
    case 'mcpPublisherDisconnect':
    case 'mcpAuthStatus':case 'mcpAuthLogin':case 'mcpAuthCancel':case 'mcpAuthDisconnect':case 'mcpElicitations':case 'mcpElicitationOpen':case 'mcpElicitationRespond':return{ok:true,data:await mcpHost.request(request)};
    case 'testConnection':return{ok:true,data:await testConnection(request.id)};
    case 'connectionDiscover':return{ok:true,data:await (service as ExternalService).discoverConnections()};
    case 'connectionSelectExecutable':{
     const file=(await dialog.showOpenDialog(win,{title:'选择 CLI 或 MCP 可执行文件',properties:['openFile'],filters:[{name:'Windows 可执行文件',extensions:['exe']}]})).filePaths[0];
     if(!file)return{ok:true,data:null};validateExecutable(file);return{ok:true,data:{command:file}};
    }
    case 'deliveryPreflight':return{ok:true,data:await deliveryPreflight(request)};
    case 'deliveryChecklist':return{ok:true,data:await deliveryGate.check(request,request.patch)};
    case 'deliver':if(!request.dryRun)return{ok:true,data:await queueManualExternalAction({kind:'document_delivery',connectionId:request.connectionId,mountId:request.mountId,path:request.path,title:request.title,provider:request.provider,remoteId:request.remoteId,sourceHash:request.sourceHash,target:`${request.provider}:${request.path}`,userAuthorizationExcerpt:'用户在交付面板中明确确认发布',conversationId:service.state.conversations.find(item=>!item.archived)?.id})};return{ok:true,data:await executeDelivery(request)};
    case 'mcpCall':return{ok:true,data:await queueManualExternalAction({kind:'mcp_call',connectionId:request.connectionId,tool:request.tool,args:request.args,artifactBinding:request.artifactBinding,prototypeProject:request.prototypeProject,target:`MCP 工具：${request.tool}`,userAuthorizationExcerpt:'用户在 MCP 面板中明确确认执行',conversationId:service.state.conversations.find(item=>!item.archived)?.id})};
    case 'externalActions':return{ok:true,data:(service as ExternalService).listPendingExternalActions(request.conversationId)};
    case 'permissionSet':(service as ExternalService).setPermission(request.capability,request.decision);break;
    case 'pendingApprovals':return{ok:true,data:(service as ExternalService).listPendingApprovals(request.conversationId)};
    case 'approvalResolve':return{ok:true,data:(service as ExternalService).resolveApproval(request.id,request.decision,request.reason)};
    case 'externalAction':{
     const external=service as ExternalService;
     if(request.decision==='reject'){const rejected=external.rejectExternalAction(request.id,request.reason);if(rejected.runId.startsWith('manual:'))store.operation(rejected.id,rejected.runId,'external-action','rejected',redact(rejected.diagnostic??''));return{ok:true,data:rejected};}
     const pendingDelivery=await service.prepareExternalTaskDelivery(request.id);await pendingDelivery.assertCurrent();
     const approved=external.approveExternalAction(request.id,request.input);
     const taskDelivery=await service.prepareExternalTaskDelivery(request.id);await taskDelivery.assertCurrent();
    if(approved.execution.kind==='document_delivery'){
      const delivery=approved.execution as Extract<ExternalExecution,{kind:'document_delivery'}>;
      let preflight:DeliveryPreflight;
      try{preflight=await deliveryGate.check(delivery);}catch(error){
       const reason=error instanceof Error?error.message:'交付前检查失败';
       const rejected=external.rejectExternalAction(request.id,reason);
       if(rejected.runId.startsWith('manual:'))store.operation(rejected.id,rejected.runId,'external-action','rejected',redact(reason));
       throw error;
      }
      if(!preflight.allowed){
       const reason=preflight.checks.filter(item=>item.status==='blocked').map(item=>item.detail).join('；')||'交付前检查未通过';
       const rejected=external.rejectExternalAction(request.id,reason);
       if(rejected.runId.startsWith('manual:'))store.operation(rejected.id,rejected.runId,'external-action','rejected',redact(reason));
       throw Error(`QUALITY_GATE_BLOCKED: ${reason}`);
      }
     }
     const operationId=randomUUID();external.markExternalActionExecuting(request.id,operationId);if(approved.proposal.runId.startsWith('manual:'))store.operation(approved.proposal.id,approved.proposal.runId,'external-action','executing');
     const hostPublication=service.isHostPrototypePublication(request.id);
     try{
      let result:ExternalResult;
      if(approved.execution.kind==='document_delivery'){
       const checked=requestSchema.parse({type:'deliver',...approved.execution,dryRun:false});if(checked.type!=='deliver')throw Error('外部文档请求校验失败');
       result=await executeDelivery(checked,operationId);
      }else{
       if(hostPublication){result=await service.executePrototypePublication(request.id,operationId);}
       else{
       const {kind,deliveryBinding,prototypeDeliveryBinding,...input}=approved.execution;
       const checked=requestSchema.parse({type:'mcpCall',...input});if(checked.type!=='mcpCall')throw Error('MCP 请求校验失败');
       result=await executeMcp(checked,operationId,taskDelivery.assertCurrent);
       }
      }
      const status:Extract<OperationStatus,'succeeded'|'failed'|'outcome_unknown'>=result.status==='succeeded'||result.status==='failed'||result.status==='outcome_unknown'?result.status:'outcome_unknown';
      const completed=hostPublication?external.listExternalActions().find(item=>item.id===request.id)!:external.completeExternalAction(request.id,{operationId,status,receipt:result.receipt,diagnostic:result.diagnostic});if(completed.runId.startsWith('manual:'))store.operation(completed.id,completed.runId,'external-action',status,redact(result.diagnostic));return{ok:true,data:completed};
     }catch(error){
      // Host publication already owns its typed Operation. Guard rejection is
      // not proof of failed side effects and must not overwrite that receipt.
      if(hostPublication)throw error;
      const diagnostic=redact(error instanceof Error?error.message:String(error));store.operation(operationId,'external-action',approved.execution.kind,'failed',diagnostic);
      const completed=external.completeExternalAction(request.id,{operationId,status:'failed',diagnostic});if(completed.runId.startsWith('manual:'))store.operation(completed.id,completed.runId,'external-action','failed',diagnostic);return{ok:true,data:completed};
     }
    }
    case 'operations':{
     const rows=store.db.prepare('SELECT id,run_id,tool,state,result,created_at FROM operations ORDER BY created_at DESC LIMIT ?').all(request.limit) as Array<Record<string,unknown>>;
     return{ok:true,data:rows.map(row=>({id:String(row.id),runId:String(row.run_id||''),tool:String(row.tool),state:String(row.state),result:String(row.result||''),createdAt:String(row.created_at)}))};
    }
    case 'productRecords':{
     if(!service.state.root)throw Error('请先设置工作空间');
     const identity=productRecordsWorkspaceIdentity(service.state.root);const repository=new ProductRecordsRepository(store,{key:identity.key});const snapshot=repository.snapshot();const visibleArtifacts=[];
     for(const artifact of snapshot.artifacts)try{await service.files.resolve(artifact.mountId,artifact.relativePath);visibleArtifacts.push(artifact);}catch{}
     const visibleIds=new Set(visibleArtifacts.map(artifact=>artifact.id));const requirements=[];
     for(const requirement of snapshot.requirements){const sourceRefs=[];for(const source of requirement.sourceRefs)try{await service.files.resolve(source.mountId,source.relativePath);sourceRefs.push(source);}catch{}requirements.push({...requirement,sourceRefs});}
     return{ok:true,data:{...snapshot,workspaceId:identity.workspaceId,requirements:await service.visibleBusinessRequirements(requirements),artifacts:visibleArtifacts,artifactLinks:snapshot.artifactLinks.filter(link=>visibleIds.has(link.fromArtifactId)&&visibleIds.has(link.toArtifactId)),reviews:snapshot.reviews.filter(review=>visibleIds.has(review.artifactId)),designPackages:snapshot.designPackages.map(item=>({...item,artifactIds:item.artifactIds.filter(id=>visibleIds.has(id))}))}};
    }
    case 'reviewIssueTransition':{
     if(!service.state.root)throw Error('请先设置工作空间');
     const identity=productRecordsWorkspaceIdentity(service.state.root);const repository=new ProductRecordsRepository(store,{key:identity.key});
     const snapshot=repository.snapshot();const review=snapshot.reviews.find(item=>item.id===request.reviewId);if(!review)throw Error('REVIEW_NOT_FOUND');
     const issue=review.issues.find(item=>item.id===request.issueId);if(!issue)throw Error('REVIEW_ISSUE_NOT_FOUND');
     const artifact=snapshot.artifacts.find(item=>item.id===review.artifactId);if(!artifact)throw Error('ARTIFACT_NOT_FOUND');
     const currentHash=await fileVersion(await service.files.resolve(artifact.mountId,artifact.relativePath));
     if(currentHash!==review.artifactVersionHash&&!['rejected','needs_clarification'].includes(request.status))throw Error('VERSION_BINDING_MISMATCH: 成果已变化，请重新发起当前版本评审；旧意见仍可拒绝或标记待澄清');
     const updated=repository.transitionReviewIssue(request.reviewId,request.issueId,request.status,{note:request.note,clarificationQuestion:request.clarificationQuestion,resolution:request.resolution,resolvedInHash:request.status==='resolved'?currentHash:undefined},request.expectedRevision);
     return{ok:true,data:updated};
    }
    case 'decisionCenter':{
     if(!service.state.root)throw Error('请先设置工作空间');
     const identity=productRecordsWorkspaceIdentity(service.state.root);const snapshot=new ProductRecordsRepository(store,{key:identity.key}).snapshot();const decisionRepository=new DecisionRepository(store,{key:decisionRepositoryKey(identity.workspaceId)});const decisionSnapshot=decisionRepository.snapshot();const items=[] as Array<Record<string,unknown>>;
     for(const req of snapshot.requirements)for(const q of req.pendingQuestions.filter(item=>item.status==='open'))items.push({id:`question:${req.id}:${q.id}`,kind:'requirement_question',title:q.question,description:req.title,status:'pending',sourceId:req.id,requirementIds:[req.id],conversationIds:req.sourceConversationIds,artifactIds:snapshot.artifacts.filter(artifact=>requirementRelatedToPath(req,artifact.mountId,artifact.relativePath)).map(artifact=>artifact.id),updatedAt:req.updatedAt});
     for(const req of snapshot.requirements)for(const a of req.assumptions.filter(item=>item.status==='active'))items.push({id:`assumption:${req.id}:${a.id}`,kind:'requirement_question',title:a.text,description:`业务假设 · ${req.title}`,status:'pending',sourceId:req.id,requirementIds:[req.id],conversationIds:req.sourceConversationIds,updatedAt:req.updatedAt});
     for(const review of snapshot.reviews)for(const issue of review.issues.filter(item=>['open','needs_clarification'].includes(item.status)))items.push({id:`review:${review.id}:${issue.id}`,kind:'review_issue',title:issue.title,description:issue.description,status:issue.status,sourceId:review.id,artifactId:review.artifactId,updatedAt:issue.updatedAt});
     for(const action of (service as ExternalService).listExternalActions())if(action.status==='outcome_unknown')items.push({id:`delivery:${action.id}`,kind:'external_action',title:'外部交付结果待核对',description:action.target,status:action.status,sourceId:action.id,conversationId:action.conversationId,conversationIds:[action.conversationId],updatedAt:action.updatedAt});
     for(const decision of decisionSnapshot.records.filter(item=>item.workspaceId===identity.workspaceId))items.push({id:`decision:${decision.id}`,kind:decision.kind,title:decision.title,description:decision.description,status:decision.status,sourceId:decision.sourceRefs[0]?.label||decision.sourceRefs[0]?.id||decision.id,updatedAt:decision.updatedAt,recordId:decision.id,impact:decision.impact,nextAction:decision.nextAction,sourceRefs:decision.sourceRefs,artifactIds:decision.artifactIds,conversationIds:decision.conversationIds,requirementIds:decision.requirementIds,history:decision.history,confirmedBy:decision.confirmedBy});
     return{ok:true,data:{workspaceId:identity.workspaceId,revision:snapshot.revision+decisionSnapshot.revision,items,ruleLayers:[{kind:'host_policy',label:'系统规则',authority:'enforced',priority:400,description:'安全与权限策略'},{kind:'workspace_rules',label:'工作空间规则',authority:'instruction',priority:300,description:'AGENTS.md 与工作空间规范'},{kind:'confirmed_knowledge',label:'项目规则',authority:'evidence',priority:200,description:'已确认知识与项目约束'},{kind:'task_context',label:'会话上下文',authority:'instruction',priority:100,description:'当前会话临时约束'}]}};
    }
    case 'prototypeAcceptanceGet':{const {type:_,...input}=request;return{ok:true,data:await service.getPrototypeAcceptance(input)};}
    case 'prototypeAcceptanceSave':{const {type:_,mode,...input}=request;return{ok:true,data:await service.savePrototypeAcceptance(input,mode)};}
    case 'prototypeAcceptanceRequired':{const {type:_,...input}=request;return{ok:true,data:await service.setPrototypeAcceptanceRequired(input)};}
    case 'prototypeAcceptanceRun':{const {type:_,...input}=request;return{ok:true,data:await service.startPrototypeAcceptance(input,request.mode)};}
    case 'prototypeAcceptanceCancel':return{ok:true,data:service.cancelPrototypeAcceptance(request.executionId)};
    case 'prototypeAcceptanceScreenshot':return{ok:true,data:await service.prototypeAcceptanceScreenshot(request.reportId,request.screenshotId)};
    case 'businessRuleCheck':{const {type:_,...input}=request;return{ok:true,data:await service.checkBusinessRules(input)};}
    case 'requirementQuestionAnswer':return{ok:true,data:service.answerRequirementQuestions(request.requirementId,request.conversationId,request.answers,request.expectedRevision)};
    case 'decisionCreate':{
     if(!service.state.root)throw Error('请先设置工作空间');const identity=productRecordsWorkspaceIdentity(service.state.root);const records=new ProductRecordsRepository(store,{key:identity.key}).snapshot();for(const id of request.decision.requirementIds)if(!records.requirements.some(item=>item.id===id&&item.workspaceId===identity.workspaceId))throw Error(`REQUIREMENT_NOT_FOUND: ${id}`);for(const id of request.decision.artifactIds)if(!records.artifacts.some(item=>item.id===id&&item.workspaceId===identity.workspaceId))throw Error(`ARTIFACT_NOT_FOUND: ${id}`);for(const id of request.decision.conversationIds)if(!service.state.conversations.some(item=>item.id===id))throw Error(`CONVERSATION_NOT_FOUND: ${id}`);const repository=new DecisionRepository(store,{key:decisionRepositoryKey(identity.workspaceId)});const decision=repository.create({...request.decision,workspaceId:identity.workspaceId},request.expectedRevision);return{ok:true,data:decision};
    }
    case 'decisionTransition':{
     if(!service.state.root)throw Error('请先设置工作空间');const identity=productRecordsWorkspaceIdentity(service.state.root);const repository=new DecisionRepository(store,{key:decisionRepositoryKey(identity.workspaceId)});return{ok:true,data:repository.transition(request.id,request.status,{actor:request.actor,note:request.note},request.expectedRevision)};
    }
    case 'artifactDiff':{
     if(!service.state.root)throw Error('请先设置工作空间');const identity=productRecordsWorkspaceIdentity(service.state.root);const artifact=new ProductRecordsRepository(store,{key:identity.key}).snapshot().artifacts.find(item=>item.id===request.artifactId);if(!artifact)throw Error('ARTIFACT_NOT_FOUND');
     const versions=await listFileVersions(service.files,path.join(store.dir,'versions'),{mountId:artifact.mountId,path:artifact.relativePath});const from=await readFileVersion(service.files,path.join(store.dir,'versions'),{mountId:artifact.mountId,path:artifact.relativePath},request.fromVersionId);const to=request.toVersionId?await readFileVersion(service.files,path.join(store.dir,'versions'),{mountId:artifact.mountId,path:artifact.relativePath},request.toVersionId):{content:await service.files.read(artifact.mountId,artifact.relativePath)};const diff=deterministicDiff(from.content,to.content);const a=from.content.split(/\r?\n/),b=to.content.split(/\r?\n/);const headings=(lines:string[])=>lines.filter(line=>/^#{1,6}\s/.test(line)).map(line=>line.trim());const as=new Set(headings(a)),bs=new Set(headings(b));return{ok:true,data:{artifactId:artifact.id,fromVersionId:request.fromVersionId,toVersionId:request.toVersionId??'current',file:{added:diff.added,removed:diff.removed,fromLines:a.length,toLines:b.length},structure:{addedHeadings:[...bs].filter(x=>!as.has(x)),removedHeadings:[...as].filter(x=>!bs.has(x))},impact:snapshotImpact(store,service.state.root,artifact.id)}};
    }
    case 'artifactImpactGraph':{
     if(!service.state.root)throw Error('请先设置工作空间');return{ok:true,data:await buildImpactGraph(store,service.state.root,request.artifactId,{direction:request.direction,includeCandidates:request.includeCandidates,maxDepth:request.maxDepth})};
    }
    case 'qualityHistory':{
     if(!service.state.root)throw Error('请先设置工作空间');const identity=productRecordsWorkspaceIdentity(service.state.root);const artifact=new ProductRecordsRepository(store,{key:identity.key}).snapshot().artifacts.find(item=>item.id===request.artifactId);if(!artifact)throw Error('ARTIFACT_NOT_FOUND');const reports=new QualityReportRepository(store,identity.workspaceId).list({artifactId:artifact.id,limit:request.limit});for(const row of reports.reports)if(row.report.details?.prototypeAcceptance){const {prototypeAcceptance:_,...details}=row.report.details;row.report.details=details;}return{ok:true,data:reports};
    }
    case 'templateWorkflow':{
     if(!service.state.root)throw Error('请先设置工作空间');const previews=[];
     for(const preview of service.listTemplateMigrationPreviews()){
      const impacts=[];for(const impact of preview.impacts)try{await service.files.resolve(impact.target.mountId,impact.target.path);impacts.push(impact);}catch{}
      previews.push({...preview,impacts});
     }
     const previewIds=new Set(previews.map(item=>item.previewId));return{ok:true,data:{previews,groups:service.listTemplateMigrationGroups().filter(item=>previewIds.has(item.previewId)),ruleChanges:service.listWorkspaceRuleChanges()}};
    }
    case 'applyTemplateMigrationGroup':return{ok:true,data:await service.applyTemplateMigrationGroup(request.id)};
    case 'applyWorkspaceRuleChange':return{ok:true,data:await service.applyWorkspaceRuleChange(request.id)};
    case 'flowPreview':{
     if(!/\.(?:drawio|xml)$/i.test(request.path))throw Error('VALIDATION_FAILED: 流程图源文件必须是 .drawio 或 .xml');const source=await service.files.read(request.mountId,request.path);const result=processDrawio(source);
     return{ok:true,data:{version:createHash('sha256').update(source).digest('hex'),report:result.report,limitations:result.document.limitations,previews:result.previews}};
    }
    case 'qualityCheck':{
     let artifact: {id?:string;kind:'document'|'prototype'|'flow'|'template'|'knowledge'|'reference'|'other';title:string;mountId:string;relativePath:string;currentVersionHash?:string};
     if(request.artifactId){
      if(!service.state.root)throw Error('请先设置工作空间');
      const identity=productRecordsWorkspaceIdentity(service.state.root);const snapshot=new ProductRecordsRepository(store,{key:identity.key}).snapshot();const found=snapshot.artifacts.find(item=>item.id===request.artifactId);
      if(!found)throw Error('ARTIFACT_NOT_FOUND: 成果不存在或未注册');
      artifact=found;
     }else{
      const mountId=request.mountId!,relativePath=request.path!;
      if(!service.state.root)throw Error('请先设置工作空间');
      const identity=productRecordsWorkspaceIdentity(service.state.root);const snapshot=new ProductRecordsRepository(store,{key:identity.key}).snapshot();const found=snapshot.artifacts.find(item=>item.mountId===mountId&&item.relativePath===relativePath);
      const kind=(found?.kind??(/\.(?:drawio|xml)$/i.test(relativePath)?'flow':/\.html?$/i.test(relativePath)?'prototype':'document')) as typeof artifact.kind;
      artifact=found??{kind,title:path.basename(relativePath),mountId,relativePath};
     }
     const currentSource=await service.files.read(artifact.mountId,artifact.relativePath);const currentHash=createHash('sha256').update(currentSource).digest('hex');
     const versions=await listFileVersions(service.files,path.join(store.dir,'versions'),{mountId:artifact.mountId,path:artifact.relativePath});
     let source=currentSource;let versionId='current';
     if(request.versionId){const selected=versions.find(item=>item.id===request.versionId);if(!selected)throw Error('VERSION_NOT_FOUND: 未找到请求的成果版本');const selectedContent=await readFileVersion(service.files,path.join(store.dir,'versions'),{mountId:artifact.mountId,path:artifact.relativePath},request.versionId);source=selectedContent.content;versionId=selectedContent.summary.id;}
     const contentHash=createHash('sha256').update(source).digest('hex');const rawCheck=qualityCheckForArtifact(artifact,source);const check={...rawCheck,passed:rawCheck.valid,blockingIssues:rawCheck.issues.filter(issue=>issue.severity==='blocking'),warnings:rawCheck.issues.filter(issue=>issue.severity==='warning'),recommendations:[],checkedVersion:versionId,contentHash,checkerVersion:QUALITY_CHECKER_VERSION,checkedAt:new Date().toISOString(),inputSources:[`${artifact.mountId}:${artifact.relativePath}`],requiresHumanConfirmation:rawCheck.issues.some(issue=>issue.severity==='warning')};
     const gate=evaluateQualityGate(check,contentHash,currentHash);
     if(service.state.root){const identity=productRecordsWorkspaceIdentity(service.state.root);new QualityReportRepository(store,identity.workspaceId).save({artifactId:artifact.id,mountId:artifact.mountId,path:artifact.relativePath,report:check,gate});}
     const reportKey=`quality-reports:${artifact.id??`${artifact.mountId}:${artifact.relativePath}`}`;const previous=store.get<typeof check[]>(reportKey,[]);store.set(reportKey,[check,...previous.filter(item=>item.contentHash!==check.contentHash)].slice(0,20));
     const deliveries=(service as ExternalService).listExternalActions({mountId:artifact.mountId,path:artifact.relativePath,sourceHash:contentHash});
     return{ok:true,data:{artifactId:artifact.id,artifact:{kind:artifact.kind,title:artifact.title,mountId:artifact.mountId,path:artifact.relativePath,versionId,contentHash,currentVersionHash:currentHash},check,gate,versions,deliveries}};
    }    case 'versions':return{ok:true,data:await listFileVersions(service.files,path.join(store.dir,'versions'),{mountId:request.mountId,path:request.path})};
    case 'versionContent':{
     return{ok:true,data:await readFileVersion(service.files,path.join(store.dir,'versions'),{mountId:request.mountId,path:request.path},request.versionId)};
    }
    case 'restore':{
     const conversation=service.state.conversations.find(item=>item.id===request.conversationId);if(!conversation)throw Error('会话不存在');
     const runId=randomUUID();const now=new Date().toISOString();const change=await prepareRestoreDraft(service.files,path.join(store.dir,'versions'),{mountId:request.mountId,path:request.path},request.versionId,runId);
     service.state.runs.unshift({id:runId,conversationId:request.conversationId,status:'succeeded',startedAt:now});
     conversation.messages.push({role:'user',text:`恢复 ${request.path} 到历史版本 ${request.versionId}`,time:now},{role:'assistant',text:'已准备历史版本恢复草稿。当前文件尚未覆盖，请在变更卡片中查看并应用。',time:now});
     service.state.changes.unshift(change);service.save();return{ok:true,data:change};
    }
    case 'export':{
     if(request.format==='test_cases_markdown'||request.format==='test_cases_xlsx'||request.format==='copy'&&isTestCasePath(request.path)){
      const extension=request.format==='test_cases_xlsx'?'.xlsx':request.format==='copy'?'_导出.testcases.json':'.md',source=await service.files.resolve(request.mountId,request.path);
      const target=(await dialog.showSaveDialog(win,{defaultPath:source.replace(/\.testcases\.json$/i,'')+extension})).filePath;if(!target)return{ok:true,data:null};
      const output=await writableOutputRef(target),report=await service.exportTestCases(request,output,request.format);
      return{ok:true,data:{path:await service.files.resolve(output.mountId,output.path),report}};
     }
     const source=await service.files.resolve(request.mountId,request.path);
     const capturedSource=await fs.readFile(source),sourceHash=createHash('sha256').update(capturedSource).digest('hex');
     if(request.expectedContentHash&&request.expectedContentHash!==sourceHash)throw Error('VERSION_CONFLICT: 成果已变化，请重新查看后导出');
     const delivery=await service.prepareTaskDelivery({...request,expectedContentHash:sourceHash});
     const assertDelivery=async(capturedHash=sourceHash)=>{if(capturedHash!==sourceHash)throw Error('VERSION_CONFLICT: 导出内容与核对成果版本不一致');await delivery.assertCurrent();if(await fileVersion(await service.files.resolve(request.mountId,request.path))!==sourceHash)throw Error('VERSION_CONFLICT: 成果已变化，请重新核对后导出');};
     const prototypeExport=/\.html?$/i.test(request.path)&&['copy','zip'].includes(request.format)?await service.preparePrototypeExport(request.mountId,request.path):undefined;
     const extension=request.format==='docx'?'.docx':request.format==='zip'?'.zip':path.extname(source);
     const outputMount=service.state.mounts.find(item=>item.enabled&&item.write);const suggested=path.join(outputMount?.path||path.dirname(source),path.basename(source,path.extname(source))+extension);
     const target=(await dialog.showSaveDialog(win,{defaultPath:suggested})).filePath;
     if(!target)return{ok:true,data:null};
     const acceptance=/\.html?$/i.test(request.path)&&['copy','zip'].includes(request.format)?await service.preparePrototypeAcceptanceExport(request.mountId,request.path):undefined;
     let output=await writableOutputRef(target);let report:unknown,sourceRef={mountId:request.mountId,path:request.path},processingCopy:import('../shared/types.js').ProcessingCopy|undefined;
     if(request.format==='docx'&&await service.files.isReferencePath(source)){processingCopy=await service.copyForProcessing({...sourceRef,targetMountId:output.mountId,directory:path.dirname(output.path)});sourceRef=processingCopy.copy;output={mountId:output.mountId,path:path.join(path.dirname(output.path),path.basename(output.path,path.extname(output.path))+'_转换结果_'+processingCopy.id.slice(0,8)+path.extname(output.path))};}
     if(acceptance&&(request.format==='copy'||request.format==='zip'))report=await exportAcceptedPrototype(service.files,{...acceptance,output,format:request.format,assertCurrent:async()=>{const bytes=acceptance.snapshot.get(acceptance.entryPath)!.bytes;await acceptance.assertCurrent();await prototypeExport!.assertCurrent(bytes);await assertDelivery(createHash('sha256').update(bytes).digest('hex'));}});
     else if(request.format==='docx'){
      if(await fileVersion(await service.files.resolve(sourceRef.mountId,sourceRef.path))!==sourceHash)throw Error('VERSION_CONFLICT: 转换副本与核对原文件不一致');
      const conversionHash=createHash('sha256').update(await service.files.read(sourceRef.mountId,sourceRef.path)).digest('hex');
      report=await exportMarkdownToWord(service.files,{source:sourceRef,output,overwrite:!processingCopy,options:{title:path.basename(source,path.extname(source))},beforeWrite:async hash=>{if(hash!==conversionHash)throw Error('VERSION_CONFLICT: 转换正文已变化');await assertDelivery();}});
     }
     else if(request.format==='zip')report=await packageHtmlProject(service.files,{source:{mountId:request.mountId,path:path.dirname(request.path)},entryFile:path.basename(request.path),output,overwrite:true,beforeWrite:async(entries:ReadonlyMap<string,Buffer>)=>{const entry=entries.get(path.basename(request.path));if(!entry)throw Error('PROTOTYPE_ENTRY_MISSING');await prototypeExport?.assertCurrent(entry);await assertDelivery(createHash('sha256').update(entry).digest('hex'));}});
     else if(prototypeExport){await writeAuthorizedBuffer(service.files,output,prototypeExport.bytes,true,async()=>{await prototypeExport.assertCurrent();await assertDelivery(createHash('sha256').update(prototypeExport.bytes).digest('hex'));});report={output};}
     else{await writeAuthorizedBuffer(service.files,output,capturedSource,true,()=>assertDelivery());report={output};}
     return{ok:true,data:{path:await service.files.resolve(output.mountId,output.path),report,processingCopy,quality:prototypeExport?.quality}};
    }
    case 'shareInvite':{
     return{ok:true,data:createNetworkShareInvitation({version:1,provider:'windows-smb',resourceId:randomUUID(),host:request.host,shareName:request.shareName,displayName:request.shareName,suggestedDrive:'P:'})};
    }
    case 'shareSetup':return{ok:true,data:await inspectSharingSetup()};
    case 'shareSelectFolder':{
     const selected=(await dialog.showOpenDialog(win,{title:'选择要共享的资源目录',properties:['openDirectory']})).filePaths[0];if(!selected)return{ok:true,data:null};
     return{ok:true,data:describeShareFolder(await fs.realpath(selected),await inspectSharingSetup())};
    }
    case 'shareCreate':{
     const selectedInput=request.path||(await dialog.showOpenDialog(win,{title:'选择要共享的资源目录',properties:['openDirectory']})).filePaths[0];if(!selectedInput)return{ok:true,data:null};
     const selected=await fs.realpath(selectedInput);if(!(await fs.stat(selected)).isDirectory())throw Error('VALIDATION_FAILED: 共享目标必须是文件夹');
     const shareSetup=await inspectSharingSetup(),account=request.account??shareSetup.currentUser.qualifiedName;
     const operationId=randomUUID();store.operation(operationId,'share','create','executing');
     const receiptPath=path.join(userDataDir,`share-${operationId}.json`);
     const script=buildWritableShareScript({path:selected,shareName:request.shareName,account,receiptPath});
     const encoded=Buffer.from(script,'utf16le').toString('base64');
     try{await powershell(`$ErrorActionPreference='Stop'; $p=Start-Process powershell.exe -Verb RunAs -WindowStyle Hidden -ArgumentList @('-NoProfile','-NonInteractive','-EncodedCommand',${quotePowerShell(encoded)}) -PassThru -Wait; [ordered]@{exitCode=$p.ExitCode}|ConvertTo-Json -Compress`,180_000);}catch{}
     let receipt:{status?:string;shareCreated?:boolean;shareUpgraded?:boolean;aclChanged?:boolean;aclRestored?:boolean;smbRestored?:boolean;verified?:boolean;message?:string}|undefined;
     try{receipt=JSON.parse((await fs.readFile(receiptPath,'utf8')).replace(/^\uFEFF/,''));await fs.unlink(receiptPath);}catch{}
     const verified=await queryShare(request.shareName);
     if(receipt?.status==='succeeded'&&receipt.verified&&verified&&path.resolve(verified.path).toLowerCase()===path.resolve(selected).toLowerCase()){
      const invitation=createNetworkShareInvitation({version:1,provider:'windows-smb',resourceId:randomUUID(),host:os.hostname(),shareName:request.shareName,displayName:path.basename(selected)||request.shareName,suggestedDrive:'P:'});
      store.operation(operationId,'share','create','succeeded',receiptText({shareName:request.shareName,path:selected,shareUpgraded:receipt.shareUpgraded,access:'read_write'}));
      return{ok:true,data:{operationId,status:'succeeded',invitation,diagnostic:`已核对本机 SMB Change 与 NTFS Modify 权限；授权账号为 ${account}。尚未进行接收端双机验证`}};
     }
     if(receipt?.status==='failed'){
      const diagnostic=receipt.aclChanged&&!receipt.aclRestored?'读写共享未配置完成，自动恢复目录 ACL 失败；请检查目录权限':receipt.aclRestored?'读写共享未配置完成，目录权限已恢复':'读写共享未配置完成，目录权限未变更';
      store.operation(operationId,'share','create','failed',diagnostic+': '+(receipt.message||''));
      return{ok:true,data:{operationId,status:'failed',diagnostic}};
     }
     const diagnostic='管理员操作未返回可核对的读写权限结果；请先检查系统共享与目录权限，不要重复创建';
     store.operation(operationId,'share','create','outcome_unknown',diagnostic);
     return{ok:true,data:{operationId,status:'outcome_unknown',diagnostic}};
    }
    case 'sharePermissionInspect':return{ok:true,data:await inspectSharePermissions({shareName:request.shareName,expectedPath:request.expectedPath})};
    case 'shareStop':
    case 'sharePermissionUpdate':{
     const operationId=randomUUID(),receiptPath=path.join(userDataDir,`share-manage-${operationId}.json`);
     store.operation(operationId,'share',request.type,'executing');
     const result=await manageLocalShare(request,receiptPath);
     await fs.unlink(receiptPath).catch(()=>{});
     store.operation(operationId,'share',request.type,result.status,result.diagnostic);
     return{ok:true,data:result};
    }
    case 'shareDisconnect':
    case 'shareReconnect':{
     const operationId=randomUUID();store.operation(operationId,'share',request.type,'executing');
     const result=request.type==='shareDisconnect'?await disconnectNetworkShare(request):await reconnectNetworkShare(request);
     const matching=service.state.mounts.filter(mount=>[request.drive,request.drive+'\\',request.expectedRemotePath].some(candidate=>mount.path.toLowerCase()===candidate.toLowerCase()));
     if(result.mappingRemoved||result.status==='outcome_unknown'){
      for(const mount of matching){mount.enabled=false;mount.write=false;}service.save();
     }
     if(request.type==='shareReconnect'&&result.status==='succeeded'){
      try{
       await fs.access(request.drive+'\\');let writable=false;
       try{await probeMappedShareWrite(request.drive);writable=true;}catch{}
       for(const mount of matching){mount.path=request.drive+'\\';mount.enabled=true;mount.write=writable;}service.save();
       result.diagnostic+=writable?'；目录读写已重新核对':'；目录已连接，写入未通过探测，登记为只读';
      }catch{result.status='partial';result.diagnostic='映射已重连，但目录当前不可读，工作空间授权仍停用；请刷新后核对';}
     }
     store.operation(operationId,'share',request.type,result.status,result.diagnostic);
     return{ok:true,data:result};
    }
    case 'shareConnect':{
     const invitation=parseNetworkShareInvitation(request.invitation);const operationId=randomUUID();store.operation(operationId,'share','connect','executing');
     const target={drive:request.drive,host:invitation.host,shareName:invitation.shareName};const authentication=request.authentication.mode==='current-user'?request.authentication:{...request.authentication,saveCredentials:false};
     let result=await connectNetworkShare({...target,authentication});
     if(result.status==='outcome_unknown'){
      const inspection=await inspectNetworkShareTarget(target);
      if(inspection.status==='reused')result=inspection;
      else{const diagnostic=`${result.diagnostic.message}；随后检查：${inspection.diagnostic.message}`;store.operation(operationId,'share','connect','outcome_unknown',receiptText({code:result.diagnostic.code,inspection:inspection.diagnostic.code,diagnostic}));return{ok:true,data:{operationId,status:'outcome_unknown',drive:result.drive,unc:result.unc,mappingStatus:inspection.mappingStatus,diagnostic,diagnosticCode:result.diagnostic.code,retryWithCredentials:false}};}
     }
     if(result.status!=='connected'&&result.status!=='reused'){
      const unknown=['OUTCOME_UNKNOWN','UNEXPECTED_OUTPUT'].includes(result.diagnostic.code);const status=unknown?'outcome_unknown':'failed';const diagnostic=result.diagnostic.message+(unknown?'；请先检查资源管理器中的盘符状态，不要盲目重试':'');
      store.operation(operationId,'share','connect',status,receiptText({code:result.diagnostic.code,diagnostic}));
      return{ok:true,data:{operationId,status,drive:result.drive,unc:result.unc,mappingStatus:result.mappingStatus,diagnostic,diagnosticCode:result.diagnostic.code,retryWithCredentials:result.diagnostic.retryWithCredentials}};
     }
     const verified=await inspectNetworkShareTarget(target);
     if(verified.status!=='reused'){
      const diagnostic='映射命令已返回成功，但未能再次核对同一盘符与共享目标；结果需要在资源管理器确认，不要重复映射';store.operation(operationId,'share','connect','outcome_unknown',receiptText({code:verified.diagnostic.code,diagnostic}));
      return{ok:true,data:{operationId,status:'outcome_unknown',drive:result.drive,unc:result.unc,mappingStatus:result.mappingStatus,diagnostic,diagnosticCode:verified.diagnostic.code,retryWithCredentials:false}};
     }
     try{
      await probeMappedShareWrite(result.drive);
      const verifiedDrive=result.drive.endsWith('\\')?result.drive:result.drive+'\\';
      const existing=service.state.mounts.find(mount=>mount.path.toLowerCase()===result.unc.toLowerCase()||mount.path.toLowerCase()===result.drive.toLowerCase()||mount.path.toLowerCase()===verifiedDrive.toLowerCase());
      if(existing){
       // Keep the verified drive path so subsequent reads and writes use the
       // same authenticated mapping context as the probe.
       existing.path=verifiedDrive;
       existing.write=true;existing.enabled=true;existing.name=existing.name||path.basename(result.unc);
       service.save();
      }else await service.mount(verifiedDrive,true);
      const diagnostic='网络盘已映射，读写探测通过，并已登记为可写目录';store.operation(operationId,'share','connect','succeeded',diagnostic);
      return{ok:true,data:{operationId,status:'succeeded',drive:result.drive,unc:result.unc,mappingStatus:verified.mappingStatus,diagnostic,diagnosticCode:result.diagnostic.code,retryWithCredentials:false}};
     }catch(error){
      // A previously registered mount must not remain writable after the
      // connection loses its write capability. Disable it until the user
      // reconnects and a fresh write probe succeeds.
      const failedMount=service.state.mounts.find(mount=>mount.path.toLowerCase()===result.unc.toLowerCase()||mount.path.toLowerCase()===result.drive.toLowerCase()||mount.path.toLowerCase()===`${result.drive}\\`.toLowerCase());
      if(failedMount){failedMount.write=false;failedMount.enabled=false;service.save();}
      const diagnostic='网络盘已映射，但读写验证或登记到工作空间失败：'+redact(error instanceof Error?error.message:String(error));store.operation(operationId,'share','connect','partial',diagnostic);
      return{ok:true,data:{operationId,status:'partial',drive:result.drive,unc:result.unc,mappingStatus:verified.mappingStatus,diagnostic,diagnosticCode:result.diagnostic.code,retryWithCredentials:false}};
     }
    }
    case 'subAgentRun':{
     const result=await service.runSubAgent({parentRunId:request.parentRunId,tool:request.tool,input:request.input,capability:request.capability,mountId:request.mountId});
     return{ok:true,data:result};
    }
    case 'parallelRun':{
     const result=await service.runParallelSubAgents(request.parentRunId,request.tasks.map(task=>({parentRunId:request.parentRunId,tool:task.tool,input:task.input,capability:task.capability,mountId:task.mountId,subAgentId:task.id})));
     return{ok:true,data:result};
    }
    case 'subAgentAuthorize':{
     const decision=service.authorizeSubAgentCall({parentRunId:request.parentRunId,tool:request.tool,input:{},capability:request.capability,mountId:request.mountId});
     return{ok:true,data:decision};
    }
    case 'modelRoute':return{ok:true,data:service.selectModelRoute({strategy:request.strategy??store.get<Partial<AppPreferences>>('app-preferences',{}).modelRouting?.strategy??'task_type',taskType:request.taskType,preferredEntryId:request.preferredEntryId,preferredModelId:request.preferredModelId,minContextWindow:request.minContextWindow,requiresReasoning:request.requiresReasoning,budget:request.budget,fallbackModelIds:request.fallbackModelIds})};
    case 'shareConflictDiagnose':return{ok:true,data:service.diagnoseShareConflict({resourceId:request.resourceId,path:request.path},request.expectedVersion,request.actualVersion)};
    case 'shareLock':return{ok:true,data:service.acquireShareLock({resourceId:request.resourceId,path:request.path,version:request.version},request.ownerId,request.mode,request.ttlMs)};
    case 'shareUnlock':return{ok:true,data:service.releaseShareLock(request.lockId,request.ownerId)};
    case 'shareLocks':return{ok:true,data:service.listShareLocks()};
    case 'openFolder':if(service.state.root)await shell.openPath(service.state.root);break;
   }
   return{ok:true,data:null};
  }catch(error){return{ok:false,error:redact(error instanceof Error?error.message:String(error))};}
 });
 const hiddenTest=await isHiddenTestProfile(configuredDataDir,path.resolve(here,'../..','.test-data'),process.env.PM_SLASH_TEST_HIDDEN);
 win=new BrowserWindow({show:!hiddenTest,skipTaskbar:hiddenTest,width:1440,height:940,minWidth:1000,minHeight:680,title:'slash',icon:devServerUrl?path.join(app.getAppPath(),'public/brand/slash.png'):path.join(here,'../renderer/brand/slash.png'),backgroundColor:'#f6f7f8',titleBarStyle:'hidden',titleBarOverlay:{color:'#f6f7f8',symbolColor:'#20242b',height:36},webPreferences:{preload:path.join(here,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 win.setMenuBarVisibility(false);
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 win.webContents.on('will-navigate',(event,url)=>{if(url!==win.webContents.getURL())event.preventDefault();});
 win.on('closed',()=>{windowClosing=true;service.dispose();cancelAllPrototypeAcceptance();});
 app.on('before-quit',()=>{windowClosing=true;mcpHost?.close();service.dispose();cancelAllPrototypeAcceptance();});
 app.on('window-all-closed',()=>{service.dispose();previews.clear();server.close();store.close();app.quit();});
 const startup=installStartupRecovery(win,{dataDir:userDataDir,redact,load:()=>devServerUrl?win.loadURL(devServerUrl):win.loadFile(path.join(here,'../renderer/index.html'))});
 await startup.load();
}

void boot().catch(error=>{console.error(redact(String(error)));app.exit(1)});

