import {createHash,randomUUID} from 'node:crypto';
import type {Store} from './store.js';
import type {KnowledgeSearchResult} from '../shared/knowledge-base.js';
import {createKnowledgeBaseSchema,updateKnowledgeSourcesSchema,KNOWLEDGE_LIMITS,type EmbeddingFingerprint,type KnowledgeBase,type KnowledgeBaseDetails,type KnowledgeChunk,type KnowledgeCoverage,type KnowledgeDocument,type KnowledgeExportBundle,type KnowledgeIndexBuild,type KnowledgeIndexSnapshot,type KnowledgeSourceRead,type KnowledgeSourceRef} from '../shared/knowledge-base.js';

export type EmbeddingProvider={
 readonly fingerprint:EmbeddingFingerprint;
 /** Actual provider response, including the model identity that generated these vectors. */
 embed(texts:string[],signal?:AbortSignal):Promise<{fingerprint:EmbeddingFingerprint;vectors:number[][]}>;
};
export type KnowledgeBaseDependencies={
 store:Pick<Store,'get'|'set'>;projectId:()=>string;
 assertAccess:(projectId:string,write?:boolean)=>void|Promise<void>;
 assertSourceAccess:(source:KnowledgeSourceRef)=>void|Promise<void>;
 readSource:(source:KnowledgeSourceRef)=>Promise<KnowledgeSourceRead>;
 /** Read-only version check; avoids regenerating Office copies during retrieval. */
 verifySource?:(document:KnowledgeDocument)=>Promise<void>;
 embedding?:EmbeddingProvider;
};
type StoredBuild={summary:KnowledgeIndexBuild;documents:KnowledgeDocument[];chunks:KnowledgeChunk[]};
type StoredKnowledge={base:KnowledgeBase;builds:StoredBuild[]};
type ProjectState={schemaVersion:1;items:StoredKnowledge[]};
const running=new WeakMap<object,Set<string>>();
const sha=(text:string)=>createHash('sha256').update(text).digest('hex');
const now=()=>new Date().toISOString();
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export const knowledgeEmbeddingFingerprint=(value:EmbeddingFingerprint)=>sha(JSON.stringify({provider:value.provider,model:value.model,revision:value.revision,dimensions:value.dimensions}));
const sourceKey=(ref:KnowledgeSourceRef)=>`${ref.mountId}\0${ref.path.replaceAll('\\','/').toLocaleLowerCase('en-US')}`;
function validateFingerprint(value:EmbeddingFingerprint){
 if(!value||typeof value.provider!=='string'||!value.provider.trim()||value.provider.length>2300||![value.model,value.revision].every(item=>typeof item==='string'&&item.trim()&&item.length<=300)||!Number.isInteger(value.dimensions)||value.dimensions<1||value.dimensions>8192)throw Error('EMBEDDING_CONFIG_INVALID');
}
function validateVectors(vectors:number[][],count:number,dimensions:number){
 if(!Array.isArray(vectors)||vectors.length!==count||vectors.some(vector=>!Array.isArray(vector)||vector.length!==dimensions||vector.some(value=>typeof value!=='number'||!Number.isFinite(value))||!vector.some(value=>value!==0)))throw Error('EMBEDDING_VECTOR_INVALID');
}
function selectedSources(sources:KnowledgeSourceRef[]){
 const parsed=updateKnowledgeSourcesSchema.parse(sources),seen=new Set<string>();
 for(const source of parsed){const key=sourceKey(source);if(seen.has(key))throw Error('KNOWLEDGE_DUPLICATE_SOURCE');seen.add(key);}
 return parsed;
}
function validateRead(read:KnowledgeSourceRead){
 if(typeof read.text!=='string'||!read.text.trim())throw Error('KNOWLEDGE_TEXT_UNAVAILABLE');
 if(read.text.length>KNOWLEDGE_LIMITS.maxSourceCharacters)throw Error('KNOWLEDGE_SOURCE_LIMIT');
 if(!/^[a-f0-9]{64}$/.test(read.originalHash)||read.extractedHash!==undefined&&!/^[a-f0-9]{64}$/.test(read.extractedHash)||!read.versionId?.trim()||!read.parserVersion?.trim())throw Error('KNOWLEDGE_SOURCE_PROVENANCE_INVALID');
 if(!read.coverage||!['complete','partial'].includes(read.coverage.status)||!Array.isArray(read.coverage.limitations)||read.coverage.limitations.some(value=>typeof value!=='string')||read.coverage.status==='partial'&&!read.coverage.limitations.length||read.coverage.status==='complete'&&read.coverage.limitations.length)throw Error('KNOWLEDGE_COVERAGE_INVALID');
}
function documentFor(source:KnowledgeSourceRef,read:KnowledgeSourceRead):KnowledgeDocument{
 validateRead(read);return{id:sha(sourceKey(source)),source:structuredClone(source),originalSource:read.originalSource,originalHash:read.originalHash,extractedHash:read.extractedHash,textHash:sha(read.text),versionId:read.versionId,parserVersion:read.parserVersion,coverage:structuredClone(read.coverage)};
}
const sameDocument=(a:KnowledgeDocument,b:KnowledgeDocument)=>equal({...a,source:{mountId:a.source.mountId,path:a.source.path}}, {...b,source:{mountId:b.source.mountId,path:b.source.path}});

