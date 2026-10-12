import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ask,bindAnswer} from '../lib/qa';
import {parseQuestion,validateVector,type Repository,type Providers,type Hit,TOKENIZER_VERSION} from '../lib/contracts';
const hit:Hit={id:'c1',kb_id:'kb',index_id:'v1',document_id:'d1',text:'门店定位地址只读。',text_hash:'hash',display_name:'规则',source_version:'r1',locator:{kind:'lines',startLine:1,endLine:1},similarity:.9,keyword_rank:null};
function setup() {
  const calls={embed:0,answer:0,receipt:0};
  const repo:Repository={async getBase(){return {id:'kb',title:'规则',active_version:'v1',sharing_enabled:true};},async getIndex(){return {id:'v1',kb_id:'kb',status:'published',fingerprint:'fp',embedding_dimensions:2,tokenizer_version:TOKENIZER_VERSION};},async search(){return [hit];},async revalidate(){return true;},async saveReceipt(){calls.receipt++;return 'receipt';}};
  const providers:Providers={fingerprint:'fp',dimensions:2,model:'fixture',minSimilarity:.7,async embed(){calls.embed++;return [1,0];},async answer(){calls.answer++;return {status:'supported',paragraphs:[{text:'地址只读。',sourceIds:['c1']}]};}};
  return {repo,providers,calls};
}
test('答案引用仅绑定此次命中、已发布版本和来源接口',async()=>{const {repo,providers}=setup();const answer=await ask(repo,providers,'kb','地址？');assert.equal(answer.status,'supported');assert.equal(answer.sources[0].sourceVersion,'r1');assert.equal(answer.sources[0].href,'/api/sources/c1?version=v1');});
test('跨库或未分享在embedding前拒绝',async()=>{const {repo,providers,calls}=setup();repo.getBase=async()=>null;await assert.rejects(ask(repo,providers,'other','问题'),/访问权限/);assert.equal(calls.embed,0);});
test('索引模型或维度不同不允许查询',async()=>{const {repo,providers,calls}=setup();providers.fingerprint='other';await assert.rejects(ask(repo,providers,'kb','问题'),/配置不一致/);assert.equal(calls.embed,0);});
test('旧版/跨库命中阻止回答',async()=>{const {repo,providers,calls}=setup();repo.search=async()=>[{...hit,index_id:'old'}];await assert.rejects(ask(repo,providers,'kb','问题'),/版本不正确/);assert.equal(calls.answer,0);});
test('无检索依据不调用回答模型且无虚构引用',async()=>{const {repo,providers,calls}=setup();repo.search=async()=>[];const a=await ask(repo,providers,'kb','未知');assert.equal(a.status,'insufficient');assert.deepEqual(a.sources,[]);assert.equal(calls.answer,0);});
test('低相似度且无关键词命中被丢弃',async()=>{const {repo,providers,calls}=setup();repo.search=async()=>[{...hit,similarity:.1}];assert.equal((await ask(repo,providers,'kb','问题')).status,'insufficient');assert.equal(calls.answer,0);});
test('模型完成期间撤权或切换版本阻止返回/回执',async()=>{const {repo,providers,calls}=setup();repo.revalidate=async()=>false;await assert.rejects(ask(repo,providers,'kb','问题'),/权限已变化/);assert.equal(calls.receipt,0);});
test('伪造引用与无引用结论拒绝',()=>{assert.throws(()=>bindAnswer({status:'supported',paragraphs:[{text:'无凭据',sourceIds:['made-up']}]},[hit]),/未经本次检索/);assert.throws(()=>bindAnswer({status:'supported',paragraphs:[{text:'结论',sourceIds:[]}]},[hit]),/未经本次检索/);});
test('冲突回答须至少两处真实引用并显示未裁决提示',()=>{assert.throws(()=>bindAnswer({status:'conflict',paragraphs:[{text:'冲突',sourceIds:['c1']}]},[hit]),/至少两处/);const a=bindAnswer({status:'conflict',paragraphs:[{text:'甲',sourceIds:['c1']},{text:'乙',sourceIds:['c2']}]},[hit,{...hit,id:'c2'}]);assert.match(a.paragraphs[0].text,/无法确认/);});
test('接口只接收问题和库ID，拒绝端点/SQL/工具注入参数',()=>{assert.deepEqual(parseQuestion({kbId:'kb',question:' 问题 '}),{kbId:'kb',question:'问题'});for(const extra of ['sql','endpoint','tools','path'])assert.throws(()=>parseQuestion({kbId:'kb',question:'q',[extra]:'arbitrary'}));assert.throws(()=>parseQuestion({kbId:'kb',question:'x'.repeat(2001)}));});
test('向量拒绝错误维度、零向量、无穷数值',()=>{for(const vector of [[1],[0,0],[NaN,1],[Infinity,1]])assert.throws(()=>validateVector(vector,2));});
test('用户取消后不继续回答或写回执，signal传给向量服务',async()=>{const {repo,providers,calls}=setup();const controller=new AbortController();providers.embed=async(_q,signal)=>{assert.equal(signal,controller.signal);controller.abort();return [1,0];};await assert.rejects(ask(repo,providers,'kb','地址',controller.signal),/已取消/);assert.equal(calls.answer,0);assert.equal(calls.receipt,0);});
