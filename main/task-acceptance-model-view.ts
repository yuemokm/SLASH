import {createHash} from 'node:crypto';
import {businessPathKey} from './business-rules.js';
import type {WorkflowSourceReceipt} from '../shared/types.js';
import type {TaskAcceptanceView} from '../shared/task-acceptance.js';
import type {TaskAcceptanceReport} from '../shared/task-acceptance.js';
import type {VisualReviewReceipt} from '../shared/prototype-visual-review.js';
import {isCurrentVisualReview} from './prototype-visual-review.js';
import {TASK_MODEL_VIEW_LIMIT,taskModelViewResponseSchema,type TaskModelView,type TaskModelViewRequest,type TaskModelViewItem} from '../shared/task-acceptance-model-view.js';

export const TASK_MODEL_VIEW_NOTICE='这里只是有界目录/所选详情。未展开要求与旧基线仍有效，partial不等于不存在。sourceId标识文件版本，readId标识一次读取；目录/多片段不累计成全文，字段几何证据不确认业务含义。encoding=json片段须按itemHash及offset取齐后解析，不是完整有效evidence。nextCursor原样续读，版本变化从第一页开始。';
export const modelViewHash=(text:string)=>createHash('sha256').update(text).digest('hex');
function canonical(value:unknown):unknown{if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([key,v])=>[key,canonical(v)]));return value;}
export const modelViewFingerprint=(value:unknown)=>modelViewHash(JSON.stringify(canonical(value)));
export const taskModelSourceId=(source:Pick<WorkflowSourceReceipt,'mountId'|'path'|'contentHash'>)=>modelViewHash(`${source.mountId}\0${businessPathKey(source.path)}\0${source.contentHash}`).slice(0,32);
export const taskModelReadId=(runId:string,receipt:WorkflowSourceReceipt)=>modelViewFingerprint({runId,receipt}).slice(0,32);
export type TaskModelRead={id:string;sourceId:string;receipt:WorkflowSourceReceipt};
export function taskModelReadIndex(runId:string,receipts:WorkflowSourceReceipt[]){const seen=new Set<string>();return receipts.map(receipt=>({id:taskModelReadId(runId,receipt),sourceId:taskModelSourceId(receipt),receipt})).filter(item=>!seen.has(item.id)&&Boolean(seen.add(item.id)));}
export type TaskModelSource={id:string;reads:TaskModelRead[]};
export function taskModelSourceIndex(reads:TaskModelRead[]){const groups=new Map<string,TaskModelSource>();for(const read of reads){const group=groups.get(read.sourceId)??{id:read.sourceId,reads:[]};group.reads.push(read);groups.set(read.sourceId,group);}return[...groups.values()];}
/** The complete report stays in UI/storage. Repeated field proof bodies belong
 * to authorized reads/PRD detail loaders, not a second report-side proof path. */
export function taskModelReportProjection(value:unknown):unknown{
 if(Array.isArray(value))return value.map(taskModelReportProjection);
 if(!value||typeof value!=='object')return value;
 return Object.fromEntries(Object.entries(value).map(([key,data])=>key==='visualReview'?[key,visualReviewModelProjection(data as VisualReviewReceipt)]:['spreadsheetEvidence','fieldEvidence'].includes(key)&&Array.isArray(data)?[key,{omitted:true,count:data.length,details:{section:'reads'},notice:'原字段证明请从对应readId按需核对，不从报告重复展开'}]:[key,taskModelReportProjection(data)]));
}
function visualReviewModelProjection(receipt:VisualReviewReceipt){if(!isCurrentVisualReview(receipt))return{status:'unverified',versionState:receipt?.versionState??'unavailable',notice:'当前视觉证据无法核对，旧意见已隐藏'};return{id:receipt.id,inputHash:receipt.inputHash,status:receipt.status,versionState:receipt.versionState,reason:receipt.reason,stopReason:receipt.stopReason,coverageLimits:receipt.coverageLimits,images:receipt.images.map(({ref,outputId,receipt:r})=>({ref,outputId,reportId:r.reportId,screenshotId:r.screenshotId,caseId:r.caseId,entryHash:r.entryHash,contentHash:r.contentHash,viewport:r.viewport})),findings:receipt.findings};}
export function taskModelVisualReviewSummary(report:TaskAcceptanceReport|undefined,readable=true){const receipt=report?.visualReview,current=readable&&report?.versionState==='current'&&receipt&&isCurrentVisualReview(receipt);return{required:report?.visualReviewRequired??false,status:current?receipt.status:'unverified',versionState:receipt?.versionState??'unavailable',notice:(report?.visualReviewNotice??receipt?.reason??'只审查有限截图，业务与交互仍待核对').slice(0,300),imageInputCount:current?receipt.images.length:0,candidateCount:current?receipt.findings.length:0,candidates:current?receipt.findings.slice(0,2).map(f=>({id:f.id,outputId:f.outputId,confidence:f.confidence,explanation:f.explanation.slice(0,120)})):[],coverageLimits:current?receipt.coverageLimits.slice(0,2).map(s=>s.slice(0,200)):[],details:{section:'report'}};}
export type TaskModelEntry={id:string;load:()=>unknown|Promise<unknown>};
const splitsPair=(text:string,offset:number)=>offset>0&&offset<text.length&&text.charCodeAt(offset-1)>=0xd800&&text.charCodeAt(offset-1)<=0xdbff&&text.charCodeAt(offset)>=0xdc00&&text.charCodeAt(offset)<=0xdfff;
/** Serialize only host-authorized entries. Whole JSON overhead and escaping are
 * counted. Oversized entries remain accessible as exact, hash-bound JSON slices. */