/** Deterministic text offsets refer to the parsed snapshot, never to the original Office bytes. */
export function chunkKnowledgeDocument(document:KnowledgeDocument,text:string,indexId:string):KnowledgeChunk[]{
 if(sha(text)!==document.textHash)throw Error('KNOWLEDGE_TEXT_HASH_MISMATCH');
 const lines:Array<{text:string;start:number;end:number}>=[];let start=0;
 for(const value of text.split('\n')){lines.push({text:value,start,end:start+value.length});start+=value.length+1;}
 const chunks:KnowledgeChunk[]=[];let heading:string|undefined;let paragraphStart=-1;
 const add=(from:number,to:number,kind:'lines'|'table_row',row?:number,headerLine?:number)=>{
  const raw=text.slice(from,to);if(!raw.trim())return;
  const prefix=headerLine===undefined?'':lines[headerLine-1].text+'\n';
  if(kind==='table_row'&&prefix.length+raw.length>KNOWLEDGE_LIMITS.maxChunkCharacters)throw Error('KNOWLEDGE_TABLE_ROW_LIMIT');
  let offset=0;
  while(offset<raw.length){
   let end=Math.min(raw.length,offset+KNOWLEDGE_LIMITS.maxChunkCharacters-prefix.length);
   if(end<raw.length){const candidate=raw.slice(offset,end),minimum=Math.floor(candidate.length*.6);let boundary=-1;for(const match of candidate.matchAll(/[。！？；\n.!?;]\s*/g))if(match.index!>=minimum)boundary=match.index!+match[0].length;if(boundary>0)end=offset+boundary;}
   if(end<raw.length&&/[\uD800-\uDBFF]/.test(raw[end-1]))end--;
   const body=prefix+raw.slice(offset,end),absoluteStart=from+offset,absoluteEnd=from+end;
   let startLine=1,endLine=1;for(let index=0;index<lines.length;index++){if(lines[index].start<=absoluteStart)startLine=index+1;if(lines[index].start<absoluteEnd)endLine=index+1;}
   const locator={kind,startLine,endLine,startCharacter:absoluteStart,endCharacter:absoluteEnd,heading,row,headerLine};
   chunks.push({id:sha(JSON.stringify([document.id,document.textHash,locator,sha(body)])),documentId:document.id,source:structuredClone(document.source),indexId,text:body,textHash:sha(body),locator});
   if(chunks.length>KNOWLEDGE_LIMITS.maxChunks)throw Error('KNOWLEDGE_CHUNK_LIMIT');offset=end;
  }
 };
 const flush=(end:number)=>{if(paragraphStart>=0){add(lines[paragraphStart].start,end,'lines');paragraphStart=-1;}};
 if(/\.csv$/i.test(document.source.path)){
  // Logical CSV rows may span physical lines. Never split a quoted record or
  // concatenate values from separate business objects into one chunk.
  let quoted=false,from=0,row=0,headerLine:number|undefined;
  for(let index=0;index<text.length;index++){
   if(text[index]==='"'){if(quoted&&text[index+1]==='"'){index++;continue;}quoted=!quoted;}
   if(text[index]==='\n'&&!quoted||index===text.length-1){if(quoted)throw Error('KNOWLEDGE_CSV_INVALID');const end=text[index]==='\n'?index:index+1;row++;add(from,end,row===1?'lines':'table_row',row,headerLine);if(row===1)headerLine=1;from=index+1;}
  }
  if(!chunks.length)throw Error('KNOWLEDGE_TEXT_UNAVAILABLE');return chunks;
 }
 const separator=(value:string)=>/^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(value);
 for(let index=0;index<lines.length;index++){
  const line=lines[index],value=line.text;
  if(/^\s*#{1,6}\s+/.test(value)||/^工作表:\s*/.test(value)){flush(line.start);heading=value.replace(/^\s*#{1,6}\s+/,'').trim();add(line.start,line.end,'lines');continue;}
  if(index+1<lines.length&&value.includes('|')&&separator(lines[index+1].text)){
   flush(line.start);const headerLine=index+1;add(line.start,line.end,'lines');index+=2;
   while(index<lines.length&&lines[index].text.trim()&&lines[index].text.includes('|')){add(lines[index].start,lines[index].end,'table_row',index+1,headerLine);index++;}index--;continue;
  }
  // The registered XLSX parser emits cell-address lines: keep each business row together.
  const cell=value.match(/^([A-Z]+)(\d+)(?:\s*\[[^\]]*\])?:\s/);
  if(cell){flush(line.start);const row=Number(cell[2]),from=index;while(index+1<lines.length){const next=lines[index+1].text.match(/^([A-Z]+)(\d+)(?:\s*\[[^\]]*\])?:\s/);if(!next||Number(next[2])!==row)break;index++;}add(lines[from].start,lines[index].end,'table_row',row);continue;}
  if(!value.trim()){flush(line.start);continue;}
  if(paragraphStart<0)paragraphStart=index;
 }
 flush(text.length);if(!chunks.length)throw Error('KNOWLEDGE_TEXT_UNAVAILABLE');return chunks;
}

