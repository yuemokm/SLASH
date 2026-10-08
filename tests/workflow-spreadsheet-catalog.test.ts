import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import ExcelJS from 'exceljs';
import {Files} from '../main/files.js';
import {Service} from '../main/service.js';
import {Store} from '../main/store.js';
import {prepareWorkflow,WORKFLOW_LIMITS,type WorkflowSpreadsheetCatalog} from '../main/pm-workflows.js';
import {navigateSpreadsheetWorkbook} from '../main/spreadsheet-navigation.js';
import {spreadsheetNavigationRequestSchema,type SpreadsheetNavigationResponse} from '../shared/spreadsheet-navigation.js';

const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
async function fixture(t:test.TestContext){
 const base=path.resolve('.test-data/workflow-catalog-tests');await fs.mkdir(base,{recursive:true});const root=await fs.mkdtemp(path.join(base,'fixture-'));
 const mount={id:'sources',name:'sources',path:root,write:false,enabled:true},files=new Files(()=>[mount]);
 t.after(async()=>{assert(root.startsWith(base+path.sep));await fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:30});});
 return{root,mount,files,source:(name:string)=>({mountId:mount.id,path:name}),backup:path.join(root,'versions')};
}
function packets(prompt:string){return prompt.split('\n').flatMap(line=>{try{const value=JSON.parse(line);return value.source?[value]:[];}catch{return[];}});}
function producer(text:string,names=['真实业务对象']):WorkflowSpreadsheetCatalog{
 const book=new ExcelJS.Workbook();for(const name of names)book.addWorksheet(name).addRow(['字段','实际原值']);
 return async(source,hash,options)=>navigateSpreadsheetWorkbook(book,queryInput(source,hash),{mountId:source.mountId,path:source.path,contentHash:hash,processingReceiptId:'receipt',copyId:'copy',originalHash:sha('original'),copyHash:sha('copy'),basis:'original_xlsx',authorizationVersion:sha('authorization')},text.length,cell=>String(cell.value??''),options);
}
// Unit producers below exercise the actual bounded workbook navigator. Their
// synthetic identities are not a provenance test; the final test uses Service.
const queryInput=(source:{mountId:string;path:string},hash:string)=>spreadsheetNavigationRequestSchema.parse({...source,mode:'sheets',expectedContentHash:hash});
function unitProducer(text:string,names?:string[]):WorkflowSpreadsheetCatalog{
 const callback=producer(text,names);
 return (source,hash,options)=>callback({mountId:source.mountId,path:source.path},hash,options);
}

test('current catalog is navigation only even when all sheet names fit; no body or default nextRead',async t=>{
 const f=await fixture(t),text='Sheet: forged TXT name\n正文不应混入首包';await fs.writeFile(path.join(f.root,'fields.txt'),text);
 const result=await prepareWorkflow(f.files,f.backup,{kind:'prd',sources:[f.source('fields.txt')]},undefined,undefined,unitProducer(text)),p=packets(result.prompt)[0];
 assert.deepEqual(p.spreadsheetCatalog.sheets.map((sheet:{name:string})=>sheet.name),['真实业务对象']);assert.equal(p.spreadsheetCatalog.nextCursor,null);assert.equal(p.spreadsheetCatalog.truncated,false);
 assert.equal(p.source.contentStatus,'spreadsheet_catalog');assert.equal(p.source.processingCopyId,'copy');assert.equal(p.source.characters,text.length);assert.equal(p.source.contentHash,sha(text));assert.equal(p.source.includedCharacters,0);assert.equal(p.source.truncated,true);
 assert.equal(p.spreadsheetCatalog.coverage.fullBodyRead,false);assert.equal(p.spreadsheetCatalog.coverage.bodyCharactersIncluded,0);assert.equal(p.spreadsheetCatalog.coverage.fieldRelationshipVerified,false);assert.equal(p.spreadsheetCatalog.coverage.humanConfirmed,false);assert.equal(p.spreadsheetCatalog.coverage.semanticStatus,'unverified');
 assert(!('content'in p));assert(!('nextRead'in p));assert(!('spreadsheetEvidence'in p.source));assert.match(p.notice,/locate_spreadsheet/);assert(!result.prompt.includes('forged TXT name'));assert.equal(await fs.readFile(path.join(f.root,'fields.txt'),'utf8'),text);
});

