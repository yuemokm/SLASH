import fs from 'node:fs/promises';
import {constants as fsConstants} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import AdmZip from 'adm-zip';
import {
 AlignmentType,
 BorderStyle,
 Document,
 HeadingLevel,
 Packer,
 Paragraph,
 ShadingType,
 Table,
 TableCell,
 TableRow,
 TextRun,
 VerticalAlign,
 WidthType,
 type IParagraphOptions,
} from 'docx';
import type {Change} from '../shared/types.js';
import type {Files} from './files.js';

export type ArtifactFileRef={mountId:string;path:string};

export type MarkdownSection={
 id:string|null;
 title:string;
 level:number;
 line:number;
 headingStart:number;
 headingEnd:number;
 bodyStart:number;
 subtreeEnd:number;
};

export type TemplateSectionExpectation={
 id:string;
 level:number;
 title?:string;
 required?:boolean;
 parentId?:string|null;
};

export type MarkdownStructureIssue={
 code:'MISSING_SECTION_ID'|'DUPLICATE_SECTION_ID'|'MALFORMED_SECTION_ID'|'INVALID_LEVEL_GAP'|'MISSING_SECTION'|'UNEXPECTED_SECTION'|'LEVEL_MISMATCH'|'TITLE_MISMATCH'|'PARENT_MISMATCH'|'ORDER_MISMATCH'|'INVALID_EXPECTATION';
 message:string;
 sectionId?:string;
 line?:number;
};

export type MarkdownStructureValidation={valid:boolean;sections:MarkdownSection[];issues:MarkdownStructureIssue[]};
export type MarkdownSectionShift={markdown:string;sectionId:string;direction:'promote'|'demote';changes:Array<{id:string|null;title:string;fromLevel:number;toLevel:number;line:number}>};

type ParsedHeading=MarkdownSection&{markerMalformed:boolean};
const sectionMarker=/<!--\s*pm-section:([A-Za-z0-9][A-Za-z0-9_.:-]{0,127})\s*-->\s*$/;

function markdownLines(markdown:string){
 const lines:Array<{text:string;start:number;end:number;line:number}>=[];
 let start=0,line=1;
 while(start<markdown.length){const match=/\r\n|\n|\r/.exec(markdown.slice(start));const end=match?start+(match.index??0)+match[0].length:markdown.length;const raw=markdown.slice(start,end);lines.push({text:raw.replace(/(?:\r\n|\n|\r)$/,''),start,end,line});start=end;line++;}
 if(markdown.length===0||/(?:\r\n|\n|\r)$/.test(markdown))lines.push({text:'',start:markdown.length,end:markdown.length,line});
 return lines;
}

