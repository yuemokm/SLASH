import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {spreadsheetNavigationForModel} from '../main/spreadsheet-navigation-model-view.js';
import {navigateSpreadsheetWorkbook,unavailableSpreadsheetNavigation} from '../main/spreadsheet-navigation.js';
import {spreadsheetNavigationRequestSchema,type SpreadsheetNavigationInput,type SpreadsheetNavigationResponse} from '../shared/spreadsheet-navigation.js';

const hash='a'.repeat(64),identity={mountId:'m',path:'extracted.txt',contentHash:hash,processingReceiptId:'p',copyId:'c',originalHash:hash,copyHash:hash,basis:'original_xlsx' as const,authorizationVersion:hash};
const request=(value:Record<string,unknown>)=>spreadsheetNavigationRequestSchema.parse({mountId:'m',path:'extracted.txt',expectedContentHash:hash,...value});
const run=(book:ExcelJS.Workbook,input:SpreadsheetNavigationInput,source=identity)=>navigateSpreadsheetWorkbook(book,input,source,20000,cell=>cell.text);
const withoutNext=(value:ReturnType<typeof spreadsheetNavigationForModel>)=>{const {nextInput,...original}=value;return original;};

test('rows nextInput copies canonical defaults / original scope and continues a partial row losslessly',()=>{
 const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Target');for(let row=1;row<=4;row++)for(let col=1;col<=16;col++)sheet.getCell(row,col).value=`${row}/${col}`;
 const input=request({mode:'rows',sheet:'Target',rowLimit:10}),original=run(book,input),before=structuredClone(original),view=spreadsheetNavigationForModel(original,input);
 assert(view.nextInput);assert.deepEqual(view.nextInput,{...input,cursor:original.nextCursor});assert.equal(view.nextInput.mode,'rows');assert.equal(view.nextInput.startRow,1);
 assert.deepEqual(withoutNext(view),spreadsheetNavigationForModel(original));assert.deepEqual(original,before);assert(JSON.stringify(view).length<=10000);
 const next=run(book,view.nextInput),width=16,position=original.nextCursor!.position;
 assert.equal(next.rows[0].cells[0].row,1+Math.floor(position/width));assert.equal(next.rows[0].cells[0].column,1+position%width);
 assert.throws(()=>run(book,{...view.nextInput,startRow:4}),/CURSOR_CHANGED/);
 for(const source of [{...identity,authorizationVersion:'b'.repeat(64)},{...identity,contentHash:'b'.repeat(64)},{...identity,copyHash:'b'.repeat(64)}])assert.throws(()=>run(book,view.nextInput!,source),/CURSOR_CHANGED/);
});

test('sheets nextInput preserves original offset/limit and traverses catalog',()=>{
 const book=new ExcelJS.Workbook();for(let i=0;i<5;i++)book.addWorksheet(`Sheet${i}`);
 const input=request({mode:'sheets',offset:1,limit:2}),first=run(book,input),view=spreadsheetNavigationForModel(first,input);assert(view.nextInput);
 assert.deepEqual(view.nextInput,{...input,cursor:first.nextCursor});assert.deepEqual(run(book,view.nextInput).sheets.map(s=>s.name),['Sheet3','Sheet4']);
});

test('find_rows nextInput preserves literals and context; empty scan pages continue',()=>{
 const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Target');sheet.getCell('D1').value='x'.repeat(70000)+'needle';sheet.getCell('B1').value='context';sheet.getCell('D2').value='needle';
 const input=request({mode:'find_rows',sheet:'Target',searchColumn:4,queries:['needle','other'],contextColumns:[2],rowLimit:1}),first=run(book,input),view=spreadsheetNavigationForModel(first,input);assert.equal(first.rows.length,0);assert(view.nextInput);
 assert.deepEqual(view.nextInput,{...input,cursor:first.nextCursor});const next=run(book,view.nextInput);assert.equal(next.rows[0].cells[0].address,'D1');assert.equal(next.rows[0].cells[1].text,'context');assert(next.nextCursor);
 assert.throws(()=>run(book,{...view.nextInput,queries:['other']} as SpreadsheetNavigationInput),/CURSOR_CHANGED/);
});

