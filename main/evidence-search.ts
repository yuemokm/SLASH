import {createHash} from 'node:crypto';
import type {FileRef} from '../shared/types.js';
import type {EvidenceSearchHit,EvidenceSearchLimitation,EvidenceSearchOptions,EvidenceSearchResult} from '../shared/evidence-search.js';

export const EVIDENCE_SEARCH_LIMITS={defaultResults:20,maxResults:100,maxFiles:1000,maxFileCharacters:200_000,maxTotalCharacters:2_000_000,maxQueryCharacters:500,maxTerms:16,maxLimitations:50,defaultResponseCharacters:16_000,maxResponseCharacters:64_000,maxDeadlineMs:30_000,maxSnippetCharacters:400} as const;
const normalize=(value:string)=>value.normalize('NFKC').toLowerCase();
const ordered=(a:{mountId:string;path:string},b:{mountId:string;path:string})=>a.mountId<b.mountId?-1:a.mountId>b.mountId?1:a.path<b.path?-1:a.path>b.path?1:0;
const bounded=(value:number|undefined,fallback:number,max:number)=>Number.isFinite(value)?Math.min(max,Math.max(1,Math.floor(value!))):fallback;
const stopWords=new Set(['的','与','和','及','请','我','帮','根据','相关','资料']);

