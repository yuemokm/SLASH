import {createHash} from 'node:crypto';
import type ExcelJS from 'exceljs';
import {spreadsheetNavigationResponseSchema,type SpreadsheetNavigationInput,type SpreadsheetNavigationIdentity,type SpreadsheetNavigationResponse,type SpreadsheetNavigationOptions} from '../shared/spreadsheet-navigation.js';

export const SPREADSHEET_NAVIGATION_LIMITS={responseCharacters:10000,cellCharacters:512,scanCells:2000,scanCharacters:64000,queryChunk:4096} as const;
const coverage={partial:true,fullBodyRead:false,bodyCharactersIncluded:0,fieldRelationshipVerified:false,semanticStatus:'unverified',humanConfirmed:false} as const;
export function unavailableSpreadsheetNavigation(input:Pick<SpreadsheetNavigationInput,'mode'>,reasons:string[]):SpreadsheetNavigationResponse{return spreadsheetNavigationResponseSchema.parse({state:'unverified',mode:input.mode,sheets:[],rows:[],scanned:{cells:0,characters:0},truncated:true,nextCursor:null,coverage:{...coverage},reasons});}

/** Select only literal source text/metadata from an already bounded XLSX parser.
 * No path access, formula evaluator, network, source receipt or business verdict. */