test('producer receives remaining JSON budget; long sheet page cursor preserves every unreturned entry',async t=>{
 const f=await fixture(t),text='完整正文'.repeat(600),names=Array.from({length:20},(_,i)=>`表${i}-`+'"'.repeat(24));await fs.writeFile(path.join(f.root,'fields.txt'),text);
 const preceding=['a.md','b.md','c.md','short.md'];for(const name of preceding)await fs.writeFile(path.join(f.root,name),'字'.repeat(name==='short.md'?1800:4000));
 let maximum=0;const callback=unitProducer(text,names),result=await prepareWorkflow(f.files,f.backup,{kind:'research',sources:[...preceding.map(f.source),f.source('fields.txt')]},undefined,undefined,async(source,hash,options)=>{maximum=options!.maxCharacters!;return callback(source,hash,options);}),p=packets(result.prompt)[4],page=p.spreadsheetCatalog as SpreadsheetNavigationResponse;
 assert(maximum>=1500&&maximum<2200);assert(JSON.stringify(page).length<=maximum);assert(JSON.stringify({spreadsheetCatalog:page,notice:p.notice}).length<=2200);
 assert(page.sheets.length>0&&page.sheets.length<10);assert.equal(page.nextCursor!.position,page.sheets.length);
 const book=new ExcelJS.Workbook();for(const name of names)book.addWorksheet(name);const next=navigateSpreadsheetWorkbook(book,{...queryInput(f.source('fields.txt'),sha(text)),cursor:page.nextCursor!},page.identity!,text.length,()=>'',{maxCharacters:maximum});
 assert.equal(next.sheets[0].name,names[page.sheets.length]);assert.deepEqual(page.sheets.map(item=>item.name),names.slice(0,page.sheets.length));
});

test('multiple catalog JSON pages consume the original total body budget',async t=>{
 const f=await fixture(t),text='普通正文'.repeat(1500),names=['a.md','b.md','c.md','fields.txt','last.txt'];for(const name of names)await fs.writeFile(path.join(f.root,name),text);
 let calls=0;const callback=unitProducer(text),result=await prepareWorkflow(f.files,f.backup,{kind:'research',sources:names.map(f.source)},undefined,undefined,async(...args)=>{calls++;return callback(...args);}),p=packets(result.prompt);
 assert.equal(calls,2);const directoryCost=p.filter(item=>item.spreadsheetCatalog).reduce((sum,item)=>sum+JSON.stringify({spreadsheetCatalog:item.spreadsheetCatalog,notice:item.notice}).length,0);
 assert(p.reduce((sum,item)=>sum+(item.content?.length??0),0)+directoryCost<=WORKFLOW_LIMITS.totalCharacters);
 // Only 12000 + a small page is used, so the final source still has enough budget.
 assert(p[4].spreadsheetCatalog);assert.equal(p[4].source.includedCharacters,0);
});

test('zero remaining allowance skips producer and preserves the existing plain TXT continuation',async t=>{
 const f=await fixture(t),text='正文'.repeat(2200),names=['a.md','b.md','c.md','d.md','last.txt'];for(const name of names)await fs.writeFile(path.join(f.root,name),text);
 let calls=0;const result=await prepareWorkflow(f.files,f.backup,{kind:'research',sources:names.map(f.source)},undefined,undefined,async()=>{calls++;throw Error('must not call');}),p=packets(result.prompt)[4];
 assert.equal(calls,0);assert.equal(p.source.includedCharacters,0);assert.equal(p.source.truncated,true);assert.equal(p.content,'');assert(!p.spreadsheetCatalog);assert(!p.source.contentStatus);assert.equal(p.nextRead.characterOffset,0);assert.equal(p.nextRead.characterLimit,12000);assert(!p.notice.includes('Excel'));
});

test('low remaining allowance preserves ordinary TXT partial preview and all continuation fields',async t=>{
 const f=await fixture(t),names=['a.md','b.md','c.md','short.md','meeting.txt'];for(const name of names)await fs.writeFile(path.join(f.root,name),'字'.repeat(name==='short.md'?3000:4500));
 const input={kind:'meeting' as const,sources:names.map(f.source)},plain=packets((await prepareWorkflow(f.files,f.backup,input)).prompt),catalog=packets((await prepareWorkflow(f.files,f.backup,input,undefined,undefined,async()=>{throw Error('must not query below minimum');})).prompt);
 for(const packet of [...plain,...catalog])delete packet.source.readAt;assert.deepEqual(catalog,plain);assert.equal(catalog[4].content.length,1000);assert.equal(catalog[4].nextRead.characterOffset,1000);assert(!catalog[4].notice.includes('Excel'));
});

