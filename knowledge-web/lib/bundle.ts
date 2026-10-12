import { createHash } from 'node:crypto';
import type { KnowledgeExportBundle } from '../../shared/knowledge-base.js';
import { fingerprintOf } from './config.ts';
import { ApiError, TOKENIZER_VERSION, validId, validateVector } from './contracts.ts';
import { tokenize } from './tokenizer.ts';
const sha=(text:string)=>createHash('sha256').update(text).digest('hex');
const fail=()=>{throw new ApiError(400,'INVALID_BUNDLE','发布包的结构、版本或正文校验不通过。');};
const text=(v:unknown,max=300):v is string=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
const hash=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
function coverage(v:unknown) {
  const c=v as {status?:unknown;limitations?:unknown};
  if(!c||!['complete','partial'].includes(String(c.status))||!Array.isArray(c.limitations)||c.limitations.length>100||!c.limitations.every(x=>text(x,2000)))fail();
  return {status:c.status,limitations:c.limitations};
}
function displayName(source:{path:string;displayName?:string}) {
  if(!source||!text(source.path,4096)||/^(?:[a-z]:|[\\/])/i.test(source.path)||source.path.split(/[\\/]/).includes('..'))return fail();
  return (source.displayName??source.path).split(/[\\/]/).pop()!.slice(0,200);
}
export function prepareBundle(raw:unknown) {
  const bundle=raw as KnowledgeExportBundle;
  if(!bundle||bundle.schemaVersion!==1||!text(bundle.title,200)||!hash(bundle.manifestHash)||!bundle.snapshot)fail();
  const {snapshot:s}=bundle;
  if(sha(JSON.stringify({schemaVersion:1,title:bundle.title,snapshot:s}))!==bundle.manifestHash)fail();
  const f=s.fingerprint;
  if(!validId(s.knowledgeBaseId)||!validId(s.indexId)||!f||!text(f.provider)||!text(f.model)||!text(f.revision)||!Number.isInteger(f.dimensions)||f.dimensions<1||f.dimensions>8192)fail();
  if(!f.provider.startsWith('openai-compatible:'))throw new ApiError(400,'UNSUPPORTED_PROVIDER','当前发布器只接入明确配置的OpenAI兼容向量接口。');
  let endpoint:URL;try{endpoint=new URL(f.provider.slice('openai-compatible:'.length));}catch{return fail();}
  if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.search||endpoint.hash)throw new ApiError(400,'ENDPOINT_NOT_DEPLOYABLE','云查询必须使用无凭据的HTTPS向量接口；本机HTTP索引仅供本机测试。');
  if(f.provider!==`openai-compatible:${endpoint.origin}${endpoint.pathname}`)fail();
  if(!Array.isArray(s.documents)||!s.documents.length||s.documents.length>100||!Array.isArray(s.chunks)||!s.chunks.length||s.chunks.length>10000||s.chunks.length*f.dimensions>4000000)fail();
  const documents=s.documents.map(d=>{
    if(!validId(d.id)||!text(d.versionId)||!text(d.parserVersion)||!hash(d.originalHash)||!hash(d.textHash)||d.extractedHash&&!hash(d.extractedHash))fail();
    return {id:d.id,display_name:displayName(d.source),source_version:d.versionId,original_hash:d.originalHash,extracted_hash:d.extractedHash??null,text_hash:d.textHash,parser_version:d.parserVersion,coverage:coverage(d.coverage)};
  });
  const docs=new Map(documents.map(d=>[d.id,d]));if(docs.size!==documents.length)fail();
  const chunkIds=new Set<string>();
  const chunks=s.chunks.map(c=>{
    const d=docs.get(c.documentId),l=c.locator;
    if(!validId(c.id)||chunkIds.has(c.id)||!d||c.indexId!==s.indexId||!text(c.text,8000)||sha(c.text)!==c.textHash||!l||!['lines','table_row'].includes(l.kind)||![l.startLine,l.endLine,l.startCharacter,l.endCharacter].every(Number.isInteger)||l.startLine<1||l.endLine<l.startLine||l.startCharacter<0||l.endCharacter<l.startCharacter)fail();
    validateVector(c.embedding,f.dimensions);chunkIds.add(c.id);
    // Whitelist cloud metadata. No mountId, projectId, source path, endpoint credentials or originalSource.
    const locator={kind:l.kind,startLine:l.startLine,endLine:l.endLine,startCharacter:l.startCharacter,endCharacter:l.endCharacter,...(typeof l.heading==='string'?{heading:l.heading.slice(0,300)}:{}),...(Number.isInteger(l.row)?{row:l.row}:{}),...(Number.isInteger(l.headerLine)?{headerLine:l.headerLine}:{})};
    return {id:c.id,document_id:c.documentId,text:c.text,text_hash:c.textHash,display_name:d!.display_name,source_version:d!.source_version,locator,embedding:c.embedding,keywords:tokenize(c.text)};
  });
  const payload={kb_id:s.knowledgeBaseId,index_id:s.indexId,title:bundle.title,manifest_hash:bundle.manifestHash,fingerprint:fingerprintOf(f),dimensions:f.dimensions,tokenizer_version:TOKENIZER_VERSION,coverage:coverage(s.coverage),documents,chunks};
  if(Buffer.byteLength(JSON.stringify(payload))>3000000)throw new ApiError(400,'BUNDLE_TOO_LARGE','首版事务发布限制为3MB，请缩小本次资料集合。');
  return {payload,configuration:{EMBEDDING_ENDPOINT:endpoint.origin+endpoint.pathname,EMBEDDING_MODEL:f.model,EMBEDDING_REVISION:f.revision,EMBEDDING_DIMENSIONS:String(f.dimensions)},summary:{knowledgeBaseId:s.knowledgeBaseId,indexId:s.indexId,documents:documents.length,chunks:chunks.length,coverage:s.coverage.status,manifestHash:bundle.manifestHash}};
}
