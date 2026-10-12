import {isTestCasePath,parseTestCaseSuite} from '../shared/test-cases.js';
import fs from 'node:fs/promises';
import {constants as fsConstants} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {extractOfficeText,OFFICE_TEXT_PARSER_VERSION} from './office-extraction.js';
import type {DocxTextExtraction} from '../shared/docx-read-identity.js';
import {PDFParse} from 'pdf-parse';
import type {Mount,FileRef,Change,ImportedFile,ImportCategory,ProcessingCopy} from '../shared/types.js';
import type {EvidenceSearchLimitation,EvidenceSearchOptions,EvidenceSearchResult} from '../shared/evidence-search.js';
import {searchEvidenceFiles} from './evidence-search.js';
import {computerReference,computerScopeId} from './computer-file-scope.js';
const skipped=new Set(['node_modules','.git','.slash','dist']);
export const PDF_TEXT_LIMITS={maxBytes:10_000_000,maxPages:200,maxCharacters:1_000_000} as const;
export const hash=(s:string)=>createHash('sha256').update(s).digest('hex');

async function extractPdfText(file:string,size:number){
 if(size>PDF_TEXT_LIMITS.maxBytes)throw Error(`PDF_FILE_LIMIT: PDF 文件超过 ${PDF_TEXT_LIMITS.maxBytes} 字节`);const data=await fs.readFile(file);if(data.length<5||data.subarray(0,5).toString('ascii')!=='%PDF-')throw Error('PDF_PARSE_FAILED: 文件头不是有效 PDF');
 const parser=new PDFParse({data:Uint8Array.from(data),stopAtErrors:true,isEvalSupported:false,useWorkerFetch:false,useWasm:false,useSystemFonts:false,enableXfa:false,disableRange:true,disableStream:true,disableAutoFetch:true});
 try{const info=await parser.getInfo();if(!Number.isInteger(info.total)||info.total<1)throw Error('PDF_PARSE_FAILED: PDF 没有有效页面');if(info.total>PDF_TEXT_LIMITS.maxPages)throw Error(`PDF_PAGE_LIMIT: PDF 页数超过 ${PDF_TEXT_LIMITS.maxPages}`);const result=await parser.getText({first:info.total,lineEnforce:true,pageJoiner:'\n\n'});const text=result.text.replaceAll('\0','').trim();if(text.length>PDF_TEXT_LIMITS.maxCharacters)throw Error(`PDF_TEXT_LIMIT: 提取文本超过 ${PDF_TEXT_LIMITS.maxCharacters} 个字符`);if(!text)throw Error('PDF_TEXT_UNAVAILABLE: 未检测到可提取文字；扫描件暂不支持 OCR');return text;}catch(error){if(error instanceof Error&&error.message.startsWith('PDF_'))throw error;throw Error('PDF_PARSE_FAILED: PDF 文件无效、损坏或不受支持');}finally{await parser.destroy().catch(()=>{});}
}
/** Only raised by host exact mount lookup; document text never creates this error. */
export class UnknownMountIdError extends Error {
 constructor(){super('MOUNT_ID_UNKNOWN: mountId 未匹配当前可用目录；请逐字复用本次授权目录的 ID');this.name='UnknownMountIdError';}
}
export class Files {
 constructor(private mounts:()=>Mount[],private referenceRoots:()=>string[]=()=>[],private computerAccess?:(conversationId:string,write:boolean)=>void,private explicitlyReadonly:(mount:Mount)=>boolean=()=>true){}
 reference(id:string,filePath:string){const ref=computerReference(id,filePath);return ref?{mountId:ref.mountId,path:ref.path}:{mountId:id,path:filePath};}
 private protectedRoots(){return[...this.referenceRoots(),...this.mounts().filter(m=>/^(参考资料|项目资料)$/.test(m.name)).map(m=>m.path)];}
 private within(root:string,target:string){const relative=path.relative(root,target);return relative===''||relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);}
 private async canonicalTarget(target:string){let existing=target;const suffix:string[]=[];while(true){try{const real=await fs.realpath(existing);if(suffix.length&&!(await fs.stat(existing)).isDirectory())throw Object.assign(Error('ENOTDIR: 保护路径的父级不是目录'),{code:'ENOTDIR'});return path.join(real,...suffix);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;const parent=path.dirname(existing);if(parent===existing)throw error;suffix.unshift(path.basename(existing));existing=parent;}}}
 async isReferencePath(target:string){const canonical=await this.canonicalTarget(target);for(const reference of this.protectedRoots()){const root=await this.canonicalTarget(path.resolve(reference));if(this.within(root,canonical))return true;}return false;}
 /** Scope guard for host-managed root documents; grants no mount authority. */
 async assertNoReadOnlyDestination(target:string){const physical=await this.canonicalTarget(target);if(await this.isReferencePath(target))throw Error('REFERENCE_READ_ONLY: 目标属于参考资料，只能读取');for(const readonly of this.mounts().filter(m=>!m.write)){const root=await this.canonicalTarget(readonly.path);if(this.within(root,physical))throw Error('PERMISSION_DENIED: 目标所属目录只读');}}
 async protection(id:string,relative:string){const target=await this.resolve(id,relative),referenceProtected=await this.isReferencePath(target);let writable=true,reason:string|undefined;try{await this.resolve(id,relative,true);}catch(error){writable=false;reason=String((error as Error).message);}return{referenceProtected,writable,reason};}
 private async assertWriteTarget(mount:Mount,target:string,importing=false){
  // This is enforced on physical destinations, independently of which mount
  // the caller selected. Parent or duplicate mounts do not weaken it.
  if(!importing&&await this.isReferencePath(target))throw Error('REFERENCE_READ_ONLY: 参考资料原件只能读取；请先复制到成果或过程目录处理');
  if(!importing)for(const reference of this.protectedRoots()){const referenceRoot=await this.canonicalTarget(reference);if(this.within(target,referenceRoot))throw Error('REFERENCE_READ_ONLY: 此目录包含受保护参考资料，不能整体修改');}
  const physical=await this.canonicalTarget(target);for(const readonly of this.mounts().filter(m=>!m.write&&(!mount.id.startsWith('computer:')||this.explicitlyReadonly(m)))){const readonlyRoot=await this.canonicalTarget(readonly.path);if(this.within(readonlyRoot,physical)||!importing&&this.within(physical,readonlyRoot))throw Error('PERMISSION_DENIED: 路径所属目录只读');}
  const root=path.resolve(mount.path);let current=root;for(const segment of ['',...path.relative(root,target).split(path.sep).filter(Boolean)]){if(segment)current=path.join(current,segment);try{const stat=await fs.lstat(current);if(stat.isSymbolicLink())throw Error('SYMLINK_WRITE_DENIED: 写入路径不能包含符号链接或目录链接');if(stat.isFile()&&stat.nlink>1)throw Error('HARDLINK_WRITE_DENIED: 不能修改硬链接文件，请先创建独立副本');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}
 }
 async resolve(id:string,rel:string,write:boolean|'import'=false){
  const computer=computerReference(id,rel);
  if(computer){
   const guard=()=>{if(!this.computerAccess)throw Error('PERMISSION_DENIED: 当前操作没有电脑文件权限');this.computerAccess(computer.conversationId,Boolean(write));};
   guard();const target=await this.canonicalTarget(computer.absolute);guard();
   for(const mount of this.mounts().filter(m=>!m.enabled)){
    const blocked=await this.canonicalTarget(path.resolve(mount.path));guard();
    if(this.within(blocked,target)||this.within(path.resolve(mount.path),computer.absolute))throw Error('PERMISSION_DENIED: 文件位于已禁用目录');
   }
   if(write)await this.assertWriteTarget({id:computer.mountId,path:computer.root,name:'电脑文件',enabled:true,write:true},computer.absolute,write==='import');
   guard();return target;
  }
  const m=this.mounts().find(m=>m.id===id);if(!m)throw new UnknownMountIdError();if(!m.enabled||write&&!m.write)throw Error('PERMISSION_DENIED: 目录未授权');
  if(path.isAbsolute(rel)||rel.includes(':')||rel.includes('\0'))throw Error('INVALID_PATH');
  const root=await fs.realpath(m.path);
  if(m.readRootIdentity&&(process.platform==='win32'?root.toLowerCase()!==m.readRootIdentity.toLowerCase():root!==m.readRootIdentity))throw Error('PERMISSION_DENIED: 用户授权资料目录的真实位置已变化，请重新核对目录');
  const target=path.resolve(root,rel);const within=(p:string)=>{const r=path.relative(root,p);return r===''||!r.startsWith('..'+path.sep)&&r!=='..'&&!path.isAbsolute(r)};
  if(!within(target))throw Error('PERMISSION_DENIED: 路径越界');
  let existing=target;while(true){try{const real=await fs.realpath(existing);if(!within(real))throw Error('PERMISSION_DENIED: 链接指向授权目录外');break;}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;const parent=path.dirname(existing);if(parent===existing)throw e;existing=parent;}}
  if(write)await this.assertWriteTarget(m,target,write==='import');return target;
 }
 /** Locate a file or its nearest existing parent without creating draft directories. */
 async revealLocation(id:string,relative:string){
  const target=await this.resolve(id,relative),root=await this.resolve(id,'.');let candidate=target;
  while(true){
   // Recheck the active mount and physical links for every candidate, including
   // the fallback directory. Never walk above the authorized mount root.
   const checked=await this.resolve(id,path.relative(root,candidate)||'.');
   try{const stat=await fs.stat(checked);if(candidate!==target&&!stat.isDirectory())throw Error('REVEAL_PARENT_INVALID: 文件的父级不是目录');return{path:checked,kind:stat.isDirectory()?'directory' as const:'file' as const,fileExists:candidate===target&&stat.isFile()};}
   catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;if(candidate===root)throw Error('REVEAL_UNAVAILABLE: 授权目录当前不存在');candidate=path.dirname(candidate);if(!this.within(root,candidate))throw Error('PERMISSION_DENIED: 路径越界');}
  }
 }
 /** Import may add a new file to references, never edit an existing file. */
 async importDirectory(id:string,relative:string){const target=await this.resolve(id,relative,'import');if(!(await fs.stat(target)).isDirectory())throw Error('IMPORT_TARGET_UNAVAILABLE: 导入目标不是目录');return target;}
 private async listWithCoverage(query='',mountId?:string,directory?:string){
  const out:FileRef[]=[],limitations:EvidenceSearchLimitation[]=[];let truncated=false,limitationCount=0;
  const warn=(code:string,message:string)=>{limitationCount++;if(limitations.length<50)limitations.push({code,message});};
  const computer=mountId?.startsWith('computer:');
  if(computer&&!directory)throw Error('COMPUTER_DIRECTORY_REQUIRED: 电脑检索必须指定精确directory，不自动扫描全盘');
  if(mountId&&!computer&&!this.mounts().some(mount=>mount.id===mountId&&mount.enabled))throw Error('PERMISSION_DENIED: 检索目录未授权');
  const mounts:Mount[]=computer?[{id:computerScopeId(computerReference(mountId!,directory!)!.conversationId),path:await this.resolve(mountId!,directory!),name:'电脑指定目录',enabled:true,write:false}]:this.mounts().filter(mount=>mount.enabled&&(!mountId||mount.id===mountId)).slice().sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  const versions:Array<{mountId:string;path:string;size:number;mtimeMs:number;ctimeMs:number;ino:number;resolved:string}>=[];
  for(const m of mounts){
   const walk=async(dir:string,depth:number):Promise<void>=>{
    if(depth>12){truncated=true;warn('SEARCH_DEPTH_LIMIT','目录超过 12 层扫描上限，深层资料尚未检索');return;}
    let entries;try{await this.resolve(m.id,computer?dir:path.relative(m.path,dir)||'.');entries=await fs.readdir(dir,{withFileTypes:true});}catch{warn('SEARCH_DIRECTORY_UNAVAILABLE','有授权目录当前不可列出，相关资料尚未检索');return;}
    entries.sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
    for(const e of entries){
     if(out.length>=3000){truncated=true;return;}
     if(e.isSymbolicLink()||skipped.has(e.name))continue;
     const p=path.join(dir,e.name);
     if(e.isDirectory())await walk(p,depth+1);
     else{
      const rel=computer?p:path.relative(m.path,p);
      try{const resolved=await this.resolve(m.id,rel);const s=await fs.stat(p);if(!query||rel.toLowerCase().includes(query.toLowerCase())){const ref=this.reference(m.id,rel);out.push({...ref,size:s.size,referenceProtected:await this.isReferencePath(p)});versions.push({...ref,size:s.size,mtimeMs:s.mtimeMs,ctimeMs:s.ctimeMs,ino:s.ino,resolved});}}
      catch{warn('SEARCH_FILE_UNAVAILABLE','有文件已变化或当前不可授权读取，未纳入检索');}
     }
    }
   };
   if(out.length>=3000){truncated=true;break;}await walk(m.path,0);
  }
  if(truncated&&out.length>=3000)warn('SEARCH_LIST_LIMIT','目录扫描达到 3000 文件上限，其余资料尚未列出');
  const version=hash(JSON.stringify({mounts:mounts.map(({id,path,enabled,write})=>({id,path,enabled,write})),versions}));
  return{files:out,truncated,limitations,limitationCount,version};
 }
 async list(query='',scope?:{mountId:string;directory:string}){return(await this.listWithCoverage(query,scope?.mountId,scope?.directory)).files;}
 async readTextSnapshot(id:string,rel:string):Promise<{content:string;textExtraction?:DocxTextExtraction}>{
  const p=await this.resolve(id,rel),before=await fs.stat(p);if(/\.pdf$/i.test(p)){const content=await extractPdfText(p,before.size);await this.resolve(id,rel);return{content};}if(before.size>2_000_000)throw Error('文件超过文本读取限制 2 MB');
  if(/\.docx$/i.test(p)){
   const bytes=await fs.readFile(p);if(bytes.length>2_000_000)throw Error('文件超过文本读取限制 2 MB');
   const content=await extractOfficeText(bytes,path.basename(p)),current=await this.resolve(id,rel),after=await fs.stat(current);
   if(current!==p||before.dev!==after.dev||before.ino!==after.ino||before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ctimeMs!==after.ctimeMs)throw Error('READ_VERSION_CHANGED: Word 读取期间文件已变化，请重新读取');
   return{content,textExtraction:{parserVersion:OFFICE_TEXT_PARSER_VERSION,textHash:hash(content)}};
  }
  if(!/\.(md|txt|html?|css|js|jsx|tsx?|json|csv|xml|drawio|svg|yaml|yml)$/i.test(p))throw Error('暂不支持此文件的文本解析');const content=await fs.readFile(p,'utf8');await this.resolve(id,rel);return{content};
 }
 async read(id:string,rel:string){return(await this.readTextSnapshot(id,rel)).content;}
 /**
  * Copy one user-selected file into an authorized writable mount. The source
  * path comes from Electron's webUtils and is never treated as an authorized
  * workspace path. A source directory or symlink is rejected; the destination
  * is resolved again immediately before copying and is never overwritten.
  */
 async copyFrom(sourcePath:string,mountId:string,relativePath:string,category:ImportCategory):Promise<ImportedFile>{
  if(!path.isAbsolute(sourcePath)||sourcePath.includes('\0'))throw Error('INVALID_SOURCE_PATH');
  const source=path.resolve(sourcePath);let sourceStat;
  try{sourceStat=await fs.lstat(source);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')throw Error('SOURCE_NOT_FOUND');throw error;}
  if(sourceStat.isSymbolicLink())throw Error('SYMLINK_NOT_ALLOWED: 拖入文件不能是符号链接');
  if(!sourceStat.isFile())throw Error('IMPORT_FILE_ONLY: 只能拖入文件');
  const destination=await this.resolve(mountId,relativePath,'import');
  if(path.resolve(destination).toLowerCase()===source.toLowerCase())throw Error('SOURCE_EQUALS_DESTINATION');
  try{await fs.lstat(destination);throw Error('OUTPUT_EXISTS: 目标文件已存在');}
  catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  await fs.mkdir(path.dirname(destination),{recursive:true});
  // Re-check the mount and parent links after creating the directory. This
  // prevents a newly introduced junction from escaping the authorized root.
  await this.resolve(mountId,relativePath,'import');
  await fs.copyFile(source,destination,fsConstants.COPYFILE_EXCL);
  return{sourcePath,mountId,path:relativePath,category,size:sourceStat.size};
 }
 /** Independent, distinguishable, create-only bytes copy before processing. */
 async copyForProcessing(sourceMountId:string,sourcePath:string,targetMountId:string,directory:string,runId?:string):Promise<ProcessingCopy>{
  const source=await this.resolve(sourceMountId,sourcePath),before=await fs.lstat(source);if(!before.isFile()||before.isSymbolicLink())throw Error('PROCESSING_SOURCE_INVALID: 处理源必须是普通文件');if(before.size>100_000_000)throw Error('PROCESSING_FILE_LIMIT: 副本处理上限100 MB');
  const data=await fs.readFile(source),after=await fs.lstat(source);if(after.isSymbolicLink()||before.ino!==after.ino||before.size!==after.size||before.mtimeMs!==after.mtimeMs)throw Error('VERSION_CONFLICT: 复制期间源文件已变化');
  const extension=path.extname(sourcePath),stem=path.basename(sourcePath,extension),id=randomUUID(),relative=path.join(directory,`${stem}_处理副本_${id.slice(0,8)}${extension}`),destination=await this.resolve(targetMountId,relative,true);if(await this.isReferencePath(destination))throw Error('REFERENCE_READ_ONLY: 处理副本必须位于参考资料目录外');await fs.mkdir(path.dirname(destination),{recursive:true});await this.resolve(targetMountId,relative,true);
  await this.resolve(sourceMountId,sourcePath);await fs.writeFile(destination,data,{flag:'wx'});const latest=await fs.lstat(source);if(latest.isSymbolicLink()||latest.ino!==before.ino||latest.size!==before.size||latest.mtimeMs!==before.mtimeMs)throw Error('VERSION_CONFLICT: 源文件已变化，已创建的独立副本保留供核对');await this.resolve(sourceMountId,sourcePath);
  return{id,runId,source:{...this.reference(sourceMountId,sourcePath),contentHash:createHash('sha256').update(data).digest('hex')},copy:{mountId:targetMountId,path:relative},size:data.length,createdAt:new Date().toISOString()};
 }
 async searchEvidence(query:string,options?:EvidenceSearchOptions):Promise<EvidenceSearchResult>{
  const computer=options?.mountId?.startsWith('computer:');
  if(options?.mountId)await this.resolve(options.mountId,computer?options.directory??'':'.');
  const initialMounts=this.mounts().filter(mount=>mount.enabled&&(!options?.mountId||mount.id===options.mountId)).map(mount=>({...mount}));
  const listing=await this.listWithCoverage('',options?.mountId,options?.directory);
  const authorized=async(file:FileRef)=>{if(!computer){const before=initialMounts.find(mount=>mount.id===file.mountId),current=this.mounts().find(mount=>mount.id===file.mountId&&mount.enabled);if(!before||!current||before.path!==current.path||before.write!==current.write)throw Error('SEARCH_ACCESS_CHANGED: 检索目录授权已变化');}await this.resolve(file.mountId,file.path);};
  const searchOptions=computer?{...options,mountId:this.reference(options!.mountId!,options!.directory!).mountId}:options;
  return searchEvidenceFiles(listing.files,query,{read:file=>this.read(file.mountId,file.path),authorized},searchOptions,{truncated:listing.truncated,limitations:listing.limitations,limitationCount:listing.limitationCount,version:listing.version});
 }
 /** Compatibility callers still receive an array; Agent tools use the receipt. */
 async search(query:string):Promise<Array<FileRef&{snippet?:string}>>{return(await this.searchEvidence(query)).items;}
 async draft(id:string,rel:string,content:string,runId:string):Promise<Change>{if(isTestCasePath(rel))parseTestCaseSuite(content);const p=await this.resolve(id,rel,true);let before:string|null=null;try{before=hash(await fs.readFile(p,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}await this.resolve(id,rel,true);return{id:randomUUID(),runId,...this.reference(id,rel),before,content,status:'pending',createdAt:new Date().toISOString()};}
 async apply(c:Change,backupDir:string){if(isTestCasePath(c.path))parseTestCaseSuite(c.content);const p=await this.resolve(c.mountId,c.path,true);let current:string|null=null;try{current=await fs.readFile(p,'utf8')}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}if((current===null?null:hash(current))!==c.before){c.status='conflict';throw Error('VERSION_CONFLICT: 文件已修改，草稿已保留');}
  await fs.mkdir(backupDir,{recursive:true});await fs.writeFile(path.join(backupDir,c.id+'.json'),JSON.stringify({...c,previousContent:current}));await fs.mkdir(path.dirname(p),{recursive:true});await this.resolve(c.mountId,c.path,true);const temp=p+'.'+c.id+'.tmp';try{await fs.writeFile(temp,c.content,{flag:'wx'});const checked=await this.resolve(c.mountId,c.path,true);if(checked!==p)throw Error('VERSION_CONFLICT: 文件目标已变化');let latest:string|null=null;try{latest=await fs.readFile(p,'utf8');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}if((latest===null?null:hash(latest))!==c.before){c.status='conflict';throw Error('VERSION_CONFLICT: 文件提交前已修改');}if(c.before===null){try{await fs.link(temp,p);}catch(error){if((error as NodeJS.ErrnoException).code==='EEXIST'){c.status='conflict';throw Error('VERSION_CONFLICT: 新文件目标已存在，未覆盖');}if(['ENOTSUP','EOPNOTSUPP','EPERM','EXDEV'].includes((error as NodeJS.ErrnoException).code??'')){try{await fs.copyFile(temp,p,fsConstants.COPYFILE_EXCL);}catch(copyError){if((copyError as NodeJS.ErrnoException).code==='EEXIST'){c.status='conflict';throw Error('VERSION_CONFLICT: 新文件目标已存在，未覆盖');}throw copyError;}}else throw error;}}else await fs.rename(temp,p);c.status='applied';}finally{await fs.rm(temp,{force:true});}
 }
}
