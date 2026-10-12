import { readFile,writeFile,mkdir,stat,rename,unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { prepareBundle } from '../lib/bundle';
import { endpoint, required } from '../lib/config';
import { validId } from '../lib/contracts';
import {receiptMatchesOperation, type PublicationIntent, type PublicationReceipt} from '../lib/publication';
const args=process.argv.slice(2);
const flag=(name:string)=>args.includes(name);
const option=(name:string)=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
async function confirmJournal(file:string,value:unknown) {
  const temporary=`${file}.${randomUUID()}.tmp`;
  try {await writeFile(temporary,JSON.stringify(value,null,2),{flag:'wx',mode:0o600});await rename(temporary,file);}
  finally {await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
}
async function main() {
  if(flag('--help')) {console.log('Preview: publish:bundle -- --bundle <file>\nPublish: add --commit --operation <UUID> --members <UUID,UUID> --expected-active <index|none>\nReconcile unknown: --reconcile --operation <UUID>\nStop sharing: --revoke <kbId> --commit --operation <UUID> --expected-active <index>\nNo automatic retry. No deployment or cloud project creation.');return;}
  const operation=option('--operation'),revoke=option('--revoke'),reconcile=flag('--reconcile');
  let prepared:ReturnType<typeof prepareBundle>|undefined;
  if(!revoke&&!reconcile){const file=option('--bundle');if(!file)throw Error('请指定 --bundle。');if((await stat(file)).size>40000000)throw Error('发布包超过本机读取限制。');prepared=prepareBundle(JSON.parse(await readFile(file,'utf8')));console.log(JSON.stringify({preview:prepared.summary,serverConfiguration:prepared.configuration},null,2));}
  if(!flag('--commit')&&!reconcile)return;
  if(!operation||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(operation))throw Error('显式发布/核对须提供 --operation UUID。');
  if(revoke&&!validId(revoke))throw Error('知识库编号不正确。');
  const expected=option('--expected-active'),members=[...new Set((option('--members')??'').split(',').filter(Boolean).map(m=>m.toLowerCase()))].sort();
  if(!reconcile&&!expected)throw Error('请明确 --expected-active <index|none>，避免覆盖已变化的发布版本。');
  if(!reconcile&&!revoke&&(!members.length||members.some(m=>!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(m))))throw Error('发布必须明确 --members 已有Auth用户UUID；不会自动创建账号。');
  const intent={action:revoke?'revoke' as const:'publish' as const,kbId:revoke??prepared?.payload.kb_id??'',indexId:prepared?.payload.index_id,manifestHash:prepared?.payload.manifest_hash,expectedActive:expected==='none'?null:expected,memberIds:revoke?undefined:members};
  const targetUrl=new URL(endpoint(process.env,'NEXT_PUBLIC_SUPABASE_URL'));
  if(targetUrl.pathname!=='/'||targetUrl.port)throw Error('发布目标必须是已核对的Supabase HTTPS项目基础地址。');
  const target=targetUrl.origin;
  const client=createClient(target,required(process.env,'SUPABASE_DEPLOYER_SECRET_KEY'),{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(90000),redirect:'error'})}});
  const directory=path.resolve('.publication-receipts');await mkdir(directory,{recursive:true});const journal=path.join(directory,`${operation}.json`);
  type Journal={schemaVersion:1;target:string;operation:string;intent:PublicationIntent;status:'unknown'|'confirmed';receipt?:PublicationReceipt};
  let prior:Journal|null=null;try{prior=JSON.parse(await readFile(journal,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  if(prior && (prior.schemaVersion!==1||prior.target!==target||prior.operation!==operation||!prior.intent))throw Error('本机回执的目标不同或缺少目标登记；请保留原文件，在原目标人工核对，未发出写请求。');
  if(reconcile&&!prior)throw Error('未找到此操作的本机目标及意图登记，不能把任意远端回执当作本次确认。');
  const {data:remote,error:readError}=await client.from('knowledge_publications').select('operation_id,kb_id,index_id,manifest_hash,action,expected_active,member_ids,created_at').eq('operation_id',operation).maybeSingle();
  if(readError)throw Error('发布记录查询失败，未发出写请求。');
  if(remote){
    if(!reconcile && !receiptMatchesOperation(remote,operation,intent))throw Error('同一operation已绑定其它内容、成员或操作，拒绝确认。');
    if(prior && !receiptMatchesOperation(remote,operation,prior.intent))throw Error('远端回执与本机登记内容不一致，须人工核对。');
    await confirmJournal(journal,{schemaVersion:1,target,operation,intent:prior?.intent??intent,status:'confirmed',receipt:remote});console.log(JSON.stringify({status:'confirmed',target,receipt:remote}));return;
  }
  if(reconcile){console.log(JSON.stringify({status:'unknown',message:'远端暂无回执，不自动重发。核对目标和进行中的请求后再由维护者决定。'}));return;}
  if(prior)throw Error('此操作已在本机登记，但远端尚无确认；先用 --reconcile 核对，不能重复发送。');
  // Persist unknown BEFORE sending; crash/timeout can never silently become a new request.
  await writeFile(journal,JSON.stringify({schemaVersion:1,target,operation,status:'unknown',intent},null,2),{flag:'wx',mode:0o600});
  const result=revoke ? await client.rpc('knowledge_revoke',{p_operation:operation,p_kb:revoke,p_expected_active:expected==='none'?null:expected}) : await client.rpc('knowledge_publish',{p_operation:operation,p_expected_active:expected==='none'?null:expected,p_bundle:prepared!.payload,p_members:members});
  if(result.error||!receiptMatchesOperation(result.data,operation,intent))throw Error('发布未取得匹配确认。状态保留为unknown，请核对回执，不自动重发。');
  await confirmJournal(journal,{schemaVersion:1,target,operation,intent,status:'confirmed',receipt:result.data});console.log(JSON.stringify({status:'confirmed',target,receipt:result.data}));
}
main().catch(e=>{console.error(e instanceof Error?e.message:'发布准备失败。');process.exitCode=1;});
