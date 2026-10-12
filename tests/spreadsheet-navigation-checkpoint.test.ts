import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {navigateSpreadsheetWorkbook} from '../main/spreadsheet-navigation.js';
import {spreadsheetNavigationRequestSchema,type SpreadsheetNavigationInput} from '../shared/spreadsheet-navigation.js';

const hash='a'.repeat(64),identity={mountId:'synthetic',path:'registered.txt',contentHash:hash,processingReceiptId:'receipt',copyId:'copy',originalHash:hash,copyHash:hash,basis:'original_xlsx' as const,authorizationVersion:hash};
const request=(extra:Record<string,unknown>={})=>spreadsheetNavigationRequestSchema.parse({mountId:identity.mountId,path:identity.path,expectedContentHash:hash,mode:'rows',sheet:'Target',startRow:1,startColumn:1,rowLimit:10,columnLimit:10,...extra});
const run=(book:ExcelJS.Workbook,input:SpreadsheetNavigationInput,maximum:number)=>navigateSpreadsheetWorkbook(book,input,identity,100000,cell=>cell.text,{maxCharacters:maximum});
function collect(book:ExcelJS.Workbook,input:SpreadsheetNavigationInput,maximum:number){
 let cursor=input.cursor,position=cursor?.position??0,offset=cursor?.textOffset??0;
 const reconstructed=new Map<string,string>(),pages=[];
 for(let page=0;page<10000;page++){
  const response=run(book,{...input,cursor},maximum);pages.push(response);
  assert(JSON.stringify(response).length<=maximum);assert.deepEqual(response.identity,identity);
  const cells=response.rows.flatMap(row=>row.cells);
  assert(cells.length<=80);assert(response.scanned.cells<=2000);assert(response.scanned.characters<=64000);
  assert.equal(response.coverage.bodyCharactersIncluded,cells.reduce((sum,cell)=>sum+cell.text.length,0));
  for(const cell of cells){const prior=reconstructed.get(cell.address)??'';assert.equal(cell.textOffset,prior.length,`missing/duplicate ${cell.address}`);reconstructed.set(cell.address,prior+cell.text);}
  if(!response.nextCursor)return{reconstructed,pages};
  const next=response.nextCursor;assert(next.position>position||next.position===position&&(next.textOffset??0)>offset,'cursor must advance');
  position=next.position;offset=next.textOffset??0;cursor=next;
 }
 throw Error('unbounded navigation');
}
function expected(book:ExcelJS.Workbook,width:number){
 const values=new Map<string,string>(),sheet=book.getWorksheet('Target')!;
 for(let row=1;row<=sheet.rowCount;row++)for(let column=1;column<=width;column++){
  const cell=sheet.findCell(row,column);if(cell?.master.value!==null&&cell?.master.value!==undefined&&cell.master.text)values.set(cell.address,cell.master.text);
 }
 return values;
}

test('stable page checkpoints include empty-row/cursor metadata and actual scan counters at tight budgets',()=>{
 const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Target');
 for(let row=1;row<=25;row++)for(let column=1;column<=10;column++)if(row%3!==0||column>=3)sheet.getCell(row,column).value=`${row}/${column} literal`;
 for(const maximum of [1500,1750,2000,4000,10000]){
  const {reconstructed,pages}=collect(book,request(),maximum);assert.deepEqual(reconstructed,expected(book,10));
  assert(pages.some(page=>page.nextCursor));assert(pages.every(page=>page.coverage.fullBodyRead===false));
  assert(pages.some(page=>page.scanned.cells>page.rows.flatMap(row=>row.cells).length),'rejected/blank cells remain counted');
 }
});

test('counter digit growth after a rejected item cannot invalidate the last budgeted checkpoint',()=>{
 const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Target');
 for(let col=1;col<=10;col++)sheet.getCell(1,col).value='a'.repeat(col===10?120:10);
 sheet.getCell(100,10).value='tail';
 const first=run(book,request({rowLimit:1}),10000),baseLength=JSON.stringify(first).length;
 for(const maximum of [baseLength,baseLength+8,baseLength+40]){
  const result=collect(book,request(),maximum);assert.deepEqual(result.reconstructed,expected(book,10));
  assert(result.pages.some(page=>page.scanned.cells>=10));
 }
});

test('long cells and merged/hidden/sparse coordinates reconstruct exactly through page rollback',()=>{
 const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Target');
 sheet.getCell('A1').value='😀中文 '.repeat(600);sheet.mergeCells('A1:B2');sheet.getRow(2).hidden=true;sheet.getColumn(2).hidden=true;
 sheet.getCell('D30').value='tail';
 const result=collect(book,request({columnLimit:4}),2200);assert.deepEqual(result.reconstructed,expected(book,4));
 const merged=result.pages.flatMap(page=>page.rows.flatMap(row=>row.cells)).find(cell=>cell.address==='B2')!;
 assert.equal(merged.masterAddress,'A1');assert.equal(merged.mergeRange,'A1:B2');assert.equal(merged.rowHidden,true);assert.equal(merged.columnHidden,true);
});

test('empty scan pages and literal nonmatching chunks retain bounded progress without invented coverage',()=>{
 const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Target');sheet.getCell('A1').value='x'.repeat(70000)+'needle';sheet.getCell('A3001').value='needle tail';
 const input=request({columnLimit:1,query:'needle'});let cursor:typeof input.cursor;const matched:number[]=[];
 for(let page=0;page<10;page++){
  const result=run(book,{...input,cursor},2200);assert(JSON.stringify(result).length<=2200);assert(result.scanned.cells<=2000);assert(result.scanned.characters<=64000);
  matched.push(...result.rows.map(row=>row.number));assert(result.rows.every(row=>row.cells.every(cell=>cell.text.includes('needle'))));
  if(!result.nextCursor)break;assert.notDeepEqual(result.nextCursor,cursor);cursor=result.nextCursor;
 }
 assert.deepEqual(matched,[1,3001]);
});

test('too-small first-cell budget still rejects explicitly; identity/column guards remain strict',()=>{
 const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Target');sheet.getCell('A1').value='x'.repeat(2000);
 assert.throws(()=>run(book,request({columnLimit:1}),1500),/RESPONSE_LIMIT/);
 const first=run(book,request({columnLimit:1}),2200);assert(first.nextCursor);
 assert.throws(()=>run(book,{...request({columnLimit:1}),cursor:{...first.nextCursor!,version:'b'.repeat(64)}},2200),/CURSOR_CHANGED/);
 assert.throws(()=>request({columnLimit:18}));
});