function parseHeadings(markdown:string):ParsedHeading[]{
 const found:ParsedHeading[]=[];let fence:{character:string;length:number}|undefined;
 for(const item of markdownLines(markdown)){
  const trimmed=item.text.trimStart();const fenceMatch=/^(`{3,}|~{3,})/.exec(trimmed);
  if(fenceMatch){const token=fenceMatch[1];if(!fence)fence={character:token[0],length:token.length};else if(token[0]===fence.character&&token.length>=fence.length)fence=undefined;continue;}
  if(fence)continue;
  const heading=/^(#{1,6})[ \t]+(.+?)[ \t]*$/.exec(item.text);if(!heading)continue;
  const rawTitle=heading[2];const marker=sectionMarker.exec(rawTitle);const title=(marker?rawTitle.slice(0,marker.index):rawTitle).trimEnd();
  found.push({id:marker?.[1]??null,title,level:heading[1].length,line:item.line,headingStart:item.start,headingEnd:item.end,bodyStart:item.end,subtreeEnd:markdown.length,markerMalformed:/<!--\s*pm-section:/i.test(rawTitle)&&!marker});
 }
 for(let i=0;i<found.length;i++){const current=found[i];for(let j=i+1;j<found.length;j++){if(found[j].level<=current.level){current.subtreeEnd=found[j].headingStart;break;}}}
 return found;
}

export function parseMarkdownSections(markdown:string):MarkdownSection[]{return parseHeadings(markdown).map(({markerMalformed:_,...section})=>section);}

export function shiftMarkdownSection(markdown:string,sectionId:string,direction:'promote'|'demote'):MarkdownSectionShift{
 const sections=parseHeadings(markdown);const matches=sections.filter(section=>section.id===sectionId);
 if(matches.length===0)throw Error(`SECTION_NOT_FOUND: ${sectionId}`);if(matches.length>1)throw Error(`DUPLICATE_SECTION_ID: ${sectionId}`);
 const root=matches[0];const delta=direction==='promote'?-1:1;const affected=sections.filter(section=>section.headingStart>=root.headingStart&&section.headingStart<root.subtreeEnd);
 if(affected.some(section=>section.level+delta<1))throw Error('SECTION_LEVEL_LIMIT: 顶级章节不能再提升');
 if(affected.some(section=>section.level+delta>6))throw Error('SECTION_LEVEL_LIMIT: Markdown 标题不能超过六级');
 let output=markdown;for(const section of [...affected].sort((a,b)=>b.headingStart-a.headingStart)){output=output.slice(0,section.headingStart)+'#'.repeat(section.level+delta)+output.slice(section.headingStart+section.level);}
 return{markdown:output,sectionId,direction,changes:affected.map(section=>({id:section.id,title:section.title,fromLevel:section.level,toLevel:section.level+delta,line:section.line}))};
}

function actualParentId(sections:ParsedHeading[],index:number){const level=sections[index].level;for(let i=index-1;i>=0;i--)if(sections[i].level<level)return sections[i].id;return null;}
function expectedParentId(sections:TemplateSectionExpectation[],index:number){if(sections[index].parentId!==undefined)return sections[index].parentId;const level=sections[index].level;for(let i=index-1;i>=0;i--)if(sections[i].level<level)return sections[i].id;return null;}

export function validateMarkdownStructure(markdown:string,expected:TemplateSectionExpectation[]=[]):MarkdownStructureValidation{
 const sections=parseHeadings(markdown);const issues:MarkdownStructureIssue[]=[];const ids=new Map<string,ParsedHeading[]>();
 for(let i=0;i<sections.length;i++){const section=sections[i];if(section.markerMalformed)issues.push({code:'MALFORMED_SECTION_ID',message:'章节标识格式无效',line:section.line});if(!section.id)issues.push({code:'MISSING_SECTION_ID',message:'标题缺少稳定章节标识',line:section.line});else{const group=ids.get(section.id)??[];group.push(section);ids.set(section.id,group);}if(i>0&&section.level>sections[i-1].level+1)issues.push({code:'INVALID_LEVEL_GAP',message:`标题层级从 ${sections[i-1].level} 跳到 ${section.level}`,sectionId:section.id??undefined,line:section.line});}
 for(const [id,group] of ids)if(group.length>1)for(const section of group)issues.push({code:'DUPLICATE_SECTION_ID',message:`章节标识 ${id} 重复`,sectionId:id,line:section.line});
 const expectedIds=new Map<string,number>();for(let i=0;i<expected.length;i++){const section=expected[i];if(section.level<1||section.level>6||expectedIds.has(section.id))issues.push({code:'INVALID_EXPECTATION',message:`模板章节 ${section.id} 的标识或层级无效`,sectionId:section.id});else expectedIds.set(section.id,i);}
 let lastActualIndex=-1;
 for(let i=0;i<expected.length;i++){const wanted=expected[i];const group=ids.get(wanted.id)??[];if(group.length===0){if(wanted.required!==false)issues.push({code:'MISSING_SECTION',message:`缺少章节 ${wanted.id}`,sectionId:wanted.id});continue;}const actual=group[0];const actualIndex=sections.indexOf(actual);if(actual.level!==wanted.level)issues.push({code:'LEVEL_MISMATCH',message:`章节 ${wanted.id} 应为 ${wanted.level} 级，实际为 ${actual.level} 级`,sectionId:wanted.id,line:actual.line});if(wanted.title!==undefined&&actual.title!==wanted.title)issues.push({code:'TITLE_MISMATCH',message:`章节 ${wanted.id} 标题应为“${wanted.title}”`,sectionId:wanted.id,line:actual.line});const wantedParent=expectedParentId(expected,i);const actualParent=actualParentId(sections,actualIndex);if(actualParent!==wantedParent)issues.push({code:'PARENT_MISMATCH',message:`章节 ${wanted.id} 的父章节应为 ${wantedParent??'无'}`,sectionId:wanted.id,line:actual.line});if(actualIndex<lastActualIndex)issues.push({code:'ORDER_MISMATCH',message:`章节 ${wanted.id} 顺序与模板不一致`,sectionId:wanted.id,line:actual.line});lastActualIndex=Math.max(lastActualIndex,actualIndex);}
 for(const section of sections)if(section.id&&!expectedIds.has(section.id)&&expected.length>0)issues.push({code:'UNEXPECTED_SECTION',message:`模板中没有章节 ${section.id}`,sectionId:section.id,line:section.line});
 return{valid:issues.length===0,sections:sections.map(({markerMalformed:_,...section})=>section),issues};
}

export type FileVersionSummary={
 id:string;
 label:string;
 createdAt:string;
 runId:string|null;
 source:'current'|'change_snapshot';
 contentHash:string;
 size:number;
 restorable:boolean;
};

type StoredChange=Change&{previousContent?:unknown};
const digest=(content:string|Buffer)=>createHash('sha256').update(content).digest('hex');
const validVersionFile=/^[A-Za-z0-9_-]{1,200}\.json$/;

async function readStoredChange(file:string):Promise<StoredChange|null>{try{const parsed:unknown=JSON.parse(await fs.readFile(file,'utf8'));if(!parsed||typeof parsed!=='object')return null;const value=parsed as Partial<StoredChange>;if(typeof value.id!=='string'||typeof value.runId!=='string'||typeof value.mountId!=='string'||typeof value.path!=='string'||typeof value.createdAt!=='string')return null;return value as StoredChange;}catch{return null;}}
function sameTarget(change:StoredChange,target:ArtifactFileRef){return change.mountId===target.mountId&&path.normalize(change.path)===path.normalize(target.path);}

export async function listFileVersions(files:Files,backupDir:string,target:ArtifactFileRef):Promise<FileVersionSummary[]>{
 const targetPath=await files.resolve(target.mountId,target.path);const versions:FileVersionSummary[]=[];
 try{const current=await fs.readFile(targetPath);const stat=await fs.stat(targetPath);versions.push({id:'current',label:'当前版本',createdAt:stat.mtime.toISOString(),runId:null,source:'current',contentHash:digest(current),size:current.length,restorable:false});}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 let entries:string[];try{entries=await fs.readdir(backupDir);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return versions;throw error;}
 const historical:FileVersionSummary[]=[];for(const name of entries){if(!validVersionFile.test(name))continue;const stored=await readStoredChange(path.join(backupDir,name));if(!stored||!sameTarget(stored,target)||typeof stored.previousContent!=='string')continue;const stat=await fs.stat(path.join(backupDir,name));historical.push({id:`before:${stored.id}`,label:`历史快照 · ${stat.mtime.toISOString()}`,createdAt:stat.mtime.toISOString(),runId:stored.runId,source:'change_snapshot',contentHash:digest(stored.previousContent),size:Buffer.byteLength(stored.previousContent),restorable:true});}
 historical.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));return[...versions,...historical];
}

export async function readFileVersion(files:Files,backupDir:string,target:ArtifactFileRef,versionId:string):Promise<{content:string;summary:FileVersionSummary}>{
 const targetPath=await files.resolve(target.mountId,target.path);if(versionId==='current'){const content=await fs.readFile(targetPath,'utf8');const stat=await fs.stat(targetPath);return{content,summary:{id:'current',label:'当前版本',createdAt:stat.mtime.toISOString(),runId:null,source:'current',contentHash:digest(content),size:Buffer.byteLength(content),restorable:false}};}
 if(!versionId.startsWith('before:'))throw Error('INVALID_VERSION_ID');const changeId=versionId.slice('before:'.length);const name=`${changeId}.json`;if(!validVersionFile.test(name))throw Error('INVALID_VERSION_ID');const file=path.join(backupDir,name);const stored=await readStoredChange(file);if(!stored||!sameTarget(stored,target))throw Error('VERSION_NOT_FOUND');if(typeof stored.previousContent!=='string')throw Error('VERSION_NOT_RESTORABLE');const stat=await fs.stat(file);return{content:stored.previousContent,summary:{id:versionId,label:`历史快照 · ${stat.mtime.toISOString()}`,createdAt:stat.mtime.toISOString(),runId:stored.runId,source:'change_snapshot',contentHash:digest(stored.previousContent),size:Buffer.byteLength(stored.previousContent),restorable:true}};
}

export async function prepareRestoreDraft(files:Files,backupDir:string,target:ArtifactFileRef,versionId:string,runId:string):Promise<Change>{
 if(versionId==='current')throw Error('VERSION_NOT_RESTORABLE');await files.resolve(target.mountId,target.path,true);const version=await readFileVersion(files,backupDir,target,versionId);if(!version.summary.restorable)throw Error('VERSION_NOT_RESTORABLE');return files.draft(target.mountId,target.path,version.content,runId);
}

export type HtmlProjectPackageOptions={source:ArtifactFileRef;output:ArtifactFileRef;entryFile?:string;overwrite?:boolean;limits?:{maxFiles?:number;maxBytes?:number}};
export type HtmlProjectPackageResult={packageKind:'source_zip';output:ArtifactFileRef;entryFile:string;fileCount:number;sourceBytes:number;zipBytes:number;files:string[]};

function assertArchivePath(relative:string){const normalized=relative.replaceAll('\\','/');if(!normalized||normalized.startsWith('/')||normalized.split('/').some(part=>part===''||part==='.'||part==='..'))throw Error(`INVALID_ARCHIVE_PATH: ${relative}`);return normalized;}
async function writeAuthorizedBuffer(files:Files,target:ArtifactFileRef,data:Buffer,overwrite=false){const output=await files.resolve(target.mountId,target.path,true);await fs.mkdir(path.dirname(output),{recursive:true});await files.resolve(target.mountId,target.path,true);const temp=`${output}.${randomUUID()}.tmp`;try{await fs.writeFile(temp,data,{flag:'wx'});await files.resolve(target.mountId,target.path,true);if(overwrite)await fs.rename(temp,output);else{try{await fs.copyFile(temp,output,fsConstants.COPYFILE_EXCL);}catch(error){if((error as NodeJS.ErrnoException).code==='EEXIST')throw Error('OUTPUT_EXISTS: 目标文件已存在');throw error;}}}finally{await fs.rm(temp,{force:true});}return output;}

export async function packageHtmlProject(files:Files,options:HtmlProjectPackageOptions):Promise<HtmlProjectPackageResult>{
 const sourceRoot=await files.resolve(options.source.mountId,options.source.path);const sourceStat=await fs.lstat(sourceRoot);if(sourceStat.isSymbolicLink())throw Error('SYMLINK_NOT_ALLOWED: 项目根目录不能是符号链接');if(!sourceStat.isDirectory())throw Error('HTML_PROJECT_NOT_DIRECTORY');
 const entryFile=assertArchivePath(options.entryFile??'index.html');if(!/\.html?$/i.test(entryFile))throw Error('HTML_ENTRY_NOT_HTML');const entryPath=await files.resolve(options.source.mountId,path.join(options.source.path,entryFile));if(!(await fs.stat(entryPath)).isFile())throw Error('HTML_ENTRY_NOT_FILE');
 const outputPath=await files.resolve(options.output.mountId,options.output.path,true);const maxFiles=options.limits?.maxFiles??5000,maxBytes=options.limits?.maxBytes??100*1024*1024;const collected:Array<{name:string;data:Buffer}>=[];let sourceBytes=0;
 const walk=async(relativeDir:string):Promise<void>=>{const directoryRef=relativeDir?path.join(options.source.path,relativeDir):options.source.path;const directory=await files.resolve(options.source.mountId,directoryRef);for(const entry of await fs.readdir(directory,{withFileTypes:true})){const relative=relativeDir?path.join(relativeDir,entry.name):entry.name;const archiveName=assertArchivePath(relative);const refPath=path.join(options.source.path,relative);const absolute=await files.resolve(options.source.mountId,refPath);const stat=await fs.lstat(absolute);if(stat.isSymbolicLink()||entry.isSymbolicLink())throw Error(`SYMLINK_NOT_ALLOWED: ${archiveName}`);if(stat.isDirectory()){await walk(relative);continue;}if(!stat.isFile())throw Error(`UNSUPPORTED_PROJECT_ENTRY: ${archiveName}`);if(path.resolve(absolute)===path.resolve(outputPath))continue;if(collected.length+1>maxFiles)throw Error(`PACKAGE_LIMIT_EXCEEDED: 文件数超过 ${maxFiles}`);sourceBytes+=stat.size;if(sourceBytes>maxBytes)throw Error(`PACKAGE_LIMIT_EXCEEDED: 文件总大小超过 ${maxBytes}`);collected.push({name:archiveName,data:await fs.readFile(absolute)});}};
 await walk('');if(!collected.some(file=>file.name.toLowerCase()===entryFile.toLowerCase()))throw Error('HTML_ENTRY_NOT_INCLUDED');const zip=new AdmZip();for(const file of collected.sort((a,b)=>a.name.localeCompare(b.name)))zip.addFile(file.name,file.data);const buffer=zip.toBuffer();await writeAuthorizedBuffer(files,options.output,buffer,options.overwrite);return{packageKind:'source_zip',output:options.output,entryFile,fileCount:collected.length,sourceBytes,zipBytes:buffer.length,files:collected.map(file=>file.name)};
}

export type WordExportWarning={code:'IMAGE_AS_TEXT'|'RAW_HTML_AS_TEXT'|'TABLE_NORMALIZED'|'UNCLOSED_CODE_FENCE';message:string;line:number};
export type WordConversionReport={sourceFormat:'markdown';targetFormat:'docx';warnings:WordExportWarning[];blocks:number;outputBytes:number};
export type MarkdownToDocxResult={buffer:Buffer;report:WordConversionReport};
export type WordExportOptions={creator?:string;title?:string;subject?:string};

const headingLevels=[HeadingLevel.HEADING_1,HeadingLevel.HEADING_2,HeadingLevel.HEADING_3,HeadingLevel.HEADING_4,HeadingLevel.HEADING_5,HeadingLevel.HEADING_6] as const;
function plainInlineMarkdown(value:string){return value.replace(/!\[([^\]]*)\]\(([^)]+)\)/g,'[图片: $1] ($2)').replace(/\[([^\]]+)\]\(([^)]+)\)/g,'$1 ($2)').replace(/(`|\*\*|__|\*|_)(.*?)\1/g,'$2');}
function paragraph(text:string,options:Omit<IParagraphOptions,'children'|'text'>={}):Paragraph{return new Paragraph({...options,children:[new TextRun({text:plainInlineMarkdown(text),font:'Microsoft YaHei',size:22,color:'000000'})]});}
function pipeCells(line:string){let value=line.trim();if(value.startsWith('|'))value=value.slice(1);if(value.endsWith('|')&&!value.endsWith('\\|'))value=value.slice(0,-1);const cells:string[]=[];let current='';for(let i=0;i<value.length;i++){if(value[i]==='\\'&&value[i+1]==='|'){current+='|';i++;continue;}if(value[i]==='|'){cells.push(current.trim());current='';continue;}current+=value[i];}cells.push(current.trim());return cells;}
function isTableSeparator(line:string){const cells=pipeCells(line);return cells.length>0&&cells.every(cell=>/^:?-{3,}:?$/.test(cell));}
const tableBorders={top:{style:BorderStyle.SINGLE,size:1,color:'D9D9D9'},bottom:{style:BorderStyle.SINGLE,size:1,color:'D9D9D9'},left:{style:BorderStyle.SINGLE,size:1,color:'D9D9D9'},right:{style:BorderStyle.SINGLE,size:1,color:'D9D9D9'},insideHorizontal:{style:BorderStyle.SINGLE,size:1,color:'D9D9D9'},insideVertical:{style:BorderStyle.SINGLE,size:1,color:'D9D9D9'}};
function wordTable(rows:string[][]){const columns=Math.max(...rows.map(row=>row.length));return new Table({width:{size:100,type:WidthType.PERCENTAGE},borders:tableBorders,rows:rows.map((row,rowIndex)=>new TableRow({...(rowIndex===0?{tableHeader:true}:{}),children:Array.from({length:columns},(_,columnIndex)=>new TableCell({verticalAlign:VerticalAlign.CENTER,margins:{top:100,right:120,bottom:100,left:120},shading:rowIndex===0?{type:ShadingType.CLEAR,fill:'D9EAF7',color:'auto'}:undefined,children:[new Paragraph({alignment:columnIndex===0?AlignmentType.LEFT:AlignmentType.CENTER,spacing:{after:0,line:260},children:[new TextRun({text:plainInlineMarkdown(row[columnIndex]??''),bold:rowIndex===0,font:'Microsoft YaHei',size:20,color:'000000'})]})]}))}))});}