test('long cell UTF16 offsets, hidden merged formula and literal query survive continuation projection',()=>{
 const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Target');sheet.getCell('A1').value='😀 文本 '.repeat(300);sheet.getRow(1).hidden=true;sheet.getColumn(1).hidden=true;sheet.mergeCells('A1:B1');sheet.getCell('C1').value={formula:'1+1',result:7};
 const input=request({mode:'rows',sheet:'Target',columnLimit:3}),first=run(book,input),view=spreadsheetNavigationForModel(first,input);assert(view.nextInput);assert.deepEqual(withoutNext(view),spreadsheetNavigationForModel(first));
 const next=run(book,view.nextInput);assert.equal(next.rows[0].cells[0].textOffset,first.rows[0].cells[0].text.length);assert.equal(next.rows[0].cells[0].rowHidden,true);
 const query=request({mode:'rows',sheet:'Target',query:'文本',columnLimit:3,rowLimit:1});sheet.getCell('A2').value='文本';const queried=run(book,query),queryView=spreadsheetNavigationForModel(queried,query);assert(queryView.nextInput);assert.equal(queryView.nextInput.mode,'rows');assert.equal(queryView.nextInput.query,'文本');
});

test('last page, unverified and missing / invalid / mismatched requests have no nextInput',()=>{
 const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Target');sheet.getCell('A1').value='value';const input=request({mode:'rows',sheet:'Target',columnLimit:1}),last=run(book,input);assert.equal(last.nextCursor,null);assert(!('nextInput'in spreadsheetNavigationForModel(last,input)));
 assert(!('nextInput'in spreadsheetNavigationForModel(unavailableSpreadsheetNavigation(input,['unverified']),input)));
 sheet.getCell('A2').value='value';const paging=request({mode:'rows',sheet:'Target',columnLimit:1,rowLimit:1}),first=run(book,paging);
 for(const bad of [undefined,{...paging,startRow:2},{...paging,path:'other.txt'},{...paging,mountId:'other'},{...paging,expectedContentHash:'b'.repeat(64)},{...paging,mode:'sheets'},{...paging,extra:true}])assert(!('nextInput'in spreadsheetNavigationForModel(first,bad as SpreadsheetNavigationInput)));
 assert.throws(()=>spreadsheetNavigationForModel({...first,state:'unverified'} as SpreadsheetNavigationResponse,paging),/未核验/);
});

test('exact 10000-character boundary includes continuation; one extra character falls back with all data',()=>{
 const book=new ExcelJS.Workbook();book.addWorksheet('First');book.addWorksheet('Second');const input=request({mode:'sheets',limit:1,path:'p'.repeat(2500)}),base=run(book,input,{...identity,path:input.path});
 const candidate=spreadsheetNavigationForModel(base,input);assert(candidate.nextInput);const padding=10000-JSON.stringify(candidate).length;
 // Schema-bound reason slots provide controlled JSON overhead without changing navigation data.
 const padded=structuredClone(base);padded.reasons=[];let remaining=padding+JSON.stringify(base.reasons).length-2;
 while(remaining>0){const length=Math.min(499,remaining-2-(padded.reasons.length?1:0));assert(length>=0);padded.reasons.push('x'.repeat(length));remaining-=length+2+(padded.reasons.length>1?1:0);}
 const atLimit=spreadsheetNavigationForModel(padded,input);assert(atLimit.nextInput);assert.equal(JSON.stringify(atLimit).length,10000);
 padded.reasons[padded.reasons.length-1]+='x';const overflow=spreadsheetNavigationForModel(padded,input);assert(!('nextInput'in overflow));assert.deepEqual(overflow,padded);assert(overflow.nextCursor);assert(JSON.stringify(overflow).length<=10000);
});

test('long path overhead never truncates cells to make nextInput fit',()=>{
 const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Target');sheet.getCell('A1').value='value';sheet.getCell('A2').value='value';
 const input=request({mode:'rows',sheet:'Target',columnLimit:1,rowLimit:1,path:'p'.repeat(4600)}),source={...identity,path:input.path},original=run(book,input,source),view=spreadsheetNavigationForModel(original,input);
 assert(!('nextInput'in view));assert.deepEqual(view,spreadsheetNavigationForModel(original));assert.equal(view.rows[0].cells[0].text,'value');assert(JSON.stringify(view).length<=10000);
});