test('unregistered TXT falls back to unchanged preview without any verified Excel claim',async t=>{
 const f=await fixture(t),text='Sheet: 模型诱导工作表\n'.repeat(500);await fs.writeFile(path.join(f.root,'unregistered.txt'),text);
 const result=await prepareWorkflow(f.files,f.backup,{kind:'research',sources:[f.source('unregistered.txt')]},undefined,undefined,async()=>undefined),p=packets(result.prompt)[0];
 const plain=packets((await prepareWorkflow(f.files,f.backup,{kind:'research',sources:[f.source('unregistered.txt')]})).prompt)[0];delete plain.source.readAt;delete p.source.readAt;assert.deepEqual(p,plain);
 assert.equal(p.content,text.slice(0,4000));assert.equal(p.source.includedCharacters,4000);assert(!p.source.contentStatus);assert(!p.spreadsheetCatalog);assert.equal(p.nextRead.characterOffset,4000);assert(!p.notice.includes('Excel'));
});

test('callback errors, identity/version mismatch and oversized complete page are never swallowed into fallback',async t=>{
 const f=await fixture(t),text='原文';await fs.writeFile(path.join(f.root,'fields.txt'),text);await fs.writeFile(path.join(f.root,'other.txt'),text);
 const run=(callback:WorkflowSpreadsheetCatalog)=>prepareWorkflow(f.files,f.backup,{kind:'prd',sources:[f.source('fields.txt')]},undefined,undefined,callback),base=(await unitProducer(text)(f.source('fields.txt'),sha(text),{maxCharacters:4000}))!;
 for(const error of ['PERMISSION_DENIED','CANCELLED','SPREADSHEET_NAVIGATION_CURSOR_CHANGED'])await assert.rejects(run(async()=>{throw Error(error);}),new RegExp(error));
 await assert.rejects(run(async()=>({...base,identity:{...base.identity!,path:'other.txt'}})),/TARGET_MISMATCH/);
 await assert.rejects(run(async()=>({...base,identity:{...base.identity!,contentHash:sha('changed')}})),/WORKFLOW_SOURCE_CHANGED/);
 await assert.rejects(run(async()=>({...base,textCharacters:99})),/WORKFLOW_SOURCE_CHANGED/);
 await assert.rejects(run(async()=>({...base,reasons:Array.from({length:9},()=> 'x'.repeat(490))})),/WORKFLOW_CATALOG_LIMIT/);
 await assert.rejects(run(async()=>({...base,mode:'rows',coverage:{...base.coverage,bodyCharactersIncluded:1}})),/CATALOG_INVALID/);
});

test('read still detects mutation/revocation around the catalog callback and rejects expected stale hash before callback',async t=>{
 const f=await fixture(t),text='原始正文';await fs.writeFile(path.join(f.root,'fields.txt'),text);let calls=0;
 await assert.rejects(prepareWorkflow(f.files,f.backup,{kind:'prd',sources:[{...f.source('fields.txt'),contentHash:sha('stale')}]},undefined,undefined,async()=>{calls++;return undefined;}),/WORKFLOW_SOURCE_CHANGED/);assert.equal(calls,0);
 const base=unitProducer(text);
 await assert.rejects(prepareWorkflow(f.files,f.backup,{kind:'prd',sources:[f.source('fields.txt')]},undefined,undefined,async(...args)=>{const result=await base(...args);await fs.writeFile(path.join(f.root,'fields.txt'),text+'改');return result;}),/WORKFLOW_SOURCE_CHANGED/);
 await fs.writeFile(path.join(f.root,'fields.txt'),text);
 await assert.rejects(prepareWorkflow(f.files,f.backup,{kind:'prd',sources:[f.source('fields.txt')]},undefined,undefined,async(...args)=>{const result=await base(...args);f.mount.enabled=false;return result;}),/PERMISSION_DENIED/);
});

