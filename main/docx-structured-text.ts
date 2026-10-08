import mammoth from 'mammoth';
import {SaxesParser} from 'saxes';

export const DOCX_STRUCTURE_LIMITS=Object.freeze({htmlBytes:16_000_000,outputBytes:2_000_000,nodes:500_000,depth:128,cells:250_000,headings:10_000});
type Limits=typeof DOCX_STRUCTURE_LIMITS;
type Node={name:string;attributes:Record<string,string>;children:Array<Node|string>};
export type DocxTextStructure={
 headings:Array<{level:number;text:string;locator:string}>;
 tables:Array<{locator:string;rows:Array<{row:number;cells:Array<{cell:number;text:string;colSpan:number;rowSpan:number}>}>;representation:'rows'|'cell_coordinates'}>;
 diagnostics:string[];imagesOmitted:number;
};
const fail=(code:string,message:string):never=>{throw Error(`OFFICE_${code}: ${message}`);};
const isNode=(value:Node|string):value is Node=>typeof value!=='string';
const normalize=(text:string)=>text.replace(/[\t ]+/g,' ').replace(/ *\n */g,'\n').trim();
const escape=(text:string)=>text.replace(/\\/g,'\\\\').replace(/([`*_\[\]<>#])/g,'\\$1');
const cellEscape=(text:string)=>escape(text).replace(/\|/g,'\\|').replace(/\n/g,'<br/>');

/** Parse library-produced XHTML only. No browser, URL requests or image reads.
 * Locators describe this conversion, never OOXML positions or Word page numbers. */
export function renderDocxHtmlStructure(html:string,warnings:string[]=[],limits:Limits=DOCX_STRUCTURE_LIMITS):{text:string;structure:DocxTextStructure}{
 if(Buffer.byteLength(html)>limits.htmlBytes)fail('DOCX_STRUCTURE_LIMIT','DOCX 结构文本超过大小限额，未完成提取');
 const root:Node={name:'root',attributes:{},children:[]},stack=[root];let nodeCount=0,cells=0,headings=0;
 const parser=new SaxesParser({xmlns:false});
 parser.on('doctype',()=>fail('XML_UNSAFE','DOCX 转换结构不允许 DTD'));
 parser.on('processinginstruction',()=>fail('XML_UNSAFE','DOCX 转换结构不允许处理指令'));
 parser.on('error',()=>fail('DOCX_STRUCTURE_PARSE','DOCX 转换结构无法可靠解析，未返回部分正文'));
 parser.on('opentag',tag=>{
  if(++nodeCount>limits.nodes||stack.length>limits.depth)fail('DOCX_STRUCTURE_LIMIT','DOCX 结构节点或深度超过限额，未完成提取');
  const name=tag.name.toLowerCase();if(['td','th'].includes(name)&&++cells>limits.cells)fail('DOCX_STRUCTURE_LIMIT','DOCX 表格单元格超过限额，未完成提取');
  if(/^h[1-6]$/.test(name)&&++headings>limits.headings)fail('DOCX_STRUCTURE_LIMIT','DOCX 标题超过限额，未完成提取');
  const attributes={...tag.attributes};
  const node:Node={name,attributes,children:[]};stack.at(-1)!.children.push(node);stack.push(node);
 });
 parser.on('text',text=>{if(text){if(++nodeCount>limits.nodes)fail('DOCX_STRUCTURE_LIMIT','DOCX 结构节点超过限额，未完成提取');stack.at(-1)!.children.push(text);}});
 parser.on('closetag',()=>{stack.pop();});
 // Mammoth emits XHTML void tags. Accept the named nonbreaking-space entity
 // too; leave other unsupported entities to the strict parser, never resolve them.
 parser.write('<docx-root>'+html.replace(/&nbsp;/g,'&#160;')+'</docx-root>').close();
 const structure:DocxTextStructure={headings:[],tables:[],diagnostics:[...warnings],imagesOmitted:0};
 const diagnose=(message:string)=>{if(!structure.diagnostics.includes(message))structure.diagnostics.push(message);};
 const known=new Set(['root','docx-root','p','h1','h2','h3','h4','h5','h6','table','thead','tbody','tfoot','tr','td','th','ol','ul','li','strong','em','b','i','u','s','strike','sup','sub','a','span','br','img','hr','blockquote']);
 const walk=(node:Node)=>{if(!known.has(node.name))diagnose(`转换节点 ${node.name} 未映射格式，保留其文本；格式覆盖待核对`);if(node.name==='img')structure.imagesOmitted++;node.children.filter(isNode).forEach(walk);};walk(root);
 const imageText=(node:Node)=>'[图片省略，未读取图片，未做 OCR'+(node.attributes.alt?`；来源替代文字（非 OCR）：${normalize(node.attributes.alt)}`:'')+']';
 const plain=(node:Node,omitTables=false):string=>{
  if(omitTables&&node.name==='table')return '[嵌套表格另列]';
  if(node.name==='br')return '\n';
  if(node.name==='img')return imageText(node);
  if(node.name==='ol'||node.name==='ul'){
   let index=Number(node.attributes.start??1);if(!Number.isInteger(index)||index<1)index=1;
   return node.children.map(child=>typeof child==='string'?child:(child.name==='li'?(node.name==='ol'?index+++'. ':'- '):'')+plain(child,omitTables)+'\n').join('');
  }
  const content=node.children.map(child=>typeof child==='string'?child:plain(child,omitTables)+(['p','li','tr'].includes(child.name)?'\n':'')).join('');
  return content+(node.name==='a'&&node.attributes.href?` [链接：${node.attributes.href}；未请求]`:'');
 };
 let tableNumber=0,headingNumber=0;
 const span=(cell:Node,key:string)=>{const raw=cell.attributes[key];if(raw===undefined)return 1;const value=Number(raw);if(!Number.isInteger(value)||value<1||value>limits.cells)fail('DOCX_STRUCTURE_LIMIT','DOCX 表格跨度无效或超过限额');return value;};
 const containsTable=(node:Node):boolean=>node.children.some(child=>isNode(child)&&(child.name==='table'||containsTable(child)));
 const render=(node:Node,indent=0):string=>{
  if(node.name==='table'){
   const locator=`docx-html/table[${++tableNumber}]`,rows:Node[]=[];
   const collect=(parent:Node)=>{for(const child of parent.children.filter(isNode))if(child.name==='tr')rows.push(child);else if(['thead','tbody','tfoot'].includes(child.name))collect(child);};collect(node);
   const descriptor={locator,rows:rows.map((row,index)=>({row:index+1,cells:row.children.filter(child=>isNode(child)&&['td','th'].includes(child.name)).map((cell,index)=>({cell:index+1,text:normalize(plain(cell as Node,true)),colSpan:span(cell as Node,'colspan'),rowSpan:span(cell as Node,'rowspan')}))})),representation:'rows' as 'rows'|'cell_coordinates'};
   const nested=containsTable(node),width=descriptor.rows[0]?.cells.length??0;
   const simple=width>0&&!nested&&descriptor.rows.every(row=>row.cells.length===width&&row.cells.every(cell=>cell.colSpan===1&&cell.rowSpan===1));
   descriptor.representation=simple?'rows':'cell_coordinates';structure.tables.push(descriptor);
   if(simple){
    const lines=descriptor.rows.map(row=>'|'+row.cells.map(cell=>cellEscape(cell.text)).join('|')+'|');
    lines.splice(1,0,'|'+Array.from({length:width},()=>'---').join('|')+'|');
    return `[表格 table[${tableNumber}]]\n${lines.join('\n')}\n\n`;
   }
   diagnose(`${locator} 含合并、嵌套、不等列或空表；使用行/格序号，未推断业务列归属或展开网格`);
   let text=`[表格 ${locator}；行/格序号为转换后节点序号，非 Word 网格坐标；列归属待核对]\n`;
   for(let index=0;index<rows.length;index++){
    const row=descriptor.rows[index];for(let j=0;j<row.cells.length;j++){
     const cell=row.cells[j];text+=`- 行 ${row.row} / 格 ${cell.cell}（横跨 ${cell.colSpan}，纵跨 ${cell.rowSpan}）：${cellEscape(cell.text)||'[空格]'}\n`;
     const actual=rows[index].children.filter(child=>isNode(child)&&['td','th'].includes(child.name))[j] as Node;
     const nestedTables=(parent:Node)=>{for(const child of parent.children.filter(isNode))if(child.name==='table')text+=render(child,indent+1);else nestedTables(child);};nestedTables(actual);
    }
   }
   return text+'\n';
  }
  if(/^h[1-6]$/.test(node.name)){const level=Number(node.name[1]),text=normalize(plain(node)).replace(/\n/g,' ');structure.headings.push({level,text,locator:`docx-html/heading[${++headingNumber}]`});return '#'.repeat(level)+' '+escape(text)+'\n\n';}
  if(node.name==='ul'||node.name==='ol'){
   let index=Number(node.attributes.start??1);if(!Number.isInteger(index)||index<1)index=1;
   return node.children.filter(isNode).map(child=>child.name==='li'?`${'  '.repeat(indent)}${node.name==='ol'?index+++'.':'-'} ${child.children.map(part=>typeof part==='string'?escape(part):['ul','ol'].includes(part.name)?'\n'+render(part,indent+1):render(part,indent)).join('').trimEnd()}\n`:render(child,indent)).join('')+'\n';
  }
  if(node.name==='img')return escape(imageText(node));
  if(node.name==='br')return '\n';
  if(node.name==='hr')return '\n---\n\n';
  const children=node.children.map(child=>typeof child==='string'?escape(child):render(child,indent)).join('');
  if(node.name==='a'&&node.attributes.href)return children+` [链接：${escape(node.attributes.href)}；未请求]`;
  if(['p','blockquote'].includes(node.name))return children.trimEnd()+'\n\n';
  return children;
 };
 const body=render(root).trim()||'[未找到可提取的正文文本]';
 const header='[DOCX 正文文本提取；保留转换后的标题层级、列表与表格行格；普通表格按原行列顺序，第一行仅为结构展示，不确认其为业务表头；图片未做 OCR，页眉页脚和版式未提取；列表编号为转换序号；不确认模板示例或业务含义]';
 const diagnostics=structure.diagnostics.length?'\n\n[提取诊断]\n'+structure.diagnostics.map(message=>'- '+escape(message)).join('\n'):'';
 const text=header+'\n'+body+diagnostics+'\n';
 if(Buffer.byteLength(text)>limits.outputBytes)fail('TEXT_LIMIT','提取文本超过 2 MB，未完成全文提取；请拆分处理副本后重试');
 return{text,structure};
}

/** Caller must validate the Office package before invoking the library. */
export async function extractStructuredDocxText(bytes:Buffer):Promise<{text:string;structure:DocxTextStructure}>{
 const result=await mammoth.convertToHtml({buffer:bytes},{includeEmbeddedStyleMap:false,externalFileAccess:false,ignoreEmptyParagraphs:false,convertImage:mammoth.images.imgElement(async()=>({src:'docx-image-omitted'}))});
 if(result.messages.some(message=>message.type==='error'))fail('DOCX_PARSE','DOCX 正文无法完整提取，请核对处理副本');
 return renderDocxHtmlStructure(result.value,result.messages.map(message=>message.type+': '+message.message));
}
