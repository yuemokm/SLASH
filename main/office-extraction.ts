import path from 'node:path';
import { crc32, inflateRawSync } from 'node:zlib';
import AdmZip from 'adm-zip';
import ExcelJS from 'exceljs';
import {extractStructuredDocxText} from './docx-structured-text.js';
import { SaxesParser } from 'saxes';
import type {SpreadsheetFieldReadInput,SpreadsheetCellEvidence} from '../shared/spreadsheet-field-evidence.js';
import type {SpreadsheetNavigationInput,SpreadsheetNavigationIdentity,SpreadsheetNavigationOptions,SpreadsheetNavigationResponse} from '../shared/spreadsheet-navigation.js';
import {navigateSpreadsheetWorkbook} from './spreadsheet-navigation.js';

// This module accepts host snapshots of authorized originals or registered
// processing copies. It does not resolve paths, grant access, read files, or write files.
export const OFFICE_EXTRACTION_LIMITS = Object.freeze({
  inputBytes: 100_000_000,
  outputBytes: 2_000_000,
  entries: 10_000,
  expandedBytes: 256_000_000,
  entryBytes: 128_000_000,
  xmlEntryBytes: 16_000_000,
  xmlTotalBytes: 64_000_000,
  compressionRatio: 1_000,
  xmlNodes: 500_000,
  xmlDepth: 128,
  cells: 250_000,
  mergedCells: 250_000,
  sheets: 256,
});

// Bump when the Office serializers or their parser dependencies change.
export const OFFICE_TEXT_PARSER_VERSION = 'office-text-v6-docx-html-layout-compact';

export function isOfficeDocument(fileName: string): boolean {
  return /\.(docx|xlsx)$/i.test(fileName);
}

function refuse(code: string, message: string): never {
  throw new Error(`OFFICE_${code}: ${message}`);
}

function checkText(text: string): string {
  if (Buffer.byteLength(text, 'utf8') > OFFICE_EXTRACTION_LIMITS.outputBytes) {
    refuse('TEXT_LIMIT', '提取文本超过 2 MB，未完成全文提取；请拆分处理副本后重试');
  }
  return text;
}

function cellPosition(address: string): { row: number; column: number } {
  const match = /^([A-Z]{1,3})([1-9]\d{0,6})$/.exec(address);
  if (!match) refuse('SHEET_LIMIT', '工作表包含无效或超出范围的单元格坐标');
  let column = 0;
  for (const letter of match[1]) column = column * 26 + letter.charCodeAt(0) - 64;
  const row = Number(match[2]);
  if (column > 16_384 || row > 1_048_576) refuse('SHEET_LIMIT', '工作表坐标超过 Excel 范围');
  return { row, column };
}

type XmlBudget = { nodes: number; cells: number; mergedCells: number; sheets: number };
type FormulaCacheObservations={requested:Set<string>;sheets:Map<string,string>;relations:Map<string,string>;emptyCaches:Map<string,Set<string>>};