export function navigateSpreadsheetWorkbook(book:ExcelJS.Workbook,input:SpreadsheetNavigationInput,identity:SpreadsheetNavigationIdentity,textCharacters:number,cellText:(cell:ExcelJS.Cell)=>string,options:SpreadsheetNavigationOptions={}):SpreadsheetNavigationResponse{
 const maximum=options.maxCharacters??SPREADSHEET_NAVIGATION_LIMITS.responseCharacters;
 if(!Number.isInteger(maximum)||maximum<1500||maximum>10000)throw Error('SPREADSHEET_NAVIGATION_RESPONSE_LIMIT: 完整导航页预算应为1500-10000字符');
 const scope=input.mode==='find_rows'?{mode:input.mode,sheet:input.sheet,startRow:input.startRow,searchColumn:input.searchColumn,queries:input.queries,contextColumns:input.contextColumns}:input.mode==='sheets'?{mode:input.mode}:{mode:input.mode,sheet:input.sheet,startRow:input.startRow,startColumn:input.startColumn,columnLimit:input.columnLimit,query:input.query??null};
 const version=createHash('sha256').update(JSON.stringify({identity,scope})).digest('hex');
 if(input.cursor&&input.cursor.version!==version)throw Error('SPREADSHEET_NAVIGATION_CURSOR_CHANGED: 来源/授权/查询范围已变化，请从无cursor的第一页重新定位');
 const response:SpreadsheetNavigationResponse={state:'current',mode:input.mode,identity,textCharacters,sheets:[],rows:[],scanned:{cells:0,characters:0},truncated:false,nextCursor:null,coverage:{...coverage},reasons:['目录/选定单元格仅供定位，未完整阅读正文，也未验证字段关系或业务含义']};
 const fits=()=>{response.coverage.bodyCharactersIncluded=response.rows.reduce((sum,row)=>sum+row.cells.reduce((n,cell)=>n+cell.text.length,0),0);return JSON.stringify(response).length<=maximum;};
 if(!fits())throw Error('SPREADSHEET_NAVIGATION_RESPONSE_LIMIT: 来源身份本身超过本页预算，不能截断身份');
 if(input.mode==='sheets'){
  if(input.cursor?.textOffset)throw Error('SPREADSHEET_NAVIGATION_CURSOR_INVALID: 目录cursor不支持单元格正文偏移');
  let position=input.cursor?.position??input.offset;
  if(position>book.worksheets.length)throw Error('SPREADSHEET_NAVIGATION_CURSOR_INVALID: 目录位置越界');
  while(position<book.worksheets.length&&response.sheets.length<input.limit){
   const sheet=book.worksheets[position],item={name:sheet.name,state:sheet.state,rowCount:sheet.rowCount,columnCount:sheet.columnCount};
   response.sheets.push(item);response.nextCursor=position+1<book.worksheets.length?{position:position+1,version}:null;response.truncated=!!response.nextCursor;
   if(!fits()){response.sheets.pop();break;}position++;
  }
  response.nextCursor=position<book.worksheets.length?{position,version}:null;response.truncated=!!response.nextCursor;
  if(response.nextCursor&&!response.sheets.length)throw Error('SPREADSHEET_NAVIGATION_RESPONSE_LIMIT: 一个完整工作表条目无法装入本页预算');
  return spreadsheetNavigationResponseSchema.parse(response);
 }
 const sheet=book.worksheets.find(sheet=>sheet.name===input.sheet);
 if(!sheet)throw Error('OFFICE_SHEET_NOT_FOUND: 工作表名称须与真实目录精确一致');
 if(input.mode==='find_rows')return findSpreadsheetRows(sheet,input,response,version,maximum,cellText);
 const mergesByMaster=new Map(sheet.model.merges.map(range=>[range.split(':')[0],range]));
 const endColumn=Math.min(sheet.columnCount,input.startColumn+input.columnLimit-1),width=Math.max(0,endColumn-input.startColumn+1),height=Math.max(0,sheet.rowCount-input.startRow+1),total=width*height;
 response.range={sheet:sheet.name,startRow:input.startRow,endRow:sheet.rowCount,startColumn:input.startColumn,endColumn,...(input.query!==undefined?{query:input.query}:{})};
 if(input.query!==undefined)response.reasons.push('字面搜索仅列每格首个命中片段，不列全部出现位置；其余正文可改用无query的rows从命中行起按cursor分段读取');
 let position=input.cursor?.position??0,textOffset=input.cursor?.textOffset??0;
 const initialPosition=position,initialTextOffset=textOffset;
 if(position>total||position===total&&textOffset)throw Error('SPREADSHEET_NAVIGATION_CURSOR_INVALID: 单元格位置越界');
 let lastVisited=-1;
 const continuation=()=>{response.nextCursor=position<total?{position,...(textOffset?{textOffset}:{}),version}:null;response.truncated=!!response.nextCursor;};
 while(position<total&&response.scanned.cells<2000&&response.scanned.characters<64000){
  const rowNumber=input.startRow+Math.floor(position/width),column=input.startColumn+position%width,row=sheet.findRow(rowNumber),cell=sheet.findCell(rowNumber,column),master=cell?.master;
  if(position!==lastVisited){response.scanned.cells++;lastVisited=position;}
  const text=cell&&master?.value!==null&&master?.value!==undefined?cellText(master):'';
  if(textOffset>text.length)throw Error('SPREADSHEET_NAVIGATION_CURSOR_INVALID: 单元格正文偏移越界');
  let rowEntry=response.rows.find(item=>item.number===rowNumber);
  if(!input.query&&!rowEntry){if(response.rows.length>=input.rowLimit)break;rowEntry={number:rowNumber,hidden:!!row?.hidden,cells:[]};response.rows.push(rowEntry);}
  if(!text){if(textOffset)throw Error('SPREADSHEET_NAVIGATION_CURSOR_INVALID: 空格不能有正文偏移');position++;continue;}
  let excerptOffset=textOffset,advance=textOffset;
  if(input.query!==undefined){
   const chunk=text.slice(textOffset,textOffset+Math.min(4096,64000-response.scanned.characters)),match=chunk.indexOf(input.query);response.scanned.characters+=chunk.length;
   if(match<0){if(textOffset+chunk.length>=text.length){position++;textOffset=0;}else textOffset+=Math.max(1,chunk.length-input.query.length+1);continue;}
   excerptOffset=Math.max(textOffset+match-80,0);advance=text.length;
   if(!rowEntry){if(response.rows.length>=input.rowLimit)break;rowEntry={number:rowNumber,hidden:!!row?.hidden,cells:[]};response.rows.push(rowEntry);}
  }
  const excerpt=text.slice(excerptOffset,excerptOffset+Math.min(512,input.query===undefined?64000-response.scanned.characters:512));
  if(input.query===undefined){response.scanned.characters+=excerpt.length;advance=textOffset+excerpt.length;}
  const value=master!.value,kind=typeof value==='string'?'text':typeof value==='number'?'number':typeof value==='boolean'?'boolean':value instanceof Date?'date':value&&typeof value==='object'&&('formula'in value||'sharedFormula'in value)?'formula':value&&typeof value==='object'&&'richText'in value?'rich_text':value&&typeof value==='object'&&'hyperlink'in value?'hyperlink':value&&typeof value==='object'&&'error'in value?'error':'unsupported';
  const merge=mergesByMaster.get(master!.address);
  const item={address:cell!.address,masterAddress:master!.address,...(merge?{mergeRange:merge}:{}),row:rowNumber,column,rowHidden:!!row?.hidden,columnHidden:!!sheet.getColumn(column).hidden,kind,text:excerpt,textOffset:excerptOffset,totalCharacters:text.length,textTruncated:excerptOffset>0||excerptOffset+excerpt.length<text.length,formulaExecuted:false} as const;
  rowEntry!.cells.push(item);
  const nextPosition=advance<text.length?position:position+1,nextOffset=advance<text.length?advance:0;
  response.nextCursor=nextPosition<total?{position:nextPosition,...(nextOffset?{textOffset:nextOffset}:{}),version}:null;response.truncated=!!response.nextCursor;
  if(response.rows.flatMap(item=>item.cells).length>80||!fits()){rowEntry!.cells.pop();if(!rowEntry!.cells.length&&input.query!==undefined)response.rows.pop();break;}
  if(advance<text.length){textOffset=advance;break;}position++;textOffset=0;
 }
 continuation();
 if(!fits())throw Error('SPREADSHEET_NAVIGATION_RESPONSE_LIMIT: 完整页无法装入预算');
 if(response.nextCursor&&position===initialPosition&&textOffset===initialTextOffset&&!response.rows.some(row=>row.cells.length))throw Error('SPREADSHEET_NAVIGATION_RESPONSE_LIMIT: 首个完整单元格条目无法装入本页预算，未返回无进展cursor');
 return spreadsheetNavigationResponseSchema.parse(response);
}