export async function markdownToDocx(markdown:string,options:WordExportOptions={}):Promise<MarkdownToDocxResult>{
 const children:Array<Paragraph|Table>=[];const warnings:WordExportWarning[]=[];const lines=markdownLines(markdown);let codeFence:string|undefined;let paragraphLines:string[]=[];
 const flush=()=>{if(paragraphLines.length){children.push(paragraph(paragraphLines.join(' '),{spacing:{after:160,line:300}}));paragraphLines=[];}};
 for(let lineIndex=0;lineIndex<lines.length;lineIndex++){const item=lines[lineIndex];const fence=/^\s*(`{3,}|~{3,})/.exec(item.text);if(fence){flush();if(!codeFence){codeFence=fence[1][0];continue;}if(fence[1][0]===codeFence){codeFence=undefined;continue;}}
  if(codeFence){children.push(paragraph(item.text,{style:'CodeBlock',spacing:{after:0,line:260}}));continue;}
  const heading=/^(#{1,6})[ \t]+(.+?)[ \t]*$/.exec(item.text);if(heading){flush();const marker=sectionMarker.exec(heading[2]);const title=(marker?heading[2].slice(0,marker.index):heading[2]).trimEnd();children.push(paragraph(title,{heading:headingLevels[heading[1].length-1],spacing:{before:240,after:100}}));continue;}
  const bullet=/^\s*[-+*]\s+(.+)$/.exec(item.text);if(bullet){flush();children.push(paragraph(bullet[1],{bullet:{level:0},spacing:{after:80}}));continue;}
  const ordered=/^\s*(\d+)[.)]\s+(.+)$/.exec(item.text);if(ordered){flush();children.push(paragraph(`${ordered[1]}. ${ordered[2]}`,{indent:{left:360,hanging:180},spacing:{after:80}}));continue;}
  if(item.text.includes('|')&&lineIndex+1<lines.length&&isTableSeparator(lines[lineIndex+1].text)){flush();const rows=[pipeCells(item.text)];const expectedColumns=rows[0].length;lineIndex+=2;while(lineIndex<lines.length&&lines[lineIndex].text.includes('|')&&lines[lineIndex].text.trim()!==''){const row=pipeCells(lines[lineIndex].text);if(row.length!==expectedColumns)warnings.push({code:'TABLE_NORMALIZED',message:`表格行列数从 ${row.length} 规范为 ${expectedColumns}`,line:lines[lineIndex].line});rows.push(row.slice(0,expectedColumns));lineIndex++;}lineIndex--;children.push(wordTable(rows));continue;}
  if(/<\/?[A-Za-z][^>]*>/.test(item.text))warnings.push({code:'RAW_HTML_AS_TEXT',message:'原始 HTML 按文本导出',line:item.line});if(/!\[[^\]]*\]\([^)]+\)/.test(item.text))warnings.push({code:'IMAGE_AS_TEXT',message:'图片未嵌入，已保留替代文字和地址',line:item.line});
  if(item.text.trim()===''){flush();continue;}paragraphLines.push(item.text.trim());
 }
 flush();if(codeFence)warnings.push({code:'UNCLOSED_CODE_FENCE',message:'代码围栏未闭合，末尾内容仍按代码导出',line:lines.at(-1)?.line??1});
 const document=new Document({creator:options.creator??'slash',title:options.title,subject:options.subject,styles:{default:{document:{run:{font:'Microsoft YaHei',size:22,color:'000000'},paragraph:{spacing:{line:300,after:160}}}},paragraphStyles:[{id:'CodeBlock',name:'Code Block',basedOn:'Normal',next:'Normal',run:{font:'Consolas',size:19,color:'000000'},paragraph:{spacing:{line:260,after:0},indent:{left:240}}}]},sections:[{properties:{page:{size:{width:12240,height:15840},margin:{top:1080,right:1080,bottom:1080,left:1080}}},children}]});
 const buffer=await Packer.toBuffer(document);return{buffer,report:{sourceFormat:'markdown',targetFormat:'docx',warnings,blocks:children.length,outputBytes:buffer.length}};
}

export type WordExportRequest={source:ArtifactFileRef;output:ArtifactFileRef;overwrite?:boolean;options?:WordExportOptions};
export type WordExportResult=WordConversionReport&{output:ArtifactFileRef};
export async function exportMarkdownToWord(files:Files,input:WordExportRequest):Promise<WordExportResult>{const source=await files.resolve(input.source.mountId,input.source.path);if(await files.isReferencePath(source))throw Error('PROCESSING_COPY_REQUIRED: 参考资料格式转换须先创建独立处理副本');const markdown=await files.read(input.source.mountId,input.source.path);const converted=await markdownToDocx(markdown,input.options);await writeAuthorizedBuffer(files,input.output,converted.buffer,input.overwrite);return{output:input.output,...converted.report};}