// XML is inspected with a mature SAX parser before either Office library sees
// it. This is resource validation, not a replacement spreadsheet parser.
function validateXml(bytes: Buffer, entryName: string, budget: XmlBudget,observations?:FormulaCacheObservations): void {
  const worksheet = /^xl\/worksheets\/[^/]+\.xml$/i.test(entryName);
  const workbook = entryName.toLowerCase() === 'xl/workbook.xml';
  let depth = 0;
  let cell:{address:string;type:string;formula:boolean;hasValue:boolean;value:string;depth:number}|undefined,valueDepth:number|undefined;
  const parser = new SaxesParser();
  parser.on('doctype', () => refuse('XML_UNSAFE', 'Office XML 不允许 DTD 或实体声明'));
  parser.on('opentag', tag => {
    if (++depth > OFFICE_EXTRACTION_LIMITS.xmlDepth || ++budget.nodes > OFFICE_EXTRACTION_LIMITS.xmlNodes) {
      refuse('XML_LIMIT', 'Office XML 结构超过安全限额；请拆分处理副本');
    }
    const localName = tag.name.split(':').at(-1);
    const attribute = (name: string) => String(tag.attributes[name] ?? '');
    if(observations){
      if(workbook&&localName==='sheet'){if(observations.sheets.has(attribute('name')))refuse('SHEET_AMBIGUOUS','工作表名称重复');observations.sheets.set(attribute('name'),attribute('r:id'));}
      if(entryName.toLowerCase()==='xl/_rels/workbook.xml.rels'&&localName==='Relationship'&&attribute('TargetMode')!=='External'&&attribute('Type').endsWith('/worksheet')){if(observations.relations.has(attribute('Id')))refuse('SHEET_AMBIGUOUS','工作表关系重复');observations.relations.set(attribute('Id'),attribute('Target'));}
      if(worksheet&&localName==='c')cell=observations.requested.has(attribute('r'))?{address:attribute('r'),type:attribute('t'),formula:false,hasValue:false,value:'',depth}:undefined;
      if(cell&&depth===cell.depth+1&&localName==='f')cell.formula=true;
      if(cell&&depth===cell.depth+1&&localName==='v'){cell.hasValue=true;valueDepth=depth;}
    }
    if (workbook && localName === 'sheet' && ++budget.sheets > OFFICE_EXTRACTION_LIMITS.sheets) {
      refuse('SHEET_LIMIT', '工作表数量超过 256 张');
    }
    if (!worksheet) return;
    if (localName === 'c') {
      if (++budget.cells > OFFICE_EXTRACTION_LIMITS.cells) refuse('SHEET_LIMIT', '单元格数量超过 250,000 个');
      cellPosition(attribute('r'));
    } else if (localName === 'row') {
      const row = Number(attribute('r'));
      if (!Number.isInteger(row) || row < 1 || row > 1_048_576) refuse('SHEET_LIMIT', '工作表行号无效或超出范围');
    } else if (localName === 'col') {
      const min = Number(attribute('min')), max = Number(attribute('max'));
      if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min || max > 16_384) {
        refuse('SHEET_LIMIT', '工作表列范围无效或超出范围');
      }
    } else if (localName === 'mergeCell') {
      const range = attribute('ref').split(':');
      const start = cellPosition(range[0]);
      const end = cellPosition(range[1] ?? range[0]);
      if (range.length > 2 || end.row < start.row || end.column < start.column) refuse('SHEET_LIMIT', '合并单元格范围无效');
      budget.mergedCells += (end.row - start.row + 1) * (end.column - start.column + 1);
      if (budget.mergedCells > OFFICE_EXTRACTION_LIMITS.mergedCells) {
        refuse('SHEET_LIMIT', '合并单元格覆盖范围超过 250,000 格；请拆分处理副本');
      }
    }
  });
  parser.on('text',text=>{if(cell&&valueDepth!==undefined)cell.value+=text;});
  parser.on('cdata',text=>{if(cell&&valueDepth!==undefined)cell.value+=text;});
  parser.on('closetag',tag=>{
    const name=tag.name.split(':').at(-1);
    if(name==='v')valueDepth=undefined;
    if(name==='c'&&cell&&observations){if(cell.formula&&cell.type==='str'&&cell.hasValue&&cell.value===''){const set=observations.emptyCaches.get(entryName)??new Set<string>();set.add(cell.address);observations.emptyCaches.set(entryName,set);}cell=undefined;}
    depth--;
  });
  parser.write(bytes.toString('utf8')).close();
}