function findSpreadsheetRows(sheet:ExcelJS.Worksheet,input:Extract<SpreadsheetNavigationInput,{mode:'find_rows'}>,response:SpreadsheetNavigationResponse,version:string,maximum:number,cellText:(cell:ExcelJS.Cell)=>string):SpreadsheetNavigationResponse{
 const total=Math.max(0,sheet.rowCount-input.startRow+1),merges=new Map(sheet.model.merges.map(range=>[range.split(':')[0],range]));
 response.findRows={sheet:sheet.name,startRow:input.startRow,endRow:sheet.rowCount,searchColumn:input.searchColumn,queries:input.queries,contextColumns:input.contextColumns};
 response.reasons.push('单列literal任一命中，按cursor遍历各命中行；nextCursor未耗尽时不能声称已列全同名候选。每格只返回首个命中/上下文片段，归属及业务含义未验证');
 let position=input.cursor?.position??0,offset=input.cursor?.textOffset??0;
 if(position>total||position===total&&offset)throw Error('SPREADSHEET_NAVIGATION_CURSOR_INVALID: 搜索行位置越界');
 const overlap=Math.max(...input.queries.map(q=>q.length))-1,reserve=512*(1+input.contextColumns.length);
 const continuation=()=>{response.nextCursor=position<total?{position,...(offset?{textOffset:offset}:{}),version}:null;response.truncated=!!response.nextCursor;};
 const describe=(row:number,column:number,textOffset:number,text?:string)=>{const cell=sheet.getCell(row,column),master=cell.master,value=master.value,source=text??(value===null||value===undefined?'':cellText(master)),excerpt=source.slice(textOffset,textOffset+512),merge=merges.get(master.address);
  const kind=value===null||value===undefined?'empty':typeof value==='string'?'text':typeof value==='number'?'number':typeof value==='boolean'?'boolean':value instanceof Date?'date':typeof value==='object'&&('formula'in value||'sharedFormula'in value)?'formula':typeof value==='object'&&'richText'in value?'rich_text':typeof value==='object'&&'hyperlink'in value?'hyperlink':typeof value==='object'&&'error'in value?'error':'unsupported';
  return{address:cell.address,masterAddress:master.address,...(merge?{mergeRange:merge}:{}),row,column,rowHidden:!!sheet.findRow(row)?.hidden,columnHidden:!!sheet.getColumn(column).hidden,kind,text:excerpt,textOffset,totalCharacters:source.length,textTruncated:textOffset>0||textOffset+excerpt.length<source.length,formulaExecuted:false} as const;
 };
 while(position<total&&response.rows.length<input.rowLimit){
  if(response.scanned.cells+1+input.contextColumns.length>2000||64000-response.scanned.characters-reserve<=overlap)break;
  const row=input.startRow+position,cell=sheet.getCell(row,input.searchColumn),value=cell.master.value,text=value===null||value===undefined?'':cellText(cell.master);response.scanned.cells++;
  if(offset>text.length)throw Error('SPREADSHEET_NAVIGATION_CURSOR_INVALID: 名称格正文偏移越界');
  if(!text){position++;offset=0;continue;}
  const chunk=text.slice(offset,offset+Math.min(4096,64000-response.scanned.characters-reserve));response.scanned.characters+=chunk.length;
  const matches=input.queries.map(query=>chunk.indexOf(query)).filter(index=>index>=0),match=matches.length?Math.min(...matches):-1;
  if(match<0){if(offset+chunk.length>=text.length){position++;offset=0;}else offset+=chunk.length-overlap;continue;}
  const cells=[describe(row,input.searchColumn,Math.max(0,offset+match-80),text),...input.contextColumns.map(column=>describe(row,column,0))];response.scanned.cells+=input.contextColumns.length;response.scanned.characters+=cells.reduce((sum,c)=>sum+c.text.length,0);
  const entry={number:row,hidden:!!sheet.findRow(row)?.hidden,cells};response.rows.push(entry);
  const next=position+1;response.nextCursor=next<total?{position:next,version}:null;response.truncated=!!response.nextCursor;response.coverage.bodyCharactersIncluded=response.rows.reduce((sum,r)=>sum+r.cells.reduce((n,c)=>n+c.text.length,0),0);
  if(JSON.stringify(response).length>maximum){response.rows.pop();if(!response.rows.length)throw Error('SPREADSHEET_NAVIGATION_RESPONSE_LIMIT: 一个完整命中行及所选上下文格无法装入本页预算');break;}
  position++;offset=0;
 }
 continuation();response.coverage.bodyCharactersIncluded=response.rows.reduce((sum,r)=>sum+r.cells.reduce((n,c)=>n+c.text.length,0),0);
 if(JSON.stringify(response).length>maximum)throw Error('SPREADSHEET_NAVIGATION_RESPONSE_LIMIT: 完整搜索页无法装入预算');
 if(response.nextCursor&&position===(input.cursor?.position??0)&&offset===(input.cursor?.textOffset??0)&&!response.rows.length)throw Error('SPREADSHEET_NAVIGATION_RESPONSE_LIMIT: 搜索页无进展');
 return spreadsheetNavigationResponseSchema.parse(response);
}
