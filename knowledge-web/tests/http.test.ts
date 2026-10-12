import {test} from 'node:test';
import assert from 'node:assert/strict';
import {POST as askRoute} from '../app/api/ask/route';
import {GET as sourceRoute} from '../app/api/sources/[id]/route';
import {GET as listRoute} from '../app/api/knowledge-bases/route';
import {POST as feedbackRoute} from '../app/api/feedback/route';
import {fixtureEnabled} from '../lib/fixture';
const request=(path:string,body?:unknown,token='local-fixture')=>new Request(`http://127.0.0.1${path}`,{method:body?'POST':'GET',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
test('隔离fixture API可问答/查看来源，来源每次重新授权且拒绝旧版',async()=>{
 process.env.KNOWLEDGE_LOCAL_FIXTURE='true';
 try {
  const listed=await listRoute(request('/api/knowledge-bases'));assert.equal(listed.status,200);
  const result=await askRoute(request('/api/ask',{kbId:'fixture-kb',question:'门店地址？'}));assert.equal(result.status,200);const answer=await result.json();assert.equal(answer.status,'supported');
  const source=await sourceRoute(request(answer.sources[0].href),{params:Promise.resolve({id:'fixture-chunk'})});assert.equal(source.status,200);
  const blocked=await sourceRoute(request(answer.sources[0].href,undefined,'wrong'),{params:Promise.resolve({id:'fixture-chunk'})});assert.equal(blocked.status,401);
  const old=await sourceRoute(request('/api/sources/fixture-chunk?version=old'),{params:Promise.resolve({id:'fixture-chunk'})});assert.equal(old.status,404);
  const cross=await askRoute(request('/api/ask',{kbId:'other',question:'地址？'}));assert.equal(cross.status,404);
  const feedback=await feedbackRoute(request('/api/feedback',{receiptId:answer.receiptId,helpful:true}));assert.equal(feedback.status,200);
 } finally {delete process.env.KNOWLEDGE_LOCAL_FIXTURE;}
});
test('开发fixture必须显式启用，Vercel上永远关闭',()=>{process.env.KNOWLEDGE_LOCAL_FIXTURE='true';process.env.VERCEL='1';try{assert.equal(fixtureEnabled(),false);}finally{delete process.env.KNOWLEDGE_LOCAL_FIXTURE;delete process.env.VERCEL;}});
test('无身份请求友好401、no-store，缺配置不泄露内部错误',async()=>{const response=await listRoute(new Request('http://127.0.0.1/api/knowledge-bases'));assert.equal(response.status,401);assert.match(response.headers.get('cache-control')??'',/no-store/);assert.match((await response.json()).error.message,/登录/);});
