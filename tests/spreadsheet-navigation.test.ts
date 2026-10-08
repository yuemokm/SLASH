import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import ExcelJS from 'exceljs';
import {extractOfficeText,extractSpreadsheetNavigation} from '../main/office-extraction.js';
import {unavailableSpreadsheetNavigation} from '../main/spreadsheet-navigation.js';
import {spreadsheetNavigationRequestSchema,spreadsheetNavigationResponseSchema,type SpreadsheetNavigationInput} from '../shared/spreadsheet-navigation.js';
const hash=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
async function fixture(build:(book:ExcelJS.Workbook)=>void){
 const book=new ExcelJS.Workbook();build(book);const bytes=Buffer.from(await book.xlsx.writeBuffer()),text=await extractOfficeText(bytes,'fixture.xlsx');
 const identity={mountId:'synthetic',path:'registered.txt',contentHash:hash(text),processingReceiptId:'receipt',copyId:'copy',originalHash:hash(bytes),copyHash:hash(bytes),basis:'original_xlsx' as const,authorizationVersion:hash('fixture-authority')};
 const query=(value:Record<string,unknown>)=>spreadsheetNavigationRequestSchema.parse({mountId:identity.mountId,path:identity.path,expectedContentHash:identity.contentHash,...value});
 const run=async(input:SpreadsheetNavigationInput,maxCharacters?:number)=>{const result=await extractSpreadsheetNavigation(bytes,input,identity,{maxCharacters});assert.equal(result.text,text);spreadsheetNavigationResponseSchema.parse(result.result);assert(JSON.stringify(result.result).length<=(maxCharacters??10000));return result.result;};
 return{bytes,text,identity,query,run};
}
test('bounded actual sheet catalog pages never skip long names, hidden or empty sheets',async()=>{
 const names=Array.from({length:24},(_,i)=>`Sheet-${String(i).padStart(2,'0')}-abcdefghijklmnop`),f=await fixture(book=>{names.forEach((name,i)=>{const sheet=book.addWorksheet(name,{state:i===3?'veryHidden':i===2?'hidden':'visible'});if(i!==1)sheet.getCell('D3').value='literal';});});
 const observed:string[]=[],input=f.query({mode:'sheets',limit:20});let cursor:typeof input.cursor;
 for(let page=0;page<30;page++){const response=await f.run({...input,cursor},1500);observed.push(...response.sheets.map(s=>s.name));assert.equal(response.rows.length,0);assert.equal(response.coverage.fullBodyRead,false);assert.equal(response.coverage.bodyCharactersIncluded,0);if(!response.nextCursor)break;assert(response.nextCursor.position>(cursor?.position??0));cursor=response.nextCursor;}
 assert.deepEqual(observed,names);const full=await f.run(f.query({mode:'sheets',offset:1,limit:3}));assert.equal(full.sheets[0].rowCount,0);assert.equal(full.sheets[1].state,'hidden');assert.equal(full.sheets[2].state,'veryHidden');
});
test('long cells continue exact source offsets and preserve sparse/hidden/merged coordinates',async()=>{
 const long='正文'.repeat(900),f=await fixture(book=>{const sheet=book.addWorksheet('Target');sheet.addRow(['Label','Value','Long']);sheet.getCell('A2').value='名称';sheet.mergeCells('A2:A3');sheet.getCell('B2').value=7;sheet.getCell('C2').value=long;sheet.getRow(2).hidden=true;sheet.getColumn(2).hidden=true;sheet.getCell('D20').value='tail';});
 const input=f.query({mode:'rows',sheet:'Target',columnLimit:4,rowLimit:5});let cursor:typeof input.cursor;const cells:Array<{address:string;text:string;textOffset:number}>=[],rows=new Set<number>();
 for(let i=0;i<30;i++){const response=await f.run({...input,cursor});response.rows.forEach(row=>{rows.add(row.number);cells.push(...row.cells);});const merged=response.rows.flatMap(r=>r.cells).find(c=>c.address==='A3');if(merged){assert.equal(merged.masterAddress,'A2');assert.equal(merged.mergeRange,'A2:A3');}const hidden=response.rows.flatMap(r=>r.cells).find(c=>c.address==='B2');if(hidden){assert.equal(hidden.rowHidden,true);assert.equal(hidden.columnHidden,true);assert.equal(hidden.kind,'number');}if(!response.nextCursor)break;assert.notDeepEqual(response.nextCursor,cursor);cursor=response.nextCursor;}
 const pieces=cells.filter(c=>c.address==='C2');let offset=0;for(const piece of pieces){assert.equal(piece.textOffset,offset);offset+=piece.text.length;}assert.equal(pieces.map(c=>c.text).join(''),'文本: '+long);assert(cells.some(c=>c.address==='D20'));assert(rows.has(10));
});
test('literal query crosses chunk boundaries, bounds sparse scans and states first-hit coverage',async()=>{
 const f=await fixture(book=>{const sheet=book.addWorksheet('Target');sheet.getCell('A1').value='x'.repeat(4090)+'[needle]'+ 'suffix';sheet.getCell('A5001').value='[needle] tail';});
 const input=f.query({mode:'rows',sheet:'Target',columnLimit:1,query:'[needle]'});let cursor:typeof input.cursor;const matches:number[]=[];
 for(let i=0;i<10;i++){const response=await f.run({...input,cursor});assert(response.scanned.cells<=2000);assert(response.scanned.characters<=64000);assert.equal(response.range?.startColumn,1);assert.equal(response.range?.endColumn,1);assert.equal(response.range?.query,'[needle]');assert(response.reasons.some(reason=>reason.includes('首个命中')));for(const row of response.rows){matches.push(row.number);assert(row.cells.every(cell=>cell.text.includes('[needle]')));}if(!response.nextCursor)break;assert.notDeepEqual(response.nextCursor,cursor);cursor=response.nextCursor;}
 assert.deepEqual(matches,[1,5001]);
 const caseSensitive=await f.run(f.query({mode:'rows',sheet:'Target',columnLimit:1,query:'[NEEDLE]'}));assert.equal(caseSensitive.rows.length,0);assert(caseSensitive.nextCursor);
});
test('small page refuses no-progress cell cursor, output coverage never leaks across calls',async()=>{
 const f=await fixture(book=>{const sheet=book.addWorksheet('Target');sheet.getCell('A1').value='long'.repeat(800);});
 const input=f.query({mode:'rows',sheet:'Target',columnLimit:1}),first=await f.run(input),snapshot=JSON.stringify(first);assert(first.nextCursor);assert(first.coverage.bodyCharactersIncluded>0);
 const catalog=await f.run(f.query({mode:'sheets'}));assert.equal(catalog.coverage.bodyCharactersIncluded,0);assert.equal(unavailableSpreadsheetNavigation(input,['not verified']).coverage.bodyCharactersIncluded,0);assert.equal(JSON.stringify(first),snapshot);
 await assert.rejects(f.run(input,1500),/RESPONSE_LIMIT/);
 const next=await f.run({...input,cursor:first.nextCursor!});assert.equal(next.rows[0].cells[0].textOffset,first.rows[0].cells[0].text.length);
});
test('cursor exact scope/source/authority binding and schema reject altered or unbounded requests',async()=>{
 const f=await fixture(book=>{const sheet=book.addWorksheet('Target');sheet.getCell('A1').value='literal'.repeat(200);});const input=f.query({mode:'rows',sheet:'Target',columnLimit:1}),first=await f.run(input);assert(first.nextCursor);
 await assert.rejects(f.run({...input,cursor:{...first.nextCursor!,version:'f'.repeat(64)}}),/CURSOR_CHANGED/);
 await assert.rejects(f.run({...input,cursor:first.nextCursor!,query:'literal'} as SpreadsheetNavigationInput),/CURSOR_CHANGED/);
 await assert.rejects(extractSpreadsheetNavigation(f.bytes,{...input,cursor:first.nextCursor!},{...f.identity,authorizationVersion:hash('changed')}),/CURSOR_CHANGED/);
 await assert.rejects(f.run({...input,cursor:{...first.nextCursor!,position:99999}}),/CURSOR_INVALID/);
 assert.throws(()=>f.query({mode:'rows',sheet:'Target',columnLimit:17}));assert.throws(()=>f.query({mode:'rows',sheet:'Target',query:'x'.repeat(81)}));assert.throws(()=>f.query({mode:'sheets',claimedVerified:true}));
});
test('formula cache/link text is literal and never evaluated or fetched',async()=>{
 const f=await fixture(book=>{const sheet=book.addWorksheet('Target');sheet.getCell('A1').value={formula:'1+1',result:7};sheet.getCell('B1').value={text:'source-link',hyperlink:'https://invalid.example/no-network'};});const response=await f.run(f.query({mode:'rows',sheet:'Target'})),cells=response.rows[0].cells;
 assert.equal(cells[0].kind,'formula');assert.equal(cells[0].formulaExecuted,false);assert.match(cells[0].text,/缓存结果.*7/);assert.match(cells[1].text,/未请求/);assert.equal(response.coverage.fieldRelationshipVerified,false);
});
