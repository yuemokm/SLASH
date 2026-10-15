import path from 'node:path';
import AdmZip from 'adm-zip';
import {SaxesParser} from 'saxes';
import {CONTEXT_TEXT_EXTENSIONS} from '../shared/context-attachments.js';
import {extractOfficeTextSnapshot,OFFICE_TEXT_PARSER_VERSION,validateOfficePackage} from './office-extraction.js';
import {extractPdfTextBytes} from './files.js';

function pptxText(bytes:Buffer):string{
 validateOfficePackage(bytes,'.pptx');const zip=new AdmZip(bytes);
 const parse=(name:string,visit:(tag:any)=>void,text?:(value:string)=>void,close?:(tag:any)=>void)=>{const entry=zip.getEntry(name);if(!entry)throw Error('PPTX_INVALID: 缺少幻灯片或顺序信息');const parser=new SaxesParser({xmlns:true});parser.on('opentag',visit);if(text)parser.on('text',text);if(text)parser.on('cdata',text);if(close)parser.on('closetag',close);parser.write(entry.getData().toString('utf8')).close();};
 const slideIds:string[]=[],relations=new Map<string,string>();
 parse('ppt/presentation.xml',tag=>{if(tag.local==='sldId'&&tag.uri==='http://schemas.openxmlformats.org/presentationml/2006/main'){const id=Object.values(tag.attributes).find((attr:any)=>attr.local==='id'&&attr.uri==='http://schemas.openxmlformats.org/officeDocument/2006/relationships') as any;if(!id)throw Error('PPTX_INVALID: 幻灯片缺少关系ID');slideIds.push(id.value);}});
 if(!slideIds.length||slideIds.length>200||new Set(slideIds).size!==slideIds.length)throw Error('PPTX_PAGE_LIMIT: 幻灯片顺序无效或超过200页');
 parse('ppt/_rels/presentation.xml.rels',tag=>{if(tag.local!=='Relationship')return;const attr=(key:string)=>tag.attributes[key]?.value;const type=attr('Type');if(!type?.endsWith('/slide'))return;const id=attr('Id'),target=attr('Target');if(attr('TargetMode')==='External'||!/^slides\/slide\d+\.xml$/.test(target??'')||relations.has(id))throw Error('PPTX_INVALID: 幻灯片关系无效或指向外部');relations.set(id,'ppt/'+target);});
 let extracted=0;return slideIds.map((id,index)=>{const slide=relations.get(id);if(!slide)throw Error('PPTX_INVALID: 无法定位实际幻灯片');let inText=false,body='',hasText=false;parse(slide,tag=>{if(tag.local==='t'&&tag.uri==='http://schemas.openxmlformats.org/drawingml/2006/main')inText=true;},value=>{if(inText){hasText ||= Boolean(value.trim());body+=value;if((extracted+=value.length)>1_000_000)throw Error('PPTX_TEXT_LIMIT: 幻灯片文字超过100万字符');}},tag=>{if(tag.local==='t')inText=false;if(tag.local==='p')body+='\n';});return hasText?`第 ${index+1} 页\n${body.trim()}`:'';}).filter(Boolean).join('\n\n');
}
function decodeText(bytes:Buffer):string{
 try{
  if(bytes[0]===0xff&&bytes[1]===0xfe)return new TextDecoder('utf-16le',{fatal:true}).decode(bytes.subarray(2));
  if(bytes[0]===0xfe&&bytes[1]===0xff)return new TextDecoder('utf-16be',{fatal:true}).decode(bytes.subarray(2));
  if(bytes.includes(0))throw Error('binary');
  return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
 }catch{throw Error('ATTACHMENT_ENCODING_UNSUPPORTED: 文本文件不是有效UTF-8或带BOM的UTF-16；请转为UTF-8后添加');}
}
export async function extractContextAttachment(bytes:Buffer,name:string){
 const ext=path.extname(name).toLowerCase();let text:string,parserVersion:string,mimeType:string,limitations:string[]=[];
 if(ext==='.pdf'){text=await extractPdfTextBytes(bytes);parserVersion='pdf-parse-2.4.5-text-v1';mimeType='application/pdf';limitations=['仅提取可读文字；图片、扫描内容与视觉布局未读取，未做OCR。'];}
 else if(ext==='.docx'||ext==='.xlsx'){const snapshot=await extractOfficeTextSnapshot(bytes,name);text=snapshot.text;const hasBody=ext==='.docx'?Boolean(snapshot.readingText?.replace(/\[图片省略[^\]]*\]|\[未找到可提取的正文文本\]/g,'').trim()):/^[A-Z]+[1-9]\d*(?: \[[^\]]*\])?:/m.test(text);if(!hasBody)throw Error('ATTACHMENT_TEXT_UNAVAILABLE: 文档没有可读正文或表格没有非空单元格；图片未做OCR');parserVersion=OFFICE_TEXT_PARSER_VERSION;mimeType=ext==='.docx'?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';limitations=[ext==='.docx'?'仅提取文字与表格结构；图片未读取，未做OCR。':'仅提取表格文字与已有公式缓存；公式未执行，图表与图片未读取。'];}
 else if(ext==='.pptx'){text=pptxText(bytes);parserVersion='pptx-slide-text-v1';mimeType='application/vnd.openxmlformats-officedocument.presentationml.presentation';limitations=['按实际页顺序提取幻灯片文字；图片、图表、备注和视觉布局未读取，未做OCR。'];}
 else if(CONTEXT_TEXT_EXTENSIONS.some(value=>ext==='.'+value)){text=decodeText(bytes);parserVersion='plain-text-utf8-utf16-v1';mimeType='text/plain';if(['.html','.htm','.svg','.xml'].includes(ext))limitations=['作为源文本读取；未执行脚本、实体或外部链接。'];}
 else throw Error('ATTACHMENT_FORMAT_UNSUPPORTED: 支持PDF、DOCX、XLSX、PPTX及常用文本/代码；DOC、XLS、PPT请先转为新版Office格式');
 if(!text.trim())throw Error('ATTACHMENT_TEXT_UNAVAILABLE: 文件没有可读文字；图片或扫描件请提供可读文字版本');
 return{text,parserVersion,mimeType,limitations};
}