function validatePackage(bytes: Buffer, extension: string,observations?:FormulaCacheObservations): void {
  if (bytes.length > OFFICE_EXTRACTION_LIMITS.inputBytes) refuse('INPUT_LIMIT', 'Office 处理副本超过 100 MB');
  if (bytes.length < 4 || bytes.readUInt32LE(0) !== 0x04034b50) {
    refuse('INVALID_PACKAGE', '文件不是有效的 DOCX/XLSX 包，或已加密；请提供未加密的处理副本');
  }
  const zip = new AdmZip(bytes);
  if (zip.getEntryCount() > OFFICE_EXTRACTION_LIMITS.entries) refuse('ZIP_LIMIT', 'Office 包条目数量超过安全限额');
  const entries = zip.getEntries();
  if (entries.length > OFFICE_EXTRACTION_LIMITS.entries) refuse('ZIP_LIMIT', 'Office 包条目数量超过安全限额');
  const names = new Set<string>();
  const budget: XmlBudget = { nodes: 0, cells: 0, mergedCells: 0, sheets: 0 };
  let expanded = 0, xmlTotal = 0;
  for (const entry of entries) {
    const name = entry.entryName;
    const key = name.toLowerCase();
    if (names.has(key) || name.includes('\\') || name.includes('\0') || name.startsWith('/') || /^[a-z]:/i.test(name) || name.split('/').includes('..')) {
      refuse('ZIP_UNSAFE', 'Office 包包含重复或不安全的条目路径');
    }
    names.add(key);
    const offset = entry.header.offset;
    if (offset < 0 || offset + 30 > bytes.length || bytes.readUInt32LE(offset) !== 0x04034b50) refuse('ZIP_INVALID', 'Office 包本地条目头无效');
    const localFlags = bytes.readUInt16LE(offset + 6), localMethod = bytes.readUInt16LE(offset + 8);
    const nameLength = bytes.readUInt16LE(offset + 26), extraLength = bytes.readUInt16LE(offset + 28);
    if (offset + 30 + nameLength + extraLength > bytes.length || localMethod !== entry.header.method || localFlags !== entry.header.flags || bytes.subarray(offset + 30, offset + 30 + nameLength).toString('utf8') !== name) {
      refuse('ZIP_INVALID', 'Office 包本地条目头与目录不一致');
    }
    if (entry.header.flags & 1) refuse('ENCRYPTED', '无法提取加密的 Office 包；请提供未加密的处理副本');
    if (entry.isDirectory) continue;
    const xml = /\.(xml|rels)$/i.test(name);
    const limit = xml ? OFFICE_EXTRACTION_LIMITS.xmlEntryBytes : OFFICE_EXTRACTION_LIMITS.entryBytes;
    const size = entry.header.size, compressedSize = entry.header.compressedSize;
    if (size > limit || (expanded += size) > OFFICE_EXTRACTION_LIMITS.expandedBytes) {
      refuse('ZIP_LIMIT', 'Office 包解压大小超过安全限额；请拆分处理副本');
    }
    if (xml && (xmlTotal += size) > OFFICE_EXTRACTION_LIMITS.xmlTotalBytes) refuse('XML_LIMIT', 'Office XML 总量超过 64 MB');
    if (size > Math.max(1_000_000, compressedSize * OFFICE_EXTRACTION_LIMITS.compressionRatio)) {
      refuse('ZIP_RATIO_LIMIT', 'Office 包压缩比异常，已停止提取');
    }
    if (entry.header.method !== 0 && entry.header.method !== 8) refuse('ZIP_UNSUPPORTED', 'Office 包使用不支持的压缩方法');
    // Do not trust the attacker-controlled expanded size: cap actual inflation,
    // then compare it and its CRC before calling libraries that allocate by it.
    const compressed = entry.getCompressedData();
    const data = entry.header.method === 0 ? compressed : inflateRawSync(compressed, { maxOutputLength: limit });
    if (data.length !== size || data.length > limit || crc32(data) !== entry.header.crc) {
      refuse('ZIP_INVALID', 'Office 包条目大小或完整性校验失败');
    }
    if (xml) validateXml(data, name, budget,observations);
  }
  const required = extension === '.docx' ? 'word/document.xml' : 'xl/workbook.xml';
  if (!names.has('[content_types].xml') || !names.has(required)) refuse('INVALID_PACKAGE', '文件扩展名与 Office 包内容不匹配');
}

