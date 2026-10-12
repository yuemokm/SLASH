import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Files} from '../main/files.js';
import {evidenceSearchTerms,searchEvidenceFiles} from '../main/evidence-search.js';
import {createRuntime,type RuntimeOptions} from '../main/agent.js';
import {evidenceSearchRequestSchema} from '../shared/evidence-search.js';
import type {FileRef,Mount} from '../shared/types.js';

const ref=(name:string):FileRef=>({mountId:'m',path:name,size:100});
const reader=(bodies:Record<string,string>)=>({authorized:async()=>{},read:async(file:FileRef)=>{if(!(file.path in bodies))throw Error('暂不支持此文件的文本解析');return bodies[file.path];}});

test('中文多词、无空格分词及中英文混合检索按短语与覆盖排序',async()=>{
 const refs=[ref('unrelated.md'),ref('partial.md'),ref('complete.md'),ref('phrase.md')];
 const input=reader({'unrelated.md':'订单提交','partial.md':'门店画像','complete.md':'门店\n角色与开拓审批','phrase.md':'门店 开拓流程'});
 const result=await searchEvidenceFiles(refs,'门店 开拓',input);
 assert.deepEqual(result.terms,['门店','开拓']);
 assert.deepEqual(result.items.map(hit=>hit.path),['phrase.md','complete.md','partial.md']);
 assert.equal(result.coverage.status,'complete');assert.equal(result.coverage.bodyReadFiles,4);
 assert.deepEqual(evidenceSearchTerms('门店开拓'),['门店','开拓']);
 const mixed=await searchEvidenceFiles([ref('mixed.md')],'门店 POS 费用',reader({'mixed.md':'门店费用规则\nＰＯＳ达成率'}));
 assert.deepEqual(mixed.items[0].matchedTerms,['门店','pos','费用']);
 assert.ok(mixed.items[0].snippet?.includes('ＰＯＳ'));
});

test('长上一行与超长命中行仍提供真实命中片段和正确行号',async()=>{
 const body='前文'.repeat(1500)+'\n'+ 'a'.repeat(3000)+'门店开拓'+'b'.repeat(5000)+'\n后文';
 const result=await searchEvidenceFiles([ref('long.md')],'门店开拓',reader({'long.md':body}));
 const hit=result.items[0];assert.ok(hit.snippet?.includes('门店开拓'));assert.ok(hit.snippet!.length<=400);
 assert.equal(hit.startLine,2);assert.equal(hit.endLine,2);assert.equal(hit.locator,'text-lines:2-2');
 assert.equal(hit.textContentHash,createHash('sha256').update(body).digest('hex'));
 assert.equal(body.includes(hit.snippet!),true);
 const widths='é'.repeat(300)+'\n'+ 'ﬃ'.repeat(200)+'ＰＯＳ 门店';
 const widthHit=(await searchEvidenceFiles([ref('width.md')],'POS',reader({'width.md':widths}))).items[0];
 assert.ok(widthHit.snippet?.includes('ＰＯＳ'));assert.equal(widths.includes(widthHit.snippet!),true);assert.equal(widthHit.endLine,2);
});

test('未支持、过大、损坏来源都报告限制，路径命中不冒充正文已读',async()=>{
 const input={authorized:async()=>{},read:async(file:FileRef)=>{if(file.path.endsWith('xlsx'))throw Error('暂不支持此文件的文本解析');if(file.path==='large.docx')throw Error('文件超过文本读取限制 2 MB');if(file.path==='broken.pdf')throw Error('PDF_PARSE_FAILED: 文件无效');return'没有业务关键词';}};
 const result=await searchEvidenceFiles([ref('网点编码.xlsx'),ref('large.docx'),ref('broken.pdf'),ref('read.md')],'网点编码',input);
 assert.equal(result.coverage.status,'partial');assert.equal(result.coverage.bodyReadFiles,1);assert.equal(result.coverage.skippedFiles,3);
 assert.equal(result.coverage.limitationCount,3);
 assert.deepEqual(result.limitations.map(item=>item.code).sort(),['PDF_PARSE_FAILED','SEARCH_FORMAT_UNSUPPORTED','SEARCH_READ_LIMIT'].sort());
 assert.equal(result.items.length,1);assert.equal(result.items[0].matchKind,'path');assert.equal(result.items[0].textContentHash,undefined);
});

