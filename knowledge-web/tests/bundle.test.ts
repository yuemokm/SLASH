import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {prepareBundle} from '../lib/bundle';
import {tokenize} from '../lib/tokenizer';
const sha=(v:string)=>createHash('sha256').update(v).digest('hex');
function bundle() {
 const source={mountId:'private-mount',path:'private-folder/规则.md',displayName:'规则.md'},text='门店定位地址只读。';
 const content={schemaVersion:1,title:'演示',snapshot:{knowledgeBaseId:'kb',projectId:'private-project',indexId:'v1',fingerprint:{provider:'openai-compatible:https://example.invalid/v1/embeddings/',model:'embed',revision:'r1',dimensions:2},createdAt:'2026-10-08T00:00:00Z',coverage:{status:'complete',limitations:[]},documents:[{id:'d1',source,originalHash:sha(text),textHash:sha(text),versionId:'rev1',parserVersion:'parser1',coverage:{status:'complete',limitations:[]}}],chunks:[{id:'c1',documentId:'d1',source,indexId:'v1',text,textHash:sha(text),locator:{kind:'lines',startLine:1,endLine:1,startCharacter:0,endCharacter:text.length},embedding:[1,0]}]}};
 return {...content,manifestHash:sha(JSON.stringify(content))};
}
test('兼容desktop精确manifest算法并剥离本机路径/项目/mount信息',()=>{const p=prepareBundle(bundle()),cloud=JSON.stringify(p.payload);for(const value of ['private-mount','private-folder','private-project','originalSource','mountId'])assert.ok(!cloud.includes(value));assert.equal(p.payload.documents[0].display_name,'规则.md');assert.equal(p.configuration.EMBEDDING_ENDPOINT,'https://example.invalid/v1/embeddings/');});
test('篡改包哈希拒绝',()=>{const b=bundle();b.snapshot.chunks[0].text='篡改';assert.throws(()=>prepareBundle(b),/校验不通过/);});
test('重新计算manifest也不能绕过正文哈希/向量维度约束',()=>{for(const mutate of [(b:ReturnType<typeof bundle>)=>b.snapshot.chunks[0].text='篡改',(b:ReturnType<typeof bundle>)=>b.snapshot.chunks[0].embedding=[1]]){const b=bundle();mutate(b);b.manifestHash=sha(JSON.stringify({schemaVersion:1,title:b.title,snapshot:b.snapshot}));assert.throws(()=>prepareBundle(b));}});
test('中文bigram对资料和问题使用同一分词，保留英文业务词',()=>{assert.equal(tokenize('门店地址 API'),'门店 店地 地址 api');assert.ok(tokenize('地址由谁维护').includes('地址'));});