export class KnowledgeBaseDomain{
 private recovered=new Set<string>();
 constructor(private deps:KnowledgeBaseDependencies){if(!running.has(deps.store))running.set(deps.store,new Set());}
 private state(projectId:string):ProjectState{
  const state=this.deps.store.get<ProjectState>(`knowledge-base:v1:${sha(projectId)}`,{schemaVersion:1,items:[]});
  if(!this.recovered.has(projectId)){
   let changed=false;for(const item of state.items)for(const build of item.builds)if(build.summary.status==='staging'&&!running.get(this.deps.store)!.has(build.summary.id)){build.summary.status='unknown';build.summary.errorCode='KNOWLEDGE_BUILD_INTERRUPTED';build.summary.error='构建进程已中断；已完成块保留，可明确选择恢复。';build.summary.updatedAt=now();if(item.base.lastBuild?.id===build.summary.id)item.base.lastBuild=structuredClone(build.summary);changed=true;}
   this.recovered.add(projectId);if(changed)this.save(projectId,state);
  }
  return state;
 }
 private save(projectId:string,state:ProjectState){this.deps.store.set(`knowledge-base:v1:${sha(projectId)}`,state);}
 private item(state:ProjectState,id:string){const item=state.items.find(value=>value.base.id===id&&value.base.status!=='deleted');if(!item)throw Error('KNOWLEDGE_BASE_NOT_FOUND');return item;}
 private async access(write=false){const projectId=this.deps.projectId();if(!projectId)throw Error('KNOWLEDGE_PROJECT_REQUIRED');await this.deps.assertAccess(projectId,write);if(this.deps.projectId()!==projectId)throw Error('KNOWLEDGE_PROJECT_CHANGED');return projectId;}
 private async guard(projectId:string,base:KnowledgeBase,signal?:AbortSignal,write=true){
  if(signal?.aborted)throw Error('CANCELLED');await this.deps.assertAccess(projectId,write);if(this.deps.projectId()!==projectId)throw Error('KNOWLEDGE_PROJECT_CHANGED');
  const current=this.item(this.state(projectId),base.id).base;if(current.revision!==base.revision||!equal(current.sources,base.sources))throw Error('KNOWLEDGE_SELECTION_CHANGED');
  for(const source of base.sources){await this.deps.assertSourceAccess(source);if(signal?.aborted)throw Error('CANCELLED');}
 }
 async list():Promise<KnowledgeBase[]>{const projectId=await this.access();return structuredClone(this.state(projectId).items.filter(item=>item.base.status!=='deleted').map(item=>item.base));}
 async get(id:string):Promise<KnowledgeBaseDetails>{
  const projectId=await this.access(),item=this.item(this.state(projectId),id),build=item.builds.find(value=>value.summary.id===item.base.currentIndexId);
  const result:KnowledgeBaseDetails=structuredClone(item.base);if(build&&item.base.status==='local_ready'&&build.summary.sourceRevision===item.base.revision){await this.publishedSnapshot(id);result.index={indexId:build.summary.id,fingerprint:build.summary.fingerprint,coverage:build.summary.coverage,documents:structuredClone(build.documents),chunkCount:build.chunks.length,previews:build.chunks.slice(0,8).map(({id,documentId,text,locator})=>({id,documentId,text:text.slice(0,500),locator}))};}return result;
 }
 async create(input:{title:string;sources:KnowledgeSourceRef[]}):Promise<KnowledgeBase>{
  const parsed=createKnowledgeBaseSchema.parse(input),sources=selectedSources(parsed.sources),projectId=await this.access(true);for(const source of sources)await this.deps.assertSourceAccess(source);if(await this.access(true)!==projectId)throw Error('KNOWLEDGE_PROJECT_CHANGED');
  const base:KnowledgeBase={id:randomUUID(),projectId,title:parsed.title,sources,revision:1,status:'draft',createdAt:now(),updatedAt:now()},state=this.state(projectId);state.items.unshift({base,builds:[]});this.save(projectId,state);return structuredClone(base);
 }
 async setSources(id:string,sources:KnowledgeSourceRef[]):Promise<KnowledgeBase>{
  const parsed=selectedSources(sources),projectId=await this.access(true);for(const source of parsed)await this.deps.assertSourceAccess(source);if(await this.access(true)!==projectId)throw Error('KNOWLEDGE_PROJECT_CHANGED');
  const state=this.state(projectId),item=this.item(state,id);if(!equal(item.base.sources,parsed)){item.base.sources=parsed;item.base.revision++;item.base.status=item.base.currentIndexId?'blocked':'draft';item.base.updatedAt=now();this.save(projectId,state);}return structuredClone(item.base);
 }
 private updateBuild(projectId:string,id:string,build:StoredBuild){
  const state=this.state(projectId),item=this.item(state,id),index=item.builds.findIndex(value=>value.summary.id===build.summary.id);if(index<0)throw Error('KNOWLEDGE_BUILD_NOT_FOUND');build.summary.updatedAt=now();item.builds[index]=structuredClone(build);item.base.lastBuild=structuredClone(build.summary);item.base.updatedAt=now();this.save(projectId,state);
 }
 async build(id:string,options:{resumeBuildId?:string;signal?:AbortSignal}={}):Promise<KnowledgeBase>{
  const projectId=await this.access(true),initial=this.item(this.state(projectId),id),base=structuredClone(initial.base),provider=this.deps.embedding;
  if(!base.sources.length)throw Error('KNOWLEDGE_NO_SOURCES: 请先选择资料');if(!provider)throw Error('EMBEDDING_NOT_CONFIGURED: 请先配置专用向量服务');validateFingerprint(provider.fingerprint);const fingerprint=structuredClone(provider.fingerprint);
  const locks=running.get(this.deps.store)!;if(initial.builds.some(value=>locks.has(value.summary.id)))throw Error('KNOWLEDGE_BUILD_BUSY');
  let build:StoredBuild;
  if(options.resumeBuildId){const previous=initial.builds.find(value=>value.summary.id===options.resumeBuildId);if(!previous||!['unknown','failed'].includes(previous.summary.status))throw Error('KNOWLEDGE_RESUME_INVALID');if(previous.summary.sourceRevision!==base.revision||knowledgeEmbeddingFingerprint(previous.summary.fingerprint)!==knowledgeEmbeddingFingerprint(fingerprint))throw Error('KNOWLEDGE_RESUME_VERSION_MISMATCH');build=structuredClone(previous);build.summary.status='staging';delete build.summary.errorCode;delete build.summary.error;}
  else build={summary:{id:randomUUID(),status:'staging',sourceRevision:base.revision,fingerprint,completedChunks:0,totalChunks:0,completedSources:0,totalSources:base.sources.length,coverage:{status:'complete',limitations:[]},createdAt:now(),updatedAt:now()},documents:[],chunks:[]};
  locks.add(build.summary.id);
  try{
   const state=this.state(projectId),item=this.item(state,id);if(!options.resumeBuildId)item.builds.push(structuredClone(build));this.save(projectId,state);this.updateBuild(projectId,id,build);
   await this.guard(projectId,base,options.signal);let totalCharacters=0;const documents:KnowledgeDocument[]=[],chunks:KnowledgeChunk[]=[];
   for(const source of base.sources){
    await this.guard(projectId,base,options.signal);const read=await this.deps.readSource(source);await this.guard(projectId,base,options.signal);const document=documentFor(source,read);totalCharacters+=read.text.length;if(totalCharacters>KNOWLEDGE_LIMITS.maxTotalCharacters)throw Error('KNOWLEDGE_TOTAL_TEXT_LIMIT');
    const previous=build.documents.find(value=>value.id===document.id);if(previous&&!sameDocument(previous,document))throw Error('KNOWLEDGE_RESUME_SOURCE_CHANGED');documents.push(document);chunks.push(...chunkKnowledgeDocument(document,read.text,build.summary.id));if(chunks.length>KNOWLEDGE_LIMITS.maxChunks)throw Error('KNOWLEDGE_CHUNK_LIMIT');
   }
   if(chunks.length*fingerprint.dimensions>KNOWLEDGE_LIMITS.maxVectorValues)throw Error('KNOWLEDGE_VECTOR_BUDGET_LIMIT');
   // Reuse only within this knowledge base and exactly the same embedding fingerprint.
   const reusable=new Map<string,number[]>();for(const previous of initial.builds)if(knowledgeEmbeddingFingerprint(previous.summary.fingerprint)===knowledgeEmbeddingFingerprint(fingerprint))for(const chunk of previous.chunks)if(chunk.embedding){validateVectors([chunk.embedding],1,fingerprint.dimensions);reusable.set(chunk.textHash,chunk.embedding);}
   for(const chunk of build.chunks)if(chunk.embedding)reusable.set(chunk.textHash,chunk.embedding);
   for(const chunk of chunks)if(reusable.has(chunk.textHash))chunk.embedding=structuredClone(reusable.get(chunk.textHash)!);
   build.documents=documents;build.chunks=chunks;build.summary.completedSources=documents.length;build.summary.totalChunks=chunks.length;build.summary.completedChunks=chunks.filter(value=>value.embedding).length;
   const limitations=documents.flatMap(document=>document.coverage.limitations.map(value=>`${document.source.displayName??document.source.path}: ${value}`));build.summary.coverage={status:documents.some(value=>value.coverage.status==='partial')?'partial':'complete',limitations};this.updateBuild(projectId,id,build);
   const pending=chunks.filter(value=>!value.embedding);
   for(let index=0;index<pending.length;index+=KNOWLEDGE_LIMITS.embeddingBatchSize){
    await this.guard(projectId,base,options.signal);if(knowledgeEmbeddingFingerprint(provider.fingerprint)!==knowledgeEmbeddingFingerprint(fingerprint))throw Error('EMBEDDING_FINGERPRINT_MISMATCH');
    const batch=pending.slice(index,index+KNOWLEDGE_LIMITS.embeddingBatchSize),result=await provider.embed(batch.map(value=>value.text),options.signal);await this.guard(projectId,base,options.signal);
    if(knowledgeEmbeddingFingerprint(result.fingerprint)!==knowledgeEmbeddingFingerprint(fingerprint))throw Error('EMBEDDING_FINGERPRINT_MISMATCH');validateVectors(result.vectors,batch.length,fingerprint.dimensions);
    batch.forEach((chunk,offset)=>{chunk.embedding=result.vectors[offset];});build.summary.completedChunks=chunks.filter(value=>value.embedding).length;this.updateBuild(projectId,id,build);
   }
   await this.verifyDocuments(projectId,base,documents,options.signal);build.summary.status='ready';this.updateBuild(projectId,id,build);return structuredClone(this.item(this.state(projectId),id).base);
  }catch(error){
   const message=error instanceof Error?error.message:'KNOWLEDGE_BUILD_FAILED',code=message.split(':')[0];build.summary.status=code==='EMBEDDING_RESULT_UNKNOWN'?'unknown':'failed';build.summary.errorCode=code;build.summary.error=code;try{this.updateBuild(projectId,id,build);}catch{/* A removed collection remains removed. */}throw error;
  }finally{locks.delete(build.summary.id);}
 }
 private async verifyDocuments(projectId:string,base:KnowledgeBase,documents:KnowledgeDocument[],signal?:AbortSignal,write=true){
  for(const document of documents){await this.guard(projectId,base,signal,write);if(document.originalSource)await this.deps.assertSourceAccess(document.originalSource);if(this.deps.verifySource)await this.deps.verifySource(document);else{const read=await this.deps.readSource(document.source);if(!sameDocument(document,documentFor(document.source,read)))throw Error('KNOWLEDGE_SOURCE_CHANGED');}await this.guard(projectId,base,signal,write);}
 }
 async activateLocalIndex(id:string,buildId:string):Promise<KnowledgeBase>{
  const projectId=await this.access(true),initial=this.item(this.state(projectId),id),base=structuredClone(initial.base),build=initial.builds.find(value=>value.summary.id===buildId);
  if(!build||build.summary.status!=='ready'||build.summary.sourceRevision!==base.revision)throw Error('KNOWLEDGE_INDEX_NOT_READY');validateFingerprint(build.summary.fingerprint);validateVectors(build.chunks.map(value=>value.embedding!),build.chunks.length,build.summary.fingerprint.dimensions);
  await this.verifyDocuments(projectId,base,build.documents);await this.guard(projectId,base);
  const state=this.state(projectId),item=this.item(state,id);item.base.currentIndexId=buildId;item.base.status='local_ready';item.base.updatedAt=now();this.save(projectId,state);return structuredClone(item.base);
 }
 async stopSharing(id:string):Promise<KnowledgeBase>{const projectId=await this.access(true),state=this.state(projectId),item=this.item(state,id);item.base.status='blocked';item.base.revision++;item.base.updatedAt=now();this.save(projectId,state);return structuredClone(item.base);}
 async remove(id:string):Promise<void>{const projectId=await this.access(true),state=this.state(projectId),item=this.item(state,id);item.base.status='deleted';item.base.revision++;item.base.updatedAt=now();this.save(projectId,state);}
 async publishedSnapshot(id:string):Promise<KnowledgeIndexSnapshot>{
  const projectId=await this.access(),initial=this.item(this.state(projectId),id),base=structuredClone(initial.base);if(base.status!=='local_ready'||!base.currentIndexId)throw Error('KNOWLEDGE_RETRIEVAL_BLOCKED');
  const build=initial.builds.find(value=>value.summary.id===base.currentIndexId);if(!build||build.summary.status!=='ready'||build.summary.sourceRevision!==base.revision)throw Error('KNOWLEDGE_RETRIEVAL_BLOCKED');
  try{await this.verifyDocuments(projectId,base,build.documents,undefined,false);}catch(error){if(error instanceof Error&&error.message.startsWith('KNOWLEDGE_SOURCE_CHANGED')){const state=this.state(projectId),current=this.item(state,id);if(current.base.currentIndexId===base.currentIndexId&&current.base.revision===base.revision){current.base.status='blocked';current.base.updatedAt=now();this.save(projectId,state);}}throw error;}
  for(const document of build.documents){await this.deps.assertSourceAccess(document.source);if(document.originalSource)await this.deps.assertSourceAccess(document.originalSource);}
  if(await this.access()!==projectId)throw Error('KNOWLEDGE_PROJECT_CHANGED');const current=this.item(this.state(projectId),id).base;if(current.revision!==base.revision||current.currentIndexId!==base.currentIndexId||current.status!=='local_ready')throw Error('KNOWLEDGE_RETRIEVAL_BLOCKED');
  return structuredClone({knowledgeBaseId:id,projectId,indexId:build.summary.id,fingerprint:build.summary.fingerprint,documents:build.documents,chunks:build.chunks,coverage:build.summary.coverage,createdAt:build.summary.createdAt});
 }
 async search(id:string,question:string):Promise<KnowledgeSearchResult>{
  if(typeof question!=='string'||!question.trim()||question.trim().length>1000)throw Error('KNOWLEDGE_QUESTION_INVALID');question=question.trim();
  const snapshot=await this.publishedSnapshot(id),provider=this.deps.embedding;if(!provider)throw Error('EMBEDDING_NOT_CONFIGURED');
  const fingerprint=knowledgeEmbeddingFingerprint(snapshot.fingerprint);if(knowledgeEmbeddingFingerprint(provider.fingerprint)!==fingerprint)throw Error('EMBEDDING_FINGERPRINT_MISMATCH');
  const response=await provider.embed([question]);if(knowledgeEmbeddingFingerprint(provider.fingerprint)!==fingerprint||knowledgeEmbeddingFingerprint(response.fingerprint)!==fingerprint)throw Error('EMBEDDING_FINGERPRINT_MISMATCH');validateVectors(response.vectors,1,snapshot.fingerprint.dimensions);
  const tokens=(value:string)=>{const words=value.toLocaleLowerCase('en-US').match(/[a-z0-9_]+|[\u3400-\u9fff]+/g)??[];return new Set(words.flatMap(word=>/[\u3400-\u9fff]/.test(word)?word.length===1?[word]:Array.from({length:word.length-1},(_,index)=>word.slice(index,index+2)):[word]));};
  const terms=tokens(question),normalize=(values:number[])=>{const scale=Math.max(...values.map(Math.abs)),length=Math.hypot(...values.map(value=>value/scale));return values.map(value=>value/scale/length);},query=normalize(response.vectors[0]);
  const ranked=snapshot.chunks.map(chunk=>{validateVectors([chunk.embedding!],1,snapshot.fingerprint.dimensions);const vector=normalize(chunk.embedding!),semantic=vector.reduce((sum,value,index)=>sum+value*query[index],0),words=tokens(chunk.text),lexical=[...terms].filter(term=>words.has(term)).length/Math.max(1,terms.size);return{chunk,semantic,lexical};});
  const semantic=ranked.filter(value=>value.semantic>=0.55).sort((a,b)=>b.semantic-a.semantic),lexical=ranked.filter(value=>value.lexical>0).sort((a,b)=>b.lexical-a.lexical),scores=new Map<string,number>();
  for(const list of [semantic,lexical])list.forEach((value,index)=>scores.set(value.chunk.id,(scores.get(value.chunk.id)??0)+1/(60+index+1)));
  const hits=ranked.filter(value=>scores.has(value.chunk.id)).sort((a,b)=>scores.get(b.chunk.id)!-scores.get(a.chunk.id)!).slice(0,6).map(({chunk})=>({chunkId:chunk.id,document:snapshot.documents.find(document=>document.id===chunk.documentId)!,text:chunk.text,locator:chunk.locator,score:scores.get(chunk.id)!}));
  // Network await may overlap file edits, revocation, selection changes or activation.
  const latest=await this.publishedSnapshot(id);if(latest.projectId!==snapshot.projectId||latest.indexId!==snapshot.indexId)throw Error('KNOWLEDGE_RETRIEVAL_BLOCKED');
  return{knowledgeBaseId:id,indexId:snapshot.indexId,question,status:hits.length?'evidence':'no_evidence',coverage:snapshot.coverage,hits};
 }
 async sourceForChunk(id:string,chunkId:string):Promise<KnowledgeSourceRef>{const snapshot=await this.publishedSnapshot(id),chunk=snapshot.chunks.find(value=>value.id===chunkId);if(!chunk)throw Error('KNOWLEDGE_CITATION_INVALID');return structuredClone(chunk.source);}
 async exportBundle(id:string):Promise<KnowledgeExportBundle>{
  const snapshot=await this.publishedSnapshot(id),projectId=await this.access(),base=this.item(this.state(projectId),id).base;
  if(projectId!==snapshot.projectId||base.currentIndexId!==snapshot.indexId||base.status!=='local_ready')throw Error('KNOWLEDGE_RETRIEVAL_BLOCKED');
  const content={schemaVersion:1 as const,title:base.title,snapshot};return{...content,manifestHash:sha(JSON.stringify(content))};
 }
}