test('扫描文件、正文字符和耗时预算均可区分，诊断有总数和上限',async()=>{
 const refs=Array.from({length:80},(_,index)=>ref(`file-${String(index).padStart(2,'0')}.md`));
 const input={authorized:async()=>{},read:async()=>{throw Error('暂不支持此文件的文本解析');}};
 const limited=await searchEvidenceFiles(refs,'门店',input,{maxFiles:2});
 assert.equal(limited.coverage.scannedFiles,2);assert.equal(limited.coverage.skippedFiles,80);
 assert.equal(limited.coverage.limitationCount,80);assert.equal(limited.limitations.length,50);
 assert.equal(limited.limitations.at(-1)?.code,'SEARCH_LIMITATIONS_TRUNCATED');
 const bodyLimited=await searchEvidenceFiles([ref('a.md'),ref('b.md')],'尾部',reader({'a.md':'前文前文尾部','b.md':'尾部'}),{maxFileCharacters:4,maxTotalCharacters:4});
 assert.equal(bodyLimited.items.length,0);assert.equal(bodyLimited.coverage.bodyReadFiles,0);assert.equal(bodyLimited.coverage.partialBodyFiles,1);assert.equal(bodyLimited.coverage.skippedFiles,1);
 assert.ok(bodyLimited.limitations.some(item=>item.code==='SEARCH_BODY_TRUNCATED'));
 let time=0,reads=0;
 const timed=await searchEvidenceFiles([ref('a.md'),ref('b.md')],'门店',{authorized:async()=>{},clock:()=>time,read:async()=>{reads++;time=5;return'门店';}},{deadlineMs:1});
 assert.equal(reads,1);assert.equal(timed.coverage.status,'partial');assert.ok(timed.limitations.some(item=>item.code==='SEARCH_TIME_LIMIT'));
});

test('结果默认20且显式仍兼容100上限，空查询无需读正文并且排序稳定',async()=>{
 const refs=Array.from({length:130},(_,index)=>ref(`门店-${String(index).padStart(3,'0')}.md`));
 const input={authorized:async()=>{},read:async()=>''};
 const result=await searchEvidenceFiles(refs,'门店',input,{maxResults:10000,maxFiles:1000});
 const reversed=await searchEvidenceFiles(refs.toReversed(),'门店',input,{maxResults:100,maxFiles:1000});
 assert.equal(result.items.length,100);assert.equal(result.coverage.resultTruncated,true);assert.equal(result.coverage.matchedFiles,130);
 assert.deepEqual(result.items.map(item=>item.path),reversed.items.map(item=>item.path));
 const empty=await searchEvidenceFiles(refs,'  ',{authorized:async()=>{},read:async()=>{throw Error('空检索不应读取正文');}});
 assert.equal(empty.items.length,20);assert.equal(empty.coverage.scannedFiles,0);assert.equal(empty.coverage.bodyReadFiles,0);assert.equal(empty.coverage.resultTruncated,true);
});

test('扫描中撤权不返回文件名、片段或该文件的失败诊断',async()=>{
 let enabled=true;
 const authorization=async()=>{if(!enabled)throw Error('PERMISSION_DENIED: 已撤权');};
 const result=await searchEvidenceFiles([ref('秘密门店.md')],'门店',{authorized:authorization,read:async()=>{enabled=false;return'秘密门店内容';}});
 assert.equal(result.items.length,0);assert.equal(result.coverage.status,'partial');assert.equal(JSON.stringify(result).includes('秘密'),false);
 let readCount=0;enabled=true;
 const final=await searchEvidenceFiles([ref('秘密文件.xlsx'),ref('第二份.md')],'门店',{authorized:authorization,read:async(file)=>{readCount++;if(file.path==='秘密文件.xlsx')throw Error('暂不支持此文件的文本解析');enabled=false;return'门店';}});
 assert.ok(readCount>0);assert.equal(JSON.stringify(final).includes('秘密'),false);
});