function scalarValue(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '[空值]';
  if (value instanceof Date) return `日期时间（ISO）: ${value.toISOString()}`;
  if (typeof value === 'object') {
    if ('richText' in value) return `富文本: ${value.richText.map(item => item.text).join('')}`;
    if ('error' in value) return `[错误 ${value.error}]`;
    if ('hyperlink' in value) return `${value.text} [链接 ${value.hyperlink}；未请求]`;
    if ('text' in value) return String(value.text);
    refuse('CELL_UNSUPPORTED', '工作表包含无法可靠提取的单元格类型');
  }
  return `${typeof value === 'number' ? '数值' : typeof value === 'boolean' ? '布尔值' : '文本'}: ${String(value)}`;
}

function cellValue(cell: ExcelJS.Cell): string {
  const value = cell.value;
  // ExcelJS leaves an empty <si/> shared-string item as {}. Keep its address
  // and state the parser limitation explicitly instead of inventing a value.
  if (cell.type === ExcelJS.ValueType.String && value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype && Object.keys(value).length === 0) {
    return '[空共享文本（解析器未返回可见文本，待核对）]';
  }
  if (value && typeof value === 'object' && ('formula' in value || 'sharedFormula' in value)) {
    const formula = cell.formula || ('sharedFormula' in value ? `共享公式 ${value.sharedFormula}` : value.formula);
    // ExcelJS 4.4.0's value getter drops falsy cached formula results. Its
    // dedicated result getter preserves 0, false and the empty string.
    const cached = cell.result;
    return `公式 =${formula} [未执行]；${cached === undefined || cached === null ? '无缓存结果，待核对' : `缓存结果（待核对）: ${scalarValue(cached)}`}`;
  }
  return scalarValue(value);
}

