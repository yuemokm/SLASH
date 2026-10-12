import {test} from 'node:test';
import assert from 'node:assert/strict';
import {smokeWebTarget} from '../scripts/smoke-target.ts';

test('本机生产烟测必须显式启用且只接受loopback HTTP，云默认仍强制HTTPS',()=>{
  const env=(url:string):NodeJS.ProcessEnv=>({NODE_ENV:'test',KNOWLEDGE_SMOKE_WEB_URL:url});
  assert.deepEqual(smokeWebTarget(env('http://127.0.0.1:3210/'),true),{url:'http://127.0.0.1:3210',mode:'local-production'});
  assert.equal(smokeWebTarget(env('http://localhost:3210'),true).mode,'local-production');
  assert.equal(smokeWebTarget(env('https://example.invalid')).mode,'hosted');
  assert.throws(()=>smokeWebTarget(env('http://127.0.0.1:3210')));
  for(const url of ['http://example.invalid','http://localhost.evil:3210','http://127.0.0.2:3210','https://localhost:3210','http://user:password@localhost:3210','http://localhost:3210/path','http://localhost:3210/?secret=x','http://localhost:3210/#x'])assert.throws(()=>smokeWebTarget(env(url),true));
});
