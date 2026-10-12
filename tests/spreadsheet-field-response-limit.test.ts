import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import ExcelJS from 'exceljs';
import {Service} from '../main/service.js';
import {Store} from '../main/store.js';
import {spreadsheetFieldResponseSchema,type SpreadsheetFieldReadInput} from '../shared/spreadsheet-field-evidence.js';

const hash=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
async function fixture(t:test.TestContext,kind:'multi'|'single'|'merge'='multi'){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'slash-field-response-limit-')),store=new Store(path.join(dir,'data')),service=new Service(store,()=> 'offline-placeholder',()=>{},undefined,{},()=>undefined);
 t.after(async()=>{service.dispose();await Promise.allSettled([...(service as any).agentIndex.queues.values()]);store.close();await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:30});});
 await service.workspace(path.join(dir,'project'));service.setPermission('workspace_read','allow');service.setPermission('artifact_write','allow');
 const resources=service.state.mounts.find(item=>item.name==='资源')!,process=service.state.mounts.find(item=>item.name==='过程文件')!,book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Target');
 if(kind==='single'){
  for(let row=1;row<=3;row++)sheet.getCell(row,2).value=`header ${row} `+'h'.repeat(1000);
  sheet.getCell('A5').value='field '+'f'.repeat(1000);sheet.getCell('B5').value='value '+'v'.repeat(1000);
 }else{
  sheet.getCell('A2').value='field '.repeat(25);for(let column=2;column<=8;column++){sheet.getCell(1,column).value=`header ${column}`;sheet.getCell(2,column).value=`rule ${column} `+'v'.repeat(100);}
  if(kind==='merge')sheet.mergeCells('C2:D2');
 }
 const bytes=Buffer.from(await book.xlsx.writeBuffer()),original=path.join(resources.path,'参考资料/field.xlsx');await fs.writeFile(original,bytes);
 const copy=await service.copyForProcessing({mountId:resources.id,path:'参考资料/field.xlsx'}),result=await service.processProcessingCopy(copy.id,'extract_text'),change=service.state.changes.find(item=>item.id===result.changeId)!;await service.apply(change.id);
 const runId=randomUUID(),conversation=service.conversation();service.state.runs.push({id:runId,conversationId:conversation,status:'running',phase:'generating',mode:'build',permissionMode:'standard',input:'offline fixture',startedAt:new Date().toISOString()});
 const input:SpreadsheetFieldReadInput={...result.output,expectedContentHash:hash(change.content),sheet:'Target',fieldCell:kind==='single'?'A5':'A2',values:kind==='single'?[{valueCell:'B5',headerCells:['B1','B2','B3']}]:Array.from({length:7},(_,index)=>({valueCell:String.fromCharCode(66+index)+'2',headerCells:[String.fromCharCode(66+index)+'1']}))};
 return{service,store,runId,input,original,originalHash:hash(bytes),process};
}
test('registered real Service rejects the complete over-budget response atomically and smaller values recover unchanged evidence',async t=>{
 const f=await fixture(t),before=structuredClone(f.input);
 await assert.rejects(f.service.readSpreadsheetFieldEvidence(f.input,f.runId),error=>{
  assert(error instanceof Error);assert.match(error.message,/^SPREADSHEET_FIELD_RESPONSE_LIMIT:/);assert.match(error.message,/超过12000字符/);assert.match(error.message,/本次未返回有效字段证据/);assert.match(error.message,/请减少values条目/);assert(!error.message.includes('field field'));return true;
 });
 assert.deepEqual(f.input,before);assert.equal(f.service.state.runs.find(run=>run.id===f.runId)!.sourceReads,undefined);
 const ids=new Set<string>();for(const value of f.input.values){const input={...f.input,values:[value]},response=await f.service.readSpreadsheetFieldEvidence(input,f.runId);spreadsheetFieldResponseSchema.parse(response);assert(JSON.stringify(response).length<=12000);assert.equal(response.evidence.length,1);const evidence=response.evidence[0];assert.equal(evidence.value.requestedAddress,value.valueCell);assert.equal(evidence.contentHash,f.input.expectedContentHash);assert.equal(evidence.semanticStatus,'unverified');assert.equal(evidence.humanConfirmed,false);ids.add(evidence.evidenceId);}
 assert.equal(ids.size,7);assert.equal(hash(await fs.readFile(f.original)),f.originalHash);assert.equal(f.service.state.changes.length,1);
});
test('one valid value with full field/header/identity evidence still over budget is explicitly unrecoverable without truncation',async t=>{
 const f=await fixture(t,'single'),before=structuredClone(f.input);
 await assert.rejects(f.service.readSpreadsheetFieldEvidence(f.input,f.runId),error=>{
  assert(error instanceof Error);assert.match(error.message,/^SPREADSHEET_FIELD_SINGLE_VALUE_LIMIT:/);assert.match(error.message,/本次未返回有效字段证据/);assert.match(error.message,/不能通过减少values恢复本请求/);assert.match(error.message,/未截断证据/);assert(!error.message.includes('请减少values'));assert(!error.message.includes('hhhhhhhh'));return true;
 });
 assert.deepEqual(f.input,before);assert.equal(f.service.state.runs.find(run=>run.id===f.runId)!.sourceReads,undefined);assert.equal(hash(await fs.readFile(f.original)),f.originalHash);
});
test('header/merge/same-field/individual-cell errors preserve original codes without budget advice or partial receipts',async t=>{
 const f=await fixture(t,'merge');
 for(const [input,code] of [
  [{...f.input,values:[{valueCell:'B2',headerCells:['A1']}]},'OFFICE_CELL_UNEXTRACTED'],
  [{...f.input,values:[{valueCell:'B2',headerCells:['E1']}]},'OFFICE_HEADER_COLUMN_MISMATCH'],
  [{...f.input,values:[{valueCell:'C2',headerCells:['C1']}]},'OFFICE_VALUE_MERGE_AMBIGUOUS'],
  [{...f.input,values:[{valueCell:'A2',headerCells:['A1']}]},'OFFICE_FIELD_VALUE_SAME_CELL'],
 ] as Array<[SpreadsheetFieldReadInput,string]>){await assert.rejects(f.service.readSpreadsheetFieldEvidence(input,f.runId),error=>{assert(error instanceof Error);assert(error.message.startsWith(code+':'),error.message);assert(!error.message.includes('请减少values'));assert(!error.message.includes('SPREADSHEET_FIELD_RESPONSE_LIMIT'));return true;});}
 assert.equal(f.service.state.runs.find(run=>run.id===f.runId)!.sourceReads,undefined);assert.equal(hash(await fs.readFile(f.original)),f.originalHash);
});
test('schema, authorization and source version rejection are never relabeled as recoverable response budget errors',async t=>{
 const f=await fixture(t);
 await assert.rejects(f.service.readSpreadsheetFieldEvidence({...f.input,values:[]} as SpreadsheetFieldReadInput,f.runId),error=>{assert(error instanceof Error);assert(!error.message.includes('请减少values'));return true;});
 await assert.rejects(f.service.readSpreadsheetFieldEvidence({...f.input,expectedContentHash:'f'.repeat(64)},f.runId),/^Error: VERSION_CONFLICT/);
 f.service.setPermission('workspace_read','deny');await assert.rejects(f.service.readSpreadsheetFieldEvidence(f.input,f.runId),/^Error: PERMISSION_DENIED/);
 assert.equal(f.service.state.runs.find(run=>run.id===f.runId)!.sourceReads,undefined);assert.equal(hash(await fs.readFile(f.original)),f.originalHash);
});