type SpreadsheetSelection={field:SpreadsheetCellEvidence;values:Array<{headers:SpreadsheetCellEvidence[];value:SpreadsheetCellEvidence}>};
function typedCellScalar(value:ExcelJS.CellValue):SpreadsheetCellEvidence['scalar']{
 if(typeof value==='string')return{kind:'text',value};if(typeof value==='number')return{kind:'number',value};if(typeof value==='boolean')return{kind:'boolean',value};if(value instanceof Date)return{kind:'date',value:value.toISOString()};if(value&&typeof value==='object'&&'error'in value)return{kind:'error',value:value.error};if(value&&typeof value==='object'&&'richText'in value)return{kind:'text',value:value.richText.map(item=>item.text).join('')};if(value&&typeof value==='object'&&'text'in value)return{kind:'text',value:String(value.text)};return undefined;
}
function selectField(workbook:ExcelJS.Workbook,input:SpreadsheetFieldReadInput,emptyCaches?:Set<string>):SpreadsheetSelection{
 const matches=workbook.worksheets.filter(sheet=>sheet.name===input.sheet);if(matches.length!==1)refuse('SHEET_NOT_FOUND','工作表名称无法精确定位');const sheet=matches[0];
 const ranges=sheet.model.merges.map(range=>{const [start,end=start]=range.split(':');return{range,start:cellPosition(start),end:cellPosition(end)};});
 const selected=(address:string):SpreadsheetCellEvidence=>{const position=cellPosition(address),cell=sheet.findCell(position.row,position.column);if(!cell||cell.value===null||cell.value===undefined)refuse('CELL_UNEXTRACTED','空格未包含在提取文本内，不推断为否');const master=cell.master,merged=ranges.find(range=>position.row>=range.start.row&&position.row<=range.end.row&&position.column>=range.start.column&&position.column<=range.end.column),value=master.value,extractedText=cellValue(master);if(extractedText.length>2000)refuse('CELL_LIMIT','字段格正文超过2000字符，未返回截断证据');
  const kind:SpreadsheetCellEvidence['kind']=typeof value==='string'?'text':typeof value==='number'?'number':typeof value==='boolean'?'boolean':value instanceof Date?'date':value&&typeof value==='object'&&('formula'in value||'sharedFormula'in value)?'formula':value&&typeof value==='object'&&'richText'in value?'rich_text':value&&typeof value==='object'&&'hyperlink'in value?'hyperlink':value&&typeof value==='object'&&'error'in value?'error':'unsupported';
  const rawValue=typeof value==='string'||typeof value==='number'||typeof value==='boolean'?String(value):value instanceof Date?value.toISOString():extractedText;
  // ExcelJS omits a literal empty string formula cache while parsing. The
  // existing bounded SAX package validation records only requested <v/> values
  // with explicit t="str", tied to the exact workbook relationship. Keep the
  // legacy text serializer unchanged; the structured cache preserves the bytes.
  const cached=master.result??(emptyCaches?.has(master.address)?'':undefined),scalar=typedCellScalar(value),formula=kind==='formula'&&value&&typeof value==='object'&&('formula'in value||'sharedFormula'in value)?master.formula||('sharedFormula'in value?`共享公式 ${value.sharedFormula}`:value.formula):undefined,cachedScalar=kind==='formula'?typedCellScalar(cached as ExcelJS.CellValue):undefined,cachedResult=kind==='formula'?cached===undefined||cached===null?{state:'missing' as const}:cachedScalar?{state:'present' as const,scalar:cachedScalar}:undefined:undefined;if(kind==='formula'&&!cachedResult)refuse('CELL_UNSUPPORTED','公式缓存类型无法可靠核验');
  return{requestedAddress:address,masterAddress:master.address,...(merged?{mergeRange:merged.range}:{}),...position,kind,rawValue,extractedText,...(scalar?{scalar}:{}),...(formula!==undefined?{formula,cachedResult}:{}),...(master.numFmt&&master.numFmt!=='General'?{numFmt:master.numFmt}:{}),rowHidden:Boolean(sheet.findRow(position.row)?.hidden||sheet.findRow(cellPosition(master.address).row)?.hidden),columnHidden:Boolean(sheet.getColumn(position.column).hidden||sheet.getColumn(master.col).hidden),formulaExecuted:false};
 };
 const field=selected(input.fieldCell);if(!['text','rich_text'].includes(field.kind)||!field.rawValue.trim())refuse('FIELD_LABEL_REQUIRED','字段名必须是非空静态文本');
 const region=(cell:SpreadsheetCellEvidence)=>cell.mergeRange?ranges.find(range=>range.range===cell.mergeRange)!:{start:{row:cell.row,column:cell.column},end:{row:cell.row,column:cell.column}};
 const fieldRegion=region(field);const values=input.values.map((item,index)=>{const value=selected(item.valueCell);if(value.masterAddress===field.masterAddress)refuse('FIELD_VALUE_SAME_CELL',`values[${index}].valueCell=${item.valueCell} 与 fieldCell=${input.fieldCell} 指向同一主格 ${field.masterAddress}；fieldCell只标识字段名称，不能同时作为规则值格。请修正values后重新调用；本次未返回部分证据`);const valueRegion=region(value);if(valueRegion.start.row!==valueRegion.end.row||valueRegion.start.column!==valueRegion.end.column)refuse('VALUE_MERGE_AMBIGUOUS',`values[${index}].valueCell=${item.valueCell} 对应 fieldCell=${input.fieldCell}，masterAddress=${value.masterAddress}，mergeRange=${value.mergeRange}；值格跨行或跨列合并，不能归属唯一字段列；本次不返回部分证据；可以单独核验其他明确非合并格，跨行规则不可自动归属`);if(value.row<fieldRegion.start.row||value.row>fieldRegion.end.row)refuse('FIELD_ROW_MISMATCH',`values[${index}].valueCell=${item.valueCell} 不属于 fieldCell=${input.fieldCell} 对应字段行 ${fieldRegion.start.row}-${fieldRegion.end.row}；本次未返回部分证据`);if(new Set(item.headerCells).size!==item.headerCells.length)refuse('HEADER_DUPLICATE','列头格不能重复');
  const headers=item.headerCells.map(address=>{const header=selected(address),range=region(header);if(!['text','rich_text'].includes(header.kind)||!header.rawValue.trim())refuse('HEADER_REQUIRED','列头必须是非空静态文本');if(value.column<range.start.column||value.column>range.end.column||range.end.row>=fieldRegion.start.row)refuse('HEADER_COLUMN_MISMATCH','列头不覆盖值格列，或不在字段行之前');return header;});return{headers,value};});return{field,values};
}
type BoundSpreadsheetSelection=SpreadsheetSelection&{sheetState:'visible'|'hidden'|'veryHidden';bindings:Map<string,{startLine:number;endLine:number;quote:string}>};
async function extractSpreadsheet(bytes: Buffer,selection?:{input:SpreadsheetFieldReadInput;emptyCaches?:Set<string>;selected:(value:BoundSpreadsheetSelection)=>void},navigate?:(book:ExcelJS.Workbook,text:string)=>void): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  // ExcelJS loads this in-memory buffer; it does not evaluate formulas or fetch
  // hyperlinks/external workbooks. No shell, macro engine, or host app is used.
  await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  if (!workbook.worksheets.length) refuse('INVALID_WORKBOOK', '工作簿不含可提取的工作表');
  const fieldSelection=selection?selectField(workbook,selection.input,selection.emptyCaches):undefined;
  const requested=new Set(fieldSelection?[fieldSelection.field,...fieldSelection.values.flatMap(item=>[...item.headers,item.value])].map(cell=>cell.masterAddress):[]),bindings=new Map<string,{startLine:number;endLine:number;quote:string}>();
  const lines: string[] = [];
  let outputBytes = 0,lineNumber=0;
  const append = (line: string) => {
    outputBytes += Buffer.byteLength(line, 'utf8') + 1;
    if (outputBytes > OFFICE_EXTRACTION_LIMITS.outputBytes) refuse('TEXT_LIMIT', '提取文本超过 2 MB，未完成全文提取；请拆分处理副本后重试');
    lines.push(line);
    lineNumber+=line.split('\n').length;
  };
  append('[XLSX 单元格值提取；包含隐藏内容；公式未执行，缓存结果需核对；保留原始值与数字格式，不模拟 Excel 显示格式；日期采用 ISO 时间；批注、数据验证约束和图表未提取，图片未做 OCR]');
  for (const sheet of workbook.worksheets) {
    append(`\n工作表: ${JSON.stringify(sheet.name)}${sheet.state === 'hidden' ? ' [隐藏工作表]' : sheet.state === 'veryHidden' ? ' [深度隐藏工作表]' : ''}`);
    // findRow preserves blank hidden rows which the model getter omits, and
    // does not create additional rows while visiting sparse coordinates.
    for (let number = 1; number <= sheet.rowCount; number++) if (sheet.findRow(number)?.hidden) append(`隐藏行: ${number}`);
    for (const column of sheet.columns ?? []) if (column.hidden) append(`隐藏列: ${column.letter} (${column.number})`);
    for (const merge of sheet.model.merges) append(`合并区域: ${merge}`);
    let count = 0;
    sheet.eachRow(row => {
      row.eachCell(cell => {
        // A merged follower is an alias, not a second source value. The merge
        // range above records those coordinates explicitly.
        if (cell.type === ExcelJS.ValueType.Merge || cell.value === null || cell.value === undefined) return;
        const flags = [row.hidden ? '隐藏行' : '', sheet.getColumn(cell.col).hidden ? '隐藏列' : ''].filter(Boolean);
        const line=`${cell.address}${flags.length ? ` [${flags.join('、')}]` : ''}: ${JSON.stringify(cellValue(cell))}${cell.numFmt && cell.numFmt !== 'General' ? `；数字格式: ${JSON.stringify(cell.numFmt)}` : ''}`;append(line);
        if(selection&&sheet.name===selection.input.sheet&&requested.has(cell.address))bindings.set(cell.address,{startLine:lineNumber,endLine:lineNumber,quote:line});
        count++;
      });
    });
    if (!count) append('[空表：无非空单元格]');
  }
  const text=checkText(lines.join('\n'));if(selection&&fieldSelection)selection.selected({...fieldSelection,sheetState:workbook.worksheets.find(sheet=>sheet.name===selection.input.sheet)!.state,bindings});navigate?.(workbook,text);return text;
}

