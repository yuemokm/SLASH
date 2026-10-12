import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { createProviders } from '../lib/providers.ts';
import { endpoint, required, modelConfig } from '../lib/config.ts';
import { prepareBundle } from '../lib/bundle.ts';
import { receiptMatchesOperation } from '../lib/publication.ts';
import { smokeWebTarget } from './smoke-target.ts';

// Explicitly authorized integration ONLY. Synthetic content, one generated
// confirmed test account, max three model requests (1 here + embed/answer via web).
// No automatic retry; cleanup only rows matching the generated knowledge-base id.
if (!process.argv.includes('--commit')) throw Error('Cloud writes require --commit after verifying the environment target.');
const target = endpoint(process.env, 'NEXT_PUBLIC_SUPABASE_URL');
const webTarget=smokeWebTarget(process.env,process.argv.includes('--local-web'));
const web=webTarget.url;
const uuid = randomUUID(), kbId = `smoke-${uuid}`, indexId = `smoke-index-${uuid}`;
const email = `knowledge-smoke-${uuid}@example.invalid`, password = `${randomBytes(30).toString('base64url')}Aa1!`;
const directory = path.resolve('test-results', `${webTarget.mode==='hosted'?'cloud':'local-production'}-${uuid}`);
await mkdir(directory, { recursive: true });
const evidence: { target:string;web:string;webMode:'hosted'|'local-production';cloudWebAvailabilityVerified:boolean;kbId:string;indexId:string;synthetic:boolean;status:string;checks:string[];cleanup:string[];cleanupError?:{step:string;code:string;httpStatus?:number;category:'api'|'exception'};http:Array<{route:string;status:number;appCode?:string;diagnostic?:{stage:string;reason:string;upstreamStatus?:number}}>;answer?:{status?:string;sourceCount:number;paragraphs:string[]};userId?:string;operation?:string;failureStage?:string;failureCode?:string } = { target, web, webMode:webTarget.mode,cloudWebAvailabilityVerified:false,kbId, indexId, synthetic:true, status:'preparing', checks:[], cleanup:[],http:[] };
const save = () => writeFile(path.join(directory, 'result.json'), JSON.stringify(evidence, null, 2));
const timedFetch: typeof fetch = (url, init) => fetch(url, { ...init, redirect:'error', signal: AbortSignal.any([AbortSignal.timeout(90000), ...(init?.signal ? [init.signal] : [])]) });
const options = { auth:{persistSession:false, autoRefreshToken:false, detectSessionInUrl:false}, global:{fetch:timedFetch} };
const admin = createClient(target, required(process.env,'SUPABASE_DEPLOYER_SECRET_KEY'), options);
const runtime = createClient(target, required(process.env,'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'), options);
let stage='configuration', userCreationSent=false, publicationSent=false, publicationConfirmed=false;
const safeCode=(error:unknown)=>{const code=(error as {code?:unknown})?.code;return typeof code==='string'&&/^[A-Z0-9_]{1,80}$/i.test(code)?code:undefined;};
const checked = <R extends {data:unknown;error:unknown}>(value:R):R['data'] => { if(value.error){
  const code=safeCode(value.error);
  if(stage.startsWith('cleanup.')) {
    const status=(value as {status?:unknown}).status;
    evidence.cleanupError={step:stage,code:code??'CLEANUP_API_ERROR',category:'api',...(typeof status==='number'&&Number.isInteger(status)&&status>=100&&status<=599?{httpStatus:status}:{})};
  } else evidence.failureCode=code;
  throw Error(stage);
}return value.data; };
async function webApi(route:string, token:string, body?:unknown) {
  const response = await timedFetch(`${web}${route}`, { method:body?'POST':'GET', headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'}, ...(body?{body:JSON.stringify(body)}:{}) });
  let value;try {value=await response.json();}catch {evidence.http.push({route:route.split('?')[0],status:response.status,appCode:'NON_JSON_RESPONSE'});throw Error(stage);}
  const d=value.error?.diagnostic;
  const diagnostic=d&&['embedding','answer'].includes(d.stage)&&['http','timeout','network','invalid_json','response_too_large'].includes(d.reason)?{stage:d.stage,reason:d.reason,...(Number.isInteger(d.upstreamStatus)&&d.upstreamStatus>=100&&d.upstreamStatus<=599?{upstreamStatus:d.upstreamStatus}:{})}:undefined;
  evidence.http.push({route:route.split('?')[0],status:response.status,...(safeCode(value.error)?{appCode:safeCode(value.error)}:{}),...(diagnostic?{diagnostic}:{})});
  return {status:response.status,value};
}
try {
  const providers = createProviders(process.env);
  const configuration = modelConfig(process.env);
  if (configuration.embeddingModel!=='BAAI/bge-m3'||providers.dimensions!==1024||providers.model!=='GLM-5.3-Flash') throw Error('Model identity must match the explicitly selected cloud smoke configuration.');
  const text='合成验收规则：海棠测试门店的门店定位地址为只读字段，由系统定位生成；图商地址由门店管理员维护。本规则仅供云端链路验收。';
  const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
  const source={mountId:'synthetic-only',path:'synthetic/rules.md',displayName:'合成验收规则'};
  stage='synthetic embedding'; const embedding = await providers.embed(text);
  evidence.checks.push('real embedding: BAAI/bge-m3, 1024 dimensions');
  const base={schemaVersion:1,title:'合成云端链路验收',snapshot:{knowledgeBaseId:kbId,projectId:'synthetic-only',indexId,fingerprint:{provider:`openai-compatible:${configuration.embeddingUrl}`,model:configuration.embeddingModel,revision:required(process.env,'EMBEDDING_REVISION'),dimensions:providers.dimensions},createdAt:new Date().toISOString(),coverage:{status:'complete',limitations:[]},documents:[{id:'synthetic-doc',source,originalHash:sha(text),textHash:sha(text),versionId:'synthetic-v1',parserVersion:'synthetic-v1',coverage:{status:'complete',limitations:[]}}],chunks:[{id:'synthetic-chunk',documentId:'synthetic-doc',source,indexId,text,textHash:sha(text),locator:{kind:'lines',startLine:1,endLine:1,startCharacter:0,endCharacter:text.length},embedding}]}};
  const prepared=prepareBundle({...base,manifestHash:sha(JSON.stringify(base))});
  stage='temporary account creation'; userCreationSent=true;
  const created=checked(await admin.auth.admin.createUser({email,password,email_confirm:true}));
  if(!created.user)throw Error(stage); evidence.userId=created.user.id; await save();
  const operation=randomUUID(), members=[created.user.id]; evidence.operation=operation;evidence.status='publication-unknown'; await save();
  stage='synthetic publication'; publicationSent=true;
  const receipt=checked(await admin.rpc('knowledge_publish',{p_operation:operation,p_expected_active:null,p_bundle:prepared.payload,p_members:members}));
  if(!receiptMatchesOperation(receipt,operation,{action:'publish',kbId,indexId,manifestHash:prepared.payload.manifest_hash,expectedActive:null,memberIds:members}))throw Error(stage);
  publicationConfirmed=true;
  evidence.checks.push('real publish RPC receipt matches operation, manifest, members and active version');
  stage='temporary account login';
  const signedIn=checked(await runtime.auth.signInWithPassword({email,password}));
  if(!signedIn.session)throw Error(stage);const token=signedIn.session.access_token;
  stage='authorized collection';const listed=await webApi('/api/knowledge-bases',token);
  if(listed.status!==200||!listed.value.bases?.some((base:{id:string})=>base.id===kbId))throw Error(stage);
  stage=webTarget.mode==='hosted'?'hosted question':'local production question';const answered=await webApi('/api/ask',token,{kbId,question:'海棠测试门店的图商地址由谁维护？'});
  evidence.answer={status:typeof answered.value.status==='string'?answered.value.status:undefined,sourceCount:Array.isArray(answered.value.sources)?answered.value.sources.length:0,paragraphs:Array.isArray(answered.value.paragraphs)?answered.value.paragraphs.slice(0,3).map((paragraph:{text?:unknown})=>typeof paragraph.text==='string'?paragraph.text.slice(0,600):''):[]};
  if(answered.status!==200||answered.value.status!=='supported'||!answered.value.sources?.length||!answered.value.paragraphs?.some((paragraph:{text:string})=>paragraph.text.includes('管理员')))throw Error(stage);
  evidence.checks.push(`real ${webTarget.mode} embedding + GLM-5.3-Flash supported answer references synthetic snapshot`);
  stage='authorized citation';const citation=answered.value.sources[0];
  if(typeof citation.href!=='string'||!citation.href.startsWith('/api/sources/')||citation.indexVersion!==indexId)throw Error(stage);
  const sourceResult=await webApi(citation.href,token);
  if(sourceResult.status!==200||sourceResult.value.source?.text!==text)throw Error(stage);
  evidence.checks.push('real source API revalidates authorized snapshot and exact synthetic text');
  stage='sharing revoke';const revoked=checked(await admin.rpc('knowledge_revoke',{p_operation:randomUUID(),p_kb:kbId,p_expected_active:indexId}));
  if(revoked.action!=='revoke'||revoked.kb_id!==kbId)throw Error(stage);
  const hidden=await webApi(citation.href,token), hiddenBases=await webApi('/api/knowledge-bases',token);
  if(hidden.status!==404||hiddenBases.status!==200||hiddenBases.value.bases?.some((base:{id:string})=>base.id===kbId))throw Error(stage);
  evidence.checks.push('revoke hides citation and collection with the same still-valid user JWT');
  evidence.status='passed';
  evidence.cloudWebAvailabilityVerified=webTarget.mode==='hosted';
} catch(error) {
  evidence.status='failed';evidence.failureStage=stage;evidence.failureCode??=safeCode(error);process.exitCode=1;
} finally {
  try {
    stage='cleanup.prepare';
    if(publicationSent) {
      if(!publicationConfirmed) {
        stage='cleanup.reconcile.knowledge_publications';
        const original=checked(await admin.from('knowledge_publications').select('operation_id,kb_id,index_id').eq('operation_id',evidence.operation!).maybeSingle());
        // No receipt is still unknown, not proof of failure. Preserve the
        // account/ids for an operator; do not race a possibly running publish.
        if(!original||original.kb_id!==kbId||original.index_id!==indexId)throw Error('publication outcome still unknown');
      }
      stage='cleanup.select.knowledge_answers';
      const rows=checked(await admin.from('knowledge_answers').select('id').eq('kb_id',kbId))??[];
      if(rows.length){stage='cleanup.delete.knowledge_feedback';checked(await admin.from('knowledge_feedback').delete().in('receipt_id',rows.map(row=>row.id)));evidence.cleanup.push('synthetic feedback delete request completed');}
      for(const table of ['knowledge_answers','knowledge_chunks','knowledge_documents','knowledge_members','knowledge_publications']){stage=`cleanup.delete.${table}`;checked(await admin.from(table).delete().eq('kb_id',kbId));evidence.cleanup.push(`synthetic ${table} delete request completed`);}
      stage='cleanup.update.knowledge_bases';
      checked(await admin.from('knowledge_bases').update({active_version:null,sharing_enabled:false}).eq('id',kbId));
      stage='cleanup.delete.knowledge_indexes';
      checked(await admin.from('knowledge_indexes').delete().eq('kb_id',kbId));
      stage='cleanup.delete.knowledge_bases';
      checked(await admin.from('knowledge_bases').delete().eq('id',kbId));
      for(const table of ['knowledge_indexes','knowledge_publications','knowledge_answers']){stage=`cleanup.verify.${table}`;if((checked(await admin.from(table).select('kb_id').eq('kb_id',kbId))??[]).length)throw Object.assign(Error(stage),{code:'CLEANUP_ROWS_REMAIN'});}
      evidence.cleanup.push('only this synthetic knowledge-base rows removed and checked');
    }
    if(userCreationSent&&!evidence.userId) {
      // A create timeout is an unknown outcome: reconcile by the exact random
      // email before deleting, never create a second account automatically.
      let reconciled=false;
      stage='cleanup.reconcile.auth_users';
      for(let page=1;page<=10;page++) {const users=checked(await admin.auth.admin.listUsers({page,perPage:1000}));const user=users.users.find(user=>user.email===email);if(user){evidence.userId=user.id;reconciled=true;break;}if(users.users.length<1000){reconciled=true;break;}}
      if(!reconciled)throw Error(stage);
    }
    if(evidence.userId){stage='cleanup.delete.auth_user';checked(await admin.auth.admin.deleteUser(evidence.userId));evidence.cleanup.push('only this generated test account removed');}
  } catch(error) {
    evidence.cleanupError??={step:stage,code:safeCode(error)??(error instanceof TypeError?'TYPE_ERROR':error instanceof Error&&error.name==='TimeoutError'?'TIMEOUT':'CLEANUP_EXCEPTION'),category:'exception'};
    evidence.status='cleanup-incomplete';evidence.failureStage=stage;process.exitCode=1;
  }
  await save();
  console.log(JSON.stringify({evidenceFile:path.join(directory,'result.json'),...evidence},null,2));
}