/** OpenAI-compatible /embeddings adapter. The key stays in this closure, never in persisted snapshots. */
export function createOpenAICompatibleEmbeddingProvider(config:{endpoint:string;apiKey:string;model:string;revision:string;dimensions:number}):EmbeddingProvider{
 config={...config};
 const endpoint=new URL(config.endpoint);if(!['https:','http:'].includes(endpoint.protocol)||endpoint.username||endpoint.password||endpoint.hash||endpoint.search||endpoint.protocol==='http:'&&!['127.0.0.1','localhost','[::1]'].includes(endpoint.hostname))throw Error('EMBEDDING_ENDPOINT_INVALID');
 if(!config.apiKey?.trim())throw Error('EMBEDDING_KEY_REQUIRED');const fingerprint:EmbeddingFingerprint={provider:`openai-compatible:${endpoint.origin}${endpoint.pathname}`,model:config.model,revision:config.revision,dimensions:config.dimensions};validateFingerprint(fingerprint);
 return{fingerprint:Object.freeze(fingerprint),async embed(texts,signal){
  if(signal?.aborted)throw Error('CANCELLED');if(!texts.length||texts.length>KNOWLEDGE_LIMITS.embeddingBatchSize)throw Error('EMBEDDING_BATCH_INVALID');
  let response:Response;try{response=await fetch(endpoint,{method:'POST',redirect:'error',headers:{'content-type':'application/json',authorization:`Bearer ${config.apiKey}`},body:JSON.stringify({model:config.model,input:texts,dimensions:config.dimensions,encoding_format:'float'}),signal:AbortSignal.any([AbortSignal.timeout(60_000),...(signal?[signal]:[])])});}catch{if(signal?.aborted)throw Error('CANCELLED');throw Error('EMBEDDING_RESULT_UNKNOWN');}
  if(!response.ok)throw Error(`EMBEDDING_HTTP_${response.status}`);
  if(Number(response.headers.get('content-length'))>32_000_000){await response.body?.cancel();throw Error('EMBEDDING_RESPONSE_LIMIT');}
  const reader=response.body?.getReader();if(!reader)throw Error('EMBEDDING_RESPONSE_INVALID');const parts:Uint8Array[]=[];let size=0;try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>32_000_000){await reader.cancel();throw Error('EMBEDDING_RESPONSE_LIMIT');}parts.push(part.value);}}catch(error){if(error instanceof Error&&error.message==='EMBEDDING_RESPONSE_LIMIT')throw error;if(signal?.aborted)throw Error('CANCELLED');throw Error('EMBEDDING_RESULT_UNKNOWN');}finally{reader.releaseLock();}
  const raw=Buffer.concat(parts).toString('utf8');let value:unknown;try{value=JSON.parse(raw);}catch{throw Error('EMBEDDING_RESPONSE_INVALID');}
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('EMBEDDING_RESPONSE_INVALID');const data=value as {model?:unknown;data?:Array<{index?:unknown;embedding?:unknown}>};if(data.model!==config.model)throw Error('EMBEDDING_MODEL_MISMATCH');
  if(!Array.isArray(data.data)||data.data.length!==texts.length)throw Error('EMBEDDING_RESPONSE_INVALID');const vectors:number[][]=[];
  for(const item of data.data){if(!item||typeof item!=='object'||!Number.isInteger(item.index)||Number(item.index)<0||Number(item.index)>=texts.length||vectors[Number(item.index)])throw Error('EMBEDDING_RESPONSE_INVALID');vectors[Number(item.index)]=item.embedding as number[];}
  validateVectors(vectors,texts.length,config.dimensions);return{fingerprint:{...fingerprint},vectors};
 }};
}