test('Files实际授权目录检索兼容数组，深度与不可用目录不称complete',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-evidence-'));
 const mounts:Mount[]=[{id:'m',path:dir,name:'参考资料',write:false,enabled:true}];
 const files=new Files(()=>mounts);
 try{
  await fs.writeFile(path.join(dir,'门店.md'),'审批条件\n门店合作后的开拓流程\n必录字段');
  const result=await files.searchEvidence('门店 开拓');assert.equal(result.items.length,1);assert.ok(result.items[0].snippet?.includes('开拓'));
  assert.ok(Array.isArray(await files.search('门店')));
  let deep=dir;for(let index=0;index<14;index++){deep=path.join(deep,'层');await fs.mkdir(deep);}await fs.writeFile(path.join(deep,'门店.md'),'门店');
  const partial=await files.searchEvidence('门店');assert.equal(partial.coverage.status,'partial');assert.equal(partial.coverage.listTruncated,true);assert.ok(partial.limitations.some(item=>item.code==='SEARCH_DEPTH_LIMIT'));
  mounts.push({id:'missing',path:path.join(dir,'不存在'),name:'外部资料',write:false,enabled:true});
  const missing=await files.searchEvidence('门店');assert.ok(missing.limitations.some(item=>item.code==='SEARCH_DIRECTORY_UNAVAILABLE'));
  mounts[0].enabled=false;const revoked=await files.searchEvidence('门店');assert.equal(revoked.items.length,0);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('查询长度和异常配置受到宿主限制',async()=>{
 await assert.rejects(searchEvidenceFiles([], '词'.repeat(501),reader({})),/SEARCH_QUERY_LIMIT/);
 const result=await searchEvidenceFiles([ref('a.md')],'门店',reader({'a.md':'门店'}),{maxResults:NaN,maxFiles:-1,maxFileCharacters:Infinity});
 assert.equal(result.items.length,1);assert.equal(result.coverage.bodyReadFiles,1);
});

test('精确中文文件名首位，默认20与稳定完整分页保留全部真实命中',async()=>{
 const refs=[ref('新增终端流程v2.0.docx'),...Array.from({length:59},(_,index)=>ref(`资料-${String(index).padStart(3,'0')}.md`))],input={authorized:async()=>{},read:async()=> '新增终端流程相关说明'};
 const first=await searchEvidenceFiles(refs,'新增终端流程',input);assert.equal(first.items.length,20);assert.equal(first.items[0].path,'新增终端流程v2.0.docx');assert.equal(first.pagination.nextOffset,20);assert.ok(JSON.stringify(first).length<=16000);assert.equal(first.pagination.responseCharacters,JSON.stringify(first).length);
 const paths=first.items.map(item=>item.path);let page=first;
 while(page.pagination.nextOffset!==null){page=await searchEvidenceFiles(refs.toReversed(),'新增终端流程',input,{offset:page.pagination.nextOffset,resultVersion:first.resultVersion});assert.equal(page.resultVersion,first.resultVersion);paths.push(...page.items.map(item=>item.path));}
 assert.equal(paths.length,60);assert.equal(new Set(paths).size,60);assert.equal(page.coverage.matchedFiles,60);assert.equal(page.coverage.resultTruncated,true);await assert.rejects(searchEvidenceFiles(refs,'新增终端流程',input,{offset:20}),/SEARCH_CURSOR_REQUIRED/);
});
test('scope枚举前限定，只读所选授权mount；非授权及未知参数明确失败',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'slash-search-scope-'));t.after(async()=>{await fs.rm(root,{recursive:true,force:true});});const selected=path.join(root,'selected');await fs.mkdir(selected);await fs.writeFile(path.join(selected,'新增终端流程.md'),'所选目录真实正文');const mounts:Mount[]=[{id:'a-large',path:path.join(root,'must-not-be-enumerated'),name:'其他目录',enabled:true,write:false},{id:'z-selected',path:selected,name:'参考资料',enabled:true,write:false}];const files=new Files(()=>mounts),original=files.resolve.bind(files);const accessed:string[]=[];files.resolve=async(...args)=>{accessed.push(args[0]);if(args[0]==='a-large')throw Error('Should not enumerate another mount');return original(...args);};
 const result=await files.searchEvidence('新增终端流程',{mountId:'z-selected'});assert.equal(result.items.length,1);assert.ok(accessed.length>0);assert.ok(accessed.every(id=>id==='z-selected'));assert.equal(result.coverage.status,'complete');assert.deepEqual(result.scope,{mountId:'z-selected'});assert.equal((await files.search('新增终端流程')).length,1);
 await assert.rejects(files.searchEvidence('',{mountId:'not-authorized'}),error=>{assert.match(String(error),/^UnknownMountIdError: MOUNT_ID_UNKNOWN:/);assert.doesNotMatch(String(error),/可用目标：/);return true;});mounts[1].enabled=false;await assert.rejects(files.searchEvidence('',{mountId:'z-selected'}),/PERMISSION_DENIED/);assert.throws(()=>evidenceSearchRequestSchema.parse({query:'',mountID:'z-selected'}));assert.throws(()=>evidenceSearchRequestSchema.parse({query:'',offset:1}));
});
test('跨页正文/列表/授权变化拒绝旧版本，不泄露撤权文件的路径片段',async()=>{
 const refs=Array.from({length:25},(_,index)=>ref(`秘密门店-${index}.md`)),bodies=Object.fromEntries(refs.map(item=>[item.path,'门店原文']));let allowed=true;const input={...reader(bodies),authorized:async()=>{if(!allowed)throw Error('PERMISSION_DENIED');}};const first=await searchEvidenceFiles(refs,'门店',input);
 bodies[refs[24].path]='门店更新正文';await assert.rejects(searchEvidenceFiles(refs,'门店',input,{offset:20,resultVersion:first.resultVersion}),/SEARCH_RESULTS_CHANGED/);bodies[refs[24].path]='门店原文';await assert.rejects(searchEvidenceFiles(refs.slice(1),'门店',input,{offset:20,resultVersion:first.resultVersion}),/SEARCH_RESULTS_CHANGED/);allowed=false;await assert.rejects(searchEvidenceFiles(refs,'门店',input,{offset:20,resultVersion:first.resultVersion}),/SEARCH_RESULTS_CHANGED/);const current=await searchEvidenceFiles(refs,'门店',input);assert.equal(current.items.length,0);assert.doesNotMatch(JSON.stringify(current),/秘密门店/);
});
test('空查询也冻结实际文件版本；相同长度修改和mount根替换拒绝旧页',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'slash-search-versions-'));t.after(async()=>{await fs.rm(root,{recursive:true,force:true});});for(let index=0;index<25;index++)await fs.writeFile(path.join(root,`${index}.md`),'甲');const mounts:Mount[]=[{id:'m',path:root,name:'资料',enabled:true,write:false}],files=new Files(()=>mounts),first=await files.searchEvidence('');await fs.writeFile(path.join(root,'24.md'),'乙');await assert.rejects(files.searchEvidence('',{offset:20,resultVersion:first.resultVersion}),/SEARCH_RESULTS_CHANGED/);const next=await files.searchEvidence('');mounts[0].write=true;await assert.rejects(files.searchEvidence('',{offset:20,resultVersion:next.resultVersion}),/SEARCH_RESULTS_CHANGED/);
});
test('长路径和大量限制按整个JSON预算保留完整item分页，单项过大明确失败而不跳过',async()=>{
 const refs=Array.from({length:10},(_,index)=>ref('目录/'.repeat(1200)+`门店-${index}.xlsx`));const input={authorized:async()=>{},read:async()=>{throw Error('暂不支持此文件的文本解析');}},first=await searchEvidenceFiles(refs,'门店',input);assert.ok(first.items.length>0&&first.items.length<10);assert.equal(first.coverage.limitationCount,10);assert.ok(JSON.stringify(first).length<=16000);assert.equal(first.pagination.responseCharacters,JSON.stringify(first).length);assert.ok(first.limitations.length<10);let page=first;const paths=first.items.map(item=>item.path);
 while(page.pagination.nextOffset!==null){page=await searchEvidenceFiles(refs,'门店',input,{offset:page.pagination.nextOffset,resultVersion:first.resultVersion});assert.ok(JSON.stringify(page).length<=16000);paths.push(...page.items.map(item=>item.path));}assert.equal(paths.length,10);assert.equal(new Set(paths).size,10);assert.ok(paths.every(p=>refs.some(item=>item.path===p)));
 await assert.rejects(searchEvidenceFiles([ref('目录/'.repeat(10000)+'门店.md')],'门店',input),/SEARCH_ITEM_RESPONSE_LIMIT/);
});
test('真实Pi search_files工具执行mount scope及分页参数，未知参数不被静默忽略',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'slash-search-tool-'));t.after(async()=>{await fs.rm(root,{recursive:true,force:true});});const selected=path.join(root,'selected'),other=path.join(root,'other');await fs.mkdir(selected);await fs.mkdir(other);for(let index=0;index<25;index++)await fs.writeFile(path.join(selected,`门店-${index}.md`),'真实选中目录');await fs.writeFile(path.join(other,'门店秘密.md'),'不属于选中目录');const mounts:Mount[]=[{id:'selected',path:selected,name:'资料',enabled:true,write:false},{id:'other',path:other,name:'其他',enabled:true,write:false}],files=new Files(()=>mounts);
 const runtime=await createRuntime({dir:path.join(root,'agent'),workspaceRoot:root,key:'local-fixture-only',model:{id:'test',baseUrl:'http://127.0.0.1:1/v1',protocol:'openai-completions',contextWindow:65536,maxTokens:1024},files,mounts,connections:[],mode:'plan',runId:'test',listConnections:()=>[],log:async(_name:string,_input:unknown,execute:()=>Promise<unknown>)=>execute(),delta:()=>{}} as unknown as RuntimeOptions);t.after(()=>runtime.dispose());const tool=runtime.agent.state.tools.find(item=>item.name==='search_files')!;
 const call=async(input:unknown)=>JSON.parse(((await tool.execute('search-fixture',input,undefined,undefined,{} as never)).content[0] as {text:string}).text);
 const first=await call({query:'门店',mountId:'selected',limit:5});assert.equal(first.items.length,5);assert.ok(first.items.every((item:FileRef)=>item.mountId==='selected'));const second=await call({query:'门店',mountId:'selected',limit:5,offset:first.pagination.nextOffset,resultVersion:first.resultVersion});assert.equal(second.items.length,5);assert.notEqual(second.items[0].path,first.items[0].path);await assert.rejects(call({query:'门店',mountID:'selected'}));assert.doesNotMatch(JSON.stringify(first),/门店秘密/);
});