/** The same bounded workbook parser and byte-for-byte text serializer, no paths. */
export async function extractSpreadsheetFieldSelection(bytes:Buffer,input:SpreadsheetFieldReadInput){
 const observations:FormulaCacheObservations={requested:new Set(input.values.map(value=>value.valueCell)),sheets:new Map(),relations:new Map(),emptyCaches:new Map()};validatePackage(bytes,'.xlsx',observations);
 const relation=observations.sheets.get(input.sheet),target=relation?observations.relations.get(relation):undefined,entry=target?path.posix.normalize(target.startsWith('/')?target.slice(1):path.posix.join('xl',target)):undefined,emptyCaches=entry?observations.emptyCaches.get(entry):undefined;
 let selected:BoundSpreadsheetSelection|undefined;const text=await extractSpreadsheet(bytes,{input,emptyCaches,selected:value=>{selected=value;}});if(!selected)refuse('FIELD_NOT_FOUND','字段组合未提取');return{text,...selected};
}

/** Navigation uses the same validated package/parser and exact serializer. */
export async function extractSpreadsheetNavigation(bytes:Buffer,input:SpreadsheetNavigationInput,identity:SpreadsheetNavigationIdentity,options:SpreadsheetNavigationOptions={}){
 validatePackage(bytes,'.xlsx');let navigation:SpreadsheetNavigationResponse|undefined;
 const text=await extractSpreadsheet(bytes,undefined,(book,text)=>{navigation=navigateSpreadsheetWorkbook(book,input,identity,text.length,cellValue,options);});
 if(!navigation)throw Error('SPREADSHEET_NAVIGATION_UNAVAILABLE');return{text,result:navigation};
}

export async function extractOfficeTextSnapshot(bytes: Buffer, fileName: string): Promise<{text:string;readingText?:string}> {
  if (!isOfficeDocument(fileName)) refuse('UNSUPPORTED', '处理副本 Office 文本提取仅支持 DOCX 和 XLSX');
  try {
    const extension = path.extname(fileName).toLowerCase();
    validatePackage(bytes, extension);
    if (extension === '.xlsx') return {text:await extractSpreadsheet(bytes)};
    const snapshot=await extractStructuredDocxText(bytes);return {text:checkText(snapshot.text),readingText:snapshot.readingText};
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('OFFICE_')) throw error;
    if ((error as NodeJS.ErrnoException)?.code === 'ERR_BUFFER_TOO_LARGE') refuse('ZIP_LIMIT', 'Office 包实际解压大小超过安全限额，已停止提取');
    refuse('PARSE_FAILED', 'Office 文本提取失败：处理副本可能损坏、加密或使用不支持的结构，请核对文件');
  }
}

/** Original Agent serializer and parser identity are unchanged. */
export async function extractOfficeText(bytes:Buffer,fileName:string):Promise<string>{return(await extractOfficeTextSnapshot(bytes,fileName)).text;}