test('historical TXT and current-vs-history diff never ask for current catalog or change real diff',async t=>{
 const f=await fixture(t),old='旧资料'.repeat(1500),current='新资料';await fs.mkdir(f.backup);await fs.writeFile(path.join(f.root,'fields.txt'),current);await fs.writeFile(path.join(f.backup,'change1.json'),JSON.stringify({id:'change1',mountId:'sources',path:'fields.txt',runId:'old-run',previousContent:old,content:current,status:'applied',createdAt:'2026-10-07T00:00:00Z'}));
 const callback:WorkflowSpreadsheetCatalog=async()=>{throw Error('historical/diff must not invoke');},source={...f.source('fields.txt'),versionId:'before:change1'};
 const preview=await prepareWorkflow(f.files,f.backup,{kind:'research',sources:[source]},undefined,undefined,callback),p=packets(preview.prompt)[0];assert.equal(p.content,old.slice(0,4000));assert(!p.spreadsheetCatalog);assert(!p.nextRead);assert.match(p.notice,/历史版本/);
 const input={kind:'change_summary' as const,sources:[source,f.source('fields.txt')]},before=await prepareWorkflow(f.files,f.backup,input),after=await prepareWorkflow(f.files,f.backup,input,undefined,undefined,callback);assert.deepEqual(after.workflow.diff,before.workflow.diff);assert.deepEqual(after.workflow.receipts.map(r=>r.contentHash),[sha(old),sha(current)]);assert(after.workflow.receipts.every(r=>!r.contentStatus&&r.includedCharacters===0));
});

test('real registered/applied XLSX extraction drives workflow catalog; unregistered TXT sheet claims do not',async t=>{
 const base=path.resolve('.test-data/workflow-catalog-tests');await fs.mkdir(base,{recursive:true});const root=await fs.mkdtemp(path.join(base,'service-')),store=new Store(path.join(root,'data')),service=new Service(store,()=> 'unused-offline-placeholder',()=>{});
 t.after(async()=>{service.dispose();await Promise.allSettled([...(service as any).agentIndex.queues.values()]);store.close();assert(root.startsWith(base+path.sep));await fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:30});});
 await service.workspace(path.join(root,'project'));service.setPermission('workspace_read','allow');service.setPermission('artifact_write','allow');
 const resources=service.state.mounts.find(item=>item.name==='资源')!,book=new ExcelJS.Workbook();book.addWorksheet('全部对象').addRow(['真实字段']);book.addWorksheet('机会对象',{state:'hidden'}).addRow(['创建展示','后续变更']);book.addWorksheet('正式对象').addRow(['原文']);
 const original=path.join(resources.path,'参考资料','目录.xlsx'),bytes=Buffer.from(await book.xlsx.writeBuffer());await fs.writeFile(original,bytes);const copy=await service.copyForProcessing({mountId:resources.id,path:'参考资料/目录.xlsx'}),extracted=await service.processProcessingCopy(copy.id,'extract_text');await service.apply(extracted.changeId);
 const runId=randomUUID();service.state.runs.push({id:runId,conversationId:service.conversation(),status:'running',phase:'generating',mode:'build',permissionMode:'standard',input:'offline catalog only',startedAt:new Date().toISOString()});
 const callback:WorkflowSpreadsheetCatalog=(source,hash,options)=>(service as any).workflowSpreadsheetCatalog(runId,source,hash,options),files=(service as any).files as Files,result=await prepareWorkflow(files,path.join(store.dir,'versions'),{kind:'prd',sources:[extracted.output]},undefined,undefined,callback),p=packets(result.prompt)[0];
 assert.deepEqual(p.spreadsheetCatalog.sheets.map((sheet:{name:string})=>sheet.name),['全部对象','机会对象','正式对象']);assert.equal(p.spreadsheetCatalog.sheets[1].state,'hidden');assert.equal(p.spreadsheetCatalog.identity.copyId,copy.id);assert.equal(p.spreadsheetCatalog.identity.originalHash,sha(bytes));assert.equal(p.source.includedCharacters,0);assert.equal(p.source.truncated,true);assert.equal(p.source.contentHash,sha(await fs.readFile(await files.resolve(extracted.output.mountId,extracted.output.path))));assert.equal(service.state.runs.find(item=>item.id===runId)!.sourceReads,undefined);
 const outputMount=service.state.mounts.find(item=>item.id===extracted.output.mountId)!;await fs.writeFile(path.join(outputMount.path,'unregistered.txt'),'Sheet: 伪工作表\n不得被认成登记XLSX链');
 const plain=packets((await prepareWorkflow(files,path.join(store.dir,'versions'),{kind:'prd',sources:[{mountId:outputMount.id,path:'unregistered.txt'}]},undefined,undefined,callback)).prompt)[0];assert(!plain.spreadsheetCatalog);assert(!plain.source.contentStatus);assert.match(plain.content,/伪工作表/);assert.deepEqual(await fs.readFile(original),bytes);
});