export async function taskModelPage(input:{request:TaskModelViewRequest;runId:string;view?:TaskAcceptanceView;version:string;entries:TaskModelEntry[];guard:()=>void;partial?:boolean}):Promise<TaskModelView>{
 const {request,entries,guard}=input;guard();if(request.cursor&&request.cursor.version!==input.version)throw Error('TASK_MODEL_VIEW_CHANGED: 合同、读取列表、检查或授权已变化，请从第一页重新读取');
 const start=request.cursor??{position:0,textOffset:0,version:input.version};if(start.position>entries.length||start.position===entries.length&&start.textOffset)throw Error('TASK_MODEL_CURSOR_INVALID');
 const view:TaskModelView={schemaVersion:1,runId:input.runId,section:request.section,state:input.view?'available':'not_applicable',contract:input.view?{id:input.view.contract.id,revision:input.view.contract.revision,contractHash:input.view.contract.contractHash}:undefined,version:input.version,items:[],coverage:{partial:true,totalItems:entries.length,omittedItems:entries.length,fragmentedItems:0},notice:TASK_MODEL_VIEW_NOTICE};
 let position=start.position,offset=start.textOffset;
 const project=(items:TaskModelViewItem[],nextPosition:number,nextOffset:number,fragmented:number):TaskModelView=>({...view,items,coverage:{partial:Boolean(input.partial)||nextPosition<entries.length||fragmented>0||start.position>0,totalItems:entries.length,omittedItems:Math.max(0,entries.length-nextPosition-(nextOffset?1:0)),fragmentedItems:fragmented},...(nextPosition<entries.length?{nextCursor:{position:nextPosition,textOffset:nextOffset,version:input.version}}:{})});
 while(position<entries.length&&view.items.length<request.limit){
  const entry=entries[position],data=await entry.load();guard();const json=JSON.stringify(data);if(json===undefined)throw Error('TASK_MODEL_ITEM_INVALID');if(offset>=json.length&&offset>0||splitsPair(json,offset))throw Error('TASK_MODEL_CURSOR_INVALID');
  const full:TaskModelViewItem={id:entry.id,data};
  if(!offset){const candidate=project([...view.items,full],position+1,0,view.coverage.fragmentedItems);if(JSON.stringify(candidate).length<=TASK_MODEL_VIEW_LIMIT){view.items.push(full);position++;continue;}if(view.items.length)break;}
  const itemHash=modelViewHash(json);let low=0,high=json.length-offset;
  while(low<high){const length=Math.ceil((low+high)/2),end=offset+length,next=end===json.length?{position:position+1,offset:0}:{position,offset:end},item:TaskModelViewItem={id:entry.id,encoding:'json',itemHash,totalCharacters:json.length,textOffset:offset,text:json.slice(offset,end),complete:false};const candidate=project([...view.items,item],next.position,next.offset,view.coverage.fragmentedItems+1);if(JSON.stringify(candidate).length<=TASK_MODEL_VIEW_LIMIT)low=length;else high=length-1;}
  if(splitsPair(json,offset+low))low--;
  if(!low)throw Error('TASK_MODEL_RESPONSE_LIMIT: 预算不足以返回一个完整字符，未前移游标');
  const end=offset+low;view.items.push({id:entry.id,encoding:'json',itemHash,totalCharacters:json.length,textOffset:offset,text:json.slice(offset,end),complete:false});view.coverage.fragmentedItems++;if(end===json.length){position++;offset=0;}else offset=end;break;
 }
 guard();if(position===start.position&&offset===start.textOffset&&position<entries.length)throw Error('TASK_MODEL_CURSOR_NO_PROGRESS');
 return taskModelViewResponseSchema.parse(project(view.items,position,offset,view.coverage.fragmentedItems));
}