/** Explicit words remain intact; unspaced Chinese uses Node's ICU word boundaries. */
export function evidenceSearchTerms(query:string){
 const normalized=normalize(query).trim();
 const chunks=normalized.split(/[\s,，、;；:：/\\|!?？！()（）\[\]【】"“”']+/u).filter(Boolean);
 let words=chunks;
 if(chunks.length===1&&/\p{Script=Han}/u.test(normalized)&&normalized.length>2){
  const segmenter=new Intl.Segmenter('zh',{granularity:'word'});
  const segmented=[...segmenter.segment(normalized)].filter(part=>part.isWordLike).map(part=>part.segment);
  // ICU sometimes splits business words such as 门店 into individual Han
  // characters. Adjacent single-character runs contribute bigrams, rather
  // than turning each character into an overly broad independent match.
  words=[];let singles='';
  const flush=()=>{if(singles.length===1)words.push(singles);else for(let index=0;index<singles.length-1;index++)words.push(singles.slice(index,index+2));singles='';};
  for(const word of segmented){if(/^\p{Script=Han}$/u.test(word))singles+=word;else{flush();words.push(word);}}flush();
 }
 const meaningful=words.filter(word=>!stopWords.has(word));
 return[...new Set(meaningful.length?meaningful:chunks)].slice(0,EVIDENCE_SEARCH_LIMITS.maxTerms);
}

export type EvidenceSearchReader={read:(file:FileRef)=>Promise<string>;authorized:(file:FileRef)=>Promise<void>;clock?:()=>number};

/** No writes or content cache: each body comes from the currently authorized reader. */
export async function searchEvidenceFiles(files:FileRef[],query:string,reader:EvidenceSearchReader,options:EvidenceSearchOptions={},listing:{truncated?:boolean;limitations?:EvidenceSearchLimitation[];limitationCount?:number;version?:string}={}):Promise<EvidenceSearchResult>{
 const normalized=normalize(query).trim();
 if(normalized.length>EVIDENCE_SEARCH_LIMITS.maxQueryCharacters)throw Error('SEARCH_QUERY_LIMIT: 检索词最多 500 个字符');
 const terms=evidenceSearchTerms(normalized);
 const maxResults=bounded(options.limit??options.maxResults,EVIDENCE_SEARCH_LIMITS.defaultResults,EVIDENCE_SEARCH_LIMITS.maxResults);
 const offset=options.offset??0;if(!Number.isInteger(offset)||offset<0||offset>3000||offset>0&&!options.resultVersion)throw Error('SEARCH_CURSOR_REQUIRED: 下一页需要有效offset和上页resultVersion，请从第一页重新检索');
 if(options.resultVersion!==undefined&&!/^[a-f0-9]{64}$/.test(options.resultVersion))throw Error('SEARCH_CURSOR_INVALID: 检索版本无效，请从第一页重新检索');
 if(options.mountId!==undefined&&(!options.mountId||options.mountId.length>200))throw Error('PERMISSION_DENIED: 检索目录身份无效');
 if(options.mountId)await reader.authorized({mountId:options.mountId,path:'.',size:0});
 const maxFiles=bounded(options.maxFiles,500,EVIDENCE_SEARCH_LIMITS.maxFiles);
 const maxFileCharacters=bounded(options.maxFileCharacters,100_000,EVIDENCE_SEARCH_LIMITS.maxFileCharacters);
 const maxTotalCharacters=bounded(options.maxTotalCharacters,1_000_000,EVIDENCE_SEARCH_LIMITS.maxTotalCharacters);
 const clock=reader.clock??Date.now;
 const deadline=clock()+bounded(options.deadlineMs,15_000,EVIDENCE_SEARCH_LIMITS.maxDeadlineMs);
 const limitations:EvidenceSearchLimitation[]=[...(listing.limitations??[])].slice(0,EVIDENCE_SEARCH_LIMITS.maxLimitations);
 let limitationCount=listing.limitationCount??listing.limitations?.length??0;
 const warn=(value:EvidenceSearchLimitation)=>{limitationCount++;if(limitations.length<EVIDENCE_SEARCH_LIMITS.maxLimitations)limitations.push(value);};
 const scopedFiles=options.mountId?files.filter(file=>file.mountId===options.mountId):files;
 const coverage:EvidenceSearchResult['coverage']={listedFiles:scopedFiles.filter(file=>file.entryType!=='directory').length,...(options.shallow?{listedDirectories:scopedFiles.filter(file=>file.entryType==='directory').length,matchedDirectories:0}:{}),scannedFiles:0,bodyReadFiles:0,partialBodyFiles:0,skippedFiles:0,limitationCount:0,matchedFiles:0,listTruncated:listing.truncated??false,resultTruncated:false,status:'complete'};
 const skipped=new Set<string>();
 const markSkipped=(file:FileRef)=>{skipped.add(`${file.mountId}\0${file.path}`);coverage.skippedFiles=skipped.size;};
 let totalCharacters=0;
 const hits:EvidenceSearchHit[]=[];
 const bodyVersions:Array<{mountId:string;path:string;sha256:string}>=[];
 const sorted=scopedFiles.slice().sort(ordered);
 // Likely path matches get their body examined before unrelated material, without
 // allowing file-system enumeration order to decide relevance.
 const candidates=normalized?sorted.slice().sort((a,b)=>pathScore(b.path,normalized,terms)-pathScore(a.path,normalized,terms)||ordered(a,b)):sorted;
 for(let index=0;index<candidates.length;index++){
  const file=candidates[index];
  try{await reader.authorized(file);}catch{markSkipped(file);warn({code:'SEARCH_ACCESS_CHANGED',message:'有文件的当前授权不可用，未返回其路径或正文命中'});continue;}
  const normalizedPath=normalize(file.path),pathTerms=terms.filter(term=>normalizedPath.includes(term));
  const pathPhrase=Boolean(normalized&&normalizedPath.includes(normalized));
  if(!normalized||file.entryType==='directory'){
   if(normalized&&!pathPhrase&&!pathTerms.length)continue;
   hits.push({...file,score:normalized?pathScore(file.path,normalized,terms):0,matchKind:'path',matchedTerms:pathTerms});
   continue;
  }
  let text:string|undefined,readFailure:EvidenceSearchLimitation|undefined;
  if(coverage.scannedFiles>=maxFiles)readFailure={code:'SEARCH_FILE_LIMIT',message:`正文扫描已达到 ${maxFiles} 文件上限`};
  else if(clock()>=deadline)readFailure={code:'SEARCH_TIME_LIMIT',message:'已达到本次扫描耗时预算，未开始读取此正文；已开始的解析不会被强行中断'};
  else if(totalCharacters>=maxTotalCharacters)readFailure={code:'SEARCH_TOTAL_TEXT_LIMIT',message:`正文扫描已达到 ${maxTotalCharacters} 字符上限`};
  else{
   coverage.scannedFiles++;
   try{
    text=await reader.read(file);
    // Reads may outlive a revocation. Do not return either a snippet or a path
    // match until authorization is rechecked after the asynchronous parse.
    try{await reader.authorized(file);}catch{markSkipped(file);warn({code:'SEARCH_ACCESS_CHANGED',message:'读取期间目录授权发生变化，未返回文件路径或正文'});continue;}
   }catch(error){
    const message=error instanceof Error?error.message:'文件正文读取失败';
    const denied=/PERMISSION_DENIED|INVALID_PATH|SEARCH_ACCESS_CHANGED/.test(message);
    if(denied){markSkipped(file);warn({code:'SEARCH_ACCESS_CHANGED',message:'读取期间目录授权发生变化，未返回文件路径或正文'});continue;}
    readFailure={code:failureCode(message),message:failureMessage(message)};
   }
  }
  if(readFailure){markSkipped(file);warn({...readFailure,mountId:file.mountId,path:file.path});}
  let snippet:string|undefined,startLine:number|undefined,endLine:number|undefined,textContentHash:string|undefined;
  let bodyPhrase=false,bodyTerms:string[]=[];
  if(text!==undefined){
   bodyVersions.push({mountId:file.mountId,path:file.path,sha256:createHash('sha256').update(text).digest('hex')});
   const included=Math.min(text.length,maxFileCharacters,maxTotalCharacters-totalCharacters);
   const includedText=text.slice(0,included);totalCharacters+=included;
   if(included<text.length){coverage.partialBodyFiles++;warn({mountId:file.mountId,path:file.path,code:'SEARCH_BODY_TRUNCATED',message:`仅检索解析文本前 ${included} / ${text.length} 字符，其余正文尚未检索`});}else coverage.bodyReadFiles++;
   const normalizedText=normalize(includedText);
   bodyPhrase=normalizedText.includes(normalized);bodyTerms=terms.filter(term=>normalizedText.includes(term));
   if(bodyPhrase||bodyTerms.length){
    // Locate against original text, so width normalization cannot corrupt line
    // offsets or turn a quoted excerpt into generated content.
    const excerpt=locateExcerpt(includedText,normalized,terms);
    snippet=excerpt.snippet;startLine=excerpt.startLine;endLine=excerpt.endLine;
    textContentHash=createHash('sha256').update(text).digest('hex');
   }
  }
  const matchedTerms=terms.filter(term=>pathTerms.includes(term)||bodyTerms.includes(term));
  if(!pathPhrase&&!bodyPhrase&&!matchedTerms.length)continue;
  const score=(pathPhrase?100_000:0)+(bodyPhrase?50_000:0)+(matchedTerms.length===terms.length?20_000:0)+matchedTerms.length*1000+pathTerms.length*200+bodyTerms.length*100;
  const bodyMatch=bodyPhrase||bodyTerms.length>0,pathMatch=pathPhrase||pathTerms.length>0;
  hits.push({...file,score,matchKind:pathMatch&&bodyMatch?'path_and_body':bodyMatch?'body':'path',matchedTerms,...(snippet!==undefined?{snippet,startLine,endLine,locator:`text-lines:${startLine}-${endLine}`,textContentHash}:{})});
 }
 // Recheck final results too: an earlier file's authorization may have changed
 // while scanning another mount. Revoked records never survive in the receipt.
 const visible:EvidenceSearchHit[]=[];
 for(const hit of hits){try{await reader.authorized(hit);visible.push(hit);}catch{markSkipped(hit);warn({code:'SEARCH_ACCESS_CHANGED',message:'检索完成前目录授权已改变，相关路径和命中已移除'});}}
 for(let index=limitations.length-1;index>=0;index--){const limitation=limitations[index];if(limitation.mountId&&limitation.path)try{await reader.authorized({mountId:limitation.mountId,path:limitation.path,size:0});}catch{limitations[index]={code:'SEARCH_ACCESS_CHANGED',message:'目录授权已改变，相关文件路径与诊断已移除'};}}
 visible.sort((a,b)=>b.score-a.score||ordered(a,b));
 coverage.matchedFiles=visible.filter(file=>file.entryType!=='directory').length;
 if(options.shallow)coverage.matchedDirectories=visible.filter(file=>file.entryType==='directory').length;
 coverage.limitationCount=limitationCount;
 if(limitationCount>EVIDENCE_SEARCH_LIMITS.maxLimitations)limitations[limitations.length-1]={code:'SEARCH_LIMITATIONS_TRUNCATED',message:`共有 ${limitationCount} 项检索限制，仅展示前 ${EVIDENCE_SEARCH_LIMITS.maxLimitations-1} 项`};
 if(coverage.listTruncated||coverage.skippedFiles||limitationCount)coverage.status='partial';
 const resultVersion=createHash('sha256').update(JSON.stringify({version:2,query:normalized,mountId:options.mountId??null,listingVersion:listing.version??null,files:sorted,bodyVersions:bodyVersions.sort(ordered),visible,scan:{maxFiles,maxFileCharacters,maxTotalCharacters},coverage:{...coverage,resultTruncated:false}})).digest('hex');
 if(options.resultVersion&&options.resultVersion!==resultVersion)throw Error('SEARCH_RESULTS_CHANGED: 文件、授权或本次检索范围已变化，不能沿用旧页；请从offset=0重新检索');
 return paginateSearch({query,terms,items:visible,coverage,limitations,scope:options.mountId?{mountId:options.mountId}:{},resultVersion},offset,maxResults,options.maxResponseCharacters);
}

/** Whole entries and whole diagnostic records only; never crop serialized JSON.
 * An oversized next entry errors at that offset instead of being lost/skipped. */
function paginateSearch(input:Omit<EvidenceSearchResult,'pagination'>,offset:number,limit:number,responseBudget?:number):EvidenceSearchResult{
 const maxResponseCharacters=bounded(responseBudget,EVIDENCE_SEARCH_LIMITS.defaultResponseCharacters,EVIDENCE_SEARCH_LIMITS.maxResponseCharacters);
 if(maxResponseCharacters<1500)throw Error('SEARCH_RESPONSE_BUDGET: 检索响应预算不足');
 if(offset>input.items.length)throw Error('SEARCH_CURSOR_INVALID: 页位置超过当前结果，请从第一页重新检索');
 const selected:EvidenceSearchHit[]=[];
 let shown=input.limitations.slice();let compacted=false;
 const make=():EvidenceSearchResult=>{const nextOffset=offset+selected.length<input.items.length?offset+selected.length:null;return{...input,items:selected.slice(),coverage:{...input.coverage,resultTruncated:offset>0||nextOffset!==null},limitations:shown.slice(),pagination:{offset,limit,returned:selected.length,nextOffset,totalMatches:input.items.length,responseCharacters:0,maxResponseCharacters,notice:'本页只包含当前已检索范围的部分完整命中；nextOffset非空时使用相同query、mountId和resultVersion继续。coverage/limitations说明未扫描内容，不能宣称资料全集已找到。'}};};
 const measured=()=>{const result=make();for(let attempt=0;attempt<4;attempt++){const length=JSON.stringify(result).length;if(result.pagination.responseCharacters===length)break;result.pagination.responseCharacters=length;}return result;};
 const compact=()=>{if(compacted)return;compacted=true;const groups=new Map<string,{code:string;message:string;count:number}>();for(const limitation of input.limitations){const current=groups.get(limitation.code);if(current)current.count++;else groups.set(limitation.code,{code:limitation.code,message:limitation.message.slice(0,300),count:1});}shown=[...groups.values()].slice(0,8).map(item=>({code:item.code,message:item.message+'（已展示诊断中同类 '+item.count+' 项；具体文件诊断因响应预算汇总，全部限制数见coverage.limitationCount）'}));};
 if(JSON.stringify(measured()).length>maxResponseCharacters)compact();
 if(JSON.stringify(measured()).length>maxResponseCharacters){shown=[{code:'SEARCH_DIAGNOSTICS_COMPACTED',message:'文件诊断因响应预算仅保留汇总；限制总数见coverage.limitationCount，正文或目录未完整检索不能声称资料全集。'}];}
 for(const item of input.items.slice(offset,offset+limit)){selected.push(item);if(JSON.stringify(measured()).length>maxResponseCharacters){compact();if(JSON.stringify(measured()).length>maxResponseCharacters){selected.pop();if(!selected.length)throw Error('SEARCH_ITEM_RESPONSE_LIMIT: 此命中完整路径或条目超过响应预算，未跳过；请缩小检索范围或由宿主调整单页预算');break;}}}
 const result=measured();if(JSON.stringify(result).length>maxResponseCharacters)throw Error('SEARCH_RESPONSE_BUDGET: 检索元数据超过响应预算，未返回截断JSON');return result;
}

function pathScore(value:string,query:string,terms:string[]){const normalized=normalize(value);return(normalized.includes(query)?1000:0)+terms.filter(term=>normalized.includes(term)).length;}
function failureCode(message:string){if(message==='暂不支持此文件的文本解析')return'SEARCH_FORMAT_UNSUPPORTED';if(/限制|_LIMIT/.test(message))return'SEARCH_READ_LIMIT';return/^[A-Z][A-Z_]+:/.test(message)?message.split(':')[0]:'SEARCH_READ_FAILED';}
function failureMessage(message:string){if(message==='暂不支持此文件的文本解析')return'此格式正文尚不支持直接检索；可先登记处理副本并提取文本';if(/限制|_LIMIT/.test(message))return'文件超过直接正文读取限制；可先登记处理副本并提取文本';return message.slice(0,300);}

function locateExcerpt(text:string,query:string,terms:string[]){
 // Map only the winning normalized offset back to original characters. NFKC
 // can expand ligatures or change width; offsets must still quote real text.
 const normalizedText=normalize(text);
 let normalizedOffset=normalizedText.indexOf(query),needle=query;
 if(normalizedOffset<0){const locations=terms.map(term=>({term,at:normalizedText.indexOf(term)})).filter(value=>value.at>=0).sort((a,b)=>a.at-b.at);normalizedOffset=locations[0]?.at??0;needle=locations[0]?.term??'';}
 let originalOffset=0,normalizedPosition=0,matchEnd=0,cursor=0,found=false;
 const graphemes=new Intl.Segmenter(undefined,{granularity:'grapheme'});
 for(const {segment} of graphemes.segment(text)){const nextPosition=normalizedPosition+normalize(segment).length;if(!found&&nextPosition>normalizedOffset){originalOffset=cursor;found=true;}if(found&&nextPosition>=normalizedOffset+needle.length){matchEnd=cursor+segment.length;break;}cursor+=segment.length;normalizedPosition=nextPosition;}
 const start=Math.max(0,originalOffset-70),end=Math.min(text.length,Math.max(matchEnd,originalOffset+EVIDENCE_SEARCH_LIMITS.maxSnippetCharacters-70));
 const snippet=text.slice(start,Math.min(end,start+EVIDENCE_SEARCH_LIMITS.maxSnippetCharacters));
 const startLine=1+(text.slice(0,start).match(/\n/g)?.length??0);
 const endLine=startLine+(snippet.match(/\n/g)?.length??0);
 return{snippet,startLine,endLine};
}
