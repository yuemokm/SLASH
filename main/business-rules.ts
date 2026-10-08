import type {SpreadsheetFieldEvidence} from '../shared/spreadsheet-field-evidence.js';
import fs from 'node:fs/promises';
import {businessPathKey} from '../shared/business-rules.js';
export {businessPathKey} from '../shared/business-rules.js';
import {createHash} from 'node:crypto';
import type {Files} from './files.js';
import type {RequirementCard} from './product-records.js';
import type {BusinessConstraint,BusinessImplementationRef,BusinessEvidenceStatus,BusinessRuleCheckItem,BusinessSourceCheck,BusinessImplementationCheck,BusinessSourceProvenance} from '../shared/business-rules.js';

export type BusinessText={content:string;contentHash:string;lines?:string[];locationBudget?:{remaining:number}};
export type BusinessTextReader=(mountId:string,path:string)=>Promise<BusinessText>;
export type BusinessProvenanceResolver=((mountId:string,path:string,text:BusinessText)=>Promise<BusinessSourceProvenance|undefined>)&{assertCurrent?:()=>void;spreadsheet?:(field:SpreadsheetFieldEvidence)=>Promise<'current'|'stale'|'unavailable'>};
export const BUSINESS_CHECK_NOTICE='版本有效仅说明来源和成果位置仍与记录一致，规则含义与交互行为仍需人工核对。表格依据来自提取文本，请保留工作表及单元格定位。';
export async function readBusinessText(files:Files,mountId:string,path:string):Promise<BusinessText>{
 if(!/\.(?:txt|md|markdown|html?)$/i.test(path))throw Error('BUSINESS_TEXT_REQUIRED: 请先提取为UTF-8文本，再记录原文定位；本核对不直接验证Office/PDF单元格或段落');
 const file=await files.resolve(mountId,path),before=await fs.stat(file);if(!before.isFile()||before.size>2_000_000)throw Error('BUSINESS_TEXT_LIMIT: 核对仅支持2 MB以内文本');
 const bytes=await fs.readFile(file);if(bytes.length>2_000_000)throw Error('BUSINESS_TEXT_LIMIT');
 let content:string;try{content=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw Error('BUSINESS_TEXT_REQUIRED: 来源不是有效UTF-8文本');}
 if(content.includes('\0'))throw Error('BUSINESS_TEXT_REQUIRED: 来源含二进制数据');
 const latestFile=await files.resolve(mountId,path),after=await fs.stat(latestFile);if(latestFile!==file||before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ino!==after.ino)throw Error('VERSION_CONFLICT: 核对读取期间文件变化');
 return{content,contentHash:createHash('sha256').update(bytes).digest('hex')};
}
export function quoteLocated(text:BusinessText,location:{startLine:number;endLine:number;quote:string}){
 const lines=text.lines??=text.content.replace(/\r\n|\r/g,'\n').split('\n');if(location.endLine>lines.length)return false;let characters=0;for(let index=location.startLine-1;index<location.endLine;index++)characters+=lines[index].length+1;
 if(characters>100000)throw Error('BUSINESS_LOCATION_LIMIT: 单条定位行段超过100000字符');if(text.locationBudget){text.locationBudget.remaining-=characters;if(text.locationBudget.remaining<0)throw Error('BUSINESS_LOCATION_LIMIT: 单次定位总字符预算8 MB');}
 return lines.slice(location.startLine-1,location.endLine).join('\n').includes(location.quote.replace(/\r\n|\r/g,'\n'));
}
export function latestBusinessBindings(refs:BusinessImplementationRef[]){const latest=new Map<string,BusinessImplementationRef>();for(const ref of refs)latest.set(`${ref.constraintId}\0${ref.mountId}\0${businessPathKey(ref.path)}`,ref);return[...latest.values()];}
export function activeBusinessConstraints(constraints:BusinessConstraint[]){const superseded=new Set(constraints.map(item=>item.supersedesId).filter(Boolean));return constraints.filter(item=>!superseded.has(item.id));}
export function requirementImplementsPath(requirement:RequirementCard,mountId:string,path:string){return(requirement.implementationRefs??[]).some(ref=>ref.mountId===mountId&&businessPathKey(ref.path)===businessPathKey(path));}
export function requirementRelatedToPath(requirement:RequirementCard,mountId:string,path:string){return requirementImplementsPath(requirement,mountId,path)||requirement.sourceRefs.some(ref=>ref.mountId===mountId&&businessPathKey(ref.relativePath)===businessPathKey(path));}
/** Per-request bounded, deduplicated snapshots. Caller retains authorization. */
export function boundedBusinessReader(read:BusinessTextReader):BusinessTextReader{const cache=new Map<string,Promise<BusinessText>>(),locationBudget={remaining:8_000_000};let bytes=0;return(mountId,path)=>{const key=`${mountId}\0${businessPathKey(path)}`;const previous=cache.get(key);if(previous)return previous;if(cache.size>=64)return Promise.reject(Error('BUSINESS_READ_BUDGET: 单次核对最多64份文本'));const pending=read(mountId,path).then(value=>{bytes+=Buffer.byteLength(value.content);if(bytes>8_000_000)throw Error('BUSINESS_READ_BUDGET: 单次核对正文预算8 MB');return{...value,lines:value.content.replace(/\r\n|\r/g,'\n').split('\n'),locationBudget};});cache.set(key,pending);return pending;};}
function aggregate(statuses:BusinessEvidenceStatus[]):BusinessEvidenceStatus{for(const status of ['unavailable','stale','unlocated','unmapped'] as const)if(statuses.includes(status))return status;return'current';}
export async function checkBusinessConstraint(requirement:RequirementCard,constraint:BusinessConstraint,read:BusinessTextReader,target?:{mountId:string;path:string},provenance?:BusinessProvenanceResolver):Promise<BusinessRuleCheckItem>{
 const sourceChecks:BusinessSourceCheck[]=[];const hidden=new Set<string>();
 for(const evidence of constraint.sourceEvidence){const source=constraint.sourceSnapshots.find(item=>item.id===evidence.sourceRefId);if(!source){sourceChecks.push({sourceRefId:evidence.sourceRefId,locator:evidence.locator,status:'unavailable',reason:'来源快照缺失'});hidden.add(evidence.sourceRefId);continue;}
  try{const actual=await read(source.mountId,source.relativePath);const changed=actual.contentHash!==source.contentHash,located=quoteLocated(actual,evidence),chain=await provenance?.(source.mountId,source.relativePath,actual);sourceChecks.push({sourceRefId:source.id,locator:evidence.locator,status:changed?'stale':located?'current':'unlocated',reason:changed?'来源版本已变化，旧约束待复核':located?'来源原文和版本可定位；解释待人工核对':'来源摘录无法在指定行段定位',expectedHash:source.contentHash,actualHash:actual.contentHash,...(chain?{provenance:chain}:{})});}
  catch(error){sourceChecks.push({sourceRefId:source.id,locator:evidence.locator,status:'unavailable',reason:error instanceof Error?error.message:'来源不可读取',expectedHash:source.contentHash});hidden.add(source.id);}
 }
 for(const field of constraint.fieldEvidence??[]){const ref=constraint.spreadsheetEvidenceRefs?.find(item=>item.evidenceId===field.evidenceId),source=constraint.sourceSnapshots.find(item=>item.id===ref?.sourceRefId);let status:'current'|'stale'|'unavailable';try{status=source&&source.mountId===field.mountId&&businessPathKey(source.relativePath)===businessPathKey(field.path)&&source.contentHash===field.contentHash&&constraint.rawValue===field.value.rawValue&&provenance?.spreadsheet?await provenance.spreadsheet(field):'stale';}catch{status='unavailable';}if(status==='unavailable'&&source)hidden.add(source.id);sourceChecks.push({sourceRefId:source?.id??'unavailable',locator:'宿主字段组合证据',status:status==='current'?'current':status==='stale'?'stale':'unavailable',reason:'字段/列头/值位置与版本'+(status==='current'?'有效；业务解释未验证':'尚未通过复核'),spreadsheetStatus:status});}
 const refs=latestBusinessBindings(requirement.implementationRefs??[]).filter(ref=>ref.constraintId===constraint.id&&(!target||ref.mountId===target.mountId&&businessPathKey(ref.path)===businessPathKey(target.path)));
 const implementations:BusinessImplementationCheck[]=[];
 for(const ref of refs)try{const actual=await read(ref.mountId,ref.path);const changed=actual.contentHash!==ref.contentHash,located=quoteLocated(actual,ref);implementations.push({ref,status:changed?'stale':located?'current':'unlocated',reason:changed?'成果版本已变化，旧落实绑定待复核':located?'落实摘录和版本可定位；业务行为待人工验证':'落实摘录无法在指定行段定位',actualHash:actual.contentHash});}catch(error){implementations.push({ref:{...ref,quote:''},status:'unavailable',reason:error instanceof Error?error.message:'成果不可读取'});}
 let excerptsTruncated=false;const preview=(quote:string)=>{if(quote.length>1000)excerptsTruncated=true;return quote.slice(0,1000);};
 const visible={...constraint,...(hidden.size?{fieldEvidence:undefined}:{}),...(hidden.size?{rawValue:'来源不可访问',interpretation:'来源不可访问，待恢复授权后核对'}:{}),sourceEvidence:constraint.sourceEvidence.map(item=>({...item,quote:hidden.size?'':preview(item.quote)}))};
 return{requirementId:requirement.id,requirementTitle:requirement.title,constraint:visible,sourceChecks,implementations:implementations.map(item=>({...item,ref:{...item.ref,quote:preview(item.ref.quote)}})),status:aggregate([...sourceChecks.map(item=>item.status),...sourceChecks.flatMap(item=>item.provenance&&item.provenance.status!=='current'?[item.provenance.status==='stale'?'stale' as const:'unavailable' as const]:[]),...implementations.map(item=>item.status),...(refs.length?[]:['unmapped' as const])]),excerptsTruncated};
}
